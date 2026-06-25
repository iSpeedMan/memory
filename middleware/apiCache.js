const redis = require('../services/redis');

const _store = new Map();
const REDIS_PREFIX = 'metro:api:';
const MAX_L1_SIZE = 500;

/**
 * Двухуровневый кэш: L1 = память (LRU, макс 500 записей), L2 = Redis.
 * При наличии Redis все данные синхронизируются между инстансами.
 */

function _evictExpiredL1() {
    const now = Date.now();
    for (const [key, entry] of _store) {
        if (now > entry.expiresAt) _store.delete(key);
    }
}

function _enforceL1Limit() {
    if (_store.size <= MAX_L1_SIZE) return;
    // Удаляем самую старую запись (Map итерируется в порядке вставки)
    const firstKey = _store.keys().next().value;
    if (firstKey !== undefined) _store.delete(firstKey);
}

// Периодически чистим просроченные L1-записи, которые никто не запрашивает
const _l1CleanupInterval = setInterval(_evictExpiredL1, 60_000);
if (_l1CleanupInterval.unref) _l1CleanupInterval.unref();

async function get(key) {
    const entry = _store.get(key);
    if (entry) {
        if (Date.now() <= entry.expiresAt) {
            // Освежаем позицию (LRU: удаляем и вставляем заново)
            _store.delete(key);
            _store.set(key, entry);
            return entry.data;
        }
        _store.delete(key);
    }

    if (redis.isAvailable) {
        const raw = await redis.get(REDIS_PREFIX + key);
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                _setL1(key, parsed, 60_000);
                return parsed;
            } catch (_) {}
        }
    }

    return null;
}

function _setL1(key, data, ttlMs) {
    _store.delete(key); // убираем старую позицию (LRU order)
    _store.set(key, { data, expiresAt: Date.now() + ttlMs });
    _enforceL1Limit();
}

async function set(key, data, ttlMs) {
    _setL1(key, data, ttlMs);
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
