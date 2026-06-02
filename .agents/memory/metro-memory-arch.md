---
name: Metro Memory Architecture
description: Stack, key files, and conventions for the Metro Memory multiplayer game.
---

Stack: Node.js + Express 4, Socket.IO, SQLite (better-sqlite3 wrapper in db.js), Vanilla JS SPA, no build tool. Port 5000.

Key directories:
- `routes/` — REST API (auth, admin, categories, userProfile, leaderboard)
- `websocket/` — Socket.IO handlers (gameHandlers.js, index.js for chat/leaderboard)
- `services/` — gameLogic, achievementService, gameHistory, leaderboardService, roomManager
- `public/` — SPA files (index.html, game.js, lobby.js, admin.js, i18n.js, style.css)

**Why:** Single-file SPA loaded by Express static middleware, no bundler needed.

**How to apply:** New routes go in `routes/`, new socket events in `websocket/`, shared DB queries in `services/`. Frontend reads `window.socket` (initialized in utils.js).
