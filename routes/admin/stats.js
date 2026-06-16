const express = require('express');
const db = require('../../db');
const { isAdmin } = require('../../middleware/auth');
const cache = require('../../middleware/apiCache');

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
        if (err) return res.status(500).json({ error: 'DB error' });
        db.run('INSERT OR REPLACE INTO server_settings (key, value) VALUES (?, ?)', ['server_info_ts', ts], function() {
            const wsModule = require('../../websocket');
            if (typeof wsModule.broadcastServerInfo === 'function') wsModule.broadcastServerInfo(info, ts);
            cache.invalidate('admin:stats');
            res.json({ ok: true });
        });
    });
});

// ==================== ANNOUNCEMENTS ====================

router.get('/announcements/public', cache.middleware('admin:announcements:public', 15000), (req, res) => {
    db.all('SELECT id, text, created_at, updated_at FROM server_announcements ORDER BY created_at DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ announcements: rows || [] });
    });
});

router.get('/announcements', isAdmin, cache.middleware('admin:announcements', 15000), (req, res) => {
    db.all('SELECT id, text, created_at, updated_at FROM server_announcements ORDER BY created_at DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ announcements: rows || [] });
    });
});

router.post('/announcements', isAdmin, express.json(), (req, res) => {
    const text = String(req.body?.text ?? '').trim().substring(0, 2000);
    if (!text) return res.status(400).json({ error: 'text required' });
    db.run('INSERT INTO server_announcements (text) VALUES (?)', [text], function(err) {
        if (err) return res.status(500).json({ error: 'DB error' });
        db.all('SELECT id, text, created_at, updated_at FROM server_announcements ORDER BY created_at DESC', [], (err2, rows) => {
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
    db.run(
        'UPDATE server_announcements SET text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [text, id],
        function(err) {
            if (err) return res.status(500).json({ error: 'DB error' });
            if (this.changes === 0) return res.status(404).json({ error: 'not found' });
            db.all('SELECT id, text, created_at, updated_at FROM server_announcements ORDER BY created_at DESC', [], (err2, rows) => {
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
        if (err) return res.status(500).json({ error: 'DB error' });
        db.all('SELECT id, text, created_at, updated_at FROM server_announcements ORDER BY created_at DESC', [], (err2, rows) => {
            const wsModule = require('../../websocket');
            if (typeof wsModule.broadcastAnnouncements === 'function') wsModule.broadcastAnnouncements(rows || []);
            cache.invalidate('admin:announcements', 'admin:announcements:public');
            res.json({ ok: true });
        });
    });
});

module.exports = router;
