const { broadcastLeaderboard, getLeaderboard } = require('../services/leaderboardService');
const { cleanupOldRooms, broadcastRoomsList, getRoom } = require('../services/roomManager');
const { throttleCardClick, processCardFlip } = require('../services/gameLogic');
const i18n = require('../public/i18n.js');
const { cleanRoomData } = require('../utils/helpers');

const connectedSockets = new Map();
const HEARTBEAT_TIMEOUT = 1800000; // 30 минут

function initWebSocket(io) {
    // Периодическая очистка комнат
    setInterval(() => cleanupOldRooms(io), 5 * 60 * 1000);

    setInterval(() => {
        const now = Date.now();
        for (const [socketId, info] of connectedSockets) {
            if (now - info.lastPing > HEARTBEAT_TIMEOUT) {
                const socket = io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.disconnect(true);
                }
                // Удаляем запись в любом случае
                connectedSockets.delete(socketId);
            }
        }
    }, 30000);

    io.on('connection', (socket) => {
        const session = socket.request.session;
        if (!session || !session.userId) return;

        // Heartbeat
        connectedSockets.set(socket.id, { userId: session.userId, lastPing: Date.now() });
        socket.on('hb', () => {
            const info = connectedSockets.get(socket.id);
            if (info) info.lastPing = Date.now();
            socket.emit('hb_ack');
        });

        // Список комнат при подключении
        socket.emit('roomsList', (() => {
            const { roomsListCache } = require('../services/roomManager');
            if (roomsListCache.dirty) {
                roomsListCache.data = Object.values(require('../services/roomManager').rooms).map(r => cleanRoomData(r));
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

        // Импортируем игровые обработчики (чтобы не засорять этот файл)
        const { handleCreateRoom, handleCreateBotRoom, handleJoinRoom, handleSpectateRoom, handleCardClick, handleDisconnect } = require('./gameHandlers');
        handleCreateRoom(io, socket);
        handleCreateBotRoom(io, socket);
        handleJoinRoom(io, socket);
        handleSpectateRoom(io, socket);
        handleCardClick(io, socket, throttleCardClick, processCardFlip);
        handleDisconnect(io, socket, connectedSockets);
    });
}

module.exports = initWebSocket;