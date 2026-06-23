const express = require('express');
const db = require('../../db');
const { isAdmin, getLang } = require('../../middleware/auth');
const cache = require('../../middleware/apiCache');
const i18n = require('../../public/js/i18n.js');
const hintSettings = require('../../services/hintSettings');

const router = express.Router();

router.get('/stats', isAdmin, cache.middleware('admin:stats', 30000), (req, res) => {
    const { getOnlineCount } = require('../../websocket');
    const { rooms } = require('../../services/roomManager');
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
                    db.get('SELECT value FROM server_settings WHERE key = ?', ['server_info'], (err5, infoRow) => {
                        res.json({
                            onlineUsers, activeGames, waitingRooms,
                            gamesToday: todayRow?.count || 0,
                            totalUsers: usersRow?.count || 0,
                            totalGames: totalRow?.count || 0,
                            pendingCategories: pendingRow?.count || 0,
                            serverInfo: infoRow?.value || ''
                        });
                    });
                });
            });
        });
    });
});

router.get('/server-info', (req, res) => {
    db.all('SELECT key, value FROM server_settings WHERE key IN (?, ?)', ['server_info', 'server_info_ts'], (err, rows) => {
        const map = {};
        (rows || []).forEach(r => { map[r.key] = r.value; });
        res.json({ info: map.server_info || '', ts: map.server_info_ts || '0' });
    });
});

router.put('/server-info', isAdmin, express.json(), (req, res) => {
    const info = String(req.body?.info ?? '').trim().substring(0, 2000);
    const ts = String(Date.now());
    db.run('INSERT OR REPLACE INTO server_settings (key, value) VALUES (?, ?)', ['server_info', info], function(err) {
        if (err) return res.status(500).json({ error: i18n.t('database_error', getLang(req)) });
        db.run('INSERT OR REPLACE INTO server_settings (key, value) VALUES (?, ?)', ['server_info_ts', ts], function() {
            const wsModule = require('../../websocket');
            if (typeof wsModule.broadcastServerInfo === 'function') wsModule.broadcastServerInfo(info, ts);
            cache.invalidate('admin:stats');
            res.json({ ok: true });
        });
    });
});

// ==================== HINT SETTINGS ====================

router.get('/hint-settings', isAdmin, (req, res) => {
    res.json(hintSettings.get());
});

router.put('/hint-settings', isAdmin, express.json(), (req, res) => {
    const { hint_limit, hint_cost_reveal_one, hint_cost_reveal_pair, hint_cost_extra_turn } = req.body || {};
    const updates = {};
    if (hint_limit !== undefined) updates.hint_limit = hint_limit;
    if (hint_cost_reveal_one !== undefined) updates.hint_cost_reveal_one = hint_cost_reveal_one;
    if (hint_cost_reveal_pair !== undefined) updates.hint_cost_reveal_pair = hint_cost_reveal_pair;
    if (hint_cost_extra_turn !== undefined) updates.hint_cost_extra_turn = hint_cost_extra_turn;
    hintSettings.set(updates, (err) => {
        if (err) return res.status(500).json({ error: i18n.t('database_error', getLang(req)) });
        res.json({ ok: true, settings: hintSettings.get() });
    });
});

// ==================== ANNOUNCEMENTS ====================

router.get('/announcements/public', cache.middleware('admin:announcements:public', 15000), (req, res) => {
    db.all('SELECT id, text, coins_reward, created_at, updated_at FROM server_announcements ORDER BY created_at DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: i18n.t('database_error', getLang(req)) });
        res.json({ announcements: rows || [] });
    });
});

router.get('/announcements', isAdmin, cache.middleware('admin:announcements', 15000), (req, res) => {
    db.all('SELECT id, text, coins_reward, created_at, updated_at FROM server_announcements ORDER BY created_at DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: i18n.t('database_error', getLang(req)) });
        res.json({ announcements: rows || [] });
    });
});

router.post('/announcements', isAdmin, express.json(), (req, res) => {
    const text = String(req.body?.text ?? '').trim().substring(0, 2000);
    if (!text) return res.status(400).json({ error: 'text required' });
    const coinsReward = Math.max(0, parseInt(req.body?.coins_reward, 10) || 0);
    db.run('INSERT INTO server_announcements (text, coins_reward) VALUES (?, ?)', [text, coinsReward], function(err) {
        if (err) return res.status(500).json({ error: i18n.t('database_error', getLang(req)) });
        db.all('SELECT id, text, coins_reward, created_at, updated_at FROM server_announcements ORDER BY created_at DESC', [], (err2, rows) => {
            const wsModule = require('../../websocket');
            if (typeof wsModule.broadcastAnnouncements === 'function') wsModule.broadcastAnnouncements(rows || []);
            cache.invalidate('admin:announcements', 'admin:announcements:public');
            res.json({ ok: true, id: this.lastID });
        });
    });
});

router.put('/announcements/:id', isAdmin, express.json(), (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
    const text = String(req.body?.text ?? '').trim().substring(0, 2000);
    if (!text) return res.status(400).json({ error: 'text required' });
    const coinsReward = Math.max(0, parseInt(req.body?.coins_reward, 10) || 0);
    db.run(
        'UPDATE server_announcements SET text = ?, coins_reward = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [text, coinsReward, id],
        function(err) {
            if (err) return res.status(500).json({ error: i18n.t('database_error', getLang(req)) });
            if (this.changes === 0) return res.status(404).json({ error: 'not found' });
            db.all('SELECT id, text, coins_reward, created_at, updated_at FROM server_announcements ORDER BY created_at DESC', [], (err2, rows) => {
                const wsModule = require('../../websocket');
                if (typeof wsModule.broadcastAnnouncements === 'function') wsModule.broadcastAnnouncements(rows || []);
                cache.invalidate('admin:announcements', 'admin:announcements:public');
                res.json({ ok: true });
            });
        }
    );
});

router.delete('/announcements/:id', isAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
    db.run('DELETE FROM server_announcements WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: i18n.t('database_error', getLang(req)) });
        db.all('SELECT id, text, created_at, updated_at FROM server_announcements ORDER BY created_at DESC', [], (err2, rows) => {
            const wsModule = require('../../websocket');
            if (typeof wsModule.broadcastAnnouncements === 'function') wsModule.broadcastAnnouncements(rows || []);
            cache.invalidate('admin:announcements', 'admin:announcements:public');
            res.json({ ok: true });
        });
    });
});

router.get('/hint-settings-public', (req, res) => {
    res.json(hintSettings.get());
});

// ==================== ACHIEVEMENT REWARDS ====================

const achievementRewards = require('../../services/achievementRewards');

router.get('/achievement-rewards', isAdmin, (req, res) => {
    const { ACHIEVEMENTS } = require('../../services/achievementService');
    const rewards = achievementRewards.get();
    const list = Object.entries(ACHIEVEMENTS).map(([key, def]) => ({
        key, icon: def.icon, name_ru: def.name_ru, name_en: def.name_en,
        coins: rewards[key] ?? 0,
    }));
    res.json(list);
});

router.put('/achievement-rewards', isAdmin, express.json(), (req, res) => {
    const updates = {};
    achievementRewards.ALL_KEYS.forEach(key => {
        if (req.body && req.body[key] !== undefined) updates[key] = req.body[key];
    });
    achievementRewards.set(updates, (err) => {
        if (err) return res.status(500).json({ error: i18n.t('database_error', getLang(req)) });
        res.json({ ok: true, rewards: achievementRewards.get() });
    });
});

module.exports = router;
