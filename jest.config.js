'use strict';
module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    setupFiles: ['./tests/setup.js'],
    collectCoverageFrom: [
        'utils/**/*.js',
        'services/gameLogic.js',
        'services/roomManager.js',
        'services/leaderboardService.js',
        'middleware/rateLimit.js',
        'middleware/csrf.js'
    ],
    coverageThreshold: {
        global: { branches: 30, functions: 30, lines: 30, statements: 30 }
    },
    testTimeout: 10000,
    clearMocks: true
};
