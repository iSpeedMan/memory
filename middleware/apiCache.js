const _store = new Map();

function get(key) {
    const entry = _store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { _store.delete(key); return null; }
    return entry.data;
}

function set(key, data, ttlMs) {
    _store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

function invalidate(...keys) {
    keys.forEach(k => _store.delete(k));
}

function middleware(key, ttlMs) {
    return (req, res, next) => {
        const cached = get(key);
        if (cached !== null) return res.json(cached);
        const origJson = res.json.bind(res);
        res.json = (data) => {
            if (res.statusCode < 300) set(key, data, ttlMs);
            return origJson(data);
        };
        next();
    };
}

module.exports = { get, set, invalidate, middleware };
