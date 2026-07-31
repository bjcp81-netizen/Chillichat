document.addEventListener("DOMContentLoaded", function () {
  console.log("ChilliChat app.js loaded");

  const IDLE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes
  const STORAGE_HANDLE_KEY = "chillichat_handle";
  const STORAGE_COLOR_KEY = "chillichat_color";
  const STORAGE_TOKEN_KEY = "chillichat_device_token";

  const REACTIONS = [
    { key: "chilli", emoji: "🌶️" },
    { key: "heart", emoji: "❤️" },
    { key: "laugh", emoji: "😂" },
    { key: "down", emoji: "👎" },
  ];

  const socket = io();

  let myHandle = "";
  let myColor = "";
  let myIsModerator = false;
  let lastActivityTime = Date.now();
  let isIdle = false;
  let hasJoinedOnce = false;

  const handleInput = document.getElementById("handle-input");
  const colorSwatches = document.querySelectorAll(".color-swatch");
  const termsCheckbox = document.getElementById("terms-checkbox");
  const joinBtn = document.getElementById("join-btn");
  const joinScreen = document.getElementById("join-screen");
  const chatScreen = document.getElementById("chat-screen");
  const usersList = document.getElementById("users-list");
  const usersToggleBtn = document.getElementById("users-toggle-btn");
  const usersDropdown = document.getElementById("users-dropdown");
  const highrollersToggleBtn = document.getElementById("highrollers-toggle-btn");
  const highrollersDropdown = document.getElementById("highrollers-dropdown");
  const highrollersTodayBtn = document.getElementById("highrollers-today-btn");
  const highrollersWeekBtn = document.getElementById("highrollers-week-btn");
  const highrollersList = document.getElementById("highrollers-list");
  const messagesBox = document.getElementById("messages-box");
  const messageInput = document.getElementById("message-input");
  const sendBtn = document.getElementById("send-btn");
  const typingIndicator = document.getElementById("typing-indicator");
  const sendSound = document.getElementById("send-sound");
  const notifySound = document.getElementById("notify-sound");
  const connectionBanner = document.getElementById("connection-banner");

  colorSwatches.forEach(swatch => {
    swatch.addEventListener("click", () => {
      colorSwatches.forEach(s => s.classList.remove("selected"));
      swatch.classList.add("selected");
      myColor = swatch.dataset.color;
    });
  });

  termsCheckbox.addEventListener("change", () => {
    joinBtn.disabled = !termsCheckbox.checked;
  });

  usersToggleBtn.addEventListener("click", () => {
    usersDropdown.classList.toggle("open");
  });

  highrollersToggleBtn.addEventListener("click", () => {
    highrollersDropdown.classList.toggle("open");
    if (highrollersDropdown.classList.contains("open")) {
      requestHighrollers("day");
    }
  });

  highrollersTodayBtn.addEventListener("click", () => {
    setHighrollersTab("day");
    requestHighrollers("day");
  });

  highrollersWeekBtn.addEventListener("click", () => {
    setHighrollersTab("week");
    requestHighrollers("week");
  });

  function setHighrollersTab(period) {
    highrollersTodayBtn.classList.toggle("active", period === "day");
    highrollersWeekBtn.classList.toggle("active", period === "week");
  }

  function requestHighrollers(period) {
    socket.emit("getHighrollers", { period });
  }

  socket.on("highrollersResult", ({ entries }) => {
    highrollersList.innerHTML = "";

    if (entries.length === 0) {
      const li = document.createElement("li");
      li.className = "highrollers-empty";
      li.textContent = "No hot takes yet — react to some messages!";
      highrollersList.appendChild(li);
      return;
    }

    entries.forEach((entry) => {
      const li = document.createElement("li");
      li.className = "highrollers-item";

      const heat = document.createElement("span");
      heat.className = "highrollers-heat";
      heat.textContent = "🔥 " + entry.heatRating;

      const handle = document.createElement("span");
      handle.className = "highrollers-handle";
      handle.textContent = entry.handle;
      handle.style.color = entry.color;

      const text = document.createElement("span");
      text.className = "highrollers-text";
      text.textContent = entry.text;

      li.appendChild(heat);
      li.appendChild(handle);
      li.appendChild(text);
      highrollersList.appendChild(li);
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
      if (!termsCheckbox.checked) {
        alert("Please confirm you are 21+ and agree to the terms.");
        return;
      }
      myHandle = handle;

      localStorage.setItem(STORAGE_HANDLE_KEY, myHandle);
      localStorage.setItem(STORAGE_COLOR_KEY, myColor);
    }

    const myDeviceToken = localStorage.getItem(STORAGE_TOKEN_KEY);

    socket.emit("join", { handle: myHandle, color: myColor, deviceToken: myDeviceToken });
  }

  socket.on("joinSuccess", ({ handle, color, deviceToken, isModerator }) => {
    myHandle = handle;
    myColor = color;
    myIsModerator = !!isModerator;
    hasJoinedOnce = true;

    localStorage.setItem(STORAGE_HANDLE_KEY, myHandle);
    localStorage.setItem(STORAGE_COLOR_KEY, myColor);
    localStorage.setItem(STORAGE_TOKEN_KEY, deviceToken);

    const wasHidden = !joinScreen.classList.contains("hidden");
    joinScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");

    if (wasHidden === false) {
      showSystemMessage("Welcome back, " + myHandle + "!");
    }

    if (myIsModerator) {
      showSystemMessage("🛡️ Moderator mode active.");
    }

    startIdleWatcher();
  });

  socket.on("joinError", (message) => {
    alert(message);
    localStorage.removeItem(STORAGE_HANDLE_KEY);
    localStorage.removeItem(STORAGE_COLOR_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    joinScreen.classList.remove("hidden");
    chatScreen.classList.add("hidden");
  });

  socket.on("youWereKicked", () => {
    alert("You have been removed from ChilliChat by a moderator. You may rejoin.");
    location.reload();
  });

  socket.on("youWereBanned", ({ permanent, until }) => {
    if (permanent) {
      alert("You have been permanently banned from ChilliChat.");
    } else {
      alert("You have been banned from ChilliChat until " + until + ".");
    }
    localStorage.removeItem(STORAGE_HANDLE_KEY);
    localStorage.removeItem(STORAGE_COLOR_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    location.reload();
  });

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
    usersToggleBtn.textContent = "Users (" + users.length + ") ▾";
    usersList.innerHTML = "";
    users.forEach(user => {
      const li = document.createElement("li");
      li.className = "user-item";

      const row = document.createElement("div");
      row.className = "user-row";

      const dot = document.createElement("span");
      dot.className = "status-dot " + user.status;

      const name = document.createElement("span");
      name.textContent = (user.isModerator ? "🛡️ " : "") + user.handle;
      name.style.color = user.color;

      row.appendChild(dot);
      row.appendChild(name);
      li.appendChild(row);

      const canModerate = myIsModerator && user.handle !== myHandle;

      if (canModerate) {
        name.classList.add("clickable-handle");

        const panel = buildModPanel(user.handle);
        panel.classList.add("hidden");
        li.appendChild(panel);

        name.addEventListener("click", () => {
          panel.classList.toggle("hidden");
        });
      }

      usersList.appendChild(li);
    });
  });

  function buildModPanel(targetHandle) {
    const panel = document.createElement("div");
    panel.className = "mod-panel";

    const title = document.createElement("p");
    title.className = "mod-panel-title";
    title.textContent = "Moderate " + targetHandle;
    panel.appendChild(title);

    const kickBtn = document.createElement("button");
    kickBtn.className = "mod-btn mod-kick-btn";
    kickBtn.textContent = "🚪 Kick";
    kickBtn.addEventListener("click", () => {
      if (confirm("Kick " + targetHandle + "?")) {
        socket.emit("moderatorKick", { targetHandle });
      }
    });
    panel.appendChild(kickBtn);

    const durations = [
      { label: "Ban 1 Hour", value: "1h" },
      { label: "Ban 1 Day", value: "1d" },
      { label: "Ban 1 Week", value: "1w" },
      { label: "Ban Permanently", value: "perm" },
    ];

    durations.forEach(d => {
      const banBtn = document.createElement("button");
      banBtn.className = "mod-btn mod-ban-btn";
      banBtn.textContent = "⛔ " + d.label;
      banBtn.addEventListener("click", () => {
        const reason = prompt("Reason for banning " + targetHandle + " (optional):") || "";
        if (confirm("Confirm " + d.label + " for " + targetHandle + "?")) {
          socket.emit("moderatorBan", { targetHandle, duration: d.value, reason });
        }
      });
      panel.appendChild(banBtn);
    });

    return panel;
  }

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

    sendSound.currentTime = 0;
    sendSound.play().catch(() => {});

    messageInput.value = "";
    stopTypingNow();
  }

  // ---- Typing indicator (outgoing) ----
  let typingTimeout = null;
  let isCurrentlyTyping = false;

  messageInput.addEventListener("input", () => {
    if (!isCurrentlyTyping) {
      isCurrentlyTyping = true;
      socket.emit("typing", { handle: myHandle });
    }

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(stopTypingNow, 2000);
  });

  function stopTypingNow() {
    if (isCurrentlyTyping) {
      isCurrentlyTyping = false;
      socket.emit("stopTyping", { handle: myHandle });
    }
    clearTimeout(typingTimeout);
  }

  // ---- Typing indicator (incoming) ----
  const typingUsers = new Set();

  socket.on("typing", ({ handle }) => {
    typingUsers.add(handle);
    updateTypingIndicator();
  });

  socket.on("stopTyping", ({ handle }) => {
    typingUsers.delete(handle);
    updateTypingIndicator();
  });

  function updateTypingIndicator() {
    const names = Array.from(typingUsers);

    if (names.length === 0) {
      typingIndicator.textContent = "";
    } else if (names.length === 1) {
      typingIndicator.textContent = names[0] + " is typing...";
    } else if (names.length === 2) {
      typingIndicator.textContent = names[0] + " and " + names[1] + " are typing...";
    } else {
      typingIndicator.textContent = "Several people are typing...";
    }
  }

  // ---- Reactions & heat rating ----
  function buildReactionBar(messageId, counts, heatRating) {
    const bar = document.createElement("div");
    bar.className = "reaction-bar";

    const pillsWrap = document.createElement("span");
    pillsWrap.className = "reaction-pills";
    bar.appendChild(pillsWrap);

    const addBtn = document.createElement("button");
    addBtn.className = "reaction-add-btn";
    addBtn.textContent = "+";
    bar.appendChild(addBtn);

    const picker = document.createElement("div");
    picker.className = "reaction-picker hidden";
    REACTIONS.forEach(r => {
      const pickBtn = document.createElement("button");
      pickBtn.className = "reaction-pick-btn";
      pickBtn.dataset.reaction = r.key;
      pickBtn.textContent = r.emoji;
      pickBtn.addEventListener("click", () => {
        socket.emit("reaction", { messageId: messageId, handle: myHandle, reactionType: r.key });
        picker.classList.add("hidden");
      });
      picker.appendChild(pickBtn);
    });
    bar.appendChild(picker);

    addBtn.addEventListener("click", () => {
      picker.classList.toggle("hidden");
    });

    const heatBadge = document.createElement("span");
    heatBadge.className = "heat-badge";
    heatBadge.textContent = heatRating ? "🔥 " + heatRating : "";
    bar.appendChild(heatBadge);

    renderPills(pillsWrap, counts);

    return bar;
  }

  function renderPills(pillsWrap, counts) {
    pillsWrap.innerHTML = "";
    REACTIONS.forEach(r => {
      const count = counts[r.key] || 0;
      if (count > 0) {
        const pill = document.createElement("span");
        pill.className = "reaction-pill";
        pill.textContent = r.emoji + " " + count;
        pillsWrap.appendChild(pill);
      }
    });
  }

  socket.on("reactionUpdate", ({ messageId, counts, heatRating }) => {
    const msgEl = messagesBox.querySelector('[data-message-id="' + messageId + '"]');
    if (!msgEl) return;

    const pillsWrap = msgEl.querySelector(".reaction-pills");
    if (pillsWrap) {
      renderPills(pillsWrap, counts);
    }

    const heatBadge = msgEl.querySelector(".heat-badge");
    if (heatBadge) {
      heatBadge.textContent = heatRating ? "🔥 " + heatRating : "";
    }
  });

  // ---- Incoming chat messages ----
  socket.on("chatMessage", (data) => {
    const msgEl = document.createElement("div");
    msgEl.className = "chat-message";
    msgEl.dataset.messageId = data.id;

    const textLine = document.createElement("p");

    const handleSpan = document.createElement("span");
    handleSpan.className = "msg-handle";
    handleSpan.textContent = data.handle + ":";
    handleSpan.style.color = data.color;

    const textSpan = document.createElement("span");
    textSpan.textContent = " " + data.text;

    textLine.appendChild(handleSpan);
    textLine.appendChild(textSpan);

    const counts = data.counts || { chilli: 0, heart: 0, laugh: 0, down: 0 };
    const reactionBar = buildReactionBar(data.id, counts, data.heatRating || null);

    msgEl.appendChild(textLine);
    msgEl.appendChild(reactionBar);
    messagesBox.appendChild(msgEl);

    messagesBox.scrollTop = messagesBox.scrollHeight;

    const isOwnMessage = data.handle === myHandle;
    if (!isOwnMessage) {
      notifySound.currentTime = 0;
      notifySound.play().catch(() => {});
    }
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

  // ---- Connection resilience ----
  socket.on("disconnect", () => {
    connectionBanner.classList.remove("hidden");
  });

  socket.on("connect", () => {
    connectionBanner.classList.add("hidden");

    if (hasJoinedOnce) {
      messagesBox.innerHTML = "";
      const myDeviceToken = localStorage.getItem(STORAGE_TOKEN_KEY);
      socket.emit("join", { handle: myHandle, color: myColor, deviceToken: myDeviceToken });
    }
  });

  checkReturningUser();
});