const express = require('express');
const router = express.Router();
const db = require('../db');
const hintSettings = require('../services/hintSettings');
const coinsService = require('../services/coinsService');
const { awardDailyAchievements } = require('../services/achievementService');

function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) return res.status(401).json({ error: 'auth' });
    next();
}

function todayStr() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

function calcReward(base, streak) {
    return base * Math.min(Math.max(streak, 1), 50);
}

router.get('/status', requireAuth, (req, res) => {
    const userId = req.session.userId;
    db.get('SELECT last_daily_bonus, daily_streak FROM users WHERE id = ?', [userId], (err, row) => {
        if (err || !row) return res.status(500).json({ error: 'db' });
        const today = todayStr();
        const last  = row.last_daily_bonus || '';
        const streak = row.daily_streak || 0;

        const available = last !== today;

        // Какой стрик будет при следующем получении
        let nextStreak;
        if (!available) {
            // Уже получили сегодня — стрик актуален
            nextStreak = streak;
        } else {
            // Считаем: вчера было last?
            const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
            nextStreak = (last === yesterday) ? streak + 1 : 1;
        }

        const cfg = hintSettings.get();
        const base = cfg.daily_base_reward || 5;

        const todayReward    = calcReward(base, nextStreak);
        const tomorrowReward = calcReward(base, nextStreak + 1);

        res.json({
            available,
            streak: available ? nextStreak - 1 : streak, // текущий (до получения)
            nextStreak,
            todayReward,
            tomorrowReward,
            lastClaimed: last || null,
        });
    });
});

router.post('/claim', requireAuth, (req, res) => {
    const userId = req.session.userId;
    const io = req.app.get('io');
    const today = todayStr();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    const cfg = hintSettings.get();
    const base = cfg.daily_base_reward || 5;

    db.transaction(async (tx) => {
        const row = await tx.get('SELECT last_daily_bonus, daily_streak FROM users WHERE id = ?', [userId]);
        if (!row) throw Object.assign(new Error('not_found'), { code: 'NOT_FOUND' });
        if (row.last_daily_bonus === today) return { claimed: false };

        const newStreak = row.last_daily_bonus === yesterday ? (row.daily_streak || 0) + 1 : 1;
        const coins = calcReward(base, newStreak);
        const update = await tx.run(
            'UPDATE users SET last_daily_bonus = ?, daily_streak = ?, coins = COALESCE(coins, 0) + ? WHERE id = ? AND (last_daily_bonus IS NULL OR last_daily_bonus <> ?)',
            [today, newStreak, coins, userId, today]
        );
        if (update.changes !== 1) return { claimed: false };
        const balance = await tx.get('SELECT coins FROM users WHERE id = ?', [userId]);
        return { claimed: true, coins, newStreak, tomorrowReward: calcReward(base, newStreak + 1), newBalance: balance?.coins || 0 };
    }).then(result => {
        if (!result.claimed) return res.json({ ok: false, reason: 'already_claimed' });
        if (io) io.to('user_' + userId).emit('coinsUpdate', { coins: result.newBalance, delta: result.coins, reason: 'daily_reward' });
        awardDailyAchievements(userId, result.newStreak, io);
        res.json({ ok: true, coins: result.coins, streak: result.newStreak, tomorrowReward: result.tomorrowReward, newBalance: result.newBalance });
    }).catch(err => {
        if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'user_not_found' });
        res.status(500).json({ error: 'db' });
    });
});

module.exports = router;
