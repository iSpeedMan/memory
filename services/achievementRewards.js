const db = require('../db');

const ALL_KEYS = [
    'first_win', 'win_streak_3', 'win_streak_5', 'beat_hard_bot', 'beat_gm_bot',
    'veteran', 'experienced', 'omnivore', 'combo_master', 'flawless',
    'big_board', 'unicode_explorer', 'local_player',
    'no_hints_win', 'pvp_champion', 'centurion', 'small_board_ace',
    'draw_king', 'daily_devotee', 'big_win', 'winner',
    'daily_streak_25', 'daily_streak_50',
];

const DEFAULTS = {
    first_win: 50,
    win_streak_3: 75,
    win_streak_5: 150,
    beat_hard_bot: 100,
    beat_gm_bot: 200,
    veteran: 50,
    experienced: 100,
    omnivore: 75,
    combo_master: 75,
    flawless: 150,
    big_board: 50,
    unicode_explorer: 30,
    local_player: 20,
    no_hints_win: 100,
    pvp_champion: 200,
    centurion: 150,
    small_board_ace: 50,
    draw_king: 75,
    daily_devotee: 30,
    big_win: 100,
    winner: 40,
    daily_streak_25: 200,
    daily_streak_50: 500,
};

const DB_KEYS = ALL_KEYS.map(k => `ach_reward_${k}`);

let _cache = {};
ALL_KEYS.forEach(k => { _cache[k] = DEFAULTS[k]; });

function load(cb) {
    db.all(
        `SELECT key, value FROM server_settings WHERE key IN (${DB_KEYS.map(() => '?').join(',')})`,
        DB_KEYS,
        (err, rows) => {
            if (!err && rows) {
                rows.forEach(r => {
                    const achKey = r.key.replace(/^ach_reward_/, '');
                    const v = parseInt(r.value, 10);
                    if (Number.isFinite(v) && v >= 0 && ALL_KEYS.includes(achKey)) {
                        _cache[achKey] = v;
                    }
                });
            }
            if (cb) cb();
        }
    );
}

function get() { return { ..._cache }; }

function getReward(key) { return _cache[key] ?? 0; }

function set(updates, cb) {
    const entries = Object.entries(updates).filter(([k]) => ALL_KEYS.includes(k));
    if (!entries.length) return cb && cb(null);
    let done = 0;
    let hadErr = null;
    entries.forEach(([key, val]) => {
        const v = Math.max(0, parseInt(val, 10) || 0);
        const dbKey = `ach_reward_${key}`;
        db.run(
            'INSERT OR REPLACE INTO server_settings (key, value) VALUES (?, ?)',
            [dbKey, String(v)],
            (err) => {
                if (err) hadErr = err;
                else _cache[key] = v;
                if (++done === entries.length) cb && cb(hadErr);
            }
        );
    });
}

load();

module.exports = { ALL_KEYS, DEFAULTS, get, getReward, set, load };
