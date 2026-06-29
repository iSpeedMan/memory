const express = require('express');
const router = express.Router();
const db = require('../db');
const hintSettings = require('../services/hintSettings');
const coinsService = require('../services/coinsService');
const { awardAchievement } = require('../services/achievementService');

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

    db.get('SELECT last_daily_bonus, daily_streak FROM users WHERE id = ?', [userId], (err, row) => {
        if (err || !row) return res.status(500).json({ error: 'db' });

        if (row.last_daily_bonus === today) {
            return res.json({ ok: false, reason: 'already_claimed' });
        }

        const newStreak = (row.last_daily_bonus === yesterday)
            ? (row.daily_streak || 0) + 1
            : 1;

        const cfg = hintSettings.get();
        const base = cfg.daily_base_reward || 5;
        const coins = calcReward(base, newStreak);
        const tomorrowReward = calcReward(base, newStreak + 1);

        db.run(
            'UPDATE users SET last_daily_bonus = ?, daily_streak = ? WHERE id = ?',
            [today, newStreak, userId],
            (uerr) => {
                if (uerr) return res.status(500).json({ error: 'db' });

                coinsService.awardCoins(userId, coins, io, 'daily_reward');

                // Достижения
                awardAchievement(userId, 'daily_devotee', io);
                if (newStreak >= 25) awardAchievement(userId, 'daily_streak_25', io);
                if (newStreak >= 50) awardAchievement(userId, 'daily_streak_50', io);

                res.json({ ok: true, coins, streak: newStreak, tomorrowReward });
            }
        );
    });
});

module.exports = router;
