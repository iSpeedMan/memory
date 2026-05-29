const { broadcastLeaderboard, getLeaderboard } = require('../services/leaderboardService');
const { cleanupOldRooms, broadcastRoomsList, getRoom, roomsListCache, rooms } = require('../services/roomManager');
const { throttleCardClick, processCardFlip, clearThrottleInterval } = require('../services/gameLogic');
const { clearCleanupTimer } = require('../services/botTracker');
const {
    handleCreateRoom, handleCreateBotRoom, handleJoinRoom, handleSpectateRoom,
    handleCardClick, handleDisconnect, handleReconnect
} = require('./gameHandlers');
const { cleanRoomData } = require('../utils/helpers');

const connectedSockets = new Map();
const MAX_CONNECTED_SOCKETS = 10000;
const HEARTBEAT_TIMEOUT = 1800000;

// Для admin/stats
function getOnlineCount() {
    return connectedSockets.size;
}

function initWebSocket(io) {
    const roomCleanupInterval = setInterval(() => cleanupOldRooms(io), 5 * 60 * 1000);

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

    function cleanupIntervals() {
        clearInterval(roomCleanupInterval);
        clearInterval(heartbeatInterval);
        clearThrottleInterval();
        clearCleanupTimer();
    }

    process.once('SIGTERM', cleanupIntervals);
    process.once('SIGINT', cleanupIntervals);

    io.on('connection', (socket) => {
        const session = socket.request.session;
        if (!session || !session.userId) return;

        if (connectedSockets.size >= MAX_CONNECTED_SOCKETS) {
            socket.disconnect(true);
            return;
        }

        // Проверяем, есть ли ожидающий реконнект для этого пользователя
        const wasReconnected = handleReconnect(io, socket, session.userId);
        if (!wasReconnected) {
            // Обычное подключение — добавляем в лобби
            socket.join('lobby');
        }

        connectedSockets.set(socket.id, { userId: session.userId, lastPing: Date.now() });

        socket.conn.on('close', () => {
            connectedSockets.delete(socket.id);
        });

        socket.on('hb', () => {
            const info = connectedSockets.get(socket.id);
            if (info) info.lastPing = Date.now();
            socket.emit('hb_ack');
        });

        // Список комнат только для новых подключений (не реконнектов в игру)
        if (!wasReconnected) {
            socket.emit('roomsList', (() => {
                if (roomsListCache.dirty) {
                    roomsListCache.data = Object.values(rooms).map(r => cleanRoomData(r));
                    roomsListCache.dirty = false;
                }
                return roomsListCache.data || [];
            })());
        }

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
module.exports.getOnlineCount = getOnlineCount;
