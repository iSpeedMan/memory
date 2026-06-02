const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const helmet = require('helmet');
const compression = require('compression');
const conf = require('./conf');

if (!process.env.SESSION_SECRET) {
    console.warn('[SECURITY] SESSION_SECRET env var is not set — using hardcoded fallback. Set it in production!');
}

const app = express();

app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:     ["'self'"],
            scriptSrc:      ["'self'"],
            styleSrc:       ["'self'"],
            imgSrc:         ["'self'", "data:"],
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

app.use(compression());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sessionMiddleware = session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: '.' }),
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
