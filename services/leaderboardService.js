const db = require('../db');

const leaderboardCache = new Map();
const LEADERBOARD_CACHE_TTL = 30000;

function getLeaderboard(category, callback) {
    const cacheKey = category || 'all';
    const now = Date.now();
    const cached = leaderboardCache.get(cacheKey);
    if (cached && (now - cached.lastUpdate) < LEADERBOARD_CACHE_TTL) {
        return callback(cached.data);
    }
    let query = 'SELECT username, SUM(score) as totalScore FROM leaderboard ';
    let params = [];
    if (category && category !== 'all') {
        query += 'WHERE category = ? ';
        params.push(category);
    }
    query += 'GROUP BY username ORDER BY totalScore DESC LIMIT 10';
    db.all(query, params, (err, rows) => {
        const result = err ? [] : rows;
        if (!err) leaderboardCache.set(cacheKey, { data: result, lastUpdate: now });
        callback(result);
    });
}

function broadcastLeaderboard(io, category = 'all') {
    getLeaderboard(category, (data) => {
        io.to(`leaderboard_${category}`).emit('leaderboardUpdate', { category, data });
    });
}

function invalidateLeaderboard(io) {
    leaderboardCache.clear();
    const rooms = io.sockets.adapter.rooms;
    for (const roomName of rooms.keys()) {
        if (!roomName.startsWith('leaderboard_')) continue;
        const cat = roomName.replace('leaderboard_', '');
        broadcastLeaderboard(io, cat);
    }
}

module.exports = { getLeaderboard, broadcastLeaderboard, invalidateLeaderboard };
