document.addEventListener("DOMContentLoaded", function () {
  console.log("ChilliChat app.js loaded");

  const IDLE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes
  const STORAGE_HANDLE_KEY = "chillichat_handle";
  const STORAGE_COLOR_KEY = "chillichat_color";

  const socket = io();

  let myHandle = "";
  let myColor = "";
  let lastActivityTime = Date.now();
  let isIdle = false;

  const handleInput = document.getElementById("handle-input");
  const colorSwatches = document.querySelectorAll(".color-swatch");
  const joinBtn = document.getElementById("join-btn");
  const joinScreen = document.getElementById("join-screen");
  const chatScreen = document.getElementById("chat-screen");
  const usersList = document.getElementById("users-list");
  const messagesBox = document.getElementById("messages-box");
  const messageInput = document.getElementById("message-input");
  const sendBtn = document.getElementById("send-btn");
  
  colorSwatches.forEach(swatch => {
    swatch.addEventListener("click", () => {
      colorSwatches.forEach(s => s.classList.remove("selected"));
      swatch.classList.add("selected");
      myColor = swatch.dataset.color;
    });
  });

  joinBtn.addEventListener("click", () => enterLobby(false));

  handleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      enterLobby(false);
    }
  });

  

  function enterLobby(isReturningUser) {
    const handle = isReturningUser ? myHandle : handleInput.value.trim();

    if (!isReturningUser) {
      if (handle === "") {
        alert("Please enter a handle.");
        return;
      }
      if (myColor === "") {
        alert("Please pick a colour.");
        return;
      }
      myHandle = handle;

      localStorage.setItem(STORAGE_HANDLE_KEY, myHandle);
      localStorage.setItem(STORAGE_COLOR_KEY, myColor);
    }

    socket.emit("join", { handle: myHandle, color: myColor });

    joinScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");

    if (isReturningUser) {
      showSystemMessage("Welcome back, " + myHandle + "!");
    }

    startIdleWatcher();
  }

  // Check for a returning user as soon as the page loads
  function checkReturningUser() {
    const savedHandle = localStorage.getItem(STORAGE_HANDLE_KEY);
    const savedColor = localStorage.getItem(STORAGE_COLOR_KEY);

    if (savedHandle && savedColor) {
      myHandle = savedHandle;
      myColor = savedColor;
      enterLobby(true);
    }
  }

  function showSystemMessage(text) {
    const msgEl = document.createElement("p");
    msgEl.className = "system-msg";
    msgEl.textContent = text;
    messagesBox.appendChild(msgEl);
    messagesBox.scrollTop = messagesBox.scrollHeight;
  }

  socket.on("userList", (users) => {
    usersList.innerHTML = "";
    users.forEach(user => {
      const li = document.createElement("li");
      li.className = "user-item";

      const dot = document.createElement("span");
      dot.className = "status-dot " + user.status;

      const name = document.createElement("span");
      name.textContent = user.handle;
      name.style.color = user.color;

      li.appendChild(dot);
      li.appendChild(name);
      usersList.appendChild(li);
    });
  });

  sendBtn.addEventListener("click", sendMessage);

  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  });

  function sendMessage() {
    const text = messageInput.value.trim();
    if (text === "") return;

    socket.emit("chatMessage", { handle: myHandle, color: myColor, text: text });

    messageInput.value = "";
  }

  socket.on("chatMessage", (data) => {
    const msgEl = document.createElement("p");
    msgEl.className = "chat-message";

    const handleSpan = document.createElement("span");
    handleSpan.className = "msg-handle";
    handleSpan.textContent = data.handle + ":";
    handleSpan.style.color = data.color;

    const textSpan = document.createElement("span");
    textSpan.textContent = " " + data.text;

    msgEl.appendChild(handleSpan);
    msgEl.appendChild(textSpan);
    messagesBox.appendChild(msgEl);

    messagesBox.scrollTop = messagesBox.scrollHeight;
  });

  function startIdleWatcher() {
    ["mousemove", "keydown", "click", "touchstart", "scroll"].forEach(evt => {
      document.addEventListener(evt, registerActivity);
    });

    setInterval(checkIdleStatus, 10000);
  }

  function registerActivity() {
    lastActivityTime = Date.now();

    if (isIdle) {
      isIdle = false;
      socket.emit("statusChange", "active");
    }
  }

  function checkIdleStatus() {
    const elapsed = Date.now() - lastActivityTime;

    if (elapsed >= IDLE_LIMIT_MS && !isIdle) {
      isIdle = true;
      socket.emit("statusChange", "idle");
    }
  }

  checkReturningUser();
});