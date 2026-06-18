// Отслеживает незавершённые игры с ботом per-user.
// Незавершённая = создана, но gameOver не получен (игрок вышел досрочно).
// Использует Redis Hash для кросс-инстансовой синхронизации с fallback на память.

const redis = require('./redis');

const botSessions = new Map(); // userId -> { unfinished: number, blockedUntil: number }

const MAX_UNFINISHED = 5;
const BLOCK_DURATION_MS = 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const REDIS_TTL = 300; // 5 минут (сбрасывается при любой активности)
const REDIS_BLOCK_TTL_EXTRA = 120; // запас после окончания блокировки

function _redisKey(userId) {
    return `metro:bot:${userId}`;
}

function _getOrCreate(userId) {
    if (!botSessions.has(userId)) {
        botSessions.set(userId, { unfinished: 0, blockedUntil: 0 });
    }
    return botSessions.get(userId);
}

/**
 * Проверяет, может ли пользователь создать новую бот-комнату.
 * @returns {{ allowed: true } | { allowed: false, remainingSeconds: number }}
 */
async function checkCanCreate(userId) {
    const now = Date.now();

    if (redis.isAvailable) {
        const data = await redis.hGetAll(_redisKey(userId));
        if (data && Object.keys(data).length > 0) {
            let unfinished = parseInt(data.unfinished || '0', 10);
            let blockedUntil = parseInt(data.blockedUntil || '0', 10);

            // Блок истёк — сбрасываем
            if (blockedUntil > 0 && now >= blockedUntil) {
                unfinished = 0;
                blockedUntil = 0;
                await redis.hSet(_redisKey(userId), 'unfinished', '0', 'blockedUntil', '0');
                await redis.expire(_redisKey(userId), REDIS_TTL);
            }

            if (now < blockedUntil) {
                return { allowed: false, remainingSeconds: Math.ceil((blockedUntil - now) / 1000) };
            }

            if (unfinished >= MAX_UNFINISHED) {
                const newBlockedUntil = now + BLOCK_DURATION_MS;
                await redis.hSet(
                    _redisKey(userId),
                    'unfinished', '0',
                    'blockedUntil', String(newBlockedUntil)
                );
                await redis.expire(_redisKey(userId), Math.ceil(BLOCK_DURATION_MS / 1000) + REDIS_BLOCK_TTL_EXTRA);
                return { allowed: false, remainingSeconds: 60 };
            }

            return { allowed: true };
        }
    }

    // Fallback: in-memory
    const info = _getOrCreate(userId);

    if (info.blockedUntil > 0 && now >= info.blockedUntil) {
        info.unfinished = 0;
        info.blockedUntil = 0;
    }

    if (now < info.blockedUntil) {
        return { allowed: false, remainingSeconds: Math.ceil((info.blockedUntil - now) / 1000) };
    }

    if (info.unfinished >= MAX_UNFINISHED) {
        info.blockedUntil = now + BLOCK_DURATION_MS;
        info.unfinished = 0;
        return { allowed: false, remainingSeconds: 60 };
    }

    return { allowed: true };
}

/**
 * Вызывается при создании бот-комнаты.
 */
async function markCreated(userId) {
    if (redis.isAvailable) {
        const key = _redisKey(userId);
        await redis.hIncrBy(key, 'unfinished', 1);
        const bu = await redis.hGet(key, 'blockedUntil');
        if (bu === null) await redis.hSet(key, 'blockedUntil', '0');
        await redis.expire(key, REDIS_TTL);
        return;
    }
    _getOrCreate(userId).unfinished++;
}

/**
 * Вызывается при нормальном завершении бот-игры (gameOver).
 */
async function markFinished(userId) {
    if (redis.isAvailable) {
        const key = _redisKey(userId);
        const current = await redis.hGet(key, 'unfinished');
        if (current !== null && parseInt(current, 10) > 0) {
            await redis.hIncrBy(key, 'unfinished', -1);
            await redis.expire(key, REDIS_TTL);
        }
        return;
    }
    const info = botSessions.get(userId);
    if (info && info.unfinished > 0) info.unfinished--;
}

// Периодическая очистка in-memory (Redis TTL управляет собой сам)
const _cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [userId, info] of botSessions) {
        if (info.unfinished === 0 && now >= info.blockedUntil) {
            botSessions.delete(userId);
        }
    }
}, CLEANUP_INTERVAL_MS);

function clearCleanupTimer() {
    clearInterval(_cleanupTimer);
}

module.exports = { checkCanCreate, markCreated, markFinished, clearCleanupTimer };
