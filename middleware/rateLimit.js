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
        require('../utils/logger').warn({ err }, '[RateLimit] Redis store failed, using in-memory');
        return undefined;
    }
}

function rateLimitHandler(req, res, next, options) {
    const retryAfter = Math.ceil(options.windowMs / 1000 / 60);
    res.set('Retry-After', String(retryAfter * 60));
    res.status(options.statusCode).json({
        error: options.message?.error || 'Too many requests',
        retryAfterMinutes: retryAfter
    });
}

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeRedisStore('auth'),
    message: { error: 'Too many failed attempts, please try again later' },
    handler: rateLimitHandler
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeRedisStore('reg'),
    message: { error: 'Too many registrations, please try again later' },
    handler: rateLimitHandler
});

const suggestLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeRedisStore('suggest'),
    message: { error: 'Too many suggestions, please try again later' },
    handler: rateLimitHandler
});

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeRedisStore('api'),
    message: { error: 'Too many requests, please slow down' },
    handler: rateLimitHandler,
    skip: (req) => req.path === '/health' || req.path === '/api/csrf'
});

module.exports = { authLimiter, registerLimiter, suggestLimiter, apiLimiter };
