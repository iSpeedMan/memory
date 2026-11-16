'use strict';

const db = require('../../db');
const shopService = require('../../services/shopService');
const friendsService = require('../../services/friendsService');
const leaderboardService = require('../../services/leaderboardService');

const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
    });
});

const getShopItems = userId => new Promise((resolve, reject) => {
    shopService.getShopItems(userId, (err, items) => err ? reject(err) : resolve(items));
});

const serviceCall = (method, ...args) => new Promise((resolve, reject) => {
    shopService[method](...args, (err, result) => err ? reject(err) : resolve(result));
});

const suffix = Date.now();
const itemKey = `test_name_color_${suffix}`;
const hiddenKey = `test_hidden_color_${suffix}`;
let userId;
let friendId;
const leaderboardCategory = `shop_test_${suffix}`;

const getFriends = user => new Promise((resolve, reject) => {
    friendsService.getFriends(user, (err, friends) => err ? reject(err) : resolve(friends));
});

describe('cosmetic shop ownership and display', () => {
    beforeAll(async () => {
        await new Promise(resolve => setTimeout(resolve, 250));
        const user = await run(
            "INSERT INTO users (username, password, coins) VALUES (?, 'test', 1000)",
            [`shop_test_${suffix}`]
        );
        userId = user.lastID;
        const friend = await run(
            "INSERT INTO users (username, password, coins) VALUES (?, 'test', 1000)",
            [`shop_friend_${suffix}`]
        );
        friendId = friend.lastID;
        await run(
            "INSERT INTO friends (requester_id, addressee_id, status) VALUES (?, ?, 'accepted')",
            [userId, friendId]
        );
        await run(
            `INSERT INTO shop_items (item_key, category, name, price_mc, rarity, preview_data, is_active)
             VALUES (?, 'name_color', 'Test Rose', 180, 'rare', ?, 1)`,
            [itemKey, JSON.stringify({ color: '#fb7185', name_ru: 'Тестовый розовый' })]
        );
        await run(
            `INSERT INTO shop_items (item_key, category, name, price_mc, rarity, preview_data, is_active)
             VALUES (?, 'name_color', 'Hidden Test', 160, 'rare', ?, 0)`,
            [hiddenKey, JSON.stringify({ color: '#a3e635' })]
        );
    });

    afterAll(async () => {
        if (userId) {
            await run('DELETE FROM user_inventory WHERE user_id = ?', [userId]);
            await run('DELETE FROM friends WHERE requester_id = ? OR addressee_id = ?', [userId, userId]);
            await run('DELETE FROM users WHERE id = ?', [userId]);
        }
        await run('DELETE FROM leaderboard WHERE username = ?', [`shop_friend_${suffix}`]);
        if (friendId) await run('DELETE FROM users WHERE id = ?', [friendId]);
        await run('DELETE FROM shop_items WHERE item_key IN (?, ?)', [itemKey, hiddenKey]);
    });

    test('buying records ownership and charges the balance once', async () => {
        const result = await serviceCall('buyItem', userId, itemKey);
        expect(result.ok).toBe(true);
        expect(result.newBalance).toBe(820);

        const items = await getShopItems(userId);
        expect(items.find(item => item.item_key === itemKey)).toMatchObject({
            owned: true,
            equipped: false,
            available: true,
        });
    });

    test('archiving hides unowned items but preserves purchases', async () => {
        const archived = await serviceCall('adminDeleteItem', itemKey);
        expect(archived).toEqual({ archived: true });

        const items = await getShopItems(userId);
        expect(items.find(item => item.item_key === itemKey)).toMatchObject({
            owned: true,
            available: false,
        });
        expect(items.some(item => item.item_key === hiddenKey)).toBe(false);

        const adminItems = await serviceCall('adminGetAllItems');
        expect(adminItems.find(item => item.item_key === itemKey)).toMatchObject({
            category: 'name_color',
            is_active: 0,
            owners_count: 1,
        });
    });

    test('an owner can equip an archived cosmetic and see its effect', async () => {
        const equipped = await serviceCall('equipItem', userId, itemKey);
        expect(equipped).toMatchObject({ ok: true, category: 'name_color', item_key: itemKey });

        const cosmetics = await serviceCall('getUserCosmetics', userId);
        expect(cosmetics.name_color).toMatchObject({ item_key: itemKey, color: '#fb7185' });
        const player = await serviceCall('getPlayerGameCosmetics', userId);
        expect(player.nameColor).toBe('#fb7185');
    });

    test('friend records include equipped cosmetic presentation data', async () => {
        await run('UPDATE users SET active_name_color = ? WHERE id = ?', [itemKey, friendId]);
        const friends = await getFriends(userId);
        expect(friends).toContainEqual(expect.objectContaining({
            friend_id: friendId,
            name_color: '#fb7185',
        }));

        await run(
            'INSERT INTO leaderboard (username, category, score) VALUES (?, ?, 42)',
            [`shop_friend_${suffix}`, leaderboardCategory]
        );
        const leaderboard = await new Promise(resolve => leaderboardService.getLeaderboard(leaderboardCategory, resolve));
        expect(leaderboard).toContainEqual(expect.objectContaining({
            username: `shop_friend_${suffix}`,
            totalScore: 42,
            nameColor: '#fb7185',
        }));
    });

    test('a non-owner cannot equip an archived item', async () => {
        const result = await serviceCall('equipItem', userId, hiddenKey);
        expect(result).toEqual({ ok: false, error: 'item_not_found' });
    });

    test('preview validation rejects unsafe colors and class names', () => {
        expect(shopService.validatePreviewData('name_color', { color: 'red;position:fixed' })).toBe('invalid_color');
        expect(shopService.validatePreviewData('avatar_frame', { css_class: 'arbitrary-class' })).toBe('invalid_css_class');
        expect(shopService.sanitizePreviewData('name_color', { color: 'red', name_ru: 'OK' })).toEqual({ name_ru: 'OK' });
        expect(shopService.sanitizePreviewData('title', { label: 'Первопроходец' }).css_class).toBe('shop-title-veteran');
    });
});
