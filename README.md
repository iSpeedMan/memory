# Metro Memory

A real-time multiplayer memory card game built with Node.js, Express, Socket.IO, and SQLite.

## What It Is

Metro Memory is a browser-based card-matching game where two players race to find all 18 pairs from a shuffled grid of 36 face-down cards. You can also play against an AI bot at three difficulty levels. The design follows a dark Metro / Windows-style UI.

## Features

- **Multiplayer (PvP)** — create or join public and private rooms, play in real-time via WebSockets
- **Bot matches** — three difficulty levels (Easy / Medium / Hard) with smart memory behavior
- **Combo system** — consecutive matches multiply your score (×1.5 → ×2 → ×2.5 → ×3), with animated visual feedback and floating score popups
- **Manual rejoin** — if you lose connection mid-game, your room stays alive for 10 minutes and appears highlighted at the top of the lobby so you can return with one click
- **Spectator mode** — watch any public game live
- **Leaderboard** — global and per-category rankings updated in real time
- **Player profiles** — game history, win/loss stats, avatar picker, theme and language settings
- **Admin panel** — manage users, categories, and card sets
- **Internationalization** — English and Russian, auto-detected from browser

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Web framework | Express 4 |
| Real-time | Socket.IO |
| Database | SQLite (via `better-sqlite3`) or MySQL |
| Frontend | Vanilla JS, CSS (no build step) |
| Sessions | `express-session` + `connect-sqlite3` |
| Auth | bcrypt password hashing |

## Getting Started

### Prerequisites

- Node.js 18 or later
- npm

### Install

```bash
npm install
```

### Configure

Copy `.env.example` to `.env` (or set environment variables directly):

```
PORT=5000
MEMORY_DB_TYPE=sqlite          # or mysql
SESSION_SECRET=change_me
```

For MySQL, also set `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.

### Run

```bash
node app.js
```

Open `http://localhost:5000` in your browser.

### Default Admin Account

| Username | Password |
|---|---|
| `admin` | `admin123` |

Change this immediately after first login via the profile settings.

## Project Structure

```
├── app.js                  Entry point, Express setup
├── routes/
│   ├── auth.js             Login, register, session, profile
│   └── admin.js            Admin CRUD endpoints
├── websocket/
│   ├── index.js            Socket.IO connection handler
│   └── gameHandlers.js     Game events, rejoin system
├── services/
│   ├── gameLogic.js        Card flip logic, scoring, combos
│   ├── roomManager.js      In-memory room store
│   ├── leaderboardService.js
│   └── botTracker.js       Bot game rate-limiting
├── public/
│   ├── index.html          Single-page app shell
│   ├── auth.js             Login / register UI
│   ├── lobby.js            Room list, leaderboard, profile
│   ├── game.js             Board rendering, combo effects
│   ├── style.css           All styles
│   └── i18n.js             Translation strings (ru / en)
├── utils/
│   └── helpers.js          cleanRoomData, escaping utils
└── db/
    └── (SQLite database files created at runtime)
```

## Gameplay

1. Register or log in.
2. Create a room (choose a card category, optional password lock) or join an open one.
3. Players take turns flipping two cards per turn. A match keeps your turn going and adds to your combo multiplier; a miss ends your turn and resets the combo.
4. The player with more matched pairs when the board is cleared wins.

### Combo Multipliers

| Consecutive matches | Multiplier | Colour |
|---|---|---|
| 2 | ×1.5 | Blue |
| 3 | ×2 | Green |
| 4 | ×2.5 | Orange |
| 5+ | ×3 | Gold |

## Rejoin System

If a player disconnects during a PvP game (closed tab, network drop, etc.):

- The room stays open for **10 minutes**.
- The opponent sees a "Waiting for return…" overlay.
- When the disconnected player comes back, their room appears at the **top of the lobby** with a green "Your Game" badge and a **Return to Game** button.
- Clicking it restores the full board state and resumes the match.
- If the player does not return within 10 minutes the room closes automatically.

## License

MIT
