# ChilliChat — Architecture & Development Log

**Last updated:** 25 September 2026  
**Project root:** `C:\Users\jaggy\OneDrive\Desktop\ChilliChat`  
**Public site:** `https://chillichat.co.uk`  
**Local server:** `http://localhost:3000`  
**Planned stable tag for this checkpoint:** `ChilliChat-Stable-Profiles-Achievements-1`

---

## 1. Purpose of this file

This is the handover and recovery log for ChilliChat.

Use it to answer four questions:

1. What does the current system actually do?
2. Where does each part live?
3. What has already been built and tested?
4. How do we get back to a known-good version if later work goes wrong?

### Source-of-truth rule

The **current files in the active ChilliChat folder are the source of truth**.

Old ZIP files, `*.before-*` files, experimental folders, old chats and old notes are useful as backups only. They must not be treated as the current implementation without checking the live files first.

---

## 2. Current architecture

ChilliChat is a self-hosted real-time web chat application.

```text
Internet user
    |
    v
chillichat.co.uk
    |
    v
Cloudflare Tunnel
    |
    v
Windows PC
    |
    +--> Node.js / Express
    |       |
    |       +--> serves public/index.html
    |       +--> serves public/style.css
    |       +--> serves public/app.js
    |       +--> serves public/voice.js
    |       +--> Socket.IO real-time events
    |
    +--> SQLite
            |
            +--> chillichat.db
```

The server runs locally. Render and Neon are no longer part of the current architecture.

### Main technologies

| Component | Role |
|---|---|
| Node.js | Runs the backend |
| Express | Serves the browser files |
| Socket.IO | Real-time two-way communication |
| SQLite | Local persistent database |
| HTML | Browser structure |
| CSS | Styling, animation and responsive layout |
| JavaScript | Browser behaviour |
| Cloudflare Tunnel | Connects the public domain to the local server |

Current npm dependencies are intentionally small: `dotenv`, `express` and `socket.io`.

---

## 3. Important files

```text
ChilliChat/
|
|-- server.js
|   Backend, Socket.IO events, database setup, moderation,
|   reactions, achievements, profiles, Radar data and expiry jobs.
|
|-- sqlite-db.js
|   SQLite compatibility/query adapter used by server.js.
|
|-- chillichat.db
|   LIVE DATABASE. Treat this as user data, not ordinary source code.
|
|-- LOG.md
|   This file.
|
|-- public/
|   |
|   |-- index.html
|   |   Main page structure.
|   |
|   |-- style.css
|   |   Main styling and animations.
|   |
|   |-- app.js
|   |   Main browser-side ChilliChat logic.
|   |
|   |-- voice.js
|   |   Current browser voice recorder.
|   |
|   |-- radar-geography.json
|   |   Geography/outlines used by the Radar.
|   |
|   `-- images / sounds / manifest assets
```

`.env` contains private configuration and must not be published.

---

## 4. Startup and normal development commands

Start ChilliChat:

```powershell
cd "C:\Users\jaggy\OneDrive\Desktop\ChilliChat"
node server.js
```

Expected startup:

```text
Connected to local SQLite and tables are ready
ChilliChat server running at http://localhost:3000
```

Stop the server:

```text
Ctrl + C
```

Hard-refresh browser files:

```text
Ctrl + Shift + R
```

### When a restart is required

- `server.js` changed: **restart Node**
- `sqlite-db.js` changed: **restart Node**
- only `public/*` changed: normally **hard refresh only**
- database schema migration added in `server.js`: **restart Node**

Only one process can listen on port 3000 at a time.

---

## 5. Real-time chat flow

A normal text message follows this route:

```text
Browser app.js
    |
    | Socket.IO event
    v
server.js
    |
    +--> validate
    +--> save to SQLite
    +--> update stats / achievements
    |
    | Socket.IO broadcast
    v
all connected browsers
```

The same overall pattern is used for reactions, voice clips, photos, locations, profiles and moderation events.

New joiners receive a merged recent history of the latest **5** text/voice/photo items.

---

## 6. Users and identity

ChilliChat uses persistent handles/device identity rather than a traditional username/password account system.

Current user features include:

- handle
- handle colour
- moderator status
- Scoville score
- Scoville rank
- reaction statistics
- bio
- badges / equipped badge
- streak data
- activity statistics
- optional approximate location
- optional profile photo

The owner moderator handle is:

```text
Mdnight
```

The second moderator handle is:

```text
MR MATTI3
```

The owner is protected from moderation actions by other moderators.

---

## 7. Reactions and Scoville

Current reactions:

| Reaction | Key | Scoville effect |
|---|---|---:|
| 🌶️ Chilli | `chilli` | +5 |
| ❤️ Loveheart | `heart` | +10 |
| 😂 Laugh | `laugh` | +8 |
| 👎 Thumbs Down | `down` | -5 |
| 💩 Jobbies | `poo` | -50 |

Reactions work across:

- text messages
- voice clips
- photo posts

The reaction system uses unique database constraints so one handle cannot create the identical reaction twice on the same target.

The current server also uses conflict-safe insertion so near-simultaneous duplicate reaction events do not throw the old SQLite UNIQUE-constraint error.

Reaction scores feed into:

- Scoville total
- Scoville rank
- Highrollers
- profile statistics
- achievements
- content Heat ratings

---

## 8. Achievements and badges

The current build contains **88 achievement badges**.

The collection includes:

- early progression badges
- message-count milestones
- reaction milestones
- Chilli / Heart / Laugh / Jobbies achievements
- photo achievements
- voice achievements
- streak achievements
- leaderboard achievements
- reputation/comeback achievements
- compound reaction achievements
- collection/completion achievements
- deliberately ridiculous long-game badges

Examples include:

```text
Chatty Bastard
Professional Gobshite
Industrial Gobshite
Jobbie Magnet
Lord of the Bog
Touch Grass Immediately
King Kong of ChilliChat
Badge Goblin
Achievement Dragon
There Is Nothing Left For You
```

### Badge rarity

Long-game badges can use rarity classes:

```text
Rare
Epic
Legendary
Unhinged
```

### Profile badge behaviour

Badges in a profile are interactive.

- locked badge -> explains how it is unlocked
- earned badge -> explains what it was earned for and can show its earned date
- clicking the same badge again closes the detail
- clicking another badge switches the detail to the newly selected badge
- badge buttons use press feedback, haptic feedback and animated ripple
- the achievement collection has its own scrolling area

Badges remain earned once unlocked.

---

## 9. User profiles

The profile system has been rebuilt rather than using the old cramped popup.

Current layout includes:

- profile picture
- handle
- rank
- reaction statistics
- readable bio
- achievement count
- independently scrollable badge collection
- interactive badge details
- equipped badge control for the profile owner
- pushable animated close icon

### Header-clearance fix

The profile overlay measures the actual bottom edge of the ChilliChat header.

The profile begins **below the divider under Options / Users / Map-Radar / Highrollers**, preventing the top of the profile and exit icon from being covered by the header.

The position is recalculated for viewport/size changes.

### Handle/profile interaction

The user's **handle is the profile-opening control**.

The old letter-in-a-circle fallback buttons beside handles have been removed.

If a real profile photo exists, a small photo thumbnail can accompany the handle. If there is no uploaded photo, no fake initial-avatar button is displayed.

---

## 10. Profile pictures

Profile-picture management now lives in **Options**, not inside the public profile view.

Available controls:

```text
Upload Profile Picture
Change Profile Picture
Remove Profile Picture
```

### Privacy / image processing

A selected picture is rebuilt before storage.

Current profile-photo requirements:

```text
480 x 480 pixels
JPEG
maximum server-side size: 500 KB
```

The browser centre-crops/resizes the selected source image and creates a fresh JPEG.

The server independently validates the result and strips JPEG metadata containers before saving it.

This prevents the original EXIF/GPS/camera metadata from being stored with the ChilliChat profile image.

Only the rebuilt profile image is stored in SQLite.

The image is stored in the user's `profile_photo` field and is broadcast so visible thumbnails can update live.

---

## 11. Voice clips — CURRENT pipeline

Do not restore the old WebM/FFmpeg design by assumption.

The current voice recorder is `public/voice.js`.

Current recording format:

```text
WAV
16 kHz
mono
maximum recording length: 15 seconds
```

The browser builds the WAV and sends a Data URL to the server.

The server validates:

- WAV Data URL format
- duration
- size

Voice clips are stored temporarily and broadcast through Socket.IO.

### Voice lifetime

A voice clip remains available for approximately:

```text
5 minutes
```

The server checks for expired clips every:

```text
10 seconds
```

Expired voice clips are removed/burned from the live chat.

The achievement system keeps a separate lifetime `voice_clips_sent` counter because the clips themselves are intentionally temporary.

### Important audio rule

Do not blindly rewrite playback or encoding code when debugging audio.

First establish whether a broken recording becomes invalid:

1. during recording
2. before Socket.IO send
3. on server receipt
4. in SQLite
5. during broadcast
6. during browser playback

---

## 12. Photo messages

Photo posts are ephemeral.

Current lifetime:

```text
15 seconds
```

The system tracks photo views and supports the disappearing/burn behaviour.

Photos also support the normal ChilliChat reaction system.

Moderator deletion is supported.

---

## 13. Options

The current Options panel includes:

- font
- font colour
- interface theme
- font size
- bold text
- sound
- browser notifications
- approximate location sharing
- bio
- profile-picture upload/change/remove

The UI has a large retro/terminal font collection and multiple neon interface themes.

Haptic feedback and animated press/ripple behaviour are used throughout the interactive UI where supported.

---

## 14. Top navigation

The top controls are icon-based:

```text
Options
Users
Map / Radar
Highrollers
```

They behave as true top-level toggles so opening one closes the others.

The profile overlay is deliberately positioned below the divider beneath these controls.

---

## 15. Highrollers

Highrollers currently has three views:

```text
Today
This Week
Top Users
```

It uses reaction activity and Scoville-related data.

The result cards were rebuilt to wrap text instead of clipping long content.

Leaderboard position is also used by achievement logic.

The achievement system records separate calendar days at #1 for long-game achievements such as:

```text
Untouchable
King Kong of ChilliChat
```

---

## 16. Radar / Map architecture

The ChilliChat Radar is a global terminal-style situational map.

Main controls include:

```text
HOME
FIT USERS
UK
USA
CANADA
AUSTRALIA
```

Location sharing is optional.

The browser obtains the user's location only after consent, applies location jitter/approximation, stores the consent preference locally, and sends the approximate coordinates to the server.

The location preference is restored after join/reconnect.

### Radar data sources

The server fetches/caches external data rather than making every browser call the providers directly.

| Layer | Source |
|---|---|
| Weather | Open-Meteo |
| Air quality | Open-Meteo Air Quality |
| Flights | OpenSky |
| Local places / POIs | OpenStreetMap Overpass |
| Earthquakes | USGS 2.5+ last-day GeoJSON |

`public/radar-geography.json` supplies map geography/outlines.

Earthquake display is filtered against the current Radar viewport.

### Known external-data issue

OpenStreetMap Overpass can return:

```text
HTTP 429
HTTP 504
fetch failed
request aborted
```

This is an external provider/rate-limit reliability issue, not evidence that SQLite or the main ChilliChat server has failed.

Future Radar work should favour caching/fallbacks instead of hammering Overpass more frequently.

---

## 17. Moderation

Moderator features include:

- kick
- temporary bans
- permanent bans
- delete text/media
- delete voice clips
- delete photo posts

Supported ban periods include:

```text
1 hour
1 day
1 week
permanent
```

Moderator status comes from the moderator handle list.

`Mdnight` is the protected owner handle.

---

## 18. Database architecture

The live database is:

```text
chillichat.db
```

Important tables include:

```text
users
messages
message_reactions
bans
badges
leaderboard_top_days
voice_clips
photos
photo_views
voice_reactions
photo_reactions
```

`server.js` runs schema setup/migrations at startup.

Important user fields now include statistics for achievements, streaks, location preferences, voice lifetime count and `profile_photo`.

### Database safety

`chillichat.db` contains live user/content data.

For normal code milestones:

- back it up before schema work
- do not casually overwrite it during a Git restore
- do not include fresh live database changes in a code commit just to make `git status` look clean

The code should be able to create/migrate required schema when the server starts.

---

## 19. Hosting

Current hosting model:

```text
chillichat.co.uk
        |
Cloudflare Tunnel
        |
local Windows PC
        |
Node server :3000
        |
SQLite
```

Render has been removed.

Neon/PostgreSQL is no longer the live database.

Do not reintroduce Render or Neon unless there is an explicit future decision to change the architecture.

---

## 20. Git rules

### Existing known stable tags

```text
ChilliChat-Stable-Icons-Picker-1
ChilliChat-Stable-UI-Reactions-1
```

The code immediately before this checkpoint was being developed from a detached checkout of:

```text
ChilliChat-Stable-UI-Reactions-1
```

For this milestone a real branch must be created before committing.

### This checkpoint

Branch:

```text
stable-profiles-achievements-20260925
```

Stable tag:

```text
ChilliChat-Stable-Profiles-Achievements-1
```

Commit only the actual source files for the stable build.

Do **not** use `git add .` while the project directory contains the large collection of temporary ZIPs and `*.before-*` backups.

---

## 21. Recommended restore procedure

### Restore the stable CODE while preserving the live database

This is the recommended recovery method:

```powershell
cd "C:\Users\jaggy\OneDrive\Desktop\ChilliChat"

git restore --source "ChilliChat-Stable-Profiles-Achievements-1" -- `
  server.js `
  sqlite-db.js `
  LOG.md `
  public/app.js `
  public/index.html `
  public/style.css `
  public/radar-geography.json `
  public/voice.js
```

Then:

```powershell
node --check .\server.js
node --check .\public\app.js
node .\server.js
```

This restores the stable source without intentionally replacing `chillichat.db`.

### Inspect the exact tagged repository state

For investigation only:

```powershell
git switch --detach "ChilliChat-Stable-Profiles-Achievements-1"
```

Be careful if the tracked database has local changes. Back up the database before any whole-repository checkout.

Return to the development branch with:

```powershell
git switch "stable-profiles-achievements-20260925"
```

---

## 22. Development progress

### Earlier stable base

`ChilliChat-Stable-UI-Reactions-1`

Known at that point:

- stable themed UI
- universal reactions
- established chat foundation

### Work completed after that stable base

#### Radar / global data

- global Radar introduced
- approximate location sharing
- HOME/FIT USERS/country shortcuts
- weather and AQI
- flights
- OpenStreetMap POIs
- USGS earthquakes
- geography data file
- viewport-based quake filtering
- Radar/top-header layout corrections

#### Navigation / interface

- top icons converted into true toggles
- Options / Users / Radar / Highrollers made mutually exclusive
- theme system expanded
- retro font collection expanded
- Highrollers HD controls and cards improved

#### Reactions

- universal text/voice/photo reactions
- Jobbies 💩 added
- Jobbies Scoville value: -50
- HD reaction picker/pills
- reaction burst animations
- duplicate reaction race hardened with conflict-safe insertion

#### Voice UI

- hold-to-record interaction
- button expands while held
- pointer tracking survives thumb drift
- swipe-up cancel retained
- recording countdown retained
- animated recording ripples added

The current recording/audio pipeline itself remains the 16 kHz mono WAV implementation in `public/voice.js`.

#### Achievement Expansion v1

- original badge system expanded
- long-term message/reaction/photo/voice milestones
- persistent lifetime voice-clip count
- retroactive checks where historic data exists

#### Achievement Expansion v2

- 88 total achievements
- Rare / Epic / Legendary / Unhinged long-game achievements
- difficult compound achievements
- leaderboard day tracking
- reputation recovery tracking
- collection completion achievements
- funny high-threshold achievements intended as long-term return goals

#### Profile Redesign

- readable bio
- separate scrollable achievements
- clickable badge explanations
- earned badge information
- haptic feedback
- animated ripple feedback
- pushable profile close icon
- responsive profile layout
- profile-picture support
- 480 x 480 JPEG sanitisation
- metadata stripping
- profile-photo chat thumbnails

#### Profile Header Clearance

- profile overlay moved below the real app-header divider
- top of profile no longer deliberately occupies space beneath the header
- close icon/header designed to remain visible as viewport dimensions change

#### Profile Options Cleanup

- removed letter-in-circle fallback avatars
- handles remain the profile-opening control
- real photo thumbnails remain when available
- profile-picture upload/change/remove moved into Options
- profile page now displays identity information rather than acting as its settings screen

---

## 23. Current known-good milestone checklist

Before calling a future change stable, check:

```text
[ ] Node server starts normally
[ ] public/app.js passes node --check
[ ] server.js passes node --check
[ ] local chat opens
[ ] chillichat.co.uk opens
[ ] text messages send/receive
[ ] voice clips send/play/burn
[ ] photos send/open/burn
[ ] all five reactions work
[ ] Jobbies score correctly
[ ] profile opens from handle
[ ] bio is readable
[ ] profile close button is visible
[ ] badges scroll
[ ] badge explanation toggles work
[ ] profile photo upload/remove works from Options
[ ] profile thumbnails update
[ ] Users / Options / Radar / Highrollers toggles work
[ ] Radar opens and map controls work
[ ] moderator controls still work
```

Only tag a new milestone after the relevant changes have been tested.

---

## 24. Current cautions

1. **Do not use old backup files as the current source.**
2. **Do not casually overwrite `chillichat.db`.**
3. **Do not reintroduce the retired WebM/FFmpeg voice pipeline by assumption.**
4. **Do not blindly alter playback code when diagnosing a recording problem.**
5. **Do not treat Overpass timeouts as a core-server failure.**
6. **Do not use `git add .` while all the local backup files are sitting inside the repository.**
7. **Do not restore Render/Neon architecture accidentally.**
8. **Inspect the actual current file before replacing it.**

---

## 25. Next development rule

The workflow remains:

```text
inspect current code
        |
        v
make one controlled change
        |
        v
syntax check
        |
        v
run ChilliChat
        |
        v
test the feature
        |
        v
confirm it works
        |
        v
Git commit + stable tag when appropriate
```

Keep this file updated whenever a stable milestone changes the architecture or adds a significant feature.
