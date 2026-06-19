const db = require('../db');

const DEFAULTS = { hint_limit: 3, hint_cost_reveal_one: 30, hint_cost_reveal_pair: 50, hint_cost_extra_turn: 40 };
const KEYS = Object.keys(DEFAULTS);

let _cache = { ...DEFAULTS };
let _loaded = false;

function load(cb) {
    db.all(`SELECT key, value FROM server_settings WHERE key IN (${KEYS.map(() => '?').join(',')})`, KEYS, (err, rows) => {
        if (!err && rows) {
            rows.forEach(r => {
                const v = parseInt(r.value, 10);
                if (Number.isFinite(v) && v >= 0) _cache[r.key] = v;
            });
        }
        _loaded = true;
        if (cb) cb();
    });
}

function get() { return _cache; }

function set(updates, cb) {
    const entries = Object.entries(updates).filter(([k]) => KEYS.includes(k));
    if (!entries.length) return cb && cb(null);
    let done = 0;
    let hadErr = null;
    entries.forEach(([key, val]) => {
        const v = Math.max(0, parseInt(val, 10) || 0);
        db.run('INSERT OR REPLACE INTO server_settings (key, value) VALUES (?, ?)', [key, String(v)], (err) => {
            if (err) hadErr = err;
            else _cache[key] = v;
            if (++done === entries.length) cb && cb(hadErr);
        });
    });
}

load();

module.exports = { get, set, load };
