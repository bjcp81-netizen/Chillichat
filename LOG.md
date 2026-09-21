# ChilliChat — Project Log

Last updated: 19 September 2026

This file explains how ChilliChat works and keeps a record of changes.
It is written for a beginner, so it explains the basics too.

**How to read the labels in this file**
- **Verified** = read directly in the project's actual code.
- **From handover** = told to Claude by the project owner, not checked in code.
- **Not verified** = a guess or an unknown. Do not rely on it.

---

## 1. What ChilliChat is

A real-time group chat website with a chilli-pepper theme. People join with a
handle and a colour (no accounts, no passwords). Messages appear instantly for
everyone. (Verified)

Features that exist in the code (Verified):
- Text chat, voice clips, and photos that "burn away" after 15 seconds
- Reactions (🌶️ ❤️ 😂 👎) that add to a "Scoville" score and rank tiers
- Badges, streaks, and user profiles with a short bio
- Moderator tools for the handle "Mdnight" (kick, ban, delete)
- Highrollers leaderboard (Today / This Week / Top Users)
- Options panel (font, font colour, font size, bold, sound)

---

## 2. The technology, in plain English

| Piece | What it is | What it does for ChilliChat |
|---|---|---|
| **Node.js** | A program that lets JavaScript run on your PC, outside a browser | Runs `server.js`, the "brain" of the chat |
| **Express** | A Node add-on for serving web pages | Sends the files in the `public` folder to browsers |
| **Socket.IO** | A Node add-on for live two-way connections | Lets messages appear instantly without refreshing |
| **SQLite** | A database stored in ONE file (`chillichat.db`) | Remembers users, messages, reactions, badges, etc. |
| **FFmpeg** | An audio/video conversion tool (bundled via `ffmpeg-static`) | Converts voice clips to WebM/Opus on the server |
| **Cloudflare Tunnel** | A secure link from the internet to your PC | Makes `chillichat.co.uk` reach the server on your PC (From handover) |
| **HTML / CSS / JS** | The three languages of web pages | HTML = structure, CSS = looks, JS = behaviour |

**Frontend vs backend.** The *frontend* is what runs in the user's browser
(`public/` folder). The *backend* is what runs on your PC (`server.js`). They
talk to each other using Socket.IO "events" (named messages such as
`chatMessage` or `reaction`).

**Database.** Think of it as a set of spreadsheets (called *tables*), one per
kind of thing. Each row is one item (one message, one user). `SQL` is the
language used to ask the database questions.

---

## 3. Folder and file layout (Verified from your file listing)

```
ChilliChat/                      <- the project folder (the "root")
│
├── server.js                    <- BACKEND. The brain. Start this to run the app.
├── sqlite-db.js                 <- Database helper. Lets server.js talk to SQLite.
├── package.json                 <- List of add-ons the project needs.
├── package-lock.json            <- Exact versions of those add-ons. Don't edit by hand.
├── .env                         <- Private settings. Never share or upload.
├── .gitignore                   <- Tells Git which files to ignore (node_modules, .env).
├── chillichat.db                <- THE DATABASE. All your real data lives here.
├── chillichat_backup.db         <- A backup copy of the database.
├── node_modules/                <- Downloaded add-ons. Big. Never edit.
│
├── public/                      <- FRONTEND. Everything browsers can see.
│   ├── index.html               <- Page structure (join screen, chat screen).
│   ├── style.css                <- All the looks (colours, boxes, animations).
│   ├── app.js                   <- Frontend behaviour (buttons, showing messages).
│   └── *.ogg / *.wav / *.png    <- Sound effects and images.
│
├── server_postgres_backup.js    <- OLD backup. Not the live file.
├── server_working_backup.js     <- OLD backup. Not the live file.
├── sqlite-db_working_backup.js  <- OLD backup. Not the live file.
├── LOG.md                       <- This file.
└── CONSIDERATIONS.md            <- To-do ideas and parked ideas.
```

Odd files named `{` and `{})` exist in the folder. Their purpose is **not
verified**, so do not delete or edit them until we know what they are.

**Important rule:** only the `public` folder is visible to website visitors.
Files in the root (like `server.js`, `.env`, `LOG.md`) are private.

---

## 4. How one text message travels (Verified)

1. You type and press Send. `app.js` (function `sendMessage`) sends a
   `chatMessage` event to the server.
2. `server.js` receives it (`socket.on("chatMessage", ...)`) and saves it into
   the `messages` table.
3. `server.js` sends it to EVERYONE (`io.emit("chatMessage", ...)`).
4. Every browser's `app.js` receives it (`socket.on("chatMessage", ...)`),
   builds the message box on screen, and adds it to the chat.

Reactions, voice clips and photos follow the same pattern with different event
names (`reaction`, `voiceClip`, `photoUpload`).

---

## 5. What is where

**`server.js`** (top to bottom): settings and rank/badge tables → helper
functions → `setupDatabase()` (creates the tables) → badge/streak/notification
functions → `io.on("connection", ...)` which holds one handler per event
(`join`, `chatMessage`, `voiceClip`, `photoUpload`, `reaction`, moderator
actions...) → server start at the very bottom.

**`public/app.js`** (top to bottom): settings and lists → option-panel code
(fonts, sizes) → the scroll-wheel picker → join screen → profile pop-up →
users list and moderator panel → sending messages → reactions → incoming
messages → idle/connection handling → voice clips → photos.

**`public/style.css`**: rules are added over time, so later rules override
earlier ones. New rules are added at the **bottom** of the file.

---

## 6. Database tables (Verified from `setupDatabase()` in server.js)

`users`, `messages`, `message_reactions`, `bans`, `badges`, `voice_clips`,
`photos`, `photo_views`.

`sqlite-db.js` translates older PostgreSQL-style commands into SQLite ones.
That is why some SQL in `server.js` looks Postgres-like (`NOW()`, `SERIAL`).

---

## 7. Everyday commands

**Open the terminal in VS Code:** press `Ctrl+` ` (the backtick key, above Tab).

| I want to... | Do this |
|---|---|
| Start the server to test | In the terminal type `node server.js` and press Enter. Wait for "ChilliChat server running at http://localhost:3000" |
| Stop the server | Click in the terminal, press `Ctrl+C` |
| View the app on my PC | Open a browser at `http://localhost:3000` |
| See my latest browser changes | Hard refresh: `Ctrl+Shift+R` |

**When do I need to restart the server?**
- Changed `server.js` or `sqlite-db.js` → **YES, restart.**
- Changed only files in `public/` (`index.html`, `style.css`, `app.js`) →
  **No restart.** Just hard refresh the browser.

**Only one copy of the server can run at a time** (port 3000). If the Windows
Scheduled Task copy is running, a second `node server.js` will fail. Stop the
first one (Task Scheduler → End, or end "Node.js JavaScript Runtime" in Task
Manager).

**Scheduled Task and Cloudflare (From handover, not re-checked):**
- A Windows Scheduled Task called `ChilliChat Node Server` starts the server
  automatically.
- The Cloudflare tunnel is started by `run-chillichat.cmd` in
  `C:\ProgramData\cloudflared`. It was working. Don't recreate it unless there
  is a proven problem.

**Git (saving your work to GitHub):**
```
git status                       (shows what changed)
git add .                        (get changes ready)
git commit -m "describe change"  (save a snapshot)
git push                         (upload to GitHub)
```
Only commit AFTER testing that the change works. GitHub is now just a
backup: `git push` no longer deploys anything, because hosting moved from
Render to your own PC.

---

## 8. Working rules (From handover)

- Treat the real code as the source of truth, not memory or guesses.
- One task at a time, smallest possible change.
- Inspect → change → test → confirm → commit → push.
- Do not bring back Render, Neon/PostgreSQL or MongoDB.
- Old backup folders/files are not the current project.
- If a phone doesn't show a CSS change, bump the number in `style.css?v=N` in index.html.
---

## 9. Known state

**Working (reported by the project owner):**
- Server runs; site reachable at chillichat.co.uk
- Text chat, voice clips (phone and PC), history, reactions

**Resolved:**
- PC voice clips were silent. Diagnosis showed the clip reached the server
  intact and FFmpeg converted it fine; the PC microphone was recording silence.
  Not a code bug. What exactly fixed the mic is not recorded.
- Old audio code is still in app.js (startRecordingOld, stopRecordingOld, the "voiceClipExpiredOld" handler) and server.js (transcodeVoiceClipToWebm, makeMp4CopyForIphones, mp4Copies). It is switched off but not yet removed.
- Render is deleted. Do not reference it.
---

## 10. Change log

| Date | Change | Status |
|---|---|---|
| 19 Sep 2026 | Voice bug investigated with temporary logging; logging removed | Done |
| 19 Sep 2026 | WebM transcode block in `voiceClip` handler accidentally removed, then restored | Done, tested OK |
| 19 Sep 2026 | Created LOG.md and CONSIDERATIONS.md | Done |
| 20 Sep 2026 | Removed duplicate app.js script tag in index.html (fixed Options/Users/Highrollers buttons) | Done, tested |
| 20 Sep 2026 | Text messages in boxes; 🌶️ pill top-right opens reaction picker; long-press removed; style.css?v=2 added to bypass phone/Cloudflare cache | Done, tested on PC and mobile |
| 20 Sep 2026 | Removed duplicate app.js script tag (fixed Options/Users/Highrollers). Text messages in boxes, 🌶️ pill top-right opens reaction picker, long-press removed | Done, tested |
| 20 Sep 2026 | Voice clips rebuilt: new public/voice.js records raw audio and sends a 16 kHz WAV; no FFmpeg or WebM. Clips burn after 5 min (server sweep every 10s + burn animation). | Done, tested on PC Chrome/Firefox, iPhone Safari, Android Chrome/Brave/Edge/Firefox |
| 20 Sep 2026 | public/voicetest.html added as a standalone recording test page | Done |
### 21/09/2026 — Picker and reaction functionality confirmed working

The ChilliChat picker/offline issue has cleared and the application is currently functional. Reaction functionality has also been confirmed working correctly across devices.

No further code changes were made at this stage. The issue appeared to resolve without a deliberate change to the reaction implementation, so the exact cause of the temporary failure remains unconfirmed.

Current status: ChilliChat functional and reactions working. Preserve this state as the current known-good baseline before making further changes.
