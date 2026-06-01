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
    const dbPath = path.resolve(__dirname, conf.sqlite.filename);
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
        db.run('PRAGMA cache_size=-64000');
        db.run('PRAGMA temp_store=MEMORY');

        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, email TEXT,
            is_admin INTEGER DEFAULT 0, avatar TEXT DEFAULT '😶',
            theme TEXT DEFAULT 'dark', language TEXT DEFAULT 'auto',
            reset_token TEXT, reset_expires INTEGER
        )`);

        const alters = [
            "ALTER TABLE users ADD COLUMN email TEXT",
            "ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT '😶'",
            "ALTER TABLE users ADD COLUMN theme TEXT DEFAULT 'dark'",
            "ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'auto'",
            "ALTER TABLE users ADD COLUMN reset_token TEXT",
            "ALTER TABLE users ADD COLUMN reset_expires INTEGER"
        ];
        alters.forEach(q => db.run(q, () => {}));

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
            played_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run('CREATE INDEX IF NOT EXISTS idx_game_history_p1 ON game_history(player1_id, played_at DESC)');
        db.run('CREATE INDEX IF NOT EXISTS idx_game_history_p2 ON game_history(player2_id, played_at DESC)');
        db.run('CREATE INDEX IF NOT EXISTS idx_game_history_date ON game_history(played_at DESC)');

        db.run(`CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT, key_name TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL, emojis TEXT NOT NULL
        )`, () => {
            db.get('SELECT COUNT(*) as count FROM categories', (err, row) => {
                if (row && row.count === 0) populateDefaultCategories(dbWrapper);
            });
        });
    });

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
