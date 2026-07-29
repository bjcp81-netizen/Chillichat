require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { MongoClient } = require("mongodb");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const connectedUsers = {};

let db;
let usersCollection;
let messagesCollection;

async function connectToDatabase() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db("chillichat");
  usersCollection = db.collection("users");
  messagesCollection = db.collection("messages");
  console.log("Connected to MongoDB Atlas");
}
async function getRecentMessages() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  return await messagesCollection
    .find({ timestamp: { $gte: yesterday } })
    .sort({ timestamp: 1 })
    .toArray();
}
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join", async ({ handle, color }) => {
  connectedUsers[socket.id] = {
    handle,
    color,
    status: "active"
  };

  io.emit("userList", Object.values(connectedUsers));

  try {
    const history = await getRecentMessages();
    socket.emit("chatHistory", history);
  } catch (err) {
    console.error("Couldn't load chat history:", err);
  }
});

  socket.on("chatMessage", async ({ handle, color, text }) => {
  const message = {
    handle,
    color,
    text,
    timestamp: new Date()
  };

  try {
    await messagesCollection.insertOne(message);
    console.log("Message saved to MongoDB");
  } catch (err) {
    console.error("Failed to save message:", err);
  }

  io.emit("chatMessage", message);
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

connectToDatabase()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`ChilliChat server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
  });