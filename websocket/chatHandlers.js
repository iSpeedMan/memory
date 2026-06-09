const db = require('../db');
const redis = require('../services/redis');
const PROFANITY_WORDS = require('../config/profanity');

const chatHistory = new Map();
const CHAT_HISTORY_MAX = 20;
const CHAT_RATE_MS = 800;
const CHAT_MAX_LEN = 100;
const LOBBY_HISTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REDIS_LOBBY_TTL = 24 * 60 * 60;
const REDIS_ROOM_TTL  = 60 * 60;

const chatUserState = new Map();

const profanityRegexes = PROFANITY_WORDS.map(word => ({
    word,
    re: new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
}));

function redisChatKey(roomId) {
    return `metro:chat:${roomId}`;
}

function redisChatTtl(roomId) {
    return roomId === 'lobby' ? REDIS_LOBBY_TTL : REDIS_ROOM_TTL;
}

function censorText(text) {
    let censored = text;
    let hasProfanity = false;
    for (const { re } of profanityRegexes) {
        if (re.test(censored)) {
            hasProfanity = true;
            re.lastIndex = 0;
            censored = censored.replace(re, m => '*'.repeat(m.length));
        }
        re.lastIndex = 0;
    }
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

    if (redis.isAvailable) {
        redis.set(redisChatKey(roomId), JSON.stringify(hist), { EX: redisChatTtl(roomId) }).catch(() => {});
    }
}

async function getChatHistoryData(roomId) {
    let hist = chatHistory.get(roomId);
    if (hist && hist.length > 0) return hist;

    if (redis.isAvailable) {
        const raw = await redis.get(redisChatKey(roomId)).catch(() => null);
        if (raw) {
            try {
                const data = JSON.parse(raw);
                chatHistory.set(roomId, data);
                return data;
            } catch (_) {}
        }
    }

    return hist || [];
}

function cleanChatHistory(roomId) {
    chatHistory.delete(roomId);
    if (redis.isAvailable) {
        redis.del(redisChatKey(roomId)).catch(() => {});
    }
}

function invalidateChatState(userId) {
    chatUserState.delete(Number(userId));
    chatUserState.delete(String(userId));
}

const { rooms } = require('../services/roomManager');
const chatCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const roomId of chatHistory.keys()) {
        if (roomId === 'lobby') {
            const hist = chatHistory.get(roomId);
            const filtered = hist.filter(m => now - m.ts < LOBBY_HISTORY_MAX_AGE_MS);
            if (filtered.length !== hist.length) {
                if (filtered.length === 0) chatHistory.delete(roomId);
                else chatHistory.set(roomId, filtered);
            }
        } else if (!rooms[roomId]) {
            chatHistory.delete(roomId);
        }
    }
}, 5 * 60 * 1000);

function clearChatCleanupInterval() {
    clearInterval(chatCleanupInterval);
}

function setupChatHandlers(io, socket, session) {
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

            const msgId = Math.random().toString(36).slice(2, 10);
            const msg = { id: msgId, userId, username, avatar, text: censored, ts: now };
            addToChatHistory(targetRoom, msg);
            io.to(targetRoom).emit('chatMessage', msg);

        } catch (e) {
            console.error('sendChat error:', e);
        }
    });

    socket.on('getChatHistory', async (payload) => {
        const gameRoomId = Array.from(socket.rooms).find(r => r.startsWith('room_') || r.startsWith('botRoom_'));
        const defaultRoom = gameRoomId || 'lobby';
        let targetRoom = defaultRoom;
        if (payload && typeof payload.room === 'string') {
            const requested = payload.room;
            if (requested === 'lobby' || socket.rooms.has(requested)) {
                targetRoom = requested;
            }
        }
        const messages = await getChatHistoryData(targetRoom);
        socket.emit('chatHistory', { room: targetRoom, messages });
    });

    socket.on('deleteChatMessage', (payload) => {
        if (!payload || typeof payload.msgId !== 'string') return;
        const msgId = payload.msgId;
        const gameRoomId = Array.from(socket.rooms).find(r => r.startsWith('room_') || r.startsWith('botRoom_'));
        const targetRoom = gameRoomId || 'lobby';
        const hist = chatHistory.get(targetRoom);
        if (!hist) return;
        const idx = hist.findIndex(m => m.id === msgId);
        if (idx === -1) return;
        const msg = hist[idx];
        db.get('SELECT is_admin FROM users WHERE id = ?', [session.userId], (err, row) => {
            const isAdmin = !err && row && row.is_admin === 1;
            if (msg.userId !== session.userId && !isAdmin) return;
            hist.splice(idx, 1);
            io.to(targetRoom).emit('chatMessageDeleted', { msgId });
        });
    });

    socket.on('editChatMessage', (payload) => {
        if (!payload || typeof payload.msgId !== 'string' || typeof payload.newText !== 'string') return;
        const msgId = payload.msgId;
        const newText = payload.newText.trim().substring(0, CHAT_MAX_LEN);
        if (!newText) return;
        const gameRoomId = Array.from(socket.rooms).find(r => r.startsWith('room_') || r.startsWith('botRoom_'));
        const targetRoom = gameRoomId || 'lobby';
        const hist = chatHistory.get(targetRoom);
        if (!hist) return;
        const idx = hist.findIndex(m => m.id === msgId);
        if (idx === -1) return;
        const msg = hist[idx];
        if (msg.userId !== session.userId) return;
        const { censored } = censorText(newText);
        msg.text = censored;
        msg.edited = true;
        io.to(targetRoom).emit('chatMessageEdited', { msgId, newText: censored });
    });
}

module.exports = {
    setupChatHandlers,
    cleanChatHistory,
    invalidateChatState,
    chatUserState,
    clearChatCleanupInterval
};
