const express = require('express');
const db = require('../db');
const router = express.Router();

function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Not authorized' });
    next();
}

router.post('/:id/claim', requireAuth, (req, res) => {
    const annId = parseInt(req.params.id, 10);
    const userId = req.session.userId;
    if (!Number.isFinite(annId) || annId <= 0) return res.status(400).json({ error: 'invalid id' });

    db.get('SELECT id, coins_reward FROM server_announcements WHERE id = ?', [annId], (err, ann) => {
        if (err || !ann) return res.status(404).json({ error: 'not found' });
        const reward = ann.coins_reward || 0;
        if (reward <= 0) return res.json({ ok: true, coins: 0, alreadyClaimed: false });

        db.get('SELECT 1 FROM announcement_claims WHERE user_id = ? AND announcement_id = ?', [userId, annId], (err2, existing) => {
            if (existing) return res.json({ ok: true, coins: 0, alreadyClaimed: true });

            db.run('INSERT OR IGNORE INTO announcement_claims (user_id, announcement_id) VALUES (?, ?)', [userId, annId], function(err3) {
                if (err3) return res.status(500).json({ error: 'db error' });
                db.run('UPDATE users SET coins = COALESCE(coins, 0) + ? WHERE id = ?', [reward, userId], (err4) => {
                    if (err4) return res.status(500).json({ error: 'db error' });
                    db.get('SELECT coins FROM users WHERE id = ?', [userId], (err5, row) => {
                        const newBalance = row ? (row.coins || 0) : 0;
                        try {
                            const ws = require('../websocket');
                            ws.emitToUser(userId, 'coinsUpdate', { coins: newBalance, delta: reward, reason: 'announcement' });
                        } catch (_) {}
                        res.json({ ok: true, coins: reward, alreadyClaimed: false, newBalance });
                    });
                });
            });
        });
    });
});

module.exports = router;
