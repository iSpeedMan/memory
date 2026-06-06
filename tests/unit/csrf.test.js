'use strict';
const { csrfMiddleware, getToken } = require('../../middleware/csrf');

function makeReq(overrides = {}) {
    return {
        method: 'GET',
        path: '/api/some-resource',
        session: {},
        headers: {},
        ...overrides
    };
}

function makeRes() {
    const res = {};
    res.status = jest.fn(() => res);
    res.json   = jest.fn(() => res);
    return res;
}

describe('getToken', () => {
    test('generates a token and stores it in the session', () => {
        const req = makeReq();
        const token = getToken(req);
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);
        expect(req.session.csrfToken).toBe(token);
    });

    test('returns the same token on repeated calls', () => {
        const req = makeReq();
        const t1 = getToken(req);
        const t2 = getToken(req);
        expect(t1).toBe(t2);
    });

    test('generates unique tokens for different sessions', () => {
        const req1 = makeReq();
        const req2 = makeReq();
        expect(getToken(req1)).not.toBe(getToken(req2));
    });
});

describe('csrfMiddleware — safe methods', () => {
    test.each(['GET', 'HEAD', 'OPTIONS'])('%s passes through without token check', (method) => {
        const req  = makeReq({ method });
        const res  = makeRes();
        const next = jest.fn();
        csrfMiddleware(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });
});

describe('csrfMiddleware — exempt paths', () => {
    const EXEMPT = [
        '/api/login', '/api/register', '/api/forgot-password',
        '/api/reset-password', '/api/session', '/api/csrf'
    ];
    test.each(EXEMPT)('POST to %s bypasses CSRF check', (exemptPath) => {
        const req  = makeReq({ method: 'POST', path: exemptPath, session: { userId: 1 } });
        const res  = makeRes();
        const next = jest.fn();
        csrfMiddleware(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });
});

describe('csrfMiddleware — unauthenticated requests', () => {
    test('passes through when no session userId (unauthenticated)', () => {
        const req  = makeReq({ method: 'POST', path: '/api/settings', session: {} });
        const res  = makeRes();
        const next = jest.fn();
        csrfMiddleware(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });
});

describe('csrfMiddleware — authenticated mutation requests', () => {
    test('rejects POST with missing token', () => {
        const req  = makeReq({
            method: 'POST', path: '/api/profile',
            session: { userId: 1, csrfToken: 'abc123' },
            headers: {}
        });
        const res  = makeRes();
        const next = jest.fn();
        csrfMiddleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('rejects POST with wrong token', () => {
        const req  = makeReq({
            method: 'POST', path: '/api/profile',
            session: { userId: 1, csrfToken: 'correct-token' },
            headers: { 'x-csrf-token': 'wrong-token' }
        });
        const res  = makeRes();
        const next = jest.fn();
        csrfMiddleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('passes through POST with correct token', () => {
        const token = 'valid-csrf-token';
        const req   = makeReq({
            method: 'POST', path: '/api/profile',
            session: { userId: 1, csrfToken: token },
            headers: { 'x-csrf-token': token }
        });
        const res  = makeRes();
        const next = jest.fn();
        csrfMiddleware(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    test.each(['PUT', 'PATCH', 'DELETE'])('%s also requires valid token', (method) => {
        const req  = makeReq({
            method, path: '/api/profile',
            session: { userId: 1, csrfToken: 'tok' },
            headers: { 'x-csrf-token': 'wrong' }
        });
        const res  = makeRes();
        const next = jest.fn();
        csrfMiddleware(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
    });
});
