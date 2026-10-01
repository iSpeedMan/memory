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

describe('Profile avatar persistence', () => {
    test('keeps the saved avatar after a fresh session read', async () => {
        const agent = request.agent(app);
        const username = `avatar_${Date.now()}`;
        const registerRes = await agent
            .post('/api/register')
            .send({ username, password: 'validpassword1' });
        expect(registerRes.status).toBe(200);

        const csrfRes = await agent.get('/api/csrf');
        const csrfToken = csrfRes.body.token;
        expect(typeof csrfToken).toBe('string');

        const saveRes = await agent
            .post('/api/profile')
            .set('x-csrf-token', csrfToken)
            .send({
                email: '',
                newPassword: '',
                avatar: '🚇',
                theme: 'dark',
                language: 'auto',
                chatDisabled: false,
                gender: ''
            });
        expect(saveRes.status).toBe(200);
        expect(saveRes.body.success).toBe(true);
        expect(saveRes.body.avatar).toBe('🚇');

        const sessionRes = await agent.get('/api/session');
        expect(sessionRes.status).toBe(200);
        expect(sessionRes.body.loggedIn).toBe(true);
        expect(sessionRes.body.avatar).toBe('🚇');
    });
});

describe('POST /api/logout', () => {
    test('returns success even when not logged in', async () => {
        const res = await request(app).post('/api/logout');
        expect([200, 302]).toContain(res.status);
    });
});
