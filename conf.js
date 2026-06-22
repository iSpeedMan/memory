const env = process.env;
const crypto = require('crypto');

function intEnv(name, fallback) {
    const value = parseInt(env[name], 10);
    return Number.isFinite(value) ? value : fallback;
}

let sessionSecret = env.SESSION_SECRET;
if (!sessionSecret) {
    sessionSecret = crypto.randomBytes(64).toString('hex');
    console.warn('[SECURITY] SESSION_SECRET is not set. A random secret was generated — sessions will not survive restarts. Set SESSION_SECRET in your environment.');
}

module.exports = {
    port: intEnv('PORT', 5000),

    bcryptRounds: intEnv('BCRYPT_ROUNDS', 10),

    baseUrl: env.BASE_URL || null,

    dbType: (env.MEMORY_DB_TYPE || env.DB_TYPE || 'sqlite').toLowerCase(),

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

    appLang: (env.APP_LANG || 'en').toLowerCase(),

    firstAdmin: {
        username: env.FIRST_ADMIN_USERNAME || 'admin',
        password: env.FIRST_ADMIN_PASSWORD || 'admin123',
        email: env.FIRST_ADMIN_EMAIL || 'admin@memory.local'
    }
};
