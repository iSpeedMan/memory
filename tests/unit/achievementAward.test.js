'use strict';

jest.mock('../../db', () => ({
    type: 'sqlite',
    transaction: jest.fn(),
    all: jest.fn(),
    get: jest.fn(),
}));
jest.mock('../../services/achievementRewards', () => ({
    getReward: jest.fn(() => 75),
}));
jest.mock('../../utils/logger', () => ({
    warn: jest.fn(),
}));

const db = require('../../db');
const { awardAchievement } = require('../../services/achievementService');

describe('awardAchievement', () => {
    test('records the achievement and reward in one transaction', async () => {
        const tx = {
            run: jest.fn()
                .mockResolvedValueOnce({ changes: 1 })
                .mockResolvedValueOnce({ changes: 1 }),
            get: jest.fn().mockResolvedValue({ coins: 175 }),
        };
        db.transaction.mockImplementation(work => work(tx));
        const io = { to: jest.fn(() => ({ emit: jest.fn() })) };

        await awardAchievement(7, 'first_win', io);

        expect(tx.run).toHaveBeenNthCalledWith(
            1,
            'INSERT OR IGNORE INTO user_achievements (user_id, achievement_key) VALUES (?, ?)',
            [7, 'first_win']
        );
        expect(tx.run).toHaveBeenNthCalledWith(
            2,
            'UPDATE users SET coins = COALESCE(coins, 0) + ? WHERE id = ?',
            [75, 7]
        );
        expect(io.to).toHaveBeenCalledWith('user_7');
    });

    test('does not update the balance when the achievement was already earned', async () => {
        const tx = {
            run: jest.fn().mockResolvedValue({ changes: 0 }),
            get: jest.fn(),
        };
        db.transaction.mockImplementation(work => work(tx));

        await awardAchievement(7, 'first_win');

        expect(tx.run).toHaveBeenCalledTimes(1);
        expect(tx.get).not.toHaveBeenCalled();
    });
});