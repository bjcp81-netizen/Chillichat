// Force UTC so Postgres TIMESTAMP columns (which are stored in UTC) are
// interpreted consistently regardless of the host machine's local timezone.
// Without this, photo expiry timing breaks on machines set to non-UTC zones
// (e.g. UK during BST), because pg parses "timestamp without time zone"
// columns using the OS's local offset.
process.env.TZ = "UTC";

require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const pool = require("./sqlite-db");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");


const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const connectedUsers = {};

// ---- Moderators ----
const MODERATOR_HANDLES = ["Mdnight", "MR MATTI3"];
const OWNER_HANDLE = "Mdnight"; // other moderators cannot moderate this handle

// True if this socket's moderator may delete the given content.
// Only the owner can touch the owner's content.
async function moderatorMayTouch(socket, table, id) {
  const me = connectedUsers[socket.id];

  if (!me || !me.isModerator) return false;
  if (me.handle === OWNER_HANDLE) return true;

  const allowedTables = ["messages", "voice_clips", "photos"];
  if (!allowedTables.includes(table)) return false;

  try {
    const r = await pool.query(
      "SELECT handle FROM " + table + " WHERE id = $1",
      [id]
    );

    if (r.rows.length > 0 && r.rows[0].handle === OWNER_HANDLE) {
      socket.emit("reactionError", "You can't moderate " + OWNER_HANDLE + ".");
      return false;
    }
  } catch (err) {
    console.error("Moderator check error:", err);
    return false;
  }

  return true;
}

const REACTION_SCHO_VALUES = {
  chilli: 5,
  heart: 10,
  laugh: 8,
  down: -5,
  poo: -50,
};

const PHOTO_LIFETIME_MS = 15000;
const VOICE_CLIP_LIFETIME_MS = 5 * 60 * 1000; // 5 minutes
const VOICE_CLIP_CLEANUP_INTERVAL_MS = 10 * 1000; // check every 10 seconds
const HISTORY_MESSAGE_LIMIT = 5; // how many recent items a new joiner sees on load
const PROFILE_PHOTO_DIMENSION = 480;
const PROFILE_PHOTO_MAX_BYTES = 500 * 1024;

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

  // Achievement Expansion Pack
  first_words: { emoji: "👋", name: "First Words" },
  chatty_bastard: { emoji: "🗣️", name: "Chatty Bastard" },
  professional_gobshite: { emoji: "📣", name: "Professional Gobshite" },
  veteran: { emoji: "🎖️", name: "Veteran" },
  getting_spicy: { emoji: "🌶️", name: "Getting Spicy" },
  human_hot_sauce: { emoji: "🔥", name: "Human Hot Sauce" },
  love_machine: { emoji: "💘", name: "Love Machine" },
  heart_collector: { emoji: "💝", name: "Heart Collector" },
  comedy_gold: { emoji: "🥇", name: "Comedy Gold" },
  class_clown: { emoji: "🤡", name: "Class Clown" },
  jobbie_magnet: { emoji: "💩", name: "Jobbie Magnet" },
  public_toilet: { emoji: "🚽", name: "Public Toilet" },
  controversial: { emoji: "⚠️", name: "Controversial" },
  good_egg: { emoji: "🥚", name: "Good Egg" },
  full_spectrum: { emoji: "🌈", name: "Full Spectrum" },
  sweet_and_sour: { emoji: "🌶️💩", name: "Sweet & Sour" },
  match_lighter: { emoji: "🔥", name: "Match Lighter" },
  serial_reactor: { emoji: "🎯", name: "Serial Reactor" },
  shutterbug: { emoji: "📸", name: "Shutterbug" },
  open_mic: { emoji: "🎙️", name: "Open Mic" },
  radio_chatter: { emoji: "📻", name: "Radio Chatter" },
  regular: { emoji: "📆", name: "Regular" },
  still_burning: { emoji: "🔥", name: "Still Burning" },
  unstoppable: { emoji: "🌋", name: "Unstoppable" },
  high_roller: { emoji: "🎰", name: "High Roller" },
  podium_finish: { emoji: "🥉", name: "Podium Finish" },
  king_of_hill: { emoji: "👑", name: "King of the Hill" },
  nuclear_take: { emoji: "☢️", name: "Nuclear Take" },
  agent_of_chaos: { emoji: "🧨", name: "Agent of Chaos" },

  // Achievement Expansion v2 — Legendary & Unhinged long-game badges
  terminally_online: { emoji: "🧠", name: "Terminally Online", rarity: "rare" },
  will_you_shut_up: { emoji: "📢", name: "Will You Shut The Fuck Up", rarity: "epic" },
  industrial_gobshite: { emoji: "🏭", name: "Industrial Gobshite", rarity: "unhinged" },
  capsaicin_addict: { emoji: "🌶️", name: "Capsaicin Addict", rarity: "rare" },
  walking_heartburn: { emoji: "🔥", name: "Walking Heartburn", rarity: "legendary" },
  dangerously_likeable: { emoji: "💖", name: "Dangerously Likeable", rarity: "legendary" },
  comedy_weapon: { emoji: "😂", name: "Comedy Weapon", rarity: "legendary" },
  shit_magnet: { emoji: "💩", name: "Shit Magnet", rarity: "rare" },
  lord_of_bog: { emoji: "🚽", name: "Lord of the Bog", rarity: "epic" },
  beyond_saving: { emoji: "🧻", name: "Beyond Saving", rarity: "unhinged" },
  public_enemy: { emoji: "🚨", name: "Public Enemy", rarity: "epic" },
  marmite: { emoji: "🥪", name: "Marmite", rarity: "epic" },
  reaction_completionist: { emoji: "🌈", name: "Reaction Completionist", rarity: "legendary" },
  scoville_overlord: { emoji: "🌋", name: "Scoville Overlord", rarity: "legendary" },
  thermonuclear: { emoji: "☢️", name: "Thermonuclear", rarity: "unhinged" },
  wont_shut_up_either: { emoji: "🎙️", name: "Won't Shut Up Either", rarity: "epic" },
  human_radio_station: { emoji: "📡", name: "Human Radio Station", rarity: "unhinged" },
  david_baileys_evil_twin: { emoji: "📸", name: "David Bailey's Evil Twin", rarity: "epic" },
  furniture_now: { emoji: "🛋️", name: "Furniture Now", rarity: "rare" },
  basically_lives_here: { emoji: "🏠", name: "Basically Lives Here", rarity: "legendary" },
  send_help: { emoji: "🆘", name: "Send Help", rarity: "epic" },
  touch_grass_immediately: { emoji: "🌱", name: "Touch Grass Immediately", rarity: "unhinged" },
  what_is_outside: { emoji: "🌳", name: "What Is Outside?", rarity: "unhinged" },
  old_furniture: { emoji: "🪑", name: "Old Furniture", rarity: "rare" },
  ancient_relic: { emoji: "🦖", name: "Ancient Relic", rarity: "legendary" },
  reaction_chemist: { emoji: "🧪", name: "Reaction Chemist", rarity: "epic" },
  button_masher: { emoji: "🖱️", name: "Button Masher", rarity: "unhinged" },
  everybody_knows_this_bastard: { emoji: "🤝", name: "Everybody Knows This Bastard", rarity: "legendary" },
  comment_section_warlord: { emoji: "⚔️", name: "Comment Section Warlord", rarity: "epic" },
  mutually_assured_destruction: { emoji: "💣", name: "Mutually Assured Destruction", rarity: "unhinged" },
  chernobyl_take: { emoji: "☣️", name: "Chernobyl Take", rarity: "legendary" },
  untouchable: { emoji: "👑", name: "Untouchable", rarity: "legendary" },
  king_kong_of_chillichat: { emoji: "🦍", name: "King Kong of ChilliChat", rarity: "unhinged" },
  reputation_funeral: { emoji: "🪦", name: "Reputation Funeral", rarity: "epic" },
  somehow_still_here: { emoji: "🧟", name: "Somehow Still Here", rarity: "epic" },
  keyboard_warranty_void: { emoji: "⌨️", name: "Keyboard Warranty Void", rarity: "legendary" },
  absolute_weapon: { emoji: "💀", name: "Absolute Weapon", rarity: "rare" },
  badge_goblin: { emoji: "🏅", name: "Badge Goblin", rarity: "epic" },
  achievement_dragon: { emoji: "🐉", name: "Achievement Dragon", rarity: "legendary" },
  nothing_left_for_you: { emoji: "🌌", name: "There Is Nothing Left For You", rarity: "unhinged" },
};

const META_BADGE_KEYS = new Set([
  "absolute_weapon",
  "badge_goblin",
  "achievement_dragon",
  "nothing_left_for_you",
]);

const BETA_TESTER_CUTOFF = "2026-08-05T00:00:00Z";

function computeScovilleRank(scho) {
  const tier = SCOVILLE_TIERS.find((t) => scho >= t.min);
  return tier || SCOVILLE_TIERS[SCOVILLE_TIERS.length - 1];
}

function generateToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function computeHeatRating(counts) {
  const positive = counts.chilli + counts.heart + counts.laugh;
  const negative = counts.down + (counts.poo || 0);

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

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayString() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

const REACTION_TARGETS = {
  text: {
    contentTable: "messages",
    reactionTable: "message_reactions",
    idColumn: "message_id",
    label: "message",
    lifetimeMs: null,
  },
  voice: {
    contentTable: "voice_clips",
    reactionTable: "voice_reactions",
    idColumn: "voice_id",
    label: "voice clip",
    lifetimeMs: VOICE_CLIP_LIFETIME_MS,
  },
  photo: {
    contentTable: "photos",
    reactionTable: "photo_reactions",
    idColumn: "photo_id",
    label: "photo",
    lifetimeMs: PHOTO_LIFETIME_MS,
  },
};

function emptyReactionCounts() {
  return {
    chilli: 0,
    heart: 0,
    laugh: 0,
    down: 0,
    poo: 0,
  };
}


function readJpegDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    throw new Error("Invalid JPEG data.");
  }

  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error("Profile photo must be a JPEG.");
  }

  const sofMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3,
    0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb,
    0xcd, 0xce, 0xcf,
  ]);

  let pos = 2;

  while (pos + 3 < buffer.length) {
    if (buffer[pos] !== 0xff) {
      pos += 1;
      continue;
    }

    while (pos < buffer.length && buffer[pos] === 0xff) pos += 1;
    if (pos >= buffer.length) break;

    const marker = buffer[pos++];
    if (marker === 0xd9 || marker === 0xda) break;

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    if (pos + 2 > buffer.length) break;

    const length = buffer.readUInt16BE(pos);
    if (length < 2 || pos + length > buffer.length) {
      throw new Error("Malformed JPEG profile photo.");
    }

    if (sofMarkers.has(marker)) {
      if (length < 7) {
        throw new Error("Malformed JPEG dimensions.");
      }

      const height = buffer.readUInt16BE(pos + 3);
      const width = buffer.readUInt16BE(pos + 5);

      return { width, height };
    }

    pos += length;
  }

  throw new Error("Could not read JPEG dimensions.");
}

function stripJpegMetadata(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    throw new Error("Invalid JPEG data.");
  }

  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error("Profile photo must be a JPEG.");
  }

  const chunks = [buffer.subarray(0, 2)];
  let pos = 2;

  while (pos < buffer.length) {
    if (buffer[pos] !== 0xff) {
      throw new Error("Malformed JPEG segment.");
    }

    const markerStart = pos;

    while (pos < buffer.length && buffer[pos] === 0xff) pos += 1;
    if (pos >= buffer.length) break;

    const marker = buffer[pos++];

    if (marker === 0xda) {
      // Start Of Scan: everything after this belongs to compressed pixels.
      chunks.push(buffer.subarray(markerStart));
      return Buffer.concat(chunks);
    }

    if (marker === 0xd9) {
      chunks.push(buffer.subarray(markerStart, pos));
      return Buffer.concat(chunks);
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      chunks.push(buffer.subarray(markerStart, pos));
      continue;
    }

    if (pos + 2 > buffer.length) {
      throw new Error("Malformed JPEG metadata.");
    }

    const length = buffer.readUInt16BE(pos);
    const segmentEnd = pos + length;

    if (length < 2 || segmentEnd > buffer.length) {
      throw new Error("Malformed JPEG metadata.");
    }

    // APP0-APP15 and COM are metadata containers. The client already
    // re-encodes through canvas; stripping them again here makes the server
    // enforce the no-EXIF/GPS rule even if somebody bypasses the client UI.
    const isMetadata =
      (marker >= 0xe0 && marker <= 0xef) ||
      marker === 0xfe;

    if (!isMetadata) {
      chunks.push(buffer.subarray(markerStart, segmentEnd));
    }

    pos = segmentEnd;
  }

  throw new Error("Incomplete JPEG profile photo.");
}

function sanitizeProfilePhotoDataUrl(imageData) {
  if (
    typeof imageData !== "string" ||
    !imageData.startsWith("data:image/jpeg;base64,")
  ) {
    throw new Error("Profile photos must be uploaded through ChilliChat.");
  }

  const base64 = imageData.slice("data:image/jpeg;base64,".length);

  if (!base64 || base64.length > Math.ceil(PROFILE_PHOTO_MAX_BYTES * 4 / 3) + 16) {
    throw new Error("Profile photo is too large.");
  }

  const raw = Buffer.from(base64, "base64");

  if (raw.length === 0 || raw.length > PROFILE_PHOTO_MAX_BYTES) {
    throw new Error("Profile photo is too large.");
  }

  const { width, height } = readJpegDimensions(raw);

  if (
    width !== PROFILE_PHOTO_DIMENSION ||
    height !== PROFILE_PHOTO_DIMENSION
  ) {
    throw new Error(
      "Profile photo must be exactly " +
        PROFILE_PHOTO_DIMENSION +
        " × " +
        PROFILE_PHOTO_DIMENSION +
        " pixels."
    );
  }

  const stripped = stripJpegMetadata(raw);

  if (stripped.length > PROFILE_PHOTO_MAX_BYTES) {
    throw new Error("Profile photo is too large after sanitizing.");
  }

  return "data:image/jpeg;base64," + stripped.toString("base64");
}

async function getReactionCountsFor(targetType, targetId) {
  const target = REACTION_TARGETS[targetType];
  if (!target) return emptyReactionCounts();

  const result = await pool.query(
    `SELECT
      COUNT(*) FILTER (WHERE reaction = 'chilli') AS chilli,
      COUNT(*) FILTER (WHERE reaction = 'heart') AS heart,
      COUNT(*) FILTER (WHERE reaction = 'laugh') AS laugh,
      COUNT(*) FILTER (WHERE reaction = 'down') AS down,
      COUNT(*) FILTER (WHERE reaction = 'poo') AS poo
     FROM ${target.reactionTable} WHERE ${target.idColumn} = $1`,
    [targetId]
  );

  const row = result.rows[0] || emptyReactionCounts();

  return {
    chilli: parseInt(row.chilli || 0),
    heart: parseInt(row.heart || 0),
    laugh: parseInt(row.laugh || 0),
    down: parseInt(row.down || 0),
    poo: parseInt(row.poo || 0),
  };
}

// Text High Rollers and older code still call this helper by message ID.
async function getReactionCounts(messageId) {
  return getReactionCountsFor("text", messageId);
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

  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS scho_total INTEGER DEFAULT 0`
  );

  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS messages_sent INTEGER DEFAULT 0`
  );

  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS hearts_received INTEGER DEFAULT 0`
  );

  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS laughs_received INTEGER DEFAULT 0`
  );

  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS chilli_received INTEGER DEFAULT 0`
  );

  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS down_received INTEGER DEFAULT 0`
  );

  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS poo_received INTEGER DEFAULT 0`
  );

  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_rank_min INTEGER DEFAULT 0`
  );

  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_leaderboard_rank INTEGER`
  );

  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS messages_since_idle INTEGER DEFAULT 0`
  );

  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS voice_clips_sent INTEGER DEFAULT 0`
  );

  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS lowest_scho_total INTEGER DEFAULT 0`
  );

  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0`
  );

  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity_date TEXT`
  );

  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_badge TEXT`
  );

   await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT`
  );

  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo TEXT`
  );

  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS location_enabled BOOLEAN DEFAULT FALSE`
  );

  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS location_lat REAL`
  );

  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS location_lon REAL`
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      handle TEXT NOT NULL,
      color TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE`
  );

  await pool.query(
    `ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_by TEXT`
  );

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
    CREATE TABLE IF NOT EXISTS leaderboard_top_days (
      id SERIAL PRIMARY KEY,
      handle TEXT NOT NULL,
      top_day TEXT NOT NULL,
      recorded_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(handle, top_day)
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

  await pool.query(
    `ALTER TABLE voice_clips ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE`
  );

  await pool.query(
    `ALTER TABLE voice_clips ADD COLUMN IF NOT EXISTS deleted_by TEXT`
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS photos (
      id SERIAL PRIMARY KEY,
      handle TEXT NOT NULL,
      color TEXT NOT NULL,
      image_data TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      deleted BOOLEAN DEFAULT FALSE,
      deleted_by TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS photo_views (
      id SERIAL PRIMARY KEY,
      photo_id INTEGER NOT NULL,
      viewer_handle TEXT NOT NULL,
      opened_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(photo_id, viewer_handle)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS voice_reactions (
      id SERIAL PRIMARY KEY,
      voice_id INTEGER NOT NULL,
      handle TEXT NOT NULL,
      reaction TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(voice_id, handle, reaction)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS photo_reactions (
      id SERIAL PRIMARY KEY,
      photo_id INTEGER NOT NULL,
      handle TEXT NOT NULL,
      reaction TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(photo_id, handle, reaction)
    )
  `);

  // One-time retroactive award for everyone who used ChilliChat before badges existed
  try {
    const earlyUsers = await pool.query(
      "SELECT handle FROM users WHERE created_at < $1",
      [BETA_TESTER_CUTOFF]
    );

    for (const row of earlyUsers.rows) {
      await pool.query(
        "INSERT INTO badges (handle, badge_key) VALUES ($1, 'beta_tester') ON CONFLICT DO NOTHING",
        [row.handle]
      );
    }
  } catch (err) {
    console.error("Beta tester retroactive award error:", err);
  }

  console.log("Connected to local SQLite and tables are ready");
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
    if (!def) {
      console.error("Unknown badge definition:", badgeKey);
      return false;
    }

    const targetSocketId = findSocketIdByHandle(handle);

    if (targetSocketId) {
      const targetSocket = io.sockets.sockets.get(targetSocketId);

      if (targetSocket) {
        targetSocket.emit("badgeUnlocked", {
          emoji: def.emoji,
          name: def.name,
          rarity: def.rarity || "common",
        });
      }
    }

    if (!META_BADGE_KEYS.has(badgeKey)) {
      await checkMetaBadges(handle);
    }

    return true;
  }

  return false;
}

async function checkMetaBadges(handle) {
  try {
    const badgeResult = await pool.query(
      "SELECT badge_key FROM badges WHERE handle = $1",
      [handle]
    );

    const unlocked = new Set(badgeResult.rows.map((row) => row.badge_key));

    const normalKeys = Object.keys(BADGE_DEFS).filter(
      (key) => !META_BADGE_KEYS.has(key)
    );

    const normalUnlockedCount = normalKeys.filter(
      (key) => unlocked.has(key)
    ).length;

    if (normalUnlockedCount >= 40) await awardBadge(handle, "absolute_weapon");
    if (normalUnlockedCount >= 55) await awardBadge(handle, "badge_goblin");
    if (normalUnlockedCount >= 70) await awardBadge(handle, "achievement_dragon");

    if (normalKeys.length > 0 && normalKeys.every((key) => unlocked.has(key))) {
      await awardBadge(handle, "nothing_left_for_you");
    }
  } catch (err) {
    console.error("Meta badge check error:", err);
  }
}

async function checkAccountAgeBadges(handle) {
  try {
    const result = await pool.query(
      "SELECT created_at FROM users WHERE handle = $1",
      [handle]
    );

    if (result.rows.length === 0) return;

    const createdMs = new Date(result.rows[0].created_at).getTime();
    if (!Number.isFinite(createdMs)) return;

    const accountDays = Math.floor((Date.now() - createdMs) / 86400000);

    if (accountDays >= 365) await awardBadge(handle, "old_furniture");
    if (accountDays >= 730) await awardBadge(handle, "ancient_relic");
  } catch (err) {
    console.error("Account age badge check error:", err);
  }
}

async function checkReputationBadges(handle) {
  try {
    const result = await pool.query(
      "SELECT scho_total, lowest_scho_total FROM users WHERE handle = $1",
      [handle]
    );

    if (result.rows.length === 0) return;

    const current = Number(result.rows[0].scho_total || 0);
    const previousFloor = Number(result.rows[0].lowest_scho_total || 0);
    const newFloor = Math.min(previousFloor, current);

    if (newFloor !== previousFloor) {
      await pool.query(
        "UPDATE users SET lowest_scho_total = $1 WHERE handle = $2",
        [newFloor, handle]
      );
    }

    if (current <= -1000) {
      await awardBadge(handle, "reputation_funeral");
    }

    if (newFloor <= -1000 && current >= 0) {
      await awardBadge(handle, "somehow_still_here");
    }
  } catch (err) {
    console.error("Reputation badge check error:", err);
  }
}

async function checkThresholdBadges(handle) {
  const result = await pool.query(
    "SELECT messages_sent, hearts_received, laughs_received, chilli_received, down_received, poo_received, current_streak FROM users WHERE handle = $1",
    [handle]
  );

  if (result.rows.length === 0) return;

  const u = result.rows[0];
  const messagesSent = Number(u.messages_sent || 0);
  const hearts = Number(u.hearts_received || 0);
  const laughs = Number(u.laughs_received || 0);
  const chillis = Number(u.chilli_received || 0);
  const downs = Number(u.down_received || 0);
  const poos = Number(u.poo_received || 0);
  const currentStreak = Number(u.current_streak || 0);

  const totalPositive = hearts + laughs + chillis;
  const totalReceived = totalPositive + downs + poos;

  // Existing badge thresholds.
  if (messagesSent >= 1) await awardBadge(handle, "ice_breaker");
  if (totalReceived >= 1) await awardBadge(handle, "first_burn");
  if (hearts >= 25) await awardBadge(handle, "well_liked");
  if (laughs >= 50) await awardBadge(handle, "crowd_pleaser");
  if (chillis >= 100) await awardBadge(handle, "spice_merchant");
  if (totalPositive >= 100) await awardBadge(handle, "friendly_flame");
  if (totalReceived >= 500) await awardBadge(handle, "top_banter");
  if (downs >= 100) await awardBadge(handle, "fire_extinguisher");
  if (messagesSent >= 1000) await awardBadge(handle, "melted_keyboard");
  if (laughs >= 250) await awardBadge(handle, "meme_machine");
  if (hearts >= 500) await awardBadge(handle, "heartbreaker");

  // Achievement Expansion Pack.
  if (messagesSent >= 10) await awardBadge(handle, "first_words");
  if (messagesSent >= 250) await awardBadge(handle, "chatty_bastard");
  if (messagesSent >= 2500) await awardBadge(handle, "professional_gobshite");
  if (messagesSent >= 5000) await awardBadge(handle, "veteran");

  if (chillis >= 25) await awardBadge(handle, "getting_spicy");
  if (chillis >= 500) await awardBadge(handle, "human_hot_sauce");

  if (hearts >= 100) await awardBadge(handle, "love_machine");
  if (hearts >= 1000) await awardBadge(handle, "heart_collector");

  if (laughs >= 100) await awardBadge(handle, "comedy_gold");
  if (laughs >= 1000) await awardBadge(handle, "class_clown");

  if (poos >= 25) await awardBadge(handle, "jobbie_magnet");
  if (poos >= 100) await awardBadge(handle, "public_toilet");

  if (downs >= 50) await awardBadge(handle, "controversial");
  if (totalPositive >= 250) await awardBadge(handle, "good_egg");

  if (hearts >= 1 && laughs >= 1 && chillis >= 1 && downs >= 1 && poos >= 1) {
    await awardBadge(handle, "full_spectrum");
  }

  if (chillis >= 100 && poos >= 100) {
    await awardBadge(handle, "sweet_and_sour");
  }

  // Legendary & Unhinged long-game thresholds.
  if (messagesSent >= 10000) await awardBadge(handle, "terminally_online");
  if (messagesSent >= 25000) await awardBadge(handle, "will_you_shut_up");
  if (messagesSent >= 50000) await awardBadge(handle, "industrial_gobshite");

  if (chillis >= 2500) await awardBadge(handle, "capsaicin_addict");
  if (chillis >= 10000) await awardBadge(handle, "walking_heartburn");
  if (hearts >= 5000) await awardBadge(handle, "dangerously_likeable");
  if (laughs >= 5000) await awardBadge(handle, "comedy_weapon");

  if (poos >= 500) await awardBadge(handle, "shit_magnet");
  if (poos >= 2500) await awardBadge(handle, "lord_of_bog");
  if (poos >= 5000) await awardBadge(handle, "beyond_saving");
  if (downs >= 1000) await awardBadge(handle, "public_enemy");

  const totalNegative = downs + poos;

  if (totalPositive >= 1000 && totalNegative >= 1000) {
    await awardBadge(handle, "marmite");
  }

  if (
    hearts >= 1000 &&
    laughs >= 1000 &&
    chillis >= 1000 &&
    downs >= 1000 &&
    poos >= 1000
  ) {
    await awardBadge(handle, "reaction_completionist");
  }

  // Re-check streak milestones here as well so returning users can receive
  // expansion badges retroactively without waiting for the next calendar day.
  if (currentStreak >= 7) await awardBadge(handle, "streak_7");
  if (currentStreak >= 14) await awardBadge(handle, "still_burning");
  if (currentStreak >= 30) await awardBadge(handle, "streak_30");
  if (currentStreak >= 60) await awardBadge(handle, "unstoppable");
  if (currentStreak >= 100) await awardBadge(handle, "streak_100");
  if (currentStreak >= 180) await awardBadge(handle, "send_help");
  if (currentStreak >= 365) await awardBadge(handle, "touch_grass_immediately");
  if (currentStreak >= 500) await awardBadge(handle, "what_is_outside");
}

async function checkRegularBadge(handle) {
  try {
    const result = await pool.query(
      `SELECT COUNT(DISTINCT DATE(created_at)) AS active_days
       FROM messages
       WHERE handle = $1 AND deleted = FALSE`,
      [handle]
    );

    const activeDays = Number(
      result.rows[0] ? result.rows[0].active_days || 0 : 0
    );

    if (activeDays >= 30) {
      await awardBadge(handle, "regular");
    }

    if (activeDays >= 180) {
      await awardBadge(handle, "furniture_now");
    }

    if (activeDays >= 365) {
      await awardBadge(handle, "basically_lives_here");
    }
  } catch (err) {
    console.error("Regular badge check error:", err);
  }
}

async function checkMediaBadges(handle) {
  try {
    const userResult = await pool.query(
      "SELECT voice_clips_sent FROM users WHERE handle = $1",
      [handle]
    );

    const voiceClipsSent =
      userResult.rows.length > 0
        ? Number(userResult.rows[0].voice_clips_sent || 0)
        : 0;

    if (voiceClipsSent >= 25) await awardBadge(handle, "open_mic");
    if (voiceClipsSent >= 250) await awardBadge(handle, "radio_chatter");
    if (voiceClipsSent >= 1000) await awardBadge(handle, "wont_shut_up_either");
    if (voiceClipsSent >= 5000) await awardBadge(handle, "human_radio_station");

    const photoResult = await pool.query(
      "SELECT COUNT(*) AS photo_count FROM photos WHERE handle = $1 AND deleted = FALSE",
      [handle]
    );

    const photoCount = Number(
      photoResult.rows[0] ? photoResult.rows[0].photo_count || 0 : 0
    );

    if (photoCount >= 25) await awardBadge(handle, "shutterbug");
    if (photoCount >= 1000) await awardBadge(handle, "david_baileys_evil_twin");
  } catch (err) {
    console.error("Media badge check error:", err);
  }
}

async function checkReactionGiverBadges(handle) {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) AS reaction_count
       FROM (
         SELECT id FROM message_reactions WHERE handle = $1
         UNION ALL
         SELECT id FROM voice_reactions WHERE handle = $1
         UNION ALL
         SELECT id FROM photo_reactions WHERE handle = $1
       ) reaction_rows`,
      [handle]
    );

    const reactionCount = Number(
      result.rows[0] ? result.rows[0].reaction_count || 0 : 0
    );

    if (reactionCount >= 25) await awardBadge(handle, "match_lighter");
    if (reactionCount >= 250) await awardBadge(handle, "serial_reactor");
    if (reactionCount >= 5000) await awardBadge(handle, "reaction_chemist");
    if (reactionCount >= 10000) await awardBadge(handle, "button_masher");

    const authorResult = await pool.query(
      `SELECT m.handle AS author_handle
       FROM message_reactions r
       JOIN messages m ON m.id = r.message_id
       WHERE r.handle = $1 AND m.handle <> $1
       UNION
       SELECT v.handle AS author_handle
       FROM voice_reactions r
       JOIN voice_clips v ON v.id = r.voice_id
       WHERE r.handle = $1 AND v.handle <> $1
       UNION
       SELECT p.handle AS author_handle
       FROM photo_reactions r
       JOIN photos p ON p.id = r.photo_id
       WHERE r.handle = $1 AND p.handle <> $1`,
      [handle]
    );

    if (authorResult.rows.length >= 100) {
      await awardBadge(handle, "everybody_knows_this_bastard");
    }
  } catch (err) {
    console.error("Reaction giver badge check error:", err);
  }
}

async function checkLeaderboardBadges(handle) {
  try {
    const leaderboardResult = await pool.query(
      "SELECT handle, scho_total FROM users ORDER BY scho_total DESC, created_at ASC LIMIT 20"
    );

    const index =
      leaderboardResult.rows.findIndex((row) => row.handle === handle);

    if (index === -1) return;

    const position = index + 1;
    const scho = Number(leaderboardResult.rows[index].scho_total || 0);

    // Do not hand out leaderboard achievements merely because the room is small.
    // A user must have actually earned positive Scoville first.
    if (scho <= 0) return;

    if (position <= 20) {
      await awardBadge(handle, "high_roller");
    }

    if (position <= 3) {
      await awardBadge(handle, "podium_finish");
    }

    if (position === 1) {
      await awardBadge(handle, "king_of_hill");

      const topDay = todayString();

      await pool.query(
        "INSERT INTO leaderboard_top_days (handle, top_day) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [handle, topDay]
      );

      const topDaysResult = await pool.query(
        "SELECT COUNT(*) AS top_days FROM leaderboard_top_days WHERE handle = $1",
        [handle]
      );

      const topDays = Number(
        topDaysResult.rows[0] ? topDaysResult.rows[0].top_days || 0 : 0
      );

      if (topDays >= 7) await awardBadge(handle, "untouchable");
      if (topDays >= 30) await awardBadge(handle, "king_kong_of_chillichat");
    }
  } catch (err) {
    console.error("Leaderboard badge check error:", err);
  }
}

async function checkSpecialContentBadges(handle, counts) {
  try {
    if (!counts) return;

    const heatRating = computeHeatRating(counts);

    if (heatRating !== null && heatRating >= 95) {
      await awardBadge(handle, "nuclear_take");
    }

    const chilli = Number(counts.chilli || 0);
    const heart = Number(counts.heart || 0);
    const laugh = Number(counts.laugh || 0);
    const down = Number(counts.down || 0);
    const poo = Number(counts.poo || 0);
    const total = chilli + heart + laugh + down + poo;

    if (chilli > 0 && heart > 0 && laugh > 0 && down > 0 && poo > 0) {
      await awardBadge(handle, "agent_of_chaos");
    }

    if (heatRating === 100 && total >= 50) {
      await awardBadge(handle, "chernobyl_take");
    }

    if (total >= 100) {
      await awardBadge(handle, "comment_section_warlord");
    }

    if (
      chilli >= 25 &&
      heart >= 25 &&
      laugh >= 25 &&
      down >= 25 &&
      poo >= 25
    ) {
      await awardBadge(handle, "mutually_assured_destruction");
    }
  } catch (err) {
    console.error("Special content badge check error:", err);
  }
}

async function checkRankBadges(handle) {
  const result = await pool.query(
    "SELECT scho_total FROM users WHERE handle = $1",
    [handle]
  );

  if (result.rows.length === 0) return;

  const scho = result.rows[0].scho_total;

  if (scho >= 1000000) await awardBadge(handle, "spice_lord");
  if (scho >= 2200000) await awardBadge(handle, "pepper_royalty");
  if (scho >= 5000000) await awardBadge(handle, "scoville_overlord");
  if (scho >= 10000000) await awardBadge(handle, "thermonuclear");
}

async function updateStreak(handle) {
  try {
    const result = await pool.query(
      "SELECT current_streak, last_activity_date FROM users WHERE handle = $1",
      [handle]
    );

    if (result.rows.length === 0) return;

    const u = result.rows[0];
    const today = todayString();

    if (u.last_activity_date === today) return;

    let newStreak;

    if (u.last_activity_date === yesterdayString()) {
      newStreak = (u.current_streak || 0) + 1;
    } else {
      newStreak = 1;
    }

    await pool.query(
      "UPDATE users SET current_streak = $1, last_activity_date = $2 WHERE handle = $3",
      [newStreak, today, handle]
    );

    if (newStreak >= 7) await awardBadge(handle, "streak_7");
    if (newStreak >= 14) await awardBadge(handle, "still_burning");
    if (newStreak >= 30) await awardBadge(handle, "streak_30");
    if (newStreak >= 60) await awardBadge(handle, "unstoppable");
    if (newStreak >= 100) await awardBadge(handle, "streak_100");
    if (newStreak >= 180) await awardBadge(handle, "send_help");
    if (newStreak >= 365) await awardBadge(handle, "touch_grass_immediately");
    if (newStreak >= 500) await awardBadge(handle, "what_is_outside");
  } catch (err) {
    console.error("Streak update error:", err);
  }
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
      io.emit(
        "heatNotification",
        "🔥 " +
          handle +
          " reached " +
          newRank.emoji +
          " " +
          newRank.name +
          "!"
      );

      await pool.query(
        "UPDATE users SET last_rank_min = $1 WHERE handle = $2",
        [newRank.min, handle]
      );
    }

    const leaderboardResult = await pool.query(
      "SELECT handle FROM users ORDER BY scho_total DESC, created_at ASC LIMIT 20"
    );

    const position = leaderboardResult.rows.findIndex(
      (row) => row.handle === handle
    );

    const newPosition = position === -1 ? null : position + 1;
    const previousPosition = u.last_leaderboard_rank;

    if (newPosition === 1 && previousPosition !== 1) {
      io.emit(
        "heatNotification",
        "👑 " + handle + " is now #1 on the Scoville Scale!"
      );
    } else if (
      newPosition !== null &&
      newPosition <= 20 &&
      (previousPosition === null || previousPosition > 20)
    ) {
      io.emit(
        "heatNotification",
        "🚀 " + handle + " entered the High Rollers!"
      );
    }

    await pool.query(
      "UPDATE users SET last_leaderboard_rank = $1 WHERE handle = $2",
      [newPosition, handle]
    );
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

async function getProfilePhotosForHandles(handles) {
  const uniqueHandles = Array.from(
    new Set((handles || []).filter(Boolean))
  );

  if (uniqueHandles.length === 0) return {};

  const result = await pool.query(
    "SELECT handle, profile_photo FROM users WHERE handle = ANY($1)",
    [uniqueHandles]
  );

  const map = {};

  result.rows.forEach((row) => {
    map[row.handle] = row.profile_photo || "";
  });

  return map;
}

async function buildEnrichedUserList() {
  const users = Object.values(connectedUsers);

  if (users.length === 0) return [];

  const handles = users.map((u) => u.handle);

  const result = await pool.query(
    "SELECT handle, scho_total, equipped_badge, profile_photo FROM users WHERE handle = ANY($1)",
    [handles]
  );

  const schoByHandle = {};
  const equippedByHandle = {};
  const profilePhotoByHandle = {};

  result.rows.forEach((row) => {
    schoByHandle[row.handle] = row.scho_total;
    equippedByHandle[row.handle] = row.equipped_badge;
    profilePhotoByHandle[row.handle] = row.profile_photo || "";
  });

  const badgesByHandle = await getBadgesForHandles(handles);

  return users.map((u) => {
    const scho = schoByHandle[u.handle] || 0;
    const rank = computeScovilleRank(scho);
    const equippedKey = equippedByHandle[u.handle];
    const equippedDef = equippedKey ? BADGE_DEFS[equippedKey] : null;

    return {
      ...u,
      scho,
      rankName: rank.name,
      rankEmoji: rank.emoji,
      badges: badgesByHandle[u.handle] || [],
      equippedBadgeEmoji: equippedDef ? equippedDef.emoji : null,
      profilePhoto: profilePhotoByHandle[u.handle] || "",
    };
  });
}

async function broadcastUserList() {
  const enriched = await buildEnrichedUserList();
  io.emit("userList", enriched);
}

async function sendMessageHistory(socket, viewerHandle) {
  try {
    const msgResult = await pool.query(
      `
      SELECT m.id, m.handle, m.color, m.text, m.created_at,
        COUNT(*) FILTER (WHERE r.reaction = 'chilli') AS chilli,
        COUNT(*) FILTER (WHERE r.reaction = 'heart') AS heart,
        COUNT(*) FILTER (WHERE r.reaction = 'laugh') AS laugh,
        COUNT(*) FILTER (WHERE r.reaction = 'down') AS down,
        COUNT(*) FILTER (WHERE r.reaction = 'poo') AS poo
      FROM messages m
      LEFT JOIN message_reactions r ON r.message_id = m.id
      WHERE m.deleted = FALSE
      GROUP BY m.id
      ORDER BY m.created_at DESC
      LIMIT $1
    `,
      [HISTORY_MESSAGE_LIMIT]
    );

    const voiceResult = await pool.query(
      `
      SELECT v.id, v.handle, v.color, v.audio_data, v.duration_ms, v.created_at,
        COUNT(*) FILTER (WHERE reaction = 'chilli') AS chilli,
        COUNT(*) FILTER (WHERE reaction = 'heart') AS heart,
        COUNT(*) FILTER (WHERE reaction = 'laugh') AS laugh,
        COUNT(*) FILTER (WHERE reaction = 'down') AS down,
        COUNT(*) FILTER (WHERE reaction = 'poo') AS poo
      FROM voice_clips v
      LEFT JOIN voice_reactions r ON r.voice_id = v.id
      WHERE v.deleted = FALSE
      GROUP BY v.id
      ORDER BY v.created_at DESC
      LIMIT $1
    `,
      [HISTORY_MESSAGE_LIMIT]
    );

    const photoResult = await pool.query(
      `SELECT p.id, p.handle, p.color, p.created_at,
         COUNT(*) FILTER (WHERE reaction = 'chilli') AS chilli,
         COUNT(*) FILTER (WHERE reaction = 'heart') AS heart,
         COUNT(*) FILTER (WHERE reaction = 'laugh') AS laugh,
         COUNT(*) FILTER (WHERE reaction = 'down') AS down,
         COUNT(*) FILTER (WHERE reaction = 'poo') AS poo
       FROM photos p
       LEFT JOIN photo_reactions r ON r.photo_id = p.id
       WHERE p.deleted = FALSE
       GROUP BY p.id
       ORDER BY p.created_at DESC
       LIMIT $1`,
      [HISTORY_MESSAGE_LIMIT]
    );

    const historyHandles = [
      ...msgResult.rows.map((row) => row.handle),
      ...voiceResult.rows.map((row) => row.handle),
      ...photoResult.rows.map((row) => row.handle),
    ];

    const historyProfilePhotos =
      await getProfilePhotosForHandles(historyHandles);

    const textItems = msgResult.rows.map((msg) => {
      const counts = {
        chilli: parseInt(msg.chilli),
        heart: parseInt(msg.heart),
        laugh: parseInt(msg.laugh),
        down: parseInt(msg.down),
        poo: parseInt(msg.poo || 0),
      };

      return {
        type: "text",
        created_at: msg.created_at,
        payload: {
          id: msg.id,
          handle: msg.handle,
          color: msg.color,
          profilePhoto: historyProfilePhotos[msg.handle] || "",
          text: msg.text,
          counts,
          heatRating: computeHeatRating(counts),
          createdAt: msg.created_at,
        },
      };
    });

    const voiceItems = voiceResult.rows.map((clip) => {
      const counts = {
        chilli: parseInt(clip.chilli || 0),
        heart: parseInt(clip.heart || 0),
        laugh: parseInt(clip.laugh || 0),
        down: parseInt(clip.down || 0),
        poo: parseInt(clip.poo || 0),
      };

      return {
        type: "voice",
        created_at: clip.created_at,
        payload: {
          id: clip.id,
          handle: clip.handle,
          color: clip.color,
          profilePhoto: historyProfilePhotos[clip.handle] || "",
          audioData: clip.audio_data,
          durationMs: clip.duration_ms,
          counts,
          heatRating: computeHeatRating(counts),
          createdAt: clip.created_at,
        },
      };
    });

    const photoItems = photoResult.rows.map((p) => {
      const ageMs = Date.now() - new Date(p.created_at).getTime();
      const remainingMs = PHOTO_LIFETIME_MS - ageMs;
      const expired = remainingMs <= 0;
      const counts = {
        chilli: parseInt(p.chilli || 0),
        heart: parseInt(p.heart || 0),
        laugh: parseInt(p.laugh || 0),
        down: parseInt(p.down || 0),
        poo: parseInt(p.poo || 0),
      };

      return {
        type: "photo",
        created_at: p.created_at,
        payload: {
          id: p.id,
          handle: p.handle,
          color: p.color,
          profilePhoto: historyProfilePhotos[p.handle] || "",
          counts,
          heatRating: computeHeatRating(counts),
          createdAt: p.created_at,
          expired,
          remainingMs: expired ? 0 : remainingMs,
        },
      };
    });

    const merged = [...textItems, ...voiceItems, ...photoItems]
      .sort(
        (a, b) =>
          new Date(b.created_at) - new Date(a.created_at)
      )
      .slice(0, HISTORY_MESSAGE_LIMIT)
      .sort(
        (a, b) =>
          new Date(a.created_at) - new Date(b.created_at)
      );

    merged.forEach((item) => {
      if (item.type === "text") {
        socket.emit("chatMessage", item.payload);
      } else if (item.type === "voice") {
        socket.emit("voiceClip", item.payload);
      } else {
        socket.emit("photoNew", item.payload);
      }
    });

    socket.emit("historyComplete");
  } catch (err) {
    console.error("Failed to load message history:", err);
    socket.emit("historyComplete");
  }
}

function findSocketIdByHandle(handle) {
  return Object.keys(connectedUsers).find(
    (id) => connectedUsers[id].handle === handle
  );
}

// ---- Global Map / Radar data services ----
// Weather + AQI are deliberately global rather than UK-specific. Open-Meteo
// automatically selects suitable forecast models for the requested coordinate.
// Flight, POI and earthquake feeds are fetched server-side, cached, and only
// requested when a user actually opens/enables those map layers.

const MAP_HTTP_USER_AGENT = "ChilliChat-Map/2.0 (+https://chillichat.co.uk)";

function isFiniteCoordinate(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": MAP_HTTP_USER_AGENT,
        Accept: "application/json",
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error("HTTP " + response.status + " from " + url);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

// ---- Global weather (Open-Meteo, no API key required) ----

const WEATHER_CACHE = new Map();
const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000;

// Coarse cache grid keeps nearby ChilliChat users from causing duplicate calls.
function weatherGridKey(lat, lon) {
  const rLat = Math.round(lat * 2) / 2;
  const rLon = Math.round(lon * 2) / 2;
  return rLat + "," + rLon;
}

const WMO_DESCRIPTIONS = {
  0: { desc: "Clear", icon: "☀" },
  1: { desc: "Mostly Clear", icon: "🌤" },
  2: { desc: "Partly Cloudy", icon: "⛅" },
  3: { desc: "Overcast", icon: "☁" },
  45: { desc: "Fog", icon: "🌫" },
  48: { desc: "Fog", icon: "🌫" },
  51: { desc: "Light Drizzle", icon: "🌦" },
  53: { desc: "Drizzle", icon: "🌦" },
  55: { desc: "Heavy Drizzle", icon: "🌧" },
  61: { desc: "Light Rain", icon: "🌦" },
  63: { desc: "Rain", icon: "🌧" },
  65: { desc: "Heavy Rain", icon: "🌧" },
  71: { desc: "Light Snow", icon: "🌨" },
  73: { desc: "Snow", icon: "❄" },
  75: { desc: "Heavy Snow", icon: "❄" },
  80: { desc: "Rain Showers", icon: "🌦" },
  81: { desc: "Rain Showers", icon: "🌧" },
  82: { desc: "Violent Showers", icon: "🌧" },
  95: { desc: "Thunderstorm", icon: "⛈" },
  96: { desc: "Thunderstorm", icon: "⛈" },
  99: { desc: "Severe Storm", icon: "⛈" },
};

function describeWeatherCode(code) {
  return WMO_DESCRIPTIONS[code] || { desc: "Unknown", icon: "?" };
}

async function getWeatherFor(lat, lon) {
  const key = weatherGridKey(lat, lon);
  const cached = WEATHER_CACHE.get(key);

  if (cached && Date.now() - cached.fetchedAt < WEATHER_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=" +
      encodeURIComponent(lat) +
      "&longitude=" +
      encodeURIComponent(lon) +
      "&current=temperature_2m,apparent_temperature,weather_code,precipitation,wind_speed_10m,wind_direction_10m" +
      "&temperature_unit=celsius&wind_speed_unit=kmh";

    const json = await fetchJsonWithTimeout(url, {}, 6000);
    const current = json.current;

    if (!current) throw new Error("Weather API returned no current data");

    const { desc, icon } = describeWeatherCode(current.weather_code);

    const data = {
      tempC: Math.round(current.temperature_2m),
      feelsC: Math.round(current.apparent_temperature),
      desc,
      icon,
      precipitationMm: Number(current.precipitation || 0),
      windKmh: Math.round(current.wind_speed_10m || 0),
      windDeg: Math.round(current.wind_direction_10m || 0),
    };

    WEATHER_CACHE.set(key, { data, fetchedAt: Date.now() });
    return data;
  } catch (err) {
    console.error("Weather fetch error:", err.message);
    return null;
  }
}

// ---- Global air quality (Open-Meteo / CAMS, no API key required) ----

const AQI_CACHE = new Map();
const AQI_CACHE_TTL_MS = 60 * 60 * 1000;

function describeEuAqi(value) {
  if (value <= 20) return { label: "Good", color: "#39ff14" };
  if (value <= 40) return { label: "Fair", color: "#99ff00" };
  if (value <= 60) return { label: "Moderate", color: "#ffee00" };
  if (value <= 80) return { label: "Poor", color: "#ff8800" };
  if (value <= 100) return { label: "Very Poor", color: "#ff2b2b" };
  return { label: "Extremely Poor", color: "#a52a2a" };
}

function describeUsAqi(value) {
  if (value <= 50) return { label: "Good", color: "#39ff14" };
  if (value <= 100) return { label: "Moderate", color: "#ffee00" };
  if (value <= 150) return { label: "Sensitive", color: "#ffb000" };
  if (value <= 200) return { label: "Unhealthy", color: "#ff5f1f" };
  if (value <= 300) return { label: "Very Unhealthy", color: "#c000ff" };
  return { label: "Hazardous", color: "#ff1744" };
}

async function getAirQualityFor(lat, lon) {
  const key = weatherGridKey(lat, lon);
  const cached = AQI_CACHE.get(key);

  if (cached && Date.now() - cached.fetchedAt < AQI_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const url =
      "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" +
      encodeURIComponent(lat) +
      "&longitude=" +
      encodeURIComponent(lon) +
      "&current=european_aqi,us_aqi,pm2_5,pm10";

    const json = await fetchJsonWithTimeout(url, {}, 6000);
    const current = json.current;

    if (!current) throw new Error("Air quality API returned no current data");

    const euValue = Number.isFinite(current.european_aqi)
      ? Math.round(current.european_aqi)
      : null;
    const usValue = Number.isFinite(current.us_aqi)
      ? Math.round(current.us_aqi)
      : null;

    const euDesc = euValue === null ? null : describeEuAqi(euValue);
    const usDesc = usValue === null ? null : describeUsAqi(usValue);

    const data = {
      // Legacy compatibility: old clients expected value/label/color directly.
      value: euValue !== null ? euValue : usValue,
      label: euDesc ? euDesc.label : (usDesc ? usDesc.label : "Unavailable"),
      color: euDesc ? euDesc.color : (usDesc ? usDesc.color : "#808080"),
      eu: euValue === null ? null : { value: euValue, ...euDesc },
      us: usValue === null ? null : { value: usValue, ...usDesc },
      pm25: Number.isFinite(current.pm2_5) ? Math.round(current.pm2_5 * 10) / 10 : null,
      pm10: Number.isFinite(current.pm10) ? Math.round(current.pm10 * 10) / 10 : null,
    };

    AQI_CACHE.set(key, { data, fetchedAt: Date.now() });
    return data;
  } catch (err) {
    console.error("Air quality fetch error:", err.message);
    return null;
  }
}

// ---- Regional live aircraft (OpenSky) ----
// These are intentionally on-demand and cached for an hour. OpenSky's
// anonymous API uses daily credits, so continuously polling four continents
// would be wasteful. One shared cached snapshot per region keeps it useful.

const FLIGHT_REGION_BOUNDS = {
  uk: { lamin: 49.5, lomin: -8.5, lamax: 61.0, lomax: 2.0 },
  usa: { lamin: 24.0, lomin: -125.0, lamax: 50.0, lomax: -66.0 },
  canada: { lamin: 41.0, lomin: -141.0, lamax: 84.0, lomax: -52.0 },
  australia: { lamin: -44.5, lomin: 112.0, lamax: -10.0, lomax: 154.5 },
};

const FLIGHT_CACHE = new Map();
const FLIGHT_CACHE_TTL_MS = 60 * 60 * 1000;

async function getFlightsForRegion(regionKey) {
  const bounds = FLIGHT_REGION_BOUNDS[regionKey];
  if (!bounds) return [];

  const cached = FLIGHT_CACHE.get(regionKey);
  if (cached && Date.now() - cached.fetchedAt < FLIGHT_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const url =
      "https://opensky-network.org/api/states/all?lamin=" + bounds.lamin +
      "&lomin=" + bounds.lomin +
      "&lamax=" + bounds.lamax +
      "&lomax=" + bounds.lomax;

    const json = await fetchJsonWithTimeout(url, {}, 10000);
    const states = json.states || [];

    const flights = states
      .filter((state) => state[6] !== null && state[5] !== null && !state[8])
      .slice(0, 180)
      .map((state) => ({
        icao24: state[0],
        callsign: (state[1] || "").trim() || "UNKNOWN",
        lon: state[5],
        lat: state[6],
        altitudeM: state[7],
        heading: state[10] || 0,
        velocityMs: state[9] || 0,
      }));

    FLIGHT_CACHE.set(regionKey, { data: flights, fetchedAt: Date.now() });
    return flights;
  } catch (err) {
    console.error("Flight fetch error [" + regionKey + "]:", err.message);
    // If OpenSky has a transient/rate-limit failure, retain any stale snapshot.
    return cached ? cached.data : [];
  }
}

// ---- Nearby points of interest (OpenStreetMap Overpass) ----
// POIs are deliberately restricted to the requesting user's own *jittered*
// ChilliChat location, cached on a coarse grid, and limited to named features.
// This avoids turning the public Overpass service into a bulk map scraper.

const POI_CACHE = new Map();
const POI_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const POI_RADIUS_METRES = 40000;

function poiGridKey(lat, lon) {
  return (Math.round(lat * 4) / 4) + "," + (Math.round(lon * 4) / 4);
}

function classifyPoi(tags) {
  if (tags.aeroway === "aerodrome") return "airport";
  if (tags.amenity === "hospital") return "hospital";
  if (tags.leisure === "stadium") return "stadium";
  if (tags.tourism === "museum") return "museum";
  if (tags.tourism === "viewpoint") return "viewpoint";
  if (tags.tourism === "zoo") return "zoo";
  if (tags.historic) return "historic";
  return "attraction";
}

async function getPoisNear(lat, lon) {
  const key = poiGridKey(lat, lon);
  const cached = POI_CACHE.get(key);

  if (cached && Date.now() - cached.fetchedAt < POI_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const safeLat = clampNumber(lat, -90, 90);
    const safeLon = clampNumber(lon, -180, 180);
    const around = "(around:" + POI_RADIUS_METRES + "," + safeLat + "," + safeLon + ")";

    const query =
      "[out:json][timeout:18];(" +
      "nwr" + around + '[name][tourism~"^(attraction|museum|viewpoint|zoo)$"];' +
      "nwr" + around + '[name][historic~"^(castle|monument|memorial|ruins|archaeological_site)$"];' +
      "nwr" + around + '[name][amenity="hospital"];' +
      "nwr" + around + '[name][leisure="stadium"];' +
      "nwr" + around + '[name][aeroway="aerodrome"];' +
      ");out center tags;";

    const body = new URLSearchParams({ data: query }).toString();
    const json = await fetchJsonWithTimeout(
      "https://overpass-api.de/api/interpreter",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body,
      },
      22000
    );

    const seen = new Set();
    const pois = [];

    for (const element of json.elements || []) {
      const tags = element.tags || {};
      const poiLat = isFiniteCoordinate(element.lat)
        ? element.lat
        : element.center && element.center.lat;
      const poiLon = isFiniteCoordinate(element.lon)
        ? element.lon
        : element.center && element.center.lon;

      if (!isFiniteCoordinate(poiLat) || !isFiniteCoordinate(poiLon)) continue;
      const name = String(tags.name || "").trim();
      if (!name) continue;

      const dedupe = name.toLowerCase() + ":" + Math.round(poiLat * 1000) + ":" + Math.round(poiLon * 1000);
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      pois.push({
        id: element.type + ":" + element.id,
        name: name.slice(0, 80),
        lat: poiLat,
        lon: poiLon,
        category: classifyPoi(tags),
      });

      if (pois.length >= 90) break;
    }

    POI_CACHE.set(key, { data: pois, fetchedAt: Date.now() });
    return pois;
  } catch (err) {
    console.error("POI fetch error:", err.message);
    return cached ? cached.data : [];
  }
}

// ---- Global earthquakes (USGS real-time GeoJSON feed) ----

let EARTHQUAKE_CACHE = { data: [], fetchedAt: 0 };
const EARTHQUAKE_CACHE_TTL_MS = 10 * 60 * 1000;

async function getRecentEarthquakes() {
  if (Date.now() - EARTHQUAKE_CACHE.fetchedAt < EARTHQUAKE_CACHE_TTL_MS) {
    return EARTHQUAKE_CACHE.data;
  }

  try {
    const json = await fetchJsonWithTimeout(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson",
      {},
      8000
    );

    const quakes = (json.features || []).slice(0, 300).map((feature) => {
      const coords = feature.geometry && feature.geometry.coordinates;
      const props = feature.properties || {};
      return {
        id: feature.id,
        lon: coords ? coords[0] : null,
        lat: coords ? coords[1] : null,
        depthKm: coords ? coords[2] : null,
        magnitude: Number(props.mag || 0),
        place: String(props.place || "Unknown location").slice(0, 100),
        time: props.time || null,
        tsunami: !!props.tsunami,
      };
    }).filter((quake) => isFiniteCoordinate(quake.lat) && isFiniteCoordinate(quake.lon));

    EARTHQUAKE_CACHE = { data: quakes, fetchedAt: Date.now() };
    return quakes;
  } catch (err) {
    console.error("Earthquake fetch error:", err.message);
    return EARTHQUAKE_CACHE.data;
  }
}

async function buildLocationList() {
  try {
    const result = await pool.query(
      "SELECT handle, color, location_lat, location_lon FROM users WHERE location_enabled = TRUE AND location_lat IS NOT NULL AND location_lon IS NOT NULL"
    );

    const rows = result.rows.filter((row) => findSocketIdByHandle(row.handle));

    return await Promise.all(
      rows.map(async (row) => {
        const [weather, aqi] = await Promise.all([
          getWeatherFor(row.location_lat, row.location_lon),
          getAirQualityFor(row.location_lat, row.location_lon),
        ]);

        return {
          handle: row.handle,
          color: row.color,
          lat: row.location_lat,
          lon: row.location_lon,
          weather,
          aqi,
        };
      })
    );
  } catch (err) {
    console.error("Build location list error:", err);
    return [];
  }
}

async function broadcastLocations() {
  const locations = await buildLocationList();
  io.emit("locationsUpdate", locations);
}

async function cleanupExpiredVoiceClips() {
  try {
    const result = await pool.query(
      `DELETE FROM voice_clips
       WHERE created_at < datetime('now', '-5 minutes')
       RETURNING id`
    );

    if (result.rows.length > 0) {
      console.log(
        `Cleaned up ${result.rows.length} expired voice clip(s).`
      );

      result.rows.forEach((row) => {
        io.emit("voiceClipExpired", { clipId: row.id });
      });
    }
  } catch (err) {
    console.error("Voice clip cleanup error:", err);
  }
}

io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);
  socket.emit("moderatorList", MODERATOR_HANDLES);
    

  socket.on("join", async ({ handle, color, deviceToken }) => {
    try {
            const reserved = MODERATOR_HANDLES.find(
        (m) =>
          m.toLowerCase() === String(handle).toLowerCase().trim() &&
          m !== handle
      );

      if (reserved) {
        socket.emit("joinError", "That handle is reserved.");
        return;
      }

      const ban = await checkBanStatus(handle, deviceToken);

      if (ban) {
        if (ban.permanent) {
          socket.emit(
            "joinError",
            "You are permanently banned from ChilliChat."
          );
        } else {
          const until = new Date(ban.expires_at).toLocaleString();
          socket.emit(
            "joinError",
            "You are banned until " + until + "."
          );
        }

        return;
      }

      const existing = await pool.query(
        "SELECT * FROM users WHERE handle = $1",
        [handle]
      );

      if (existing.rows.length === 0) {
        const newToken = deviceToken || generateToken();
                const isModerator = MODERATOR_HANDLES.includes(handle);

        await pool.query(
          "INSERT INTO users (handle, color, device_token, is_moderator) VALUES ($1, $2, $3, $4)",
          [handle, color, newToken, isModerator]
        );

        connectedUsers[socket.id] = {
          handle,
          color,
          status: "active",
          isModerator,
        };

        socket.emit("joinSuccess", {
          handle,
          color,
          deviceToken: newToken,
          isModerator,
        });

        await awardBadge(handle, "fresh_face");
        await broadcastUserList();
        await sendMessageHistory(socket, handle);

        // Retroactive/safe checks let existing database stats unlock the new
        // achievement collection without wiping or recalculating old badges.
        await checkThresholdBadges(handle);
        await checkMediaBadges(handle);
        await checkRegularBadge(handle);
        await checkRankBadges(handle);
        await checkLeaderboardBadges(handle);
        await checkReactionGiverBadges(handle);
        await checkAccountAgeBadges(handle);
        await checkReputationBadges(handle);
      } else {
        const owner = existing.rows[0];

        if (owner.device_token === deviceToken) {
        let isModerator = MODERATOR_HANDLES.includes(handle);

                    if (MODERATOR_HANDLES.includes(handle) && !isModerator) {
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
          await sendMessageHistory(socket, handle);

          // Award any new expansion badges already earned by this returning user.
          await checkThresholdBadges(handle);
          await checkMediaBadges(handle);
          await checkRegularBadge(handle);
          await checkRankBadges(handle);
          await checkLeaderboardBadges(handle);
          await checkReactionGiverBadges(handle);
          await checkAccountAgeBadges(handle);
          await checkReputationBadges(handle);
        } else {
          socket.emit(
            "joinError",
            "That handle is already taken. Please choose another."
          );
        }
      }
    } catch (err) {
      console.error("Join error:", err);
      socket.emit(
        "joinError",
        "Something went wrong. Please try again."
      );
    }
  });

  socket.on("chatMessage", async ({ handle, color, text }) => {
    try {
      const result = await pool.query(
        "INSERT INTO messages (handle, color, text) VALUES ($1, $2, $3) RETURNING id, created_at",
        [handle, color, text]
      );

      const messageId = result.rows[0].id;

      io.emit("chatMessage", {
        id: messageId,
        handle,
        color,
        text,
        createdAt: result.rows[0].created_at,
      });

      await pool.query(
        "UPDATE users SET messages_sent = messages_sent + 1, messages_since_idle = messages_since_idle + 1 WHERE handle = $1",
        [handle]
      );

      const counterCheck = await pool.query(
        "SELECT messages_since_idle FROM users WHERE handle = $1",
        [handle]
      );

      if (
        counterCheck.rows.length > 0 &&
        counterCheck.rows[0].messages_since_idle >= 100
      ) {
        await awardBadge(handle, "lightning_fingers");
      }

      if (
        counterCheck.rows.length > 0 &&
        counterCheck.rows[0].messages_since_idle >= 1000
      ) {
        await awardBadge(handle, "keyboard_warranty_void");
      }

      await checkThresholdBadges(handle);
      await updateStreak(handle);
      await checkRegularBadge(handle);
      await checkAccountAgeBadges(handle);
    } catch (err) {
      console.error("Failed to save message:", err);
    }
  });

    socket.on(
    "voiceClip",
    async ({ handle, color, audioData, durationMs }) => {
      const MAX_DURATION_MS = 15000;
      const MAX_SIZE_BYTES = 1024 * 1024;

      if (
        typeof audioData !== "string" ||
        !audioData.startsWith("data:audio/wav;base64,")
      ) {
        socket.emit("reactionError", "Voice clip rejected: unsupported format.");
        return;
      }

      if (!durationMs || durationMs > MAX_DURATION_MS + 500) {
        socket.emit("reactionError", "Voice clip rejected: too long.");
        return;
      }

      if (audioData.length > MAX_SIZE_BYTES) {
        socket.emit("reactionError", "Voice clip rejected: too large.");
        return;
      }

      // Ignore an exact repeat of the same recording.
      const fingerprint =
        handle +
        ":" +
        crypto.createHash("sha1").update(audioData).digest("hex");

      if (recentVoiceClips.has(fingerprint)) return;

      recentVoiceClips.add(fingerprint);
      setTimeout(() => recentVoiceClips.delete(fingerprint), 30000);

      try {
        const result = await pool.query(
          "INSERT INTO voice_clips (handle, color, audio_data, duration_ms) VALUES ($1, $2, $3, $4) RETURNING id, created_at",
          [handle, color, audioData, durationMs]
        );

        io.emit("voiceClip", {
          id: result.rows[0].id,
          handle,
          color,
          audioData,
          durationMs,
          counts: emptyReactionCounts(),
          heatRating: null,
          createdAt: result.rows[0].created_at,
        });

        await pool.query(
          "UPDATE users SET voice_clips_sent = voice_clips_sent + 1 WHERE handle = $1",
          [handle]
        );

        await checkMediaBadges(handle);
      } catch (err) {
        console.error("Failed to save voice clip:", err);
      }
    }
  )
  
  ;socket.on(
    "photoUpload",
    async ({ handle, color, imageData }) => {
      const MAX_SIZE_BYTES = 1.2 * 1024 * 1024;

      if (
        !imageData ||
        typeof imageData !== "string" ||
        !imageData.startsWith("data:image/")
      ) {
        socket.emit(
          "reactionError",
          "Photo rejected: invalid file."
        );
        return;
      }

      if (imageData.length > MAX_SIZE_BYTES) {
        socket.emit(
          "reactionError",
          "Photo rejected: too large."
        );
        return;
      }

      try {
        const result = await pool.query(
          "INSERT INTO photos (handle, color, image_data) VALUES ($1, $2, $3) RETURNING id, created_at",
          [handle, color, imageData]
        );

        const photoId = result.rows[0].id;

        io.emit("photoNew", {
          id: photoId,
          handle,
          color,
          counts: emptyReactionCounts(),
          heatRating: null,
          createdAt: result.rows[0].created_at,
          expired: false,
          remainingMs: PHOTO_LIFETIME_MS,
        });

        await checkMediaBadges(handle);

        setTimeout(() => {
          io.emit("photoExpired", { photoId });
        }, PHOTO_LIFETIME_MS);
      } catch (err) {
        console.error("Failed to save photo:", err);
      }
    }
  );

  socket.on("photoOpen", async ({ photoId }) => {
    try {
      const photoResult = await pool.query(
        "SELECT handle, color, image_data, deleted, created_at FROM photos WHERE id = $1",
        [photoId]
      );

      if (
        photoResult.rows.length === 0 ||
        photoResult.rows[0].deleted
      ) {
        socket.emit("photoResult", {
          photoId,
          expired: true,
        });
        return;
      }

      const photo = photoResult.rows[0];
      const ageMs =
        Date.now() - new Date(photo.created_at).getTime();

      const remainingMs = PHOTO_LIFETIME_MS - ageMs;

      if (remainingMs <= 0) {
        socket.emit("photoResult", {
          photoId,
          expired: true,
        });
        return;
      }

      socket.emit("photoResult", {
        photoId,
        imageData: photo.image_data,
        expired: false,
        remainingMs,
      });
    } catch (err) {
      console.error("Photo open error:", err);

      socket.emit("photoResult", {
        photoId,
        expired: true,
      });
    }
  });

  socket.on(
    "reaction",
    async ({ targetType, targetId, messageId, reactionType }) => {
      const allowed = [
        "chilli",
        "heart",
        "laugh",
        "down",
        "poo",
      ];

      if (!allowed.includes(reactionType)) return;

      const me = connectedUsers[socket.id];
      if (!me) return;

      // Backward compatibility: older ChilliChat clients only sent messageId.
      const resolvedType = REACTION_TARGETS[targetType] ? targetType : "text";
      const resolvedId =
        targetId !== undefined && targetId !== null ? targetId : messageId;

      if (resolvedId === undefined || resolvedId === null) return;

      const target = REACTION_TARGETS[resolvedType];
      const reactingHandle = me.handle;

      try {
        const contentResult = await pool.query(
          `SELECT handle, created_at, deleted
           FROM ${target.contentTable}
           WHERE id = $1`,
          [resolvedId]
        );

        if (contentResult.rows.length === 0) return;

        const content = contentResult.rows[0];
        if (content.deleted) return;

        const authorHandle = content.handle;

        if (authorHandle === reactingHandle) {
          socket.emit(
            "reactionError",
            "You can't react to your own " + target.label + "."
          );
          return;
        }

        if (target.lifetimeMs) {
          const createdMs = new Date(content.created_at).getTime();
          const ageMs = Date.now() - createdMs;

          if (!Number.isFinite(createdMs) || ageMs >= target.lifetimeMs) {
            socket.emit(
              "reactionError",
              target.label === "photo"
                ? "That photo has already burned away."
                : "That voice clip has expired."
            );
            return;
          }
        }

        const existing = await pool.query(
          `SELECT id FROM ${target.reactionTable}
           WHERE ${target.idColumn} = $1 AND handle = $2 AND reaction = $3`,
          [resolvedId, reactingHandle, reactionType]
        );

        const schoValue = REACTION_SCHO_VALUES[reactionType] || 0;

        const counterColumn = {
          chilli: "chilli_received",
          heart: "hearts_received",
          laugh: "laughs_received",
          down: "down_received",
          poo: "poo_received",
        }[reactionType];

        let scoreIncreased = false;

        if (existing.rows.length > 0) {
          await pool.query(
            `DELETE FROM ${target.reactionTable} WHERE id = $1`,
            [existing.rows[0].id]
          );

          await pool.query(
            `UPDATE users
             SET scho_total = scho_total - $1,
                 ${counterColumn} = GREATEST(${counterColumn} - 1, 0)
             WHERE handle = $2`,
            [schoValue, authorHandle]
          );

          scoreIncreased = schoValue < 0;
        } else {
          // The UNIQUE constraint is the final authority. Two near-simultaneous
          // pointer/socket events can both pass the SELECT above; ON CONFLICT
          // makes the second one a harmless no-op instead of throwing.
          const insertResult = await pool.query(
            `INSERT INTO ${target.reactionTable}
             (${target.idColumn}, handle, reaction)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING
             RETURNING id`,
            [resolvedId, reactingHandle, reactionType]
          );

          if (insertResult.rows.length > 0) {
            await pool.query(
              `UPDATE users
               SET scho_total = scho_total + $1,
                   ${counterColumn} = ${counterColumn} + 1
               WHERE handle = $2`,
              [schoValue, authorHandle]
            );

            await checkThresholdBadges(authorHandle);
            scoreIncreased = schoValue > 0;
          }
        }

        // Re-check giver achievements after either adding or removing a reaction.
        // Badges are permanent once earned, but this keeps current active-reaction
        // totals authoritative and prevents add/remove spam from inflating them.
        await checkReactionGiverBadges(reactingHandle);

        if (scoreIncreased) {
          await checkRankBadges(authorHandle).catch((e) =>
            console.error("Rank badge error:", e)
          );
        }

        await checkReputationBadges(authorHandle);

        const counts = await getReactionCountsFor(resolvedType, resolvedId);
        const heatRating = computeHeatRating(counts);

        await checkSpecialContentBadges(authorHandle, counts);

        io.emit("reactionUpdate", {
          targetType: resolvedType,
          targetId: resolvedId,
          // Keep messageId for older clients when the target is a text message.
          messageId: resolvedType === "text" ? resolvedId : undefined,
          counts,
          heatRating,
        });

        await broadcastUserList();
        await checkLeaderboardBadges(authorHandle);

        if (scoreIncreased) {
          await checkHeatNotifications(authorHandle);
        }
      } catch (err) {
        console.error("Reaction error:", err);
      }
    }
  );

  socket.on("getHighrollers", async ({ period }) => {
    const interval =
      period === "week" ? "7 days" : "24 hours";

    try {
      const result = await pool.query(`
        SELECT m.id, m.handle, m.color, m.text, m.created_at,
          COUNT(*) FILTER (WHERE r.reaction = 'chilli') AS chilli,
          COUNT(*) FILTER (WHERE r.reaction = 'heart') AS heart,
          COUNT(*) FILTER (WHERE r.reaction = 'laugh') AS laugh,
          COUNT(*) FILTER (WHERE r.reaction = 'down') AS down,
          COUNT(*) FILTER (WHERE r.reaction = 'poo') AS poo
        FROM messages m
        JOIN message_reactions r ON r.message_id = m.id
        WHERE m.created_at > NOW() - INTERVAL '${interval}'
          AND m.deleted = FALSE
        GROUP BY m.id
      `);

      const rated = result.rows.map((msg) => {
        const counts = {
          chilli: parseInt(msg.chilli),
          heart: parseInt(msg.heart),
          laugh: parseInt(msg.laugh),
          down: parseInt(msg.down),
          poo: parseInt(msg.poo || 0),
        };

        return {
          id: msg.id,
          handle: msg.handle,
          color: msg.color,
          text: msg.text,
          heatRating: computeHeatRating(counts),
        };
      });

      rated.sort(
        (a, b) => b.heatRating - a.heatRating
      );

      const top5 = rated.slice(0, 5);

      socket.emit("highrollersResult", {
        period,
        entries: top5,
      });
    } catch (err) {
      console.error("Highrollers error:", err);
    }
  });

  socket.on(
    "getUserProfile",
    async ({ targetHandle }) => {
      try {
        const userResult = await pool.query(
          "SELECT scho_total, hearts_received, laughs_received, chilli_received, down_received, poo_received, equipped_badge, bio, profile_photo FROM users WHERE handle = $1",
          [targetHandle]
        );

        if (userResult.rows.length === 0) return;

        const u = userResult.rows[0];
        const rank = computeScovilleRank(u.scho_total);

        const badgeResult = await pool.query(
          "SELECT badge_key, earned_at FROM badges WHERE handle = $1",
          [targetHandle]
        );

        const unlockedKeys = badgeResult.rows.map(
          (r) => r.badge_key
        );

        const badgeEarnedAt = {};
        badgeResult.rows.forEach((row) => {
          badgeEarnedAt[row.badge_key] = row.earned_at || null;
        });

        const me = connectedUsers[socket.id];

        socket.emit("userProfileResult", {
          handle: targetHandle,
          rankName: rank.name,
          rankEmoji: rank.emoji,
          scho: u.scho_total,
          reactions: {
            heart: u.hearts_received,
            laugh: u.laughs_received,
            chilli: u.chilli_received,
            down: u.down_received,
            poo: u.poo_received,
          },
          unlockedKeys,
          badgeEarnedAt,
          equippedBadge: u.equipped_badge,
          bio: u.bio || "",
          profilePhoto: u.profile_photo || "",
          isOwn:
            !!me && me.handle === targetHandle,
        });
      } catch (err) {
        console.error(
          "Get user profile error:",
          err
        );
      }
    }
  );

  socket.on("updateLocation", async ({ enabled, lat, lon }) => {
    const me = connectedUsers[socket.id];
    if (!me) return;

    try {
      if (enabled && typeof lat === "number" && typeof lon === "number") {
        await pool.query(
          "UPDATE users SET location_enabled = TRUE, location_lat = $1, location_lon = $2 WHERE handle = $3",
          [lat, lon, me.handle]
        );
      } else {
        await pool.query(
          "UPDATE users SET location_enabled = FALSE, location_lat = NULL, location_lon = NULL WHERE handle = $1",
          [me.handle]
        );
      }

      await broadcastLocations();
    } catch (err) {
      console.error("Update location error:", err);
    }
  });

   socket.on("getLocations", async () => {
    const locations = await buildLocationList();
    socket.emit("locationsUpdate", locations);
  });

  socket.on("getFlights", async ({ region } = {}) => {
    const me = connectedUsers[socket.id];
    if (!me) return;

    const safeRegion = Object.prototype.hasOwnProperty.call(FLIGHT_REGION_BOUNDS, region)
      ? region
      : "uk";

    const flights = await getFlightsForRegion(safeRegion);
    socket.emit("flightsUpdate", {
      region: safeRegion,
      source: "OpenSky",
      flights,
    });
  });

  socket.on("getMapPois", async () => {
    const me = connectedUsers[socket.id];
    if (!me) return;

    try {
      const result = await pool.query(
        "SELECT location_enabled, location_lat, location_lon FROM users WHERE handle = $1",
        [me.handle]
      );
      const row = result.rows[0];

      if (!row || !row.location_enabled || !isFiniteCoordinate(row.location_lat) || !isFiniteCoordinate(row.location_lon)) {
        socket.emit("mapPoisUpdate", { source: "OpenStreetMap", pois: [] });
        return;
      }

      const pois = await getPoisNear(row.location_lat, row.location_lon);
      socket.emit("mapPoisUpdate", { source: "OpenStreetMap", pois });
    } catch (err) {
      console.error("Map POI request error:", err);
      socket.emit("mapPoisUpdate", { source: "OpenStreetMap", pois: [] });
    }
  });

  socket.on("getEarthquakes", async () => {
    const me = connectedUsers[socket.id];
    if (!me) return;

    const earthquakes = await getRecentEarthquakes();
    socket.emit("earthquakesUpdate", {
      source: "USGS",
      earthquakes,
    });
  });


  socket.on("updateBio", async ({ bio }) => {
    const me = connectedUsers[socket.id];

    if (!me) return;

    const trimmed = (bio || "").slice(0, 150);

    try {
      await pool.query(
        "UPDATE users SET bio = $1 WHERE handle = $2",
        [trimmed, me.handle]
      );

      socket.emit("bioUpdateResult", {
        success: true,
        bio: trimmed,
      });
    } catch (err) {
      console.error("Update bio error:", err);

      socket.emit("bioUpdateResult", {
        success: false,
      });
    }
  });

  socket.on("updateProfilePhoto", async ({ imageData } = {}) => {
    const me = connectedUsers[socket.id];

    if (!me) return;

    try {
      const safePhoto =
        imageData === null || imageData === ""
          ? null
          : sanitizeProfilePhotoDataUrl(imageData);

      await pool.query(
        "UPDATE users SET profile_photo = $1 WHERE handle = $2",
        [safePhoto, me.handle]
      );

      socket.emit("profilePhotoUpdateResult", {
        success: true,
        profilePhoto: safePhoto || "",
      });

      io.emit("profilePhotoUpdated", {
        handle: me.handle,
        profilePhoto: safePhoto || "",
      });

      await broadcastUserList();
    } catch (err) {
      console.error("Update profile photo error:", err.message);

      socket.emit("profilePhotoUpdateResult", {
        success: false,
        message:
          err && err.message
            ? err.message
            : "Profile photo update failed.",
      });
    }
  });

  socket.on("equipBadge", async ({ badgeKey }) => {
    const me = connectedUsers[socket.id];

    if (!me) return;

    try {
      if (badgeKey !== null) {
        const owns = await pool.query(
          "SELECT id FROM badges WHERE handle = $1 AND badge_key = $2",
          [me.handle, badgeKey]
        );

        if (owns.rows.length === 0) return;
      }

      await pool.query(
        "UPDATE users SET equipped_badge = $1 WHERE handle = $2",
        [badgeKey, me.handle]
      );

      await broadcastUserList();
    } catch (err) {
      console.error("Equip badge error:", err);
    }
  });

  socket.on("getUserLeaderboard", async () => {
    try {
      const result = await pool.query(
        "SELECT handle, color, scho_total, created_at FROM users ORDER BY scho_total DESC, created_at ASC LIMIT 20"
      );

      const leaderboard = result.rows.map((row) => {
        const rank = computeScovilleRank(row.scho_total);

        return {
          handle: row.handle,
          color: row.color,
          scho: row.scho_total,
          rankName: rank.name,
          rankEmoji: rank.emoji,
        };
      });

      socket.emit("userLeaderboardResult", {
        leaderboard,
      });
    } catch (err) {
      console.error("Leaderboard error:", err);
    }
  });

  // ---- Moderator actions ----

  socket.on("moderatorKick", ({ targetHandle }) => {
    const me = connectedUsers[socket.id];

    if (!me || !me.isModerator) return;
          if (targetHandle === me.handle) return;

    

    if (targetHandle === OWNER_HANDLE && me.handle !== OWNER_HANDLE) {
      socket.emit("reactionError", "You can't moderate " + OWNER_HANDLE + ".");
      return;
    }

    const targetSocketId =
      findSocketIdByHandle(targetHandle);

    if (!targetSocketId) return;

    const targetSocket =
      io.sockets.sockets.get(targetSocketId);

    if (targetSocket) {
      targetSocket.emit("youWereKicked");
      targetSocket.disconnect(true);
    }
  });

  socket.on(
    "moderatorBan",
    async ({ targetHandle, duration, reason }) => {
      const me = connectedUsers[socket.id];

      if (!me || !me.isModerator) return;
      if (targetHandle === me.handle) return;

      try {
        const targetUser = await pool.query(
          "SELECT device_token FROM users WHERE handle = $1",
          [targetHandle]
        );

        if (targetUser.rows.length === 0) return;

        const deviceToken =
          targetUser.rows[0].device_token;

        const expiresAt =
          computeBanExpiry(duration);

        const permanent = expiresAt === null;

        await pool.query(
          "INSERT INTO bans (handle, device_token, reason, banned_by, expires_at, permanent) VALUES ($1, $2, $3, $4, $5, $6)",
          [
            targetHandle,
            deviceToken,
            reason || "No reason given",
            me.handle,
            expiresAt,
            permanent,
          ]
        );

        const targetSocketId =
          findSocketIdByHandle(targetHandle);

        if (targetSocketId) {
          const targetSocket =
            io.sockets.sockets.get(targetSocketId);

          if (targetSocket) {
            targetSocket.emit("youWereBanned", {
              permanent,
              until: expiresAt
                ? expiresAt.toLocaleString()
                : null,
            });

            targetSocket.disconnect(true);
          }
        }
      } catch (err) {
        console.error("Ban error:", err);
      }
    }
  );

  socket.on(
    "moderatorDeleteMessage",
        async ({ messageId }) => {
      if (!(await moderatorMayTouch(socket, "messages", messageId))) return;
      const me = connectedUsers[socket.id];

      if (!me || !me.isModerator) return;

      try {
        await pool.query(
          "UPDATE messages SET deleted = TRUE, deleted_by = $1 WHERE id = $2",
          [me.handle, messageId]
        );

        io.emit("contentDeleted", {
          type: "text",
          id: messageId,
        });
      } catch (err) {
        console.error(
          "Delete message error:",
          err
        );
      }
    }
  );

  socket.on(
    "moderatorDeleteVoiceClip",
        async ({ clipId }) => {
      if (!(await moderatorMayTouch(socket, "voice_clips", clipId))) return;
      const me = connectedUsers[socket.id];

      if (!me || !me.isModerator) return;

      try {
        await pool.query(
          "UPDATE voice_clips SET deleted = TRUE, deleted_by = $1 WHERE id = $2",
          [me.handle, clipId]
        );

        io.emit("contentDeleted", {
          type: "voice",
          id: clipId,
        });
      } catch (err) {
        console.error(
          "Delete voice clip error:",
          err
        );
      }
    }
  );

  socket.on(
    "moderatorDeletePhoto",
        async ({ photoId }) => {
      if (!(await moderatorMayTouch(socket, "photos", photoId))) return;
      const me = connectedUsers[socket.id];

      if (!me || !me.isModerator) return;

      try {
        await pool.query(
          "UPDATE photos SET deleted = TRUE, deleted_by = $1 WHERE id = $2",
          [me.handle, photoId]
        );

        io.emit("contentDeleted", {
          type: "photo",
          id: photoId,
        });
      } catch (err) {
        console.error(
          "Delete photo error:",
          err
        );
      }
    }
  );

  socket.on("typing", ({ handle }) => {
    socket.broadcast.emit("typing", { handle });
  });

  socket.on("stopTyping", ({ handle }) => {
    socket.broadcast.emit("stopTyping", { handle });
  });

  socket.on("statusChange", async (status) => {
    if (connectedUsers[socket.id]) {
      connectedUsers[socket.id].status = status;

      if (status === "idle") {
        const handle =
          connectedUsers[socket.id].handle;

        try {
          await pool.query(
            "UPDATE users SET messages_since_idle = 0 WHERE handle = $1",
            [handle]
          );
        } catch (err) {
          console.error(
            "Reset idle counter error:",
            err
          );
        }
      }

           await broadcastUserList();
    }
  });

  socket.on("disconnect", async () => {
    console.log(
      "A user disconnected:",
      socket.id
    );

    delete connectedUsers[socket.id];

    await broadcastUserList();
    await broadcastLocations();
  });
});

const PORT = process.env.PORT || 3000;

setupDatabase()
  .then(() => {
    server.listen(PORT, () => {
      console.log(
        `ChilliChat server running at http://localhost:${PORT}`
      );
    });

        cleanupExpiredVoiceClips();

    setInterval(
      cleanupExpiredVoiceClips,
      VOICE_CLIP_CLEANUP_INTERVAL_MS
    );

    // Map flight/POI/earthquake feeds are fetched on demand and cached.
  })
  .catch((err) => {
    console.error(
      "Failed to connect to database:",
      err
    );
  });

 // ---------- Voice clip helpers ----------

// Remembers recent clips so an accidental double-send is ignored.
const recentVoiceClips = new Set();