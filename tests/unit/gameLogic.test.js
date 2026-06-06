'use strict';
// All dependencies must be mocked BEFORE requiring the module under test
jest.mock('../../db', () => ({ run: jest.fn(), get: jest.fn(), all: jest.fn(), type: 'sqlite' }));
jest.mock('../../services/roomManager', () => ({
    getRoom: jest.fn(),
    deleteRoom: jest.fn(),
    markRoomsDirty: jest.fn(),
    broadcastRoomsList: jest.fn()
}));
jest.mock('../../services/leaderboardService',  () => ({ invalidateLeaderboard: jest.fn() }));
jest.mock('../../services/botTracker',          () => ({ markFinished: jest.fn() }));
jest.mock('../../services/gameHistory',         () => ({ addGameResult: jest.fn() }));
jest.mock('../../services/achievementService',  () => ({ checkAndAward: jest.fn(), getAllWithStatus: jest.fn() }));
jest.mock('../../services/botLogic',            () => ({ playBotTurn: jest.fn() }));
jest.mock('../../websocket/chatHandlers',       () => ({ cleanChatHistory: jest.fn() }));

const { throttleCardClick, clearThrottleInterval } = require('../../services/gameLogic');

afterAll(() => clearThrottleInterval());

describe('throttleCardClick', () => {
    test('allows the first click for a new user', () => {
        expect(throttleCardClick('user-new-1', Date.now())).toBe(true);
    });

    test('blocks a second click within 300 ms', () => {
        const now = Date.now();
        throttleCardClick('user-rapid', now);
        expect(throttleCardClick('user-rapid', now + 100)).toBe(false);
        expect(throttleCardClick('user-rapid', now + 299)).toBe(false);
    });

    test('allows a click after exactly 300 ms have elapsed', () => {
        const now = Date.now();
        throttleCardClick('user-cooldown', now);
        expect(throttleCardClick('user-cooldown', now + 300)).toBe(true);
    });

    test('allows a click well after the cooldown', () => {
        const now = Date.now();
        throttleCardClick('user-wait', now);
        expect(throttleCardClick('user-wait', now + 500)).toBe(true);
    });

    test('tracks different users independently', () => {
        const now = Date.now();
        throttleCardClick('user-a', now);
        throttleCardClick('user-b', now);
        // Both are throttled independently
        expect(throttleCardClick('user-a', now + 50)).toBe(false);
        expect(throttleCardClick('user-b', now + 50)).toBe(false);
        // But both recover after cooldown
        expect(throttleCardClick('user-a', now + 350)).toBe(true);
        expect(throttleCardClick('user-b', now + 350)).toBe(true);
    });

    test('resets timestamp on each allowed click', () => {
        const t0 = Date.now();
        throttleCardClick('user-reset', t0);
        // After cooldown, second click is allowed and resets the timer
        throttleCardClick('user-reset', t0 + 400);
        // Now another rapid click should be blocked again
        expect(throttleCardClick('user-reset', t0 + 450)).toBe(false);
    });

    test('accepts string and numeric user IDs', () => {
        expect(throttleCardClick('string-id', Date.now())).toBe(true);
        expect(throttleCardClick(999, Date.now())).toBe(true);
    });
});
