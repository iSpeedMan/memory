const rateLimit = require('express-rate-limit');
const redis = require('../services/redis');

function makeRedisStore(prefix) {
    if (!redis.isAvailable) return undefined;
    try {
        const { RedisStore } = require('rate-limit-redis');
        return new RedisStore({
            sendCommand: (...args) => redis.client.sendCommand(args),
            prefix: `metro:rl:${prefix}:`
        });
    } catch (err) {
        console.warn('[Redis] Rate limiter store failed, using in-memory:', err.message);
        return undefined;
    }
}

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    store: makeRedisStore('auth'),
    skip: () => !redis.isAvailable && false
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { error: 'Too many registrations, please try again later' },
    store: makeRedisStore('reg')
});

const suggestLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { error: 'Too many suggestions, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    store: makeRedisStore('suggest')
});

module.exports = { authLimiter, registerLimiter, suggestLimiter };
