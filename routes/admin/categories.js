const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../../db');
const { isAdmin, getLang } = require('../../middleware/auth');
const i18n = require('../../public/i18n.js');

const router = express.Router();

const catUploadsBase = path.join(__dirname, '../../public/uploads/categories');
const catImageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const rawKey = ((req.body && req.body.key_name) || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
        const subdir = rawKey || (req.params && req.params.id ? `cat_${req.params.id}` : 'tmp');
        const dir = path.join(catUploadsBase, subdir);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    }
});
const catImageUpload = multer({
    storage: catImageStorage,
    fileFilter: (req, file, cb) => cb(null, ['image/png', 'image/jpeg', 'image/gif'].includes(file.mimetype)),
    limits: { fileSize: 2 * 1024 * 1024, files: 32 }
});

const categoryKeyRegex = /^[a-zA-Z0-9_-]{1,30}$/;
const EMOJI_MAX_ITEM_LEN = 16;

function parseEmojiList(emojis) {
    if (typeof emojis !== 'string') return null;
    const emojiArray = emojis.split(',').map(e => e.trim()).filter(Boolean);
    if (emojiArray.some(e => e.length > EMOJI_MAX_ITEM_LEN)) return null;
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
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const { display_name, emojis } = req.body;
    if (typeof display_name !== 'string' || !display_name.trim()) {
        return res.status(400).json({ error: i18n.t('please_fill_in_the_required_fields', getLang(req)) });
    }
    const emojiArray = parseEmojiList(emojis);
    if (!emojiArray) return res.status(400).json({ error: i18n.t('exactly_18_emojis', getLang(req)) });
    db.run('UPDATE categories SET display_name = ?, emojis = ? WHERE id = ?',
        [display_name.trim(), emojiArray.join(','), id],
        (err) => res.json(err ? { error: i18n.t('database_error', getLang(req)) } : { success: true }));
});

router.post('/categories/with-images', isAdmin, catImageUpload.array('images', 32), (req, res) => {
    const lang = getLang(req);
    const { key_name, display_name, repr_emoji } = req.body;
    if (!categoryKeyRegex.test(key_name || '') || typeof display_name !== 'string' || !display_name.trim()) {
        return res.status(400).json({ error: i18n.t('please_fill_in_the_required_fields', lang) });
    }
    const files = req.files || [];
    if (files.length < 9 || files.length > 32) {
        return res.status(400).json({ error: i18n.t('exactly_18_emojis', lang) });
    }
    const publicDir = path.join(__dirname, '../../public');
    const imageUrls = files.map(f => '/' + path.relative(publicDir, f.path).replace(/\\/g, '/'));
    const emojisStr = imageUrls.join(',');
    const imageUrl = imageUrls[0];
    const finalReprEmoji = (repr_emoji && repr_emoji.trim()) ? repr_emoji.trim() : '🖼️';
    db.run('INSERT INTO categories (key_name, display_name, emojis, image_url, repr_emoji) VALUES (?, ?, ?, ?, ?)',
        [key_name, display_name.trim(), emojisStr, imageUrl, finalReprEmoji],
        (err) => res.json(err ? { error: i18n.t('key_exists', lang) } : { success: true }));
});

router.put('/categories/:id/images', isAdmin, catImageUpload.array('images', 32), (req, res) => {
    const lang = getLang(req);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const { display_name, repr_emoji, keep_paths } = req.body;

    if (typeof display_name !== 'string' || !display_name.trim()) {
        return res.status(400).json({ error: i18n.t('please_fill_in_the_required_fields', lang) });
    }

    let keptPaths = [];
    try {
        keptPaths = JSON.parse(keep_paths || '[]');
        if (!Array.isArray(keptPaths)) keptPaths = [];
    } catch (e) { keptPaths = []; }
    keptPaths = keptPaths.filter(p => typeof p === 'string' && p.startsWith('/uploads/categories/'));

    const _pubDir = path.join(__dirname, '../../public');
    const newFiles = (req.files || []).map(f => '/' + path.relative(_pubDir, f.path).replace(/\\/g, '/'));
    const finalPaths = [...keptPaths, ...newFiles];

    if (finalPaths.length < 9 || finalPaths.length > 32) {
        newFiles.forEach(p => { try { fs.unlinkSync(path.join(__dirname, '../../public', p)); } catch (_) {} });
        return res.status(400).json({ error: i18n.t('exactly_18_emojis', lang) });
    }

    db.get('SELECT emojis FROM categories WHERE id = ?', [id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: i18n.t('database_error', lang) });

        const currentPaths = (row.emojis || '').split(',').map(p => p.trim())
            .filter(p => p.startsWith('/uploads/categories/'));
        currentPaths.forEach(p => {
            if (!keptPaths.includes(p)) {
                try { fs.unlinkSync(path.join(__dirname, '../../public', p)); } catch (_) {}
            }
        });

        const emojisStr = finalPaths.join(',');
        const finalReprEmoji = (repr_emoji && repr_emoji.trim()) ? repr_emoji.trim() : '🖼️';
        db.run(
            'UPDATE categories SET display_name = ?, emojis = ?, image_url = ?, repr_emoji = ? WHERE id = ?',
            [display_name.trim(), emojisStr, finalPaths[0], finalReprEmoji, id],
            (err2) => res.json(err2 ? { error: i18n.t('database_error', lang) } : { success: true })
        );
    });
});

router.delete('/categories/:id', isAdmin, (req, res) => {
    const lang = getLang(req);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    db.get('SELECT emojis FROM categories WHERE id = ?', [id], (err, row) => {
        if (!err && row) {
            const imgPaths = (row.emojis || '').split(',').map(p => p.trim())
                .filter(p => p.startsWith('/uploads/categories/'));
            imgPaths.forEach(p => {
                try { fs.unlinkSync(path.join(__dirname, '../../public', p)); } catch (_) {}
            });
            const dirs = new Set(imgPaths.map(p => path.dirname(path.join(__dirname, '../../public', p))));
            dirs.forEach(dir => {
                if (dir !== catUploadsBase) {
                    try { if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); } catch (_) {}
                }
            });
        }
        db.run('DELETE FROM categories WHERE id = ?', [id],
            (e) => res.json(e ? { error: i18n.t('error_deleting', lang) } : { success: true }));
    });
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
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const lang = getLang(req);
    db.get('SELECT * FROM user_categories WHERE id = ? AND status = ?', [id, 'pending'], (err, row) => {
        if (err || !row) return res.status(404).json({ error: i18n.t('user_not_found', lang) });
        db.run('INSERT OR IGNORE INTO categories (key_name, display_name, emojis, image_url, repr_emoji) VALUES (?, ?, ?, ?, ?)',
            [row.key_name, row.display_name, row.emojis, row.image_url || null, row.repr_emoji || null],
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
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const lang = getLang(req);
    db.run('UPDATE user_categories SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['rejected', req.session.userId, id],
        (err) => res.json(err ? { error: i18n.t('database_error', lang) } : { success: true }));
});

module.exports = router;
