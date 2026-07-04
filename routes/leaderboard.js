const express = require('express');
const db = require('../db');
const cache = require('../middleware/apiCache');

const router = express.Router();

router.get('/', async (req, res) => {
    const category = req.query.category || 'all';
    const cacheKey = `public:leaderboard:${category}`;
    try {
        const cached = await cache.get(cacheKey);
        if (cached !== null) return res.json(cached);

        let query = "SELECT username, SUM(score) as totalScore FROM leaderboard ";
        let params = [];
        if (category !== 'all') {
            query += "WHERE category = ? ";
            params.push(category);
        }
        query += "GROUP BY username ORDER BY totalScore DESC LIMIT 10";

        db.all(query, params, async (err, rows) => {
            const data = err ? [] : rows;
            try { await cache.set(cacheKey, data, 30000); } catch (_) {}
            res.json(data);
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
