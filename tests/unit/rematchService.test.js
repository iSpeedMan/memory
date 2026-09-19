'use strict';

const rematchService = require('../../services/rematchService');

describe('rematchService', () => {
    afterEach(() => {
        rematchService.cancel('test-rematch');
    });

    test('starts only after both original players accept', () => {
        rematchService.createRematch('test-rematch', { p1Id: 1, p2Id: 2 });
        const onBothAccepted = jest.fn();

        expect(rematchService.requestRematch('test-rematch', 1, onBothAccepted)).toEqual({
            status: 'waiting',
            otherUserId: 2
        });
        expect(rematchService.requestRematch('test-rematch', 2, onBothAccepted)).toEqual({
            status: 'start'
        });
        expect(onBothAccepted).toHaveBeenCalledTimes(1);
    });

    test('rejects users who were not in the finished game', () => {
        rematchService.createRematch('test-rematch', { p1Id: 1, p2Id: 2 });

        expect(rematchService.requestRematch('test-rematch', 3, jest.fn())).toEqual({
            status: 'forbidden'
        });
    });
});