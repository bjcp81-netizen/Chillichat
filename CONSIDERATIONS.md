# ChilliChat — Considerations

Last updated: 19 September 2026

Two lists:
- **Considerations** = things we plan to do soon.
- **Future considerations** = ideas parked for later. Nothing here exists yet
  unless it says so. Do not treat any item as a current task until chosen.

---

## Considerations (next up)

1. **Bigger reaction animations**
   The floating emoji that appears when someone reacts is too small
   (`.floating-reaction` in `style.css`, currently `font-size: 22px`).
   Make it larger so users notice reactions.

2. **Reaction pill opens the picker directly**
   Currently: click 🌶️ pill → reaction bar appears → click `+` → pick an emoji.
   Idea: fewer clicks.

---

## Future considerations (parked)

### Features and polish
- Show the total reaction count on the 🌶️ pill, so counts are visible without
  opening it
- Further leaderboard improvements
- Additional badges and expanded profiles
- Additional Scoville features
- Further moderation features
- Improved reconnection / missed-message handling
- Highrollers improvements
- Additional media functionality
- Other UI improvements and community features

### Things noticed in the code (Not tested, only spotted by reading)
- Leftover debug logging in app.js ([RAW DEBUG], [SEND DEBUG], [AUDIO DEBUG]). Harmless but noisy.
- server.js: `transcodeVoiceClipToWebm` is defined but never called.
- **Temporary ban expiry may be inexact.** Ban times are stored in one text
  format and compared in another, so a 1-hour ban might last longer.
- **Timestamps might show an hour out in British Summer Time.**
- **`process.env.TZ = "UTC"` may not work on Windows.** Check if photo
  expiry timing is ever wrong.
- **Leftover unused code in `app.js`:** `stopCurrentClip`, `isStarting`,
  `stopRequested`, `dataUrlToBlobUrl` and the `end-sound` lookup are unused.
- **Leftover unused CSS in `style.css`:** e.g. `.ptt-btn`, `.color-options`,
  `.options-select`, `.custom-select-list`, and duplicated rules.
- **Unused sound files in `public`:** `micbp.wav`, `endsnd.wav`,
  `strtA4.wav`, `cbstop.wav`, `cbstrt.wav`, `smw_coin.wav`, `chillhd.png`
  are not referenced by the files we've seen.
- **`<link rel="icon">` sits outside `<head>`** in `index.html`. It works
  anyway.
- **Voice clips depend on an outside website** (the `fix-webm-duration` script
  loaded from jsDelivr). If that site is down, PC clips still send, unfixed.
- **Old backup files and the odd files `{` and `{})`** in the project folder.
  Find out what they are before deleting anything.

### Project housekeeping
- Keep `LOG.md` updated when something changes
- Commit to GitHub only after a change is tested
# ChilliChat — CONSIDERATIONS.md

Parked fixes and ideas. Nothing here is a current task unless the user selects it.
Items marked (unverified) were spotted by reading code and have not been tested.

## Possible bugs / cleanups (spotted 2026-09-20)
- (unverified) Timestamps: SQLite `CURRENT_TIMESTAMP` gives `YYYY-MM-DD HH:MM:SS` with no `Z`. Browsers may read that as local time, so message times could be off by an hour in BST.
- (unverified) Ban expiry: `expires_at` is saved as an ISO string (`...T...Z`) but compared to `CURRENT_TIMESTAMP` (space-separated format). Text comparison may misjudge same-day expiry for 1-hour bans.
- (unverified) Server trusts the `handle` sent by the browser for chat messages and reactions, so a modified client could post as someone else. Moderator actions correctly use the socket's own identity.
- (unverified) Anyone who first registers the handle "Mdnight" on a fresh database becomes moderator.
- `server.js` header comment and some comments still mention Postgres.
- `public/index.html` has no `<audio id="end-sound">`, but `app.js` looks it up (`endSound`, unused; harmless).
- `public/index.html`: the favicon `<link>` sits after `</head>`.
- `public/style.css`: some rules are duplicated (`.user-item`, `.heat-badge`) and some look unused (`.ptt-btn`, `.color-swatch`, `.color-options`).
- `dataUrlToBlobUrl` in `app.js` may become unused depending on the audio fix.
- `fluent-ffmpeg` is marked deprecated in package-lock.json. Works today; consider later.

## Ideas from handover (not started)
- Leaderboard improvements
- More badges
- Expanded profiles
- More Scoville features
- More moderation features
- Better reconnect / missed-message handling
- Highrollers improvements
- More media features
- UI improvements
- More community features
- Cleanup: remove the switched-off old audio code from app.js and server.js, and the fix-webm-duration script tag in index.html.
- Consider MP3 (lamejs) to cut clip size from about 640 KB to about 60 KB. WAV works fine for now.
- Remove the leftover [CHUNK], [RAW DEBUG], [SEND DEBUG] and [AUDIO DEBUG] console logs.