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
async function sendMessageHistory(socket) {
  try {
    const result = await pool.query(
      "SELECT handle, color, text FROM messages WHERE created_at > NOW() - INTERVAL '24 hours' ORDER BY created_at ASC"
    );

    result.rows.forEach((msg) => {
      socket.emit("chatMessage", msg);
    });
  } catch (err) {
    console.error("Failed to load message history:", err);
  }
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

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

  console.log("Connected to Neon and tables are ready");
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
        // Handle is free — claim it for this device
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
          // Same device reclaiming their handle
          connectedUsers[socket.id] = { handle, color, status: "active" };
          socket.emit("joinSuccess", { handle, color, deviceToken });
          io.emit("userList", Object.values(connectedUsers));
          await sendMessageHistory(socket);
        } else {
          // Someone else already owns this handle
          socket.emit("joinError", "That handle is already taken. Please choose another.");
        }
      }
    } catch (err) {
      console.error("Join error:", err);
      socket.emit("joinError", "Something went wrong. Please try again.");
    }
  });

 socket.on("chatMessage", async ({ handle, color, text }) => {
    io.emit("chatMessage", { handle, color, text });

    try {
      await pool.query(
        "INSERT INTO messages (handle, color, text) VALUES ($1, $2, $3)",
        [handle, color, text]
      );
    } catch (err) {
      console.error("Failed to save message:", err);
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