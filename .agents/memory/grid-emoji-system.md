---
name: Grid & Emoji System
description: How configurable grid sizes and the unicode category work end-to-end.
---

**Grid sizes:** 4×4 (8 pairs), 6×6 (18 pairs), 8×8 (32 pairs). Validated server-side via `VALID_GRID_SIZES = [4, 6, 8]`. Stored as `room.gridSize` and `room.totalPairs`.

**8×8 extra pairs:** Categories only have 18 emojis. Values 19–32 use `(value-1) % emojiArray.length` to reuse emojis. Frontend adds CSS class `card-emoji-mirrored` (scaleX(-1) + hue-rotate) to visually distinguish reused pairs.

**Unicode category:** Virtual category — not stored in DB. Server picks `totalPairs` random emojis from UNICODE_POOL (132 emojis) each game. Sent via `room.categoryEmojis` in cleanRoomData. Frontend stores in `window.icons['unicode']` for that game session.

**Why:** Allows unlimited grid sizes with a fixed emoji catalog per category; mirrors make pairs visually unique.

**How to apply:** `initBoard()` in game.js reads `currentGridSize` and sets `grid-template-columns` inline. `flipCard()` calls `getEmojiForValue(value)` which handles modulo and sets `currentCategoryEmojis` override.
