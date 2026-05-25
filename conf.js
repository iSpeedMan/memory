const env = process.env;

function intEnv(name, fallback) {
    const value = parseInt(env[name], 10);
    return Number.isFinite(value) ? value : fallback;
}

module.exports = {
    // Порт, на котором будет запущен сервер
    port: intEnv('PORT', 3000),

    // Тип базы данных: 'sqlite' или 'mysql'
    dbType: (env.MEMORY_DB_TYPE || env.DB_TYPE || 'mysql').toLowerCase(),
    // dbType: 'sqlite',

    // Настройки для SQLite
    sqlite: {
        filename: env.SQLITE_FILENAME || 'database.sqlite'
    },

    // Настройки для MySQL
    mysql: {
        host: env.MYSQL_HOST || 'localhost',
        user: env.MYSQL_USER || 'db_user',
        password: env.MYSQL_PASSWORD || 'password',
        database: env.MYSQL_DATABASE || 'db',
        port: intEnv('MYSQL_PORT', 3306)
    },

    // Настройки почты
    mail: {
        host: env.MAIL_HOST || 'mail.domain.local',
        port: intEnv('MAIL_PORT', 25),
        secure: env.MAIL_SECURE === 'true',
        auth: {
            user: env.MAIL_USER || 'user@penpot.local',
            pass: env.MAIL_PASSWORD || 'userpassword'
        },
        tls: {
            rejectUnauthorized: false
        },
        from: env.MAIL_FROM || '"Memory Game" <memory@domain.local>'
    },

    // Секретный ключ для сессий
    sessionSecret: env.SESSION_SECRET || 'a9a2c7b7ebb69be266ac515a3404a3804b7cf02fc65919e9cc4c89498d87fcaee30d983f4c02ec4f0e12d92e6e89a93394a40e560403cf7dea37d03eec6c73cb',

    // === ДАННЫЕ ПЕРВОГО АДМИНИСТРАТОРА ===
    firstAdmin: {
        username: env.FIRST_ADMIN_USERNAME || "admin",           // Логин администратора
        password: env.FIRST_ADMIN_PASSWORD || "admin123",        // Пароль (рекомендую сменить после первого запуска!)
        email: env.FIRST_ADMIN_EMAIL || "admin@memory.local"  // Email (необязательно)
    }
};
