const { broadcastLeaderboard, getLeaderboard } = require('../services/leaderboardService');
const { cleanupOldRooms, broadcastRoomsList, roomsListCache, rooms } = require('../services/roomManager');
const { throttleCardClick, processCardFlip, clearThrottleInterval } = require('../services/gameLogic');
const { clearCleanupTimer } = require('../services/botTracker');
const {
    handleCreateRoom, handleCreateBotRoom, handleJoinRoom, handleSpectateRoom,
    handleCardClick, handleDisconnect, handleRejoinRoom, handleLeaveRejoinableRoom,
    clearCooldownCleanup
} = require('./gameHandlers');
const { cleanRoomData } = require('../utils/helpers');
const {
    setupChatHandlers,
    invalidateChatState,
    clearChatCleanupInterval
} = require('./chatHandlers');

const connectedSockets = new Map();
let _io = null;
const MAX_CONNECTED_SOCKETS = 10000;
const HEARTBEAT_TIMEOUT = 1800000;

function getOnlineCount() {
    const unique = new Set([...connectedSockets.values()].map(v => v.userId));
    return unique.size;
}

function emitToUser(userId, event, data) {
    if (_io) _io.to(`user_${userId}`).emit(event, data);
}

function initWebSocket(io) {
    _io = io;
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
        clearCooldownCleanup();
        clearChatCleanupInterval();
    }
    process.once('SIGTERM', cleanupIntervals);
    process.once('SIGINT', cleanupIntervals);

    io.on('connection', (socket) => {
        const session = socket.request.session;
        if (!session || !session.userId) return;
        if (connectedSockets.size >= MAX_CONNECTED_SOCKETS) { socket.disconnect(true); return; }

        socket.join('lobby');
        socket.join(`user_${session.userId}`);

        connectedSockets.set(socket.id, { userId: session.userId, lastPing: Date.now() });

        socket.conn.on('close', () => { connectedSockets.delete(socket.id); });

        let lastHbTime = 0;
        socket.on('hb', () => {
            const now = Date.now();
            if (now - lastHbTime < 5000) return;
            lastHbTime = now;
            const info = connectedSockets.get(socket.id);
            if (info) info.lastPing = now;
            socket.emit('hb_ack');
        });

        socket.emit('roomsList', (() => {
            if (roomsListCache.dirty) {
                roomsListCache.data = Object.values(rooms).map(r => cleanRoomData(r));
                roomsListCache.dirty = false;
            }
            return roomsListCache.data || [];
        })());

        const MAX_LEADERBOARD_SUBS = 5;
        const leaderboardSubs = new Set();
        socket.on('subscribeLeaderboard', (category) => {
            const cat = (category || 'all').toString().substring(0, 30);
            if (!leaderboardSubs.has(cat) && leaderboardSubs.size >= MAX_LEADERBOARD_SUBS) return;
            leaderboardSubs.add(cat);
            socket.join(`leaderboard_${cat}`);
            getLeaderboard(cat, (data) => { socket.emit('leaderboardUpdate', { category: cat, data }); });
        });
        socket.on('unsubscribeLeaderboard', (category) => {
            const cat = (category || 'all').toString().substring(0, 30);
            leaderboardSubs.delete(cat);
            socket.leave(`leaderboard_${cat}`);
        });

        setupChatHandlers(io, socket, session);

        handleCreateRoom(io, socket);
        handleCreateBotRoom(io, socket);
        handleJoinRoom(io, socket);
        handleSpectateRoom(io, socket);
        handleRejoinRoom(io, socket);
        handleLeaveRejoinableRoom(io, socket);
        handleCardClick(io, socket, throttleCardClick, processCardFlip);
        handleDisconnect(io, socket, connectedSockets);
    });
}

module.exports = initWebSocket;
module.exports.getOnlineCount = getOnlineCount;
module.exports.invalidateChatState = invalidateChatState;
module.exports.emitToUser = emitToUser;
