'use strict';

const db = require('../../db');
const { ACHIEVEMENTS } = require('../../services/achievementService');
const achievementRewards = require('../../services/achievementRewards');

const waitForDb = () => new Promise(resolve => setTimeout(resolve, 250));

describe('achievement catalog and rewards', () => {
    beforeAll(waitForDb);

    test('every achievement has one admin key and a positive default reward', () => {
        const achievementKeys = Object.keys(ACHIEVEMENTS).sort();
        expect(achievementKeys).toEqual([...achievementRewards.ALL_KEYS].sort());

        achievementRewards.ALL_KEYS.forEach(key => {
            expect(achievementRewards.DEFAULTS[key]).toEqual(expect.any(Number));
            expect(achievementRewards.DEFAULTS[key]).toBeGreaterThan(0);
        });
    });

    test('all achievement rewards can be updated and persisted together', async () => {
        const updates = Object.fromEntries(
            achievementRewards.ALL_KEYS.map((key, index) => [key, 1000 + index])
        );

        await new Promise((resolve, reject) => {
            achievementRewards.set(updates, err => err ? reject(err) : resolve());
        });

        const stored = await new Promise((resolve, reject) => {
            db.all(
                'SELECT `key`, value FROM server_settings WHERE `key` LIKE ?',
                ['ach_reward_%'],
                (err, rows) => err ? reject(err) : resolve(rows)
            );
        });
        const storedByKey = new Map(stored.map(row => [row.key, Number(row.value)]));

        achievementRewards.ALL_KEYS.forEach(key => {
            expect(achievementRewards.getReward(key)).toBe(updates[key]);
            expect(storedByKey.get(`ach_reward_${key}`)).toBe(updates[key]);
        });
    });
});