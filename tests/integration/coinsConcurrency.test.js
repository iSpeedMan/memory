'use strict';

const db = require('../../db');
const coinsService = require('../../services/coinsService');
const shopService = require('../../services/shopService');

const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
    });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});

const claimFixedDaily = () => new Promise(resolve => {
    coinsService.checkAndAwardDailyBonus(1, null, resolve);
});

const buyItem = () => new Promise(resolve => {
    shopService.buyItem(1, 'concurrency_item', (_, result) => resolve(result));
});

describe('coin operations under concurrent requests', () => {
    beforeAll(async () => {
        await new Promise(resolve => setTimeout(resolve, 250));
        await run("INSERT INTO users (username, password, coins) VALUES ('concurrency-user', 'test', 10000)");
        await run(
            "INSERT INTO shop_items (item_key, category, name, price_mc, rarity, preview_data, is_active) VALUES ('concurrency_item', 'card_skin', 'Concurrency Item', 150, 'rare', '{}', 1)"
        );
    });

    test('daily reward is issued exactly once across 100 requests', async () => {
        const results = await Promise.all(Array.from({ length: 100 }, claimFixedDaily));
        const user = await get('SELECT coins FROM users WHERE id = 1');
        expect(results.filter(Boolean)).toHaveLength(1);
        expect(user.coins).toBe(10020);
    });

    test('a shop item is purchased exactly once across 100 requests', async () => {
        const results = await Promise.all(Array.from({ length: 100 }, buyItem));
        const user = await get('SELECT coins FROM users WHERE id = 1');
        const inventory = await get(
            "SELECT COUNT(*) AS count FROM user_inventory WHERE user_id = 1 AND item_key = 'concurrency_item'"
        );
        expect(results.filter(result => result.ok)).toHaveLength(1);
        expect(user.coins).toBe(9900);
        expect(inventory.count).toBe(1);
    });
});