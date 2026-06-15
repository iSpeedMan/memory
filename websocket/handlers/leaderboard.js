const { getLeaderboard } = require('../../services/leaderboardService');

function setupLeaderboardHandlers(socket) {
    const MAX_LEADERBOARD_SUBS = 5;
    const leaderboardSubs = new Set();
    let lastSubTime = 0;

    socket.on('subscribeLeaderboard', (category) => {
        const now = Date.now();
        if (now - lastSubTime < 500) return;
        lastSubTime = now;
        if (category !== undefined && typeof category !== 'string') return;
        const cat = (category || 'all').toString().replace(/[^\w-]/g, '').substring(0, 30) || 'all';
        if (!leaderboardSubs.has(cat) && leaderboardSubs.size >= MAX_LEADERBOARD_SUBS) return;
        leaderboardSubs.add(cat);
        socket.join(`leaderboard_${cat}`);
        getLeaderboard(cat, (data) => { socket.emit('leaderboardUpdate', { category: cat, data }); });
    });

    socket.on('unsubscribeLeaderboard', (category) => {
        if (category !== undefined && typeof category !== 'string') return;
        const cat = (category || 'all').toString().replace(/[^\w-]/g, '').substring(0, 30) || 'all';
        leaderboardSubs.delete(cat);
        socket.leave(`leaderboard_${cat}`);
    });
}

module.exports = { setupLeaderboardHandlers };
