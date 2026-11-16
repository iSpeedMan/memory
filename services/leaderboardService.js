const db = require('../db');
const redis = require('./redis');
const { sanitizePreviewData } = require('./shopService');

const leaderboardCache = new Map();
const cachedCategories = new Set();
const LEADERBOARD_CACHE_TTL = 30000;
const REDIS_TTL_SECONDS = 30;
const REDIS_KEY = (cat) => `metro:lb:v2:${cat}`;

function decorateLeaderboardRows(rows) {
    return (rows || []).map(row => {
        const nameColor = sanitizePreviewData('name_color', row.name_color_preview);
        const frame = sanitizePreviewData('avatar_frame', row.frame_preview);
        const title = sanitizePreviewData('title', row.title_preview);
        return {
            username: row.username,
            totalScore: row.totalScore,
            avatar: row.avatar || '😶',
            nameColor: nameColor.color || null,
            frameClass: frame.css_class || null,
            titleLabel: title.label || null,
            titleColor: title.color || null,
        };
    });
}

function _queryDB(category, callback) {
    let query = `SELECT scores.username, scores.totalScore, u.avatar,
                    name_color.preview_data AS name_color_preview,
                    frame.preview_data AS frame_preview,
                    title.preview_data AS title_preview
                 FROM (
                     SELECT username, SUM(score) AS totalScore FROM leaderboard `;
    const params = [];
    if (category && category !== 'all') {
        query += 'WHERE category = ? ';
        params.push(category);
    }
    query += `GROUP BY username
                 ) scores
                 LEFT JOIN users u ON u.username = scores.username
                 LEFT JOIN shop_items name_color ON name_color.item_key = u.active_name_color
                 LEFT JOIN shop_items frame ON frame.item_key = u.active_avatar_frame
                 LEFT JOIN shop_items title ON title.item_key = u.active_title
                 ORDER BY scores.totalScore DESC LIMIT 10`;
    db.all(query, params, (err, rows) => {
        const result = decorateLeaderboardRows(err ? [] : rows);
        if (!err) {
            const now = Date.now();
            leaderboardCache.set(category, { data: result, lastUpdate: now });
            cachedCategories.add(category);
            if (redis.isAvailable) {
                redis.setEx(REDIS_KEY(category), REDIS_TTL_SECONDS, JSON.stringify(result)).catch(() => {});
            }
        }
        callback(result);
    });
}

function getLeaderboard(category, callback) {
    const cacheKey = category || 'all';
    const now = Date.now();

    const memCached = leaderboardCache.get(cacheKey);
    if (memCached && (now - memCached.lastUpdate) < LEADERBOARD_CACHE_TTL) {
        return callback(memCached.data);
    }

    if (redis.isAvailable) {
        redis.get(REDIS_KEY(cacheKey)).then(raw => {
            if (raw) {
                try {
                    const data = JSON.parse(raw);
                    leaderboardCache.set(cacheKey, { data, lastUpdate: Date.now() });
                    return callback(data);
                } catch (_) {}
            }
            _queryDB(cacheKey, callback);
        }).catch(() => _queryDB(cacheKey, callback));
    } else {
        _queryDB(cacheKey, callback);
    }
}

function broadcastLeaderboard(io, category = 'all') {
    getLeaderboard(category, (data) => {
        io.to(`leaderboard_${category}`).emit('leaderboardUpdate', { category, data });
    });
}

function invalidateLeaderboard(io) {
    leaderboardCache.clear();

    if (redis.isAvailable) {
        for (const cat of cachedCategories) {
            redis.del(REDIS_KEY(cat)).catch(() => {});
        }
    }
    cachedCategories.clear();

    const rooms = io.sockets.adapter.rooms;
    for (const roomName of rooms.keys()) {
        if (!roomName.startsWith('leaderboard_')) continue;
        const cat = roomName.replace('leaderboard_', '');
        broadcastLeaderboard(io, cat);
    }
}

module.exports = { getLeaderboard, broadcastLeaderboard, invalidateLeaderboard };
