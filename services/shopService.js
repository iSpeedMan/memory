'use strict';
const db = require('../db');

const CATEGORY_COLUMNS = {
    card_skin:    'active_card_skin',
    board_bg:     'active_board_bg',
    match_color:  'active_match_color',
    avatar_frame: 'active_avatar_frame',
    title:        'active_title',
};

const DEFAULT_KEYS = {
    card_skin:    'card_default',
    board_bg:     'bg_default',
    match_color:  'color_blue',
    avatar_frame: 'frame_none',
    title:        'title_none',
};

function parsePreview(raw) {
    try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

function getShopItems(userId, callback) {
    db.all(
        'SELECT * FROM shop_items WHERE is_active = 1 ORDER BY category ASC, price_mc ASC',
        [],
        (err, items) => {
            if (err) return callback(err);
            if (!userId) {
                return callback(null, (items || []).map(i => ({
                    ...i,
                    preview_data: parsePreview(i.preview_data),
                    owned:    i.price_mc === 0,
                    equipped: false,
                })));
            }

            db.all('SELECT item_key FROM user_inventory WHERE user_id = ?', [userId], (err2, inv) => {
                const ownedSet = new Set((inv || []).map(r => r.item_key));

                db.get(
                    'SELECT active_card_skin, active_board_bg, active_match_color, active_avatar_frame, active_title FROM users WHERE id = ?',
                    [userId],
                    (err3, user) => {
                        const active = user || {};
                        const equippedSet = new Set(Object.values(active).filter(Boolean));

                        callback(null, (items || []).map(i => ({
                            ...i,
                            preview_data: parsePreview(i.preview_data),
                            owned:    i.price_mc === 0 || ownedSet.has(i.item_key),
                            equipped: equippedSet.has(i.item_key),
                        })));
                    }
                );
            });
        }
    );
}

function getUserCosmetics(userId, callback) {
    if (!userId) return callback(null, null);
    db.get(
        'SELECT active_card_skin, active_board_bg, active_match_color, active_avatar_frame, active_title FROM users WHERE id = ?',
        [userId],
        (err, row) => {
            if (err || !row) return callback(null, null);

            const keys = {
                card_skin:    row.active_card_skin    || DEFAULT_KEYS.card_skin,
                board_bg:     row.active_board_bg     || DEFAULT_KEYS.board_bg,
                match_color:  row.active_match_color  || DEFAULT_KEYS.match_color,
                avatar_frame: row.active_avatar_frame || DEFAULT_KEYS.avatar_frame,
                title:        row.active_title        || DEFAULT_KEYS.title,
            };

            const placeholders = Object.values(keys).map(() => '?').join(',');
            db.all(
                `SELECT item_key, category, preview_data FROM shop_items WHERE item_key IN (${placeholders})`,
                Object.values(keys),
                (err2, rows) => {
                    const byKey = {};
                    (rows || []).forEach(r => { byKey[r.item_key] = parsePreview(r.preview_data); });

                    const result = {};
                    for (const [cat, key] of Object.entries(keys)) {
                        result[cat] = { item_key: key, ...(byKey[key] || {}) };
                    }
                    callback(null, result);
                }
            );
        }
    );
}

function getMatchColorHex(userId, callback) {
    if (!userId) return callback(null, '#1283b9');
    db.get('SELECT active_match_color FROM users WHERE id = ?', [userId], (err, row) => {
        if (err || !row || !row.active_match_color) return callback(null, '#1283b9');
        db.get('SELECT preview_data FROM shop_items WHERE item_key = ?', [row.active_match_color], (err2, item) => {
            if (err2 || !item) return callback(null, '#1283b9');
            const pd = parsePreview(item.preview_data);
            callback(null, pd.color || '#1283b9');
        });
    });
}

function buyItem(userId, itemKey, callback) {
    db.get('SELECT * FROM shop_items WHERE item_key = ? AND is_active = 1', [itemKey], (err, item) => {
        if (err || !item) return callback(null, { ok: false, error: 'item_not_found' });
        if (item.price_mc === 0) return callback(null, { ok: false, error: 'item_free' });

        db.get('SELECT 1 FROM user_inventory WHERE user_id = ? AND item_key = ?', [userId, itemKey], (err2, existing) => {
            if (existing) return callback(null, { ok: false, error: 'already_owned' });

            db.get('SELECT coins FROM users WHERE id = ?', [userId], (err3, user) => {
                if (err3 || !user) return callback(null, { ok: false, error: 'user_not_found' });
                if (user.coins < item.price_mc) {
                    return callback(null, { ok: false, error: 'not_enough_coins', current: user.coins, price: item.price_mc });
                }

                db.run(
                    'UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?',
                    [item.price_mc, userId, item.price_mc],
                    function(err4) {
                        if (err4 || this.changes === 0) return callback(null, { ok: false, error: 'not_enough_coins' });

                        const insertSql = db.type === 'mysql'
                            ? 'INSERT IGNORE INTO user_inventory (user_id, item_key) VALUES (?, ?)'
                            : 'INSERT OR IGNORE INTO user_inventory (user_id, item_key) VALUES (?, ?)';

                        db.run(insertSql, [userId, itemKey], (err5) => {
                            if (err5) {
                                db.run('UPDATE users SET coins = coins + ? WHERE id = ?', [item.price_mc, userId]);
                                return callback(null, { ok: false, error: 'db_error' });
                            }
                            db.get('SELECT coins FROM users WHERE id = ?', [userId], (_, updated) => {
                                callback(null, { ok: true, newBalance: updated?.coins || 0, item: { ...item, preview_data: parsePreview(item.preview_data) } });
                            });
                        });
                    }
                );
            });
        });
    });
}

function equipItem(userId, itemKey, callback) {
    db.get('SELECT * FROM shop_items WHERE item_key = ?', [itemKey], (err, item) => {
        if (err || !item) return callback(null, { ok: false, error: 'item_not_found' });

        const col = CATEGORY_COLUMNS[item.category];
        if (!col) return callback(null, { ok: false, error: 'invalid_category' });

        const checkOwned = (next) => {
            if (item.price_mc === 0) return next(true);
            db.get('SELECT 1 FROM user_inventory WHERE user_id = ? AND item_key = ?', [userId, itemKey], (e, row) => next(!!row));
        };

        checkOwned((owned) => {
            if (!owned) return callback(null, { ok: false, error: 'not_owned' });
            db.run(`UPDATE users SET ${col} = ? WHERE id = ?`, [itemKey, userId], function(err2) {
                if (err2) return callback(null, { ok: false, error: 'db_error' });
                callback(null, { ok: true, category: item.category, item_key: itemKey });
            });
        });
    });
}

function adminGetAllItems(callback) {
    db.all('SELECT * FROM shop_items ORDER BY category ASC, price_mc ASC', [], (err, rows) => {
        callback(err, (rows || []).map(r => ({ ...r, preview_data: parsePreview(r.preview_data) })));
    });
}

function adminCreateItem(data, callback) {
    const { item_key, category, name, price_mc, rarity, preview_data, is_active } = data;
    const insertSql = db.type === 'mysql'
        ? 'INSERT INTO shop_items (item_key, category, name, price_mc, rarity, preview_data, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)'
        : 'INSERT OR IGNORE INTO shop_items (item_key, category, name, price_mc, rarity, preview_data, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)';

    db.run(
        insertSql,
        [item_key, category, name, price_mc || 0, rarity || 'common', JSON.stringify(preview_data || {}), is_active !== false ? 1 : 0],
        function(err) { callback(err, this?.lastID); }
    );
}

function adminUpdateItem(itemKey, data, callback) {
    const fields = [];
    const params = [];
    if (data.name        !== undefined) { fields.push('name = ?');         params.push(String(data.name)); }
    if (data.price_mc    !== undefined) { fields.push('price_mc = ?');     params.push(Number(data.price_mc)); }
    if (data.rarity      !== undefined) { fields.push('rarity = ?');       params.push(String(data.rarity)); }
    if (data.is_active   !== undefined) { fields.push('is_active = ?');    params.push(data.is_active ? 1 : 0); }
    if (data.preview_data!== undefined) { fields.push('preview_data = ?'); params.push(JSON.stringify(data.preview_data)); }
    if (!fields.length) return callback(null);
    params.push(itemKey);
    db.run(`UPDATE shop_items SET ${fields.join(', ')} WHERE item_key = ?`, params, callback);
}

function adminDeleteItem(itemKey, callback) {
    db.run('DELETE FROM shop_items WHERE item_key = ?', [itemKey], callback);
}

module.exports = {
    getShopItems, getUserCosmetics, getMatchColorHex,
    buyItem, equipItem,
    adminGetAllItems, adminCreateItem, adminUpdateItem, adminDeleteItem,
    CATEGORY_COLUMNS, DEFAULT_KEYS,
};
