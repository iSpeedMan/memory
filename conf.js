module.exports = {
    // Порт, на котором будет запущен сервер
    port: 3000,

    // Тип базы данных: 'sqlite' или 'mysql'
    dbType: 'mysql',
    // dbType: 'sqlite',

    // Настройки для SQLite
    sqlite: {
        filename: 'database.sqlite'
    },

    // Настройки для MySQL
    mysql: {
        host: 'localhost',
        user: 'db_user',
        password: 'password',
        database: 'db',
        port: 3306
    },

    // Настройки почты
    mail: {
        host: 'mail.domain.local',
        port: 25,
        secure: false,
        auth: {
            user: 'user@penpot.local',
            pass: 'userpassword'
        },
        tls: {
            rejectUnauthorized: false
        },
        from: '"Memory Game" <memory@domain.local>'
    },

    // Секретный ключ для сессий
    sessionSecret: 'a9a2c7b7ebb69be266ac515a3404a3804b7cf02fc65919e9cc4c89498d87fcaee30d983f4c02ec4f0e12d92e6e89a93394a40e560403cf7dea37d03eec6c73cb',

    // === ДАННЫЕ ПЕРВОГО АДМИНИСТРАТОРА ===
    firstAdmin: {
        username: "admin",           // Логин администратора
        password: "admin123",        // Пароль (рекомендую сменить после первого запуска!)
        email: "admin@memory.local"  // Email (необязательно)
    }
};