const crypto = require('crypto');
const db = require('../db');
const { createRoom, getRoom, deleteRoom, markRoomsDirty, broadcastRoomsList, getAllRooms } = require('../services/roomManager');
const botTracker = require('../services/botTracker');
const { getLang } = require('../middleware/auth');
const { wsRateLimit } = require('../middleware/wsRateLimit');
const i18n = require('../public/js/i18n.js');
const { cleanRoomData } = require('../utils/helpers');
const { cleanChatHistory, invalidateChatState } = require('./chatHandlers');
const { getUserPvpStats } = require('../services/gameHistory');
const { finishGame } = require('../services/gameLogic');
const { areFriends } = require('../services/friendsService');
const friendNotifier = require('../services/friendNotifier');
const coinsService = require('../services/coinsService');

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

const rejoinableRooms = new Map();
const REJOIN_TIMEOUT = 10 * 60 * 1000;

const JOIN_COOLDOWN_MS = 2000;
const SPECTATE_COOLDOWN_MS = 3000;
const joinRoomCooldowns = new Map();
const spectateRoomCooldowns = new Map();
const MAX_ROOM_ID_LEN = 60;
const MAX_ROOMS = 200;
const CREATE_ROOM_COOLDOWN_MS = 10000;
const createRoomCooldowns = new Map();

const MAX_COOLDOWN_MAP_SIZE = 5000;

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
    for (const [userId, ts] of createRoomCooldowns) {
        if (now - ts > CREATE_ROOM_COOLDOWN_MS * 6) createRoomCooldowns.delete(userId);
    }
    for (const [userId, ts] of joinRoomCooldowns) {
        if (now - ts > JOIN_COOLDOWN_MS * 30) joinRoomCooldowns.delete(userId);
    }
    for (const [userId, ts] of spectateRoomCooldowns) {
        if (now - ts > SPECTATE_COOLDOWN_MS * 20) spectateRoomCooldowns.delete(userId);
    }
    for (const [userId, info] of rejoinableRooms) {
        if (now - (info.addedAt || 0) > REJOIN_TIMEOUT * 2) {
            if (info.timer) clearTimeout(info.timer);
            rejoinableRooms.delete(userId);
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

function getPlayerStats(userId, callback) {
    if (!userId || userId === 'bot_cpu') return callback({ total: 0, wins: 0, winRate: 0 });
    getUserPvpStats(userId, (err, stats) => {
        const total = (stats && stats.total) ? Number(stats.total) : 0;
        const wins = (stats && stats.wins) ? Number(stats.wins) : 0;
        callback({ total, wins, winRate: total > 0 ? Math.round(wins / total * 100) : 0 });
    });
}

function generateDeck(totalPairs) {
    const values = [];
    for (let i = 1; i <= totalPairs; i++) values.push(i, i);
    return shuffleArray(values);
}

function pickUnicodeEmojis(count) {
    const pool = shuffleArray(UNICODE_POOL);
    return pool.slice(0, count);
}

function generateRoomId(prefix) {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
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

function getRejoinInfo(userId) { return rejoinableRooms.get(userId); }

function validateCategory(safeCategory, callback) {
    if (safeCategory === 'unicode') return callback(true);
    db.get('SELECT id FROM categories WHERE key_name = ?', [safeCategory], (err, row) => {
        callback(!err && !!row);
    });
}

function closeRoom(io, roomId) {
    const room = getRoom(roomId);
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

function handleLeaveRejoinableRoom(io, socket) {
    socket.on('leaveRejoinableRoom', (roomId) => {
        if (typeof roomId !== 'string' || roomId.length > MAX_ROOM_ID_LEN) return;
        const session = socket.request.session;
        const userId = session?.userId;
        if (!userId) return;
        if (!wsRateLimit(userId, 'leaveRejoinableRoom', 3, 30000)) return;
        const info = rejoinableRooms.get(userId);
        if (!info || info.roomId !== roomId) return;
        clearRejoinTimer(userId);
        closeRoom(io, roomId);
    });
}

function handleRejoinRoom(io, socket) {
    socket.on('rejoinRoom', (roomId) => {
        if (typeof roomId !== 'string' || roomId.length > MAX_ROOM_ID_LEN) return;
        const session = socket.request.session;
        const userId = session?.userId;
        if (!userId) return;
        if (!wsRateLimit(userId, 'rejoinRoom', 3, 30000)) return;
        const info = rejoinableRooms.get(userId);
        if (!info || info.roomId !== roomId) return;
        const room = getRoom(roomId);
        if (!room || room.status !== 'playing') { clearRejoinTimer(userId); return; }
        clearRejoinTimer(userId);
        const player = room.players[info.playerIdx];
        if (!player) return;
        player.socketId = socket.id;
        player.disconnected = false;
        socket.join(roomId);
        socket.leave('lobby');
        socket.emit('gameStart', { room: cleanRoomData(room), turn: room.players[room.turnIndex].id });
        socket.emit('gameReconnect', {
            matchedCards: room.matchedCards,
            openedCards: room.openedCards.map(idx => ({ index: idx, value: room.deck[idx] })),
            cardStats: room.cardStats
        });
        const opponentIdx = 1 - info.playerIdx;
        io.to(roomId).emit('opponentReconnected');
        markRoomsDirty();
        broadcastRoomsList(io);
    });
}

function handleCreateRoom(io, socket) {
    socket.on('createRoom', (data) => {
        if (!data || typeof data !== 'object') return;
        const session = socket.request.session;
        const userId = session.userId;
        if (Object.keys(getAllRooms()).length >= MAX_ROOMS) return;
        const now = Date.now();
        if (now - (createRoomCooldowns.get(userId) || 0) < CREATE_ROOM_COOLDOWN_MS) return;
        if (isUserInAnyRoom(userId)) return;
        pruneCooldownMap(createRoomCooldowns, MAX_COOLDOWN_MAP_SIZE);
        createRoomCooldowns.set(userId, now);

        const lang = getLang(socket.request);
        const safeName = (data.name || '').toString().substring(0, 50).trim();
        const safeCategory = (data.category || 'animals').toString().substring(0, 30).trim();
        const isPrivate = !!data.isPrivate;
        const gridSize = VALID_GRID_SIZES.includes(Number(data.gridSize)) ? Number(data.gridSize) : 6;
        const totalPairs = (gridSize * gridSize) / 2;

        validateCategory(safeCategory, (valid) => {
            if (!valid) return;
            const roomId = generateRoomId('room');
            const categoryEmojis = safeCategory === 'unicode' ? pickUnicodeEmojis(totalPairs) : undefined;
            const newRoom = {
                id: roomId, name: safeName || `${i18n.t('room', lang)} - ${session.username}`,
                creatorId: userId, creatorName: session.username, creatorAvatar: session.avatar || '😶',
                category: safeCategory, status: 'waiting', createdAt: now,
                isPrivate, gridSize, totalPairs,
                players: [{ id: userId, name: session.username, avatar: session.avatar || '😶', socketId: socket.id, score: 0 }],
                deck: [], openedCards: [], matchedPairs: [],
                turnIndex: 0, cardStats: Array(gridSize * gridSize).fill(0), matchedCards: {}, hintsState: {}
            };
            if (categoryEmojis) newRoom.categoryEmojis = categoryEmojis;
            createRoom(roomId, newRoom);
            socket.join(roomId);
            socket.emit('roomCreated', cleanRoomData(newRoom));
            broadcastRoomsList(io);

            const invitedFriendId = data.invitedFriendId ? parseInt(data.invitedFriendId, 10) : null;
            if (invitedFriendId && !isNaN(invitedFriendId) && invitedFriendId !== userId) {
                areFriends(userId, invitedFriendId, (ok) => {
                    if (ok) {
                        io.to(`user_${invitedFriendId}`).emit('friendGameInvite', {
                            roomId, fromName: session.username, fromAvatar: session.avatar || '😶'
                        });
                    }
                });
            }
        });
    });
}

function handleCreateBotRoom(io, socket) {
    socket.on('createBotRoom', async (data) => {
        if (!data || typeof data !== 'object') return;
        const session = socket.request.session;
        const userId = session.userId;
        const check = await botTracker.checkCanCreate(userId);
        if (!check.allowed) { socket.emit('botRoomThrottle', { remainingSeconds: check.remainingSeconds }); return; }
        if (isUserInAnyRoom(userId)) return;

        const difficulty = VALID_DIFFICULTIES.includes(data.difficulty) ? data.difficulty : 'medium';
        const safeCategory = (data.category || 'animals').toString().substring(0, 30).trim();
        const gridSize = VALID_GRID_SIZES.includes(Number(data.gridSize)) ? Number(data.gridSize) : 6;
        const totalPairs = (gridSize * gridSize) / 2;
        const lang = getLang(socket.request);

        validateCategory(safeCategory, (valid) => {
            if (!valid) return;
            const roomId = generateRoomId('botRoom');
            const deck = generateDeck(totalPairs);
            const categoryEmojis = safeCategory === 'unicode' ? pickUnicodeEmojis(totalPairs) : undefined;
            const isBotPrivate = !!data.isPrivate;
            const newRoom = {
                id: roomId, name: i18n.t('game_with_bot', lang),
                category: safeCategory, status: 'playing', createdAt: Date.now(),
                isBotMatch: true, botDifficulty: difficulty, botMemory: {},
                isPrivate: isBotPrivate, gridSize, totalPairs,
                players: [
                    { id: userId, name: session.username, avatar: session.avatar || '😶', socketId: socket.id, score: 0 },
                    { id: 'bot_cpu', name: `${i18n.t('bot_' + difficulty, lang)} ${{ easy: '🐥', medium: '🤖', hard: '🧠', grandmaster: '💀' }[difficulty]}`, avatar: { easy: '🐥', medium: '🤖', hard: '🧠', grandmaster: '💀' }[difficulty], isBot: true, score: 0 }
                ],
                deck, openedCards: [], matchedPairs: [],
                turnIndex: 0, cardStats: Array(gridSize * gridSize).fill(0), matchedCards: {}, hintsState: {}
            };
            if (categoryEmojis) newRoom.categoryEmojis = categoryEmojis;
            botTracker.markCreated(userId);
            friendNotifier.setUserInGame(userId, true);
            createRoom(roomId, newRoom);
            socket.join(roomId);
            socket.leave('lobby');
            broadcastRoomsList(io);
            getPlayerStats(userId, (humanStats) => {
                socket.emit('gameStart', {
                    room: cleanRoomData(newRoom),
                    turn: userId,
                    playerStats: { [userId]: humanStats, bot_cpu: { total: 0, wins: 0, winRate: 0 } }
                });
                coinsService.checkAndAwardDailyBonus(userId, io);
            });
        });
    });
}

function handleJoinRoom(io, socket) {
    socket.on('joinRoom', (roomId) => {
        if (typeof roomId !== 'string' || roomId.length > MAX_ROOM_ID_LEN) return;
        const session = socket.request.session;
        const userId = session.userId;
        const now = Date.now();
        if (now - (joinRoomCooldowns.get(userId) || 0) < JOIN_COOLDOWN_MS) return;
        pruneCooldownMap(joinRoomCooldowns, MAX_COOLDOWN_MAP_SIZE);
        joinRoomCooldowns.set(userId, now);
        const room = getRoom(roomId);
        if (isUserInAnyRoom(userId)) return;
        if (room && room.status === 'waiting' && room.creatorId !== userId) {
            room.players.push({ id: userId, name: session.username, avatar: session.avatar || '😶', socketId: socket.id, score: 0 });
            room.status = 'playing';
            room.deck = generateDeck(room.totalPairs || 18);
            socket.join(roomId);
            socket.leave('lobby');
            const creatorSocket = io.sockets.sockets.get(room.players[0].socketId);
            if (creatorSocket) creatorSocket.leave('lobby');
            const p1Id = room.players[0].id;
            const p2Id = room.players[1].id;
            friendNotifier.setUserInGame(p1Id, true);
            friendNotifier.setUserInGame(p2Id, true);
            getPlayerStats(p1Id, (p1Stats) => {
                getPlayerStats(p2Id, (p2Stats) => {
                    io.to(roomId).emit('gameStart', {
                        room: cleanRoomData(room),
                        turn: p1Id,
                        playerStats: { [p1Id]: p1Stats, [p2Id]: p2Stats }
                    });
                    coinsService.checkAndAwardDailyBonus(p1Id, io);
                    coinsService.checkAndAwardDailyBonus(p2Id, io);
                });
            });
            markRoomsDirty();
            broadcastRoomsList(io);
        }
    });
}

function handleSpectateRoom(io, socket) {
    socket.on('spectateRoom', (roomId) => {
        if (typeof roomId !== 'string' || roomId.length > MAX_ROOM_ID_LEN) return;
        const session = socket.request.session;
        const userId = session?.userId;
        if (userId) {
            const now = Date.now();
            if (now - (spectateRoomCooldowns.get(userId) || 0) < SPECTATE_COOLDOWN_MS) return;
            pruneCooldownMap(spectateRoomCooldowns, MAX_COOLDOWN_MAP_SIZE);
            spectateRoomCooldowns.set(userId, now);
        }
        const room = getRoom(roomId);
        if (room && room.status === 'playing' && !room.isPrivate) {
            socket.join(roomId);
            socket.leave('lobby');
            socket.emit('spectateStart', {
                room: cleanRoomData(room),
                turn: room.players[room.turnIndex].id,
                matchedCards: room.matchedCards,
                cardStats: room.cardStats,
                openedCards: room.openedCards.map(idx => ({ index: idx, value: room.deck[idx], stats: room.cardStats[idx] }))
            });
        }
    });
}

function handleCardClick(io, socket, throttleCardClick, processCardFlip) {
    socket.on('cardClick', (cardIndex) => {
        const session = socket.request.session;
        const MAX_CARD_INDEX = VALID_GRID_SIZES[VALID_GRID_SIZES.length - 1] ** 2 - 1;
        if (typeof cardIndex !== 'number' || !Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex > MAX_CARD_INDEX) return;
        const now = Date.now();
        if (!throttleCardClick(session.userId, now)) return;
        const roomId = Array.from(socket.rooms).find(r => r.startsWith('room_') || r.startsWith('botRoom_'));
        if (!roomId) return;
        processCardFlip(io, roomId, session.userId, cardIndex);
    });
}

function handleDisconnect(io, socket, connectedSockets) {
    socket.on('disconnect', () => {
        connectedSockets.delete(socket.id);
        const session = socket.request.session;
        const userId = session?.userId;
        const currentRooms = getAllRooms();
        for (const [id, room] of Object.entries(currentRooms)) {
            const playerIdx = room.players.findIndex(p => p.socketId === socket.id);
            if (playerIdx === -1) continue;
            if (room.status === 'playing' && !room.isBotMatch && userId) {
                room.players[playerIdx].disconnected = true;
                const existing = rejoinableRooms.get(userId);
                if (existing && existing.timer) clearTimeout(existing.timer);
                io.to(id).emit('opponentDisconnected');
                invalidateChatState(userId);
                const timer = setTimeout(() => {
                    rejoinableRooms.delete(userId);
                    const r = getRoom(id);
                    if (r && r.players[playerIdx]?.disconnected) {
                        closeRoom(io, id);
                    }
                }, REJOIN_TIMEOUT);
                rejoinableRooms.set(userId, { roomId: id, playerIdx, timer, addedAt: Date.now() });
                markRoomsDirty();
                broadcastRoomsList(io);
            } else {
                if (room.isBotMatch) {
                    const human = room.players.find(p => !p.isBot);
                    if (human && room.matchedPairs && room.matchedPairs.length > 0) {
                        if (userId) invalidateChatState(userId);
                        finishGame(io, room, id);
                        friendNotifier.setUserInGame(human.id, false);
                        break;
                    }
                    if (human) botTracker.markFinished(human.id);
                }
                if (userId) invalidateChatState(userId);
                closeRoom(io, id);
            }
            break;
        }
        if (userId) invalidateChatState(userId);
    });
}

function handleUseHint(io, socket) {
    socket.on('useHint', (data) => {
        if (!data || typeof data !== 'object') return;
        const session = socket.request.session;
        const userId = session?.userId;
        if (!userId) return;
        if (!wsRateLimit(userId, 'useHint', 5)) return;
        const hintType = data.type;
        const HINT_COSTS = { reveal_one: 30, reveal_pair: 50, extra_turn: 40 };
        const cost = HINT_COSTS[hintType];
        if (!cost) return;

        const roomId = Array.from(socket.rooms).find(r => r.startsWith('room_') || r.startsWith('botRoom_'));
        if (!roomId) return;
        const room = getRoom(roomId);
        if (!room || room.status !== 'playing') return;

        if (!room.hintsState) room.hintsState = {};
        if (!room.hintsState[userId]) room.hintsState[userId] = { count: 0, extraTurn: false };
        const hs = room.hintsState[userId];
        if (hs.count >= 3) { socket.emit('hintError', { reason: 'limit_reached' }); return; }
        hs.count++;

        coinsService.spendCoins(userId, cost, (err, result) => {
            if (err || !result.ok) {
                hs.count--;
                socket.emit('hintError', { reason: 'not_enough_coins', current: result?.current || 0, cost });
                return;
            }
            socket.emit('coinsUpdate', { coins: result.newBalance, delta: -cost, reason: 'hint_' + hintType });

            if (hintType === 'reveal_one') {
                const unmatched = [];
                room.deck.forEach((val, idx) => {
                    if (!room.matchedPairs.includes(val) && !room.openedCards.includes(idx)) {
                        unmatched.push({ index: idx, value: val });
                    }
                });
                if (!unmatched.length) { socket.emit('hintError', { reason: 'no_cards' }); return; }
                const pick = unmatched[Math.floor(Math.random() * unmatched.length)];
                socket.emit('hintReveal', { type: 'reveal_one', cards: [pick] });

            } else if (hintType === 'reveal_pair') {
                const unmatchedVals = [...new Set(
                    room.deck.filter((val, idx) => !room.matchedPairs.includes(val) && !room.openedCards.includes(idx))
                )];
                if (!unmatchedVals.length) { socket.emit('hintError', { reason: 'no_cards' }); return; }
                const targetVal = unmatchedVals[Math.floor(Math.random() * unmatchedVals.length)];
                const indices = [];
                room.deck.forEach((val, idx) => {
                    if (val === targetVal && !room.openedCards.includes(idx)) indices.push(idx);
                });
                socket.emit('hintReveal', { type: 'reveal_pair', cards: indices.map(i => ({ index: i, value: targetVal })) });

            } else if (hintType === 'extra_turn') {
                hs.extraTurn = true;
                socket.emit('hintReveal', { type: 'extra_turn', cards: [] });
            }
        });
    });
}

module.exports = {
    handleCreateRoom, handleCreateBotRoom, handleJoinRoom, handleSpectateRoom,
    handleCardClick, handleDisconnect,
    handleRejoinRoom, handleLeaveRejoinableRoom, getRejoinInfo, clearRejoinTimer,
    clearCooldownCleanup, handleUseHint
};
