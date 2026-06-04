const express = require('express');
const db = require('../../db');
const { isAdmin } = require('../../middleware/auth');

const router = express.Router();

router.get('/stats', isAdmin, (req, res) => {
    const { getOnlineCount } = require('../../websocket');
    const { rooms } = require('../../services/roomManager');
    const allRooms = Object.values(rooms);
    const activeGames = allRooms.filter(r => r.status === 'playing').length;
    const waitingRooms = allRooms.filter(r => r.status === 'waiting').length;
    const onlineUsers = getOnlineCount();
    const todayQuery = db.type === 'mysql'
        ? 'SELECT COUNT(*) AS count FROM game_history WHERE DATE(played_at) = CURDATE()'
        : "SELECT COUNT(*) AS count FROM game_history WHERE date(played_at) >= date('now', 'start of day')";
    db.get(todayQuery, [], (err1, todayRow) => {
        db.get('SELECT COUNT(*) AS count FROM users', [], (err2, usersRow) => {
            db.get('SELECT COUNT(*) AS count FROM game_history', [], (err3, totalRow) => {
                db.get("SELECT COUNT(*) AS count FROM user_categories WHERE status = 'pending'", [], (err4, pendingRow) => {
                    res.json({
                        onlineUsers, activeGames, waitingRooms,
                        gamesToday: todayRow?.count || 0,
                        totalUsers: usersRow?.count || 0,
                        totalGames: totalRow?.count || 0,
                        pendingCategories: pendingRow?.count || 0
                    });
                });
            });
        });
    });
});

module.exports = router;
