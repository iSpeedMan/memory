const db = require('../../db');
const { wsRateLimit } = require('../../middleware/wsRateLimit');
const { getIo } = require('../state/connections');

function setupLobbyHandlers(socket, session) {
    let lastUsersListTime = 0;
    socket.on('getUsersList', () => {
        const now = Date.now();
        if (now - lastUsersListTime < 5000) return;
        lastUsersListTime = now;
        db.all('SELECT username FROM users ORDER BY username LIMIT 500', [], (err, rows) => {
            if (err || !rows) return;
            socket.emit('usersList', { users: rows.map(r => r.username) });
        });
    });

    socket.on('localGameCompleted', () => {
        if (!wsRateLimit(session.userId, 'localGameCompleted', 2, 60000)) return;
        const { awardAchievement } = require('../../services/achievementService');
        awardAchievement(session.userId, 'local_player', getIo());
    });
}

module.exports = { setupLobbyHandlers };
