const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const conf = require('./conf');
const db = require('./db'); // для доступа к db.type, но необязательно

if (!process.env.SESSION_SECRET) {
    console.warn('[SECURITY] SESSION_SECRET env var is not set — using hardcoded fallback. Set it in production!');
}

const app = express();

// Trust proxy для корректного определения протокола (если за reverse proxy)
app.set('trust proxy', 1);

// Middleware
app.use(compression()); // GZIP
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Сессии — персистентное хранилище в SQLite (сессии выживают после перезапуска)
const sessionMiddleware = session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: '.' }),
    secret: conf.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 1000 * 60 * 60 * 24 // 1 день
    }
});
app.use(sessionMiddleware);

// Экспортируем middleware, чтобы использовать в Socket.IO
module.exports = { app, sessionMiddleware };

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const leaderboardRoutes = require('./routes/leaderboard');
const categoriesRoutes = require('./routes/categories'); // создадим

app.use('/api', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/categories', categoriesRoutes);

module.exports = { app, sessionMiddleware };