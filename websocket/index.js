const db = require('../db');
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

// Ephemeral chat history per room
const chatHistory = new Map();
const CHAT_HISTORY_MAX = 20;
const CHAT_RATE_MS = 800;
const CHAT_MAX_LEN = 100;

// In-memory user chat state cache: userId -> { violations, mutedUntil, chatDisabled }
const chatUserState = new Map();

// ===== PROFANITY FILTER =====
const PROFANITY_WORDS = [
    'блять','блядь','пизда','пиздец','ебать','ёбать','ебаный','ёбаный','еблан',
    'хуй','хуйня','хуёвый','пидор','пидорас','сука','суки','ублюдок','мудак',
    'залупа','долбоёб','долбоеб','шлюха','уёбок','уебок','курва','манда','бля',
    'fuck','shit','bitch','asshole','cunt','nigger','faggot','motherfuck',
    'whore','bastard','dickhead','bullshit','cock','slut'
];

function censorText(text) {
    let censored = text;
    let hasProfanity = false;
    PROFANITY_WORDS.forEach(word => {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'gi');
        if (regex.test(censored)) {
            hasProfanity = true;
            censored = censored.replace(new RegExp(escaped, 'gi'), m => '*'.repeat(m.length));
        }
    });
    return { censored, hasProfanity };
}

function getChatUserState(userId) {
    if (chatUserState.has(userId)) return Promise.resolve(chatUserState.get(userId));
    return new Promise((resolve) => {
        db.get('SELECT chat_violations, chat_muted_until, chat_disabled FROM users WHERE id = ?', [userId], (err, row) => {
            const state = {
                violations: row?.chat_violations || 0,
                mutedUntil: row?.chat_muted_until || 0,
                chatDisabled: row?.chat_disabled === 1
            };
            chatUserState.set(userId, state);
            resolve(state);
        });
    });
}

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

        // ===== CHAT =====
        let lastChatTime = 0;

        socket.on('sendChat', async (payload) => {
            if (!payload || typeof payload.text !== 'string') return;
            const text = payload.text.trim().substring(0, CHAT_MAX_LEN);
            if (!text) return;
            const now = Date.now();
            if (now - lastChatTime < CHAT_RATE_MS) return;
            lastChatTime = now;

            const userId = session.userId;
            const username = session.username || 'Anonymous';
            const avatar = session.avatar || '😶';

            try {
                const userState = await getChatUserState(userId);

                if (userState.chatDisabled) return;

                if (userState.mutedUntil > now) {
                    const remainingMinutes = Math.ceil((userState.mutedUntil - now) / 60000);
                    socket.emit('chatMuted', { mutedUntil: userState.mutedUntil, remainingMinutes });
                    return;
                }

                const { censored, hasProfanity } = censorText(text);

                if (hasProfanity) {
                    userState.violations++;
                    chatUserState.set(userId, userState);

                    if (userState.violations >= 6) {
                        const mutedUntil = now + 24 * 60 * 60 * 1000;
                        userState.mutedUntil = mutedUntil;
                        db.run('UPDATE users SET chat_violations = ?, chat_muted_until = ? WHERE id = ?',
                            [userState.violations, mutedUntil, userId]);
                        socket.emit('chatMuted', { mutedUntil, remainingMinutes: 1440, isBanned: true });
                        return;
                    } else {
                        db.run('UPDATE users SET chat_violations = ? WHERE id = ?', [userState.violations, userId]);
                        if (userState.violations >= 3) {
                            socket.emit('chatWarning', { violations: userState.violations, maxBeforeBan: 6 });
                        }
                    }
                }

                const gameRoomId = Array.from(socket.rooms).find(r => r.startsWith('room_') || r.startsWith('botRoom_'));
                const targetRoom = gameRoomId || 'lobby';

                const msg = { username, avatar, text: censored, ts: now };
                addToChatHistory(targetRoom, msg);
                io.to(targetRoom).emit('chatMessage', msg);

            } catch (e) {
                console.error('sendChat error:', e);
            }
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
module.exports.chatUserState = chatUserState;
