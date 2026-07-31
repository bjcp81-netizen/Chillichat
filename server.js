require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const connectedUsers = {};

const REACTION_SCHO_VALUES = { chilli: 5, heart: 10, laugh: 8, down: -5 };

const SCOVILLE_TIERS = [
  { min: 2200000, name: "Pepper X", emoji: "👑" },
  { min: 1641000, name: "Carolina Reaper", emoji: "💀" },
  { min: 1000000, name: "Ghost Pepper", emoji: "☄️" },
  { min: 500000, name: "Habanero", emoji: "🔥" },
  { min: 350000, name: "Scotch Bonnet", emoji: "🌶️" },
  { min: 100000, name: "Bird's Eye", emoji: "🌶️" },
  { min: 50000, name: "Cayenne", emoji: "🌶️" },
  { min: 23000, name: "Serrano", emoji: "🌶️" },
  { min: 8000, name: "Jalapeño", emoji: "🌶️" },
  { min: 0, name: "Bell Pepper", emoji: "🫑" },
];

function computeScovilleRank(scho) {
  const tier = SCOVILLE_TIERS.find((t) => scho >= t.min);
  return tier || SCOVILLE_TIERS[SCOVILLE_TIERS.length - 1];
}

function generateToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function computeHeatRating(counts) {
  const positive = counts.chilli + counts.heart + counts.laugh;
  const negative = counts.down;
  if (positive + negative === 0) return null;
  let rating = 50 + positive * 8 - negative * 12;
  rating = Math.max(1, Math.min(100, rating));
  return rating;
}

function computeBanExpiry(duration) {
  const now = Date.now();
  if (duration === "1h") return new Date(now + 60 * 60 * 1000);
  if (duration === "1d") return new Date(now + 24 * 60 * 60 * 1000);
  if (duration === "1w") return new Date(now + 7 * 24 * 60 * 60 * 1000);
  return null; // permanent
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function getReactionCounts(messageId) {
  const result = await pool.query(
    `SELECT
      COUNT(*) FILTER (WHERE reaction = 'chilli') AS chilli,
      COUNT(*) FILTER (WHERE reaction = 'heart') AS heart,
      COUNT(*) FILTER (WHERE reaction = 'laugh') AS laugh,
      COUNT(*) FILTER (WHERE reaction = 'down') AS down
     FROM message_reactions WHERE message_id = $1`,
    [messageId]
  );
  const row = result.rows[0];
  return {
    chilli: parseInt(row.chilli),
    heart: parseInt(row.heart),
    laugh: parseInt(row.laugh),
    down: parseInt(row.down),
  };
}

async function setupDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      handle TEXT PRIMARY KEY,
      color TEXT NOT NULL,
      device_token TEXT NOT NULL,
      is_moderator BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS scho_total INTEGER DEFAULT 0`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      handle TEXT NOT NULL,
      color TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_reactions (
      id SERIAL PRIMARY KEY,
      message_id INTEGER NOT NULL,
      handle TEXT NOT NULL,
      reaction TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(message_id, handle, reaction)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bans (
      id SERIAL PRIMARY KEY,
      handle TEXT NOT NULL,
      device_token TEXT NOT NULL,
      reason TEXT,
      banned_by TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP,
      permanent BOOLEAN DEFAULT FALSE
    )
  `);

  console.log("Connected to Neon and tables are ready");
}

async function checkBanStatus(handle, deviceToken) {
  const result = await pool.query(
    `SELECT * FROM bans
     WHERE (device_token = $1 OR handle = $2)
     AND (permanent = TRUE OR expires_at > NOW())
     ORDER BY created_at DESC LIMIT 1`,
    [deviceToken || "", handle]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

async function buildEnrichedUserList() {
  const users = Object.values(connectedUsers);
  if (users.length === 0) return [];

  const handles = users.map((u) => u.handle);
  const result = await pool.query(
    "SELECT handle, scho_total FROM users WHERE handle = ANY($1)",
    [handles]
  );

  const schoByHandle = {};
  result.rows.forEach((row) => {
    schoByHandle[row.handle] = row.scho_total;
  });

  return users.map((u) => {
    const scho = schoByHandle[u.handle] || 0;
    const rank = computeScovilleRank(scho);
    return { ...u, scho, rankName: rank.name, rankEmoji: rank.emoji };
  });
}

async function broadcastUserList() {
  const enriched = await buildEnrichedUserList();
  io.emit("userList", enriched);
}

async function sendMessageHistory(socket) {
  try {
    const result = await pool.query(`
      SELECT m.id, m.handle, m.color, m.text, m.created_at,
        COUNT(*) FILTER (WHERE r.reaction = 'chilli') AS chilli,
        COUNT(*) FILTER (WHERE r.reaction = 'heart') AS heart,
        COUNT(*) FILTER (WHERE r.reaction = 'laugh') AS laugh,
        COUNT(*) FILTER (WHERE r.reaction = 'down') AS down
      FROM messages m
      LEFT JOIN message_reactions r ON r.message_id = m.id
      WHERE m.created_at > NOW() - INTERVAL '24 hours'
      GROUP BY m.id
      ORDER BY m.created_at ASC
    `);

    result.rows.forEach((msg) => {
      const counts = {
        chilli: parseInt(msg.chilli),
        heart: parseInt(msg.heart),
        laugh: parseInt(msg.laugh),
        down: parseInt(msg.down),
      };
      socket.emit("chatMessage", {
        id: msg.id,
        handle: msg.handle,
        color: msg.color,
        text: msg.text,
        counts,
        heatRating: computeHeatRating(counts),
      });
    });
  } catch (err) {
    console.error("Failed to load message history:", err);
  }
}

function findSocketIdByHandle(handle) {
  return Object.keys(connectedUsers).find(
    (id) => connectedUsers[id].handle === handle
  );
}

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join", async ({ handle, color, deviceToken }) => {
    try {
      const ban = await checkBanStatus(handle, deviceToken);
      if (ban) {
        if (ban.permanent) {
          socket.emit("joinError", "You are permanently banned from ChilliChat.");
        } else {
          const until = new Date(ban.expires_at).toLocaleString();
          socket.emit("joinError", "You are banned until " + until + ".");
        }
        return;
      }

      const existing = await pool.query(
        "SELECT * FROM users WHERE handle = $1",
        [handle]
      );

      if (existing.rows.length === 0) {
        const newToken = deviceToken || generateToken();
        const isModerator = handle === "Mdnight";

        await pool.query(
          "INSERT INTO users (handle, color, device_token, is_moderator) VALUES ($1, $2, $3, $4)",
          [handle, color, newToken, isModerator]
        );

        connectedUsers[socket.id] = { handle, color, status: "active", isModerator };
        socket.emit("joinSuccess", { handle, color, deviceToken: newToken, isModerator });
        await broadcastUserList();
        await sendMessageHistory(socket);
      } else {
        const owner = existing.rows[0];

        if (owner.device_token === deviceToken) {
          let isModerator = owner.is_moderator;

          if (handle === "Mdnight" && !isModerator) {
            await pool.query(
              "UPDATE users SET is_moderator = TRUE WHERE handle = $1",
              [handle]
            );
            isModerator = true;
          }

          connectedUsers[socket.id] = {
            handle,
            color,
            status: "active",
            isModerator,
          };
          socket.emit("joinSuccess", {
            handle,
            color,
            deviceToken,
            isModerator,
          });
          await broadcastUserList();
          await sendMessageHistory(socket);
        } else {
          socket.emit("joinError", "That handle is already taken. Please choose another.");
        }
      }
    } catch (err) {
      console.error("Join error:", err);
      socket.emit("joinError", "Something went wrong. Please try again.");
    }
  });

  socket.on("chatMessage", async ({ handle, color, text }) => {
    try {
      const result = await pool.query(
        "INSERT INTO messages (handle, color, text) VALUES ($1, $2, $3) RETURNING id",
        [handle, color, text]
      );
      const messageId = result.rows[0].id;
      io.emit("chatMessage", { id: messageId, handle, color, text });
    } catch (err) {
      console.error("Failed to save message:", err);
    }
  });

  socket.on("reaction", async ({ messageId, handle, reactionType }) => {
    const allowed = ["chilli", "heart", "laugh", "down"];
    if (!allowed.includes(reactionType)) return;

    try {
      const messageResult = await pool.query(
        "SELECT handle FROM messages WHERE id = $1",
        [messageId]
      );
      if (messageResult.rows.length === 0) return;

      const authorHandle = messageResult.rows[0].handle;

      if (authorHandle === handle) {
        socket.emit("reactionError", "You can't react to your own message.");
        return;
      }

      const existing = await pool.query(
        "SELECT id FROM message_reactions WHERE message_id = $1 AND handle = $2 AND reaction = $3",
        [messageId, handle, reactionType]
      );

      const schoValue = REACTION_SCHO_VALUES[reactionType] || 0;

      if (existing.rows.length > 0) {
        await pool.query("DELETE FROM message_reactions WHERE id = $1", [existing.rows[0].id]);
        await pool.query(
          "UPDATE users SET scho_total = scho_total - $1 WHERE handle = $2",
          [schoValue, authorHandle]
        );
      } else {
        await pool.query(
          "INSERT INTO message_reactions (message_id, handle, reaction) VALUES ($1, $2, $3)",
          [messageId, handle, reactionType]
        );
        await pool.query(
          "UPDATE users SET scho_total = scho_total + $1 WHERE handle = $2",
          [schoValue, authorHandle]
        );
      }

      const counts = await getReactionCounts(messageId);
      const heatRating = computeHeatRating(counts);
      io.emit("reactionUpdate", { messageId, counts, heatRating });
      await broadcastUserList();
    } catch (err) {
      console.error("Reaction error:", err);
    }
  });

  socket.on("getHighrollers", async ({ period }) => {
    const interval = period === "week" ? "7 days" : "24 hours";

    try {
      const result = await pool.query(`
        SELECT m.id, m.handle, m.color, m.text, m.created_at,
          COUNT(*) FILTER (WHERE r.reaction = 'chilli') AS chilli,
          COUNT(*) FILTER (WHERE r.reaction = 'heart') AS heart,
          COUNT(*) FILTER (WHERE r.reaction = 'laugh') AS laugh,
          COUNT(*) FILTER (WHERE r.reaction = 'down') AS down
        FROM messages m
        JOIN message_reactions r ON r.message_id = m.id
        WHERE m.created_at > NOW() - INTERVAL '${interval}'
        GROUP BY m.id
      `);

      const rated = result.rows.map((msg) => {
        const counts = {
          chilli: parseInt(msg.chilli),
          heart: parseInt(msg.heart),
          laugh: parseInt(msg.laugh),
          down: parseInt(msg.down),
        };
        return {
          id: msg.id,
          handle: msg.handle,
          color: msg.color,
          text: msg.text,
          heatRating: computeHeatRating(counts),
        };
      });

      rated.sort((a, b) => b.heatRating - a.heatRating);
      const top5 = rated.slice(0, 5);

      socket.emit("highrollersResult", { period, entries: top5 });
    } catch (err) {
      console.error("Highrollers error:", err);
    }
  });

  // ---- Moderator actions ----
  socket.on("moderatorKick", ({ targetHandle }) => {
    const me = connectedUsers[socket.id];
    if (!me || !me.isModerator) return;
    if (targetHandle === me.handle) return;

    const targetSocketId = findSocketIdByHandle(targetHandle);
    if (!targetSocketId) return;

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      targetSocket.emit("youWereKicked");
      targetSocket.disconnect(true);
    }
  });

  socket.on("moderatorBan", async ({ targetHandle, duration, reason }) => {
    const me = connectedUsers[socket.id];
    if (!me || !me.isModerator) return;
    if (targetHandle === me.handle) return;

    try {
      const targetUser = await pool.query(
        "SELECT device_token FROM users WHERE handle = $1",
        [targetHandle]
      );
      if (targetUser.rows.length === 0) return;

      const deviceToken = targetUser.rows[0].device_token;
      const expiresAt = computeBanExpiry(duration);
      const permanent = expiresAt === null;

      await pool.query(
        "INSERT INTO bans (handle, device_token, reason, banned_by, expires_at, permanent) VALUES ($1, $2, $3, $4, $5, $6)",
        [targetHandle, deviceToken, reason || "No reason given", me.handle, expiresAt, permanent]
      );

      const targetSocketId = findSocketIdByHandle(targetHandle);
      if (targetSocketId) {
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
          targetSocket.emit("youWereBanned", {
            permanent,
            until: expiresAt ? expiresAt.toLocaleString() : null,
          });
          targetSocket.disconnect(true);
        }
      }
    } catch (err) {
      console.error("Ban error:", err);
    }
  });

  socket.on("typing", ({ handle }) => {
    socket.broadcast.emit("typing", { handle });
  });

  socket.on("stopTyping", ({ handle }) => {
    socket.broadcast.emit("stopTyping", { handle });
  });

  socket.on("statusChange", async (status) => {
    if (connectedUsers[socket.id]) {
      connectedUsers[socket.id].status = status;
      await broadcastUserList();
    }
  });

  socket.on("disconnect", async () => {
    console.log("A user disconnected:", socket.id);
    delete connectedUsers[socket.id];
    await broadcastUserList();
  });
});

const PORT = process.env.PORT || 3000;

setupDatabase()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`ChilliChat server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to database:", err);
  });