'use strict';

jest.mock('../../db', () => ({
    type: 'sqlite',
    get: jest.fn(),
    all: jest.fn(),
    transaction: jest.fn(),
}));
jest.mock('../../services/achievementRewards', () => ({
    getReward: jest.fn(() => 1),
}));
jest.mock('../../utils/logger', () => ({
    warn: jest.fn(),
}));

const db = require('../../db');
const { checkAndAward } = require('../../services/achievementService');

const flushAsyncAwards = () => new Promise(resolve => setImmediate(resolve));

describe('achievement conditions', () => {
    let awarded;
    let totals;
    let pvpStats;
    let recentGames;

    beforeEach(() => {
        awarded = [];
        totals = { total: 100, cats: 5 };
        pvpStats = { wins: 10, draws: 3 };
        recentGames = [
            { winner_id: 7 },
            { winner_id: 7 },
            { winner_id: 7 },
            { winner_id: 7 },
            { winner_id: 7 },
        ];

        db.get.mockImplementation((sql, params, callback) => {
            if (sql.includes('COUNT(DISTINCT category)')) return callback(null, totals);
            if (sql.includes('SUM(CASE WHEN winner_id')) return callback(null, pvpStats);
            throw new Error(`Unexpected achievement query: ${sql}`);
        });
        db.all.mockImplementation((sql, params, callback) => callback(null, recentGames));
        db.transaction.mockImplementation(async work => work({
            run: async (sql, params) => {
                if (sql.includes('user_achievements')) {
                    awarded.push(params[1]);
                    return { changes: 1 };
                }
                return { changes: 1 };
            },
            get: async () => ({ coins: 1 }),
        }));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('uses lifetime PvP totals and current-game values together', async () => {
        checkAndAward(7, {
            isBotGame: false,
            isWinner: true,
            category: 'unicode',
            maxCombo: 5,
            failedFlips: 0,
            gridSize: 8,
            myScore: 10,
            oppScore: 4,
            hintsUsed: 0,
        });
        await flushAsyncAwards();

        expect(new Set(awarded)).toEqual(new Set([
            'big_board', 'unicode_explorer', 'combo_master', 'flawless',
            'no_hints_win', 'big_win', 'veteran', 'experienced', 'centurion',
            'omnivore', 'winner', 'pvp_champion', 'first_win',
            'win_streak_3', 'win_streak_5',
        ]));
    });

    test('uses the complete draw total instead of only recent PvP rows', async () => {
        pvpStats = { wins: 0, draws: 3 };
        recentGames = [{ winner_id: 99 }, { winner_id: 7 }];

        checkAndAward(7, {
            isBotGame: false,
            isWinner: false,
            category: 'animals',
            maxCombo: 1,
            failedFlips: 1,
            gridSize: 6,
            myScore: 5,
            oppScore: 5,
            hintsUsed: 1,
        });
        await flushAsyncAwards();

        expect(awarded).toContain('draw_king');
        expect(awarded).not.toContain('winner');
        expect(awarded).not.toContain('first_win');
    });
});