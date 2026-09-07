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

        db.transaction(async (tx) => {
            const insertSql = db.type === 'mysql'
                ? 'INSERT IGNORE INTO announcement_claims (user_id, announcement_id) VALUES (?, ?)'
                : 'INSERT OR IGNORE INTO announcement_claims (user_id, announcement_id) VALUES (?, ?)';
            const claim = await tx.run(insertSql, [userId, annId]);
            if (claim.changes !== 1) return { alreadyClaimed: true };
            const update = await tx.run(
                'UPDATE users SET coins = COALESCE(coins, 0) + ? WHERE id = ?',
                [reward, userId]
            );
            if (update.changes !== 1) throw new Error('user_not_found');
            const row = await tx.get('SELECT coins FROM users WHERE id = ?', [userId]);
            return { alreadyClaimed: false, newBalance: row?.coins || 0 };
        }).then(result => {
            if (result.alreadyClaimed) {
                return res.json({ ok: true, coins: 0, alreadyClaimed: true });
            }
            try {
                const ws = require('../websocket');
                ws.emitToUser(userId, 'coinsUpdate', {
                    coins: result.newBalance, delta: reward, reason: 'announcement'
                });
            } catch (_) {}
            res.json({ ok: true, coins: reward, alreadyClaimed: false, newBalance: result.newBalance });
        }).catch(() => res.status(500).json({ error: 'db error' }));
    });
});

module.exports = router;
