const { broadcastLeaderboard, getLeaderboard } = require('../services/leaderboardService');
const { cleanupOldRooms, broadcastRoomsList, getRoom, roomsListCache, rooms } = require('../services/roomManager');
const { throttleCardClick, processCardFlip, clearThrottleInterval } = require('../services/gameLogic');
const { clearCleanupTimer } = require('../services/botTracker');
const {
    handleCreateRoom, handleCreateBotRoom, handleJoinRoom, handleSpectateRoom,
    handleCardClick, handleDisconnect, handleRejoinRoom, handleLeaveRejoinableRoom
} = require('./gameHandlers');
const { cleanRoomData } = require('../utils/helpers');

const connectedSockets = new Map();
const MAX_CONNECTED_SOCKETS = 10000;
const HEARTBEAT_TIMEOUT = 1800000;

// Ephemeral chat history per room (roomId -> array of {username, avatar, text, ts})
const chatHistory = new Map();
const CHAT_HISTORY_MAX = 20;
const CHAT_RATE_MS = 800;
const CHAT_MAX_LEN = 100;

function addToChatHistory(roomId, msg) {
    if (!chatHistory.has(roomId)) chatHistory.set(roomId, []);
    const hist = chatHistory.get(roomId);
    hist.push(msg);
    if (hist.length > CHAT_HISTORY_MAX) hist.shift();
}

function getOnlineCount() { return connectedSockets.size; }

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
        if (connectedSockets.size >= MAX_CONNECTED_SOCKETS) { socket.disconnect(true); return; }

        socket.join('lobby');
        // User-specific room for targeted notifications (achievements, etc.)
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

        // Rooms list
        socket.emit('roomsList', (() => {
            if (roomsListCache.dirty) {
                roomsListCache.data = Object.values(rooms).map(r => cleanRoomData(r));
                roomsListCache.dirty = false;
            }
            return roomsListCache.data || [];
        })());

        // Leaderboard subscriptions
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

        // ===== CHAT =====
        let lastChatTime = 0;

        socket.on('sendChat', (payload) => {
            if (!payload || typeof payload.text !== 'string') return;
            const text = payload.text.trim().substring(0, CHAT_MAX_LEN);
            if (!text) return;
            const now = Date.now();
            if (now - lastChatTime < CHAT_RATE_MS) return;
            lastChatTime = now;

            const username = session.username || 'Anonymous';
            const avatar = session.avatar || '😶';

            // Determine which room to broadcast to (game room takes priority over lobby)
            const gameRoomId = Array.from(socket.rooms).find(r => r.startsWith('room_') || r.startsWith('botRoom_'));
            const targetRoom = gameRoomId || 'lobby';

            const msg = { username, avatar, text, ts: now };
            addToChatHistory(targetRoom, msg);
            io.to(targetRoom).emit('chatMessage', msg);
        });

        socket.on('getChatHistory', (payload) => {
            const gameRoomId = Array.from(socket.rooms).find(r => r.startsWith('room_') || r.startsWith('botRoom_'));
            const targetRoom = (payload && typeof payload.room === 'string') ? payload.room : (gameRoomId || 'lobby');
            const hist = chatHistory.get(targetRoom) || [];
            socket.emit('chatHistory', { room: targetRoom, messages: hist });
        });
        // ===== END CHAT =====

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
