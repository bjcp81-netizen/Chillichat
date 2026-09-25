document.addEventListener("DOMContentLoaded", function () {
  console.log("ChilliChat app.js loaded");

   // Show the iOS "Add to Home Screen" banner only on iPhone/iPad Safari,
  // only if it isn't already installed, and not if the person dismissed it before.
  
  const IDLE_LIMIT_MS = 5 * 60 * 1000;
  const STORAGE_HANDLE_KEY = "chillichat_handle";
  const STORAGE_COLOR_KEY = "chillichat_color";
  const STORAGE_TOKEN_KEY = "chillichat_device_token";
  const WHEEL_ITEM_HEIGHT = 32;

  const REACTIONS = [
    { key: "chilli", emoji: "🌶️", label: "Chilli" },
    { key: "heart", emoji: "❤️", label: "Loveheart" },
    { key: "laugh", emoji: "😂", label: "Laugh" },
    { key: "down", emoji: "👎", label: "Thumbs down" },
    { key: "poo", emoji: "💩", label: "Jobbies" },
  ];

  const lastKnownCounts = {};

  // Profile photos are cached client-side by handle so live messages do not
  // need to resend the same image on every Socket.IO event.
  const profilePhotoByHandle = Object.create(null);

  function profileInitial(handle) {
    const chars = Array.from(String(handle || "?").trim());
    return (chars[0] || "?").toUpperCase();
  }

  function rememberProfilePhoto(handle, profilePhoto) {
    if (!handle) return;
    profilePhotoByHandle[handle] = profilePhoto || "";
  }

  function applyProfileAvatar(el, handle, profilePhoto) {
    if (!el) return;

    const safeHandle = String(handle || "");
    const photo =
      profilePhoto !== undefined
        ? profilePhoto
        : profilePhotoByHandle[safeHandle] || "";

    const isThumbnail = el.classList.contains("profile-avatar-thumb");

    el.dataset.profileAvatarHandle = safeHandle;

    if (photo) {
      el.classList.add("has-photo");
      el.classList.remove("avatar-empty");
      el.style.backgroundImage = 'url("' + photo + '")';
      el.textContent = "";
    } else {
      el.classList.remove("has-photo");
      el.style.backgroundImage = "";

      if (isThumbnail) {
        // Chat/user-list thumbnails are photo-only. The handle itself already
        // opens the profile, so do not create a second letter-in-a-circle button.
        el.classList.add("avatar-empty");
        el.textContent = "";
      } else {
        // The large avatar inside the profile may still use the user's initial
        // when they have not chosen a profile picture.
        el.classList.remove("avatar-empty");
        el.textContent = profileInitial(safeHandle);
      }
    }
  }

  function createProfileAvatar(handle, profilePhoto, extraClass) {
    // Thumbnails are decorative only. The coloured handle remains the single
    // clear click target for opening profiles. Keeping an empty span lets a
    // newly uploaded photo appear live without rebuilding every message row.
    const el = document.createElement("span");

    el.className =
      "profile-avatar-thumb" +
      (extraClass ? " " + extraClass : "");

    el.setAttribute("aria-hidden", "true");
    applyProfileAvatar(el, handle, profilePhoto);

    return el;
  }

  function refreshProfileAvatars(handle, profilePhoto) {
    rememberProfilePhoto(handle, profilePhoto);

    document
      .querySelectorAll("[data-profile-avatar-handle]")
      .forEach((el) => {
        if (el.dataset.profileAvatarHandle === String(handle || "")) {
          applyProfileAvatar(el, handle, profilePhoto);
        }
      });
  }

  const BADGE_DEFS_CLIENT = {
    fresh_face: { emoji: "🌱", name: "Fresh Face", description: "Create your ChilliChat identity." },
    ice_breaker: { emoji: "💬", name: "Ice Breaker", description: "Send your first text message." },
    first_burn: { emoji: "🌶️", name: "First Burn", description: "Receive your first reaction." },
    well_liked: { emoji: "❤️", name: "Well Liked", description: "Receive 25 Loveheart reactions." },
    crowd_pleaser: { emoji: "😂", name: "Crowd Pleaser", description: "Receive 50 Laugh reactions." },
    spice_merchant: { emoji: "🌶️", name: "Spice Merchant", description: "Receive 100 Chilli reactions." },
    friendly_flame: { emoji: "🤝", name: "Friendly Flame", description: "Receive 100 positive reactions." },
    top_banter: { emoji: "💡", name: "Top Banter", description: "Receive 500 reactions of any kind." },
    fire_extinguisher: { emoji: "🧯", name: "Fire Extinguisher", description: "Receive 100 Thumbs Down reactions." },
    melted_keyboard: { emoji: "🫠", name: "Melted Keyboard", description: "Send 1,000 text messages." },
    meme_machine: { emoji: "🤣", name: "Meme Machine", description: "Receive 250 Laugh reactions." },
    heartbreaker: { emoji: "❤️", name: "Heartbreaker", description: "Receive 500 Loveheart reactions." },
    spice_lord: { emoji: "🌶️", name: "Spice Lord", description: "Reach 1,000,000 Scoville." },
    pepper_royalty: { emoji: "👑", name: "Pepper Royalty", description: "Reach 2,200,000 Scoville." },
    beta_tester: { emoji: "🚀", name: "Beta Tester", description: "Be part of ChilliChat's early testing era." },
    lightning_fingers: { emoji: "⚡", name: "Lightning Fingers", description: "Send 100 messages without going idle." },
    streak_7: { emoji: "🔥", name: "7-Day Streak", description: "Keep a 7-day ChilliChat activity streak." },
    streak_30: { emoji: "🌋", name: "30-Day Streak", description: "Keep a 30-day ChilliChat activity streak." },
    streak_100: { emoji: "☄️", name: "100-Day Streak", description: "Keep a 100-day ChilliChat activity streak." },

    // Achievement Expansion Pack
    first_words: { emoji: "👋", name: "First Words", description: "Send 10 text messages." },
    chatty_bastard: { emoji: "🗣️", name: "Chatty Bastard", description: "Send 250 text messages." },
    professional_gobshite: { emoji: "📣", name: "Professional Gobshite", description: "Send 2,500 text messages." },
    veteran: { emoji: "🎖️", name: "Veteran", description: "Send 5,000 text messages." },
    getting_spicy: { emoji: "🌶️", name: "Getting Spicy", description: "Receive 25 Chilli reactions." },
    human_hot_sauce: { emoji: "🔥", name: "Human Hot Sauce", description: "Receive 500 Chilli reactions." },
    love_machine: { emoji: "💘", name: "Love Machine", description: "Receive 100 Loveheart reactions." },
    heart_collector: { emoji: "💝", name: "Heart Collector", description: "Receive 1,000 Loveheart reactions." },
    comedy_gold: { emoji: "🥇", name: "Comedy Gold", description: "Receive 100 Laugh reactions." },
    class_clown: { emoji: "🤡", name: "Class Clown", description: "Receive 1,000 Laugh reactions." },
    jobbie_magnet: { emoji: "💩", name: "Jobbie Magnet", description: "Receive 25 Jobbies." },
    public_toilet: { emoji: "🚽", name: "Public Toilet", description: "Receive 100 Jobbies. Somehow this is an achievement." },
    controversial: { emoji: "⚠️", name: "Controversial", description: "Receive 50 Thumbs Down reactions." },
    good_egg: { emoji: "🥚", name: "Good Egg", description: "Receive 250 positive reactions." },
    full_spectrum: { emoji: "🌈", name: "Full Spectrum", description: "Receive at least one of all five reaction types." },
    sweet_and_sour: { emoji: "🌶️💩", name: "Sweet & Sour", description: "Receive 100 Chillis and 100 Jobbies." },
    match_lighter: { emoji: "🔥", name: "Match Lighter", description: "Have 25 reactions active across other users' content." },
    serial_reactor: { emoji: "🎯", name: "Serial Reactor", description: "Have 250 reactions active across other users' content." },
    shutterbug: { emoji: "📸", name: "Shutterbug", description: "Send 25 photos." },
    open_mic: { emoji: "🎙️", name: "Open Mic", description: "Send 25 voice clips after this achievement system is installed." },
    radio_chatter: { emoji: "📻", name: "Radio Chatter", description: "Send 250 voice clips after this achievement system is installed." },
    regular: { emoji: "📆", name: "Regular", description: "Post text messages on 30 different days." },
    still_burning: { emoji: "🔥", name: "Still Burning", description: "Reach a 14-day activity streak." },
    unstoppable: { emoji: "🌋", name: "Unstoppable", description: "Reach a 60-day activity streak." },
    high_roller: { emoji: "🎰", name: "High Roller", description: "Reach the Scoville Top 20." },
    podium_finish: { emoji: "🥉", name: "Podium Finish", description: "Reach the Scoville Top 3." },
    king_of_hill: { emoji: "👑", name: "King of the Hill", description: "Reach #1 on the Scoville leaderboard." },
    nuclear_take: { emoji: "☢️", name: "Nuclear Take", description: "Have one piece of content reach a Heat rating of 95 or more." },
    agent_of_chaos: { emoji: "🧨", name: "Agent of Chaos", description: "Get all five reaction types on the same piece of content." },

    // Achievement Expansion v2 — Legendary & Unhinged long-game badges
    terminally_online: { emoji: "🧠", name: "Terminally Online", rarity: "rare", description: "Send 10,000 text messages. The logout button is becoming concerned." },
    will_you_shut_up: { emoji: "📢", name: "Will You Shut The Fuck Up", rarity: "epic", description: "Send 25,000 text messages. An extraordinary commitment to not shutting up." },
    industrial_gobshite: { emoji: "🏭", name: "Industrial Gobshite", rarity: "unhinged", description: "Send 50,000 text messages. Gobshite production has reached industrial scale." },
    capsaicin_addict: { emoji: "🌶️", name: "Capsaicin Addict", rarity: "rare", description: "Receive 2,500 Chilli reactions." },
    walking_heartburn: { emoji: "🔥", name: "Walking Heartburn", rarity: "legendary", description: "Receive 10,000 Chilli reactions. Antacids sold separately." },
    dangerously_likeable: { emoji: "💖", name: "Dangerously Likeable", rarity: "legendary", description: "Receive 5,000 Loveheart reactions." },
    comedy_weapon: { emoji: "😂", name: "Comedy Weapon", rarity: "legendary", description: "Receive 5,000 Laugh reactions." },
    shit_magnet: { emoji: "💩", name: "Shit Magnet", rarity: "rare", description: "Receive 500 Jobbies. They have started following you home." },
    lord_of_bog: { emoji: "🚽", name: "Lord of the Bog", rarity: "epic", description: "Receive 2,500 Jobbies. The porcelain throne is yours." },
    beyond_saving: { emoji: "🧻", name: "Beyond Saving", rarity: "unhinged", description: "Receive 5,000 Jobbies. No amount of toilet roll can fix this." },
    public_enemy: { emoji: "🚨", name: "Public Enemy", rarity: "epic", description: "Receive 1,000 Thumbs Down reactions." },
    marmite: { emoji: "🥪", name: "Marmite", rarity: "epic", description: "Receive at least 1,000 positive and 1,000 negative reactions. Loved and hated in equal measure." },
    reaction_completionist: { emoji: "🌈", name: "Reaction Completionist", rarity: "legendary", description: "Receive at least 1,000 of every ChilliChat reaction type." },
    scoville_overlord: { emoji: "🌋", name: "Scoville Overlord", rarity: "legendary", description: "Reach 5,000,000 Scoville." },
    thermonuclear: { emoji: "☢️", name: "Thermonuclear", rarity: "unhinged", description: "Reach 10,000,000 Scoville. The scale has filed a complaint." },
    wont_shut_up_either: { emoji: "🎙️", name: "Won't Shut Up Either", rarity: "epic", description: "Send 1,000 voice clips after lifetime voice counting was introduced." },
    human_radio_station: { emoji: "📡", name: "Human Radio Station", rarity: "unhinged", description: "Send 5,000 voice clips after lifetime voice counting was introduced." },
    david_baileys_evil_twin: { emoji: "📸", name: "David Bailey's Evil Twin", rarity: "epic", description: "Send 1,000 disappearing photos." },
    furniture_now: { emoji: "🛋️", name: "Furniture Now", rarity: "rare", description: "Post text messages on 180 different days. You are part of the fixtures." },
    basically_lives_here: { emoji: "🏠", name: "Basically Lives Here", rarity: "legendary", description: "Post text messages on 365 different days." },
    send_help: { emoji: "🆘", name: "Send Help", rarity: "epic", description: "Reach a 180-day activity streak." },
    touch_grass_immediately: { emoji: "🌱", name: "Touch Grass Immediately", rarity: "unhinged", description: "Reach a 365-day activity streak. Somebody open a fucking window." },
    what_is_outside: { emoji: "🌳", name: "What Is Outside?", rarity: "unhinged", description: "Reach a 500-day activity streak. Outside remains unverified." },
    old_furniture: { emoji: "🪑", name: "Old Furniture", rarity: "rare", description: "Keep the same ChilliChat identity for one year." },
    ancient_relic: { emoji: "🦖", name: "Ancient Relic", rarity: "legendary", description: "Keep the same ChilliChat identity for two years." },
    reaction_chemist: { emoji: "🧪", name: "Reaction Chemist", rarity: "epic", description: "Have 5,000 reactions active across other users' content." },
    button_masher: { emoji: "🖱️", name: "Button Masher", rarity: "unhinged", description: "Have 10,000 reactions active across other users' content. Your mouse deserves compensation." },
    everybody_knows_this_bastard: { emoji: "🤝", name: "Everybody Knows This Bastard", rarity: "legendary", description: "React to content from 100 different ChilliChat handles." },
    comment_section_warlord: { emoji: "⚔️", name: "Comment Section Warlord", rarity: "epic", description: "Get 100 total reactions on one piece of content." },
    mutually_assured_destruction: { emoji: "💣", name: "Mutually Assured Destruction", rarity: "unhinged", description: "Get at least 25 of every reaction type on one piece of content." },
    chernobyl_take: { emoji: "☣️", name: "Chernobyl Take", rarity: "legendary", description: "Reach Heat 100 with at least 50 total reactions on one piece of content." },
    untouchable: { emoji: "👑", name: "Untouchable", rarity: "legendary", description: "Reach #1 on the Scoville leaderboard on 7 separate calendar days." },
    king_kong_of_chillichat: { emoji: "🦍", name: "King Kong of ChilliChat", rarity: "unhinged", description: "Reach #1 on the Scoville leaderboard on 30 separate calendar days." },
    reputation_funeral: { emoji: "🪦", name: "Reputation Funeral", rarity: "epic", description: "Fall to -1,000 Scoville or worse after reputation-history tracking begins." },
    somehow_still_here: { emoji: "🧟", name: "Somehow Still Here", rarity: "epic", description: "After reaching -1,000 Scoville or worse, claw your way back to zero or above." },
    keyboard_warranty_void: { emoji: "⌨️", name: "Keyboard Warranty Void", rarity: "legendary", description: "Send 1,000 text messages without going idle." },
    absolute_weapon: { emoji: "💀", name: "Absolute Weapon", rarity: "rare", description: "Unlock 40 achievements." },
    badge_goblin: { emoji: "🏅", name: "Badge Goblin", rarity: "epic", description: "Unlock 55 achievements. You are now checking this screen far too often." },
    achievement_dragon: { emoji: "🐉", name: "Achievement Dragon", rarity: "legendary", description: "Unlock 70 achievements and sit on the collection like treasure." },
    nothing_left_for_you: { emoji: "🌌", name: "There Is Nothing Left For You", rarity: "unhinged", description: "Unlock every non-collection achievement currently in ChilliChat. You absolute lunatic." },
  };

 const FONT_MAP = {
    default: "'Courier New', Courier, monospace",
    inter: "'Inter', sans-serif",
    atkinson: "'Atkinson Hyperlegible', sans-serif",
    noto: "'Noto Sans', sans-serif",
    roboto: "'Roboto', sans-serif",
        opensans: "'Open Sans', sans-serif",
    lato: "'Lato', sans-serif",
    montserrat: "'Montserrat', sans-serif",
    lexend: "'Lexend', sans-serif",
    ibmplex: "'IBM Plex Sans', sans-serif",
    firasans: "'Fira Sans', sans-serif",
    mulish: "'Mulish', sans-serif",
    figtree: "'Figtree', sans-serif",
    merriweather: "'Merriweather', serif",
    lora: "'Lora', serif",
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
    vt323: "'VT323', monospace",
    pressstart: "'Press Start 2P', monospace",
    sharetechmono: "'Share Tech Mono', monospace",
    pixelify: "'Pixelify Sans', sans-serif",
    silkscreen: "'Silkscreen', sans-serif",
    orbitron: "'Orbitron', sans-serif",
    audiowide: "'Audiowide', sans-serif",
    oxanium: "'Oxanium', sans-serif",
    chakrapetch: "'Chakra Petch', sans-serif",
    quantico: "'Quantico', sans-serif",
    russoone: "'Russo One', sans-serif",
    aldrich: "'Aldrich', sans-serif",
    electrolize: "'Electrolize', sans-serif",
    michroma: "'Michroma', sans-serif",
    geo: "'Geo', sans-serif",
    cascadiacode: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
    cascadiamono: "'Cascadia Mono', 'Cascadia Code', Consolas, monospace",
    consolasretro: "Consolas, 'Lucida Console', monospace",
    lucidaconsole: "'Lucida Console', Monaco, monospace",
    ibmplexmono: "'IBM Plex Mono', monospace",
    commodore64: "'C64 Pro Mono', 'Pet Me 64', 'Pixelify Sans', monospace",
    amstradcpc: "'Amstrad CPC464', 'CPC464', 'Silkscreen', monospace",
    ibmvga: "'Px437 IBM VGA8', 'IBM VGA 8x16', 'IBM Plex Mono', monospace",
    decvt100: "'VT323', 'IBM Plex Mono', monospace",
    zxspectrum: "'ZX Spectrum', 'Press Start 2P', monospace",
    bbcmicro: "'BBC Micro', 'Share Tech Mono', monospace",
    appleii: "'Apple II', 'Nova Mono', monospace",
    atari8bit: "'Atari Classic', 'Kode Mono', monospace",
    trs80: "'TRS-80', 'Anonymous Pro', monospace",
    spacemono: "'Space Mono', monospace",
  };

  const FONT_SIZE_MAP = {
    small: "13px",
    medium: "15px",
    large: "18px",
    xlarge: "22px",
  };

   let soundEnabled = true;
  let notificationsEnabled = false;

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
  };  (function maybeShowIosInstallBanner() {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone =
      window.navigator.standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;
    const dismissed = safeStorage.getItem("chillichat_ios_banner_dismissed") === "true";

    if (!isIos || isStandalone || dismissed) return;

    const banner = document.getElementById("ios-install-banner");
    if (!banner) return;

    banner.classList.remove("hidden");

    const dismissBtn = document.getElementById("ios-install-dismiss-btn");
    if (dismissBtn) {
      dismissBtn.addEventListener("click", () => {
        banner.classList.add("hidden");
        safeStorage.setItem("chillichat_ios_banner_dismissed", "true");
      });
    }
  })();

  function playSound(audioEl) {
    if (!soundEnabled || !audioEl) return;

    const sound = audioEl.cloneNode(true);
    sound.play().catch(() => {});
  }
  function spawnIconRipple(btn, evt) {
    try {
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ripple = document.createElement("span");

      ripple.className = "icon-ripple";
      ripple.style.width = size + "px";
      ripple.style.height = size + "px";

      let x = rect.width / 2 - size / 2;
      let y = rect.height / 2 - size / 2;

      if (evt && typeof evt.clientX === "number") {
        x = evt.clientX - rect.left - size / 2;
        y = evt.clientY - rect.top - size / 2;
      }
  function maybeNotify(title, body) {
    if (!notificationsEnabled) return;
    if (!document.hidden) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    try {
      const n = new Notification(title, {
        body: body,
        icon: "FieryChiliChatBadge.png",
      });

      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch (err) {
      console.error("Notification failed:", err);
    }
  }

  function requestNotificationPermission() {
    if (typeof Notification === "undefined") {
      showSystemMessage("⚠️ Notifications aren't supported in this browser.");
      notificationsToggle.checked = false;
      return;
    }

    Notification.requestPermission().then((permission) => {
      if (permission !== "granted") {
        showSystemMessage("⚠️ Notification permission was not granted.");
        notificationsToggle.checked = false;
        notificationsEnabled = false;
        safeStorage.setItem("chillichat_notifications", "false");
      }
    });
  }
      ripple.style.left = x + "px";
      ripple.style.top = y + "px";

      btn.appendChild(ripple);

      ripple.addEventListener("animationend", () => ripple.remove());
    } catch (err) {
      // Ripple is cosmetic only — never let it block the actual button action.
    }
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
  window.chilliSocket = socket;

  // When the tab/phone comes back from being hidden (locked screen,
  // app-switched-away, etc.), Socket.IO's own auto-reconnect can be slow
  // to notice. Forcing a check here speeds that up.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && socket.disconnected) {
      socket.connect();
    }
  });

  let myHandle = "";
  let myColor = "";
  let myIsModerator = false;
  
  let moderatorHandles = [];

  function modTag(handle) {
    return moderatorHandles.indexOf(handle) !== -1 ? "👑 " : "";
  }

  socket.on("moderatorList", (list) => {
    moderatorHandles = list || [];
  });
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
  const iconOptionsSound = document.getElementById("icon-options-sound");
  const iconUsersSound = document.getElementById("icon-users-sound");
  const iconMapSound = document.getElementById("icon-map-sound");
  const iconHighrollerSound = document.getElementById("icon-highroller-sound");
  const micSound = document.getElementById("mic-sound");
  const endSound = document.getElementById("end-sound");
  const playClipSound = document.getElementById("play-sound");
  const voiceEndSound = document.getElementById("voice-end-sound");

  const connectionBanner = document.getElementById("connection-banner");
  const micBtn = document.getElementById("mic-btn");
  const recordingOverlay = document.getElementById("recording-overlay");
  const recordingTimer = document.getElementById("recording-timer");
  const recordingHint = recordingOverlay
    ? recordingOverlay.querySelector(".recording-hint")
    : null;

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
  const profileBadgeCount = document.getElementById("profile-badge-count");
  const profileBadgeDetail = document.getElementById("profile-badge-detail");
  const profileBadgeDetailName = document.getElementById("profile-badge-detail-name");
  const profileBadgeDetailStatus = document.getElementById("profile-badge-detail-status");
  const profileBadgeEquipBtn = document.getElementById("profile-badge-equip-btn");
  const profileAvatar = document.getElementById("profile-avatar");
  const profilePhotoControls = document.getElementById("profile-photo-controls");
  const profilePhotoUploadBtn = document.getElementById("profile-photo-upload-btn");
  const profilePhotoRemoveBtn = document.getElementById("profile-photo-remove-btn");
  const profilePhotoInput = document.getElementById("profile-photo-input");
  const profilePhotoStatus = document.getElementById("profile-photo-status");

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
    vt323: "VT323",
    pressstart: "Press Start 2P",
    sharetechmono: "Share Tech Mono",
    pixelify: "Pixelify Sans",
    silkscreen: "Silkscreen",
    orbitron: "Orbitron",
    audiowide: "Audiowide",
    oxanium: "Oxanium",
    chakrapetch: "Chakra Petch",
    quantico: "Quantico",
    russoone: "Russo One",
    aldrich: "Aldrich",
    electrolize: "Electrolize",
    michroma: "Michroma",
    geo: "Geo",
    cascadiacode: "Microsoft Cascadia Code",
    cascadiamono: "Microsoft Cascadia Mono",
    consolasretro: "Microsoft Consolas",
    lucidaconsole: "Microsoft Lucida Console",
    ibmplexmono: "IBM Plex Mono",
    commodore64: "Commodore 64 Style",
    amstradcpc: "Amstrad CPC Style",
    ibmvga: "IBM VGA Style",
    decvt100: "DEC VT100 Style",
    zxspectrum: "ZX Spectrum Style",
    bbcmicro: "BBC Micro Style",
    appleii: "Apple II Style",
    atari8bit: "Atari 8-bit Style",
    trs80: "TRS-80 Style",
    spacemono: "Space Mono",
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


  const themeBtn = document.getElementById("theme-btn");
  const themeWheelPanel = document.getElementById("theme-wheel-panel");
  const themeWheelList = document.getElementById("theme-wheel-list");
  const themeWheelItems = Array.from(
    document.querySelectorAll("#theme-wheel-list .wheel-item")
  );

  const THEME_MAP = {
    "neon-green":     { label: "Neon Green",     primary: "#39ff14", dim: "#1f7a0d" },
    cyan:             { label: "Cyan",           primary: "#00eeff", dim: "#007985" },
    "electric-blue": { label: "Electric Azure", primary: "#00a2ff", dim: "#005783" },
    "royal-blue":    { label: "Royal Blue",     primary: "#4169e1", dim: "#263f87" },
    cobalt:           { label: "Cobalt Beam",    primary: "#3366ff", dim: "#1e3d99" },
    ultraviolet:      { label: "Ultraviolet",    primary: "#7a00ff", dim: "#490099" },
    purple:           { label: "Purple",         primary: "#9900ff", dim: "#5b0099" },
    magenta:          { label: "Magenta",        primary: "#ff00dd", dim: "#8f007c" },
    "laser-pink":    { label: "Laser Pink",     primary: "#ff2a6d", dim: "#971941" },
    scarlet:          { label: "Neon Scarlet",   primary: "#ff1744", dim: "#920d27" },
    "plasma-orange": { label: "Plasma Orange",  primary: "#ff5f1f", dim: "#943812" },
    amber:            { label: "Laser Amber",    primary: "#ffb000", dim: "#8f6300" },
    gold:             { label: "Gold",           primary: "#ffd700", dim: "#8f7900" },
    "electric-lemon":{ label: "Electric Lemon", primary: "#f7ff00", dim: "#858a00" },
    "toxic-lime":    { label: "Toxic Lime",     primary: "#c6ff00", dim: "#6c8c00" },
    "neon-mint":     { label: "Neon Mint",      primary: "#00ffc8", dim: "#008a6d" },
    turquoise:        { label: "Turquoise",      primary: "#40e0d0", dim: "#247d74" },
    aquamarine:       { label: "Aquamarine",     primary: "#7fffd4", dim: "#478f77" },
    ice:              { label: "Ghost Ice",      primary: "#e8fbff", dim: "#78969c" },
    silver:           { label: "Silver",         primary: "#c0c0c0", dim: "#686868" },
  };

  let currentThemeKey = "neon-green";

  function hexToRgbString(hex) {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    if (!match) return "57, 255, 20";
    return [
      parseInt(match[1], 16),
      parseInt(match[2], 16),
      parseInt(match[3], 16),
    ].join(", ");
  }

  function updateThemeButtonLabel(themeKey) {
    const theme = THEME_MAP[themeKey] || THEME_MAP["neon-green"];
    themeBtn.textContent = theme.label + " ▾";
    themeBtn.style.color = theme.primary;
  }

  function applyTheme(themeKey) {
    const theme = THEME_MAP[themeKey] || THEME_MAP["neon-green"];
    currentThemeKey = THEME_MAP[themeKey] ? themeKey : "neon-green";

    document.documentElement.style.setProperty("--theme-primary", theme.primary);
    document.documentElement.style.setProperty("--theme-primary-rgb", hexToRgbString(theme.primary));
    document.documentElement.style.setProperty("--theme-dim", theme.dim);
    document.documentElement.style.setProperty("--theme-dim-rgb", hexToRgbString(theme.dim));
    // Backward-compatible alias for older ChilliChat CSS that still reads accent-color.
    document.documentElement.style.setProperty("--accent-color", theme.primary);

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute("content", "#000000");

    updateThemeButtonLabel(currentThemeKey);
  }

  function themePrimary() {
    return (THEME_MAP[currentThemeKey] || THEME_MAP["neon-green"]).primary;
  }

  function themeDim() {
    return (THEME_MAP[currentThemeKey] || THEME_MAP["neon-green"]).dim;
  }

  function themeRgba(alpha) {
    return "rgba(" + hexToRgbString(themePrimary()) + ", " + alpha + ")";
  }

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
  const notificationsToggle = document.getElementById("notifications-toggle");

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

    const savedTheme =
      safeStorage.getItem("chillichat_theme") || "neon-green";

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

    applyFontColor(savedColor);

    applyTheme(savedTheme);

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

    const savedNotifications =
      safeStorage.getItem("chillichat_notifications") === "true";

    notificationsEnabled =
      savedNotifications &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted";

    notificationsToggle.checked = notificationsEnabled;
  }

   function closePrimaryUiPanels(except) {
    if (except !== "options") {
      optionsDropdown.classList.remove("open");
    }

    if (except !== "users") {
      usersDropdown.classList.remove("open");
    }

    if (except !== "highrollers") {
      highrollersDropdown.classList.remove("open");
    }

    if (except !== "map") {
      const liveMapOverlay = document.getElementById("map-overlay");
      if (liveMapOverlay) {
        liveMapOverlay.classList.add("hidden");
      }
    }
  }

  optionsToggleBtn.addEventListener("click", (e) => {
    buzz();
    playSound(iconOptionsSound);
    spawnIconRipple(optionsToggleBtn, e);

    const wasOpen = optionsDropdown.classList.contains("open");

    // Close every top-level panel first. If Options was already open,
    // leave everything closed; otherwise open Options cleanly.
    closePrimaryUiPanels();

    if (!wasOpen) {
      optionsDropdown.classList.add("open");
    }
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


    if (
      !themeBtn.contains(e.target) &&
      !themeWheelPanel.contains(e.target)
    ) {
      themeWheelPanel.classList.add("hidden");
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

      applyFontColor(color);

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

  const themeWheel = createWheel({
    wrap: themeWheelPanel,
    list: themeWheelList,
    items: themeWheelItems,
    getValue: (item) => item.dataset.theme,
    onChange: (themeKey, itemEl) => {
      safeStorage.setItem("chillichat_theme", themeKey);
      applyTheme(themeKey);
      themeBtn.textContent = itemEl.textContent + " ▾";
      themeBtn.style.color = themePrimary();
      try {
        drawMap();
      } catch (err) {
        // Map may not be initialized yet during startup; theme still applies normally.
      }
    },
  });

  themeBtn.addEventListener("click", () => {
    buzz();

    const opening = themeWheelPanel.classList.contains("hidden");
    themeWheelPanel.classList.toggle("hidden");

    if (opening) {
      positionWheelPanel(themeBtn, themeWheelPanel);
      const savedTheme = safeStorage.getItem("chillichat_theme") || "neon-green";
      themeWheel.scrollToValue(savedTheme);
      themeWheel.settle();
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

    notificationsToggle.addEventListener("change", () => {
    notificationsEnabled = notificationsToggle.checked;

    safeStorage.setItem(
      "chillichat_notifications",
      String(notificationsEnabled)
    );

    buzz();

    if (
      notificationsEnabled &&
      typeof Notification !== "undefined" &&
      Notification.permission !== "granted"
    ) {
      requestNotificationPermission();
    }
  });


  function applyAccentColor(color) {
    // Handle colour is identity only. It must not recolour the ChilliChat UI theme.
    document.documentElement.style.setProperty(
      "--user-accent-color",
      color || "#39ff14"
    );
  }

  const TWO_TONE_COLORS = {
    "#00f6ff": {
      secondary: "#ff2bd6",
      fontClass: "two-tone-font-cyber",
    },
    "#39ff15": {
      secondary: "#ff5f1f",
      fontClass: "two-tone-font-chilli",
    },
    "#ff38c7": {
      secondary: "#00f5ff",
      fontClass: "two-tone-font-miami",
    },
    "#c8ff1a": {
      secondary: "#ff4d00",
      fontClass: "two-tone-font-toxic",
    },
    "#33d7ff": {
      secondary: "#ff1744",
      fontClass: "two-tone-font-icefire",
    },
    "#ffe600": {
      secondary: "#ff00c8",
      fontClass: "two-tone-font-lemonade",
    },
    "#a855ff": {
      secondary: "#39ff14",
      fontClass: "two-tone-font-arcade",
    },
    "#e8fbff": {
      secondary: "#00a2ff",
      fontClass: "two-tone-font-ghost",
    },
    "#00ff88": {
      secondary: "#7a00ff",
      fontClass: "two-tone-font-reactor",
    },
    "#ff7a18": {
      secondary: "#ffee00",
      fontClass: "two-tone-font-solar",
    },
    "#4f7cff": {
      secondary: "#ff2a6d",
      fontClass: "two-tone-font-nightdrive",
    },
    "#adff2f": {
      secondary: "#ff2bd6",
      fontClass: "two-tone-font-acid",
    },
    "#ff334f": {
      secondary: "#00f0ff",
      fontClass: "two-tone-font-infernoice",
    },
    "#9d4dff": {
      secondary: "#00ffcc",
      fontClass: "two-tone-font-ultravolt",
    },
  };

  function getTwoTone(color) {
    if (!color) return null;
    return TWO_TONE_COLORS[String(color).toLowerCase()] || null;
  }

  function applyHandleColor(element, color) {
    if (!element) return;

    element.style.color = color || "#39ff14";

    const tone = getTwoTone(color);
    element.style.textShadow = tone
      ? "0 0 4px " + color + ", 0 0 10px " + tone.secondary +
        ", 0 0 18px " + tone.secondary
      : "";
  }

  function applyFontColor(color) {
    document.documentElement.style.setProperty(
      "--app-text-color",
      color
    );

    document.body.classList.remove(
      "two-tone-font-cyber",
      "two-tone-font-chilli",
      "two-tone-font-miami",
      "two-tone-font-toxic",
      "two-tone-font-icefire",
      "two-tone-font-lemonade",
      "two-tone-font-arcade",
      "two-tone-font-ghost",
      "two-tone-font-reactor",
      "two-tone-font-solar",
      "two-tone-font-nightdrive",
      "two-tone-font-acid",
      "two-tone-font-infernoice",
      "two-tone-font-ultravolt"
    );

    const tone = getTwoTone(color);
    if (tone) {
      document.body.classList.add(tone.fontClass);
    }
  }

  // Apply saved options only after the two-tone colour table and helpers
  // have been initialized. Calling this earlier triggers a temporal-dead-zone
  // ReferenceError and stops the join-screen JavaScript from finishing setup.
  applyOptions();

  const handlePreview =
    document.getElementById("handle-preview");

  function updateHandlePreview() {
    const name =
      handleInput.value.trim() || "YourHandle";

    if (myColor) {
      handlePreview.textContent = name;
      applyHandleColor(handlePreview, myColor);
    } else {
      handlePreview.textContent =
        "Pick a colour to preview your handle";

      handlePreview.style.color = "#1f7a0d";
      handlePreview.style.textShadow = "";
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

    usersToggleBtn.addEventListener("click", (e) => {
    buzz();
    playSound(iconUsersSound);
    spawnIconRipple(usersToggleBtn, e);

    const wasOpen = usersDropdown.classList.contains("open");

    // True toggle: second press closes Users; switching icons closes the
    // previous panel before opening this one.
    closePrimaryUiPanels();

    if (!wasOpen) {
      usersDropdown.classList.add("open");
    }
  });

   highrollersToggleBtn.addEventListener("click", (e) => {
    buzz();
    playSound(iconHighrollerSound);
    spawnIconRipple(highrollersToggleBtn, e);

    const wasOpen = highrollersDropdown.classList.contains("open");

    // True toggle: second press closes Highrollers; switching icons closes
    // the previous top-level panel before opening this one.
    closePrimaryUiPanels();

    if (!wasOpen) {
      highrollersDropdown.classList.add("open");
      requestHighrollers("day");
    }
  });

function primeHighrollersHdButton(button) {
    if (!button) return;

    button.addEventListener("pointerdown", () => {
      buzz(18);
      button.classList.add("is-pressing");
    });

    const release = () => {
      button.classList.remove("is-pressing");
    };

    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
  }

  [
    highrollersTodayBtn,
    highrollersWeekBtn,
    highrollersUsersBtn,
  ].forEach(primeHighrollersHdButton);

  highrollersTodayBtn.addEventListener("click", (event) => {
    playSound(btnfxSound);
    spawnIconRipple(highrollersTodayBtn, event);
    setHighrollersTab("day");
    requestHighrollers("day");
  });

  highrollersWeekBtn.addEventListener("click", (event) => {
    playSound(btnfxSound);
    spawnIconRipple(highrollersWeekBtn, event);
    setHighrollersTab("week");
    requestHighrollers("week");
  });

  highrollersUsersBtn.addEventListener("click", (event) => {
    playSound(btnfxSound);
    spawnIconRipple(highrollersUsersBtn, event);
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

    highrollersTodayBtn.setAttribute("aria-selected", String(mode === "day"));
    highrollersWeekBtn.setAttribute("aria-selected", String(mode === "week"));
    highrollersUsersBtn.setAttribute("aria-selected", String(mode === "users"));

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

  function buildHighrollersCardHeader(markerText, handleText, handleColor) {
    const header = document.createElement("div");
    header.className = "highrollers-card-header";

    const marker = document.createElement("span");
    marker.className = "highrollers-heat";
    marker.textContent = markerText;

    const handle = document.createElement("span");
    handle.className = "highrollers-handle";
    handle.textContent = handleText;
    applyHandleColor(handle, handleColor);

    header.appendChild(marker);
    header.appendChild(handle);

    return header;
  }

  socket.on(
    "userLeaderboardResult",
    ({ leaderboard }) => {
      userLeaderboardList.innerHTML = "";

      if (leaderboard.length === 0) {
        const li = document.createElement("li");
        li.className = "highrollers-empty highrollers-card";
        li.textContent =
          "No users on the board yet.";

        userLeaderboardList.appendChild(li);
        return;
      }

      leaderboard.forEach((entry, index) => {
        const li = document.createElement("li");
        li.className =
          "highrollers-item highrollers-card highrollers-user-card";

        const header = buildHighrollersCardHeader(
          MEDALS[index] || "#" + (index + 1),
          entry.rankEmoji + " " + entry.handle,
          entry.color
        );

        const scoville = document.createElement("div");
        scoville.className =
          "highrollers-text highrollers-card-body highrollers-user-summary";

        // Keep entry.scho because the server currently
        // appears to send the value under that property.
        scoville.textContent =
          entry.scho.toLocaleString() +
          " Scoville — " +
          entry.rankName;

        li.appendChild(header);
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
        li.className = "highrollers-empty highrollers-card";
        li.textContent =
          "No hot takes yet — react to some messages!";

        highrollersList.appendChild(li);
        return;
      }

      entries.forEach((entry) => {
        const li = document.createElement("li");
        li.className =
          "highrollers-item highrollers-card highrollers-message-card";

        const header = buildHighrollersCardHeader(
          "🔥 " + entry.heatRating,
          entry.handle,
          entry.color
        );

        const message = document.createElement("div");
        message.className =
          "highrollers-text highrollers-card-body highrollers-message-text";
        message.textContent = entry.text;

        li.appendChild(header);
        li.appendChild(message);

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
      syncOwnProfilePhotoControls();
      // Restore the user's consented approximate location after a fresh join
      // or reconnect so HOME/weather/radar do not silently fall back to the UK.
      restoreLocationPreference();
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
    ({ emoji, name, rarity }) => {
      const tier = String(rarity || "common").toLowerCase();

      if (tier === "unhinged") {
        showSystemMessage(
          "💀 UNHINGED ACHIEVEMENT UNLOCKED — " + emoji + " " + name + "!"
        );
      } else if (tier === "legendary") {
        showSystemMessage(
          "🏆 LEGENDARY ACHIEVEMENT UNLOCKED — " + emoji + " " + name + "!"
        );
      } else if (tier === "epic") {
        showSystemMessage(
          "💜 EPIC ACHIEVEMENT UNLOCKED — " + emoji + " " + name + "!"
        );
      } else if (tier === "rare") {
        showSystemMessage(
          "💎 RARE ACHIEVEMENT UNLOCKED — " + emoji + " " + name + "!"
        );
      } else {
        showSystemMessage(
          "🏅 Badge unlocked: " + emoji + " " + name + "!"
        );
      }
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

  let currentProfileData = null;
  let activeProfileBadgeKey = null;

  function syncProfileOverlayViewport() {
    const appHeader = document.querySelector(".app-header");
    const headerBottom = appHeader
      ? Math.max(0, Math.round(appHeader.getBoundingClientRect().bottom))
      : 0;

    const availableHeight = Math.max(0, window.innerHeight - headerBottom);

    // Keep the entire profile below the permanent ChilliChat header divider.
    // This mirrors the Radar positioning logic so the avatar/header/close
    // control cannot disappear behind Options / Users / Map / Highrollers.
    profileOverlay.style.top = headerBottom + "px";
    profileOverlay.style.bottom = "0";
    profileOverlay.style.left = "0";
    profileOverlay.style.right = "0";
    profileOverlay.style.setProperty(
      "--profile-available-height",
      availableHeight + "px"
    );
  }


  function hideProfileBadgeDetail() {
    activeProfileBadgeKey = null;

    if (profileBadgeDetail) {
      profileBadgeDetail.classList.add("hidden");
    }

    if (profileBadgeEquipBtn) {
      profileBadgeEquipBtn.classList.add("hidden");
      profileBadgeEquipBtn.dataset.badgeKey = "";
    }

    if (profileBadgesGrid) {
      profileBadgesGrid
        .querySelectorAll(".profile-badge.detail-open")
        .forEach((cell) => cell.classList.remove("detail-open"));
    }
  }

  function formatBadgeEarnedDate(value) {
    if (!value) return "";

    let stamp = String(value).trim();
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(stamp)) {
      stamp = stamp.replace(" ", "T") + "Z";
    }

    const date = new Date(stamp);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleDateString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function showProfileBadgeDetail(key, cell, data) {
    const def = BADGE_DEFS_CLIENT[key];
    if (!def) return;

    if (activeProfileBadgeKey === key) {
      hideProfileBadgeDetail();
      return;
    }

    hideProfileBadgeDetail();
    activeProfileBadgeKey = key;
    cell.classList.add("detail-open");

    const isUnlocked = data.unlockedKeys.includes(key);
    const isEquipped = data.equippedBadge === key;
    const rarity = String(def.rarity || "common").toUpperCase();
    const earnedAt =
      data.badgeEarnedAt && data.badgeEarnedAt[key]
        ? formatBadgeEarnedDate(data.badgeEarnedAt[key])
        : "";

    profileBadgeDetailName.textContent =
      def.emoji + " " + def.name + " · " + rarity;

    if (isUnlocked) {
      profileBadgeDetailStatus.textContent =
        "EARNED" +
        (earnedAt ? " " + earnedAt : "") +
        " — " +
        (def.description || def.name);
    } else {
      profileBadgeDetailStatus.textContent =
        "HOW TO UNLOCK — " + (def.description || def.name);
    }

    profileBadgeDetail.classList.remove("hidden");

    if (isUnlocked && data.isOwn) {
      profileBadgeEquipBtn.classList.remove("hidden");
      profileBadgeEquipBtn.dataset.badgeKey = key;
      profileBadgeEquipBtn.textContent =
        isEquipped ? "Unequip badge" : "Equip badge";
    }

    requestAnimationFrame(() => {
      profileBadgeDetail.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    });
  }

  function renderProfileBadges(data) {
    profileBadgesGrid.innerHTML = "";
    hideProfileBadgeDetail();

    const unlockedCount = data.unlockedKeys.length;
    const totalCount = Object.keys(BADGE_DEFS_CLIENT).length;

    if (profileBadgeCount) {
      profileBadgeCount.textContent =
        unlockedCount + " / " + totalCount + " earned";
    }

    Object.keys(BADGE_DEFS_CLIENT).forEach((key) => {
      const def = BADGE_DEFS_CLIENT[key];
      const isUnlocked = data.unlockedKeys.includes(key);
      const isEquipped = data.equippedBadge === key;
      const badgeRarity =
        String(def.rarity || "common").toLowerCase();

      const cell = document.createElement("button");
      cell.type = "button";

      cell.className =
        "profile-badge" +
        (isUnlocked ? " unlocked" : "") +
        (isEquipped ? " equipped" : "") +
        " badge-rarity-" +
        badgeRarity;

      cell.dataset.badgeKey = key;
      cell.dataset.badgeRarity = badgeRarity;

      cell.innerHTML =
        '<span class="profile-badge-emoji" aria-hidden="true">' +
        def.emoji +
        "</span>" +
        '<span class="badge-name">' +
        def.name +
        "</span>";

      cell.title =
        (isUnlocked ? "Earned: " : "Locked: ") +
        def.name +
        " — click for details";

      cell.setAttribute(
        "aria-label",
        (isUnlocked ? "Earned badge: " : "Locked badge: ") +
          def.name +
          ". Click for details."
      );

      cell.addEventListener("click", (event) => {
        buzz([14, 8, 22]);
        spawnIconRipple(cell, event);
        showProfileBadgeDetail(key, cell, data);
      });

      profileBadgesGrid.appendChild(cell);
    });
  }

  function setProfilePhotoStatus(message, isError) {
    if (!profilePhotoStatus) return;

    profilePhotoStatus.textContent = message || "";
    profilePhotoStatus.classList.toggle("error", !!isError);
  }

  function syncOwnProfilePhotoControls() {
    if (!profilePhotoUploadBtn || !profilePhotoRemoveBtn) return;

    const hasPhoto = !!(
      myHandle &&
      profilePhotoByHandle[myHandle]
    );

    profilePhotoUploadBtn.textContent = hasPhoto
      ? "Change Profile Picture"
      : "Upload Profile Picture";

    profilePhotoRemoveBtn.classList.toggle("hidden", !hasPhoto);
  }

  function compressProfilePhoto(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type || !file.type.startsWith("image/")) {
        reject(new Error("Please choose an image file."));
        return;
      }

      if (file.size > 12 * 1024 * 1024) {
        reject(new Error("That source image is too large. Please choose one under 12 MB."));
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        try {
          const size = 480;
          const sourceWidth = image.naturalWidth || image.width;
          const sourceHeight = image.naturalHeight || image.height;
          const sourceSize = Math.min(sourceWidth, sourceHeight);
          const sourceX = Math.max(0, (sourceWidth - sourceSize) / 2);
          const sourceY = Math.max(0, (sourceHeight - sourceSize) / 2);

          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;

          const ctx = canvas.getContext("2d", { alpha: false });
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, size, size);
          ctx.drawImage(
            image,
            sourceX,
            sourceY,
            sourceSize,
            sourceSize,
            0,
            0,
            size,
            size
          );

          // Canvas re-encoding creates a fresh JPEG from pixels only, so the
          // source file's EXIF/GPS/camera metadata is not uploaded.
          const dataUrl = canvas.toDataURL("image/jpeg", 0.82);

          URL.revokeObjectURL(objectUrl);
          resolve(dataUrl);
        } catch (err) {
          URL.revokeObjectURL(objectUrl);
          reject(err);
        }
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("ChilliChat could not read that image."));
      };

      image.src = objectUrl;
    });
  }

  socket.on("userProfileResult", (data) => {
    currentProfileData = data;
    rememberProfilePhoto(data.handle, data.profilePhoto || "");

    profileHandle.textContent = modTag(data.handle) + data.handle;

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
      : "No bio added yet.";

    if (data.isOwn) {
      bioInput.value = data.bio || "";
    }

    applyProfileAvatar(profileAvatar, data.handle, data.profilePhoto || "");

    // Profile-picture editing now lives in Options, not inside the profile.
    // Opening someone else's profile must never hide or alter my own controls.
    if (data.isOwn) {
      syncOwnProfilePhotoControls();
    }

    profileReactions.innerHTML = "";

    REACTIONS.forEach((r) => {
      const pill = document.createElement("span");

      pill.className =
        "profile-reaction-pill profile-reaction-" + r.key;

      pill.innerHTML =
        reactionIconSvg(r.key, "reaction-profile-icon") +
        '<span class="reaction-profile-count">' +
        (data.reactions[r.key] || 0) +
        "</span>";

      pill.title = r.label + " received";
      pill.setAttribute(
        "aria-label",
        r.label + " received: " + (data.reactions[r.key] || 0)
      );

      profileReactions.appendChild(pill);
    });

    renderProfileBadges(data);
    syncProfileOverlayViewport();
    profileOverlay.classList.remove("hidden");

    // Re-measure once visible in case browser zoom/font layout changed the
    // header height during this frame.
    requestAnimationFrame(syncProfileOverlayViewport);
  });

  if (profileBadgeEquipBtn) {
    profileBadgeEquipBtn.addEventListener("click", (event) => {
      if (!currentProfileData || !currentProfileData.isOwn) return;

      const badgeKey = profileBadgeEquipBtn.dataset.badgeKey;
      if (!badgeKey) return;

      buzz([18, 8, 18]);
      spawnIconRipple(profileBadgeEquipBtn, event);

      const newEquipped =
        currentProfileData.equippedBadge === badgeKey
          ? null
          : badgeKey;

      currentProfileData.equippedBadge = newEquipped;

      socket.emit("equipBadge", {
        badgeKey: newEquipped,
      });

      renderProfileBadges(currentProfileData);
    });
  }

  if (profilePhotoUploadBtn && profilePhotoInput) {
    profilePhotoUploadBtn.addEventListener("click", (event) => {
      buzz([18, 8, 20]);
      spawnIconRipple(profilePhotoUploadBtn, event);
      profilePhotoInput.click();
    });

    profilePhotoInput.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      profilePhotoInput.value = "";

      if (!file) return;

      try {
        setProfilePhotoStatus("Preparing secure 480 × 480 photo…", false);
        const imageData = await compressProfilePhoto(file);
        setProfilePhotoStatus("Uploading sanitized profile photo…", false);
        socket.emit("updateProfilePhoto", { imageData });
      } catch (err) {
        setProfilePhotoStatus(
          err && err.message ? err.message : "Could not prepare that photo.",
          true
        );
      }
    });
  }

  if (profilePhotoRemoveBtn) {
    profilePhotoRemoveBtn.addEventListener("click", (event) => {
      buzz([20, 10, 20]);
      spawnIconRipple(profilePhotoRemoveBtn, event);
      setProfilePhotoStatus("Removing profile photo…", false);
      socket.emit("updateProfilePhoto", { imageData: null });
    });
  }

  socket.on("profilePhotoUpdateResult", (data) => {
    if (!data || !data.success) {
      setProfilePhotoStatus(
        (data && data.message) || "Profile photo update failed.",
        true
      );
      return;
    }

    rememberProfilePhoto(myHandle, data.profilePhoto || "");
    refreshProfileAvatars(myHandle, data.profilePhoto || "");
    syncOwnProfilePhotoControls();

    if (currentProfileData && currentProfileData.isOwn) {
      currentProfileData.profilePhoto = data.profilePhoto || "";
      applyProfileAvatar(
        profileAvatar,
        currentProfileData.handle,
        currentProfileData.profilePhoto
      );
    }

    setProfilePhotoStatus(
      data.profilePhoto ? "Profile photo updated." : "Profile photo removed.",
      false
    );
  });

  socket.on("profilePhotoUpdated", ({ handle, profilePhoto }) => {
    refreshProfileAvatars(handle, profilePhoto || "");

    if (handle === myHandle) {
      syncOwnProfilePhotoControls();
    }

    if (
      currentProfileData &&
      currentProfileData.handle === handle
    ) {
      currentProfileData.profilePhoto = profilePhoto || "";
      applyProfileAvatar(profileAvatar, handle, profilePhoto || "");
    }
  });

  function closeProfile() {
    hideProfileBadgeDetail();
    currentProfileData = null;
    profileOverlay.classList.add("hidden");
  }

  profileCloseBtn.addEventListener("click", (event) => {
    buzz([18, 8, 22]);
    spawnIconRipple(profileCloseBtn, event);
    closeProfile();
  });

  profileOverlay.addEventListener("click", (e) => {
    if (e.target === profileOverlay) {
      buzz(12);
      closeProfile();
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

        clearPhotoCountdown(id);
      }

      const el =
        messagesBox.querySelector(selector);

      if (!el) return;

      el.innerHTML = "";
      el.className = "system-msg";
      el.textContent = label;
    }
  );

  socket.on(
   "voiceClipExpiredOld",
    ({ clipId }) => {
      const el = messagesBox.querySelector(
        '[data-clip-id="' + clipId + '"]'
      );

      if (!el) return;

      el.innerHTML = "";
      el.className = "system-msg";
      el.textContent = "🕐 Voice clip expired (1hr limit)";
    }
  );

  function formatTimestamp(isoString) {
    if (!isoString) return "";

    let timestamp = isoString;

    // SQLite timestamps are stored as UTC but normally arrive without
    // a timezone marker, for example "2026-09-24 18:13:00".
    // Mark those values as UTC so the browser converts them correctly
    // to the viewer's real local timezone, including BST/GMT changes.
    if (typeof timestamp === "string") {
      timestamp = timestamp.trim();

      const hasTimezone =
        /(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp);

      if (!hasTimezone) {
        timestamp = timestamp.replace(" ", "T") + "Z";
      }
    }

    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
      console.warn("Invalid ChilliChat timestamp:", isoString);
      return "";
    }

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
    ).textContent = String(users.length);

    usersList.innerHTML = "";

    users.forEach((user) => {
      rememberProfilePhoto(user.handle, user.profilePhoto || "");

      if (user.handle === myHandle) {
        syncOwnProfilePhotoControls();
      }

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
                modTag(user.handle) +
        rankPrefix +
        user.handle +
        equippedStr;

      applyHandleColor(name, user.color);

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

      const userAvatar = createProfileAvatar(
        user.handle,
        user.profilePhoto || "",
        "users-list-avatar",
        true
      );

      row.appendChild(dot);
      row.appendChild(userAvatar);
      row.appendChild(name);
      row.appendChild(scovilleLabel);

      const canModerate =
        myIsModerator &&
                user.handle !== myHandle &&
        user.handle !== "Mdnight";

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

  sendBtn.addEventListener("click", (e) => {
    buzz();
    spawnIconRipple(sendBtn, e);
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

  function emptyReactionCounts() {
    return {
      chilli: 0,
      heart: 0,
      laugh: 0,
      down: 0,
      poo: 0,
    };
  }

  function reactionTargetKey(targetType, targetId) {
    return String(targetType || "text") + ":" + String(targetId);
  }

  function getReactionTargetElement(targetType, targetId) {
    const selectors = {
      text: '[data-message-id="' + targetId + '"]',
      voice: '[data-clip-id="' + targetId + '"]',
      photo: '[data-photo-id="' + targetId + '"]',
    };

    const selector = selectors[targetType];
    return selector ? messagesBox.querySelector(selector) : null;
  }

  function reactionTargetLabel(targetType) {
    if (targetType === "voice") return "voice clip";
    if (targetType === "photo") return "photo";
    return "message";
  }

  function reactionIconSvg(reactionKey, extraClass) {
    const className =
      "reaction-hd-icon reaction-hd-" +
      reactionKey +
      (extraClass ? " " + extraClass : "");

    const icons = {
      chilli: `
        <svg class="${className}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <path d="M40 15c1-8 6-12 14-13-2 8-6 13-13 16" fill="none" stroke="#39d353" stroke-width="5" stroke-linecap="round"/>
          <path d="M40 15c-8-5-19-3-25 5-7 10-4 24 5 31 9 8 23 8 32 1 7-6 10-14 10-23-6 6-13 9-19 7-7-2-11-8-10-14 1-4 3-6 7-7Z" fill="#ff304f" stroke="#9d0b25" stroke-width="2.5"/>
          <path d="M19 23c-3 6-2 13 2 18" fill="none" stroke="#ff9aa9" stroke-width="4" stroke-linecap="round" opacity=".9"/>
          <path d="M48 42c4-3 7-7 9-12" fill="none" stroke="#ff784f" stroke-width="3" stroke-linecap="round" opacity=".8"/>
        </svg>`,
      heart: `
        <svg class="${className}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <path d="M32 56 8 33C-3 21 4 6 18 7c7 0 12 4 14 9 3-5 8-9 15-9 14-1 21 14 10 26L32 56Z" fill="#ff2a6d" stroke="#9b0f3d" stroke-width="2.5"/>
          <path d="M15 16c5-4 11-2 14 3" fill="none" stroke="#ffb3ca" stroke-width="4" stroke-linecap="round" opacity=".95"/>
          <path d="M46 12c5 1 9 5 10 10" fill="none" stroke="#ff6f9d" stroke-width="3" stroke-linecap="round" opacity=".8"/>
        </svg>`,
      laugh: `
        <svg class="${className}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <circle cx="32" cy="31" r="26" fill="#ffd83d" stroke="#c58c00" stroke-width="2.5"/>
          <path d="M15 25c4-5 9-5 13 0M36 25c4-5 9-5 13 0" fill="none" stroke="#553600" stroke-width="4" stroke-linecap="round"/>
          <path d="M18 34c3 14 25 18 30 0Z" fill="#7a1f22" stroke="#553600" stroke-width="2"/>
          <path d="M24 45c5 4 12 4 17 0-5-5-12-5-17 0Z" fill="#ff6b7f"/>
          <path d="M11 27c-7 5-7 13 0 15 6 1 8-8 0-15ZM53 27c7 5 7 13 0 15-6 1-8-8 0-15Z" fill="#35b9ff" stroke="#0873ad" stroke-width="1.5"/>
          <path d="M9 31c-2 3-2 6 0 8M55 31c2 3 2 6 0 8" fill="none" stroke="#bfeaff" stroke-width="2" stroke-linecap="round"/>
        </svg>`,
      down: `
        <svg class="${className}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <path d="M20 8h29c5 0 8 4 7 9l-5 20c-1 4-4 6-8 6h-8l3 9c2 7-7 11-11 5L15 41H7V13h9l4-5Z" fill="#4fa3ff" stroke="#145a9e" stroke-width="2.5" stroke-linejoin="round"/>
          <path d="M7 13h9v28H7Z" fill="#246fb8"/>
          <path d="M23 13h24M23 21h22M22 29h20" fill="none" stroke="#a8d6ff" stroke-width="3" stroke-linecap="round" opacity=".65"/>
          <path d="m27 42 8 1 3 9" fill="none" stroke="#0f4a84" stroke-width="2.5" stroke-linecap="round"/>
        </svg>`,
      poo: `
        <svg class="${className}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <path d="M22 22c-1-7 4-12 11-13-2 4 0 7 5 9 6 2 9 6 8 11 7 2 11 7 10 13-1 8-8 12-17 12H20C10 54 4 49 5 41c1-6 5-10 11-12-2-3-1-5 0-7 2-2 4-3 6-3Z" fill="#8b4b2b" stroke="#4d2616" stroke-width="2.5" stroke-linejoin="round"/>
          <path d="M18 30c4-4 9-5 14-4 5 0 10 2 14 5" fill="none" stroke="#c87843" stroke-width="4" stroke-linecap="round" opacity=".75"/>
          <ellipse cx="24" cy="38" rx="5" ry="6" fill="#fff"/>
          <ellipse cx="41" cy="38" rx="5" ry="6" fill="#fff"/>
          <circle cx="25" cy="39" r="2" fill="#17120f"/>
          <circle cx="40" cy="39" r="2" fill="#17120f"/>
          <path d="M23 47c6 5 13 5 19 0" fill="none" stroke="#2d160e" stroke-width="3" stroke-linecap="round"/>
          <path d="M18 20c5-2 10-1 13 2" fill="none" stroke="#e0a06d" stroke-width="3" stroke-linecap="round" opacity=".55"/>
        </svg>`,
    };

    return icons[reactionKey] || icons.chilli;
  }

  function reactionChilliSvg() {
    return `
      <svg class="reaction-chilli-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path class="reaction-chilli-stem"
          d="M19.4 8.1c.3-3.1 2.2-5.2 5.7-6.1-.7 3.2-2.3 5.6-5 7.2"
          fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        <path class="reaction-chilli-body"
          d="M19.8 7.9c-3.7-1.8-8.3-.8-10.5 2.8-2.5 4.2-.8 9.7 3 12.7 3.6 2.9 8.8 3.2 12.5.5 3.1-2.3 4.9-6 5.1-9.7-2.1 2.2-4.7 3.2-7 2.6-2.5-.7-4-2.8-3.7-5.1.2-1.5 1.1-2.8 2.5-3.7-.6 0-1.3 0-1.9-.1Z"
          fill="currentColor" />
        <path class="reaction-chilli-shine"
          d="M12.2 11.3c-1.3 1.8-1.4 4-.4 5.9"
          fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="1.4" stroke-linecap="round" />
      </svg>`;
  }

  let pickerEl = null;
  let pickerTargetType = null;
  let pickerTargetId = null;

  function closePicker() {
    if (pickerEl) pickerEl.classList.add("hidden");
    pickerTargetType = null;
    pickerTargetId = null;
  }

  function getPicker() {
    if (pickerEl) return pickerEl;

    pickerEl = document.createElement("div");
    pickerEl.className = "reaction-picker-fixed hidden";

    REACTIONS.forEach(function (r) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "reaction-pick-btn reaction-pick-" + r.key;
      b.innerHTML =
        reactionIconSvg(r.key, "reaction-picker-icon") +
        '<span class="reaction-pick-label">' + r.label + "</span>";
      b.title = "React with " + r.label;
      b.setAttribute("aria-label", "React with " + r.label);

      b.addEventListener("click", function (event) {
        buzz(22);
        spawnIconRipple(b, event);

        if (pickerTargetType !== null && pickerTargetId !== null) {
          socket.emit("reaction", {
            targetType: pickerTargetType,
            targetId: pickerTargetId,
            handle: myHandle,
            reactionType: r.key,
          });
        }

        closePicker();
      });

      pickerEl.appendChild(b);
    });

    document.body.appendChild(pickerEl);
    return pickerEl;
  }

  function openPicker(targetType, targetId, anchorEl) {
    const p = getPicker();
    pickerTargetType = targetType;
    pickerTargetId = targetId;
    p.classList.remove("hidden");

    const rect = anchorEl.getBoundingClientRect();
    const w = p.offsetWidth;
    const h = p.offsetHeight;

    let left = rect.right - w;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    if (left < 8) left = 8;

    let top = rect.bottom + 6;
    if (top + h > window.innerHeight - 8) top = rect.top - h - 6;
    if (top < 8) top = 8;

    p.style.left = left + "px";
    p.style.top = top + "px";
  }

  document.addEventListener("click", function (e) {
    if (
      e.target.closest(".reaction-chilli-trigger") ||
      e.target.closest(".reaction-picker-fixed")
    ) {
      return;
    }

    closePicker();
  });

  messagesBox.addEventListener("scroll", closePicker);

  function burstReaction(targetEl, reactionKey) {
    try {
      const rect = targetEl.getBoundingClientRect();

      for (let i = 0; i < 4; i++) {
        const el = document.createElement("span");
        el.className =
          "reaction-burst reaction-burst-" + reactionKey;
        el.dataset.reaction = reactionKey;
        el.innerHTML = reactionIconSvg(
          reactionKey,
          "reaction-burst-icon"
        );

        const spread = Math.min(150, Math.max(70, rect.width * 0.7));
        el.style.left =
          rect.left +
          rect.width / 2 -
          44 +
          (Math.random() - 0.5) * spread +
          "px";
        el.style.top =
          rect.top +
          Math.min(rect.height * 0.55, 50) +
          "px";
        el.style.setProperty(
          "--burst-drift",
          (Math.random() * 120 - 60).toFixed(0) + "px"
        );
        el.style.animationDelay = i * 115 + "ms";
        document.body.appendChild(el);

        setTimeout(function () {
          el.remove();
        }, 2900);
      }
    } catch (err) {
      console.error("Reaction animation failed:", err);
    }
  }

  function renderPills(pillsWrap, counts) {
    pillsWrap.innerHTML = "";

    REACTIONS.forEach(function (r) {
      const count = counts[r.key] || 0;

      if (count > 0) {
        const pill = document.createElement("span");
        pill.className =
          "reaction-pill reaction-pill-" + r.key;
        pill.innerHTML =
          reactionIconSvg(r.key, "reaction-pill-icon") +
          '<span class="reaction-pill-count">' + count + "</span>";
        pill.title = r.label + ": " + count;
        pill.setAttribute("aria-label", r.label + ": " + count);
        pillsWrap.appendChild(pill);
      }
    });
  }

  function buildReactionBar(targetType, targetId, counts, heatRating) {
    const bar = document.createElement("div");
    bar.className = "reaction-bar content-reaction-bar";
    bar.dataset.reactionTargetType = targetType;
    bar.dataset.reactionTargetId = targetId;

    const pillsWrap = document.createElement("span");
    pillsWrap.className = "reaction-pills";
    bar.appendChild(pillsWrap);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "reaction-chilli-trigger";
    addBtn.innerHTML = reactionChilliSvg();
    addBtn.title = "React to this " + reactionTargetLabel(targetType);
    addBtn.setAttribute(
      "aria-label",
      "React to this " + reactionTargetLabel(targetType)
    );
    bar.appendChild(addBtn);

    addBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      buzz();
      spawnIconRipple(addBtn, e);

      if (
        pickerEl &&
        !pickerEl.classList.contains("hidden") &&
        pickerTargetType === targetType &&
        String(pickerTargetId) === String(targetId)
      ) {
        closePicker();
      } else {
        openPicker(targetType, targetId, addBtn);
      }
    });

    const heatBadge = document.createElement("span");
    heatBadge.className = "heat-badge";
    heatBadge.textContent = heatRating ? "🔥 " + heatRating : "";
    bar.appendChild(heatBadge);

    // Text-message moderation used to live inside the old reaction bar.
    // Preserve that exact behaviour here; voice/photo already have their own delete buttons.
    if (myIsModerator && targetType === "text") {
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "mod-delete-btn";
      delBtn.textContent = "🗑️";
      delBtn.title = "Delete message";

      delBtn.addEventListener("click", function () {
        buzz();

        if (confirm("Delete this message?")) {
          socket.emit("moderatorDeleteMessage", { messageId: targetId });
        }
      });

      bar.appendChild(delBtn);
    }

    renderPills(pillsWrap, counts || emptyReactionCounts());
    return bar;
  }

  socket.on("reactionUpdate", function (data) {
    const targetType = data.targetType || "text";
    const targetId =
      data.targetId !== undefined && data.targetId !== null
        ? data.targetId
        : data.messageId;

    if (targetId === undefined || targetId === null) return;

    const counts = data.counts || emptyReactionCounts();
    const heatRating = data.heatRating;
    const targetEl = getReactionTargetElement(targetType, targetId);

    if (!targetEl) return;

    const key = reactionTargetKey(targetType, targetId);
    const prev = lastKnownCounts[key] || emptyReactionCounts();
    lastKnownCounts[key] = counts;

    const pillsWrap = targetEl.querySelector(".reaction-pills");
    if (pillsWrap) renderPills(pillsWrap, counts);

    const heatBadge = targetEl.querySelector(".heat-badge");
    if (heatBadge) {
      heatBadge.textContent = heatRating ? "🔥 " + heatRating : "";
    }

    REACTIONS.forEach(function (r) {
      if ((counts[r.key] || 0) > (prev[r.key] || 0)) {
        burstReaction(targetEl, r.key);
      }
    });
  });

  // ---- Incoming chat messages ----

  socket.on(
    "chatMessage",
    (data) => {
      const msgEl =
        document.createElement("div");

      msgEl.className =
        "chat-message";
        
      if (messagesBox.querySelector('[data-message-id="' + data.id + '"]')) {
        console.log("[DUPLICATE] skipped message id", data.id);
        return;
      }

      msgEl.dataset.messageId =
        data.id;

      if (Object.prototype.hasOwnProperty.call(data, "profilePhoto")) {
        rememberProfilePhoto(data.handle, data.profilePhoto || "");
      }

      const textLine =
        document.createElement("p");

      textLine.className = "chat-message-line";

      const messageAvatar = createProfileAvatar(
        data.handle,
        data.profilePhoto !== undefined
          ? data.profilePhoto
          : profilePhotoByHandle[data.handle] || "",
        "chat-avatar-thumb",
        true
      );

      const messageCopy = document.createElement("span");
      messageCopy.className = "chat-message-copy";

      const handleSpan =
        document.createElement("span");

      handleSpan.className =
        "msg-handle clickable-handle";

      handleSpan.textContent =
        modTag(data.handle) + data.handle + ":"

      applyHandleColor(handleSpan, data.color);

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

      messageCopy.appendChild(
        handleSpan
      );

      messageCopy.appendChild(
        textSpan
      );

      messageCopy.appendChild(
        timeSpan
      );

      textLine.appendChild(messageAvatar);
      textLine.appendChild(messageCopy);

      const counts =
        data.counts || emptyReactionCounts();

      const reactionBar =
        buildReactionBar(
          "text",
          data.id,
          counts,
          data.heatRating || null
        );

      lastKnownCounts[reactionTargetKey("text", data.id)] =
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

      

      messagesBox.scrollTop =
        messagesBox.scrollHeight;

      const isOwnMessage =
        data.handle === myHandle;

            if (
        !isOwnMessage &&
        !isLoadingHistory
      ) {
        playSound(notifySound);
        maybeNotify(data.handle + " says:", data.text);
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
  // Recording is handled by voice.js (window.ChilliVoice).

  function startRecording() {
    window.ChilliVoice.start(myHandle, myColor);
  }

  function stopRecording(cancelled) {
    window.ChilliVoice.stop(cancelled);
  }

  let micPressActive = false;
  let micPointerId = null;
  let micStartY = 0;
  let micCancelArmed = false;

  const MIC_CANCEL_SWIPE_PX = 64;

  function setMicCancelArmed(armed) {
    if (micCancelArmed === armed) return;

    micCancelArmed = armed;
    micBtn.classList.toggle("cancel-armed", armed);

    if (recordingOverlay) {
      recordingOverlay.classList.toggle("cancel-armed", armed);
    }

    if (recordingHint) {
      recordingHint.textContent = armed
        ? "Release to cancel"
        : "Hold · swipe up to cancel · release to send";
    }

    // One clear tactile bump when crossing the cancel threshold.
    buzz(armed ? [24, 12, 24] : 10);
  }

  function beginMicPress(e) {
    if (micPressActive) return;

    e.preventDefault();

    micPressActive = true;
    micPointerId = e.pointerId;
    micStartY = e.clientY;
    micCancelArmed = false;

    micBtn.classList.add("pressed");
    micBtn.classList.remove("cancel-armed");

    if (recordingOverlay) {
      recordingOverlay.classList.remove("cancel-armed");
    }

    if (recordingHint) {
      recordingHint.textContent =
        "Hold · swipe up to cancel · release to send";
    }

    // Strong tactile confirmation when recording begins.
    buzz([20, 12, 32]);

    spawnIconRipple(micBtn, e);

    try {
      micBtn.setPointerCapture(e.pointerId);
    } catch (err) {}

    startRecording();
  }

  function moveMicPress(e) {
    if (!micPressActive || e.pointerId !== micPointerId) return;

    e.preventDefault();

    const upwardDistance = micStartY - e.clientY;
    setMicCancelArmed(upwardDistance >= MIC_CANCEL_SWIPE_PX);
  }

  function finishMicPress(cancelled, e) {
    if (!micPressActive) return;

    const shouldCancel = cancelled || micCancelArmed;

    micPressActive = false;
    micBtn.classList.remove("pressed", "cancel-armed");

    if (recordingOverlay) {
      recordingOverlay.classList.remove("cancel-armed");
    }

    if (recordingHint) {
      recordingHint.textContent =
        "Hold · swipe up to cancel · release to send";
    }

    if (e && micPointerId !== null) {
      try {
        micBtn.releasePointerCapture(micPointerId);
      } catch (err) {}
    }

    micPointerId = null;
    micCancelArmed = false;

    // Distinct tactile finish: double bump for cancel, single for send.
    buzz(shouldCancel ? [28, 18, 28] : 18);

    stopRecording(shouldCancel);
  }

  micBtn.addEventListener("pointerdown", beginMicPress);
  micBtn.addEventListener("pointermove", moveMicPress);

  micBtn.addEventListener("pointerup", (e) => {
    finishMicPress(false, e);
  });

  micBtn.addEventListener("pointercancel", (e) => {
    finishMicPress(true, e);
  });

  // Pointer capture above is the primary protection against a thumb drifting
  // off the visible mic. These window-level listeners are a safe fallback for
  // browsers/devices where pointer capture is unavailable or gets dropped.
  // They only act on the one pointer that started the active mic hold.
  window.addEventListener(
    "pointermove",
    (e) => {
      if (!micPressActive || e.pointerId !== micPointerId) return;
      moveMicPress(e);
    },
    { passive: false }
  );

  window.addEventListener(
    "pointerup",
    (e) => {
      if (!micPressActive || e.pointerId !== micPointerId) return;
      finishMicPress(false, e);
    },
    { passive: false }
  );

  window.addEventListener(
    "pointercancel",
    (e) => {
      if (!micPressActive || e.pointerId !== micPointerId) return;
      finishMicPress(true, e);
    },
    { passive: false }
  );
 socket.on(
    "voiceClip",
    (data) => {
      const msgEl =
        document.createElement("div");

      msgEl.className =
        "voice-message";
        
      if (messagesBox.querySelector('[data-clip-id="' + data.id + '"]')) {
        console.log("[DUPLICATE] skipped voice clip id", data.id);
        return;
      }

      msgEl.dataset.clipId =
        data.id;

      if (Object.prototype.hasOwnProperty.call(data, "profilePhoto")) {
        rememberProfilePhoto(data.handle, data.profilePhoto || "");
      }

      const voiceCounts = data.counts || emptyReactionCounts();
      lastKnownCounts[reactionTargetKey("voice", data.id)] = voiceCounts;

      const playBtn =
        document.createElement("button");

      playBtn.className =
        "voice-play-btn";

      playBtn.textContent = "▶";

            const audio = new Audio(data.audioData);
audio.preload = "auto";
      audio.addEventListener("pause", () => {
        isPlaying = false;
        playBtn.textContent = "▶";
      });

      audio.addEventListener("error", () => {
        const code = audio.error ? audio.error.code : "unknown";
        console.error("Voice clip audio element error, code:", code);
        showSystemMessage(
          "⚠️ Voice clip failed to load (error code " + code + ")."
        );
      });

      let isPlaying = false;

      // Single "ended" handler — previously this was registered
      // three times, causing overlapping sounds on clip finish.
      audio.addEventListener(
        "ended",
        () => {
          isPlaying = false;
          playBtn.textContent =
            "▶";

          playSound(voiceEndSound);
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
                                if (err && err.name === "AbortError") return;
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

      applyHandleColor(handleLine, data.color);

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

      const voiceAvatar = createProfileAvatar(
        data.handle,
        data.profilePhoto !== undefined
          ? data.profilePhoto
          : profilePhotoByHandle[data.handle] || "",
        "chat-avatar-thumb voice-avatar-thumb",
        true
      );

      msgEl.appendChild(
        playBtn
      );

      msgEl.appendChild(voiceAvatar);

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

      msgEl.appendChild(
        buildReactionBar(
          "voice",
          data.id,
          voiceCounts,
          data.heatRating || null
        )
      );

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

        maybeNotify(data.handle + " sent a voice clip", "🎤 Tap to open ChilliChat");
      }
    }
  );

  // ---- Ephemeral photos ----

 const MAX_PHOTO_DIMENSION = 640;
  const MAX_PHOTO_BASE64_LENGTH =
    450 * 1024;

  photoBtn.addEventListener(
    "click",
    (e) => {
      buzz([18, 10, 24]);
      spawnIconRipple(photoBtn, e);
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
        // Some mobile browsers fire "load" before the image is fully
        // decoded, which can make canvas draw it as blank/black.
        // img.decode() (where supported) guarantees full decode first.
        const proceed = () => {
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

          tryCompress(canvas, 0.5);
        };

        if (img.decode) {
          img.decode().then(proceed).catch(proceed);
        } else {
          proceed();
        }
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
      quality > 0.2
    ) {
      tryCompress(
        canvas,
        quality - 0.1
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

      if (Object.prototype.hasOwnProperty.call(data, "profilePhoto")) {
        rememberProfilePhoto(data.handle, data.profilePhoto || "");
      }

      if (data.expired) {
        renderExpiredThumb(
          msgEl,
          data.handle,
          data.color
        );
      } else {
        const photoCounts = data.counts || emptyReactionCounts();
        lastKnownCounts[reactionTargetKey("photo", data.id)] = photoCounts;

        renderActiveThumb(
          msgEl,
          data.handle,
          data.color,
          data.id,
          data.remainingMs,
          photoCounts,
          data.heatRating || null
        );

        startThumbCountdown(
          msgEl,
          data.id,
          data.remainingMs
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

        maybeNotify(data.handle + " sent a photo", "📷 Tap to open ChilliChat");
      }
    }
  );

  function renderActiveThumb(
    msgEl,
    handle,
    color,
    photoId,
    remainingMs,
    counts,
    heatRating
  ) {
    msgEl.innerHTML = "";
    msgEl.classList.remove("expired");

    const icon = document.createElement("span");
    icon.className = "photo-thumb-icon";
    icon.textContent = "📷";

    const photoAvatar = createProfileAvatar(
      handle,
      profilePhotoByHandle[handle] || "",
      "chat-avatar-thumb photo-avatar-thumb",
      true
    );

    const meta = document.createElement("div");
    meta.className = "photo-thumb-meta";

    const handleLine = document.createElement("span");
    handleLine.className = "photo-thumb-handle clickable-handle";
    handleLine.textContent = handle;
    applyHandleColor(handleLine, color);
    handleLine.addEventListener("click", (e) => {
      e.stopPropagation();
      openUserProfile(handle);
    });

    const countdown = document.createElement("span");
    countdown.className = "photo-thumb-countdown";
    countdown.textContent =
      "🔥 " + Math.ceil((remainingMs || 15000) / 1000) + "s";

    meta.appendChild(handleLine);
    meta.appendChild(countdown);

     const revealBtn = document.createElement("button");
    revealBtn.className = "photo-reveal-btn";
    revealBtn.textContent = "Reveal";
    revealBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      if (revealBtn.disabled) return;
      revealBtn.disabled = true;
      setTimeout(() => {
        revealBtn.disabled = false;
      }, 1500);

      buzz();
      socket.emit("photoOpen", { photoId });
    });

    msgEl.appendChild(icon);
    msgEl.appendChild(photoAvatar);
    msgEl.appendChild(meta);
    msgEl.appendChild(revealBtn);

    if (myIsModerator) {
      const delBtn = document.createElement("button");
      delBtn.className = "mod-delete-btn";
      delBtn.textContent = "🗑️";
      delBtn.title = "Delete photo";
      delBtn.addEventListener("click", (e) => {
        buzz();
        e.stopPropagation();
        if (confirm("Delete this photo?")) {
          socket.emit("moderatorDeletePhoto", { photoId });
        }
      });
      msgEl.appendChild(delBtn);
    }

    msgEl.appendChild(
      buildReactionBar(
        "photo",
        photoId,
        counts || emptyReactionCounts(),
        heatRating || null
      )
    );
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

    const expiredPhotoAvatar = createProfileAvatar(
      handle,
      profilePhotoByHandle[handle] || "",
      "chat-avatar-thumb photo-avatar-thumb",
      true
    );

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

    applyHandleColor(handleLine, color);

    const hint =
      document.createElement(
        "span"
      );

    hint.className =
      "photo-thumb-hint";

    hint.textContent =
      "🔥 Burned away";

    meta.appendChild(
      handleLine
    );

    meta.appendChild(
      hint
    );

    msgEl.appendChild(
      icon
    );

    msgEl.appendChild(expiredPhotoAvatar);

    msgEl.appendChild(
      meta
    );
  }

  let photoCountdownInterval =
    null;

  const photoCountdownIntervals = {};
  let currentlyViewedPhotoId = null;

  function clearPhotoCountdown(photoId) {
    if (photoCountdownIntervals[photoId]) {
      clearInterval(
        photoCountdownIntervals[photoId]
      );
      delete photoCountdownIntervals[
        photoId
      ];
    }
  }

  function startThumbCountdown(
    msgEl,
    photoId,
    remainingMs
  ) {
    clearPhotoCountdown(photoId);

    const countdownEl =
      msgEl.querySelector(
        ".photo-thumb-countdown"
      );

    if (!countdownEl) return;

    let msLeft = remainingMs;

    function tick() {
      const secondsLeft = Math.max(
        Math.ceil(msLeft / 1000),
        0
      );

      countdownEl.textContent =
        "🔥 " + secondsLeft + "s";

      if (msLeft <= 0) {
        clearPhotoCountdown(photoId);
        burnThumb(msgEl, photoId);
        return;
      }

      msLeft -= 1000;
    }

    tick();

    photoCountdownIntervals[photoId] =
      setInterval(tick, 1000);
  }

  function burnThumb(msgEl, photoId) {
    clearPhotoCountdown(photoId);
    delete lastKnownCounts[reactionTargetKey("photo", photoId)];

    if (
      !msgEl ||
      !msgEl.classList.contains(
        "photo-thumb"
      ) ||
      msgEl.classList.contains(
        "burning"
      ) ||
      msgEl.classList.contains(
        "expired"
      )
    ) {
      if (
        currentlyViewedPhotoId ===
        photoId
      ) {
        closePhotoViewer();
      }
      return;
    }

    msgEl.classList.add("burning");

    const handleColor =
      msgEl.querySelector(
        ".photo-thumb-handle"
      );

    const handleText =
      handleColor
        ? handleColor.textContent
        : "";

    const onBurnEnd = () => {
      msgEl.removeEventListener(
        "animationend",
        onBurnEnd
      );

      msgEl.classList.remove(
        "burning"
      );

      renderExpiredThumb(
        msgEl,
        handleText,
        ""
      );
    };

    msgEl.addEventListener(
      "animationend",
      onBurnEnd
    );

    if (
      currentlyViewedPhotoId ===
      photoId
    ) {
      closePhotoViewer();
    }
  }

  socket.on(
    "photoExpired",
    ({ photoId }) => {
      const thumbEl =
        messagesBox.querySelector(
          '[data-photo-id="' +
            photoId +
            '"]'
        );

      burnThumb(thumbEl, photoId);
    }
  );

 socket.on(
    "photoResult",
    ({
      photoId,
      imageData,
      expired,
      remainingMs,
    }) => {
      if (
        expired ||
        !imageData
      ) {
        const thumbEl =
          messagesBox.querySelector(
            '[data-photo-id="' +
              photoId +
              '"]'
          );

        burnThumb(thumbEl, photoId);
        return;
      }

      currentlyViewedPhotoId =
        photoId;

      openPhotoViewer(
        imageData,
        Math.max(
          Math.ceil(
            (remainingMs || 15000) /
              1000
          ),
          1
        )
      );
    }
  );

     let photoViewerGeneration = 0;

  function openPhotoViewer(imageData, totalSeconds) {
    photoViewerGeneration += 1;
    const thisGeneration = photoViewerGeneration;

    // Guards against a stale/aborted previous load's error event firing
    // this message for the photo that's actually showing now — this is
    // what caused repeated false "couldn't display" messages, especially
    // on Android where rapid taps can overlap two photo loads.
    photoViewerImg.onerror = () => {
      if (thisGeneration !== photoViewerGeneration) return;
      showSystemMessage("⚠️ Couldn't display that photo.");
      closePhotoViewer();
    };

    photoViewerImg.src = imageData;
    photoViewerOverlay.classList.remove("hidden");

    let secondsLeft = totalSeconds;

    photoCountdownText.textContent = secondsLeft + "s";
    photoCountdownFill.style.width = "100%";

    clearInterval(photoCountdownInterval);

    photoCountdownInterval = setInterval(() => {
      secondsLeft -= 1;

      photoCountdownText.textContent =
        Math.max(secondsLeft, 0) + "s";

      photoCountdownFill.style.width =
        Math.max((secondsLeft / totalSeconds) * 100, 0) + "%";

      if (secondsLeft <= 0) {
        clearInterval(photoCountdownInterval);
        closePhotoViewer();
      }
    }, 1000);
  }

     function closePhotoViewer() {
    photoViewerOverlay.classList.add(
      "hidden"
    );

    // Bump the generation so any error from this now-closed load
    // (including the empty-src trigger some mobile browsers fire)
    // is ignored rather than showing a stale message.
    photoViewerGeneration += 1;
    photoViewerImg.onerror = null;
    photoViewerImg.src = "";

    clearInterval(
      photoCountdownInterval
    );

    currentlyViewedPhotoId = null;
  }

  photoViewerOverlay.addEventListener(
    "click",
    () => {
      buzz();
      closePhotoViewer();
    }
  );


  // ---- Location sharing ----

  const STORAGE_LOCATION_KEY = "chillichat_location_enabled";
  const STORAGE_LOCATION_LAT_KEY = "chillichat_location_lat";
  const STORAGE_LOCATION_LON_KEY = "chillichat_location_lon";

  const locationToggle = document.getElementById("location-toggle");
  const mapToggleBtn = document.getElementById("map-toggle-btn");
  const mapOverlay = document.getElementById("map-overlay");
  const mapCloseBtn = document.getElementById("map-close-btn");
  const mapCanvas = document.getElementById("map-canvas");
  const mapHomeBtn = document.getElementById("map-home-btn");
  const mapFitBtn = document.getElementById("map-fit-btn");
  const mapRegionBtns = Array.from(document.querySelectorAll("[data-map-region]"));
  const mapShortcutBtns = [
    mapHomeBtn,
    mapFitBtn,
    ...mapRegionBtns,
  ].filter(Boolean);
  const mapWeatherHud = document.getElementById("map-weather-hud");
  const mapDataStatus = document.getElementById("map-data-status");
  const flightsToggle = document.getElementById("flights-toggle");
  const poisToggle = document.getElementById("pois-toggle");
  const earthquakesToggle = document.getElementById("earthquakes-toggle");

  function syncMapOverlayViewport() {
    const appHeader = document.querySelector(".app-header");
    const headerBottom = appHeader
      ? Math.max(0, Math.round(appHeader.getBoundingClientRect().bottom))
      : 0;

    // Keep the top ChilliChat icon row visible and clickable while Radar is open.
    // The map fills only the viewport below the header instead of sitting behind it.
    mapOverlay.style.top = headerBottom + "px";
  }

  let myJitteredLat = null;
  let myJitteredLon = null;
  let knownLocations = [];
  let knownFlights = [];
  let knownFlightRegion = null;
  let knownPois = [];
  let knownEarthquakes = [];
  let mapPoisRequested = false;
  let mapEarthquakesRequested = false;

  function milesToDegreesLat(miles) {
    return miles / 69;
  }

  function milesToDegreesLon(miles, atLat) {
    const cos = Math.max(Math.cos((atLat * Math.PI) / 180), 0.01);
    return miles / (69 * cos);
  }

  function jitterLocation(lat, lon) {
    const angle = Math.random() * Math.PI * 2;
    const distanceMiles = Math.random() * 10;

    const dLat = milesToDegreesLat(distanceMiles) * Math.sin(angle);
    const dLon = milesToDegreesLon(distanceMiles, lat) * Math.cos(angle);

    return { lat: lat + dLat, lon: lon + dLon };
  }

  function sendLocationUpdate(enabled) {
    if (!enabled) {
      socket.emit("updateLocation", { enabled: false });
      return;
    }

    if (myJitteredLat !== null && myJitteredLon !== null) {
      socket.emit("updateLocation", {
        enabled: true,
        lat: myJitteredLat,
        lon: myJitteredLon,
      });
      return;
    }

    if (!window.isSecureContext) {
      showSystemMessage(
        "⚠️ Location needs a secure (https://) connection. This page isn't loaded over https, so browsers block location access here."
      );
      locationToggle.checked = false;
      return;
    }

    if (!navigator.geolocation) {
      showSystemMessage("⚠️ Location isn't supported in this browser.");
      locationToggle.checked = false;
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const jittered = jitterLocation(pos.coords.latitude, pos.coords.longitude);

        myJitteredLat = jittered.lat;
        myJitteredLon = jittered.lon;

        safeStorage.setItem(STORAGE_LOCATION_LAT_KEY, String(jittered.lat));
        safeStorage.setItem(STORAGE_LOCATION_LON_KEY, String(jittered.lon));

        socket.emit("updateLocation", {
          enabled: true,
          lat: jittered.lat,
          lon: jittered.lon,
        });
      },
      (err) => {
        console.error("Geolocation error:", err.code, err.message);

        let reason;
        if (err.code === 1) {
          reason =
            "Permission denied. Check your browser's site settings AND your device/OS location settings (Windows Settings > Privacy > Location, or your phone's Location toggle) — both must allow it.";
        } else if (err.code === 2) {
          reason = "Your device couldn't determine a position right now.";
        } else if (err.code === 3) {
          reason = "Location request timed out.";
        } else {
          reason = "Unknown error (" + err.message + ").";
        }

        showSystemMessage("⚠️ Couldn't get your location: " + reason);
        locationToggle.checked = false;
        safeStorage.setItem(STORAGE_LOCATION_KEY, "false");
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  locationToggle.addEventListener("change", () => {
    buzz();

    const enabled = locationToggle.checked;
    safeStorage.setItem(STORAGE_LOCATION_KEY, String(enabled));

    if (!enabled) {
      myJitteredLat = null;
      myJitteredLon = null;
      safeStorage.removeItem(STORAGE_LOCATION_LAT_KEY);
      safeStorage.removeItem(STORAGE_LOCATION_LON_KEY);
      knownPois = [];
      mapPoisRequested = false;
    }

    sendLocationUpdate(enabled);
  });

  function restoreLocationPreference() {
    const wasEnabled = safeStorage.getItem(STORAGE_LOCATION_KEY) === "true";
    if (!wasEnabled) return;

    const savedLat = parseFloat(safeStorage.getItem(STORAGE_LOCATION_LAT_KEY));
    const savedLon = parseFloat(safeStorage.getItem(STORAGE_LOCATION_LON_KEY));

    locationToggle.checked = true;

    if (!isNaN(savedLat) && !isNaN(savedLon)) {
      myJitteredLat = savedLat;
      myJitteredLon = savedLon;
    }

    sendLocationUpdate(true);
  }

  socket.on("locationsUpdate", (locations) => {
    knownLocations = locations || [];
    updateWeatherHud();

    if (!mapOverlay.classList.contains("hidden") && mapInitialFocusPending) {
      mapInitialFocusPending = false;
      requestAnimationFrame(() => focusMapHome());
    } else {
      drawMap();
    }
  });

  socket.on("flightsUpdate", (payload) => {
    if (Array.isArray(payload)) {
      knownFlights = payload;
      knownFlightRegion = "legacy";
    } else {
      knownFlights = (payload && payload.flights) || [];
      knownFlightRegion = payload && payload.region ? payload.region : null;
    }
    updateMapDataStatus();
    drawMap();
  });

  socket.on("mapPoisUpdate", (payload) => {
    knownPois = (payload && payload.pois) || [];
    mapPoisRequested = true;
    updateMapDataStatus();
    drawMap();
  });

  socket.on("earthquakesUpdate", (payload) => {
    knownEarthquakes = (payload && payload.earthquakes) || [];
    mapEarthquakesRequested = true;
    updateMapDataStatus();
    drawMap();
  });

  function isUkCoordinate(lat, lon) {
    return lat >= 49.0 && lat <= 61.5 && lon >= -9.5 && lon <= 3.5;
  }

  function isAustraliaCoordinate(lat, lon) {
    return lat >= -45.5 && lat <= -9.0 && lon >= 111.0 && lon <= 155.5;
  }

  function isNorthAmericaCoordinate(lat, lon) {
    return lat >= 15 && lat <= 85 && lon >= -171 && lon <= -50;
  }

  function homeMacroRegion(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "world";
    if (isUkCoordinate(lat, lon)) return "uk";
    if (isAustraliaCoordinate(lat, lon)) return "australia";
    if (isNorthAmericaCoordinate(lat, lon)) return "north-america";
    return "world";
  }

  function preferredFlightRegion(lat, lon) {
    const macro = homeMacroRegion(lat, lon);
    if (macro === "uk") return "uk";
    if (macro === "australia") return "australia";
    if (macro === "north-america") {
      // This is only an automatic default. The separate USA and CANADA
      // buttons let border-area users explicitly choose either national feed.
      return lat >= 49 ? "canada" : "usa";
    }
    return null;
  }

  function getOwnRadarLocation() {
    const mine = knownLocations.find((loc) => loc.handle === myHandle);
    if (mine && Number.isFinite(mine.lat) && Number.isFinite(mine.lon)) return mine;

    if (myJitteredLat !== null && myJitteredLon !== null) {
      return { handle: myHandle, lat: myJitteredLat, lon: myJitteredLon };
    }

    return null;
  }

  function selectAqiForLocation(loc) {
    if (!loc || !loc.aqi) return null;

    const macro = homeMacroRegion(loc.lat, loc.lon);
    if (macro === "uk" && loc.aqi.eu) {
      return { ...loc.aqi.eu, scheme: "EU" };
    }

    if ((macro === "north-america" || macro === "australia") && loc.aqi.us) {
      return { ...loc.aqi.us, scheme: "US" };
    }

    if (loc.aqi.eu) return { ...loc.aqi.eu, scheme: "EU" };
    if (loc.aqi.us) return { ...loc.aqi.us, scheme: "US" };

    if (Number.isFinite(loc.aqi.value)) {
      return {
        value: loc.aqi.value,
        label: loc.aqi.label || "",
        color: loc.aqi.color || themePrimary(),
        scheme: "",
      };
    }

    return null;
  }

  function updateWeatherHud() {
    if (!mapWeatherHud) return;

    const mine = knownLocations.find((loc) => loc.handle === myHandle);

    if (!mine || !mine.weather) {
      mapWeatherHud.textContent = locationToggle.checked
        ? "HOME DATA: waiting for weather / AQI…"
        : "HOME DATA: enable Location Sharing for local weather / AQI";
      return;
    }

    let text =
      "HOME: " +
      mine.weather.icon + " " +
      mine.weather.tempC + "°C " +
      mine.weather.desc;

    if (Number.isFinite(mine.weather.feelsC)) {
      text += " · FEELS " + mine.weather.feelsC + "°";
    }

    if (Number.isFinite(mine.weather.windKmh)) {
      text += " · WIND " + mine.weather.windKmh + "km/h";
    }

    const aqi = selectAqiForLocation(mine);
    if (aqi) {
      text += " · " + (aqi.scheme ? aqi.scheme + "-" : "") + "AQI " + aqi.value + " " + aqi.label;
    }

    if (mine.aqi && Number.isFinite(mine.aqi.pm25)) {
      text += " · PM2.5 " + mine.aqi.pm25;
    }

    mapWeatherHud.textContent = text;
  }

  function getVisibleEarthquakes() {
    if (!mapEarthquakesRequested || !mapCanvas) return [];

    const w = mapCanvas.width;
    const h = mapCanvas.height;
    if (!w || !h) return [];

    const dpr = window.devicePixelRatio || 1;
    const origin = getMapOrigin();
    const centerX = w / 2 + mapOffsetX;
    const centerY = h / 2 + mapOffsetY;

    return knownEarthquakes.filter((quake) => {
      if (
        !Number.isFinite(quake.lat) ||
        !Number.isFinite(quake.lon) ||
        !Number.isFinite(quake.magnitude)
      ) {
        return false;
      }

      const point = mapPoint(
        quake.lat,
        quake.lon,
        origin,
        centerX,
        centerY
      );

      // Count only earthquakes that belong to the map area the user can
      // actually see. This keeps UK/USA/Canada/Australia/HOME/FIT USERS
      // totals honest instead of repeating the global USGS feed total.
      return isPointNearCanvas(point, w, h, 0 * dpr);
    });
  }

  function updateMapDataStatus(extraText) {
    if (!mapDataStatus) return;

    const parts = [];
    if (flightsToggle && flightsToggle.checked) {
      parts.push("FLIGHTS " + knownFlights.length + (knownFlightRegion ? " [" + knownFlightRegion.toUpperCase() + "]" : ""));
    }
    if (poisToggle && poisToggle.checked) {
      parts.push(mapPoisRequested ? "PLACES " + knownPois.length : "PLACES …");
    }
    if (earthquakesToggle && earthquakesToggle.checked) {
      parts.push(
        mapEarthquakesRequested
          ? "QUAKES " + getVisibleEarthquakes().length
          : "QUAKES …"
      );
    }
    if (extraText) parts.unshift(extraText);

    mapDataStatus.textContent = parts.length ? parts.join("  ·  ") : "LAYERS OFF";
  }

  // ---- Global retro radar map ----
  // The user's own approximate shared location is the default point of view.
  // Great-circle distance + bearing keeps mates on other continents correctly
  // positioned while HOME/UK/USA/CANADA/AUSTRALIA give intentional views.

  const EARTH_RADIUS_MILES = 3958.7613;
  const MAP_DEFAULT_LOCAL_SCALE = 0.55;
  const MAP_MIN_SCALE = 0.012;
  const MAP_MAX_SCALE = 60;

  let mapScale = MAP_DEFAULT_LOCAL_SCALE;
  let mapOffsetX = 0;
  let mapOffsetY = 0;
  let mapDragging = false;
  let mapLastX = 0;
  let mapLastY = 0;
  let mapGeography = null;
  let mapGeographyLoading = false;
  let mapInitialFocusPending = true;
  let currentMapView = "home";

  const MAP_GEOGRAPHY_SPECS = {
    uk: { label: "UNITED KINGDOM", lat: 54.6, lon: -3.2, radiusMiles: 520 },
    "north-america": { label: "NORTH AMERICA", lat: 49.0, lon: -106.0, radiusMiles: 4300 },
    australia: { label: "AUSTRALIA", lat: -25.3, lon: 133.8, radiusMiles: 2200 },
  };

  const MAP_REGION_SPECS = {
    uk: { label: "UNITED KINGDOM", lat: 54.6, lon: -3.2, scale: 0.72, flightRegion: "uk" },
    usa: { label: "UNITED STATES", lat: 39.5, lon: -98.5, scale: 0.057, flightRegion: "usa" },
    canada: { label: "CANADA", lat: 57.0, lon: -106.0, scale: 0.044, flightRegion: "canada" },
    australia: { label: "AUSTRALIA", lat: -25.3, lon: 133.8, scale: 0.105, flightRegion: "australia" },
  };

  const MAP_CITIES = [
    // UK
    { name: "London", lat: 51.5074, lon: -0.1278, minScale: 0.16 },
    { name: "Manchester", lat: 53.4808, lon: -2.2426, minScale: 0.24 },
    { name: "Birmingham", lat: 52.4862, lon: -1.8904, minScale: 0.24 },
    { name: "Edinburgh", lat: 55.9533, lon: -3.1883, minScale: 0.20 },
    { name: "Glasgow", lat: 55.8642, lon: -4.2518, minScale: 0.24 },
    { name: "Cardiff", lat: 51.4816, lon: -3.1791, minScale: 0.28 },
    { name: "Belfast", lat: 54.5973, lon: -5.9301, minScale: 0.24 },
    { name: "Nottingham", lat: 52.9548, lon: -1.1581, minScale: 0.34 },
    // USA
    { name: "Washington DC", lat: 38.9072, lon: -77.0369, minScale: 0.052 },
    { name: "New York", lat: 40.7128, lon: -74.0060, minScale: 0.052 },
    { name: "Boston", lat: 42.3601, lon: -71.0589, minScale: 0.070 },
    { name: "Chicago", lat: 41.8781, lon: -87.6298, minScale: 0.058 },
    { name: "Atlanta", lat: 33.7490, lon: -84.3880, minScale: 0.068 },
    { name: "Miami", lat: 25.7617, lon: -80.1918, minScale: 0.070 },
    { name: "Dallas", lat: 32.7767, lon: -96.7970, minScale: 0.064 },
    { name: "Houston", lat: 29.7604, lon: -95.3698, minScale: 0.070 },
    { name: "Denver", lat: 39.7392, lon: -104.9903, minScale: 0.064 },
    { name: "Phoenix", lat: 33.4484, lon: -112.0740, minScale: 0.070 },
    { name: "Los Angeles", lat: 34.0522, lon: -118.2437, minScale: 0.052 },
    { name: "San Francisco", lat: 37.7749, lon: -122.4194, minScale: 0.066 },
    { name: "Seattle", lat: 47.6062, lon: -122.3321, minScale: 0.064 },
    // Canada
    { name: "Ottawa", lat: 45.4215, lon: -75.6972, minScale: 0.050 },
    { name: "Toronto", lat: 43.6532, lon: -79.3832, minScale: 0.055 },
    { name: "Montreal", lat: 45.5017, lon: -73.5673, minScale: 0.060 },
    { name: "Quebec City", lat: 46.8139, lon: -71.2080, minScale: 0.068 },
    { name: "Winnipeg", lat: 49.8951, lon: -97.1384, minScale: 0.060 },
    { name: "Calgary", lat: 51.0447, lon: -114.0719, minScale: 0.060 },
    { name: "Edmonton", lat: 53.5461, lon: -113.4938, minScale: 0.064 },
    { name: "Vancouver", lat: 49.2827, lon: -123.1207, minScale: 0.055 },
    { name: "Halifax", lat: 44.6488, lon: -63.5752, minScale: 0.070 },
    // Australia
    { name: "Canberra", lat: -35.2809, lon: 149.1300, minScale: 0.082 },
    { name: "Sydney", lat: -33.8688, lon: 151.2093, minScale: 0.082 },
    { name: "Melbourne", lat: -37.8136, lon: 144.9631, minScale: 0.090 },
    { name: "Brisbane", lat: -27.4698, lon: 153.0251, minScale: 0.090 },
    { name: "Perth", lat: -31.9523, lon: 115.8613, minScale: 0.090 },
    { name: "Adelaide", lat: -34.9285, lon: 138.6007, minScale: 0.100 },
    { name: "Hobart", lat: -42.8821, lon: 147.3272, minScale: 0.120 },
    { name: "Darwin", lat: -12.4634, lon: 130.8456, minScale: 0.120 },
  ];

  function resizeMapCanvas() {
    const rect = mapCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    mapCanvas.width = Math.max(1, Math.round(rect.width * dpr));
    mapCanvas.height = Math.max(1, Math.round(rect.height * dpr));
  }

  function toRadians(value) {
    return (value * Math.PI) / 180;
  }

  function milesBetween(lat1, lon1, lat2, lon2) {
    const phi1 = toRadians(lat1);
    const phi2 = toRadians(lat2);
    const deltaPhi = toRadians(lat2 - lat1);
    const deltaLambda = toRadians(lon2 - lon1);

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) *
      Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

    const angularDistance = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
    const distanceMiles = EARTH_RADIUS_MILES * angularDistance;

    const y = Math.sin(deltaLambda) * Math.cos(phi2);
    const x =
      Math.cos(phi1) * Math.sin(phi2) -
      Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
    const bearing = Math.atan2(y, x);

    return {
      dxMiles: distanceMiles * Math.sin(bearing),
      dyMiles: -distanceMiles * Math.cos(bearing),
      distanceMiles,
    };
  }

  function getMapOrigin() {
    const mine = getOwnRadarLocation();
    if (mine) return { lat: mine.lat, lon: mine.lon, isMine: true };

    const first = knownLocations.find(
      (loc) => Number.isFinite(loc.lat) && Number.isFinite(loc.lon)
    );

    if (first) return { lat: first.lat, lon: first.lon, isMine: false };

    return { lat: 54.6, lon: -3.2, isMine: false };
  }

  async function loadRadarGeography() {
    if (mapGeography || mapGeographyLoading) return;

    mapGeographyLoading = true;

    try {
      const response = await fetch("radar-geography.json?v=2", { cache: "force-cache" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      mapGeography = await response.json();
      drawMap();
    } catch (err) {
      console.error("Radar geography load error:", err);
      showSystemMessage("⚠️ Radar outlines couldn't be loaded. User locations will still work.");
    } finally {
      mapGeographyLoading = false;
    }
  }

  function mapPoint(lat, lon, origin, centerX, centerY) {
    const dpr = window.devicePixelRatio || 1;
    const vector = milesBetween(origin.lat, origin.lon, lat, lon);

    return {
      x: centerX + vector.dxMiles * mapScale * dpr,
      y: centerY + vector.dyMiles * mapScale * dpr,
      distanceMiles: vector.distanceMiles,
    };
  }

  function isPointNearCanvas(point, w, h, marginPx) {
    return (
      point.x >= -marginPx &&
      point.x <= w + marginPx &&
      point.y >= -marginPx &&
      point.y <= h + marginPx
    );
  }

  function drawLineCollection(ctx, lines, origin, centerX, centerY, w, h, strokeStyle, lineWidth) {
    if (!Array.isArray(lines)) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth * dpr;

    lines.forEach((line) => {
      if (!Array.isArray(line) || line.length < 2) return;

      const projected = line.map((point) =>
        mapPoint(point[0], point[1], origin, centerX, centerY)
      );

      const margin = 40 * dpr;
      if (!projected.some((point) => isPointNearCanvas(point, w, h, margin))) return;

      ctx.beginPath();
      projected.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    });
  }

  function regionLikelyVisible(origin, spec, centerX, centerY, w, h) {
    const dpr = window.devicePixelRatio || 1;
    const center = mapPoint(spec.lat, spec.lon, origin, centerX, centerY);
    const radiusPx = spec.radiusMiles * mapScale * dpr;
    const margin = Math.max(radiusPx, 80 * dpr);
    return isPointNearCanvas(center, w, h, margin);
  }

  function drawGeography(ctx, origin, centerX, centerY, w, h) {
    if (!mapGeography) return;

    Object.entries(MAP_GEOGRAPHY_SPECS).forEach(([key, spec]) => {
      const region = mapGeography[key];
      if (!region) return;
      if (!regionLikelyVisible(origin, spec, centerX, centerY, w, h)) return;

      drawLineCollection(ctx, region.coast, origin, centerX, centerY, w, h, themeRgba(0.50), 1.15);
      drawLineCollection(ctx, region.borders, origin, centerX, centerY, w, h, themeRgba(0.28), 0.8);

      const labelPoint = mapPoint(spec.lat, spec.lon, origin, centerX, centerY);
      if (isPointNearCanvas(labelPoint, w, h, 15 * (window.devicePixelRatio || 1))) {
        ctx.fillStyle = themeRgba(0.42);
        ctx.font = "bold " + 10 * (window.devicePixelRatio || 1) + "px monospace";
        ctx.textAlign = "center";
        ctx.fillText(spec.label, labelPoint.x, labelPoint.y);
      }
    });
  }

  function formatDistanceMiles(distanceMiles) {
    if (distanceMiles < 5) return "<5mi";
    if (distanceMiles < 100) return "≈" + Math.round(distanceMiles / 10) * 10 + "mi";
    if (distanceMiles < 1000) return "≈" + Math.round(distanceMiles / 50) * 50 + "mi";
    return "≈" + Math.round(distanceMiles / 100) * 100 + "mi";
  }

  function requestFlightsForRegion(regionKey) {
    if (!flightsToggle || !flightsToggle.checked || !regionKey) return;
    knownFlights = [];
    knownFlightRegion = regionKey;
    updateMapDataStatus("LOADING " + regionKey.toUpperCase() + " FLIGHTS");
    socket.emit("getFlights", { region: regionKey });
  }

  function requestHomePois() {
    if (!poisToggle || !poisToggle.checked) return;
    if (!locationToggle.checked) {
      updateMapDataStatus("PLACES NEED LOCATION");
      return;
    }
    mapPoisRequested = false;
    updateMapDataStatus("LOADING LOCAL PLACES");
    socket.emit("getMapPois");
  }

  function requestEarthquakes() {
    if (!earthquakesToggle || !earthquakesToggle.checked) return;
    mapEarthquakesRequested = false;
    updateMapDataStatus("LOADING QUAKES");
    socket.emit("getEarthquakes");
  }

  function setActiveMapShortcut(viewKey) {
    mapShortcutBtns.forEach((btn) => {
      let btnView = "";
      if (btn === mapHomeBtn) btnView = "home";
      else if (btn === mapFitBtn) btnView = "all-users";
      else btnView = btn.dataset.mapRegion || "";

      const active = btnView === viewKey;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function fitMapToUsers() {
    const origin = getMapOrigin();
    const rect = mapCanvas.getBoundingClientRect();
    const candidates = knownLocations.filter(
      (loc) => Number.isFinite(loc.lat) && Number.isFinite(loc.lon)
    );

    currentMapView = "all-users";
    setActiveMapShortcut(currentMapView);
    mapOffsetX = 0;
    mapOffsetY = 0;

    if (candidates.length === 0) {
      mapScale = MAP_DEFAULT_LOCAL_SCALE;
      drawMap();
      return;
    }

    let farthest = 0;
    candidates.forEach((loc) => {
      const distance = milesBetween(origin.lat, origin.lon, loc.lat, loc.lon).distanceMiles;
      farthest = Math.max(farthest, distance);
    });

    if (farthest < 25) {
      mapScale = MAP_DEFAULT_LOCAL_SCALE;
    } else {
      const availableRadiusCssPx = Math.max(90, Math.min(rect.width, rect.height) * 0.38);
      const targetScale = availableRadiusCssPx / farthest;
      mapScale = Math.max(MAP_MIN_SCALE, Math.min(6, targetScale));
    }

    const mine = getOwnRadarLocation();
    if (mine) requestFlightsForRegion(preferredFlightRegion(mine.lat, mine.lon));
    drawMap();
  }

  function focusMapHome() {
    const mine = getOwnRadarLocation();

    if (!mine) {
      currentMapView = "all-users";
      fitMapToUsers();
      updateMapDataStatus("HOME NEEDS LOCATION");
      return;
    }

    currentMapView = "home";
    setActiveMapShortcut(currentMapView);
    mapOffsetX = 0;
    mapOffsetY = 0;

    const macro = homeMacroRegion(mine.lat, mine.lon);
    if (macro === "uk") mapScale = 0.72;
    else if (macro === "australia") mapScale = 0.105;
    else if (macro === "north-america") mapScale = 0.055;
    else mapScale = 0.18;

    requestFlightsForRegion(preferredFlightRegion(mine.lat, mine.lon));
    if (poisToggle && poisToggle.checked && !mapPoisRequested) requestHomePois();
    if (earthquakesToggle && earthquakesToggle.checked && !mapEarthquakesRequested) requestEarthquakes();
    drawMap();
  }

  function focusMapRegion(regionKey) {
    const spec = MAP_REGION_SPECS[regionKey];
    if (!spec) return;

    const origin = getMapOrigin();
    const dpr = window.devicePixelRatio || 1;
    const vector = milesBetween(origin.lat, origin.lon, spec.lat, spec.lon);

    currentMapView = regionKey;
    setActiveMapShortcut(currentMapView);
    mapScale = spec.scale;
    mapOffsetX = -vector.dxMiles * mapScale * dpr;
    mapOffsetY = -vector.dyMiles * mapScale * dpr;
    mapInitialFocusPending = false;
    requestFlightsForRegion(spec.flightRegion);
    drawMap();
  }

  function poiGlyph(category) {
    if (category === "airport") return "✈";
    if (category === "hospital") return "+";
    if (category === "stadium") return "S";
    if (category === "museum") return "M";
    if (category === "viewpoint") return "V";
    if (category === "zoo") return "Z";
    if (category === "historic") return "◆";
    return "•";
  }

  function drawMap() {
    if (mapOverlay.classList.contains("hidden")) return;

    const ctx = mapCanvas.getContext("2d");
    const w = mapCanvas.width;
    const h = mapCanvas.height;
    const dpr = window.devicePixelRatio || 1;

    if (w === 0 || h === 0) return;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = themeRgba(0.26);
    ctx.lineWidth = 1;
    const gridSize = 40 * dpr;

    for (let x = mapOffsetX % gridSize; x < w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    for (let y = mapOffsetY % gridSize; y < h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const centerX = w / 2 + mapOffsetX;
    const centerY = h / 2 + mapOffsetY;
    const origin = getMapOrigin();

    const ringDistances = [10, 25, 50, 100, 250, 500, 1000, 2000, 3000, 5000, 7500, 10000, 12500];
    const maxVisibleRadius = Math.hypot(w, h) * 0.78;
    const minRingGap = 30 * dpr;
    let lastRingRadius = null;

    ctx.strokeStyle = themeRgba(0.38);
    ctx.fillStyle = themeRgba(0.58);
    ctx.font = 9 * dpr + "px monospace";
    ctx.textAlign = "left";

    ringDistances.forEach((miles) => {
      const radius = miles * mapScale * dpr;
      if (radius > maxVisibleRadius || radius < 8 * dpr) return;

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.stroke();

      if (lastRingRadius === null || radius - lastRingRadius >= minRingGap) {
        ctx.fillText(miles >= 1000 ? miles / 1000 + "k mi" : miles + "mi", centerX + radius + 3 * dpr, centerY - 3 * dpr);
        lastRingRadius = radius;
      }
    });

    ctx.fillStyle = themePrimary();
    ctx.font = "bold " + 12 * dpr + "px monospace";
    ctx.textAlign = "center";
    ctx.fillText("N", w / 2, 16 * dpr);

    drawGeography(ctx, origin, centerX, centerY, w, h);

    MAP_CITIES.forEach((city) => {
      if (mapScale < city.minScale) return;
      const point = mapPoint(city.lat, city.lon, origin, centerX, centerY);
      if (!isPointNearCanvas(point, w, h, 15 * dpr)) return;

      ctx.beginPath();
      ctx.arc(point.x, point.y, 2 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = "#4d5eff";
      ctx.fill();
      ctx.font = 9 * dpr + "px monospace";
      ctx.textAlign = "center";
      ctx.fillText(city.name, point.x, point.y - 6 * dpr);
    });

    // The server keeps one cached global USGS feed. The client filters that
    // feed to the CURRENT visible radar area before drawing it, so each
    // country/home view shows only the earthquakes relevant to that view.
    if (earthquakesToggle && earthquakesToggle.checked) {
      getVisibleEarthquakes().forEach((quake) => {
        const point = mapPoint(quake.lat, quake.lon, origin, centerX, centerY);

        const radius = Math.max(2.5, Math.min(9, 1.5 + quake.magnitude)) * dpr;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = quake.tsunami ? "#ff1744" : "#ff5f1f";
        ctx.lineWidth = (quake.tsunami ? 2 : 1) * dpr;
        ctx.stroke();

        if (mapScale >= 0.075) {
          ctx.fillStyle = "#ff9a66";
          ctx.font = 8 * dpr + "px monospace";
          ctx.textAlign = "center";
          ctx.fillText("M" + quake.magnitude.toFixed(1), point.x, point.y - radius - 3 * dpr);
        }
      });
    }

    // OpenStreetMap POIs are local to the viewer's approximate shared location.
    if (poisToggle && poisToggle.checked && mapScale >= 0.16) {
      knownPois.forEach((poi) => {
        const point = mapPoint(poi.lat, poi.lon, origin, centerX, centerY);
        if (!isPointNearCanvas(point, w, h, 50 * dpr)) return;

        ctx.fillStyle = "#ff00dd";
        ctx.font = "bold " + 10 * dpr + "px monospace";
        ctx.textAlign = "center";
        ctx.fillText(poiGlyph(poi.category), point.x, point.y);

        if (mapScale >= 0.34) {
          ctx.fillStyle = "#ff7bea";
          ctx.font = 8 * dpr + "px monospace";
          ctx.fillText(poi.name, point.x, point.y - 9 * dpr);
        }
      });
    }

    const myMapLocation = knownLocations.find((loc) => loc.handle === myHandle);
    const canMeasureFromMe = !!myMapLocation || (myJitteredLat !== null && myJitteredLon !== null);

    knownLocations.forEach((loc) => {
      if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return;

      const vector = milesBetween(origin.lat, origin.lon, loc.lat, loc.lon);
      const px = centerX + vector.dxMiles * mapScale * dpr;
      const py = centerY + vector.dyMiles * mapScale * dpr;
      const isMe = loc.handle === myHandle;

      if (!isPointNearCanvas({ x: px, y: py }, w, h, 80 * dpr)) return;

      if (!isMe && canMeasureFromMe && origin.isMine) {
        const alpha = Math.max(0.12, Math.min(0.72, 1 - vector.distanceMiles / 12000));
        ctx.strokeStyle = themeRgba(alpha.toFixed(2));
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(px, py);
        ctx.stroke();

        ctx.fillStyle = colorMixForRadar();
        ctx.font = 9 * dpr + "px monospace";
        ctx.textAlign = "center";
        ctx.fillText(formatDistanceMiles(vector.distanceMiles), (centerX + px) / 2, (centerY + py) / 2 - 4 * dpr);
      }

      ctx.beginPath();
      ctx.arc(px, py, 5 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = isMe ? "#ffee00" : (loc.color || themePrimary());
      ctx.shadowColor = isMe ? "#ffee00" : (loc.color || themePrimary());
      ctx.shadowBlur = 8 * dpr;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = isMe ? "#ffee00" : themePrimary();
      ctx.font = 11 * dpr + "px monospace";
      ctx.textAlign = "center";
      ctx.fillText(isMe ? "YOU" : loc.handle, px, py - 10 * dpr);

      if (loc.weather && mapScale >= 0.025) {
        ctx.fillStyle = colorMixForRadar();
        ctx.font = 9 * dpr + "px monospace";
        ctx.fillText(loc.weather.icon + " " + loc.weather.tempC + "°C", px, py + 18 * dpr);
      }

      const locAqi = selectAqiForLocation(loc);
      if (locAqi && mapScale >= 0.04) {
        ctx.fillStyle = locAqi.color;
        ctx.font = 8 * dpr + "px monospace";
        ctx.fillText((locAqi.scheme ? locAqi.scheme + " " : "") + "AQI " + locAqi.value, px, py + 28 * dpr);
      }
    });

    if (flightsToggle && flightsToggle.checked) {
      knownFlights.forEach((flight) => {
        if (!Number.isFinite(flight.lat) || !Number.isFinite(flight.lon)) return;
        const point = mapPoint(flight.lat, flight.lon, origin, centerX, centerY);
        if (!isPointNearCanvas(point, w, h, 25 * dpr)) return;

        ctx.save();
        ctx.translate(point.x, point.y);
        ctx.rotate((flight.heading * Math.PI) / 180);
        ctx.beginPath();
        ctx.moveTo(0, -6 * dpr);
        ctx.lineTo(4 * dpr, 5 * dpr);
        ctx.lineTo(-4 * dpr, 5 * dpr);
        ctx.closePath();
        ctx.fillStyle = "#00eeff";
        ctx.shadowColor = "#00eeff";
        ctx.shadowBlur = 5 * dpr;
        ctx.fill();
        ctx.restore();
        ctx.shadowBlur = 0;

        if (mapScale >= 0.08) {
          ctx.fillStyle = "#00eeff";
          ctx.font = 8 * dpr + "px monospace";
          ctx.textAlign = "center";
          ctx.fillText(flight.callsign, point.x, point.y + 12 * dpr);
        }
      });
    }

    if (origin.isMine) {
      ctx.strokeStyle = "#ffee00";
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 4 * dpr, 0, Math.PI * 2);
      ctx.stroke();
    } else if (knownLocations.length === 0) {
      ctx.fillStyle = themeDim();
      ctx.font = 11 * dpr + "px monospace";
      ctx.textAlign = "center";
      ctx.fillText("Enable location for your HOME view, or choose a country above.", w / 2, h - 18 * dpr);
    }

    if (!mapGeography && mapGeographyLoading) {
      ctx.fillStyle = themeDim();
      ctx.font = 10 * dpr + "px monospace";
      ctx.textAlign = "right";
      ctx.fillText("LOADING COASTLINES…", w - 10 * dpr, 18 * dpr);
    }

    // Keep layer counters synchronized with the area currently on screen.
    // This also updates quake totals immediately after pan/zoom/country changes.
    updateMapDataStatus();
  }

  function colorMixForRadar() {
    const primary = themePrimary().replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(primary)) return "#a8ffb0";
    const r = parseInt(primary.slice(0, 2), 16);
    const g = parseInt(primary.slice(2, 4), 16);
    const b = parseInt(primary.slice(4, 6), 16);
    const mix = (value) => Math.round(value * 0.58 + 255 * 0.42).toString(16).padStart(2, "0");
    return "#" + mix(r) + mix(g) + mix(b);
  }

  mapToggleBtn.addEventListener("click", (e) => {
    buzz();
    playSound(iconMapSound);
    spawnIconRipple(mapToggleBtn, e);

    const wasOpen = !mapOverlay.classList.contains("hidden");

    // Close every top-level panel first. If Map was already open, the second
    // press leaves it closed; otherwise Map opens cleanly on its own.
    closePrimaryUiPanels();

    if (wasOpen) {
      return;
    }

    try {
      mapInitialFocusPending = true;
      socket.emit("getLocations");
      syncMapOverlayViewport();
      mapOverlay.classList.remove("hidden");
      loadRadarGeography();

      if (earthquakesToggle && earthquakesToggle.checked && !mapEarthquakesRequested) {
        requestEarthquakes();
      }

      if (poisToggle && poisToggle.checked && !mapPoisRequested) {
        requestHomePois();
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resizeMapCanvas();
          // Use cached/local coordinates immediately; the locationsUpdate event
          // performs a second HOME focus when fresh server data arrives.
          focusMapHome();
        });
      });

      setTimeout(() => {
        resizeMapCanvas();
        drawMap();
      }, 200);
    } catch (err) {
      console.error("Map open error:", err);
      showSystemMessage("⚠️ Map error: " + err.message);
    }
  });

  mapCloseBtn.addEventListener("click", (e) => {
    buzz();
    spawnIconRipple(mapCloseBtn, e);
    mapOverlay.classList.add("hidden");
  });

  if (mapHomeBtn) {
    mapHomeBtn.addEventListener("click", (e) => {
      buzz(18);
      spawnIconRipple(mapHomeBtn, e);
      mapInitialFocusPending = false;
      focusMapHome();
    });
  }

  if (mapFitBtn) {
    mapFitBtn.addEventListener("click", (e) => {
      buzz(18);
      spawnIconRipple(mapFitBtn, e);
      mapInitialFocusPending = false;
      fitMapToUsers();
    });
  }

  mapRegionBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      buzz(18);
      spawnIconRipple(btn, e);
      mapInitialFocusPending = false;
      focusMapRegion(btn.dataset.mapRegion);
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !mapOverlay.classList.contains("hidden")) {
      mapOverlay.classList.add("hidden");
    }
  });

  if (flightsToggle) {
    flightsToggle.addEventListener("change", () => {
      buzz();
      if (!flightsToggle.checked) {
        drawMap();
        updateMapDataStatus();
        return;
      }

      if (MAP_REGION_SPECS[currentMapView]) {
        requestFlightsForRegion(MAP_REGION_SPECS[currentMapView].flightRegion);
      } else {
        const mine = getOwnRadarLocation();
        requestFlightsForRegion(mine ? preferredFlightRegion(mine.lat, mine.lon) : "uk");
      }
    });
  }

  if (poisToggle) {
    poisToggle.addEventListener("change", () => {
      buzz();
      if (poisToggle.checked) requestHomePois();
      else {
        updateMapDataStatus();
        drawMap();
      }
    });
  }

  if (earthquakesToggle) {
    earthquakesToggle.addEventListener("change", () => {
      buzz();
      if (earthquakesToggle.checked) requestEarthquakes();
      else {
        updateMapDataStatus();
        drawMap();
      }
    });
  }

  mapCanvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      mapInitialFocusPending = false;
      mapScale *= e.deltaY > 0 ? 0.88 : 1.14;
      mapScale = Math.max(MAP_MIN_SCALE, Math.min(MAP_MAX_SCALE, mapScale));
      drawMap();
    },
    { passive: false }
  );

  const activeMapPointers = new Map();
  let pinchStartDistance = null;
  let pinchStartScale = null;

  function pointerDistance() {
    const pts = Array.from(activeMapPointers.values());
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return Math.hypot(dx, dy);
  }

  mapCanvas.addEventListener("pointerdown", (e) => {
    try {
      mapCanvas.setPointerCapture(e.pointerId);
    } catch (err) {}

    mapInitialFocusPending = false;
    activeMapPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activeMapPointers.size === 2) {
      mapDragging = false;
      pinchStartDistance = pointerDistance();
      pinchStartScale = mapScale;
    } else if (activeMapPointers.size === 1) {
      mapDragging = true;
      mapLastX = e.clientX;
      mapLastY = e.clientY;
    }
  });

  mapCanvas.addEventListener("pointermove", (e) => {
    if (!activeMapPointers.has(e.pointerId)) return;
    activeMapPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activeMapPointers.size === 2 && pinchStartDistance) {
      const newDistance = pointerDistance();
      mapScale = pinchStartScale * (newDistance / pinchStartDistance);
      mapScale = Math.max(MAP_MIN_SCALE, Math.min(MAP_MAX_SCALE, mapScale));
      drawMap();
      return;
    }

    if (activeMapPointers.size === 1 && mapDragging) {
      mapOffsetX += (e.clientX - mapLastX) * (window.devicePixelRatio || 1);
      mapOffsetY += (e.clientY - mapLastY) * (window.devicePixelRatio || 1);
      mapLastX = e.clientX;
      mapLastY = e.clientY;
      drawMap();
    }
  });

  function endMapPointer(e) {
    activeMapPointers.delete(e.pointerId);

    if (activeMapPointers.size < 2) {
      pinchStartDistance = null;
      pinchStartScale = null;
    }

    if (activeMapPointers.size === 1) {
      const remaining = Array.from(activeMapPointers.values())[0];
      mapDragging = true;
      mapLastX = remaining.x;
      mapLastY = remaining.y;
    } else if (activeMapPointers.size === 0) {
      mapDragging = false;
    }
  }

  mapCanvas.addEventListener("pointerup", endMapPointer);
  mapCanvas.addEventListener("pointercancel", endMapPointer);

  window.addEventListener("resize", () => {
    if (!profileOverlay.classList.contains("hidden")) {
      syncProfileOverlayViewport();
    }

    if (!mapOverlay.classList.contains("hidden")) {
      syncMapOverlayViewport();
      resizeMapCanvas();
      drawMap();
    }
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      if (!profileOverlay.classList.contains("hidden")) {
        syncProfileOverlayViewport();
      }
    });
  }

  checkReturningUser();
});