const express = require('express');
const db = require('../db');
const cache = require('../middleware/apiCache');

const router = express.Router();

router.get('/', (req, res) => {
    const category = req.query.category || 'all';
    const cacheKey = `public:leaderboard:${category}`;
    const cached = cache.get(cacheKey);
    if (cached !== null) return res.json(cached);
    let query = "SELECT username, SUM(score) as totalScore FROM leaderboard ";
    let params = [];
    if (category !== 'all') {
        query += "WHERE category = ? ";
        params.push(category);
    }
    query += "GROUP BY username ORDER BY totalScore DESC LIMIT 10";
    db.all(query, params, (err, rows) => {
        const data = err ? [] : rows;
        cache.set(cacheKey, data, 30000);
        res.json(data);
    });
});

module.exports = router;
