const { getFriends } = require('./friendsService');

let _emitToUser = null;
const inGameUsers = new Set();

function init(emitToUser) {
    _emitToUser = emitToUser;
}

function setUserInGame(userId, inGame) {
    const wasInGame = inGameUsers.has(userId);
    if (inGame === wasInGame) return;
    if (inGame) inGameUsers.add(userId);
    else inGameUsers.delete(userId);
    if (!_emitToUser) return;
    getFriends(userId, (err, friends) => {
        if (err || !friends) return;
        friends.forEach(f => {
            _emitToUser(f.friend_id, inGame ? 'friendInGame' : 'friendLeftGame', { userId });
        });
    });
}

function isUserInGame(userId) {
    return inGameUsers.has(userId);
}

module.exports = { init, setUserInGame, isUserInGame };
