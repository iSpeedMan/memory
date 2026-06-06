'use strict';
const { escHtml, cleanRoomData } = require('../../utils/helpers');

describe('escHtml', () => {
    test('returns empty string for falsy values', () => {
        expect(escHtml(null)).toBe('');
        expect(escHtml(undefined)).toBe('');
        expect(escHtml('')).toBe('');
        expect(escHtml(0)).toBe('');
    });

    test('escapes ampersand', () => {
        expect(escHtml('a & b')).toBe('a &amp; b');
    });

    test('escapes angle brackets', () => {
        expect(escHtml('<script>')).toBe('&lt;script&gt;');
        expect(escHtml('</div>')).toBe('&lt;/div&gt;');
    });

    test('escapes double quotes', () => {
        expect(escHtml('"hello"')).toBe('&quot;hello&quot;');
    });

    test("escapes single quotes", () => {
        expect(escHtml("it's")).toBe('it&#39;s');
    });

    test('escapes all special characters together', () => {
        expect(escHtml('<b class="x">Hello & \'World\'</b>')).toBe(
            '&lt;b class=&quot;x&quot;&gt;Hello &amp; &#39;World&#39;&lt;/b&gt;'
        );
    });

    test('coerces numbers to strings', () => {
        expect(escHtml(42)).toBe('42');
        expect(escHtml(3.14)).toBe('3.14');
    });

    test('coerces booleans to strings', () => {
        expect(escHtml(true)).toBe('true');
        expect(escHtml(false)).toBe('');
    });

    test('returns plain text unchanged', () => {
        expect(escHtml('hello world')).toBe('hello world');
    });

    test('handles multiple occurrences', () => {
        expect(escHtml('a<b>c<d>')).toBe('a&lt;b&gt;c&lt;d&gt;');
    });
});

describe('cleanRoomData', () => {
    const baseRoom = {
        id: 'room-1',
        name: 'Test Room',
        creatorName: 'Alice',
        creatorAvatar: '😊',
        category: 'animals',
        status: 'waiting',
        isPrivate: false,
        gridSize: 4,
        totalPairs: 8,
        players: [
            { name: 'Alice', avatar: '😊', id: 1, score: 0, isBot: false, secret: 'should-strip' }
        ]
    };

    test('returns null for null input', () => {
        expect(cleanRoomData(null)).toBeNull();
    });

    test('returns null for undefined input', () => {
        expect(cleanRoomData(undefined)).toBeNull();
    });

    test('returns correct top-level shape', () => {
        const result = cleanRoomData(baseRoom);
        expect(result).toMatchObject({
            id: 'room-1',
            name: 'Test Room',
            creatorName: 'Alice',
            creatorAvatar: '😊',
            category: 'animals',
            status: 'waiting',
            isPrivate: false,
            gridSize: 4,
            totalPairs: 8
        });
    });

    test('exposes only allowed player fields', () => {
        const result = cleanRoomData(baseRoom);
        expect(result.players).toHaveLength(1);
        expect(result.players[0]).toEqual({ name: 'Alice', avatar: '😊', id: 1, score: 0 });
        expect(result.players[0].isBot).toBeUndefined();
        expect(result.players[0].secret).toBeUndefined();
    });

    test('defaults gridSize to 6 when missing', () => {
        const result = cleanRoomData({ ...baseRoom, gridSize: undefined });
        expect(result.gridSize).toBe(6);
    });

    test('defaults totalPairs to 18 when missing', () => {
        const result = cleanRoomData({ ...baseRoom, totalPairs: undefined });
        expect(result.totalPairs).toBe(18);
    });

    test('defaults isPrivate to false when missing', () => {
        const result = cleanRoomData({ ...baseRoom, isPrivate: undefined });
        expect(result.isPrivate).toBe(false);
    });

    test('omits categoryEmojis when not present', () => {
        const result = cleanRoomData(baseRoom);
        expect('categoryEmojis' in result).toBe(false);
    });

    test('includes categoryEmojis when present', () => {
        const emojis = ['🐶', '🐱', '🐭'];
        const result = cleanRoomData({ ...baseRoom, categoryEmojis: emojis });
        expect(result.categoryEmojis).toEqual(emojis);
    });

    test('handles empty players array', () => {
        const result = cleanRoomData({ ...baseRoom, players: [] });
        expect(result.players).toEqual([]);
    });

    test('handles multiple players', () => {
        const room = {
            ...baseRoom,
            players: [
                { name: 'Alice', avatar: '😊', id: 1, score: 5, combo: 3 },
                { name: 'Bob',   avatar: '🎃', id: 2, score: 3, combo: 1 }
            ]
        };
        const result = cleanRoomData(room);
        expect(result.players).toHaveLength(2);
        expect(result.players[0].combo).toBeUndefined();
        expect(result.players[1].combo).toBeUndefined();
        expect(result.players[0].score).toBe(5);
        expect(result.players[1].score).toBe(3);
    });
});
