'use strict';
const express = require('express');
const db      = require('../db');
const shop    = require('../services/shopService');

const router = express.Router();

function isAuth(req, res, next) {
    if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    next();
}

router.get('/items', isAuth, (req, res) => {
    shop.getShopItems(req.session.userId, (err, items) => {
        if (err) return res.status(500).json({ error: 'db_error' });
        res.json(items);
    });
});

router.get('/my', isAuth, (req, res) => {
    shop.getUserCosmetics(req.session.userId, (err, cosmetics) => {
        if (err) return res.status(500).json({ error: 'db_error' });
        res.json(cosmetics || {});
    });
});

router.post('/buy', isAuth, express.json(), (req, res) => {
    const itemKey = typeof req.body?.item_key === 'string' ? req.body.item_key.trim() : '';
    if (!itemKey) return res.status(400).json({ error: 'missing_item_key' });

    shop.buyItem(req.session.userId, itemKey, (err, result) => {
        if (err) return res.status(500).json({ error: 'db_error' });
        if (!result.ok) return res.status(400).json(result);
        res.json(result);
    });
});

router.post('/equip', isAuth, express.json(), (req, res) => {
    const itemKey = typeof req.body?.item_key === 'string' ? req.body.item_key.trim() : '';
    if (!itemKey) return res.status(400).json({ error: 'missing_item_key' });

    shop.equipItem(req.session.userId, itemKey, (err, result) => {
        if (err) return res.status(500).json({ error: 'db_error' });
        if (!result.ok) return res.status(400).json(result);
        res.json(result);
    });
});

module.exports = router;
