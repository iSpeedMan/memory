const crypto = require('crypto');

const CSRF_HEADER = 'x-csrf-token';

const EXEMPT_PATHS = new Set([
    '/api/login',
    '/api/register',
    '/api/forgot-password',
    '/api/reset-password',
    '/api/session',
    '/api/csrf',
]);

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function getToken(req) {
    if (!req.session.csrfToken) {
        req.session.csrfToken = generateToken();
    }
    return req.session.csrfToken;
}

function csrfMiddleware(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (EXEMPT_PATHS.has(req.path)) return next();
    if (!req.session?.userId) return next();

    const sessionToken = req.session.csrfToken;
    const headerToken = req.headers[CSRF_HEADER];

    if (!sessionToken || !headerToken || sessionToken !== headerToken) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    next();
}

module.exports = { csrfMiddleware, getToken };
