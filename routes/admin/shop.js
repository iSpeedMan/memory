'use strict';
const path   = require('path');
const fs     = require('fs');
const express = require('express');
const multer  = require('multer');
const { isAdmin } = require('../../middleware/auth');
const shop   = require('../../services/shopService');
const { uploadsRoot, assertInsideUploadRoot, cleanupFiles, validateImageFile } = require('../../services/uploadService');

const router = express.Router();

// ── Image upload for board_bg ─────────────────────────────────────────────────

const shopBgDir = assertInsideUploadRoot(path.join(uploadsRoot, 'shop-bg'));
if (!fs.existsSync(shopBgDir)) fs.mkdirSync(shopBgDir, { recursive: true });

const shopBgStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, shopBgDir),
    filename:    (_req, file, cb) => {
        const ext = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' })[file.mimetype];
        const name = `bg_${Date.now()}_${require('crypto').randomBytes(6).toString('hex')}${ext || '.bin'}`;
        cb(null, name);
    },
});

const shopBgUpload = multer({
    storage: shopBgStorage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ok = /^image\/(jpeg|png|webp)$/.test(file.mimetype);
        cb(ok ? null : new Error('invalid_type'), ok);
    },
});

router.post('/upload-bg', isAdmin, shopBgUpload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'no_file' });
    if (!validateImageFile(req.file, ['image/jpeg', 'image/png', 'image/webp'])) {
        cleanupFiles([req.file]);
        return res.status(400).json({ error: 'invalid_image' });
    }
    const url = `/uploads/shop-bg/${req.file.filename}`;
    res.json({ ok: true, url });
});

// ── Shop item CRUD ────────────────────────────────────────────────────────────

router.get('/shop/items', isAdmin, (req, res) => {
    shop.adminGetAllItems((err, items) => {
        if (err) return res.status(500).json({ error: 'db_error' });
        res.json(items || []);
    });
});

router.post('/shop/items', isAdmin, express.json(), (req, res) => {
    const { item_key, category, name, price_mc, rarity, preview_data, is_active } = req.body || {};
    if (!item_key || !category || !name) return res.status(400).json({ error: 'missing_fields' });
    const safeKey = typeof item_key === 'string' ? item_key.trim() : '';
    if (!/^[a-z0-9_]+$/.test(safeKey)) return res.status(400).json({ error: 'invalid_key' });
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 128) return res.status(400).json({ error: 'invalid_name' });
    if (!Number.isInteger(Number(price_mc)) || Number(price_mc) < 0 || Number(price_mc) > 100000000) {
        return res.status(400).json({ error: 'invalid_price' });
    }
    const validCategories = Object.keys(shop.CATEGORY_COLUMNS);
    if (!validCategories.includes(category)) return res.status(400).json({ error: 'invalid_category' });
    const validRarities = ['common', 'rare', 'epic', 'legendary'];
    if (rarity !== undefined && !validRarities.includes(rarity)) return res.status(400).json({ error: 'invalid_rarity' });
    if (is_active !== undefined && typeof is_active !== 'boolean' && is_active !== 0 && is_active !== 1) {
        return res.status(400).json({ error: 'invalid_active' });
    }
    if (preview_data !== undefined && (preview_data === null || typeof preview_data !== 'object' || Array.isArray(preview_data))) {
        return res.status(400).json({ error: 'invalid_preview' });
    }
    const previewError = shop.validatePreviewData(category, preview_data);
    if (previewError) return res.status(400).json({ error: previewError });

    shop.adminCreateItem({ item_key: safeKey, category, name: name.trim(), price_mc: Number(price_mc), rarity, preview_data, is_active }, (err, id) => {
        if (err?.code === 'SQLITE_CONSTRAINT' || err?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'item_key_exists' });
        if (err) return res.status(500).json({ error: 'db_error' });
        res.json({ ok: true, id });
    });
});

router.put('/shop/items/:key', isAdmin, express.json(), (req, res) => {
    const key = req.params.key;
    const { name, price_mc, rarity, is_active, preview_data } = req.body || {};
    if (!/^[a-z0-9_]+$/.test(key)) return res.status(400).json({ error: 'invalid_key' });
    if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.trim().length > 128)) {
        return res.status(400).json({ error: 'invalid_name' });
    }
    if (price_mc !== undefined && (!Number.isInteger(Number(price_mc)) || Number(price_mc) < 0 || Number(price_mc) > 100000000)) {
        return res.status(400).json({ error: 'invalid_price' });
    }
    const validRarities = ['common', 'rare', 'epic', 'legendary'];
    if (rarity !== undefined && !validRarities.includes(rarity)) return res.status(400).json({ error: 'invalid_rarity' });
    if (is_active !== undefined && typeof is_active !== 'boolean' && is_active !== 0 && is_active !== 1) {
        return res.status(400).json({ error: 'invalid_active' });
    }
    if (preview_data !== undefined && (preview_data === null || typeof preview_data !== 'object' || Array.isArray(preview_data))) {
        return res.status(400).json({ error: 'invalid_preview' });
    }
    shop.adminUpdateItem(key, { name, price_mc, rarity, is_active, preview_data }, (err) => {
        if (err?.message === 'item_not_found') return res.status(404).json({ error: 'item_not_found' });
        if (err?.message === 'invalid_preview') return res.status(400).json({ error: err.code || 'invalid_preview' });
        if (err) return res.status(500).json({ error: 'db_error' });
        res.json({ ok: true });
    });
});

router.delete('/shop/items/:key', isAdmin, (req, res) => {
    if (!/^[a-z0-9_]+$/.test(req.params.key)) return res.status(400).json({ error: 'invalid_key' });
    shop.adminDeleteItem(req.params.key, (err, result) => {
        if (err?.message === 'item_not_found') return res.status(404).json({ error: 'item_not_found' });
        if (err) return res.status(500).json({ error: 'db_error' });
        res.json({ ok: true, archived: result?.archived === true });
    });
});

module.exports = router;
