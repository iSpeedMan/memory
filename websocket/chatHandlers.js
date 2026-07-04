const db = require('../db');
const { wsRateLimit } = require('../middleware/wsRateLimit');
const redis = require('../services/redis');
const PROFANITY_WORDS = require('../config/profanity');
const logger = require('../utils/logger');

const chatHistory = new Map();
const CHAT_HISTORY_MAX = 20;
const CHAT_RATE_MS = 800;
const CHAT_MAX_LEN = 100;
const LOBBY_HISTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REDIS_LOBBY_TTL = 24 * 60 * 60;
const REDIS_ROOM_TTL  = 60 * 60;

// ── chatUserState: кэш с TTL и ограничением размера (защита от утечки памяти) ─
// Записи хранят _ts (timestamp загрузки). Через 30 мин данные устаревают и
// перечитываются из БД. Максимум 5000 записей — при переполнении вытесняется
// старейшая (FIFO, Map гарантирует порядок вставки).
const chatUserState = new Map();
const CHAT_STATE_TTL     = 30 * 60 * 1000; // 30 минут
const CHAT_STATE_MAX     = 5000;

const profanityPatterns = PROFANITY_WORDS.map(word =>
    word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
);

function redisChatKey(roomId) {
    return `metro:chat:${roomId}`;
}

function redisChatTtl(roomId) {
    return roomId === 'lobby' ? REDIS_LOBBY_TTL : REDIS_ROOM_TTL;
}

function censorText(text) {
    let censored = text;
    let hasProfanity = false;
    for (const pattern of profanityPatterns) {
        const re = new RegExp(pattern, 'gi');
        if (re.test(censored)) {
            hasProfanity = true;
            censored = censored.replace(new RegExp(pattern, 'gi'), m => '*'.repeat(m.length));
        }
    }
    return { censored, hasProfanity };
}

/**
 * Возвращает состояние пользователя из кэша или БД.
 * Кэш истекает через CHAT_STATE_TTL; при переполнении вытесняется старейший.
 */
function getChatUserState(userId) {
    const cached = chatUserState.get(userId);
    if (cached && Date.now() - cached._ts < CHAT_STATE_TTL) {
        return Promise.resolve(cached);
    }
    return new Promise((resolve) => {
        db.get('SELECT chat_violations, chat_muted_until, chat_disabled FROM users WHERE id = ?', [userId], (err, row) => {
            const state = {
                violations:  row?.chat_violations  || 0,
                mutedUntil:  row?.chat_muted_until || 0,
                chatDisabled: row?.chat_disabled === 1,
                _ts: Date.now()
            };
            // LRU eviction: удаляем первую (самую старую) запись если Map переполнен
            if (chatUserState.size >= CHAT_STATE_MAX) {
                chatUserState.delete(chatUserState.keys().next().value);
            }
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

function getSocketRoom(socket) {
    return Array.from(socket.rooms).find(r => r.startsWith('room_') || r.startsWith('botRoom_')) || 'lobby';
}

function generateMsgId() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function applyProfanityPenalty(socket, session, userState, now) {
    const userId = session.userId;
    userState.violations++;
    userState._ts = Date.now();
    chatUserState.set(userId, userState);

    if (userState.violations >= 6) {
        const mutedUntil = now + 24 * 60 * 60 * 1000;
        userState.mutedUntil = mutedUntil;
        db.run('UPDATE users SET chat_violations = ?, chat_muted_until = ? WHERE id = ?',
            [userState.violations, mutedUntil, userId]);
        socket.emit('chatMuted', { mutedUntil, remainingMinutes: 1440, isBanned: true });
        return true;
    }

    db.run('UPDATE users SET chat_violations = ? WHERE id = ?', [userState.violations, userId]);
    if (userState.violations >= 3) {
        socket.emit('chatWarning', { violations: userState.violations, maxBeforeBan: 6 });
    }
    return false;
}

function setupChatHandlers(io, socket, session) {
    let lastChatTime = 0;

    async function onSendChat(payload) {
        if (!payload || typeof payload.text !== 'string') return;
        const text = payload.text.trim().substring(0, CHAT_MAX_LEN);
        if (!text) return;
        const now = Date.now();
        if (now - lastChatTime < CHAT_RATE_MS) return;
        lastChatTime = now;

        const userId   = session.userId;
        const username = session.username || 'Anonymous';
        const avatar   = session.avatar || '😶';

        try {
            const userState = await getChatUserState(userId);

            if (userState.chatDisabled) return;
            if (userState.mutedUntil > now) {
                socket.emit('chatMuted', { mutedUntil: userState.mutedUntil, remainingMinutes: Math.ceil((userState.mutedUntil - now) / 60000) });
                return;
            }

            const { censored, hasProfanity } = censorText(text);
            if (hasProfanity && applyProfanityPenalty(socket, session, userState, now)) return;

            const targetRoom = getSocketRoom(socket);
            const msg = { id: generateMsgId(), userId, username, avatar, text: censored, ts: now };
            addToChatHistory(targetRoom, msg);
            io.to(targetRoom).emit('chatMessage', msg);
        } catch (e) {
            logger.error({ err: e }, 'sendChat error');
        }
    }

    async function onGetChatHistory(payload) {
        if (!wsRateLimit(session.userId, 'getChatHistory', 5, 10000)) return;
        let targetRoom = getSocketRoom(socket);
        if (payload && typeof payload.room === 'string') {
            const requested = payload.room;
            if (requested === 'lobby' || socket.rooms.has(requested)) targetRoom = requested;
        }
        const messages = await getChatHistoryData(targetRoom);
        socket.emit('chatHistory', { room: targetRoom, messages });
    }

    function onDeleteChatMessage(payload) {
        if (!wsRateLimit(session.userId, 'deleteChatMessage', 5, 10000)) return;
        if (!payload || typeof payload.msgId !== 'string') return;
        const { msgId } = payload;
        const targetRoom = getSocketRoom(socket);
        const hist = chatHistory.get(targetRoom);
        if (!hist) return;
        const idx = hist.findIndex(m => m.id === msgId);
        if (idx === -1) return;
        const msg = hist[idx];
        db.get('SELECT is_admin FROM users WHERE id = ?', [session.userId], (err, row) => {
            if (msg.userId !== session.userId && !(row && row.is_admin === 1)) return;
            hist.splice(idx, 1);
            io.to(targetRoom).emit('chatMessageDeleted', { msgId });
        });
    }

    function onEditChatMessage(payload) {
        if (!wsRateLimit(session.userId, 'editChatMessage', 10, 10000)) return;
        if (!payload || typeof payload.msgId !== 'string' || typeof payload.newText !== 'string') return;
        const { msgId } = payload;
        const newText = payload.newText.trim().substring(0, CHAT_MAX_LEN);
        if (!newText) return;
        const targetRoom = getSocketRoom(socket);
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
    }

    socket.on('sendChat', onSendChat);
    socket.on('getChatHistory', onGetChatHistory);
    socket.on('deleteChatMessage', onDeleteChatMessage);
    socket.on('editChatMessage', onEditChatMessage);
}

module.exports = {
    setupChatHandlers,
    cleanChatHistory,
    invalidateChatState,
    chatUserState,
    clearChatCleanupInterval
};
