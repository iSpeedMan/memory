const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
    const category = req.query.category;
    let query = "SELECT username, SUM(score) as totalScore FROM leaderboard ";
    let params = [];
    if (category && category !== 'all') {
        query += "WHERE category = ? ";
        params.push(category);
    }
    query += "GROUP BY username ORDER BY totalScore DESC LIMIT 10";
    db.all(query, params, (err, rows) => res.json(err ? [] : rows));
});

module.exports = router;