const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../db');
const { getLang } = require('../middleware/auth');
const { authLimiter, registerLimiter } = require('../middleware/rateLimit');
const { sendMail } = require('../services/mailService');
const { escHtml } = require('../utils/helpers');
const i18n = require('../public/i18n.js');
const conf = require('../conf');

const router = express.Router();

const usernameRegex = /^[a-zA-Zа-яА-Я0-9 _-]{3,32}$/; // разрешаем буквы, цифры, пробел, _, -

function isValidUsername(name) {
    return usernameRegex.test(name);
}

// forgot-password
router.post('/forgot-password', authLimiter, (req, res) => {
    const { email } = req.body;
    db.get('SELECT id, username, language FROM users WHERE email = ?', [email], (err, user) => {
        if (err || !user) return res.json({ success: true });
        const token = crypto.randomBytes(20).toString('hex');
        const expires = Date.now() + 3600000;
        db.run('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?', [token, expires, user.id], (err) => {
            if (!err) {
                const protocol = req.headers['x-forwarded-proto'] || 'http';
                const resetLink = `${protocol}://${req.headers.host}/?reset=${token}`;
                const userLang = user.language && user.language !== 'auto' ? user.language : getLang(req);
                const html = `
                    <div style="font-family: 'Segoe UI', sans-serif; background: #000; color: #fff; padding: 20px;">
                        <h2 style="color: #1ba1e2;">${i18n.t('mail_hello', userLang)}, ${escHtml(user.username)}!</h2>
                        <p>${i18n.t('mail_desc', userLang)}</p>
                        <p>${i18n.t('mail_link_text', userLang)}</p>
                        <div style="margin: 20px 0;">
                            <a href="${resetLink}" style="padding: 12px 24px; background: #1ba1e2; color: #ffffff; text-decoration: none; display: inline-block; font-weight: bold;">
                                ${i18n.t('mail_btn', userLang)}
                            </a>
                        </div>
                        <p style="color: #999; font-size: 0.9em;">${i18n.t('mail_ignore', userLang)}</p>
                    </div>
                `;
                sendMail({
                    from: conf.mail.from,
                    to: email,
                    subject: i18n.t('mail_subject', userLang),
                    html
                }).catch(err => console.error('Email error:', err));
            }
            res.json({ success: true });
        });
    });
});

// reset-password
router.post('/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    db.get('SELECT id FROM users WHERE reset_token = ? AND reset_expires > ?', [token, Date.now()], async (err, user) => {
        if (err || !user) return res.status(400).json({ error: i18n.t('token_expired', getLang(req)) });
        const hash = await bcrypt.hash(newPassword, 10);
        db.run('UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?', [hash, user.id], (err) => {
            res.json(err ? { error: i18n.t('saving_error', getLang(req)) } : { success: true });
        });
    });
});

// register
router.post('/register', registerLimiter, async (req, res) => {
    const { username, password, email } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: i18n.t('please_fill_in_the_required_fields', getLang(req)) });
    }
    if (!isValidUsername(username)) {
        return res.status(400).json({ error: 'Invalid username (only letters, numbers, spaces, _ and -, 3-32 chars)' });
    }
    db.get("SELECT COUNT(*) as count FROM users", async (err, row) => {
        const isAdminVal = (row && row.count === 0) ? 1 : 0;
        try {
            const hash = await bcrypt.hash(password, 10);
            db.run('INSERT INTO users (username, password, email, is_admin, avatar) VALUES (?, ?, ?, ?, ?)',
                [username, hash, email || null, isAdminVal, '😶'],
                function(err) {
                    if (err) return res.status(400).json({ error: i18n.t('login_is_busy', getLang(req)) });
                    req.session.userId = this.lastID;
                    req.session.username = username;
                    req.session.avatar = '😶';
                    res.json({ success: true, username, avatar: '😶', isAdmin: isAdminVal === 1 });
                });
        } catch (e) {
            res.status(500).json({ error: i18n.t('server_error', getLang(req)) });
        }
    });
});

// login
router.post('/login', authLimiter, (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, row) => {
        if (err || !row || !(await bcrypt.compare(password, row.password))) {
            return res.status(400).json({ error: i18n.t('login_error', getLang(req)) });
        }
        req.session.userId = row.id;
        req.session.username = row.username;
        req.session.avatar = row.avatar || '😶';
        res.json({ success: true, username: row.username, avatar: req.session.avatar, isAdmin: row.is_admin === 1 });
    });
});

// logout
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// session info
router.get('/session', (req, res) => {
    if (!req.session.userId) return res.json({ loggedIn: false });
    db.get('SELECT is_admin, avatar FROM users WHERE id = ?', [req.session.userId], (err, row) => {
        res.json({
            loggedIn: true,
            username: req.session.username,
            avatar: req.session.avatar || '😶',
            isAdmin: row?.is_admin === 1
        });
    });
});

// profile GET
router.get('/profile', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: i18n.t('not_authorized', getLang(req)) });
    db.get('SELECT email, avatar, theme, language FROM users WHERE id = ?', [req.session.userId], (err, user) => {
        db.all(`SELECT category, card_value, MAX(matches) as max_matches FROM user_card_stats WHERE user_id = ? GROUP BY category`,
            [req.session.userId], (err, stats) => {
                res.json({
                    email: user?.email || '',
                    avatar: user?.avatar || '😶',
                    theme: user?.theme || 'dark',
                    language: user?.language || 'auto',
                    topCards: stats || []
                });
            });
    });
});

// profile PUT
router.post('/profile', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: i18n.t('not_authorized', getLang(req)) });
    const { email, newPassword, avatar, theme, language } = req.body;
    let query = 'UPDATE users SET email = ?, avatar = ?, theme = ?, language = ?';
    let params = [email, avatar || '😶', theme || 'dark', language || 'auto'];
    if (newPassword) {
        query += ', password = ?';
        params.push(await bcrypt.hash(newPassword, 10));
    }
    query += ' WHERE id = ?';
    params.push(req.session.userId);
    db.run(query, params, (err) => {
        if (!err) {
            req.session.avatar = avatar || '😶';
            req.session.theme = theme || 'dark';
            req.session.language = language || 'auto';
        }
        res.json(err ? { error: i18n.t('saving_error', getLang(req)) } : { success: true, avatar: req.session.avatar, theme: req.session.theme, language: req.session.language });
    });
});

module.exports = router;