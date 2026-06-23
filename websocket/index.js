const db = require('../db');
const { cleanupOldRooms, roomsListCache, rooms } = require('../services/roomManager');
const { throttleCardClick, processCardFlip, clearThrottleInterval } = require('../services/gameLogic');
const { clearCleanupTimer } = require('../services/botTracker');
const { clearWsRateLimitTimer } = require('../middleware/wsRateLimit');
const {
    handleCreateRoom, handleCreateBotRoom, handleJoinRoom, handleSpectateRoom,
    handleCardClick, handleDisconnect, handleRejoinRoom, handleLeaveRejoinableRoom,
    clearCooldownCleanup, handleUseHint, handleRematch
} = require('./gameHandlers');
const { cleanRoomData } = require('../utils/helpers');
const {
    setupChatHandlers,
    invalidateChatState,
    clearChatCleanupInterval
} = require('./chatHandlers');
const logger = require('../utils/logger');
const coinsService = require('../services/coinsService');
const friendNotifier = require('../services/friendNotifier');

const {
    connectedSockets,
    MAX_CONNECTED_SOCKETS,
    HEARTBEAT_TIMEOUT,
    setIo,
    getOnlineCount,
    emitToUser,
    broadcastServerInfo,
    broadcastAnnouncements,
    getUserSocketCount,
    getServerInfoCache,
    getAnnouncementsCache,
    setServerInfoCache,
    setAnnouncementsCache,
    loadServerInfoCache,
    loadAnnouncementsCache
} = require('./state/connections');

const { setupLeaderboardHandlers } = require('./handlers/leaderboard');
const { setupDmHandlers } = require('./handlers/dm');
const { setupFriendsHandlers, notifyFriendsOfStatus } = require('./handlers/friends');
const { setupLobbyHandlers } = require('./handlers/lobby');

function initWebSocket(io) {
    setIo(io);
    friendNotifier.init(emitToUser);

    // Загружаем server info и объявления: сначала Redis, потом БД
    loadServerInfoCache(db);
    loadAnnouncementsCache(db);

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
        clearWsRateLimitTimer();
    }
    module.exports.cleanupIntervals = cleanupIntervals;

    io.on('connection', (socket) => {
        const session = socket.request.session;
        if (!session || !session.userId) return;
        if (connectedSockets.size >= MAX_CONNECTED_SOCKETS) {
            logger.warn({ userId: session.userId }, 'Connection limit reached, disconnecting socket');
            socket.disconnect(true);
            return;
        }

        socket.join('lobby');
        socket.join(`user_${session.userId}`);
        connectedSockets.set(socket.id, { userId: session.userId, lastPing: Date.now() });

        if (getUserSocketCount(session.userId) === 1) {
            notifyFriendsOfStatus(session.userId, true);
        }

        const sic = getServerInfoCache();
        if (sic.loaded && sic.info) {
            socket.emit('serverInfoUpdate', { info: sic.info, ts: sic.ts });
        }
        const ac = getAnnouncementsCache();
        if (ac.length > 0) {
            socket.emit('announcementsUpdate', { announcements: ac });
        }

        coinsService.getCoins(session.userId, (err, coins) => {
            if (!err) socket.emit('coinsUpdate', { coins, delta: 0, reason: 'init' });
        });

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

        setupLeaderboardHandlers(socket);
        setupChatHandlers(io, socket, session);
        setupDmHandlers(socket, session);
        setupFriendsHandlers(socket, session);
        setupLobbyHandlers(socket, session);

        handleCreateRoom(io, socket);
        handleCreateBotRoom(io, socket);
        handleJoinRoom(io, socket);
        handleSpectateRoom(io, socket);
        handleRejoinRoom(io, socket);
        handleLeaveRejoinableRoom(io, socket);
        handleCardClick(io, socket, throttleCardClick, processCardFlip);
        handleUseHint(io, socket);
        handleRematch(io, socket);

        socket.on('disconnect', () => {
            const remaining = getUserSocketCount(session.userId);
            if (remaining <= 1) {
                notifyFriendsOfStatus(session.userId, false);
            }
        });

        handleDisconnect(io, socket, connectedSockets);
    });
}

module.exports = initWebSocket;
module.exports.getOnlineCount = getOnlineCount;
module.exports.invalidateChatState = invalidateChatState;
module.exports.emitToUser = emitToUser;
module.exports.broadcastServerInfo = broadcastServerInfo;
module.exports.broadcastAnnouncements = broadcastAnnouncements;
