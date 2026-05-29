const { broadcastLeaderboard, getLeaderboard } = require('../services/leaderboardService');
const { cleanupOldRooms, broadcastRoomsList, getRoom, roomsListCache, rooms } = require('../services/roomManager');
const { throttleCardClick, processCardFlip } = require('../services/gameLogic');
const { handleCreateRoom, handleCreateBotRoom, handleJoinRoom, handleSpectateRoom, handleCardClick, handleDisconnect } = require('./gameHandlers');
const i18n = require('../public/i18n.js');
const { cleanRoomData } = require('../utils/helpers');

const connectedSockets = new Map();
const MAX_CONNECTED_SOCKETS = 10000;
const HEARTBEAT_TIMEOUT = 1800000; // 30 минут

function initWebSocket(io) {
    // Периодическая очистка комнат
    const roomCleanupInterval = setInterval(() => cleanupOldRooms(io), 5 * 60 * 1000);

    // Heartbeat cleanup
    const heartbeatInterval = setInterval(() => {
        const now = Date.now();
        for (const [socketId, info] of connectedSockets) {
            if (now - info.lastPing > HEARTBEAT_TIMEOUT) {
                const socket = io.sockets.sockets.get(socketId);
                if (socket) socket.disconnect(true);
                connectedSockets.delete(socketId);
            }
        }
    }, 30000);

    // Очищаем интервалы при shutdown
    process.once('SIGTERM', () => {
        clearInterval(roomCleanupInterval);
        clearInterval(heartbeatInterval);
    });
    process.once('SIGINT', () => {
        clearInterval(roomCleanupInterval);
        clearInterval(heartbeatInterval);
    });

    io.on('connection', (socket) => {
        const session = socket.request.session;
        if (!session || !session.userId) return;

        // Ограничиваем размер connectedSockets
        if (connectedSockets.size >= MAX_CONNECTED_SOCKETS) {
            socket.disconnect(true);
            return;
        }

        // Heartbeat
        connectedSockets.set(socket.id, { userId: session.userId, lastPing: Date.now() });

        // Очищаем запись при закрытии соединения (надёжнее disconnect)
        socket.conn.on('close', () => {
            connectedSockets.delete(socket.id);
        });

        socket.on('hb', () => {
            const info = connectedSockets.get(socket.id);
            if (info) info.lastPing = Date.now();
            socket.emit('hb_ack');
        });

        // Список комнат при подключении
        socket.emit('roomsList', (() => {
            if (roomsListCache.dirty) {
                roomsListCache.data = Object.values(rooms).map(r => cleanRoomData(r));
                roomsListCache.dirty = false;
            }
            return roomsListCache.data || [];
        })());

        // Leaderboard подписка
        socket.on('subscribeLeaderboard', (category) => {
            const cat = (category || 'all').toString().substring(0, 30);
            socket.join(`leaderboard_${cat}`);
            getLeaderboard(cat, (data) => {
                socket.emit('leaderboardUpdate', { category: cat, data });
            });
        });

        socket.on('unsubscribeLeaderboard', (category) => {
            const cat = (category || 'all').toString().substring(0, 30);
            socket.leave(`leaderboard_${cat}`);
        });

        handleCreateRoom(io, socket);
        handleCreateBotRoom(io, socket);
        handleJoinRoom(io, socket);
        handleSpectateRoom(io, socket);
        handleCardClick(io, socket, throttleCardClick, processCardFlip);
        handleDisconnect(io, socket, connectedSockets);
    });
}

module.exports = initWebSocket;
