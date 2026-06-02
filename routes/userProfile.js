const express = require('express');
const db = require('../db');
const { getUserPvpStats, getUserBotStats, getUserHistory } = require('../services/gameHistory');
const { getUserAchievements } = require('../services/achievementService');

const router = express.Router();

router.get('/:username/profile', (req, res) => {
    const username = String(req.params.username).substring(0, 32);
    db.get('SELECT id, username, avatar FROM users WHERE username = ?', [username], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });

        const userId = user.id;

        getUserPvpStats(userId, (e1, pvp) => {
            getUserBotStats(userId, (e2, bot) => {
                getUserAchievements(userId, (achievements) => {
                    getUserHistory(userId, 10, (e3, history) => {
                        db.all(
                            `SELECT category, card_value, matches AS max_matches
                             FROM user_card_stats s
                             WHERE user_id = ?
                               AND NOT EXISTS (
                                   SELECT 1 FROM user_card_stats other
                                   WHERE other.user_id = s.user_id
                                     AND other.category = s.category
                                     AND (other.matches > s.matches OR (other.matches = s.matches AND other.card_value < s.card_value))
                               )
                             ORDER BY category`,
                            [userId],
                            (e4, topCards) => {
                                res.json({
                                    username: user.username,
                                    avatar: user.avatar || '😶',
                                    pvp: pvp || { total: 0, wins: 0, draws: 0, losses: 0 },
                                    bot: bot || [],
                                    achievements: achievements || [],
                                    history: history || [],
                                    topCards: topCards || []
                                });
                            }
                        );
                    });
                });
            });
        });
    });
});

module.exports = router;
