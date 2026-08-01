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

const BADGE_DEFS = {
  fresh_face: { emoji: "🌱", name: "Fresh Face" },
  ice_breaker: { emoji: "💬", name: "Ice Breaker" },
  first_burn: { emoji: "🌶️", name: "First Burn" },
  well_liked: { emoji: "❤️", name: "Well Liked" },
  crowd_pleaser: { emoji: "😂", name: "Crowd Pleaser" },
  spice_merchant: { emoji: "🌶️", name: "Spice Merchant" },
};

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
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS messages_sent INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS hearts_received INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS laughs_received INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS chilli_received INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS down_received INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_rank_min INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_leaderboard_rank INTEGER`);

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS badges (
      id SERIAL PRIMARY KEY,
      handle TEXT NOT NULL,
      badge_key TEXT NOT NULL,
      earned_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(handle, badge_key)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS voice_clips (
      id SERIAL PRIMARY KEY,
      handle TEXT NOT NULL,
      color TEXT NOT NULL,
      audio_data TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
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

async function awardBadge(handle, badgeKey) {
  const result = await pool.query(
    "INSERT INTO badges (handle, badge_key) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id",
    [handle, badgeKey]
  );

  if (result.rows.length > 0) {
    const def = BADGE_DEFS[badgeKey];
    const targetSocketId = findSocketIdByHandle(handle);
    if (targetSocketId) {
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.emit("badgeUnlocked", { emoji: def.emoji, name: def.name });
      }
    }
    return true;
  }
  return false;
}

async function checkThresholdBadges(handle) {
  const result = await pool.query(
    "SELECT messages_sent, hearts_received, laughs_received, chilli_received, down_received FROM users WHERE handle = $1",
    [handle]
  );
  if (result.rows.length === 0) return;

  const u = result.rows[0];
  const totalReceived = u.hearts_received + u.laughs_received + u.chilli_received + u.down_received;

  if (u.messages_sent >= 1) await awardBadge(handle, "ice_breaker");
  if (totalReceived >= 1) await awardBadge(handle, "first_burn");
  if (u.hearts_received >= 25) await awardBadge(handle, "well_liked");
  if (u.laughs_received >= 50) await awardBadge(handle, "crowd_pleaser");
  if (u.chilli_received >= 100) await awardBadge(handle, "spice_merchant");
}

async function checkHeatNotifications(handle) {
  try {
    const userResult = await pool.query(
      "SELECT scho_total, last_rank_min, last_leaderboard_rank FROM users WHERE handle = $1",
      [handle]
    );
    if (userResult.rows.length === 0) return;

    const u = userResult.rows[0];
    const newRank = computeScovilleRank(u.scho_total);

    if (newRank.min > u.last_rank_min) {
      io.emit("heatNotification", "🔥 " + handle + " reached " + newRank.emoji + " " + newRank.name + "!");
      await pool.query("UPDATE users SET last_rank_min = $1 WHERE handle = $2", [newRank.min, handle]);
    }

    const leaderboardResult = await pool.query(
      "SELECT handle FROM users ORDER BY scho_total DESC, created_at ASC LIMIT 20"
    );
    const position = leaderboardResult.rows.findIndex((row) => row.handle === handle);
    const newPosition = position === -1 ? null : position + 1;
    const previousPosition = u.last_leaderboard_rank;

    if (newPosition === 1 && previousPosition !== 1) {
      io.emit("heatNotification", "👑 " + handle + " is now #1 on the Scoville Scale!");
    } else if (newPosition !== null && newPosition <= 20 && (previousPosition === null || previousPosition > 20)) {
      io.emit("heatNotification", "🚀 " + handle + " entered the High Rollers!");
    }

    await pool.query("UPDATE users SET last_leaderboard_rank = $1 WHERE handle = $2", [newPosition, handle]);
  } catch (err) {
    console.error("Heat notification error:", err);
  }
}

async function getBadgesForHandles(handles) {
  if (handles.length === 0) return {};
  const result = await pool.query(
    "SELECT handle, badge_key FROM badges WHERE handle = ANY($1)",
    [handles]
  );
  const map = {};
  result.rows.forEach((row) => {
    if (!map[row.handle]) map[row.handle] = [];
    const def = BADGE_DEFS[row.badge_key];
    if (def) map[row.handle].push(def.emoji);
  });
  return map;
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

  const badgesByHandle = await getBadgesForHandles(handles);

  return users.map((u) => {
    const scho = schoByHandle[u.handle] || 0;
    const rank = computeScovilleRank(scho);
    return {
      ...u,
      scho,
      rankName: rank.name,
      rankEmoji: rank.emoji,
      badges: badgesByHandle[u.handle] || [],
    };
  });
}

async function broadcastUserList() {
  const enriched = await buildEnrichedUserList();
  io.emit("userList", enriched);
}

async function sendMessageHistory(socket) {
  try {
    const msgResult = await pool.query(`
      SELECT m.id, m.handle, m.color, m.text, m.created_at,
        COUNT(*) FILTER (WHERE r.reaction = 'chilli') AS chilli,
        COUNT(*) FILTER (WHERE r.reaction = 'heart') AS heart,
        COUNT(*) FILTER (WHERE r.reaction = 'laugh') AS laugh,
        COUNT(*) FILTER (WHERE r.reaction = 'down') AS down
      FROM messages m
      LEFT JOIN message_reactions r ON r.message_id = m.id
      WHERE m.created_at > NOW() - INTERVAL '24 hours'
      GROUP BY m.id
    `);

    const voiceResult = await pool.query(`
      SELECT id, handle, color, audio_data, duration_ms, created_at
      FROM voice_clips
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);

    const textItems = msgResult.rows.map((msg) => {
      const counts = {
        chilli: parseInt(msg.chilli),
        heart: parseInt(msg.heart),
        laugh: parseInt(msg.laugh),
        down: parseInt(msg.down),
      };
      return {
        type: "text",
        created_at: msg.created_at,
        payload: {
          id: msg.id,
          handle: msg.handle,
          color: msg.color,
          text: msg.text,
          counts,
          heatRating: computeHeatRating(counts),
        },
      };
    });

    const voiceItems = voiceResult.rows.map((clip) => ({
      type: "voice",
      created_at: clip.created_at,
      payload: {
        id: clip.id,
        handle: clip.handle,
        color: clip.color,
        audioData: clip.audio_data,
        durationMs: clip.duration_ms,
      },
    }));

    const merged = [...textItems, ...voiceItems].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );

    merged.forEach((item) => {
      if (item.type === "text") {
        socket.emit("chatMessage", item.payload);
      } else {
        socket.emit("voiceClip", item.payload);
      }
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
        await awardBadge(handle, "fresh_face");
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

      await pool.query(
        "UPDATE users SET messages_sent = messages_sent + 1 WHERE handle = $1",
        [handle]
      );
      await checkThresholdBadges(handle);
    } catch (err) {
      console.error("Failed to save message:", err);
    }
  });

  socket.on("voiceClip", async ({ handle, color, audioData, durationMs }) => {
    const MAX_DURATION_MS = 10000;
    const MAX_SIZE_BYTES = 1024 * 1024; // 1MB safety cap

    if (!audioData ||