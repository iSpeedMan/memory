const db = require('../db');

function getCoins(userId, cb) {
    db.get('SELECT coins FROM users WHERE id = ?', [userId], (err, row) => {
        cb(err, row ? (row.coins || 0) : 0);
    });
}

function awardCoins(userId, amount, io, reason) {
    if (!userId || userId === 'bot_cpu' || !amount || amount <= 0) return;
    db.run('UPDATE users SET coins = COALESCE(coins, 0) + ? WHERE id = ?', [amount, userId], function(err) {
        if (err) return;
        db.get('SELECT coins FROM users WHERE id = ?', [userId], (err2, row) => {
            if (err2 || !row) return;
            if (io) io.to('user_' + userId).emit('coinsUpdate', { coins: row.coins, delta: amount, reason: reason || 'game' });
        });
    });
}

function spendCoins(userId, amount, cb) {
    if (!userId || userId === 'bot_cpu') return cb(null, { ok: false, reason: 'invalid' });
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
    db.get('SELECT last_daily_bonus FROM users WHERE id = ?', [userId], (err, row) => {
        if (err || !row) return cb && cb(false);
        if (row.last_daily_bonus === today) return cb && cb(false);
        db.run('UPDATE users SET last_daily_bonus = ? WHERE id = ?', [today, userId], (err2) => {
            if (err2) return cb && cb(false);
            awardCoins(userId, 20, io, 'daily_bonus');
            const { awardAchievement } = require('./achievementService');
            awardAchievement(userId, 'daily_devotee', io);
            cb && cb(true);
        });
    });
}

module.exports = { getCoins, awardCoins, spendCoins, checkAndAwardDailyBonus };
