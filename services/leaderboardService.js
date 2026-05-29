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

function invalidateLeaderboard(io, baseCategory = 'all') {
    // Сбрасываем кэш полностью
    leaderboardCache = { data: null, lastUpdate: 0, category: null };

    // Обновляем базовую категорию
    broadcastLeaderboard(io, baseCategory);

    // Обновляем все остальные подписанные категории
    // Используем отдельную переменную (не baseCategory), чтобы не перекрывать параметр
    const rooms = io.sockets.adapter.rooms;
    for (const roomName of rooms.keys()) {
        if (!roomName.startsWith('leaderboard_')) continue;
        const subscribedCategory = roomName.replace('leaderboard_', '');
        if (subscribedCategory === baseCategory) continue; // уже отправлено выше
        getLeaderboard(subscribedCategory, (data) => {
            io.to(roomName).emit('leaderboardUpdate', { category: subscribedCategory, data });
        });
    }
}

module.exports = { getLeaderboard, broadcastLeaderboard, invalidateLeaderboard };
