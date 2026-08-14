document.addEventListener("DOMContentLoaded", function () {
  console.log("ChilliChat app.js loaded");
  const IDLE_LIMIT_MS = 5 * 60 * 1000;
  const STORAGE_HANDLE_KEY = "chillichat_handle";
  const STORAGE_COLOR_KEY = "chillichat_color";
  const STORAGE_TOKEN_KEY = "chillichat_device_token";
  const WHEEL_ITEM_HEIGHT = 32;

  const REACTIONS = [
    { key: "chilli", emoji: "🌶️" },
    { key: "heart", emoji: "❤️" },
    { key: "laugh", emoji: "😂" },
    { key: "down", emoji: "👎" },
  ];

  const lastKnownCounts = {};

  const BADGE_DEFS_CLIENT = {
    fresh_face: { emoji: "🌱", name: "Fresh Face" },
    ice_breaker: { emoji: "💬", name: "Ice Breaker" },
    first_burn: { emoji: "🌶️", name: "First Burn" },
    well_liked: { emoji: "❤️", name: "Well Liked" },
    crowd_pleaser: { emoji: "😂", name: "Crowd Pleaser" },
    spice_merchant: { emoji: "🌶️", name: "Spice Merchant" },
    friendly_flame: { emoji: "🤝", name: "Friendly Flame" },
    top_banter: { emoji: "💡", name: "Top Banter" },
    fire_extinguisher: { emoji: "🧯", name: "Fire Extinguisher" },
    melted_keyboard: { emoji: "🫠", name: "Melted Keyboard" },
    meme_machine: { emoji: "🤣", name: "Meme Machine" },
    heartbreaker: { emoji: "❤️", name: "Heartbreaker" },
    spice_lord: { emoji: "🌶️", name: "Spice Lord" },
    pepper_royalty: { emoji: "👑", name: "Pepper Royalty" },
    beta_tester: { emoji: "🚀", name: "Beta Tester" },
    lightning_fingers: { emoji: "⚡", name: "Lightning Fingers" },
    streak_7: { emoji: "🔥", name: "7-Day Streak" },
    streak_30: { emoji: "🌋", name: "30-Day Streak" },
    streak_100: { emoji: "☄️", name: "100-Day Streak" },
  };

 const FONT_MAP = {
    default: "'Courier New', Courier, monospace",
    inter: "'Inter', sans-serif",
    atkinson: "'Atkinson Hyperlegible', sans-serif",
    noto: "'Noto Sans', sans-serif",
    roboto: "'Roboto', sans-serif",
    sfpro: "-apple-system, 'SF Pro Display', 'SF Pro Text', sans-serif",
    segoe: "'Segoe UI', Tahoma, sans-serif",
    source: "'Source Sans 3', sans-serif",
    nunito: "'Nunito', sans-serif",
    poppins: "'Poppins', sans-serif",
    worksans: "'Work Sans', sans-serif",
    quicksand: "'Quicksand', sans-serif",
    spacegrotesk: "'Space Grotesk', sans-serif",
    manrope: "'Manrope', sans-serif",
    dmsans: "'DM Sans', sans-serif",
    jakarta: "'Plus Jakarta Sans', sans-serif",
    oswald: "'Oswald', sans-serif",
    rubik: "'Rubik', sans-serif",
    bebasneue: "'Bebas Neue', sans-serif",
    righteous: "'Righteous', sans-serif",
    bangers: "'Bangers', cursive",
    archivoblack: "'Archivo Black', sans-serif",
    permanentmarker: "'Permanent Marker', cursive",
    caveat: "'Caveat', cursive",
    jetbrainsmono: "'JetBrains Mono', monospace",
    firacode: "'Fira Code', monospace",
  };

  const FONT_SIZE_MAP = {
    small: "13px",
    medium: "15px",
    large: "18px",
    xlarge: "22px",
  };

  let soundEnabled = true;

 function buzz(ms) {
    if (navigator.vibrate) {
      try {
        navigator.vibrate(ms || 15);
      } catch (e) {
        // Ignore — browser blocked vibrate before a user gesture.
      }
    }
  }

  function positionWheelPanel(btn, panel) {
    const rect =
      btn.getBoundingClientRect();

    const panelWidth =
      panel.offsetWidth || 200;

    const margin = 8;

    let left =
      rect.right - panelWidth;

    if (left < margin) {
      left = margin;
    }

    const maxLeft =
      window.innerWidth -
      panelWidth -
      margin;

    if (left > maxLeft) {
      left = maxLeft;
    }

    panel.style.left = left + "px";
    panel.style.top =
      rect.bottom + 4 + "px";
  }
  const safeStorage = {
    getItem(key) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    },

    setItem(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        // Storage blocked — silently ignore.
      }
    },

    removeItem(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        // Ignore.
      }
    },
  };

  function playSound(audioEl) {
    if (!soundEnabled || !audioEl) return;

    const sound = audioEl.cloneNode(true);
    sound.play().catch(() => {});
  }

  function dataUrlToBlobUrl(dataUrl) {
    try {
      const [header, base64] = dataUrl.split(",");
      const mimeMatch = header.match(/data:(.*?);base64/);
      const mimeType = mimeMatch ? mimeMatch[1] : "audio/webm";

      const byteString = atob(base64);
      const bytes = new Uint8Array(byteString.length);

      for (let i = 0; i < byteString.length; i++) {
        bytes[i] = byteString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: mimeType });
      return URL.createObjectURL(blob);
    } catch (err) {
      console.error(
        "Failed to convert voice clip to blob URL:",
        err
      );
      return dataUrl;
    }
  }

  const socket = io();

  let myHandle = "";
  let myColor = "";
  let myIsModerator = false;
  let lastActivityTime = Date.now();
  let isIdle = false;

  let hasJoinedOnce = false;
  let isLoadingHistory = false;

  const handleInput = document.getElementById("handle-input");
  const colorWheelWrap = document.getElementById("color-wheel-wrap");
  const colorWheelList = document.getElementById("color-wheel-list");
  const colorWheelItems = Array.from(
    document.querySelectorAll(".color-wheel-item")
  );
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
  const btnfxSound = document.getElementById("btnfx-sound");

  const micSound = document.getElementById("mic-sound");
  const endSound = document.getElementById("end-sound");
  const playClipSound = document.getElementById("play-sound");
  const voiceEndSound = document.getElementById("voice-end-sound");

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

  const profileOverlay = document.getElementById("profile-overlay");
  const profileCloseBtn = document.getElementById("profile-close-btn");
  const profileHandle = document.getElementById("profile-handle");
  const profileRank = document.getElementById("profile-rank");
  const profileReactions = document.getElementById("profile-reactions");
  const profileBio = document.getElementById("profile-bio");
  const profileBadgesGrid = document.getElementById("profile-badges-grid");

  const optionsToggleBtn = document.getElementById("options-toggle-btn");
  const optionsDropdown = document.getElementById("options-dropdown");
  const fontBtn = document.getElementById("font-btn");
  const fontWheelPanel = document.getElementById("font-wheel-panel");
  const fontWheelList = document.getElementById("font-wheel-list");
  const fontWheelItems = Array.from(
    document.querySelectorAll("#font-wheel-list .wheel-item")
  );

const FONT_LABELS = {
    default: "Default (Retro)",
    inter: "Inter",
    atkinson: "Atkinson Hyperlegible",
    noto: "Noto Sans",
    roboto: "Roboto",
    sfpro: "SF Pro",
    segoe: "Segoe UI",
    source: "Source Sans 3",
    nunito: "Nunito",
    poppins: "Poppins",
    worksans: "Work Sans",
    quicksand: "Quicksand",
    spacegrotesk: "Space Grotesk",
    manrope: "Manrope",
    dmsans: "DM Sans",
    jakarta: "Plus Jakarta Sans",
    oswald: "Oswald",
    rubik: "Rubik",
    bebasneue: "Bebas Neue",
    righteous: "Righteous",
    bangers: "Bangers",
    archivoblack: "Archivo Black",
    permanentmarker: "Permanent Marker",
    caveat: "Caveat",
    jetbrainsmono: "JetBrains Mono",
    firacode: "Fira Code",
  };
 function updateFontButtonLabel(value) {
    const match = fontWheelItems.find(
      (item) => item.dataset.value === value
    );

    fontBtn.textContent =
      (match
        ? match.textContent
        : FONT_LABELS.default) + " ▾";
  }

  const fontColorBtn = document.getElementById("font-color-btn");
  const fontColorWheelPanel = document.getElementById(
    "font-color-wheel-panel"
  );
  const fontColorWheelList = document.getElementById(
    "font-color-wheel-list"
  );
  const fontColorWheelItems = Array.from(
    document.querySelectorAll(
      "#font-color-wheel-list .wheel-item"
    )
  );

  function updateFontColorButtonLabel(color) {
    const match = fontColorWheelItems.find(
      (item) => item.dataset.color === color
    );

    fontColorBtn.textContent =
      (match ? match.textContent : "Neon Green") +
      " ▾";
  }

  const boldToggle = document.getElementById("bold-toggle");
  const soundToggle = document.getElementById("sound-toggle");

  const bioInput = document.getElementById("bio-input");
  const bioSaveBtn = document.getElementById("bio-save-btn");

  const fontSizeSlider = document.getElementById("font-size-slider");
  const fontSizeLabel = document.getElementById("font-size-label");

  const FONT_SIZE_STEPS = [
    "small",
    "medium",
    "large",
    "xlarge",
  ];

  const FONT_SIZE_LABELS = {
    small: "Small",
    medium: "Medium",
    large: "Large",
    xlarge: "Extra Large",
  };

  let lastFontSizeStep = null;

  function setFontSizeUI(value) {
    const stepIndex =
      FONT_SIZE_STEPS.indexOf(value);

    fontSizeSlider.value =
      stepIndex === -1 ? 1 : stepIndex;

    fontSizeLabel.textContent =
      FONT_SIZE_LABELS[value] ||
      FONT_SIZE_LABELS.medium;

    lastFontSizeStep = fontSizeSlider.value;
  }

  function applyOptions() {
    const savedFont =
      safeStorage.getItem("chillichat_font") || "default";

    const savedColor =
      safeStorage.getItem("chillichat_font_color") || "#39ff14";

    const savedSound =
      safeStorage.getItem("chillichat_sound");

    const savedFontSize =
      safeStorage.getItem("chillichat_font_size") || "medium";

    const savedBold =
      safeStorage.getItem("chillichat_bold") === "true";

    document.documentElement.style.setProperty(
      "--app-font-family",
      FONT_MAP[savedFont] || FONT_MAP.default
    );

    document.documentElement.style.setProperty(
      "--app-text-color",
      savedColor
    );

    document.documentElement.style.setProperty(
      "--app-font-size",
      FONT_SIZE_MAP[savedFontSize] || FONT_SIZE_MAP.medium
    );

    document.body.classList.toggle("bold-text", savedBold);

    updateFontButtonLabel(savedFont);
    setFontSizeUI(savedFontSize);

    boldToggle.checked = savedBold;

    updateFontColorButtonLabel(savedColor);

    soundEnabled =
      savedSound === null ? true : savedSound === "true";

    soundToggle.checked = soundEnabled;
  }

  optionsToggleBtn.addEventListener("click", () => {
    buzz();
    playSound(btnfxSound);
    optionsDropdown.classList.toggle("open");
  });

  const fontWheel = createWheel({
    wrap: fontWheelPanel,
    list: fontWheelList,
    items: fontWheelItems,
    getValue: (item) => item.dataset.value,
    onChange: (value, itemEl) => {
      safeStorage.setItem("chillichat_font", value);

      document.documentElement.style.setProperty(
        "--app-font-family",
        FONT_MAP[value] || FONT_MAP.default
      );

      fontBtn.textContent =
        itemEl.textContent + " ▾";
    },
  });
fontBtn.addEventListener("click", () => {
    buzz();

    const opening =
      fontWheelPanel.classList.contains(
        "hidden"
      );

    fontWheelPanel.classList.toggle(
      "hidden"
    );

    if (opening) {
      positionWheelPanel(
        fontBtn,
        fontWheelPanel
      );

      const savedFont =
        safeStorage.getItem(
          "chillichat_font"
        ) || "default";

      fontWheel.scrollToValue(
        savedFont
      );

      fontWheel.settle();
    }
  });

 fontSizeSlider.addEventListener("input", () => {
    const value =
      FONT_SIZE_STEPS[
        fontSizeSlider.value
      ] || "medium";

    document.documentElement.style.setProperty(
      "--app-font-size",
      FONT_SIZE_MAP[value] || FONT_SIZE_MAP.medium
    );

    fontSizeLabel.textContent =
      FONT_SIZE_LABELS[value];

    if (
      fontSizeSlider.value !==
      lastFontSizeStep
    ) {
      lastFontSizeStep =
        fontSizeSlider.value;

      buzz(10);
    }
  });

  fontSizeSlider.addEventListener("change", () => {
    const value =
      FONT_SIZE_STEPS[
        fontSizeSlider.value
      ] || "medium";

    safeStorage.setItem(
      "chillichat_font_size",
      value
    );

    buzz(15);
  });

 document.addEventListener("click", (e) => {
    if (
      !fontBtn.contains(e.target) &&
      !fontWheelPanel.contains(e.target)
    ) {
      fontWheelPanel.classList.add("hidden");
    }

    if (
      !fontColorBtn.contains(e.target) &&
      !fontColorWheelPanel.contains(e.target)
    ) {
      fontColorWheelPanel.classList.add(
        "hidden"
      );
    }
  });

 const fontColorWheel = createWheel({
    wrap: fontColorWheelPanel,
    list: fontColorWheelList,
    items: fontColorWheelItems,
    getValue: (item) => item.dataset.color,
    onChange: (color, itemEl) => {
      safeStorage.setItem(
        "chillichat_font_color",
        color
      );

      document.documentElement.style.setProperty(
        "--app-text-color",
        color
      );

      fontColorBtn.textContent =
        itemEl.textContent + " ▾";
    },
  });

 fontColorBtn.addEventListener("click", () => {
    buzz();

    const opening =
      fontColorWheelPanel.classList.contains(
        "hidden"
      );

    fontColorWheelPanel.classList.toggle(
      "hidden"
    );

    if (opening) {
      positionWheelPanel(
        fontColorBtn,
        fontColorWheelPanel
      );

      const savedColor =
        safeStorage.getItem(
          "chillichat_font_color"
        ) || "#39ff14";

      fontColorWheel.scrollToValue(
        savedColor
      );

      fontColorWheel.settle();
    }
  });

  boldToggle.addEventListener("change", () => {
    safeStorage.setItem(
      "chillichat_bold",
      boldToggle.checked
    );

    document.body.classList.toggle(
      "bold-text",
      boldToggle.checked
    );

    buzz();
  });

  soundToggle.addEventListener("change", () => {
    soundEnabled = soundToggle.checked;

    safeStorage.setItem(
      "chillichat_sound",
      soundEnabled
    );

    buzz();
  });

  applyOptions();

  function applyAccentColor(color) {
    document.documentElement.style.setProperty(
      "--accent-color",
      color
    );
  }

  const handlePreview =
    document.getElementById("handle-preview");

  function updateHandlePreview() {
    const name =
      handleInput.value.trim() || "YourHandle";

    if (myColor) {
      handlePreview.textContent = name;
      handlePreview.style.color = myColor;
    } else {
      handlePreview.textContent =
        "Pick a colour to preview your handle";

      handlePreview.style.color = "#1f7a0d";
    }
  }

function createWheel({
    wrap,
    list,
    items,
    getValue,
    onChange,
  }) {
    const itemCount = items.length;
    let offset = 0;
    let velocity = 0;
    let isDragging = false;
    let lastMoveY = 0;
    let lastMoveTime = 0;
    let momentumRAF = null;
    let currentValue = null;
    let lastTickIndex = null;

    function wrapIndex(i) {
      return ((i % itemCount) + itemCount) % itemCount;
    }

    function render() {
      items.forEach((item, i) => {
        let diff = i - offset;
        diff =
          diff -
          Math.round(diff / itemCount) *
            itemCount;

        const px = diff * WHEEL_ITEM_HEIGHT;
        const absDiff = Math.abs(diff);
        const normalized = Math.min(
          absDiff / 2,
          1
        );

        item.style.transform =
          "translateY(" +
          px +
          "px) scale(" +
          (1 - normalized * 0.4) +
          ")";

        item.style.opacity =
          1 - normalized * 0.75;

        item.style.zIndex = String(
          1000 - Math.round(absDiff * 10)
        );
      });
    }

    function centerIndex() {
      return wrapIndex(
        Math.round(offset)
      );
    }

    function maybeTick() {
      const idx = centerIndex();

      if (idx !== lastTickIndex) {
        lastTickIndex = idx;
        buzz(4);
      }
    }

    function commitSelection() {
      const idx = centerIndex();
      const item = items[idx];

      items.forEach((it) =>
        it.classList.remove("selected")
      );

      item.classList.add("selected");
      lastTickIndex = idx;

      const value = getValue(item);

      if (value !== currentValue) {
        currentValue = value;
        onChange(value, item);
        buzz(15);
      }
    }

    function cancelMomentum() {
      if (momentumRAF) {
        cancelAnimationFrame(
          momentumRAF
        );
        momentumRAF = null;
      }
    }

    function animateTo(targetIndex) {
      cancelMomentum();

      const startOffset = offset;
      let diff = targetIndex - startOffset;
      diff =
        diff -
        Math.round(diff / itemCount) *
          itemCount;

      const finalOffset =
        startOffset + diff;
      const duration = 220;
      const startTime = performance.now();

      function step(now) {
        const t = Math.min(
          (now - startTime) / duration,
          1
        );
        const eased =
          1 - Math.pow(1 - t, 3);

        offset =
          startOffset + diff * eased;

        render();
        maybeTick();

        if (t < 1) {
          momentumRAF =
            requestAnimationFrame(step);
        } else {
          offset = wrapIndex(
            Math.round(finalOffset)
          );

          render();
          commitSelection();
          momentumRAF = null;
        }
      }

      momentumRAF =
        requestAnimationFrame(step);
    }

    function runMomentum() {
      const FRICTION = 0.95;
      const MIN_VELOCITY = 0.0006;

      function step() {
        offset += velocity * 16;
        velocity *= FRICTION;

        render();
        maybeTick();

        if (
          Math.abs(velocity) >
          MIN_VELOCITY
        ) {
          momentumRAF =
            requestAnimationFrame(step);
        } else {
          animateTo(Math.round(offset));
        }
      }

      momentumRAF =
        requestAnimationFrame(step);
    }

    function onPointerDown(e) {
      cancelMomentum();
      isDragging = true;
      lastMoveY = e.clientY;
      lastMoveTime = performance.now();
      velocity = 0;

      try {
        list.setPointerCapture(
          e.pointerId
        );
      } catch (err) {}
    }

    function onPointerMove(e) {
      if (!isDragging) return;

      const now = performance.now();
      const dy = e.clientY - lastMoveY;
      const dt = Math.max(
        now - lastMoveTime,
        1
      );

      const doffset =
        -dy / WHEEL_ITEM_HEIGHT;

      offset += doffset;
      velocity = doffset / dt;

      lastMoveY = e.clientY;
      lastMoveTime = now;

      render();
      maybeTick();
    }

    function onPointerUp(e) {
      if (!isDragging) return;
      isDragging = false;

      try {
        list.releasePointerCapture(
          e.pointerId
        );
      } catch (err) {}

      if (Math.abs(velocity) > 0.015) {
        runMomentum();
      } else {
        animateTo(Math.round(offset));
      }
    }

    list.addEventListener(
      "pointerdown",
      onPointerDown
    );

    list.addEventListener(
      "pointermove",
      onPointerMove
    );

    list.addEventListener(
      "pointerup",
      onPointerUp
    );

    list.addEventListener(
      "pointercancel",
      onPointerUp
    );

    list.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        cancelMomentum();

        const direction =
          e.deltaY > 0 ? 1 : -1;

        velocity = direction * 0.03;
        runMomentum();
      },
      { passive: false }
    );

    items.forEach((item, i) => {
      item.addEventListener(
        "click",
        () => {
          if (isDragging) return;
          animateTo(i);
        }
      );
    });

    render();

    return {
      settle() {
        cancelMomentum();
        offset = wrapIndex(
          Math.round(offset)
        );
        render();
        commitSelection();
      },
      scrollToValue(value) {
        const idx = items.findIndex(
          (item) =>
            getValue(item) === value
        );

        if (idx !== -1) {
          cancelMomentum();
          offset = idx;
          render();
        }
      },
    };
  }
  const joinColorWheel = createWheel({
    wrap: colorWheelWrap,
    list: colorWheelList,
    items: colorWheelItems,
    getValue: (item) =>
      item.dataset.color,
    onChange: (color) => {
      myColor = color;

      applyAccentColor(myColor);
      updateHandlePreview();
    },
  });

  joinColorWheel.settle();

  handleInput.addEventListener(
    "input",
    updateHandlePreview
  );

  termsCheckbox.addEventListener("change", () => {
    buzz();
    joinBtn.disabled = !termsCheckbox.checked;
  });

  usersToggleBtn.addEventListener("click", () => {
    buzz();
    playSound(btnfxSound);
    usersDropdown.classList.toggle("open");
  });

  highrollersToggleBtn.addEventListener("click", () => {
    buzz();
    playSound(btnfxSound);

    highrollersDropdown.classList.toggle("open");

    if (
      highrollersDropdown.classList.contains("open")
    ) {
      requestHighrollers("day");
    }
  });

highrollersTodayBtn.addEventListener("click", () => {
    buzz();
    playSound(btnfxSound);
    setHighrollersTab("day");
    requestHighrollers("day");
  });

  highrollersWeekBtn.addEventListener("click", () => {
    buzz();
    playSound(btnfxSound);
    setHighrollersTab("week");
    requestHighrollers("week");
  });

  highrollersUsersBtn.addEventListener("click", () => {
    buzz();
    playSound(btnfxSound);
    setHighrollersTab("users");
    socket.emit("getUserLeaderboard");
  });

  function setHighrollersTab(mode) {
    highrollersTodayBtn.classList.toggle(
      "active",
      mode === "day"
    );

    highrollersWeekBtn.classList.toggle(
      "active",
      mode === "week"
    );

    highrollersUsersBtn.classList.toggle(
      "active",
      mode === "users"
    );

    highrollersList.classList.toggle(
      "hidden",
      mode === "users"
    );

    userLeaderboardList.classList.toggle(
      "hidden",
      mode !== "users"
    );
  }

  function requestHighrollers(period) {
    socket.emit("getHighrollers", { period });
  }

  const MEDALS = ["🥇", "🥈", "🥉"];

  socket.on(
    "userLeaderboardResult",
    ({ leaderboard }) => {
      userLeaderboardList.innerHTML = "";

      if (leaderboard.length === 0) {
        const li = document.createElement("li");
        li.className = "highrollers-empty";
        li.textContent =
          "No users on the board yet.";

        userLeaderboardList.appendChild(li);
        return;
      }

      leaderboard.forEach((entry, index) => {
        const li = document.createElement("li");
        li.className = "highrollers-item";

        const position =
          document.createElement("span");

        position.className = "highrollers-heat";
        position.textContent =
          MEDALS[index] || "#" + (index + 1);

        const handle =
          document.createElement("span");

        handle.className = "highrollers-handle";
        handle.textContent =
          entry.rankEmoji + " " + entry.handle;

        handle.style.color = entry.color;

        const scoville =
          document.createElement("span");

        scoville.className = "highrollers-text";

        // Keep entry.scho because the server currently
        // appears to send the value under that property.
        scoville.textContent =
          entry.scho.toLocaleString() +
          " Scoville — " +
          entry.rankName;

        li.appendChild(position);
        li.appendChild(handle);
        li.appendChild(scoville);

        userLeaderboardList.appendChild(li);
      });
    }
  );

  socket.on(
    "highrollersResult",
    ({ entries }) => {
      highrollersList.innerHTML = "";

      if (entries.length === 0) {
        const li = document.createElement("li");
        li.className = "highrollers-empty";
        li.textContent =
          "No hot takes yet — react to some messages!";

        highrollersList.appendChild(li);
        return;
      }

      entries.forEach((entry) => {
        const li = document.createElement("li");
        li.className = "highrollers-item";

        const heat =
          document.createElement("span");

        heat.className = "highrollers-heat";
        heat.textContent =
          "🔥 " + entry.heatRating;

        const handle =
          document.createElement("span");

        handle.className = "highrollers-handle";
        handle.textContent = entry.handle;
        handle.style.color = entry.color;

        const text =
          document.createElement("span");

        text.className = "highrollers-text";
        text.textContent = entry.text;

        li.appendChild(heat);
        li.appendChild(handle);
        li.appendChild(text);

        highrollersList.appendChild(li);
      });
    }
  );

  joinBtn.addEventListener("click", () => {
    buzz();
    enterLobby(false);
  });

  handleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      enterLobby(false);
    }
  });

  function enterLobby(isReturningUser) {
    const handle = isReturningUser
      ? myHandle
      : handleInput.value.trim();

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
        alert(
          "Please confirm you are 21+ and agree to the terms."
        );
        return;
      }

      myHandle = handle;

      safeStorage.setItem(
        STORAGE_HANDLE_KEY,
        myHandle
      );

      safeStorage.setItem(
        STORAGE_COLOR_KEY,
        myColor
      );
    }

    let myDeviceToken =
      safeStorage.getItem(STORAGE_TOKEN_KEY);

    if (!myDeviceToken) {
      myDeviceToken = crypto.randomUUID();

      safeStorage.setItem(
        STORAGE_TOKEN_KEY,
        myDeviceToken
      );
    }

    socket.emit("join", {
      handle: myHandle,
      color: myColor,
      deviceToken: myDeviceToken,
    });
  }

  socket.on(
    "joinSuccess",
    ({
      handle,
      color,
      deviceToken,
      isModerator,
    }) => {
      myHandle = handle;
      myColor = color;

      applyAccentColor(color);

      myIsModerator = !!isModerator;
      hasJoinedOnce = true;
      isLoadingHistory = true;

      safeStorage.setItem(
        STORAGE_HANDLE_KEY,
        myHandle
      );

      safeStorage.setItem(
        STORAGE_COLOR_KEY,
        myColor
      );

      safeStorage.setItem(
        STORAGE_TOKEN_KEY,
        deviceToken
      );

      const wasHidden =
        !joinScreen.classList.contains("hidden");

      joinScreen.classList.add("hidden");
      chatScreen.classList.remove("hidden");

      if (wasHidden === false) {
        showSystemMessage(
          "Welcome back, " + myHandle + "!"
        );
      }

      if (myIsModerator) {
        showSystemMessage(
          "🛡️ Moderator mode active."
        );
      }

      startIdleWatcher();
    }
  );

  socket.on("joinError", (message) => {
    alert(message);

    safeStorage.removeItem(STORAGE_HANDLE_KEY);
    safeStorage.removeItem(STORAGE_COLOR_KEY);
    safeStorage.removeItem(STORAGE_TOKEN_KEY);

    joinScreen.classList.remove("hidden");
    chatScreen.classList.add("hidden");
  });

  socket.on("youWereKicked", () => {
    alert(
      "You have been removed from ChilliChat by a moderator. You may rejoin."
    );

    location.reload();
  });

  socket.on(
    "youWereBanned",
    ({ permanent, until }) => {
      if (permanent) {
        alert(
          "You have been permanently banned from ChilliChat."
        );
      } else {
        alert(
          "You have been banned from ChilliChat until " +
            until +
            "."
        );
      }

      safeStorage.removeItem(STORAGE_HANDLE_KEY);
      safeStorage.removeItem(STORAGE_COLOR_KEY);
      safeStorage.removeItem(STORAGE_TOKEN_KEY);

      location.reload();
    }
  );

  socket.on("reactionError", (message) => {
    showSystemMessage("⚠️ " + message);
  });

  socket.on(
    "badgeUnlocked",
    ({ emoji, name }) => {
      showSystemMessage(
        "🏅 Badge unlocked: " +
          emoji +
          " " +
          name +
          "!"
      );
    }
  );

  socket.on("historyComplete", () => {
    isLoadingHistory = false;
  });

  function openUserProfile(targetHandle) {
    buzz();
    socket.emit("getUserProfile", {
      targetHandle,
    });
  }

  bioSaveBtn.addEventListener("click", () => {
    socket.emit("updateBio", {
      bio: bioInput.value.trim(),
    });

    buzz();
  });

  socket.on(
    "bioUpdateResult",
    ({ success, bio }) => {
      if (success) {
        showSystemMessage("✅ Bio saved.");
        bioInput.value = bio;
      } else {
        showSystemMessage(
          "⚠️ Couldn't save bio, try again."
        );
      }
    }
  );

  socket.on("userProfileResult", (data) => {
    profileHandle.textContent = data.handle;

    profileRank.textContent =
      data.rankEmoji +
      " " +
      data.rankName +
      " — " +
      data.scho.toLocaleString() +
      " Scoville";

    profileBio.textContent = data.bio
      ? data.bio
      : data.isOwn
      ? "No bio set yet — add one in Options!"
      : "";

    if (data.isOwn) {
      bioInput.value = data.bio || "";
    }

    profileReactions.innerHTML = "";

    const reactionLabels = [
      { key: "chilli", emoji: "🌶️" },
      { key: "heart", emoji: "❤️" },
      { key: "laugh", emoji: "😂" },
      { key: "down", emoji: "👎" },
    ];

    reactionLabels.forEach((r) => {
      const pill =
        document.createElement("span");

      pill.className =
        "profile-reaction-pill";

      pill.textContent =
        r.emoji +
        " " +
        (data.reactions[r.key] || 0);

      profileReactions.appendChild(pill);
    });

    profileBadgesGrid.innerHTML = "";

    Object.keys(BADGE_DEFS_CLIENT).forEach(
      (key) => {
        const def = BADGE_DEFS_CLIENT[key];

        const isUnlocked =
          data.unlockedKeys.includes(key);

        const isEquipped =
          data.equippedBadge === key;

        const cell =
          document.createElement("div");

        cell.className =
          "profile-badge" +
          (isUnlocked ? " unlocked" : "") +
          (isEquipped ? " equipped" : "");

        cell.innerHTML =
          def.emoji +
          '<span class="badge-name">' +
          def.name +
          "</span>";

        if (isUnlocked && data.isOwn) {
          cell.addEventListener(
            "click",
            () => {
              buzz();

              const newEquipped =
                isEquipped ? null : key;

              socket.emit("equipBadge", {
                badgeKey: newEquipped,
              });
            }
          );
        }

        profileBadgesGrid.appendChild(cell);
      }
    );

    profileOverlay.classList.remove("hidden");
  });

  profileCloseBtn.addEventListener("click", () => {
    buzz();
    profileOverlay.classList.add("hidden");
  });

  profileOverlay.addEventListener("click", (e) => {
    if (e.target === profileOverlay) {
      buzz();
      profileOverlay.classList.add("hidden");
    }
  });

  socket.on("heatNotification", (message) => {
    showHeatNotification(message);
  });

  function showHeatNotification(text) {
    const msgEl = document.createElement("p");

    msgEl.className = "heat-notification";
    msgEl.textContent = text;

    messagesBox.appendChild(msgEl);

    messagesBox.scrollTop =
      messagesBox.scrollHeight;
  }

  socket.on(
    "contentDeleted",
    ({ type, id }) => {
      let selector;
      let label;

      if (type === "text") {
        selector =
          '[data-message-id="' + id + '"]';

        label =
          "Message removed by moderator";
      } else if (type === "voice") {
        selector =
          '[data-clip-id="' + id + '"]';

        label =
          "Voice clip removed by moderator";
      } else {
        selector =
          '[data-photo-id="' + id + '"]';

        label =
          "Photo removed by moderator";
      }

      const el =
        messagesBox.querySelector(selector);

      if (!el) return;

      el.innerHTML = "";
      el.className = "system-msg";
      el.textContent = label;
    }
  );

  function formatTimestamp(isoString) {
    if (!isoString) return "";

    const date = new Date(isoString);

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function checkReturningUser() {
    const savedHandle =
      safeStorage.getItem(STORAGE_HANDLE_KEY);

    const savedColor =
      safeStorage.getItem(STORAGE_COLOR_KEY);

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

    messagesBox.scrollTop =
      messagesBox.scrollHeight;
  }

  socket.on("userList", (users) => {
    document.getElementById(
      "users-count-label"
    ).textContent =
      "Users (" + users.length + ")";

    usersList.innerHTML = "";

    users.forEach((user) => {
      const li = document.createElement("li");
      li.className = "user-item";

      const row =
        document.createElement("div");

      row.className = "user-row";

      const dot =
        document.createElement("span");

      dot.className =
        "status-dot " + user.status;

      const name =
        document.createElement("span");

      name.className =
        "clickable-handle";

      const rankPrefix =
        user.rankEmoji
          ? user.rankEmoji + " "
          : "";

      const equippedStr =
        user.equippedBadgeEmoji
          ? " " + user.equippedBadgeEmoji
          : "";

      name.textContent =
        (user.isModerator ? "🛡️ " : "") +
        rankPrefix +
        user.handle +
        equippedStr;

      name.style.color = user.color;

      name.addEventListener("click", () => {
        openUserProfile(user.handle);
      });

      const scovilleLabel =
        document.createElement("span");

      scovilleLabel.className =
        "scho-label";

      scovilleLabel.textContent =
        (user.scho || 0).toLocaleString() +
        " Scoville";

      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(scovilleLabel);

      const canModerate =
        myIsModerator &&
        user.handle !== myHandle;

      if (canModerate) {
        const modToggleBtn =
          document.createElement("button");

        modToggleBtn.className =
          "mod-delete-btn";

        modToggleBtn.textContent = "🛡️";

        modToggleBtn.title =
          "Moderate " + user.handle;

        row.appendChild(modToggleBtn);

        const panel =
          buildModPanel(user.handle);

        panel.classList.add("hidden");

        li.appendChild(row);
        li.appendChild(panel);

        modToggleBtn.addEventListener(
          "click",
          () => {
            buzz();
            panel.classList.toggle("hidden");
          }
        );
      } else {
        li.appendChild(row);
      }

      usersList.appendChild(li);
    });
  });

  function buildModPanel(targetHandle) {
    const panel =
      document.createElement("div");

    panel.className = "mod-panel";

    const title =
      document.createElement("p");

    title.className =
      "mod-panel-title";

    title.textContent =
      "Moderate " + targetHandle;

    panel.appendChild(title);

    const kickBtn =
      document.createElement("button");

    kickBtn.className =
      "mod-btn mod-kick-btn";

    kickBtn.textContent = "🚪 Kick";

   kickBtn.addEventListener("click", () => {
      buzz();
      if (
        confirm(
          "Kick " + targetHandle + "?"
        )
      ) {
        socket.emit("moderatorKick", {
          targetHandle,
        });
      }
    });

    panel.appendChild(kickBtn);

    const durations = [
      {
        label: "Ban 1 Hour",
        value: "1h",
      },
      {
        label: "Ban 1 Day",
        value: "1d",
      },
      {
        label: "Ban 1 Week",
        value: "1w",
      },
      {
        label: "Ban Permanently",
        value: "perm",
      },
    ];

    durations.forEach((d) => {
      const banBtn =
        document.createElement("button");

      banBtn.className =
        "mod-btn mod-ban-btn";

      banBtn.textContent =
        "⛔ " + d.label;

     banBtn.addEventListener("click", () => {
        buzz();
        const reason =
          prompt(
            "Reason for banning " +
              targetHandle +
              " (optional):"
          ) || "";

        if (
          confirm(
            "Confirm " +
              d.label +
              " for " +
              targetHandle +
              "?"
          )
        ) {
          socket.emit("moderatorBan", {
            targetHandle,
            duration: d.value,
            reason,
          });
        }
      });

      panel.appendChild(banBtn);
    });

    return panel;
  }

  sendBtn.addEventListener("click", () => {
    buzz();
    sendMessage();
  });

  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  });

  function sendMessage() {
    const text = messageInput.value.trim();

    if (text === "") return;

    socket.emit("chatMessage", {
      handle: myHandle,
      color: myColor,
      text: text,
    });

    playSound(sendSound);

    messageInput.value = "";

    stopTypingNow();
  }

  // ---- Typing indicator ----

  let typingTimeout = null;
  let isCurrentlyTyping = false;

  messageInput.addEventListener("input", () => {
    if (!isCurrentlyTyping) {
      isCurrentlyTyping = true;

      socket.emit("typing", {
        handle: myHandle,
      });
    }

    clearTimeout(typingTimeout);

    typingTimeout = setTimeout(
      stopTypingNow,
      2000
    );
  });

  function stopTypingNow() {
    if (isCurrentlyTyping) {
      isCurrentlyTyping = false;

      socket.emit("stopTyping", {
        handle: myHandle,
      });
    }

    clearTimeout(typingTimeout);
  }

  // ---- Typing indicator incoming ----

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
    const names =
      Array.from(typingUsers);

    if (names.length === 0) {
      typingIndicator.textContent = "";
    } else if (names.length === 1) {
      typingIndicator.textContent =
        names[0] + " is typing...";
    } else if (names.length === 2) {
      typingIndicator.textContent =
        names[0] +
        " and " +
        names[1] +
        " are typing...";
    } else {
      typingIndicator.textContent =
        "Several people are typing...";
    }
  }

  // ---- Reactions & heat rating ----

  function attachLongPress(
    triggerEl,
    panelEl
  ) {
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

    triggerEl.addEventListener(
      "mousedown",
      start
    );

    triggerEl.addEventListener(
      "mouseup",
      cancel
    );

    triggerEl.addEventListener(
      "mouseleave",
      cancel
    );

    triggerEl.addEventListener(
      "touchstart",
      start,
      { passive: true }
    );

    triggerEl.addEventListener(
      "touchend",
      cancel
    );

    triggerEl.addEventListener(
      "touchmove",
      cancel
    );
  }

  function spawnFloatingReaction(
    msgEl,
    emoji
  ) {
    const float =
      document.createElement("span");

    float.className =
      "floating-reaction";

    float.textContent = emoji;

    float.style.left =
      20 + Math.random() * 60 + "%";

    msgEl.appendChild(float);

    float.addEventListener(
      "animationend",
      () => float.remove()
    );
  }

  function buildReactionBar(
    messageId,
    counts,
    heatRating
  ) {
    const bar =
      document.createElement("div");

    bar.className =
      "reaction-bar hidden";

    const pillsWrap =
      document.createElement("span");

    pillsWrap.className =
      "reaction-pills";

    bar.appendChild(pillsWrap);

    const addBtn =
      document.createElement("button");

    addBtn.className =
      "reaction-add-btn";

    addBtn.textContent = "+";

    bar.appendChild(addBtn);

    const picker =
      document.createElement("div");

    picker.className =
      "reaction-picker hidden";

    REACTIONS.forEach((r) => {
      const pickBtn =
        document.createElement("button");

      pickBtn.className =
        "reaction-pick-btn";

      pickBtn.dataset.reaction =
        r.key;

      pickBtn.textContent =
        r.emoji;

      pickBtn.addEventListener(
        "click",
        () => {
          buzz();

          socket.emit("reaction", {
            messageId: messageId,
            handle: myHandle,
            reactionType: r.key,
          });

          picker.classList.add("hidden");
        }
      );

      picker.appendChild(pickBtn);
    });

    bar.appendChild(picker);

    addBtn.addEventListener(
      "click",
      () => {
        buzz();
        picker.classList.toggle("hidden");
      }
    );

    const heatBadge =
      document.createElement("span");

    heatBadge.className =
      "heat-badge";

    heatBadge.textContent =
      heatRating
        ? "🔥 " + heatRating
        : "";

    bar.appendChild(heatBadge);

    if (myIsModerator) {
      const delBtn =
        document.createElement("button");

      delBtn.className =
        "mod-delete-btn";

      delBtn.textContent = "🗑️";

      delBtn.title =
        "Delete message";

      delBtn.addEventListener(
        "click",
        () => {
          buzz();
          if (
            confirm(
              "Delete this message?"
            )
          ) {
            socket.emit(
              "moderatorDeleteMessage",
              { messageId }
            );
          }
        }
      );

      bar.appendChild(delBtn);
    }

    renderPills(
      pillsWrap,
      counts
    );

    return bar;
  }

  function renderPills(
    pillsWrap,
    counts
  ) {
    pillsWrap.innerHTML = "";

    REACTIONS.forEach((r) => {
      const count =
        counts[r.key] || 0;

      if (count > 0) {
        const pill =
          document.createElement("span");

        pill.className =
          "reaction-pill";

        pill.textContent =
          r.emoji + " " + count;

        pillsWrap.appendChild(pill);
      }
    });
  }

  socket.on(
    "reactionUpdate",
    ({
      messageId,
      counts,
      heatRating,
    }) => {
      const msgEl =
        messagesBox.querySelector(
          '[data-message-id="' +
            messageId +
            '"]'
        );

      if (!msgEl) return;

      const prevCounts =
        lastKnownCounts[
          messageId
        ] || {
          chilli: 0,
          heart: 0,
          laugh: 0,
          down: 0,
        };

      REACTIONS.forEach((r) => {
        if (
          (counts[r.key] || 0) >
          (prevCounts[r.key] || 0)
        ) {
          spawnFloatingReaction(
            msgEl,
            r.emoji
          );
        }
      });

      lastKnownCounts[messageId] =
        counts;

      const pillsWrap =
        msgEl.querySelector(
          ".reaction-pills"
        );

      if (pillsWrap) {
        renderPills(
          pillsWrap,
          counts
        );
      }

      const heatBadge =
        msgEl.querySelector(
          ".heat-badge"
        );

      if (heatBadge) {
        heatBadge.textContent =
          heatRating
            ? "🔥 " + heatRating
            : "";
      }
    }
  );

  // ---- Incoming chat messages ----

  socket.on(
    "chatMessage",
    (data) => {
      const msgEl =
        document.createElement("div");

      msgEl.className =
        "chat-message";

      msgEl.dataset.messageId =
        data.id;

      const textLine =
        document.createElement("p");

      const handleSpan =
        document.createElement("span");

      handleSpan.className =
        "msg-handle clickable-handle";

      handleSpan.textContent =
        data.handle + ":";

      handleSpan.style.color =
        data.color;

      handleSpan.addEventListener(
        "click",
        () => {
          openUserProfile(
            data.handle
          );
        }
      );

      const textSpan =
        document.createElement("span");

      textSpan.textContent =
        " " + data.text;

      const timeSpan =
        document.createElement("span");

      timeSpan.className =
        "msg-timestamp";

      timeSpan.textContent =
        formatTimestamp(
          data.createdAt
        );

      textLine.appendChild(
        handleSpan
      );

      textLine.appendChild(
        textSpan
      );

      textLine.appendChild(
        timeSpan
      );

      const counts =
        data.counts || {
          chilli: 0,
          heart: 0,
          laugh: 0,
          down: 0,
        };

      const reactionBar =
        buildReactionBar(
          data.id,
          counts,
          data.heatRating || null
        );

      lastKnownCounts[data.id] =
        counts;

      msgEl.appendChild(
        textLine
      );

      msgEl.appendChild(
        reactionBar
      );

      messagesBox.appendChild(
        msgEl
      );

      attachLongPress(
        textLine,
        reactionBar
      );

      messagesBox.scrollTop =
        messagesBox.scrollHeight;

      const isOwnMessage =
        data.handle === myHandle;

      if (
        !isOwnMessage &&
        !isLoadingHistory
      ) {
        playSound(notifySound);
      }
    }
  );

  function startIdleWatcher() {
    [
      "mousemove",
      "keydown",
      "click",
      "touchstart",
      "scroll",
    ].forEach((evt) => {
      document.addEventListener(
        evt,
        registerActivity
      );
    });

    setInterval(
      checkIdleStatus,
      10000
    );
  }

  function registerActivity() {
    lastActivityTime =
      Date.now();

    if (isIdle) {
      isIdle = false;

      socket.emit(
        "statusChange",
        "active"
      );
    }
  }

  function checkIdleStatus() {
    const elapsed =
      Date.now() -
      lastActivityTime;

    if (
      elapsed >=
        IDLE_LIMIT_MS &&
      !isIdle
    ) {
      isIdle = true;

      socket.emit(
        "statusChange",
        "idle"
      );
    }
  }

  // ---- Connection resilience ----

  socket.on("disconnect", () => {
    connectionBanner.classList.remove(
      "hidden"
    );
  });

  socket.on("connect", () => {
    connectionBanner.classList.add(
      "hidden"
    );

    if (hasJoinedOnce) {
      messagesBox.innerHTML = "";

      const myDeviceToken =
        safeStorage.getItem(
          STORAGE_TOKEN_KEY
        );

      socket.emit("join", {
        handle: myHandle,
        color: myColor,
        deviceToken: myDeviceToken,
      });
    }
  });

  // ---- Voice clips ----

  const MAX_RECORD_MS = 10000;

  let mediaRecorder = null;
  let audioChunks = [];
  let recordStartTime = 0;
  let recordTimerInterval = null;
  let wasCancelled = false;
  let activeMicSource = null;

  function isRecordingSupported() {
    return !!(
      navigator.mediaDevices &&
      window.MediaRecorder
    );
  }

  function isIOSDevice() {
    const ua =
      navigator.userAgent;

    return /iPad|iPhone|iPod/.test(
      ua
    );
  }

  function pickMimeType() {
    if (isIOSDevice()) {
      return (
        window.MediaRecorder &&
        MediaRecorder.isTypeSupported &&
        MediaRecorder.isTypeSupported(
          "audio/mp4"
        )
      )
        ? "audio/mp4"
        : "";
    }

    return (
      window.MediaRecorder &&
      MediaRecorder.isTypeSupported &&
      MediaRecorder.isTypeSupported(
        "audio/webm;codecs=opus"
      )
    )
      ? "audio/webm;codecs=opus"
      : "";
  }

 async function startRecording(source) {
    activeMicSource = source || "mic";

    if (!isRecordingSupported()) {
      alert(
        "Voice recording isn't supported in this browser."
      );

      return;
    }

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia(
          { audio: true }
        );

      audioChunks = [];
      wasCancelled = false;

      const chosenMimeType =
        pickMimeType();

      mediaRecorder =
        chosenMimeType
          ? new MediaRecorder(
              stream,
              {
                mimeType:
                  chosenMimeType,
              }
            )
          : new MediaRecorder(
              stream
            );

      mediaRecorder.ondataavailable =
        (e) => {
          if (e.data.size > 0) {
            audioChunks.push(
              e.data
            );
          }
        };

   mediaRecorder.onstop = () => {
        stream
          .getTracks()
          .forEach((track) =>
            track.stop()
          );

        clearInterval(
          recordTimerInterval
        );

        recordingOverlay.classList.add(
          "hidden"
        );

       micBtn.classList.remove(
          "recording"
        );

        if (wasCancelled) return;

        const durationMs =
          Date.now() -
          recordStartTime;

        if (durationMs < 300) {
          return;
        }

        const rawType =
          mediaRecorder.mimeType.split(
            ";"
          )[0] ||
          "audio/webm";

        const audioBlob =
          new Blob(
            audioChunks,
            {
              type: rawType,
            }
          );

        console.log(
          "Recorded clip — type:",
          rawType,
          "| chunks:",
          audioChunks.length,
          "| blob size:",
          audioBlob.size,
          "bytes"
        );

        const MIN_VALID_BLOB_BYTES = 500;

        if (audioBlob.size < MIN_VALID_BLOB_BYTES) {
          console.warn(
            "Recording came back empty (known Safari MediaRecorder bug) — not sending."
          );

          showSystemMessage(
            "⚠️ That recording didn't capture any audio (a known Safari issue) — please try again."
          );

          return;
        }

        const sendClip = (finalBlob) => {
          
          const reader =
            new FileReader();

          reader.onloadend = () => {
            const base64Audio =
              reader.result;

            socket.emit(
              "voiceClip",
              {
                handle: myHandle,
                color: myColor,
                audioData:
                  base64Audio,
                durationMs:
                  Math.min(
                    durationMs,
                    MAX_RECORD_MS
                  ),
              }
            );
          };

          reader.readAsDataURL(
            finalBlob
          );
        };
if (
          rawType.includes("webm") &&
          window.ysFixWebmDuration
        ) {
          console.log(
            "Running ysFixWebmDuration..."
          );

          ysFixWebmDuration(
            audioBlob,
            durationMs,
            { logger: false }
          )
            .then((fixedBlob) => {
              console.log(
                "ysFixWebmDuration succeeded — fixed size:",
                fixedBlob.size,
                "bytes"
              );
              sendClip(fixedBlob);
            })
            .catch((err) => {
              console.error(
                "ysFixWebmDuration FAILED, sending unfixed:",
                err
              );
              sendClip(audioBlob);
            });
        } else if (rawType.includes("webm")) {
          console.warn(
            "ysFixWebmDuration not available — window.ysFixWebmDuration is",
            window.ysFixWebmDuration
          );
          sendClip(audioBlob);
        } else {
          sendClip(audioBlob);
        }
      };
mediaRecorder.start(250);

    recordStartTime =
        Date.now();

      micBtn.classList.add(
        "recording"
      );

      recordingOverlay.classList.remove(
        "hidden"
      );

      updateRecordingTimer();

      playSound(micSound);

      buzz(40);

      recordTimerInterval =
        setInterval(
          updateRecordingTimer,
          200
        );
    } catch (err) {
      console.error(
        "Mic access error:",
        err
      );

      alert(
        "Couldn't access your microphone. Please check permissions."
      );
    }
  }

  function updateRecordingTimer() {
    const elapsed =
      Date.now() -
      recordStartTime;

    const seconds =
      Math.floor(
        elapsed / 1000
      );

    const tenths =
      Math.floor(
        (elapsed % 1000) /
          100
      );

    recordingTimer.textContent =
      seconds +
      "." +
      tenths +
      "s / 10.0s";

    if (
      elapsed >=
      MAX_RECORD_MS
    ) {
      stopRecording(false);
    }
  }

  function stopRecording(
    cancelled
  ) {
    if (
      !mediaRecorder ||
      mediaRecorder.state ===
        "inactive"
    ) {
      return;
    }

    wasCancelled =
      cancelled;

    mediaRecorder.stop();

    playSound(endSound);

    buzz(20);
  }

 micBtn.addEventListener(
    "mousedown",
    () => startRecording("mic")
  );

  micBtn.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      startRecording("mic");
    }
  );

  micBtn.addEventListener(
    "mouseup",
    () => stopRecording(false)
  );

  micBtn.addEventListener(
    "mouseleave",
    () => {
      if (
        mediaRecorder &&
        mediaRecorder.state ===
          "recording"
      ) {
        stopRecording(false);
      }
    }
  );

  micBtn.addEventListener(
    "touchend",
    () => stopRecording(false)
  );
cancelRecordingBtn.addEventListener(
    "click",
    () => stopRecording(true)
  );

  socket.on(
    "voiceClip",
    (data) => {
      const msgEl =
        document.createElement("div");

      msgEl.className =
        "voice-message";

      msgEl.dataset.clipId =
        data.id;

      const playBtn =
        document.createElement("button");

      playBtn.className =
        "voice-play-btn";

      playBtn.textContent = "▶";

      const audio =
        new Audio(
          dataUrlToBlobUrl(data.audioData)
        );

      let isPlaying = false;

      audio.addEventListener(
        "error",
        () => {
          const err = audio.error;

          console.error(
            "Voice clip error — code:",
            err ? err.code : "none",
            "| message:",
            err ? err.message : "none",
            "| clip id:",
            data.id,
            "| src length:",
            data.audioData
              ? data.audioData.length
              : "none",
            "| src prefix:",
            data.audioData
              ? data.audioData.slice(0, 30)
              : "none"
          );

          isPlaying = false;
          playBtn.textContent = "▶";
        }
      );

     playBtn.addEventListener(
        "click",
        () => {
          if (isPlaying) {
            audio.pause();
          } else {
            playSound(
              playClipSound
            );

            audio
              .play()
              .catch((err) => {
                console.error(
                  "Voice clip playback failed:",
                  err
                );

                isPlaying = false;
                playBtn.textContent = "▶";

                showSystemMessage(
                  "⚠️ Couldn't play that voice clip in this browser."
                );
              });
          }
        }
      );

      audio.addEventListener(
        "play",
        () => {
          isPlaying = true;
          playBtn.textContent =
            "⏸";
        }
      );

     audio.addEventListener(
        "ended",
        () => {
          isPlaying = false;
          playBtn.textContent =
            "▶";

          playSound(voiceEndSound);
        }
      );

      audio.addEventListener(
        "ended",
        () => {
          isPlaying = false;
          playBtn.textContent =
            "▶";

          playSound(endSound);
        }
      );

      const meta =
        document.createElement("div");

      meta.className =
        "voice-meta";

      const handleLine =
        document.createElement("span");

      handleLine.className =
        "clickable-handle";

      handleLine.textContent =
        data.handle;

      handleLine.style.color =
        data.color;

      handleLine.style.fontWeight =
        "bold";

      handleLine.addEventListener(
        "click",
        () => {
          openUserProfile(
            data.handle
          );
        }
      );

      const durationLine =
        document.createElement("span");

      durationLine.textContent =
        (
          data.durationMs /
          1000
        ).toFixed(1) +
        "s voice clip";

      durationLine.style.color =
        "#1f7a0d";

      const timeLine =
        document.createElement("span");

      timeLine.className =
        "msg-timestamp";

      timeLine.textContent =
        formatTimestamp(
          data.createdAt
        );

      meta.appendChild(
        handleLine
      );

      meta.appendChild(
        durationLine
      );

      meta.appendChild(
        timeLine
      );

      msgEl.appendChild(
        playBtn
      );

      msgEl.appendChild(
        meta
      );

      if (myIsModerator) {
        const delBtn =
          document.createElement(
            "button"
          );

        delBtn.className =
          "mod-delete-btn";

        delBtn.textContent =
          "🗑️";

        delBtn.title =
          "Delete voice clip";

        delBtn.addEventListener(
          "click",
          () => {
            buzz();
            if (
              confirm(
                "Delete this voice clip?"
              )
            ) {
              socket.emit(
                "moderatorDeleteVoiceClip",
                {
                  clipId: data.id,
                }
              );
            }
          }
        );

        msgEl.appendChild(
          delBtn
        );
      }

      messagesBox.appendChild(
        msgEl
      );

      messagesBox.scrollTop =
        messagesBox.scrollHeight;

      if (
        data.handle !==
          myHandle &&
        !isLoadingHistory
      ) {
        playSound(
          notifySound
        );
      }
    }
  );

  // ---- Ephemeral photos ----

  const MAX_PHOTO_DIMENSION = 800;
  const MAX_PHOTO_BASE64_LENGTH =
    1.1 * 1024 * 1024;

  const PHOTO_VIEW_SECONDS = 10;

  photoBtn.addEventListener(
    "click",
    () => {
      buzz();
      playSound(btnfxSound);
      photoFileInput.click();
    }
  );

  photoFileInput.addEventListener(
    "change",
    (e) => {
      const file =
        e.target.files[0];

      if (!file) return;

      photoFileInput.value = "";

      compressAndSendPhoto(file);
    }
  );

  function compressAndSendPhoto(
    file
  ) {
    const reader =
      new FileReader();

    reader.onload = (e) => {
      const img =
        new Image();

      img.onload = () => {
        let {
          width,
          height,
        } = img;

        if (
          width > height &&
          width >
            MAX_PHOTO_DIMENSION
        ) {
          height = Math.round(
            (height *
              MAX_PHOTO_DIMENSION) /
              width
          );

          width =
            MAX_PHOTO_DIMENSION;
        } else if (
          height >
          MAX_PHOTO_DIMENSION
        ) {
          width = Math.round(
            (width *
              MAX_PHOTO_DIMENSION) /
              height
          );

          height =
            MAX_PHOTO_DIMENSION;
        }

        const canvas =
          document.createElement(
            "canvas"
          );

        canvas.width = width;
        canvas.height = height;

        const ctx =
          canvas.getContext(
            "2d"
          );

        ctx.drawImage(
          img,
          0,
          0,
          width,
          height
        );

        tryCompress(
          canvas,
          0.7
        );
      };

      img.onerror = () => {
        alert(
          "Couldn't read that image file."
        );
      };

      img.src =
        e.target.result;
    };

    reader.onerror = () => {
      alert(
        "Couldn't read that image file."
      );
    };

    reader.readAsDataURL(file);
  }

  function tryCompress(
    canvas,
    quality
  ) {
    const dataUrl =
      canvas.toDataURL(
        "image/jpeg",
        quality
      );

    if (
      dataUrl.length >
        MAX_PHOTO_BASE64_LENGTH &&
      quality > 0.3
    ) {
      tryCompress(
        canvas,
        quality - 0.15
      );

      return;
    }

    if (
      dataUrl.length >
      MAX_PHOTO_BASE64_LENGTH
    ) {
      alert(
        "That photo is too large even after compression. Try a smaller image."
      );

      return;
    }

    socket.emit(
      "photoUpload",
      {
        handle: myHandle,
        color: myColor,
        imageData: dataUrl,
      }
    );
  }

  socket.on(
    "photoNew",
    (data) => {
      const msgEl =
        document.createElement("div");

      msgEl.className =
        "photo-thumb";

      msgEl.dataset.photoId =
        data.id;

      if (
        data.alreadyOpened &&
        !data.isOwn
      ) {
        renderExpiredThumb(
          msgEl,
          data.handle,
          data.color
        );
      } else {
        renderActiveThumb(
          msgEl,
          data.handle,
          data.color,
          data.id
        );
      }

      messagesBox.appendChild(
        msgEl
      );

      messagesBox.scrollTop =
        messagesBox.scrollHeight;

      if (
        data.handle !==
          myHandle &&
        !isLoadingHistory
      ) {
        playSound(
          notifySound
        );
      }
    }
  );

  function renderActiveThumb(
    msgEl,
    handle,
    color,
    photoId
  ) {
    msgEl.innerHTML = "";

    msgEl.classList.remove(
      "expired"
    );

    const icon =
      document.createElement(
        "span"
      );

    icon.className =
      "photo-thumb-icon";

    icon.textContent = "📷";

    const meta =
      document.createElement("div");

    meta.className =
      "photo-thumb-meta";

    const handleLine =
      document.createElement(
        "span"
      );

    handleLine.className =
      "photo-thumb-handle clickable-handle";

    handleLine.textContent =
      handle;

    handleLine.style.color =
      color;

    handleLine.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        openUserProfile(handle);
      }
    );

    const hint =
      document.createElement(
        "span"
      );

    hint.className =
      "photo-thumb-hint";

    hint.textContent =
      "View once photo — tap to reveal (10s)";

    meta.appendChild(
      handleLine
    );

    meta.appendChild(
      hint
    );

    msgEl.appendChild(
      icon
    );

    msgEl.appendChild(
      meta
    );

    if (myIsModerator) {
      const delBtn =
        document.createElement(
          "button"
        );

      delBtn.className =
        "mod-delete-btn";

      delBtn.textContent =
        "🗑️";

      delBtn.title =
        "Delete photo";

      delBtn.addEventListener(
        "click",
        (e) => {
          buzz();
          e.stopPropagation();

          if (
            confirm(
              "Delete this photo?"
            )
          ) {
            socket.emit(
              "moderatorDeletePhoto",
              {
                photoId,
              }
            );
          }
        }
      );

      msgEl.appendChild(
        delBtn
      );
    }

    msgEl.onclick = () => {
      socket.emit(
        "photoOpen",
        {
          photoId,
          viewerHandle:
            myHandle,
        }
      );
    };
  }

  function renderExpiredThumb(
    msgEl,
    handle,
    color
  ) {
    msgEl.innerHTML = "";

    msgEl.classList.add(
      "expired"
    );

    msgEl.onclick = null;

    const icon =
      document.createElement(
        "span"
      );

    icon.className =
      "photo-thumb-icon";

    icon.textContent = "📷";

    const meta =
      document.createElement(
        "div"
      );

    meta.className =
      "photo-thumb-meta";

    const handleLine =
      document.createElement(
        "span"
      );

    handleLine.className =
      "photo-thumb-handle";

    handleLine.textContent =
      handle;

    handleLine.style.color =
      color;

    const hint =
      document.createElement(
        "span"
      );

    hint.className =
      "photo-thumb-hint";

    hint.textContent =
      "Photo expired";

    meta.appendChild(
      handleLine
    );

    meta.appendChild(
      hint
    );

    msgEl.appendChild(
      icon
    );

    msgEl.appendChild(
      meta
    );
  }

  let photoCountdownInterval =
    null;

  socket.on(
    "photoResult",
    ({
      photoId,
      imageData,
      expired,
    }) => {
      const thumbEl =
        messagesBox.querySelector(
          '[data-photo-id="' +
            photoId +
            '"]'
        );

      if (
        expired ||
        !imageData
      ) {
        if (thumbEl) {
          const handleColor =
            thumbEl.querySelector(
              ".photo-thumb-handle"
            );

          renderExpiredThumb(
            thumbEl,
            handleColor
              ? handleColor.textContent
              : "",
            ""
          );
        }

        return;
      }

      openPhotoViewer(
        imageData,
        () => {
          if (thumbEl) {
            const handleColor =
              thumbEl.querySelector(
                ".photo-thumb-handle"
              );

            const handleText =
              handleColor
                ? handleColor.textContent
                : "";

            if (
              handleText !==
              myHandle
            ) {
              renderExpiredThumb(
                thumbEl,
                handleText,
                ""
              );
            }
          }
        }
      );
    }
  );

  function openPhotoViewer(
    imageData,
    onExpireCallback
  ) {
    photoViewerImg.src =
      imageData;

    photoViewerOverlay.classList.remove(
      "hidden"
    );

    let secondsLeft =
      PHOTO_VIEW_SECONDS;

    photoCountdownText.textContent =
      secondsLeft + "s";

    photoCountdownFill.style.width =
      "100%";

    clearInterval(
      photoCountdownInterval
    );

    photoCountdownInterval =
      setInterval(() => {
        secondsLeft -= 1;

        photoCountdownText.textContent =
          Math.max(
            secondsLeft,
            0
          ) + "s";

        photoCountdownFill.style.width =
          Math.max(
            (secondsLeft /
              PHOTO_VIEW_SECONDS) *
              100,
            0
          ) + "%";

        if (
          secondsLeft <= 0
        ) {
          clearInterval(
            photoCountdownInterval
          );

          closePhotoViewer();

          if (
            onExpireCallback
          ) {
            onExpireCallback();
          }
        }
      }, 1000);
  }

  function closePhotoViewer() {
    photoViewerOverlay.classList.add(
      "hidden"
    );

    photoViewerImg.src = "";

    clearInterval(
      photoCountdownInterval
    );
  }

  photoViewerOverlay.addEventListener(
    "click",
    () => {
      buzz();
      closePhotoViewer();
    }
  );

  checkReturningUser();
});

