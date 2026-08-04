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

  const lastKnownCounts = {};
const FONT_MAP = {
    default: "'Courier New', Courier, monospace",
    inter: "'Inter', sans-serif",
    atkinson: "'Atkinson Hyperlegible', sans-serif",
    noto: "'Noto Sans', sans-serif",
    roboto: "'Roboto', sans-serif",
    sfpro: "-apple-system, 'SF Pro Display', 'SF Pro Text', sans-serif",
    segoe: "'Segoe UI', Tahoma, sans-serif",
    source: "'Source Sans 3', sans-serif",
  };

  let soundEnabled = true;

  function buzz(ms) {
    if (navigator.vibrate) {
      navigator.vibrate(ms || 15);
    }
  }

  function playSound(audioEl) {
    if (!soundEnabled) return;
    audioEl.currentTime = 0;
    audioEl.play().catch(() => {});
  }

  function applyOptions() {
    const savedFont = localStorage.getItem("chillichat_font") || "default";
    const savedColor = localStorage.getItem("chillichat_font_color") || "#39ff14";
    const savedBold = localStorage.getItem("chillichat_bold") === "true";
    const savedSound = localStorage.getItem("chillichat_sound");

    document.documentElement.style.setProperty("--app-font-family", FONT_MAP[savedFont] || FONT_MAP.default);
    document.documentElement.style.setProperty("--app-text-color", savedColor);
    document.body.classList.toggle("bold-text", savedBold);

    fontSelect.value = savedFont;
    boldToggle.checked = savedBold;
    fontColorSwatches.forEach(s => {
      s.classList.toggle("selected", s.dataset.color === savedColor);
    });

    soundEnabled = savedSound === null ? true : savedSound === "true";
    soundToggle.checked = soundEnabled;
  }

  optionsToggleBtn.addEventListener("click", () => {
    buzz();
    optionsDropdown.classList.toggle("open");
  });

  fontSelect.addEventListener("change", () => {
    localStorage.setItem("chillichat_font", fontSelect.value);
    document.documentElement.style.setProperty("--app-font-family", FONT_MAP[fontSelect.value] || FONT_MAP.default);
  });

  fontColorSwatches.forEach(swatch => {
    swatch.addEventListener("click", () => {
      fontColorSwatches.forEach(s => s.classList.remove("selected"));
      swatch.classList.add("selected");
      const color = swatch.dataset.color;
      localStorage.setItem("chillichat_font_color", color);
      document.documentElement.style.setProperty("--app-text-color", color);
      buzz();
    });
  });

  boldToggle.addEventListener("change", () => {
    localStorage.setItem("chillichat_bold", boldToggle.checked);
    document.body.classList.toggle("bold-text", boldToggle.checked);
    buzz();
  });

  soundToggle.addEventListener("change", () => {
    soundEnabled = soundToggle.checked;
    localStorage.setItem("chillichat_sound", soundEnabled);
    buzz();
  });

  applyOptions();
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
  const highrollersUsersBtn = document.getElementById("highrollers-users-btn");
  const highrollersList = document.getElementById("highrollers-list");
  const userLeaderboardList = document.getElementById("user-leaderboard-list");
  const messagesBox = document.getElementById("messages-box");
  const messageInput = document.getElementById("message-input");
  const sendBtn = document.getElementById("send-btn");
  const typingIndicator = document.getElementById("typing-indicator");
  const sendSound = document.getElementById("send-sound");
  const notifySound = document.getElementById("notify-sound");
  const connectionBanner = document.getElementById("connection-banner");
  const micBtn = document.getElementById("mic-btn");
  const recordingOverlay = document.getElementById("recording-overlay");
  const recordingTimer = document.getElementById("recording-timer");
  const cancelRecordingBtn = document.getElementById("cancel-recording-btn");
  const photoBtn = document.getElementById("photo-btn");
  const photoFileInput = document.getElementById("photo-file-input");
  const photoViewerOverlay = document.getElementById("photo-viewer-overlay");
  const photoViewerImg = document.getElementById("photo-viewer-img");
  const photoCountdownFill = document.getElementById("photo-countdown-fill");
  const photoCountdownText = document.getElementById("photo-countdown-text");
  const optionsToggleBtn = document.getElementById("options-toggle-btn");
  const optionsDropdown = document.getElementById("options-dropdown");
  const fontSelect = document.getElementById("font-select");
  const fontColorSwatches = document.querySelectorAll(".font-color-swatch");
  const boldToggle = document.getElementById("bold-toggle");
  const soundToggle = document.getElementById("sound-toggle");
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
    buzz();
    usersDropdown.classList.toggle("open");
  });

 highrollersToggleBtn.addEventListener("click", () => {
    buzz();
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

  highrollersUsersBtn.addEventListener("click", () => {
    setHighrollersTab("users");
    socket.emit("getUserLeaderboard");
  });

  function setHighrollersTab(mode) {
    highrollersTodayBtn.classList.toggle("active", mode === "day");
    highrollersWeekBtn.classList.toggle("active", mode === "week");
    highrollersUsersBtn.classList.toggle("active", mode === "users");

    highrollersList.classList.toggle("hidden", mode === "users");
    userLeaderboardList.classList.toggle("hidden", mode !== "users");
  }

  function requestHighrollers(period) {
    socket.emit("getHighrollers", { period });
  }

  const MEDALS = ["🥇", "🥈", "🥉"];

  socket.on("userLeaderboardResult", ({ leaderboard }) => {
    userLeaderboardList.innerHTML = "";

    if (leaderboard.length === 0) {
      const li = document.createElement("li");
      li.className = "highrollers-empty";
      li.textContent = "No users on the board yet.";
      userLeaderboardList.appendChild(li);
      return;
    }

    leaderboard.forEach((entry, index) => {
      const li = document.createElement("li");
      li.className = "highrollers-item";

      const position = document.createElement("span");
      position.className = "highrollers-heat";
      position.textContent = MEDALS[index] || "#" + (index + 1);

      const handle = document.createElement("span");
      handle.className = "highrollers-handle";
      handle.textContent = entry.rankEmoji + " " + entry.handle;
      handle.style.color = entry.color;

      const scho = document.createElement("span");
      scho.className = "highrollers-text";
      scho.textContent = entry.scho.toLocaleString() + " Scho — " + entry.rankName;

      li.appendChild(position);
      li.appendChild(handle);
      li.appendChild(scho);
      userLeaderboardList.appendChild(li);
    });
  });

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

  joinBtn.addEventListener("click", () => { buzz(); enterLobby(false); });

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

  socket.on("reactionError", (message) => {
    showSystemMessage("⚠️ " + message);
  });

  socket.on("badgeUnlocked", ({ emoji, name }) => {
    showSystemMessage("🏅 Badge unlocked: " + emoji + " " + name + "!");
  });

  socket.on("heatNotification", (message) => {
    showHeatNotification(message);
  });

  function showHeatNotification(text) {
    const msgEl = document.createElement("p");
    msgEl.className = "heat-notification";
    msgEl.textContent = text;
    messagesBox.appendChild(msgEl);
    messagesBox.scrollTop = messagesBox.scrollHeight;
  }

  socket.on("contentDeleted", ({ type, id }) => {
    let selector;
    let label;
    if (type === "text") {
      selector = '[data-message-id="' + id + '"]';
      label = "Message removed by moderator";
    } else if (type === "voice") {
      selector = '[data-clip-id="' + id + '"]';
      label = "Voice clip removed by moderator";
    } else {
      selector = '[data-photo-id="' + id + '"]';
      label = "Photo removed by moderator";
    }

    const el = messagesBox.querySelector(selector);
    if (!el) return;

    el.innerHTML = "";
    el.className = "system-msg";
    el.textContent = label;
  });

  function formatTimestamp(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

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
      const rankPrefix = user.rankEmoji ? user.rankEmoji + " " : "";
      const badgeStr = (user.badges && user.badges.length > 0) ? " " + user.badges.join("") : "";
      name.textContent = (user.isModerator ? "🛡️ " : "") + rankPrefix + user.handle + badgeStr;
      name.style.color = user.color;

      const schoLabel = document.createElement("span");
      schoLabel.className = "scho-label";
      schoLabel.textContent = (user.scho || 0).toLocaleString() + " Scho";

      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(schoLabel);
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

  sendBtn.addEventListener("click", () => { buzz(); sendMessage(); });

  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  });

  function sendMessage() {
    const text = messageInput.value.trim();
    if (text === "") return;

    socket.emit("chatMessage", { handle: myHandle, color: myColor, text: text });

  playSound(sendSound);

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
  function attachLongPress(triggerEl, panelEl) {
    let pressTimer = null;
    const LONG_PRESS_MS = 450;

    function start() {
      pressTimer = setTimeout(() => {
        panelEl.classList.toggle("hidden");
      }, LONG_PRESS_MS);
    }
    function cancel() {
      clearTimeout(pressTimer);
    }

    triggerEl.addEventListener("mousedown", start);
    triggerEl.addEventListener("mouseup", cancel);
    triggerEl.addEventListener("mouseleave", cancel);
    triggerEl.addEventListener("touchstart", start, { passive: true });
    triggerEl.addEventListener("touchend", cancel);
    triggerEl.addEventListener("touchmove", cancel);
  }

  function spawnFloatingReaction(msgEl, emoji) {
    const float = document.createElement("span");
    float.className = "floating-reaction";
    float.textContent = emoji;
    float.style.left = (20 + Math.random() * 60) + "%";
    msgEl.appendChild(float);
    float.addEventListener("animationend", () => float.remove());
  }

  function buildReactionBar(messageId, counts, heatRating) {
    const bar = document.createElement("div");
    bar.className = "reaction-bar hidden";

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
        buzz();
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

    if (myIsModerator) {
      const delBtn = document.createElement("button");
      delBtn.className = "mod-delete-btn";
      delBtn.textContent = "🗑️";
      delBtn.title = "Delete message";
      delBtn.addEventListener("click", () => {
        if (confirm("Delete this message?")) {
          socket.emit("moderatorDeleteMessage", { messageId });
        }
      });
      bar.appendChild(delBtn);
    }

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

    const prevCounts = lastKnownCounts[messageId] || { chilli: 0, heart: 0, laugh: 0, down: 0 };
    REACTIONS.forEach(r => {
      if ((counts[r.key] || 0) > (prevCounts[r.key] || 0)) {
        spawnFloatingReaction(msgEl, r.emoji);
      }
    });
    lastKnownCounts[messageId] = counts;

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

    const timeSpan = document.createElement("span");
    timeSpan.className = "msg-timestamp";
    timeSpan.textContent = formatTimestamp(data.createdAt);

    textLine.appendChild(handleSpan);
    textLine.appendChild(textSpan);
    textLine.appendChild(timeSpan);

    const counts = data.counts || { chilli: 0, heart: 0, laugh: 0, down: 0 };
    const reactionBar = buildReactionBar(data.id, counts, data.heatRating || null);
    lastKnownCounts[data.id] = counts;

    msgEl.appendChild(textLine);
    msgEl.appendChild(reactionBar);
    messagesBox.appendChild(msgEl);
    attachLongPress(textLine, reactionBar);

    messagesBox.scrollTop = messagesBox.scrollHeight;

    const isOwnMessage = data.handle === myHandle;
    if (!isOwnMessage) {
    playSound(notifySound);
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

  // ---- Voice clips ----
  const MAX_RECORD_MS = 10000;

  let mediaRecorder = null;
  let audioChunks = [];
  let recordStartTime = 0;
  let recordTimerInterval = null;
  let wasCancelled = false;

  function isRecordingSupported() {
    return !!(navigator.mediaDevices && window.MediaRecorder);
  }

  async function startRecording() {
    if (!isRecordingSupported()) {
      alert("Voice recording isn't supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      wasCancelled = false;

      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        clearInterval(recordTimerInterval);
        recordingOverlay.classList.add("hidden");
        micBtn.classList.remove("recording");

        if (wasCancelled) return;

        const durationMs = Date.now() - recordStartTime;
        if (durationMs < 300) return; // ignore accidental taps

        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Audio = reader.result;
          socket.emit("voiceClip", {
            handle: myHandle,
            color: myColor,
            audioData: base64Audio,
            durationMs: Math.min(durationMs, MAX_RECORD_MS),
          });
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start();
      recordStartTime = Date.now();
      micBtn.classList.add("recording");
      recordingOverlay.classList.remove("hidden");
      updateRecordingTimer();

     playSound(sendSound);

      if (navigator.vibrate) {
        navigator.vibrate(40);
      }

      recordTimerInterval = setInterval(updateRecordingTimer, 200);
    } catch (err) {
      console.error("Mic access error:", err);
      alert("Couldn't access your microphone. Please check permissions.");
    }
  }

  function updateRecordingTimer() {
    const elapsed = Date.now() - recordStartTime;
    const seconds = Math.floor(elapsed / 1000);
    const tenths = Math.floor((elapsed % 1000) / 100);
    recordingTimer.textContent = seconds + "." + tenths + "s / 10.0s";

    if (elapsed >= MAX_RECORD_MS) {
      stopRecording(false);
    }
  }

  function stopRecording(cancelled) {
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;

    wasCancelled = cancelled;
    mediaRecorder.stop();
    playSound(notifySound);
    if (navigator.vibrate) {
      navigator.vibrate(20);
    }
  }

  micBtn.addEventListener("mousedown", startRecording);
  micBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    startRecording();
  });

  micBtn.addEventListener("mouseup", () => stopRecording(false));
  micBtn.addEventListener("mouseleave", () => {
    if (mediaRecorder && mediaRecorder.state === "recording") stopRecording(false);
  });
  micBtn.addEventListener("touchend", () => stopRecording(false));

  cancelRecordingBtn.addEventListener("click", () => stopRecording(true));

  socket.on("voiceClip", (data) => {
    const msgEl = document.createElement("div");
    msgEl.className = "voice-message";
    msgEl.dataset.clipId = data.id;

    const playBtn = document.createElement("button");
    playBtn.className = "voice-play-btn";
    playBtn.textContent = "▶";

    const audio = new Audio(data.audioData);
    let isPlaying = false;

    audio.addEventListener("loadedmetadata", () => {
      if (audio.duration === Infinity || isNaN(audio.duration)) {
        audio.currentTime = 1e101;
        audio.addEventListener("timeupdate", function fixDuration() {
          audio.removeEventListener("timeupdate", fixDuration);
          audio.currentTime = 0;
        });
      }
    });

    playBtn.addEventListener("click", () => {
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play();
      }
    });

    audio.addEventListener("play", () => {
      isPlaying = true;
      playBtn.textContent = "⏸";
    });
    audio.addEventListener("pause", () => {
      isPlaying = false;
      playBtn.textContent = "▶";
    });
    audio.addEventListener("ended", () => {
      isPlaying = false;
      playBtn.textContent = "▶";
   playSound(notifySound);
    });

    const meta = document.createElement("div");
    meta.className = "voice-meta";

    const handleLine = document.createElement("span");
    handleLine.textContent = data.handle;
    handleLine.style.color = data.color;
    handleLine.style.fontWeight = "bold";

    const durationLine = document.createElement("span");
    durationLine.textContent = (data.durationMs / 1000).toFixed(1) + "s voice clip";
    durationLine.style.color = "#1f7a0d";

    const timeLine = document.createElement("span");
    timeLine.className = "msg-timestamp";
    timeLine.textContent = formatTimestamp(data.createdAt);

    meta.appendChild(handleLine);
    meta.appendChild(durationLine);
    meta.appendChild(timeLine);

    msgEl.appendChild(playBtn);
    msgEl.appendChild(meta);

    if (myIsModerator) {
      const delBtn = document.createElement("button");
      delBtn.className = "mod-delete-btn";
      delBtn.textContent = "🗑️";
      delBtn.title = "Delete voice clip";
      delBtn.addEventListener("click", () => {
        if (confirm("Delete this voice clip?")) {
          socket.emit("moderatorDeleteVoiceClip", { clipId: data.id });
        }
      });
      msgEl.appendChild(delBtn);
    }

    messagesBox.appendChild(msgEl);
    messagesBox.scrollTop = messagesBox.scrollHeight;

    if (data.handle !== myHandle) {
     playSound(notifySound); 
    }
  });

  // ---- Ephemeral photos ----
  const MAX_PHOTO_DIMENSION = 800;
  const MAX_PHOTO_BASE64_LENGTH = 1.1 * 1024 * 1024;
  const PHOTO_VIEW_SECONDS = 10;

  photoBtn.addEventListener("click", () => {
    buzz();
    photoFileInput.click();
  });

  photoFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    photoFileInput.value = "";
    compressAndSendPhoto(file);
  });

  function compressAndSendPhoto(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > MAX_PHOTO_DIMENSION) {
          height = Math.round((height * MAX_PHOTO_DIMENSION) / width);
          width = MAX_PHOTO_DIMENSION;
        } else if (height > MAX_PHOTO_DIMENSION) {
          width = Math.round((width * MAX_PHOTO_DIMENSION) / height);
          height = MAX_PHOTO_DIMENSION;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        tryCompress(canvas, 0.7);
      };
      img.onerror = () => alert("Couldn't read that image file.");
      img.src = e.target.result;
    };
    reader.onerror = () => alert("Couldn't read that image file.");
    reader.readAsDataURL(file);
  }

  function tryCompress(canvas, quality) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length > MAX_PHOTO_BASE64_LENGTH && quality > 0.3) {
      tryCompress(canvas, quality - 0.15);
      return;
    }
    if (dataUrl.length > MAX_PHOTO_BASE64_LENGTH) {
      alert("That photo is too large even after compression. Try a smaller image.");
      return;
    }
    socket.emit("photoUpload", { handle: myHandle, color: myColor, imageData: dataUrl });
  }

  socket.on("photoNew", (data) => {
    const msgEl = document.createElement("div");
    msgEl.className = "photo-thumb";
    msgEl.dataset.photoId = data.id;

    if (data.alreadyOpened && !data.isOwn) {
      renderExpiredThumb(msgEl, data.handle, data.color);
    } else {
      renderActiveThumb(msgEl, data.handle, data.color, data.id);
    }

    messagesBox.appendChild(msgEl);
    messagesBox.scrollTop = messagesBox.scrollHeight;

    if (data.handle !== myHandle) {
      notifySound.currentTime = 0;
      notifySound.play().catch(() => {});
    }
  });

  function renderActiveThumb(msgEl, handle, color, photoId) {
    msgEl.innerHTML = "";
    msgEl.classList.remove("expired");

    const icon = document.createElement("span");
    icon.className = "photo-thumb-icon";
    icon.textContent = "📷";

    const meta = document.createElement("div");
    meta.className = "photo-thumb-meta";

    const handleLine = document.createElement("span");
    handleLine.className = "photo-thumb-handle";
    handleLine.textContent = handle;
    handleLine.style.color = color;

    const hint = document.createElement("span");
    hint.className = "photo-thumb-hint";
    hint.textContent = "View once photo — tap to reveal (10s)";

    meta.appendChild(handleLine);
    meta.appendChild(hint);
    msgEl.appendChild(icon);
    msgEl.appendChild(meta);

    if (myIsModerator) {
      const delBtn = document.createElement("button");
      delBtn.className = "mod-delete-btn";
      delBtn.textContent = "🗑️";
      delBtn.title = "Delete photo";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm("Delete this photo?")) {
          socket.emit("moderatorDeletePhoto", { photoId });
        }
      });
      msgEl.appendChild(delBtn);
    }

    msgEl.onclick = () => {
      socket.emit("photoOpen", { photoId, viewerHandle: myHandle });
    };
  }

  function renderExpiredThumb(msgEl, handle, color) {
    msgEl.innerHTML = "";
    msgEl.classList.add("expired");
    msgEl.onclick = null;

    const icon = document.createElement("span");
    icon.className = "photo-thumb-icon";
    icon.textContent = "📷";

    const meta = document.createElement("div");
    meta.className = "photo-thumb-meta";

    const handleLine = document.createElement("span");
    handleLine.className = "photo-thumb-handle";
    handleLine.textContent = handle;
    handleLine.style.color = color;

    const hint = document.createElement("span");
    hint.className = "photo-thumb-hint";
    hint.textContent = "Photo expired";

    meta.appendChild(handleLine);
    meta.appendChild(hint);
    msgEl.appendChild(icon);
    msgEl.appendChild(meta);
  }

  let photoCountdownInterval = null;

  socket.on("photoResult", ({ photoId, imageData, expired }) => {
    const thumbEl = messagesBox.querySelector('[data-photo-id="' + photoId + '"]');

    if (expired || !imageData) {
      if (thumbEl) {
        const handleColor = thumbEl.querySelector(".photo-thumb-handle");
        renderExpiredThumb(thumbEl, handleColor ? handleColor.textContent : "", "");
      }
      return;
    }

    openPhotoViewer(imageData, () => {
      if (thumbEl) {
        const handleColor = thumbEl.querySelector(".photo-thumb-handle");
        const handleText = handleColor ? handleColor.textContent : "";
        if (handleText !== myHandle) {
          renderExpiredThumb(thumbEl, handleText, "");
        }
      }
    });
  });

  function openPhotoViewer(imageData, onExpireCallback) {
    photoViewerImg.src = imageData;
    photoViewerOverlay.classList.remove("hidden");

    let secondsLeft = PHOTO_VIEW_SECONDS;
    photoCountdownText.textContent = secondsLeft + "s";
    photoCountdownFill.style.width = "100%";

    clearInterval(photoCountdownInterval);
    photoCountdownInterval = setInterval(() => {
      secondsLeft -= 1;
      photoCountdownText.textContent = Math.max(secondsLeft, 0) + "s";
      photoCountdownFill.style.width = Math.max((secondsLeft / PHOTO_VIEW_SECONDS) * 100, 0) + "%";

      if (secondsLeft <= 0) {
        clearInterval(photoCountdownInterval);
        closePhotoViewer();
        if (onExpireCallback) onExpireCallback();
      }
    }, 1000);
  }

  function closePhotoViewer() {
    photoViewerOverlay.classList.add("hidden");
    photoViewerImg.src = "";
    clearInterval(photoCountdownInterval);
  }

  photoViewerOverlay.addEventListener("click", () => {
    closePhotoViewer();
  });

  checkReturningUser();
});