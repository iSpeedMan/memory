'use strict';
const db = require('../db');

const CATEGORY_COLUMNS = {
    card_skin:    'active_card_skin',
    board_bg:     'active_board_bg',
    match_color:  'active_match_color',
    avatar_frame: 'active_avatar_frame',
    title:        'active_title',
    name_color:   'active_name_color',
};

const DEFAULT_KEYS = {
    card_skin:    'card_default',
    board_bg:     'bg_default',
    match_color:  'color_blue',
    avatar_frame: 'frame_none',
    title:        'title_none',
    name_color:   'name_default',
};

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const IMAGE_PATH_RE = /^\/uploads\/shop-bg\/[A-Za-z0-9_.-]+$/;
const FRAME_CLASSES = new Set(['', 'frame-none', 'frame-silver', 'frame-gold', 'frame-neon', 'frame-champion', 'frame-ember']);
const CARD_CLASSES = new Set(['', 'card-purple', 'card-fire', 'card-galaxy', 'card-gold']);
const BOARD_CLASSES = new Set(['', 'bg-space', 'bg-grid', 'bg-forest']);
const TITLE_CLASSES = new Set(['', 'shop-title-none', 'shop-title-veteran', 'shop-title-master', 'shop-title-legend', 'shop-title-king']);
const cosmeticCache = new Map();
const COSMETIC_CACHE_TTL_MS = 30 * 1000;
const COSMETIC_CACHE_MAX = 5000;

function parsePreview(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
    try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

function sanitizePreviewData(category, raw) {
    const source = parsePreview(raw);
    const result = {};
    const copyText = (key, limit) => {
        if (typeof source[key] === 'string' && source[key].length <= limit) result[key] = source[key];
    };
    const copyColor = key => {
        if (typeof source[key] === 'string' && HEX_COLOR_RE.test(source[key])) result[key] = source[key];
    };
    copyText('name_ru', 64);
    copyText('name_en', 64);
    copyText('description_ru', 180);
    copyText('description_en', 180);

    if (category === 'card_skin') {
        copyColor('preview_bg');
        copyColor('preview_bg2');
        copyText('card_symbol', 8);
        if (CARD_CLASSES.has(source.css_class)) result.css_class = source.css_class;
    } else if (category === 'board_bg') {
        copyColor('preview_bg');
        copyColor('preview_bg2');
        if (BOARD_CLASSES.has(source.css_class)) result.css_class = source.css_class;
        if (typeof source.image_url === 'string' && IMAGE_PATH_RE.test(source.image_url)) result.image_url = source.image_url;
    } else if (category === 'match_color' || category === 'name_color') {
        copyColor('color');
    } else if (category === 'avatar_frame') {
        if (FRAME_CLASSES.has(source.css_class)) result.css_class = source.css_class;
    } else if (category === 'title') {
        copyText('label', 48);
        copyColor('color');
        if (TITLE_CLASSES.has(source.css_class)) result.css_class = source.css_class;
    }
    return result;
}

function validatePreviewData(category, raw) {
    const data = parsePreview(raw);
    const colorFields = category === 'card_skin' || category === 'board_bg'
        ? ['preview_bg', 'preview_bg2']
        : (category === 'match_color' || category === 'name_color' || category === 'title' ? ['color'] : []);
    if (colorFields.some(key => data[key] !== undefined && (typeof data[key] !== 'string' || !HEX_COLOR_RE.test(data[key])))) {
        return 'invalid_color';
    }
    const classSets = { card_skin: CARD_CLASSES, board_bg: BOARD_CLASSES, avatar_frame: FRAME_CLASSES, title: TITLE_CLASSES };
    if (data.css_class !== undefined && (!classSets[category] || !classSets[category].has(data.css_class))) return 'invalid_css_class';
    if (data.image_url !== undefined && (category !== 'board_bg' || typeof data.image_url !== 'string' || !IMAGE_PATH_RE.test(data.image_url))) {
        return 'invalid_image_url';
    }
    for (const key of ['name_ru', 'name_en']) {
        if (data[key] !== undefined && (typeof data[key] !== 'string' || data[key].length > 64)) return 'invalid_name';
    }
    for (const key of ['description_ru', 'description_en']) {
        if (data[key] !== undefined && (typeof data[key] !== 'string' || data[key].length > 180)) return 'invalid_description';
    }
    if (data.label !== undefined && (category !== 'title' || typeof data.label !== 'string' || data.label.length > 48)) return 'invalid_label';
    if (data.card_symbol !== undefined && (category !== 'card_skin' || typeof data.card_symbol !== 'string' || data.card_symbol.length > 8)) return 'invalid_symbol';
    return null;
}

function cloneCosmetics(value) {
    return JSON.parse(JSON.stringify(value));
}

function invalidateCosmeticsCache(userId) {
    if (userId === undefined || userId === null) {
        cosmeticCache.clear();
        return;
    }
    cosmeticCache.delete(String(userId));
}

function getShopItems(userId, callback) {
    db.all(
        'SELECT * FROM shop_items ORDER BY category ASC, price_mc ASC',
        [],
        (err, items) => {
            if (err) return callback(err);
            if (!userId) {
                return callback(null, (items || []).filter(i => Number(i.is_active) === 1).map(i => ({
                    ...i,
                    preview_data: sanitizePreviewData(i.category, i.preview_data),
                    owned:    i.price_mc === 0,
                    equipped: false,
                    available: true,
                })));
            }

            db.all('SELECT item_key FROM user_inventory WHERE user_id = ?', [userId], (err2, inv) => {
                if (err2) return callback(err2);
                const ownedSet = new Set((inv || []).map(r => r.item_key));
                const activeColumns = Object.values(CATEGORY_COLUMNS).join(', ');
                db.get(
                    `SELECT ${activeColumns} FROM users WHERE id = ?`,
                    [userId],
                    (err3, user) => {
                        if (err3) return callback(err3);
                        const active = user || {};
                        const equippedSet = new Set(Object.values(active).filter(Boolean));

                        const visibleItems = (items || []).filter(i =>
                            Number(i.is_active) === 1 || ownedSet.has(i.item_key) || equippedSet.has(i.item_key)
                        );
                        callback(null, visibleItems.map(i => {
                            const equipped = equippedSet.has(i.item_key);
                            const available = Number(i.is_active) === 1;
                            return {
                                ...i,
                                preview_data: sanitizePreviewData(i.category, i.preview_data),
                                owned: ownedSet.has(i.item_key) || equipped || (available && Number(i.price_mc) === 0),
                                equipped,
                                available,
                            };
                        }));
                    }
                );
            });
        }
    );
}

function getUserCosmetics(userId, callback) {
    if (!userId) return callback(null, null);
    const cacheKey = String(userId);
    const cached = cosmeticCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < COSMETIC_CACHE_TTL_MS) {
        return process.nextTick(() => callback(null, cloneCosmetics(cached.value)));
    }
    if (cached) cosmeticCache.delete(cacheKey);

    const activeColumns = Object.values(CATEGORY_COLUMNS).join(', ');
    db.get(
        `SELECT ${activeColumns} FROM users WHERE id = ?`,
        [userId],
        (err, row) => {
            if (err) return callback(err);
            if (!row) return callback(null, null);

            const keys = Object.fromEntries(Object.entries(CATEGORY_COLUMNS).map(([category, column]) => [
                category,
                row[column] || DEFAULT_KEYS[category],
            ]));

            const placeholders = Object.values(keys).map(() => '?').join(',');
            db.all(
                `SELECT item_key, category, preview_data FROM shop_items WHERE item_key IN (${placeholders})`,
                Object.values(keys),
                (err2, rows) => {
                    if (err2) return callback(err2);
                    const byKey = {};
                    (rows || []).forEach(r => { byKey[r.item_key] = sanitizePreviewData(r.category, r.preview_data); });

                    const result = {};
                    for (const [cat, key] of Object.entries(keys)) {
                        result[cat] = { item_key: key, ...(byKey[key] || {}) };
                    }
                    if (cosmeticCache.size >= COSMETIC_CACHE_MAX) cosmeticCache.delete(cosmeticCache.keys().next().value);
                    cosmeticCache.set(cacheKey, { timestamp: Date.now(), value: cloneCosmetics(result) });
                    callback(null, result);
                }
            );
        }
    );
}

function getMatchColorHex(userId, callback) {
    if (!userId) return callback(null, '#1283b9');
    getUserCosmetics(userId, (err, cosmetics) => {
        if (err) return callback(err, '#1283b9');
        callback(null, cosmetics?.match_color?.color || '#1283b9');
    });
}

function buyItem(userId, itemKey, callback) {
    db.transaction(async (tx) => {
        const item = await tx.get('SELECT * FROM shop_items WHERE item_key = ? AND is_active = 1', [itemKey]);
        if (!item) return { ok: false, error: 'item_not_found' };
        if (item.price_mc === 0) return { ok: false, error: 'item_free' };

        const existing = await tx.get('SELECT 1 FROM user_inventory WHERE user_id = ? AND item_key = ?', [userId, itemKey]);
        if (existing) return { ok: false, error: 'already_owned' };

        const user = await tx.get('SELECT coins FROM users WHERE id = ?', [userId]);
        if (!user) return { ok: false, error: 'user_not_found' };
        if ((user.coins || 0) < item.price_mc) {
            return { ok: false, error: 'not_enough_coins', current: user.coins || 0, price: item.price_mc };
        }

        const update = await tx.run(
            'UPDATE users SET coins = COALESCE(coins, 0) - ? WHERE id = ? AND COALESCE(coins, 0) >= ?',
            [item.price_mc, userId, item.price_mc]
        );
        if (update.changes !== 1) return { ok: false, error: 'not_enough_coins' };

        const insertSql = db.type === 'mysql'
            ? 'INSERT INTO user_inventory (user_id, item_key) VALUES (?, ?)'
            : 'INSERT INTO user_inventory (user_id, item_key) VALUES (?, ?)';
        await tx.run(insertSql, [userId, itemKey]);
        const updated = await tx.get('SELECT coins FROM users WHERE id = ?', [userId]);
        return { ok: true, newBalance: updated?.coins || 0, item: { ...item, preview_data: sanitizePreviewData(item.category, item.preview_data) } };
    }).then(result => callback(null, result))
      .catch(() => callback(null, { ok: false, error: 'db_error' }));
}

function equipItem(userId, itemKey, callback) {
    db.transaction(async tx => {
        const item = await tx.get('SELECT * FROM shop_items WHERE item_key = ?', [itemKey]);
        if (!item) return { ok: false, error: 'item_not_found' };

        const col = CATEGORY_COLUMNS[item.category];
        if (!col) return { ok: false, error: 'invalid_category' };

        const user = await tx.get(`SELECT ${col} FROM users WHERE id = ?`, [userId]);
        if (!user) return { ok: false, error: 'user_not_found' };
        const inventoryRow = await tx.get('SELECT 1 FROM user_inventory WHERE user_id = ? AND item_key = ?', [userId, itemKey]);
        const currentlyEquipped = user[col] === itemKey;
        const available = Number(item.is_active) === 1;
        const owned = !!inventoryRow || currentlyEquipped || (available && Number(item.price_mc) === 0);
        if (!available && !owned) return { ok: false, error: 'item_not_found' };
        if (!owned) return { ok: false, error: 'not_owned' };

        await tx.run(`UPDATE users SET ${col} = ? WHERE id = ?`, [itemKey, userId]);
        return { ok: true, category: item.category, item_key: itemKey };
    }).then(result => {
        if (result.ok) invalidateCosmeticsCache(userId);
        callback(null, result);
    }).catch(() => callback(null, { ok: false, error: 'db_error' }));
}

function adminGetAllItems(callback) {
    db.all(
        `SELECT s.*, (SELECT COUNT(*) FROM user_inventory ui WHERE ui.item_key = s.item_key) AS owners_count
         FROM shop_items s ORDER BY s.category ASC, s.price_mc ASC`,
        [],
        (err, rows) => {
            if (err) return callback(err);
            callback(null, (rows || []).map(r => ({ ...r, preview_data: sanitizePreviewData(r.category, r.preview_data) })));
        }
    );
}

function adminCreateItem(data, callback) {
    const { item_key, category, name, price_mc, rarity, preview_data, is_active } = data;
    const insertSql = db.type === 'mysql'
        ? 'INSERT INTO shop_items (item_key, category, name, price_mc, rarity, preview_data, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)'
        : 'INSERT INTO shop_items (item_key, category, name, price_mc, rarity, preview_data, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)';

    db.run(
        insertSql,
        [item_key, category, name, price_mc || 0, rarity || 'common', JSON.stringify(sanitizePreviewData(category, preview_data)), is_active !== false ? 1 : 0],
        function(err) { callback(err, this?.lastID); }
    );
}

function adminUpdateItem(itemKey, data, callback) {
    const applyUpdate = category => {
        if (data.preview_data !== undefined) {
            const previewError = validatePreviewData(category, data.preview_data);
            if (previewError) {
                const error = new Error('invalid_preview');
                error.code = previewError;
                return callback(error);
            }
        }
        const fields = [];
        const params = [];
        if (data.name         !== undefined) { fields.push('name = ?');         params.push(String(data.name)); }
        if (data.price_mc     !== undefined) { fields.push('price_mc = ?');     params.push(Number(data.price_mc)); }
        if (data.rarity       !== undefined) { fields.push('rarity = ?');       params.push(String(data.rarity)); }
        if (data.is_active    !== undefined) { fields.push('is_active = ?');    params.push(data.is_active ? 1 : 0); }
        if (data.preview_data !== undefined) { fields.push('preview_data = ?'); params.push(JSON.stringify(sanitizePreviewData(category, data.preview_data))); }
        if (!fields.length) return callback(null);
        params.push(itemKey);
        db.run(`UPDATE shop_items SET ${fields.join(', ')} WHERE item_key = ?`, params, function(err) {
            if (!err) invalidateCosmeticsCache();
            callback(err);
        });
    };

    db.get('SELECT category FROM shop_items WHERE item_key = ?', [itemKey], (err, row) => {
        if (err) return callback(err);
        if (!row) return callback(new Error('item_not_found'));
        applyUpdate(row.category);
    });
}

function adminDeleteItem(itemKey, callback) {
    db.run('UPDATE shop_items SET is_active = 0 WHERE item_key = ?', [itemKey], function(err) {
        if (!err) invalidateCosmeticsCache();
        callback(err, { archived: !err });
    });
}

function getPlayerGameCosmetics(userId, callback) {
    if (!userId || userId === 'bot_cpu') {
        return callback(null, { matchColor: '#1ba1e2', frameClass: null, titleLabel: null, titleColor: null, nameColor: null });
    }
    getUserCosmetics(userId, (err, cosmetics) => {
        if (err || !cosmetics) {
            return callback(null, { matchColor: '#1ba1e2', frameClass: null, titleLabel: null, titleColor: null, nameColor: null });
        }
        const frameClass = cosmetics.avatar_frame?.css_class;
        callback(null, {
            matchColor: cosmetics.match_color?.color || '#1ba1e2',
            frameClass: frameClass && frameClass !== 'frame-none' ? frameClass : null,
            titleLabel: cosmetics.title?.label || null,
            titleColor: cosmetics.title?.color || null,
            nameColor: cosmetics.name_color?.color || null,
        });
    });
}

module.exports = {
    getShopItems, getUserCosmetics, getMatchColorHex, getPlayerGameCosmetics,
    buyItem, equipItem,
    adminGetAllItems, adminCreateItem, adminUpdateItem, adminDeleteItem,
    CATEGORY_COLUMNS, DEFAULT_KEYS, sanitizePreviewData, validatePreviewData, invalidateCosmeticsCache,
};
