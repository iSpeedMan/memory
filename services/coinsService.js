const db = require('../db');

function getCoins(userId, cb) {
    db.get('SELECT coins FROM users WHERE id = ?', [userId], (err, row) => {
        cb(err, row ? (row.coins || 0) : 0);
    });
}

function awardCoins(userId, amount, io, reason) {
    if (!userId || userId === 'bot_cpu' || !Number.isFinite(amount) || amount <= 0) return;
    db.run('UPDATE users SET coins = COALESCE(coins, 0) + ? WHERE id = ?', [amount, userId], function(err) {
        if (err) return;
        db.get('SELECT coins FROM users WHERE id = ?', [userId], (err2, row) => {
            if (err2 || !row) return;
            if (io) io.to('user_' + userId).emit('coinsUpdate', { coins: row.coins, delta: amount, reason: reason || 'game' });
        });
    });
}

function spendCoins(userId, amount, cb) {
    if (!userId || userId === 'bot_cpu' || !Number.isFinite(amount) || amount <= 0) {
        return cb(null, { ok: false, reason: 'invalid' });
    }
    db.run(
        'UPDATE users SET coins = coins - ? WHERE id = ? AND COALESCE(coins, 0) >= ?',
        [amount, userId, amount],
        function(err) {
            if (err) return cb(err, { ok: false, reason: 'db_error' });
            if (this.changes === 0) return cb(null, { ok: false, reason: 'not_enough' });
            db.get('SELECT coins FROM users WHERE id = ?', [userId], (err2, row) => {
                cb(null, { ok: true, newBalance: row ? (row.coins || 0) : 0 });
            });
        }
    );
}

function checkAndAwardDailyBonus(userId, io, cb) {
    if (!userId || userId === 'bot_cpu') return cb && cb(false);
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    db.transaction(async (tx) => {
        const row = await tx.get('SELECT last_daily_bonus, daily_streak FROM users WHERE id = ?', [userId]);
        if (!row || row.last_daily_bonus === today) return { claimed: false };
        const streak = row.last_daily_bonus === yesterday ? (row.daily_streak || 0) + 1 : 1;
        const update = await tx.run(
            'UPDATE users SET last_daily_bonus = ?, daily_streak = ?, coins = COALESCE(coins, 0) + ? WHERE id = ? AND (last_daily_bonus IS NULL OR last_daily_bonus <> ?)',
            [today, streak, 20, userId, today]
        );
        if (update.changes !== 1) return { claimed: false };
        const balance = await tx.get('SELECT coins FROM users WHERE id = ?', [userId]);
        return { claimed: true, coins: balance?.coins || 0, streak };
    }).then(result => {
        if (!result.claimed) return cb && cb(false);
        if (io) io.to('user_' + userId).emit('coinsUpdate', { coins: result.coins, delta: 20, reason: 'daily_bonus' });
        const { awardDailyAchievements } = require('./achievementService');
        awardDailyAchievements(userId, result.streak, io)
            .then(() => cb && cb(true))
            .catch(() => cb && cb(true));
    }).catch(() => cb && cb(false));
}

module.exports = { getCoins, awardCoins, spendCoins, checkAndAwardDailyBonus };
