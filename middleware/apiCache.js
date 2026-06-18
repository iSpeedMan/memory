const redis = require('../services/redis');

const _store = new Map();
const REDIS_PREFIX = 'metro:api:';

/**
 * Двухуровневый кэш: L1 = память (мгновенно), L2 = Redis (общий между инстансами).
 * При наличии Redis все данные синхронизируются между процессами.
 */

async function get(key) {
    // L1: in-memory (быстро, не нужен await)
    const entry = _store.get(key);
    if (entry) {
        if (Date.now() <= entry.expiresAt) return entry.data;
        _store.delete(key);
    }

    // L2: Redis (общий кэш)
    if (redis.isAvailable) {
        const raw = await redis.get(REDIS_PREFIX + key);
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                // Прогреваем L1 на 60 сек (TTL уже управляется Redis)
                _store.set(key, { data: parsed, expiresAt: Date.now() + 60_000 });
                return parsed;
            } catch (_) {}
        }
    }

    return null;
}

async function set(key, data, ttlMs) {
    _store.set(key, { data, expiresAt: Date.now() + ttlMs });
    if (redis.isAvailable) {
        const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
        redis.setEx(REDIS_PREFIX + key, ttlSec, JSON.stringify(data)).catch(() => {});
    }
}

function invalidate(...keys) {
    for (const k of keys) {
        _store.delete(k);
        if (redis.isAvailable) {
            redis.del(REDIS_PREFIX + k).catch(() => {});
        }
    }
}

/**
 * Express-middleware: проверяет кэш перед обработкой, сохраняет ответ в кэш.
 */
function middleware(key, ttlMs) {
    return async (req, res, next) => {
        try {
            const cached = await get(key);
            if (cached !== null) return res.json(cached);
        } catch (_) {}

        const origJson = res.json.bind(res);
        res.json = (data) => {
            if (res.statusCode < 300) set(key, data, ttlMs).catch(() => {});
            return origJson(data);
        };
        next();
    };
}

module.exports = { get, set, invalidate, middleware };
