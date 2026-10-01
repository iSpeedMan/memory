const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { getLang } = require('../middleware/auth');
const { suggestLimiter } = require('../middleware/rateLimit');
const i18n = require('../public/js/i18n.js');
const cache = require('../middleware/apiCache');
const hintSettings = require('../services/hintSettings');
const { uploadsRoot, publicUrlForFile, cleanupFiles, validateImageFile } = require('../services/uploadService');

const router = express.Router();

const categoryKeyRegex = /^[a-zA-Z0-9_-]{1,30}$/;
const EMOJI_MAX_ITEM_LEN = 16;
const REPR_EMOJI_MAX_LEN = 8;

function parseEmojiList(emojis) {
    if (typeof emojis !== 'string') return null;
    const emojiArray = emojis.split(',').map(e => e.trim()).filter(Boolean);
    if (emojiArray.some(e => e.length > EMOJI_MAX_ITEM_LEN)) return null;
    return emojiArray.length >= 18 && emojiArray.length <= 32 ? emojiArray : null;
}

function sanitizeReprEmoji(val) {
    if (!val || typeof val !== 'string') return null;
    const trimmed = val.trim();
    if (!trimmed || trimmed.length > REPR_EMOJI_MAX_LEN) return null;
    return trimmed;
}

const catUploadsBase = path.join(uploadsRoot, 'categories');
const crypto = require('crypto');
const MIME_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif' };
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const rawKey = ((req.body && req.body.key_name) || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
        const subdir = rawKey || 'suggested';
        const dir = path.join(catUploadsBase, subdir);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = MIME_EXT[file.mimetype] || '.bin';
        cb(null, `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
    }
});
const uploadFilter = (req, file, cb) => cb(null, !!MIME_EXT[file.mimetype]);
const upload = multer({
    storage,
    fileFilter: uploadFilter,
    limits: { fileSize: 2 * 1024 * 1024, files: 32 }
});

router.get('/', async (req, res) => {
    const lang = getLang(req);
    const cacheKey = `public:categories:${lang}`;
    try {
        const cached = await cache.get(cacheKey);
        if (cached !== null) return res.json(cached);
        db.all('SELECT * FROM categories ORDER BY id', async (err, rows) => {
            const cats = err ? [] : rows;
            cats.push({
                id: 'unicode',
                key_name: 'unicode',
                display_name: i18n.t('cat_unicode', lang),
                emojis: '🍕,🎮,🐶,🚀,💎,🌸,🎵,⭐,🦊,🌊,🔥,✨,🏆,🎯,💡,🎪,🦋,🌈',
                isVirtual: true
            });
            try { await cache.set(cacheKey, cats, 300000); } catch (_) {}
            res.json(cats);
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/suggest', suggestLimiter, (req, res, next) => {
    if (!req.session?.userId) return res.status(401).json({ error: i18n.t('not_authorized', getLang(req)) });
    next();
}, upload.array('images', 32), (req, res) => {
    const lang = getLang(req);
    const { key_name, display_name, emojis, repr_emoji } = req.body;
    const files = req.files || [];

    if (!categoryKeyRegex.test(key_name || '') || !display_name?.trim()) {
        cleanupFiles(files);
        return res.status(400).json({ error: i18n.t('please_fill_in_the_required_fields', lang) });
    }

    let finalEmojis, imageUrl, finalReprEmoji;

    if (files.length > 0) {
        if (files.some(file => !validateImageFile(file, Object.keys(MIME_EXT)))) {
            cleanupFiles(files);
            return res.status(400).json({ error: 'invalid_image' });
        }
        if (files.length < 9 || files.length > 32) {
            cleanupFiles(files);
            return res.status(400).json({ error: i18n.t('image_count_range', lang) });
        }
        const imageUrls = files.map(publicUrlForFile);
        finalEmojis = imageUrls.join(',');
        imageUrl = imageUrls[0];
        finalReprEmoji = sanitizeReprEmoji(repr_emoji) || '🖼️';
    } else {
        const emojiArray = parseEmojiList(emojis);
        if (!emojiArray) {
            cleanupFiles(files);
            return res.status(400).json({ error: i18n.t('exactly_18_emojis', lang) });
        }
        finalEmojis = emojiArray.join(',');
        imageUrl = null;
        finalReprEmoji = null;
    }

    const cfg = hintSettings.get();
    const suggestCost = cfg.suggest_cat_cost || 0;

    db.transaction(async (tx) => {
        const existing = await tx.get('SELECT id FROM categories WHERE key_name = ?', [key_name]);
        const existing2 = await tx.get('SELECT id FROM user_categories WHERE key_name = ?', [key_name]);
        if (existing || existing2) return { conflict: true };

        if (suggestCost > 0) {
            const spent = await tx.run(
                'UPDATE users SET coins = COALESCE(coins, 0) - ? WHERE id = ? AND COALESCE(coins, 0) >= ?',
                [suggestCost, req.session.userId, suggestCost]
            );
            if (spent.changes !== 1) return { insufficient: true };
        }

        await tx.run(
            'INSERT INTO user_categories (user_id, username, key_name, display_name, emojis, image_url, repr_emoji) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.session.userId, req.session.username, key_name, display_name.trim(), finalEmojis, imageUrl, finalReprEmoji]
        );
        return { success: true };
    }).then(result => {
        if (result.conflict) {
            cleanupFiles(files);
            return res.status(409).json({ error: i18n.t('key_exists', lang) });
        }
        if (result.insufficient) {
            cleanupFiles(files);
            return res.status(402).json({ error: i18n.t('not_enough_coins_suggest', lang) || i18n.t('hint_not_enough_coins', lang), cost: suggestCost });
        }
        res.json({ success: true, cost: suggestCost });
    }).catch(() => {
        cleanupFiles(files);
        res.status(500).json({ error: i18n.t('database_error', lang) });
    });
});

router.get('/my-suggestions', (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: i18n.t('not_authorized', getLang(req)) });
    db.all(
        'SELECT id, key_name, display_name, image_url, status, submitted_at FROM user_categories WHERE user_id = ? ORDER BY submitted_at DESC',
        [req.session.userId],
        (err, rows) => res.json(err ? [] : rows)
    );
});

module.exports = router;
