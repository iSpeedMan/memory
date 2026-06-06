'use strict';
const {
    getRoom, createRoom, deleteRoom, getAllRooms,
    cleanupOldRooms, markRoomsDirty, roomsListCache
} = require('../../services/roomManager');

function makeRoom(overrides = {}) {
    return {
        id: 'r1',
        name: 'Test Room',
        creatorName: 'Alice',
        creatorAvatar: '😊',
        category: 'animals',
        status: 'waiting',
        isPrivate: false,
        gridSize: 4,
        totalPairs: 8,
        createdAt: Date.now(),
        players: [{ name: 'Alice', avatar: '😊', id: 1, score: 0 }],
        ...overrides
    };
}

function clearAllRooms() {
    Object.keys(getAllRooms()).forEach(id => deleteRoom(id));
}

beforeEach(clearAllRooms);
afterAll(clearAllRooms);

const mockIo = () => ({ to: () => ({ emit: jest.fn() }), emit: jest.fn() });

// ───────────────────────────── createRoom / getRoom ──────────────────────────

describe('createRoom + getRoom', () => {
    test('stores and retrieves a room by id', () => {
        createRoom('r1', makeRoom({ id: 'r1', name: 'Alpha' }));
        expect(getRoom('r1')).toBeDefined();
        expect(getRoom('r1').name).toBe('Alpha');
    });

    test('returns undefined for unknown room id', () => {
        expect(getRoom('does-not-exist')).toBeUndefined();
    });

    test('marks cache dirty after creation', () => {
        roomsListCache.dirty = false;
        createRoom('r-dirty', makeRoom({ id: 'r-dirty' }));
        expect(roomsListCache.dirty).toBe(true);
    });

    test('overwrites existing room with same id', () => {
        createRoom('r1', makeRoom({ id: 'r1', name: 'First' }));
        createRoom('r1', makeRoom({ id: 'r1', name: 'Second' }));
        expect(getRoom('r1').name).toBe('Second');
    });
});

// ────────────────────────────────── deleteRoom ───────────────────────────────

describe('deleteRoom', () => {
    test('returns true and removes an existing room', () => {
        createRoom('r2', makeRoom({ id: 'r2' }));
        expect(deleteRoom('r2')).toBe(true);
        expect(getRoom('r2')).toBeUndefined();
    });

    test('returns false for a room that does not exist', () => {
        expect(deleteRoom('ghost')).toBe(false);
    });

    test('marks cache dirty after deletion', () => {
        createRoom('r3', makeRoom({ id: 'r3' }));
        roomsListCache.dirty = false;
        deleteRoom('r3');
        expect(roomsListCache.dirty).toBe(true);
    });
});

// ────────────────────────────────── getAllRooms ───────────────────────────────

describe('getAllRooms', () => {
    test('returns an empty object when no rooms exist', () => {
        expect(getAllRooms()).toEqual({});
    });

    test('returns all created rooms', () => {
        createRoom('ra', makeRoom({ id: 'ra' }));
        createRoom('rb', makeRoom({ id: 'rb' }));
        const all = getAllRooms();
        expect(Object.keys(all)).toHaveLength(2);
        expect(all['ra']).toBeDefined();
        expect(all['rb']).toBeDefined();
    });
});

// ──────────────────────────────── cleanupOldRooms ────────────────────────────

describe('cleanupOldRooms', () => {
    test('removes waiting rooms older than 15 minutes', () => {
        const oldTs = Date.now() - 16 * 60 * 1000;
        createRoom('old-wait', makeRoom({ id: 'old-wait', status: 'waiting', createdAt: oldTs }));
        cleanupOldRooms(mockIo());
        expect(getRoom('old-wait')).toBeUndefined();
    });

    test('keeps fresh waiting rooms', () => {
        createRoom('fresh', makeRoom({ id: 'fresh', status: 'waiting', createdAt: Date.now() }));
        cleanupOldRooms(mockIo());
        expect(getRoom('fresh')).toBeDefined();
    });

    test('removes playing rooms older than 2 hours', () => {
        const oldTs = Date.now() - 3 * 60 * 60 * 1000;
        createRoom('old-play', makeRoom({ id: 'old-play', status: 'playing', createdAt: oldTs }));
        cleanupOldRooms(mockIo());
        expect(getRoom('old-play')).toBeUndefined();
    });

    test('keeps recent playing rooms', () => {
        createRoom('new-play', makeRoom({ id: 'new-play', status: 'playing', createdAt: Date.now() }));
        cleanupOldRooms(mockIo());
        expect(getRoom('new-play')).toBeDefined();
    });

    test('emits roomClosed for expired playing rooms', () => {
        const io = mockIo();
        const toSpy = jest.fn(() => ({ emit: jest.fn() }));
        io.to = toSpy;
        const oldTs = Date.now() - 3 * 60 * 60 * 1000;
        createRoom('old-play2', makeRoom({ id: 'old-play2', status: 'playing', createdAt: oldTs }));
        cleanupOldRooms(io);
        expect(toSpy).toHaveBeenCalledWith('old-play2');
    });

    test('handles multiple rooms in one pass', () => {
        const oldTs = Date.now() - 16 * 60 * 1000;
        const freshTs = Date.now();
        createRoom('expired', makeRoom({ id: 'expired', status: 'waiting', createdAt: oldTs }));
        createRoom('alive',   makeRoom({ id: 'alive',   status: 'waiting', createdAt: freshTs }));
        cleanupOldRooms(mockIo());
        expect(getRoom('expired')).toBeUndefined();
        expect(getRoom('alive')).toBeDefined();
    });
});

// ─────────────────────────────── markRoomsDirty ──────────────────────────────

describe('markRoomsDirty', () => {
    test('sets cache dirty flag to true', () => {
        roomsListCache.dirty = false;
        markRoomsDirty();
        expect(roomsListCache.dirty).toBe(true);
    });
});
