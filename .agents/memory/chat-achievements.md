---
name: Chat & Achievements
description: How the ephemeral chat and achievements system work.
---

**Chat:** No DB persistence. `chatHistory` Map in websocket/index.js: `roomId → [{username, avatar, text, ts}]`. Max 50 messages per room. Rate limit 800ms per user. Events: `sendChat` → `chatMessage` (broadcast to room), `getChatHistory` → `chatHistory` (to requester). Lobby chat uses the lobby socket.io room.

**Chat display:** game.js handles `chatMessage` when gameScreen is visible; lobby.js handles it when lobbyScreen is visible. Both listen to the same event — only one screen is visible at a time.

**Achievements:** 12 types defined in `services/achievementService.js`. Checked after every game in `finishGame()`. User-specific socket.io rooms `user_${userId}` used to emit `achievementUnlocked` only to that player. Frontend shows a toast in bottom-left with 4s auto-dismiss.

**Admin custom categories:** Users submit via `POST /api/categories/suggest`. Admin reviews at `GET/POST /api/admin/custom-categories`. Approval copies row to main `categories` table. Badge on admin tab shows pending count.

**Why:** Ephemeral chat avoids DB overhead; user rooms for achievements avoid broadcasting private data.
