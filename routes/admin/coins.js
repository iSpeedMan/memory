const express = require('express');
const db = require('../../db');
const { isAdmin } = require('../../middleware/auth');

const router = express.Router();

router.post('/coins/award/:id', isAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const amount = parseInt(req.body.amount, 10);
    if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ error: 'Invalid amount' });

    db.run('UPDATE users SET coins = MAX(0, COALESCE(coins, 0) + ?) WHERE id = ?', [amount, id], function(err) {
        if (err || this.changes === 0) return res.status(404).json({ error: 'User not found' });
        db.get('SELECT coins FROM users WHERE id = ?', [id], (err2, row) => {
            const newBalance = row ? (row.coins || 0) : 0;
            try {
                const ws = require('../../websocket');
                ws.emitToUser(id, 'coinsUpdate', { coins: newBalance, delta: amount, reason: 'admin' });
            } catch (_) {}
            res.json({ success: true, newBalance });
        });
    });
});

module.exports = router;
