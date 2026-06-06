'use strict';
const request = require('supertest');

let app;
beforeAll(() => {
    ({ app } = require('../../app'));
});

describe('GET /health', () => {
    test('returns 200 with status ok', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    test('includes numeric uptime', async () => {
        const res = await request(app).get('/health');
        expect(typeof res.body.uptime).toBe('number');
        expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    });

    test('includes numeric timestamp', async () => {
        const before = Date.now();
        const res = await request(app).get('/health');
        const after = Date.now();
        expect(typeof res.body.timestamp).toBe('number');
        expect(res.body.timestamp).toBeGreaterThanOrEqual(before);
        expect(res.body.timestamp).toBeLessThanOrEqual(after);
    });
});

describe('GET /api/csrf', () => {
    test('returns 200 with a token string', async () => {
        const res = await request(app).get('/api/csrf');
        expect(res.status).toBe(200);
        expect(typeof res.body.token).toBe('string');
        expect(res.body.token.length).toBeGreaterThan(0);
    });

    test('token is a 64-char hex string', async () => {
        const res = await request(app).get('/api/csrf');
        expect(/^[0-9a-f]{64}$/.test(res.body.token)).toBe(true);
    });

    test('returns a new token for a new session', async () => {
        const res1 = await request(app).get('/api/csrf');
        const res2 = await request(app).get('/api/csrf');
        expect(res1.body.token).not.toBe(res2.body.token);
    });
});
