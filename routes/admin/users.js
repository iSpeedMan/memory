const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../../db');
const { isAdmin, getLang } = require('../../middleware/auth');
const cache = require('../../middleware/apiCache');
const i18n = require('../../public/js/i18n.js');

const router = express.Router();

const usernameRegex = /^(?=.*[a-zA-Zа-яА-ЯёЁ0-9])[a-zA-Zа-яА-ЯёЁ0-9_-]{3,32}$/;

function isValidUsername(name) {
    return typeof name === 'string' && usernameRegex.test(name);
}

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

router.get('/users', isAdmin, cache.middleware('admin:users', 15000), (req, res) => {
    db.all('SELECT id, username, email, is_admin, chat_muted_until, chat_violations, COALESCE(coins, 0) as coins FROM users',
        (err, rows) => res.json(err ? [] : rows));
});

router.post('/users', isAdmin, async (req, res) => {
    const { username, email, password, is_admin } = req.body;
    const lang = getLang(req);
    if (!username || !password) {
        return res.status(400).json({ error: i18n.t('please_fill_in_the_required_fields', lang) });
    }
    if (!isValidUsername(username)) {
        return res.status(400).json({ error: i18n.t('username_invalid', lang) });
    }
    try {
        const hash = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (username, password, email, is_admin, avatar) VALUES (?, ?, ?, ?, ?)',
            [username, hash, email || null, is_admin ? 1 : 0, '😶'],
            (err) => { cache.invalidate('admin:users', 'admin:stats'); res.json(err ? { error: i18n.t('login_is_busy', lang) } : { success: true }); });
    } catch (e) {
        res.status(500).json({ error: i18n.t('server_error', lang) });
    }
});

router.put('/users/:id', isAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: i18n.t('invalid_id', getLang(req)) });
    const { username, email, password, is_admin } = req.body;
    const lang = getLang(req);
    if (!username) return res.status(400).json({ error: i18n.t('please_fill_in_the_required_fields', lang) });
    if (!isValidUsername(username)) return res.status(400).json({ error: i18n.t('username_invalid', lang) });
    let query = 'UPDATE users SET username = ?, email = ?, is_admin = ?';
    let params = [username, email || null, is_admin ? 1 : 0];
    try {
        if (password) {
            query += ', password = ?';
            params.push(await bcrypt.hash(password, 10));
        }
    } catch (e) {
        return res.status(500).json({ error: i18n.t('server_error', lang) });
    }
    query += ' WHERE id = ?';
    params.push(id);
    db.run(query, params, (err) => { cache.invalidate('admin:users', 'admin:stats'); res.json(err ? { error: i18n.t('login_busy_or_database_error', lang) } : { success: true }); });
});

router.delete('/users/:id', isAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: i18n.t('invalid_id', getLang(req)) });
    const currentUserId = req.session.userId;
    const lang = getLang(req);

    if (String(currentUserId) === String(id)) {
        return res.status(400).json({ error: i18n.t('you_cant_delete_yourself', lang) });
    }

    db.get('SELECT username FROM users WHERE id = ?', [id], async (err, user) => {
        if (err || !user) return res.status(404).json({ error: i18n.t('user_not_found', lang) });

        try {
            await dbRun('BEGIN');
            await dbRun('DELETE FROM leaderboard WHERE username = ?', [user.username]);
            await dbRun('DELETE FROM user_card_stats WHERE user_id = ?', [id]);
            await dbRun('DELETE FROM game_history WHERE player1_id = ? OR player2_id = ?', [id, id]);
            await dbRun('DELETE FROM user_achievements WHERE user_id = ?', [id]);
            const result = await dbRun('DELETE FROM users WHERE id = ?', [id]);
            if (result.changes === 0) {
                await dbRun('ROLLBACK');
                return res.status(404).json({ error: i18n.t('user_not_found', lang) });
            }
            await dbRun('COMMIT');
            cache.invalidate('admin:users', 'admin:stats');
            res.json({ success: true });
        } catch (e) {
            try { await dbRun('ROLLBACK'); } catch (_) {}
            res.status(500).json({ error: i18n.t('database_error', lang) });
        }
    });
});

router.post('/users/:id/mute-chat', isAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: i18n.t('invalid_id', getLang(req)) });
    const mutedUntil = Date.now() + 24 * 60 * 60 * 1000;
    db.run('UPDATE users SET chat_muted_until = ?, chat_violations = 6 WHERE id = ?',
        [mutedUntil, id], (err) => {
            if (!err) {
                const ws = require('../../websocket');
                ws.invalidateChatState(id);
                ws.emitToUser(id, 'chatMuted', { mutedUntil, remainingMinutes: 1440, isBanned: true });
            }
            if (!err) cache.invalidate('admin:users');
            res.json(err ? { error: i18n.t('database_error', getLang(req)) } : { success: true, mutedUntil });
        });
});

router.post('/users/:id/unmute-chat', isAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: i18n.t('invalid_id', getLang(req)) });
    db.run('UPDATE users SET chat_muted_until = 0, chat_violations = 0 WHERE id = ?', [id], (err) => {
        if (!err) {
            const ws = require('../../websocket');
            ws.invalidateChatState(id);
            ws.emitToUser(id, 'chatUnmuted', {});
        }
        if (!err) cache.invalidate('admin:users');
        res.json(err ? { error: i18n.t('database_error', getLang(req)) } : { success: true });
    });
});

module.exports = router;
