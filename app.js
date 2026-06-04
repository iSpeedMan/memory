const express = require('express');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const compression = require('compression');
const conf = require('./conf');
const redis = require('./services/redis');
const { csrfMiddleware, getToken } = require('./middleware/csrf');

const app = express();

app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:     ["'self'"],
            scriptSrc:      ["'self'"],
            styleSrc:       ["'self'"],
            imgSrc:         ["'self'", "data:"],
            connectSrc:     ["'self'", "ws:", "wss:"],
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

app.use(compression());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function createSessionStore() {
    if (redis.isAvailable) {
        try {
            const { RedisStore } = require('connect-redis');
            console.log('[Redis] Using Redis session store');
            return new RedisStore({
                client: redis.client,
                prefix: 'metro:sess:',
                disableTouch: false,
                ttl: 86400
            });
        } catch (err) {
            console.warn('[Redis] Session store setup failed, falling back to SQLite:', err.message);
        }
    }
    const SQLiteStore = require('connect-sqlite3')(session);
    console.log('[Session] Using SQLite session store');
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

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const leaderboardRoutes = require('./routes/leaderboard');
const categoriesRoutes = require('./routes/categories');
const userProfileRoutes = require('./routes/userProfile');

app.use('/api', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/user', userProfileRoutes);

module.exports = { app, sessionMiddleware };
