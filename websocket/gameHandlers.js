const { createRoom, getRoom, deleteRoom, markRoomsDirty, broadcastRoomsList, getAllRooms } = require('../services/roomManager');
const botTracker = require('../services/botTracker');
const { getLang } = require('../middleware/auth');
const i18n = require('../public/i18n.js');
const { cleanRoomData } = require('../utils/helpers');

// Реконнект: хранит временные данные для игроков, которые временно отключились
const reconnectTimers = new Map(); // userId -> { roomId, playerIdx, timer }
const RECONNECT_TIMEOUT = 30000; // 30 секунд

function getReconnectInfo(userId) {
    return reconnectTimers.get(userId);
}

function clearReconnectTimer(userId) {
    const info = reconnectTimers.get(userId);
    if (info) {
        clearTimeout(info.timer);
        reconnectTimers.delete(userId);
    }
}

/**
 * Восстанавливает игру для реконнектнувшегося игрока.
 * Возвращает true, если реконнект выполнен успешно.
 */
function handleReconnect(io, socket, userId) {
    const info = reconnectTimers.get(userId);
    if (!info) return false;

    const room = getRoom(info.roomId);
    if (!room || room.status !== 'playing') {
        clearReconnectTimer(userId);
        return false;
    }

    clearReconnectTimer(userId);

    const player = room.players[info.playerIdx];
    if (!player) return false;

    player.socketId = socket.id;
    player.disconnected = false;

    socket.join(info.roomId);
    socket.leave('lobby');

    // Отправляем gameStart для инициализации экрана
    socket.emit('gameStart', { room: cleanRoomData(room), turn: room.players[room.turnIndex].id });

    // Отправляем полное состояние доски (уже открытые/совпавшие карты)
    socket.emit('gameReconnect', {
        matchedCards: room.matchedCards,
        openedCards: room.openedCards.map(idx => ({ index: idx, value: room.deck[idx] })),
        cardStats: room.cardStats
    });

    // Уведомляем оппонента
    const opponentIdx = 1 - info.playerIdx;
    const opponentSocket = io.sockets.sockets.get(room.players[opponentIdx]?.socketId);
    if (opponentSocket) opponentSocket.emit('opponentReconnected');

    console.log(`[Reconnect] User ${userId} restored to room ${info.roomId}`);
    return true;
}

function handleCreateRoom(io, socket) {
    socket.on('createRoom', (data) => {
        if (!data || typeof data !== 'object') return;
        const session = socket.request.session;
        const roomId = 'room_' + Date.now();
        const lang = getLang(socket.request);
        const safeName = (data.name || '').toString().substring(0, 50).trim();
        const safeCategory = (data.category || 'animals').toString().substring(0, 30);
        const isPrivate = !!data.isPrivate;
        const newRoom = {
            id: roomId, name: safeName || `${i18n.t('room', lang)} - ${session.username}`,
            creatorId: session.userId, creatorName: session.username, creatorAvatar: session.avatar || '😶',
            category: safeCategory, status: 'waiting', createdAt: Date.now(),
            isPrivate,
            players: [{ id: session.userId, name: session.username, avatar: session.avatar || '😶', socketId: socket.id, score: 0 }],
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

        const check = botTracker.checkCanCreate(session.userId);
        if (!check.allowed) {
            socket.emit('botRoomThrottle', { remainingSeconds: check.remainingSeconds });
            return;
        }

        const validDifficulties = ['easy', 'medium', 'hard'];
        const difficulty = validDifficulties.includes(data.difficulty) ? data.difficulty : 'medium';
        const safeCategory = (data.category || 'animals').toString().substring(0, 30);
        const roomId = 'botRoom_' + Date.now();
        const deck = Array.from({ length: 18 }, (_, i) => [i + 1, i + 1]).flat().sort(() => Math.random() - 0.5);
        const lang = getLang(socket.request);
        const newRoom = {
            id: roomId, name: i18n.t('game_with_bot', lang),
            category: safeCategory, status: 'playing', createdAt: Date.now(),
            isBotMatch: true, botDifficulty: difficulty, botMemory: {},
            isPrivate: true,
            players: [
                { id: session.userId, name: session.username, avatar: session.avatar || '😶', socketId: socket.id, score: 0 },
                { id: 'bot_cpu', name: `${i18n.t('bot', lang)} 🤖`, avatar: '🤖', isBot: true, score: 0 }
            ],
            deck, openedCards: [], matchedPairs: [], turnIndex: 0, cardStats: Array(36).fill(0), matchedCards: {}
        };

        botTracker.markCreated(session.userId);
        createRoom(roomId, newRoom);
        socket.join(roomId);
        socket.leave('lobby');
        broadcastRoomsList(io);
        socket.emit('gameStart', { room: cleanRoomData(newRoom), turn: session.userId });
    });
}

function handleJoinRoom(io, socket) {
    socket.on('joinRoom', (roomId) => {
        if (typeof roomId !== 'string') return;
        const room = getRoom(roomId);
        const session = socket.request.session;
        if (room && room.status === 'waiting' && room.creatorId !== session.userId) {
            room.players.push({ id: session.userId, name: session.username, avatar: session.avatar || '😶', socketId: socket.id, score: 0 });
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
        if (typeof roomId !== 'string') return;
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

            // PvP активная игра: даём время на реконнект
            if (room.status === 'playing' && !room.isBotMatch && userId) {
                room.players[playerIdx].disconnected = true;

                const opponentIdx = 1 - playerIdx;
                const opponentSocket = io.sockets.sockets.get(room.players[opponentIdx]?.socketId);
                if (opponentSocket) {
                    opponentSocket.emit('opponentDisconnected', { seconds: Math.floor(RECONNECT_TIMEOUT / 1000) });
                }

                const timer = setTimeout(() => {
                    reconnectTimers.delete(userId);
                    const r = getRoom(id);
                    if (r && r.players[playerIdx]?.disconnected) {
                        io.to(id).emit('roomClosed', 'opponent_left');
                        deleteRoom(id);
                        broadcastRoomsList(io);
                    }
                }, RECONNECT_TIMEOUT);

                reconnectTimers.set(userId, { roomId: id, playerIdx, timer });
                console.log(`[Reconnect] User ${userId} disconnected from room ${id}, waiting ${RECONNECT_TIMEOUT / 1000}s`);
            } else {
                // Бот-игра или режим ожидания — закрываем сразу
                io.to(id).emit('roomClosed', 'opponent_left');
                deleteRoom(id);
                broadcastRoomsList(io);
            }
            break;
        }
    });
}

module.exports = {
    handleCreateRoom, handleCreateBotRoom, handleJoinRoom, handleSpectateRoom,
    handleCardClick, handleDisconnect,
    handleReconnect, getReconnectInfo, clearReconnectTimer
};
