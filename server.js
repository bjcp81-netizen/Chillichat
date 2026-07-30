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
      banned_until TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

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

  console.log("Connected to Neon and tables are ready");
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

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join", async ({ handle, color, deviceToken }) => {
    try {
      const existing = await pool.query(
        "SELECT * FROM users WHERE handle = $1",
        [handle]
      );

      if (existing.rows.length === 0) {
        const newToken = deviceToken || generateToken();
        await pool.query(
          "INSERT INTO users (handle, color, device_token) VALUES ($1, $2, $3)",
          [handle, color, newToken]
        );

        connectedUsers[socket.id] = { handle, color, status: "active" };
        socket.emit("joinSuccess", { handle, color, deviceToken: newToken });
        io.emit("userList", Object.values(connectedUsers));
        await sendMessageHistory(socket);
      } else {
        const owner = existing.rows[0];

        if (owner.device_token === deviceToken) {
          connectedUsers[socket.id] = { handle, color, status: "active" };
          socket.emit("joinSuccess", { handle, color, deviceToken });
          io.emit("userList", Object.values(connectedUsers));
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
      const existing = await pool.query(
        "SELECT id FROM message_reactions WHERE message_id = $1 AND handle = $2 AND reaction = $3",
        [messageId, handle, reactionType]
      );

      if (existing.rows.length > 0) {
        await pool.query("DELETE FROM message_reactions WHERE id = $1", [existing.rows[0].id]);
      } else {
        await pool.query(
          "INSERT INTO message_reactions (message_id, handle, reaction) VALUES ($1, $2, $3)",
          [messageId, handle, reactionType]
        );
      }

      const counts = await getReactionCounts(messageId);
      const heatRating = computeHeatRating(counts);
      io.emit("reactionUpdate", { messageId, counts, heatRating });
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
  socket.on("typing", ({ handle }) => {
    socket.broadcast.emit("typing", { handle });
  });

  socket.on("stopTyping", ({ handle }) => {
    socket.broadcast.emit("stopTyping", { handle });
  });

  socket.on("statusChange", (status) => {
    if (connectedUsers[socket.id]) {
      connectedUsers[socket.id].status = status;
      io.emit("userList", Object.values(connectedUsers));
    }
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);
    delete connectedUsers[socket.id];
    io.emit("userList", Object.values(connectedUsers));
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