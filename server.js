const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const connectedUsers = {};

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join", ({ handle, color }) => {
    connectedUsers[socket.id] = { handle, color, status: "active" };
    io.emit("userList", Object.values(connectedUsers));
  });

  socket.on("chatMessage", ({ handle, color, text }) => {
    io.emit("chatMessage", { handle, color, text });
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
server.listen(PORT, () => {
  console.log(`ChilliChat server running at http://localhost:${PORT}`);
});