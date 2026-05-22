const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
    db.all("SELECT * FROM categories", (err, rows) => res.json(err ? [] : rows));
});

module.exports = router;