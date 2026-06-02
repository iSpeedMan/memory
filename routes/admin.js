const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { isAdmin, getLang } = require('../middleware/auth');
const i18n = require('../public/i18n.js');

const router = express.Router();

// Match auth.js regex (requires at least one alphanumeric)
const usernameRegex = /^(?=.*[a-zA-Zа-яА-ЯёЁ0-9])[a-zA-Zа-яА-ЯёЁ0-9_-]{3,32}$/;
const categoryKeyRegex = /^[a-zA-Z0-9_-]{1,30}$/;

function isValidUsername(name) {
    return typeof name === 'string' && usernameRegex.test(name);
}

function parseEmojiList(emojis) {
    if (typeof emojis !== 'string') return null;
    const emojiArray = emojis.split(',').map(e => e.trim()).filter(Boolean);
    // Accept 18 to 32 emojis
    return emojiArray.length >= 18 && emojiArray.length <= 32 ? emojiArray : null;
}

// ============ CATEGORIES ============
router.get('/categories', isAdmin, (req, res) => {
    db.all('SELECT * FROM categories', (err, rows) => res.json(err ? [] : rows));
});

router.post('/categories', isAdmin, (req, res) => {
    const { key_name, display_name, emojis } = req.body;
    if (!categoryKeyRegex.test(key_name || '') || typeof display_name !== 'string' || !display_name.trim()) {
        return res.status(400).json({ error: i18n.t('please_fill_in_the_required_fields', getLang(req)) });
    }
    const emojiArray = parseEmojiList(emojis);
    if (!emojiArray) return res.status(400).json({ error: i18n.t('exactly_18_emojis', getLang(req)) });
    db.run('INSERT INTO categories (key_name, display_name, emojis) VALUES (?, ?, ?)',
        [key_name, display_name.trim(), emojiArray.join(',')],
        (err) => res.json(err ? { error: i18n.t('key_exists', getLang(req)) } : { success: true }));
});

router.put('/categories/:id', isAdmin, (req, res) => {
    const { display_name, emojis } = req.body;
    if (typeof display_name !== 'string' || !display_name.trim()) {
        return res.status(400).json({ error: i18n.t('please_fill_in_the_required_fields', getLang(req)) });
    }
    const emojiArray = parseEmojiList(emojis);
    if (!emojiArray) return res.status(400).json({ error: i18n.t('exactly_18_emojis', getLang(req)) });
    db.run('UPDATE categories SET display_name = ?, emojis = ? WHERE id = ?',
        [display_name.trim(), emojiArray.join(','), req.params.id],
        (err) => res.json(err ? { error: i18n.t('database_error', getLang(req)) } : { success: true }));
});

router.delete('/categories/:id', isAdmin, (req, res) => {
    db.run('DELETE FROM categories WHERE id = ?', [req.params.id],
        (err) => res.json(err ? { error: i18n.t('error_deleting', getLang(req)) } : { success: true }));
});

// ============ CUSTOM CATEGORIES (USER SUBMITTED) ============
router.get('/custom-categories', isAdmin, (req, res) => {
    const status = req.query.status;
    if (status && status !== 'all') {
        db.all('SELECT * FROM user_categories WHERE status = ? ORDER BY submitted_at DESC', [status],
            (err, rows) => res.json(err ? [] : rows));
    } else {
        db.all('SELECT * FROM user_categories ORDER BY submitted_at DESC',
            (err, rows) => res.json(err ? [] : rows));
    }
});

router.post('/custom-categories/:id/approve', isAdmin, (req, res) => {
    const id = req.params.id;
    const lang = getLang(req);
    db.get('SELECT * FROM user_categories WHERE id = ? AND status = ?', [id, 'pending'], (err, row) => {
        if (err || !row) return res.status(404).json({ error: i18n.t('user_not_found', lang) });
        // Add to main categories table
        db.run('INSERT OR IGNORE INTO categories (key_name, display_name, emojis) VALUES (?, ?, ?)',
            [row.key_name, row.display_name, row.emojis],
            (err2) => {
                if (err2) return res.status(500).json({ error: i18n.t('database_error', lang) });
                db.run('UPDATE user_categories SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?',
                    ['approved', req.session.userId, id],
                    (err3) => res.json(err3 ? { error: i18n.t('database_error', lang) } : { success: true }));
            }
        );
    });
});

router.post('/custom-categories/:id/reject', isAdmin, (req, res) => {
    const id = req.params.id;
    const lang = getLang(req);
    db.run('UPDATE user_categories SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['rejected', req.session.userId, id],
        (err) => res.json(err ? { error: i18n.t('database_error', lang) } : { success: true }));
});

// ============ USERS ============
router.get('/users', isAdmin, (req, res) => {
    db.all('SELECT id, username, email, is_admin FROM users', (err, rows) => res.json(err ? [] : rows));
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
            (err) => res.json(err ? { error: i18n.t('login_is_busy', lang) } : { success: true }));
    } catch (e) {
        res.status(500).json({ error: i18n.t('server_error', lang) });
    }
});

router.put('/users/:id', isAdmin, async (req, res) => {
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
    params.push(req.params.id);
    db.run(query, params, (err) => res.json(err
        ? { error: i18n.t('login_busy_or_database_error', lang) }
        : { success: true }));
});

router.delete('/users/:id', isAdmin, (req, res) => {
    const targetUserId = req.params.id;
    const currentUserId = req.session.userId;
    const lang = getLang(req);
    if (String(currentUserId) === String(targetUserId)) {
        return res.status(400).json({ error: i18n.t('you_cant_delete_yourself', lang) });
    }
    db.get('SELECT username FROM users WHERE id = ?', [targetUserId], (err, user) => {
        if (err || !user) return res.status(404).json({ error: i18n.t('user_not_found', lang) });
        db.run('BEGIN', (beginErr) => {
            if (beginErr) return res.status(500).json({ error: i18n.t('database_error', lang) });
            db.run('DELETE FROM leaderboard WHERE username = ?', [user.username], (err1) => {
                if (err1) { db.run('ROLLBACK'); return res.status(500).json({ error: i18n.t('database_error', lang) }); }
                db.run('DELETE FROM user_card_stats WHERE user_id = ?', [targetUserId], (err2) => {
                    if (err2) { db.run('ROLLBACK'); return res.status(500).json({ error: i18n.t('database_error', lang) }); }
                    db.run('DELETE FROM game_history WHERE player1_id = ? OR player2_id = ?', [targetUserId, targetUserId], (err3) => {
                        if (err3) { db.run('ROLLBACK'); return res.status(500).json({ error: i18n.t('database_error', lang) }); }
                        db.run('DELETE FROM user_achievements WHERE user_id = ?', [targetUserId], (err4) => {
                            if (err4) { db.run('ROLLBACK'); return res.status(500).json({ error: i18n.t('database_error', lang) }); }
                            db.run('DELETE FROM users WHERE id = ?', [targetUserId], function(err5) {
                                if (err5 || this.changes === 0) {
                                    db.run('ROLLBACK');
                                    return res.status(err5 ? 500 : 404).json({ error: i18n.t('database_error', lang) });
                                }
                                db.run('COMMIT', (commitErr) => {
                                    if (commitErr) return res.status(500).json({ error: i18n.t('database_error', lang) });
                                    res.json({ success: true });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// ============ STATS ============
router.get('/stats', isAdmin, (req, res) => {
    const { getOnlineCount } = require('../websocket');
    const { rooms } = require('../services/roomManager');
    const allRooms = Object.values(rooms);
    const activeGames = allRooms.filter(r => r.status === 'playing').length;
    const waitingRooms = allRooms.filter(r => r.status === 'waiting').length;
    const onlineUsers = getOnlineCount();
    const todayQuery = db.type === 'mysql'
        ? 'SELECT COUNT(*) AS count FROM game_history WHERE DATE(played_at) = CURDATE()'
        : "SELECT COUNT(*) AS count FROM game_history WHERE date(played_at) >= date('now', 'start of day')";
    db.get(todayQuery, [], (err1, todayRow) => {
        db.get('SELECT COUNT(*) AS count FROM users', [], (err2, usersRow) => {
            db.get('SELECT COUNT(*) AS count FROM game_history', [], (err3, totalRow) => {
                db.get("SELECT COUNT(*) AS count FROM user_categories WHERE status = 'pending'", [], (err4, pendingRow) => {
                    res.json({
                        onlineUsers, activeGames, waitingRooms,
                        gamesToday: todayRow?.count || 0,
                        totalUsers: usersRow?.count || 0,
                        totalGames: totalRow?.count || 0,
                        pendingCategories: pendingRow?.count || 0
                    });
                });
            });
        });
    });
});

module.exports = router;
