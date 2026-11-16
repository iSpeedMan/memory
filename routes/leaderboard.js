const express = require('express');
const cache = require('../middleware/apiCache');
const { getLeaderboard } = require('../services/leaderboardService');

const router = express.Router();

router.get('/', async (req, res) => {
    const category = req.query.category || 'all';
    const cacheKey = `public:leaderboard:v2:${category}`;
    try {
        const cached = await cache.get(cacheKey);
        if (cached !== null) return res.json(cached);

        getLeaderboard(category, async data => {
            try { await cache.set(cacheKey, data, 30000); } catch (_) {}
            res.json(data);
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
