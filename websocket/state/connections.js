const redis = require('../../services/redis');
const conf = require('../../conf');

const connectedSockets = new Map();
let _io = null;
const MAX_CONNECTED_SOCKETS = conf.maxConnections;
const HEARTBEAT_TIMEOUT = conf.heartbeatTimeoutMs;

const REDIS_SERVER_INFO_KEY  = 'metro:server:info';
const REDIS_ANNOUNCEMENTS_KEY = 'metro:server:announcements';
const REDIS_CACHE_TTL = 86400; // 24 часа

function setIo(io) { _io = io; }
function getIo() { return _io; }

function getOnlineCount() {
    const unique = new Set([...connectedSockets.values()].map(v => v.userId));
    return unique.size;
}

function emitToUser(userId, event, data) {
    if (_io) _io.to(`user_${userId}`).emit(event, data);
}

function getUserSocketCount(userId) {
    let count = 0;
    for (const info of connectedSockets.values()) {
        if (info.userId === userId) count++;
    }
    return count;
}

let _serverInfoCache = { info: '', ts: '0', loaded: false };
let _announcementsCache = [];

/**
 * Рассылает server info всем и сохраняет в Redis для общего доступа между инстансами.
 */
function broadcastServerInfo(info, ts) {
    _serverInfoCache = { info: info || '', ts: ts || '0', loaded: true };
    if (_io) _io.emit('serverInfoUpdate', { info: info || '', ts: ts || '0' });
    if (redis.isAvailable) {
        redis.setEx(
            REDIS_SERVER_INFO_KEY,
            REDIS_CACHE_TTL,
            JSON.stringify({ info: info || '', ts: ts || '0' })
        ).catch(() => {});
    }
}

/**
 * Рассылает объявления всем и сохраняет в Redis.
 */
function broadcastAnnouncements(list) {
    _announcementsCache = list || [];
    if (_io) _io.emit('announcementsUpdate', { announcements: _announcementsCache });
    if (redis.isAvailable) {
        redis.setEx(
            REDIS_ANNOUNCEMENTS_KEY,
            REDIS_CACHE_TTL,
            JSON.stringify(_announcementsCache)
        ).catch(() => {});
    }
}

function getServerInfoCache() { return _serverInfoCache; }
function getAnnouncementsCache() { return _announcementsCache; }
function setServerInfoCache(val) { _serverInfoCache = val; }
function setAnnouncementsCache(val) { _announcementsCache = val; }

/**
 * Загружает server info при старте: сначала Redis, потом БД.
 */
async function loadServerInfoCache(db) {
    if (redis.isAvailable) {
        const raw = await redis.get(REDIS_SERVER_INFO_KEY);
        if (raw) {
            try {
                const data = JSON.parse(raw);
                setServerInfoCache({ info: data.info || '', ts: data.ts || '0', loaded: true });
                return;
            } catch (_) {}
        }
    }
    db.all('SELECT key, value FROM server_settings WHERE key IN (?, ?)', ['server_info', 'server_info_ts'], (err, rows) => {
        if (!err && rows) {
            const map = {};
            rows.forEach(r => { map[r.key] = r.value; });
            setServerInfoCache({ info: map.server_info || '', ts: map.server_info_ts || '0', loaded: true });
        }
    });
}

/**
 * Загружает объявления при старте: сначала Redis, потом БД.
 */
async function loadAnnouncementsCache(db) {
    if (redis.isAvailable) {
        const raw = await redis.get(REDIS_ANNOUNCEMENTS_KEY);
        if (raw) {
            try {
                setAnnouncementsCache(JSON.parse(raw));
                return;
            } catch (_) {}
        }
    }
    db.all('SELECT id, text, created_at, updated_at FROM server_announcements ORDER BY created_at DESC', [], (err, rows) => {
        if (!err && rows) setAnnouncementsCache(rows);
    });
}

module.exports = {
    connectedSockets,
    MAX_CONNECTED_SOCKETS,
    HEARTBEAT_TIMEOUT,
    setIo,
    getIo,
    getOnlineCount,
    emitToUser,
    getUserSocketCount,
    broadcastServerInfo,
    broadcastAnnouncements,
    getServerInfoCache,
    getAnnouncementsCache,
    setServerInfoCache,
    setAnnouncementsCache,
    loadServerInfoCache,
    loadAnnouncementsCache
};
