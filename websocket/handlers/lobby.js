const db = require('../../db');
const { wsRateLimit } = require('../../middleware/wsRateLimit');
const { getIo } = require('../state/connections');
const redis = require('../../services/redis');

const USERS_LIST_KEY = 'metro:users:list';
const USERS_LIST_TTL = 30; // секунд

function setupLobbyHandlers(socket, session) {
    let lastUsersListTime = 0;

    socket.on('getUsersList', async () => {
        const now = Date.now();
        if (now - lastUsersListTime < 5000) return;
        lastUsersListTime = now;

        // Проверяем Redis-кэш (общий для всех инстансов)
        if (redis.isAvailable) {
            const cached = await redis.get(USERS_LIST_KEY);
            if (cached) {
                try {
                    socket.emit('usersList', { users: JSON.parse(cached) });
                    return;
                } catch (_) {}
            }
        }

        db.all('SELECT username FROM users ORDER BY username LIMIT 500', [], (err, rows) => {
            if (err || !rows) return;
            const users = rows.map(r => r.username);
            if (redis.isAvailable) {
                redis.setEx(USERS_LIST_KEY, USERS_LIST_TTL, JSON.stringify(users)).catch(() => {});
            }
            socket.emit('usersList', { users });
        });
    });

    socket.on('localGameCompleted', () => {
        if (!wsRateLimit(session.userId, 'localGameCompleted', 2, 60000)) return;
        const { awardAchievement } = require('../../services/achievementService');
        awardAchievement(session.userId, 'local_player', getIo());
    });
}

module.exports = { setupLobbyHandlers };
