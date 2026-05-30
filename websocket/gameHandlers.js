const crypto = require('crypto');
const { createRoom, getRoom, deleteRoom, markRoomsDirty, broadcastRoomsList, getAllRooms } = require('../services/roomManager');
const botTracker = require('../services/botTracker');
const { getLang } = require('../middleware/auth');
const i18n = require('../public/i18n.js');
const { cleanRoomData } = require('../utils/helpers');

// Rejoin system: stores players who disconnected from active PvP games
// userId -> { roomId, playerIdx, timer }
const rejoinableRooms = new Map();
const REJOIN_TIMEOUT = 10 * 60 * 1000; // 10 minutes to return

const MAX_ROOM_ID_LEN = 60;
const MAX_ROOMS = 200;
const CREATE_ROOM_COOLDOWN_MS = 10000; // 10 seconds between room creations per user
const createRoomCooldowns = new Map();  // userId -> lastCreateTimestamp

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
    if (info && info.timer) {
        clearTimeout(info.timer);
    }
    rejoinableRooms.delete(userId);
}

function getRejoinInfo(userId) {
    return rejoinableRooms.get(userId);
}

/**
 * Handles a player fully leaving their rejoinable room from the lobby.
 * Closes the room for both players.
 */
function handleLeaveRejoinableRoom(io, socket) {
    socket.on('leaveRejoinableRoom', (roomId) => {
        if (typeof roomId !== 'string' || roomId.length > MAX_ROOM_ID_LEN) return;
        const session = socket.request.session;
        const userId = session?.userId;
        if (!userId) return;

        const info = rejoinableRooms.get(userId);
        if (!info || info.roomId !== roomId) return;

        clearRejoinTimer(userId);

        const room = getRoom(roomId);
        if (room) {
            // Notify opponent still inside the game room
            io.to(roomId).emit('roomClosed', 'opponent_left');
            deleteRoom(roomId);
            markRoomsDirty();
            broadcastRoomsList(io);
        }

        console.log(`[Rejoin] User ${userId} fully left rejoinable room ${roomId}.`);
    });
}

/**
 * Handles a player manually rejoining their active room from the lobby.
 */
function handleRejoinRoom(io, socket) {
    socket.on('rejoinRoom', (roomId) => {
        if (typeof roomId !== 'string' || roomId.length > MAX_ROOM_ID_LEN) return;
        const session = socket.request.session;
        const userId = session?.userId;
        if (!userId) return;

        const info = rejoinableRooms.get(userId);
        if (!info || info.roomId !== roomId) return;

        const room = getRoom(roomId);
        if (!room || room.status !== 'playing') {
            clearRejoinTimer(userId);
            return;
        }

        clearRejoinTimer(userId);

        const player = room.players[info.playerIdx];
        if (!player) return;

        player.socketId = socket.id;
        player.disconnected = false;

        socket.join(roomId);
        socket.leave('lobby');

        // Restore the game screen
        socket.emit('gameStart', { room: cleanRoomData(room), turn: room.players[room.turnIndex].id });

        // Send full board state
        socket.emit('gameReconnect', {
            matchedCards: room.matchedCards,
            openedCards: room.openedCards.map(idx => ({ index: idx, value: room.deck[idx] })),
            cardStats: room.cardStats
        });

        // Notify opponent
        const opponentIdx = 1 - info.playerIdx;
        const opponentSocket = io.sockets.sockets.get(room.players[opponentIdx]?.socketId);
        if (opponentSocket) opponentSocket.emit('opponentReconnected');

        // Refresh lobby (room is no longer "rejoinable" for this user, but still playing)
        markRoomsDirty();
        broadcastRoomsList(io);

        console.log(`[Rejoin] User ${userId} rejoined room ${roomId}`);
    });
}

function handleCreateRoom(io, socket) {
    socket.on('createRoom', (data) => {
        if (!data || typeof data !== 'object') return;
        const session = socket.request.session;
        const userId = session.userId;

        // Global room count cap — prevents memory exhaustion
        if (Object.keys(getAllRooms()).length >= MAX_ROOMS) return;

        // Per-user cooldown — one room creation per 10 seconds
        const now = Date.now();
        const lastCreate = createRoomCooldowns.get(userId) || 0;
        if (now - lastCreate < CREATE_ROOM_COOLDOWN_MS) return;
        createRoomCooldowns.set(userId, now);

        // Prevent multi-tab stacking — user can only be in one room at a time
        if (isUserInAnyRoom(userId)) return;

        const roomId = generateRoomId('room');
        const lang = getLang(socket.request);
        const safeName = (data.name || '').toString().substring(0, 50).trim();
        const safeCategory = (data.category || 'animals').toString().substring(0, 30);
        const isPrivate = !!data.isPrivate;
        const newRoom = {
            id: roomId, name: safeName || `${i18n.t('room', lang)} - ${session.username}`,
            creatorId: userId, creatorName: session.username, creatorAvatar: session.avatar || '😶',
            category: safeCategory, status: 'waiting', createdAt: now,
            isPrivate,
            players: [{ id: userId, name: session.username, avatar: session.avatar || '😶', socketId: socket.id, score: 0 }],
            deck: [], openedCards: [], matchedPairs: [], turnIndex: 0, cardStats: Array(36).fill(0), matchedCards: {}
        };
        createRoom(roomId, newRoom);
        socket.join(roomId);
        socket.emit('roomCreated', cleanRoomData(newRoom));
        broadcastRoomsList(io);
    });
}

function handleCreateBotRoom(io, socket) {
    socket.on('createBotRoom', (data) => {
        if (!data || typeof data !== 'object') return;
        const session = socket.request.session;
        const userId = session.userId;

        const check = botTracker.checkCanCreate(userId);
        if (!check.allowed) {
            socket.emit('botRoomThrottle', { remainingSeconds: check.remainingSeconds });
            return;
        }

        // Prevent multi-tab stacking
        if (isUserInAnyRoom(userId)) return;

        const validDifficulties = ['easy', 'medium', 'hard'];
        const difficulty = validDifficulties.includes(data.difficulty) ? data.difficulty : 'medium';
        const safeCategory = (data.category || 'animals').toString().substring(0, 30);
        const roomId = generateRoomId('botRoom');
        const deck = Array.from({ length: 18 }, (_, i) => [i + 1, i + 1]).flat().sort(() => Math.random() - 0.5);
        const lang = getLang(socket.request);
        const newRoom = {
            id: roomId, name: i18n.t('game_with_bot', lang),
            category: safeCategory, status: 'playing', createdAt: Date.now(),
            isBotMatch: true, botDifficulty: difficulty, botMemory: {},
            isPrivate: true,
            players: [
                { id: userId, name: session.username, avatar: session.avatar || '😶', socketId: socket.id, score: 0 },
                { id: 'bot_cpu', name: `${i18n.t('bot', lang)} 🤖`, avatar: '🤖', isBot: true, score: 0 }
            ],
            deck, openedCards: [], matchedPairs: [], turnIndex: 0, cardStats: Array(36).fill(0), matchedCards: {}
        };

        botTracker.markCreated(userId);
        createRoom(roomId, newRoom);
        socket.join(roomId);
        socket.leave('lobby');
        broadcastRoomsList(io);
        socket.emit('gameStart', { room: cleanRoomData(newRoom), turn: userId });
    });
}

function handleJoinRoom(io, socket) {
    socket.on('joinRoom', (roomId) => {
        if (typeof roomId !== 'string' || roomId.length > MAX_ROOM_ID_LEN) return;
        const room = getRoom(roomId);
        const session = socket.request.session;
        const userId = session.userId;

        // Prevent multi-tab stacking
        if (isUserInAnyRoom(userId)) return;

        if (room && room.status === 'waiting' && room.creatorId !== userId) {
            room.players.push({ id: userId, name: session.username, avatar: session.avatar || '😶', socketId: socket.id, score: 0 });
            room.status = 'playing';
            room.deck = Array.from({ length: 18 }, (_, i) => [i + 1, i + 1]).flat().sort(() => Math.random() - 0.5);
            socket.join(roomId);

            socket.leave('lobby');
            const creatorSocket = io.sockets.sockets.get(room.players[0].socketId);
            if (creatorSocket) creatorSocket.leave('lobby');

            io.to(roomId).emit('gameStart', { room: cleanRoomData(room), turn: room.players[0].id });
            markRoomsDirty();
            broadcastRoomsList(io);
        }
    });
}

function handleSpectateRoom(io, socket) {
    socket.on('spectateRoom', (roomId) => {
        if (typeof roomId !== 'string' || roomId.length > MAX_ROOM_ID_LEN) return;
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
        if (typeof cardIndex !== 'number' || !Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex > 35) return;
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
                // PvP active game: mark disconnected, allow manual rejoin for 10 minutes
                room.players[playerIdx].disconnected = true;

                // Notify opponent
                const opponentIdx = 1 - playerIdx;
                const opponentSocket = io.sockets.sockets.get(room.players[opponentIdx]?.socketId);
                if (opponentSocket) {
                    opponentSocket.emit('opponentDisconnected');
                }

                // Set cleanup timer — if player doesn't rejoin in time, close room
                const timer = setTimeout(() => {
                    rejoinableRooms.delete(userId);
                    const r = getRoom(id);
                    if (r && r.players[playerIdx]?.disconnected) {
                        io.to(id).emit('roomClosed', 'opponent_left');
                        deleteRoom(id);
                        markRoomsDirty();
                        broadcastRoomsList(io);
                    }
                }, REJOIN_TIMEOUT);

                rejoinableRooms.set(userId, { roomId: id, playerIdx, timer });

                // Refresh lobby: room now shows rejoin button for this user
                markRoomsDirty();
                broadcastRoomsList(io);

                console.log(`[Rejoin] User ${userId} disconnected from room ${id}. 10 min to rejoin.`);
            } else {
                // Bot game or waiting room: close immediately
                if (room.isBotMatch) {
                    const human = room.players.find(p => !p.isBot);
                    if (human) botTracker.markFinished(human.id);
                }
                io.to(id).emit('roomClosed', 'opponent_left');
                deleteRoom(id);
                markRoomsDirty();
                broadcastRoomsList(io);
            }
            break;
        }
    });
}

module.exports = {
    handleCreateRoom, handleCreateBotRoom, handleJoinRoom, handleSpectateRoom,
    handleCardClick, handleDisconnect,
    handleRejoinRoom, handleLeaveRejoinableRoom, getRejoinInfo, clearRejoinTimer
};
