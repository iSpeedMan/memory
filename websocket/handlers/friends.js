const { getFriends } = require('../../services/friendsService');
const friendNotifier = require('../../services/friendNotifier');
const { wsRateLimit } = require('../../middleware/wsRateLimit');
const { connectedSockets, emitToUser } = require('../state/connections');

function notifyFriendsOfStatus(userId, isOnline) {
    getFriends(userId, (err, friends) => {
        if (err || !friends) return;
        friends.forEach(f => {
            emitToUser(f.friend_id, isOnline ? 'friendOnline' : 'friendOffline', { userId });
        });
    });
}

function setupFriendsHandlers(socket, session) {
    socket.on('getFriendsOnlineStatus', () => {
        if (!wsRateLimit(session.userId, 'getFriendsOnlineStatus', 3, 10000)) return;
        const onlineUserIds = new Set([...connectedSockets.values()].map(v => v.userId));
        getFriends(session.userId, (err, friends) => {
            if (err || !friends) return;
            const onlineIds = friends.filter(f => onlineUserIds.has(f.friend_id)).map(f => f.friend_id);
            const inGameIds = onlineIds.filter(id => friendNotifier.isUserInGame(id));
            socket.emit('friendsOnlineStatus', { onlineIds, inGameIds });
        });
    });
}

module.exports = { setupFriendsHandlers, notifyFriendsOfStatus };
