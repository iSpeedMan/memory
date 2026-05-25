const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { isAdmin, getLang } = require('../middleware/auth');
const i18n = require('../public/i18n.js');

const router = express.Router();

const usernameRegex = /^[a-zA-Zа-яА-Я0-9 _-]{3,32}$/; // разрешаем буквы, цифры, пробел, _, -
const categoryKeyRegex = /^[a-zA-Z0-9_-]{1,30}$/;

function isValidUsername(name) {
    return typeof name === 'string' && usernameRegex.test(name);
}

function parseEmojiList(emojis) {
    if (typeof emojis !== 'string') return null;
    const emojiArray = emojis.split(',').map(e => e.trim());
    return emojiArray.length === 18 && emojiArray.every(Boolean) ? emojiArray : null;
}

// categories
router.get('/categories', (req, res) => {
    db.all("SELECT * FROM categories", (err, rows) => res.json(err ? [] : rows));
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
        (err) => err
            ? res.status(400).json({ error: i18n.t('key_exists', getLang(req)) })
            : res.json({ success: true }));
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
        (err) => err
            ? res.status(500).json({ error: i18n.t('database_error', getLang(req)) })
            : res.json({ success: true }));
});

router.delete('/categories/:id', isAdmin, (req, res) => {
    db.run('DELETE FROM categories WHERE id = ?', [req.params.id],
        (err) => res.json(err ? { error: i18n.t('error_deleting', getLang(req)) } : { success: true }));
});

// users
router.get('/users', isAdmin, (req, res) => {
    db.all("SELECT id, username, email, is_admin FROM users", (err, rows) => res.json(err ? [] : rows));
});

router.post('/users', isAdmin, async (req, res) => {
    const { username, email, password, is_admin } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: i18n.t('please_fill_in_the_required_fields', getLang(req)) });
    }
    if (!isValidUsername(username)) {
        return res.status(400).json({ error: 'Invalid username (only letters, numbers, spaces, _ and -, 3-32 chars)' });
    }
    try {
        const hash = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (username, password, email, is_admin, avatar) VALUES (?, ?, ?, ?, ?)',
            [username, hash, email || null, is_admin ? 1 : 0, '😶'],
            (err) => res.json(err ? { error: i18n.t('login_is_busy', getLang(req)) } : { success: true }));
    } catch (e) {
        res.status(500).json({ error: i18n.t('server_error', getLang(req)) });
    }
});

router.put('/users/:id', isAdmin, async (req, res) => {
    const { username, email, password, is_admin } = req.body;
    if (!username) {
        return res.status(400).json({ error: i18n.t('please_fill_in_the_required_fields', getLang(req)) });
    }
    if (!isValidUsername(username)) {
        return res.status(400).json({ error: 'Invalid username (only letters, numbers, spaces, _ and -, 3-32 chars)' });
    }
    let query = 'UPDATE users SET username = ?, email = ?, is_admin = ?';
    let params = [username, email || null, is_admin ? 1 : 0];
    try {
        if (password) {
            query += ', password = ?';
            params.push(await bcrypt.hash(password, 10));
        }
    } catch (e) {
        return res.status(500).json({ error: i18n.t('server_error', getLang(req)) });
    }
    query += ' WHERE id = ?';
    params.push(req.params.id);
    db.run(query, params, (err) => res.json(err ? { error: i18n.t('login_busy_or_database_error', getLang(req)) } : { success: true }));
});

router.delete('/users/:id', isAdmin, (req, res) => {
    const targetUserId = req.params.id;
    const currentUserId = req.session.userId;

    if (currentUserId == targetUserId) {
        return res.status(400).json({ error: i18n.t('you_cant_delete_yourself', getLang(req)) });
    }

    // Получаем username до удаления
    db.get('SELECT username FROM users WHERE id = ?', [targetUserId], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ error: i18n.t('user_not_found', getLang(req)) });
        }

        // Последовательное удаление (без транзакции)
        db.run('DELETE FROM leaderboard WHERE username = ?', [user.username], (err1) => {
            if (err1) {
                console.error('Leaderboard delete error:', err1);
                // Не возвращаем ошибку, продолжаем
            }
            db.run('DELETE FROM user_card_stats WHERE user_id = ?', [targetUserId], (err2) => {
                if (err2) {
                    console.error('User card stats delete error:', err2);
                }
                db.run('DELETE FROM users WHERE id = ?', [targetUserId], function(err3) {
                    if (err3) {
                        console.error('User delete error:', err3);
                        return res.status(500).json({ error: i18n.t('error_deleting', getLang(req)) });
                    }
                    if (this.changes === 0) {
                        return res.status(404).json({ error: i18n.t('user_not_found', getLang(req)) });
                    }
                    res.json({ success: true });
                });
            });
        });
    });
});

module.exports = router;
