const crypto = require('crypto');
const db = require('../../db');
const { createRoom: _createRoom, deleteRoom, markRoomsDirty, broadcastRoomsList, getAllRooms } = require('../../services/roomManager');
const { cleanChatHistory } = require('../chatHandlers');
const { getUserPvpStats } = require('../../services/gameHistory');
const friendNotifier = require('../../services/friendNotifier');

const UNICODE_POOL = [...new Set([
    '🍕','🍔','🌮','🍣','🍜','🍩','🎂','🍦','🍓','🍉','🥑','🌽',
    '🐶','🐱','🐭','🦊','🐻','🦁','🐯','🐸','🦋','🦄','🐉','🦅',
    '⚽','🏀','🎮','🎸','🏆','🎯','🎲','🏊','🏂','🎪','🎠','🎡',
    '🚗','✈️','🚀','🚂','🛸','🚁','⛵','🚲','🛹','🚜','🏎️','🛰️',
    '💻','📱','⌚','💎','📷','🔭','🔬','💡','🔮','🧩','🗝️','⚙️',
    '💯','🔥','❤️','✨','🌈','⭐','💫','🌟','🌊','🌸','🍀','🌙',
    '🦩','🦝','🦦','🦔','🦥','🦕','🦖','🦜','🦚','🦈','🐠','🐙',
    '🍋','🍊','🍇','🍒','🥝','🍑','🥭','🌶️','🧄','🫐','🥥','🍄',
    '🎀','🎁','🎈','🎉','🪄','🎻','🥁','🎺','🎷','🪕','🎹','🎤',
    '🏰','🏯','🗽','🗿','🏛️','⛺','🏔️','🌋','⛰️','🏝️','🌅','🎑',
    '🧲','🧸','🪆','🎭','🎨','🖼️','🏺','🗺️','🧭','🔑','🪬','🏵️',
])];

const VALID_GRID_SIZES = [4, 6, 8];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard', 'grandmaster'];
const MAX_ROOM_ID_LEN = 60;
const MAX_ROOMS = 200;
const REJOIN_TIMEOUT = 10 * 60 * 1000;
const JOIN_COOLDOWN_MS = 2000;
const SPECTATE_COOLDOWN_MS = 3000;
const CREATE_ROOM_COOLDOWN_MS = 10000;
const MAX_COOLDOWN_MAP_SIZE = 5000;

const rejoinableRooms = new Map();
const createRoomCooldowns = new Map();
const joinRoomCooldowns = new Map();
const spectateRoomCooldowns = new Map();
const botRoomCreating = new Set();

function pruneCooldownMap(map, maxSize) {
    if (map.size < maxSize) return;
    const toDelete = Math.floor(maxSize * 0.2);
    let deleted = 0;
    for (const key of map.keys()) {
        if (deleted >= toDelete) break;
        map.delete(key);
        deleted++;
    }
}

const cooldownCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [k, ts] of createRoomCooldowns) {
        if (now - ts > CREATE_ROOM_COOLDOWN_MS * 6) createRoomCooldowns.delete(k);
    }
    for (const [k, ts] of joinRoomCooldowns) {
        if (now - ts > JOIN_COOLDOWN_MS * 30) joinRoomCooldowns.delete(k);
    }
    for (const [k, ts] of spectateRoomCooldowns) {
        if (now - ts > SPECTATE_COOLDOWN_MS * 20) spectateRoomCooldowns.delete(k);
    }
    for (const [k, info] of rejoinableRooms) {
        if (now - (info.addedAt || 0) > REJOIN_TIMEOUT * 2) {
            if (info.timer) clearTimeout(info.timer);
            rejoinableRooms.delete(k);
        }
    }
}, 60 * 1000);

function clearCooldownCleanup() {
    clearInterval(cooldownCleanupInterval);
}

function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function generateDeck(totalPairs) {
    const values = [];
    for (let i = 1; i <= totalPairs; i++) values.push(i, i);
    return shuffleArray(values);
}

function pickUnicodeEmojis(count) {
    return shuffleArray(UNICODE_POOL).slice(0, count);
}

function generateRoomId(prefix) {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function validateCategory(safeCategory, callback) {
    if (safeCategory === 'unicode') return callback(true);
    db.get('SELECT id FROM categories WHERE key_name = ?', [safeCategory], (err, row) => {
        callback(!err && !!row);
    });
}

function getPlayerStats(userId, callback) {
    if (!userId || userId === 'bot_cpu') return callback({ total: 0, wins: 0, winRate: 0 });
    getUserPvpStats(userId, (err, stats) => {
        const total = (stats && stats.total) ? Number(stats.total) : 0;
        const wins = (stats && stats.wins) ? Number(stats.wins) : 0;
        callback({ total, wins, winRate: total > 0 ? Math.round(wins / total * 100) : 0 });
    });
}

function isUserInAnyRoom(userId) {
    if (rejoinableRooms.has(userId)) return true;
    for (const room of Object.values(getAllRooms())) {
        if (room.players.some(p => p.id === userId)) return true;
    }
    return false;
}

function clearRejoinTimer(userId) {
    const info = rejoinableRooms.get(userId);
    if (info && info.timer) clearTimeout(info.timer);
    rejoinableRooms.delete(userId);
}

function getRejoinInfo(userId) {
    return rejoinableRooms.get(userId);
}

function closeRoom(io, roomId) {
    const room = require('../../services/roomManager').getRoom(roomId);
    const deleted = deleteRoom(roomId);
    if (deleted) {
        io.to(roomId).emit('roomClosed', 'opponent_left');
        cleanChatHistory(roomId);
        markRoomsDirty();
        broadcastRoomsList(io);
        if (room) {
            room.players.filter(p => !p.isBot).forEach(p => {
                friendNotifier.setUserInGame(p.id, false);
            });
        }
    }
}

module.exports = {
    UNICODE_POOL, VALID_GRID_SIZES, VALID_DIFFICULTIES,
    MAX_ROOM_ID_LEN, MAX_ROOMS, REJOIN_TIMEOUT,
    JOIN_COOLDOWN_MS, SPECTATE_COOLDOWN_MS, CREATE_ROOM_COOLDOWN_MS,
    MAX_COOLDOWN_MAP_SIZE,
    rejoinableRooms, createRoomCooldowns, joinRoomCooldowns,
    spectateRoomCooldowns, botRoomCreating,
    pruneCooldownMap, clearCooldownCleanup,
    shuffleArray, generateDeck, pickUnicodeEmojis,
    generateRoomId, validateCategory, getPlayerStats,
    isUserInAnyRoom, clearRejoinTimer, getRejoinInfo, closeRoom,
};
