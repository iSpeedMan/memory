const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const helmet = require('helmet');
const compression = require('compression');
const conf = require('./conf');
const redis = require('./services/redis');
const { csrfMiddleware, getToken } = require('./middleware/csrf');
const { apiLimiter } = require('./middleware/rateLimit');
const logger = require('./utils/logger');

const crypto = require('crypto');

const app = express();

app.set('trust proxy', 1);

app.use((req, res, next) => {
    req.id = crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
});

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:     ["'self'"],
            scriptSrc:      ["'self'"],
            styleSrc:       ["'self'"],
            imgSrc:         ["'self'", "data:", "blob:"],
            connectSrc:     ["'self'"],
            mediaSrc:       ["'self'"],
            fontSrc:        ["'self'"],
            objectSrc:      ["'none'"],
            frameAncestors: ["'none'"],
            baseUri:        ["'self'"],
            workerSrc:      ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// Агрессивное сжатие: всё что больше 1KB, включая JSON и текст
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));

app.use(express.json({ limit: '64kb' }));

// Отдаём dist/ если он существует — иначе public/
const distDir   = path.join(__dirname, 'dist');
const publicDir = path.join(__dirname, 'public');
const staticDir = fs.existsSync(distDir) ? distDir : publicDir;
if (staticDir === distDir) logger.info('[Static] Serving optimised build from dist/');

/**
 * Умные заголовки кэша:
 * - Хэшированные файлы (*.min.js, *.min.css) → immutable, 1 год
 * - HTML                                       → no-cache (всегда свежий)
 * - Звуки и изображения                        → 7 дней
 * - Всё остальное                              → 1 час
 */
function setStaticCacheHeaders(res, filePath) {
    const name = path.basename(filePath);
    if (/\.[a-f0-9]{8}\.min\.(js|css)$/.test(name)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (/\.html?$/.test(name)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
    } else if (/\.(mp3|ogg|wav)$/.test(name)) {
        res.setHeader('Cache-Control', 'public, max-age=604800');
    } else if (/\.(png|ico|webp|svg|jpg|jpeg|gif)$/.test(name)) {
        res.setHeader('Cache-Control', 'public, max-age=604800');
    } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
    }
}

app.use(express.static(staticDir, { setHeaders: setStaticCacheHeaders }));

app.use('/api', apiLimiter);

function createSessionStore() {
    if (redis.isAvailable) {
        try {
            const { RedisStore } = require('connect-redis');
            logger.info('[Redis] Using Redis session store');
            return new RedisStore({
                client: redis.client,
                prefix: 'metro:sess:',
                disableTouch: false,
                ttl: 86400
            });
        } catch (err) {
            logger.warn({ err }, '[Redis] Session store setup failed, falling back to SQLite');
        }
    }
    const SQLiteStore = require('connect-sqlite3')(session);
    logger.info('[Session] Using SQLite session store');
    return new SQLiteStore({ db: 'sessions.sqlite', dir: '.' });
}

const sessionMiddleware = session({
    store: createSessionStore(),
    secret: conf.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 1000 * 60 * 60 * 24
    }
});
app.use(sessionMiddleware);

app.use(csrfMiddleware);

app.get('/api/csrf', (req, res) => {
    res.json({ token: getToken(req) });
});

const authRoutes        = require('./routes/auth');
const adminRoutes       = require('./routes/admin');
const leaderboardRoutes = require('./routes/leaderboard');
const categoriesRoutes  = require('./routes/categories');
const userProfileRoutes = require('./routes/userProfile');
const friendsRoutes       = require('./routes/friends');
const announcementsRoutes = require('./routes/announcements');

const swaggerUi   = require('swagger-ui-express');
const swaggerSpec = require('./docs/swagger');
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Metro Memory API Docs',
    swaggerOptions: { persistAuthorization: true },
}));
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

app.use('/api', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/user', userProfileRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/announcements', announcementsRoutes);

app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    logger.error({ err, reqId: req.id, method: req.method, url: req.url }, 'Unhandled request error');
    if (res.headersSent) return next(err);
    res.status(status).json({ error: status < 500 ? err.message : 'Internal server error' });
});

module.exports = { app, sessionMiddleware };
