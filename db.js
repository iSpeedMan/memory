const conf = require('./conf');
const path = require('path');

let dbWrapper = {
    type: conf.dbType,
    run: () => {},
    get: () => {},
    all: () => {},
    close: (callback) => { if (callback) callback(); },
    end: () => Promise.resolve()
};

if (conf.dbType === 'sqlite') {
    const sqlite3 = require('sqlite3').verbose();
    const rawFilename = conf.sqlite.filename;
    const dbPath = rawFilename === ':memory:' ? ':memory:' : path.resolve(__dirname, rawFilename);
    const db = new sqlite3.Database(dbPath);

    dbWrapper.run = function(sql, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        db.run(sql, params, function(err) {
            if (callback) callback.call(this, err);
        });
    };
    dbWrapper.get = function(sql, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        db.get(sql, params, callback);
    };
    dbWrapper.all = function(sql, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        db.all(sql, params, callback);
    };
    dbWrapper.close = function(callback) { db.close(callback); };
    dbWrapper.end = function() {
        return new Promise((resolve, reject) => { db.close(err => err ? reject(err) : resolve()); });
    };

    db.serialize(() => {
        db.run('PRAGMA journal_mode=WAL');
        db.run('PRAGMA synchronous=NORMAL');
        db.run('PRAGMA cache_size=-65536');      // 64 MB page cache
        db.run('PRAGMA temp_store=MEMORY');
        db.run('PRAGMA mmap_size=268435456');    // 256 MB memory-mapped I/O
        db.run('PRAGMA wal_autocheckpoint=1000');// checkpoint каждые 1000 страниц
        db.run('PRAGMA busy_timeout=5000');      // ждём до 5 с вместо SQLITE_BUSY

        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, email TEXT,
            is_admin INTEGER DEFAULT 0, avatar TEXT DEFAULT '😶',
            theme TEXT DEFAULT 'dark', language TEXT DEFAULT 'auto',
            reset_token TEXT, reset_expires INTEGER
        )`);

        const neededUserCols = [
            { name: 'email',             sql: "ALTER TABLE users ADD COLUMN email TEXT" },
            { name: 'is_admin',          sql: "ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0" },
            { name: 'avatar',            sql: "ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT '😶'" },
            { name: 'theme',             sql: "ALTER TABLE users ADD COLUMN theme TEXT DEFAULT 'dark'" },
            { name: 'language',          sql: "ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'auto'" },
            { name: 'reset_token',       sql: "ALTER TABLE users ADD COLUMN reset_token TEXT" },
            { name: 'reset_expires',     sql: "ALTER TABLE users ADD COLUMN reset_expires INTEGER" },
            { name: 'chat_muted_until',  sql: "ALTER TABLE users ADD COLUMN chat_muted_until INTEGER DEFAULT 0" },
            { name: 'chat_violations',   sql: "ALTER TABLE users ADD COLUMN chat_violations INTEGER DEFAULT 0" },
            { name: 'chat_disabled',     sql: "ALTER TABLE users ADD COLUMN chat_disabled INTEGER DEFAULT 0" },
            { name: 'coins',             sql: "ALTER TABLE users ADD COLUMN coins INTEGER DEFAULT 0" },
            { name: 'last_daily_bonus',  sql: "ALTER TABLE users ADD COLUMN last_daily_bonus TEXT DEFAULT NULL" },
            { name: 'gender',            sql: "ALTER TABLE users ADD COLUMN gender TEXT DEFAULT NULL" }
        ];
        db.all('PRAGMA table_info(users)', [], (err, cols) => {
            if (err || !cols) return;
            const existing = new Set(cols.map(c => c.name));
            neededUserCols.forEach(col => {
                if (!existing.has(col.name)) db.run(col.sql);
            });
        });

        db.run(`CREATE TABLE IF NOT EXISTS leaderboard (
            id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL,
            category TEXT NOT NULL, score INTEGER NOT NULL, date DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run('CREATE INDEX IF NOT EXISTS idx_leaderboard_cat_score ON leaderboard(category, score DESC)');
        db.run('CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(score DESC)');
        db.run('CREATE INDEX IF NOT EXISTS idx_leaderboard_username ON leaderboard(username)');
        db.run('CREATE INDEX IF NOT EXISTS idx_leaderboard_category ON leaderboard(category)');

        db.run(`CREATE TABLE IF NOT EXISTS user_card_stats (
            user_id INTEGER, category TEXT, card_value INTEGER, matches INTEGER DEFAULT 1,
            UNIQUE(user_id, category, card_value)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS game_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player1_id INTEGER, player2_id INTEGER,
            player1_name TEXT NOT NULL, player2_name TEXT NOT NULL,
            player1_score INTEGER DEFAULT 0, player2_score INTEGER DEFAULT 0,
            winner_id INTEGER, category TEXT,
            is_bot_game INTEGER DEFAULT 0, bot_difficulty TEXT,
            failed_flips INTEGER DEFAULT 0, max_combo INTEGER DEFAULT 0, grid_size INTEGER DEFAULT 6,
            played_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        const neededHistCols = [
            { name: 'failed_flips', sql: 'ALTER TABLE game_history ADD COLUMN failed_flips INTEGER DEFAULT 0' },
            { name: 'max_combo',    sql: 'ALTER TABLE game_history ADD COLUMN max_combo INTEGER DEFAULT 0' },
            { name: 'grid_size',    sql: 'ALTER TABLE game_history ADD COLUMN grid_size INTEGER DEFAULT 6' }
        ];
        db.all('PRAGMA table_info(game_history)', [], (err, cols) => {
            if (err || !cols) return;
            const existing = new Set(cols.map(c => c.name));
            neededHistCols.forEach(col => {
                if (!existing.has(col.name)) db.run(col.sql);
            });
        });

        db.run('CREATE INDEX IF NOT EXISTS idx_game_history_p1 ON game_history(player1_id, played_at DESC)');
        db.run('CREATE INDEX IF NOT EXISTS idx_game_history_p2 ON game_history(player2_id, played_at DESC)');
        db.run('CREATE INDEX IF NOT EXISTS idx_game_history_date ON game_history(played_at DESC)');
        db.run('CREATE INDEX IF NOT EXISTS idx_card_stats_user_matches ON user_card_stats(user_id, matches DESC)');

        db.run(`CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT, key_name TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL, emojis TEXT NOT NULL, image_url TEXT
        )`, () => {
            db.get('SELECT COUNT(*) as count FROM categories', (err, row) => {
                if (row && row.count === 0) populateDefaultCategories(dbWrapper);
            });
            db.all('PRAGMA table_info(categories)', [], (err, cols) => {
                if (err || !cols) return;
                if (!cols.find(c => c.name === 'image_url')) db.run('ALTER TABLE categories ADD COLUMN image_url TEXT');
                if (!cols.find(c => c.name === 'repr_emoji')) db.run('ALTER TABLE categories ADD COLUMN repr_emoji TEXT');
            });
        });

        db.run(`CREATE TABLE IF NOT EXISTS user_achievements (
            user_id INTEGER NOT NULL,
            achievement_key TEXT NOT NULL,
            achieved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, achievement_key)
        )`);
        db.run('CREATE INDEX IF NOT EXISTS idx_achievements_user ON user_achievements(user_id)');

        db.run(`CREATE TABLE IF NOT EXISTS server_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')`);
        db.run(`INSERT OR IGNORE INTO server_settings (key, value) VALUES ('server_info', '')`);
        db.run(`INSERT OR IGNORE INTO server_settings (key, value) VALUES ('server_info_ts', '0')`);
        db.run(`INSERT OR IGNORE INTO server_settings (key, value) VALUES ('hint_limit', '3')`);
        db.run(`INSERT OR IGNORE INTO server_settings (key, value) VALUES ('hint_cost_reveal_one', '30')`);
        db.run(`INSERT OR IGNORE INTO server_settings (key, value) VALUES ('hint_cost_reveal_pair', '50')`);
        db.run(`INSERT OR IGNORE INTO server_settings (key, value) VALUES ('hint_cost_extra_turn', '40')`);

        db.run(`CREATE TABLE IF NOT EXISTS server_announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL DEFAULT '',
            coins_reward INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS announcement_claims (
            user_id INTEGER NOT NULL,
            announcement_id INTEGER NOT NULL,
            claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, announcement_id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            requester_id INTEGER NOT NULL,
            addressee_id INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(requester_id, addressee_id)
        )`);
        db.run('CREATE INDEX IF NOT EXISTS idx_friends_requester ON friends(requester_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_friends_addressee ON friends(addressee_id)');

        db.run(`CREATE TABLE IF NOT EXISTS direct_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        db.run('CREATE INDEX IF NOT EXISTS idx_dm_conv ON direct_messages(sender_id, receiver_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_dm_recv ON direct_messages(receiver_id, is_read)');

        db.run(`CREATE TABLE IF NOT EXISTS user_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            key_name TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            emojis TEXT NOT NULL,
            image_url TEXT,
            status TEXT DEFAULT 'pending',
            submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            reviewed_by INTEGER,
            reviewed_at DATETIME
        )`);
        db.run('CREATE INDEX IF NOT EXISTS idx_user_categories_status ON user_categories(status)');
        db.all('PRAGMA table_info(user_categories)', [], (err, cols) => {
            if (err || !cols) return;
            if (!cols.find(c => c.name === 'image_url')) db.run('ALTER TABLE user_categories ADD COLUMN image_url TEXT');
            if (!cols.find(c => c.name === 'repr_emoji')) db.run('ALTER TABLE user_categories ADD COLUMN repr_emoji TEXT');
        });

        // Составные индексы для батчевых запросов достижений
        db.run('CREATE INDEX IF NOT EXISTS idx_gh_p1_pvp ON game_history(player1_id, is_bot_game, played_at DESC)');
        db.run('CREATE INDEX IF NOT EXISTS idx_gh_p2_pvp ON game_history(player2_id, is_bot_game, played_at DESC)');
        db.run('CREATE INDEX IF NOT EXISTS idx_gh_p1_cat ON game_history(player1_id, category)');
        db.run('CREATE INDEX IF NOT EXISTS idx_gh_p2_cat ON game_history(player2_id, category)');
    });

    // Периодически подсказываем SQLite обновить статистику запросов (раз в час)
    const _optimizeInterval = setInterval(() => {
        db.run('PRAGMA optimize');
    }, 60 * 60 * 1000);
    if (_optimizeInterval.unref) _optimizeInterval.unref();

} else if (conf.dbType === 'mysql') {
    const mysql = require('mysql2');
    const pool = mysql.createPool({ ...conf.mysql, waitForConnections: true, connectionLimit: 10, queueLimit: 0 });

    dbWrapper.run = function(sql, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        pool.query(sql, params, function(err, results) {
            if (callback) callback.call({ lastID: results?.insertId, changes: results?.affectedRows }, err);
        });
    };
    dbWrapper.get = function(sql, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        pool.query(sql, params, function(err, results) {
            callback(err, results && results.length > 0 ? results[0] : null);
        });
    };
    dbWrapper.all = function(sql, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        pool.query(sql, params, function(err, results) { callback(err, results); });
    };
    dbWrapper.close = function(callback) { pool.end(err => { if (callback) callback(err); }); };
    dbWrapper.end = function() {
        return new Promise((resolve, reject) => { pool.end(err => err ? reject(err) : resolve()); });
    };

    dbWrapper.run(`CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL, email VARCHAR(255), is_admin TINYINT DEFAULT 0,
        avatar VARCHAR(10) DEFAULT '😶', theme VARCHAR(20) DEFAULT 'dark',
        language VARCHAR(20) DEFAULT 'auto', reset_token VARCHAR(255), reset_expires BIGINT
    )`);

    dbWrapper.run(`CREATE TABLE IF NOT EXISTS leaderboard (
        id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(255) NOT NULL,
        category VARCHAR(255) NOT NULL, score INT NOT NULL, date DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_leaderboard_cat_score (category, score DESC),
        INDEX idx_leaderboard_score (score DESC),
        INDEX idx_leaderboard_username (username),
        INDEX idx_leaderboard_category (category)
    )`);

    dbWrapper.run(`CREATE TABLE IF NOT EXISTS user_card_stats (
        user_id INT, category VARCHAR(255), card_value INT, matches INT DEFAULT 1,
        UNIQUE KEY unique_stat (user_id, category, card_value)
    )`);

    dbWrapper.run(`CREATE TABLE IF NOT EXISTS game_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        player1_id INT, player2_id INT,
        player1_name VARCHAR(255) NOT NULL, player2_name VARCHAR(255) NOT NULL,
        player1_score INT DEFAULT 0, player2_score INT DEFAULT 0,
        winner_id INT, category VARCHAR(255),
        is_bot_game TINYINT DEFAULT 0, bot_difficulty VARCHAR(20),
        failed_flips INT DEFAULT 0, max_combo INT DEFAULT 0, grid_size INT DEFAULT 6,
        played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_p1 (player1_id), INDEX idx_p2 (player2_id), INDEX idx_date (played_at DESC)
    )`);

    dbWrapper.run(`CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY, key_name VARCHAR(255) UNIQUE NOT NULL,
        display_name VARCHAR(255) NOT NULL, emojis TEXT NOT NULL
    )`, [], () => {
        dbWrapper.get('SELECT COUNT(*) as count FROM categories', (err, row) => {
            if (row && row.count === 0) populateDefaultCategories(dbWrapper);
        });
    });

    dbWrapper.run(`CREATE TABLE IF NOT EXISTS user_achievements (
        user_id INT NOT NULL, achievement_key VARCHAR(64) NOT NULL,
        achieved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_ach (user_id, achievement_key),
        INDEX idx_ach_user (user_id)
    )`);

    dbWrapper.run(`CREATE TABLE IF NOT EXISTS friends (
        id INT AUTO_INCREMENT PRIMARY KEY,
        requester_id INT NOT NULL,
        addressee_id INT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_friend (requester_id, addressee_id),
        INDEX idx_friends_req (requester_id),
        INDEX idx_friends_addr (addressee_id)
    )`);

    dbWrapper.run(`CREATE TABLE IF NOT EXISTS direct_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sender_id INT NOT NULL,
        receiver_id INT NOT NULL,
        content TEXT NOT NULL,
        is_read TINYINT DEFAULT 0,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_dm_conv (sender_id, receiver_id),
        INDEX idx_dm_recv (receiver_id, is_read)
    )`);

    dbWrapper.run(`CREATE TABLE IF NOT EXISTS user_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL, username VARCHAR(255) NOT NULL,
        key_name VARCHAR(255) UNIQUE NOT NULL,
        display_name VARCHAR(255) NOT NULL, emojis TEXT NOT NULL,
        image_url VARCHAR(500),
        status VARCHAR(20) DEFAULT 'pending',
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reviewed_by INT, reviewed_at DATETIME,
        INDEX idx_uc_status (status)
    )`);

    // MySQL: add new columns silently (fails if already exists — harmless)
    dbWrapper.run("ALTER TABLE users ADD COLUMN chat_muted_until BIGINT DEFAULT 0", []);
    dbWrapper.run("ALTER TABLE users ADD COLUMN chat_violations INT DEFAULT 0", []);
    dbWrapper.run("ALTER TABLE users ADD COLUMN chat_disabled TINYINT DEFAULT 0", []);
    dbWrapper.run("ALTER TABLE categories ADD COLUMN image_url VARCHAR(500)", []);
    dbWrapper.run("ALTER TABLE categories ADD COLUMN repr_emoji VARCHAR(20)", []);
    dbWrapper.run("ALTER TABLE user_categories ADD COLUMN image_url VARCHAR(500)", []);
    dbWrapper.run("ALTER TABLE user_categories ADD COLUMN repr_emoji VARCHAR(20)", []);
}

function populateDefaultCategories(dbAdapter) {
    const defaults = [
        ['animals', 'Животные', '🐶,🐱,🐭,🐹,🐰,🦊,🐻,🐼,🐨,🐯,🦁,🐮,🐷,🐸,🐵,🐔,🐧,🐦'],
        ['objects', 'Объекты', '💍,📱,💻,⌨️,💎,🛒,💣,👓,🎮,🏐,💾,👑,📀,📼,📷,📹,🚽,🏠'],
        ['food', 'Еда', '🍏,🍎,🍐,🍊,🍋,🍌,🍉,🍇,🍓,🍈,🍒,🍑,🥭,🍍,🥥,🥝,🍅,🍆'],
        ['clocks', 'Часы', '🕐,🕑,🕒,🕓,🕔,🕕,🕖,🕗,🕘,🕙,🕚,🕛,🕜,🕝,🕞,🕟,🕠,🕡'],
        ['transport', 'Транспорт', '🚗,🚢,🚙,🚂,🚎,🛹,🚓,🚑,🚒,🚐,🚄,🚛,🚜,🛴,🚲,🛵,🚀,🛸'],
        ['smails', 'Смайлы', '😀,😁,😂,🤣,😃,😄,😅,😆,😉,😊,😋,😎,😍,😘,🥰,😗,😶,😪'],
        ['stars', 'Звезды', '⛎,♈,♉,♊,♋,♌,♍,♎,♏,♐,♑,♒,♓,🈳,🛐,🔯,🕎,🈚'],
        ['hearts', 'Сердца', '❤,🧡,💛,💚,💙,💜,🤎,🖤,🤍,💔,❣,💕,💞,💓,💗,💖,💘,💝']
    ];

    if (dbAdapter.type === 'mysql') {
        const placeholders = defaults.map(() => '(?, ?, ?)').join(', ');
        dbAdapter.run(`INSERT INTO categories (key_name, display_name, emojis) VALUES ${placeholders}`, defaults.flat());
    } else {
        const stmt = 'INSERT INTO categories (key_name, display_name, emojis) VALUES (?, ?, ?)';
        defaults.forEach(c => dbAdapter.run(stmt, c));
    }
}

module.exports = dbWrapper;
