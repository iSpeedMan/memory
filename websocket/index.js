const { broadcastLeaderboard, getLeaderboard } = require('../services/leaderboardService');
const { saveMessage, getHistory, markRead, deleteMessage } = require('../services/dmService');
const db = require('../db');
const { areFriends: checkFriends, getFriends } = require('../services/friendsService');
const friendNotifier = require('../services/friendNotifier');
const { cleanupOldRooms, broadcastRoomsList, roomsListCache, rooms } = require('../services/roomManager');
const { throttleCardClick, processCardFlip, clearThrottleInterval } = require('../services/gameLogic');
const { clearCleanupTimer } = require('../services/botTracker');
const { wsRateLimit, clearWsRateLimitTimer } = require('../middleware/wsRateLimit');
const {
    handleCreateRoom, handleCreateBotRoom, handleJoinRoom, handleSpectateRoom,
    handleCardClick, handleDisconnect, handleRejoinRoom, handleLeaveRejoinableRoom,
    clearCooldownCleanup, handleUseHint
} = require('./gameHandlers');
const { cleanRoomData } = require('../utils/helpers');
const {
    setupChatHandlers,
    invalidateChatState,
    clearChatCleanupInterval
} = require('./chatHandlers');
const logger = require('../utils/logger');
const coinsService = require('../services/coinsService');

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

const dmCooldowns = new Map();
const DM_RATE_MS = 1000;

function getUserSocketCount(userId) {
    let count = 0;
    for (const info of connectedSockets.values()) {
        if (info.userId === userId) count++;
    }
    return count;
}

function notifyFriendsOfStatus(userId, isOnline) {
    getFriends(userId, (err, friends) => {
        if (err || !friends) return;
        friends.forEach(f => {
            emitToUser(f.friend_id, isOnline ? 'friendOnline' : 'friendOffline', { userId });
        });
    });
}

let _serverInfoCache = { info: '', ts: '0', loaded: false };
let _announcementsCache = [];

function broadcastServerInfo(info, ts) {
    _serverInfoCache = { info: info || '', ts: ts || '0', loaded: true };
    if (_io) _io.emit('serverInfoUpdate', { info: info || '', ts: ts || '0' });
}

function broadcastAnnouncements(list) {
    _announcementsCache = list || [];
    if (_io) _io.emit('announcementsUpdate', { announcements: _announcementsCache });
}

function initWebSocket(io) {
    _io = io;
    friendNotifier.init(emitToUser);
    db.all('SELECT key, value FROM server_settings WHERE key IN (?, ?)', ['server_info', 'server_info_ts'], (err, rows) => {
        if (!err && rows) {
            const map = {};
            rows.forEach(r => { map[r.key] = r.value; });
            _serverInfoCache = { info: map.server_info || '', ts: map.server_info_ts || '0', loaded: true };
        }
    });
    db.all('SELECT id, text, created_at, updated_at FROM server_announcements ORDER BY created_at DESC', [], (err, rows) => {
        if (!err && rows) _announcementsCache = rows;
    });
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
    process.once('SIGTERM', cleanupIntervals);
    process.once('SIGINT', cleanupIntervals);

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

        if (_serverInfoCache.loaded && _serverInfoCache.info) {
            socket.emit('serverInfoUpdate', { info: _serverInfoCache.info, ts: _serverInfoCache.ts });
        }
        if (_announcementsCache.length > 0) {
            socket.emit('announcementsUpdate', { announcements: _announcementsCache });
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

        const MAX_LEADERBOARD_SUBS = 5;
        const leaderboardSubs = new Set();
        let lastSubTime = 0;
        socket.on('subscribeLeaderboard', (category) => {
            const now = Date.now();
            if (now - lastSubTime < 500) return;
            lastSubTime = now;
            if (category !== undefined && typeof category !== 'string') return;
            const cat = (category || 'all').toString().replace(/[^\w-]/g, '').substring(0, 30) || 'all';
            if (!leaderboardSubs.has(cat) && leaderboardSubs.size >= MAX_LEADERBOARD_SUBS) return;
            leaderboardSubs.add(cat);
            socket.join(`leaderboard_${cat}`);
            getLeaderboard(cat, (data) => { socket.emit('leaderboardUpdate', { category: cat, data }); });
        });
        socket.on('unsubscribeLeaderboard', (category) => {
            if (category !== undefined && typeof category !== 'string') return;
            const cat = (category || 'all').toString().replace(/[^\w-]/g, '').substring(0, 30) || 'all';
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
        handleUseHint(io, socket);

        socket.on('sendDm', (data) => {
            if (!data || typeof data !== 'object') return;
            const content = (data.content || '').toString().trim().substring(0, 500);
            const receiverId = parseInt(data.receiverId, 10);
            if (!content || !receiverId || isNaN(receiverId) || receiverId === session.userId) return;
            const now = Date.now();
            if (now - (dmCooldowns.get(session.userId) || 0) < DM_RATE_MS) {
                socket.emit('dmError', { error: 'dm_too_fast' }); return;
            }
            dmCooldowns.set(session.userId, now);
            checkFriends(session.userId, receiverId, (ok) => {
                if (!ok) return;
                saveMessage(session.userId, receiverId, content, (result) => {
                    if (result.error) return;
                    const msg = {
                        id: result.messageId, senderId: session.userId,
                        senderName: session.username, senderAvatar: session.avatar || '😶',
                        content: result.content, sentAt: new Date().toISOString()
                    };
                    socket.emit('dmSent', msg);
                    emitToUser(receiverId, 'dmMessage', msg);
                });
            });
        });

        socket.on('getDmHistory', (data) => {
            if (!wsRateLimit(session.userId, 'getDmHistory', 3, 10000)) return;
            if (!data || typeof data !== 'object') return;
            const friendId = parseInt(data.friendId, 10);
            if (!friendId || isNaN(friendId)) return;
            checkFriends(session.userId, friendId, (ok) => {
                if (!ok) return;
                getHistory(session.userId, friendId, 50, (err, messages) => {
                    if (err) return;
                    socket.emit('dmHistory', { friendId, messages });
                    markRead(session.userId, friendId, () => {});
                });
            });
        });

        socket.on('markDmRead', (data) => {
            if (!wsRateLimit(session.userId, 'markDmRead', 10)) return;
            if (!data || typeof data !== 'object') return;
            const friendId = parseInt(data.friendId, 10);
            if (!friendId || isNaN(friendId)) return;
            markRead(session.userId, friendId, () => {});
        });

        let lastUsersListTime = 0;
        socket.on('getUsersList', () => {
            const now = Date.now();
            if (now - lastUsersListTime < 5000) return;
            lastUsersListTime = now;
            db.all('SELECT username FROM users ORDER BY username LIMIT 500', [], (err, rows) => {
                if (err || !rows) return;
                socket.emit('usersList', { users: rows.map(r => r.username) });
            });
        });

        socket.on('deleteDm', (data) => {
            if (!wsRateLimit(session.userId, 'deleteDm', 5, 10000)) return;
            if (!data || !data.msgId) return;
            const msgId = parseInt(data.msgId, 10);
            if (isNaN(msgId)) return;
            deleteMessage(msgId, session.userId, (err, deleted, receiverId) => {
                if (!deleted) return;
                socket.emit('dmMessageDeleted', { msgId });
                if (receiverId) emitToUser(receiverId, 'dmMessageDeleted', { msgId });
            });
        });

        socket.on('localGameCompleted', () => {
            if (!wsRateLimit(session.userId, 'localGameCompleted', 2, 60000)) return;
            const { awardAchievement } = require('../services/achievementService');
            awardAchievement(session.userId, 'local_player', io);
        });

        socket.on('getFriendsOnlineStatus', () => {
            if (!wsRateLimit(session.userId, 'getFriendsOnlineStatus', 3, 10000)) return;
            const onlineUserIds = new Set([...connectedSockets.values()].map(v => v.userId));
            getFriends(session.userId, (err, friends) => {
                if (err || !friends) return;
                const onlineIds = friends.filter(f => onlineUserIds.has(f.friend_id)).map(f => f.friend_id);
                const inGameIds = onlineIds.filter(id => friendNotifier.isUserInGame(id));
                socket.emit('friendsOnlineStatus', { onlineIds, inGameIds });
            });
        });

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
