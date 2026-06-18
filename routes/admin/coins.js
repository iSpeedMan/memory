const express = require('express');
const db = require('../../db');
const { isAdmin, getLang } = require('../../middleware/auth');
const i18n = require('../../public/js/i18n.js');

const router = express.Router();

router.post('/coins/award/:id', isAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: i18n.t('invalid_id', getLang(req)) });
    const amount = parseInt(req.body.amount, 10);
    if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ error: i18n.t('invalid_amount', getLang(req)) });

    db.run('UPDATE users SET coins = MAX(0, COALESCE(coins, 0) + ?) WHERE id = ?', [amount, id], function(err) {
        if (err || this.changes === 0) return res.status(404).json({ error: i18n.t('user_not_found', getLang(req)) });
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
