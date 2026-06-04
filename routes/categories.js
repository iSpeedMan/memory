const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { getLang } = require('../middleware/auth');
const { suggestLimiter } = require('../middleware/rateLimit');
const i18n = require('../public/i18n.js');

const router = express.Router();

const categoryKeyRegex = /^[a-zA-Z0-9_-]{1,30}$/;

const EMOJI_MAX_ITEM_LEN = 16;

function parseEmojiList(emojis) {
    if (typeof emojis !== 'string') return null;
    const emojiArray = emojis.split(',').map(e => e.trim()).filter(Boolean);
    if (emojiArray.some(e => e.length > EMOJI_MAX_ITEM_LEN)) return null;
    return emojiArray.length >= 18 && emojiArray.length <= 32 ? emojiArray : null;
}

// Multer config for category images (per-category subdirectory)
const catUploadsBase = path.join(__dirname, '../public/uploads/categories');
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const rawKey = ((req.body && req.body.key_name) || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
        const subdir = rawKey || 'suggested';
        const dir = path.join(catUploadsBase, subdir);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    }
});
const uploadFilter = (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/gif'];
    cb(null, allowed.includes(file.mimetype));
};
const upload = multer({
    storage,
    fileFilter: uploadFilter,
    limits: { fileSize: 2 * 1024 * 1024, files: 32 }
});

// Public list — includes virtual "unicode" category
router.get('/', (req, res) => {
    db.all('SELECT * FROM categories ORDER BY id', (err, rows) => {
        const cats = err ? [] : rows;
        const lang = getLang(req);
        cats.push({
            id: 'unicode',
            key_name: 'unicode',
            display_name: i18n.t('cat_unicode', lang) || '🌐 Все эмодзи',
            emojis: '🍕,🎮,🐶,🚀,💎,🌸,🎵,⭐,🦊,🌊,🔥,✨,🏆,🎯,💡,🎪,🦋,🌈',
            isVirtual: true
        });
        res.json(cats);
    });
});

// User-submitted category suggestion (requires auth, supports single or multiple image upload)
router.post('/suggest', suggestLimiter, upload.array('images', 32), (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: 'Not authorized' });
    const lang = getLang(req);
    const { key_name, display_name, emojis, repr_emoji } = req.body;

    if (!categoryKeyRegex.test(key_name || '') || !display_name?.trim()) {
        return res.status(400).json({ error: i18n.t('please_fill_in_the_required_fields', lang) });
    }

    const files = req.files || [];
    let finalEmojis, imageUrl, finalReprEmoji;

    if (files.length > 0) {
        if (files.length < 9 || files.length > 32) {
            return res.status(400).json({ error: 'Выберите от 9 до 32 изображений (для полей 3×3 до 8×8)' });
        }
        const imageUrls = files.map(f => '/' + path.relative(path.join(__dirname, '../public'), f.path).replace(/\\/g, '/'));
        finalEmojis = imageUrls.join(',');
        imageUrl = imageUrls[0];
        finalReprEmoji = (repr_emoji && repr_emoji.trim()) ? repr_emoji.trim() : '🖼️';
    } else {
        const emojiArray = parseEmojiList(emojis);
        if (!emojiArray) return res.status(400).json({ error: i18n.t('exactly_18_emojis', lang) });
        finalEmojis = emojiArray.join(',');
        imageUrl = null;
        finalReprEmoji = null;
    }

    db.get('SELECT id FROM categories WHERE key_name = ?', [key_name], (err, existing) => {
        if (existing) return res.status(400).json({ error: i18n.t('key_exists', lang) });
        db.get('SELECT id FROM user_categories WHERE key_name = ?', [key_name], (err2, existing2) => {
            if (existing2) return res.status(400).json({ error: i18n.t('key_exists', lang) });
            db.run(
                'INSERT INTO user_categories (user_id, username, key_name, display_name, emojis, image_url, repr_emoji) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [req.session.userId, req.session.username, key_name, display_name.trim(), finalEmojis, imageUrl, finalReprEmoji],
                (err3) => res.json(err3 ? { error: i18n.t('database_error', lang) } : { success: true })
            );
        });
    });
});

// Get own submissions
router.get('/my-suggestions', (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: 'Not authorized' });
    db.all(
        'SELECT id, key_name, display_name, image_url, status, submitted_at FROM user_categories WHERE user_id = ? ORDER BY submitted_at DESC',
        [req.session.userId],
        (err, rows) => res.json(err ? [] : rows)
    );
});

module.exports = router;
