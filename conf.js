const env = process.env;
const crypto = require('crypto');

function intEnv(name, fallback) {
    const value = parseInt(env[name], 10);
    return Number.isFinite(value) ? value : fallback;
}

const isProduction = env.NODE_ENV === 'production';
const dbType = (env.MEMORY_DB_TYPE || env.DB_TYPE || 'sqlite').toLowerCase();
const baseUrl = env.BASE_URL ? env.BASE_URL.replace(/\/+$/, '') : null;

if (!['sqlite', 'mysql'].includes(dbType)) {
    throw new Error(`Unsupported database type: ${dbType}`);
}
if (baseUrl) {
    let parsed;
    try { parsed = new URL(baseUrl); } catch (_) { parsed = null; }
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || parsed.pathname !== '/' ||
        parsed.search || parsed.hash || parsed.username || parsed.password) {
        throw new Error('BASE_URL must be an absolute HTTP(S) URL without a path');
    }
}
if (isProduction && !baseUrl) {
    throw new Error('BASE_URL must be configured in production');
}
if (dbType === 'mysql' && isProduction) {
    for (const name of ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']) {
        if (!env[name]) throw new Error(`${name} must be configured for production MySQL`);
    }
}
let sessionSecret = env.SESSION_SECRET;
if (!sessionSecret && isProduction) {
    throw new Error('SESSION_SECRET must be configured in production');
}
if (isProduction && Buffer.byteLength(sessionSecret || '', 'utf8') < 32) {
    throw new Error('SESSION_SECRET must be at least 32 bytes in production');
}
if (!sessionSecret) {
    sessionSecret = crypto.randomBytes(64).toString('hex');
    console.warn('[SECURITY] SESSION_SECRET is not set. A random secret was generated — sessions will not survive restarts. Set SESSION_SECRET in your environment.');
}
if (isProduction && (!env.FIRST_ADMIN_PASSWORD || env.FIRST_ADMIN_PASSWORD.length < 12)) {
    throw new Error('FIRST_ADMIN_PASSWORD must be configured and at least 12 characters in production');
}
if (isProduction && (intEnv('BCRYPT_ROUNDS', 10) < 10 || intEnv('BCRYPT_ROUNDS', 10) > 15)) {
    throw new Error('BCRYPT_ROUNDS must be between 10 and 15 in production');
}

module.exports = {
    port: intEnv('PORT', 5000),

    bcryptRounds: intEnv('BCRYPT_ROUNDS', 10),

    baseUrl,

    dbType,

    sqlite: {
        filename: env.SQLITE_FILENAME || 'database.sqlite'
    },

    mysql: {
        host: env.MYSQL_HOST || 'localhost',
        user: env.MYSQL_USER || 'db_user',
        password: env.MYSQL_PASSWORD || 'password',
        database: env.MYSQL_DATABASE || 'db',
        port: intEnv('MYSQL_PORT', 3306)
    },

    redis: {
        url: env.REDIS_URL || null
    },

    mail: {
        host: env.MAIL_HOST || 'mail.domain.local',
        port: intEnv('MAIL_PORT', 25),
        secure: env.MAIL_SECURE === 'true',
        auth: {
            user: env.MAIL_USER || 'user@penpot.local',
            pass: env.MAIL_PASSWORD || 'userpassword'
        },
        tls: {
            rejectUnauthorized: process.env.MAIL_TLS_REJECT_UNAUTHORIZED !== 'false'
        },
        from: env.MAIL_FROM || '"Memory Game" <memory@domain.local>'
    },

    sessionSecret,

    swagger: {
        allowedIps: (env.SWAGGER_ALLOWED_IPS || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean),
    },

    appLang: (env.APP_LANG || 'en').toLowerCase(),

    maxConnections: intEnv('MAX_CONNECTIONS', 10000),
    heartbeatTimeoutMs: intEnv('HEARTBEAT_TIMEOUT_MS', 120000),

    firstAdmin: {
        username: env.FIRST_ADMIN_USERNAME || 'admin',
        password: env.FIRST_ADMIN_PASSWORD || (isProduction ? null : 'admin123'),
        email: env.FIRST_ADMIN_EMAIL || 'admin@memory.local'
    },

    isProduction
};
