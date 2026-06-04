const db = require('../db');
const PROFANITY_WORDS = require('../config/profanity');

const chatHistory = new Map();
const CHAT_HISTORY_MAX = 20;
const CHAT_RATE_MS = 800;
const CHAT_MAX_LEN = 100;
const LOBBY_HISTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const chatUserState = new Map();

const profanityRegexes = PROFANITY_WORDS.map(word => ({
    word,
    re: new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
}));

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
}

function cleanChatHistory(roomId) {
    chatHistory.delete(roomId);
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
}

module.exports = {
    setupChatHandlers,
    cleanChatHistory,
    invalidateChatState,
    chatUserState,
    clearChatCleanupInterval
};
