const db = require('../db');

let leaderboardCache = { data: null, lastUpdate: 0, category: null };
const LEADERBOARD_CACHE_TTL = 5000;

function getLeaderboard(category, callback) {
    const cacheKey = category || 'all';
    const now = Date.now();
    if (leaderboardCache.data && leaderboardCache.category === cacheKey && (now - leaderboardCache.lastUpdate) < LEADERBOARD_CACHE_TTL) {
        return callback(leaderboardCache.data);
    }
    let query = "SELECT username, SUM(score) as totalScore FROM leaderboard ";
    let params = [];
    if (category && category !== 'all') {
        query += "WHERE category = ? ";
        params.push(category);
    }
    query += "GROUP BY username ORDER BY totalScore DESC LIMIT 10";
    db.all(query, params, (err, rows) => {
        const result = err ? [] : rows;
        leaderboardCache = { data: result, category: cacheKey, lastUpdate: now };
        callback(result);
    });
}

function broadcastLeaderboard(io, category = 'all') {
    getLeaderboard(category, (data) => {
        const roomName = `leaderboard_${category}`;
        io.to(roomName).emit('leaderboardUpdate', { category, data });
    });
}

function invalidateLeaderboard(io) {
    // Сбрасываем кэш полностью
    leaderboardCache = { data: null, lastUpdate: 0, category: null };
    // Обновляем данные для всех категорий, которые могут быть подписаны
    // Узнаём все комнаты с префиксом 'leaderboard_'
    const rooms = io.sockets.adapter.rooms;
    const leaderboardRooms = Array.from(rooms.keys()).filter(name => name.startsWith('leaderboard_'));
    for (const roomName of leaderboardRooms) {
        const category = roomName.replace('leaderboard_', '');
        getLeaderboard(category, (data) => {
            io.to(roomName).emit('leaderboardUpdate', { category, data });
        });
    }
}

module.exports = { getLeaderboard, broadcastLeaderboard, invalidateLeaderboard };