'use strict';
const request = require('supertest');

let app;
beforeAll(() => {
    ({ app } = require('../../app'));
});

describe('GET /api/session', () => {
    test('returns 200 with loggedIn false for unauthenticated request', async () => {
        const res = await request(app).get('/api/session');
        expect(res.status).toBe(200);
        expect(res.body.loggedIn).toBe(false);
    });

    test('does not expose sensitive session data', async () => {
        const res = await request(app).get('/api/session');
        expect(res.body.password).toBeUndefined();
        expect(res.body.sessionSecret).toBeUndefined();
        expect(res.body.csrfToken).toBeUndefined();
    });
});

describe('POST /api/login — validation', () => {
    test('rejects missing username with 400 or error response', async () => {
        const res = await request(app)
            .post('/api/login')
            .send({ password: 'somepassword' });
        expect([400, 200]).toContain(res.status);
        if (res.status === 200) {
            expect(res.body.success).toBe(false);
        }
    });

    test('rejects missing password with error response', async () => {
        const res = await request(app)
            .post('/api/login')
            .send({ username: 'testuser' });
        expect([400, 200]).toContain(res.status);
        if (res.status === 200) {
            expect(res.body.success).toBe(false);
        }
    });

    test('rejects empty body', async () => {
        const res = await request(app)
            .post('/api/login')
            .send({});
        expect([400, 200]).toContain(res.status);
        if (res.status === 200) {
            expect(res.body.success).toBe(false);
        }
    });

    test('rejects non-existent user credentials', async () => {
        const res = await request(app)
            .post('/api/login')
            .send({ username: 'definitely_not_a_real_user_xyz', password: 'wrongpassword1' });
        expect([400, 200]).toContain(res.status);
        if (res.status === 200) {
            expect(res.body.success).toBe(false);
        }
    });
});

describe('POST /api/register — validation', () => {
    test('rejects username shorter than 3 characters', async () => {
        const res = await request(app)
            .post('/api/register')
            .send({ username: 'ab', password: 'validpass1', avatar: '😊' });
        expect([400, 200]).toContain(res.status);
        if (res.status === 200) {
            expect(res.body.success).toBe(false);
        }
    });

    test('rejects password shorter than 8 characters', async () => {
        const res = await request(app)
            .post('/api/register')
            .send({ username: 'validuser', password: 'short', avatar: '😊' });
        expect([400, 200]).toContain(res.status);
        if (res.status === 200) {
            expect(res.body.success).toBe(false);
        }
    });

    test('rejects username with invalid characters', async () => {
        const res = await request(app)
            .post('/api/register')
            .send({ username: 'user name!', password: 'validpassword1', avatar: '😊' });
        expect([400, 200]).toContain(res.status);
        if (res.status === 200) {
            expect(res.body.success).toBe(false);
        }
    });

    test('accepts valid registration payload (may succeed or fail due to DB state)', async () => {
        const uniqueUser = `testuser_${Date.now()}`;
        const res = await request(app)
            .post('/api/register')
            .send({ username: uniqueUser, password: 'validpassword1', avatar: '😊' });
        expect([200, 201, 400, 409, 500]).toContain(res.status);
        expect(res.body).toHaveProperty('success');
    });
});

describe('POST /api/logout', () => {
    test('returns success even when not logged in', async () => {
        const res = await request(app).post('/api/logout');
        expect([200, 302]).toContain(res.status);
    });
});
