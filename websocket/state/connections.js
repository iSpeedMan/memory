const connectedSockets = new Map();
let _io = null;
const MAX_CONNECTED_SOCKETS = 10000;
const HEARTBEAT_TIMEOUT = 1800000;

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

function broadcastServerInfo(info, ts) {
    _serverInfoCache = { info: info || '', ts: ts || '0', loaded: true };
    if (_io) _io.emit('serverInfoUpdate', { info: info || '', ts: ts || '0' });
}

function broadcastAnnouncements(list) {
    _announcementsCache = list || [];
    if (_io) _io.emit('announcementsUpdate', { announcements: _announcementsCache });
}

function getServerInfoCache() { return _serverInfoCache; }
function getAnnouncementsCache() { return _announcementsCache; }
function setServerInfoCache(val) { _serverInfoCache = val; }
function setAnnouncementsCache(val) { _announcementsCache = val; }

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
    setAnnouncementsCache
};
