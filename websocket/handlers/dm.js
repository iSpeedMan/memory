const { saveMessage, getHistory, markRead, deleteMessage } = require('../../services/dmService');
const { areFriends: checkFriends } = require('../../services/friendsService');
const { wsRateLimit } = require('../../middleware/wsRateLimit');
const { emitToUser } = require('../state/connections');
const { getPlayerGameCosmetics } = require('../../services/shopService');

const dmCooldowns = new Map();
const DM_RATE_MS = 1000;
const MAX_DM_COOLDOWNS = 5000;

function getCosmetics(userId) {
    return new Promise(resolve => {
        getPlayerGameCosmetics(userId, (_err, cosmetics) => resolve(cosmetics || {}));
    });
}

function setupDmHandlers(socket, session) {
    socket.on('sendDm', (data) => {
        if (!data || typeof data !== 'object') return;
        const content = (data.content || '').toString().trim().substring(0, 500);
        const receiverId = parseInt(data.receiverId, 10);
        if (!content || !receiverId || isNaN(receiverId) || receiverId === session.userId) return;
        const now = Date.now();
        if (now - (dmCooldowns.get(session.userId) || 0) < DM_RATE_MS) {
            socket.emit('dmError', { error: 'dm_too_fast' }); return;
        }
        if (dmCooldowns.size > MAX_DM_COOLDOWNS) {
            const oldestKey = dmCooldowns.keys().next().value;
            dmCooldowns.delete(oldestKey);
        }
        dmCooldowns.set(session.userId, now);
        checkFriends(session.userId, receiverId, (ok) => {
            if (!ok) return;
            saveMessage(session.userId, receiverId, content, async (result) => {
                if (result.error) return;
                const cosmetics = await getCosmetics(session.userId);
                const msg = {
                    id: result.messageId, senderId: session.userId,
                    senderName: session.username, senderAvatar: session.avatar || '😶',
                    frameClass: cosmetics.frameClass || null,
                    titleLabel: cosmetics.titleLabel || null,
                    titleColor: cosmetics.titleColor || null,
                    nameColor: cosmetics.nameColor || null,
                    content: result.content, sentAt: new Date().toISOString()
                };
                socket.emit('dmSent', msg);
                emitToUser(receiverId, 'dmMessage', msg);
            });
        });
    });

    socket.on('getDmHistory', (data) => {
        if (!wsRateLimit(session.userId, 'getDmHistory', 3, 10000)) return;
        if (!data || typeof data !== 'object') return;
        const friendId = parseInt(data.friendId, 10);
        if (!friendId || isNaN(friendId)) return;
        checkFriends(session.userId, friendId, (ok) => {
            if (!ok) return;
            getHistory(session.userId, friendId, 50, async (err, messages) => {
                if (err) return;
                const senderIds = [...new Set((messages || []).map(message => Number(message.senderId)).filter(Number.isFinite))];
                const cosmeticsByUser = new Map(await Promise.all(senderIds.map(async senderId => [senderId, await getCosmetics(senderId)])));
                const decorated = (messages || []).map(message => ({
                    ...message,
                    ...(cosmeticsByUser.get(Number(message.senderId)) || {}),
                }));
                socket.emit('dmHistory', { friendId, messages: decorated });
                markRead(session.userId, friendId, () => {});
            });
        });
    });

    socket.on('markDmRead', (data) => {
        if (!wsRateLimit(session.userId, 'markDmRead', 10)) return;
        if (!data || typeof data !== 'object') return;
        const friendId = parseInt(data.friendId, 10);
        if (!friendId || isNaN(friendId)) return;
        markRead(session.userId, friendId, () => {});
    });

    socket.on('deleteDm', (data) => {
        if (!wsRateLimit(session.userId, 'deleteDm', 5, 10000)) return;
        if (!data || !data.msgId) return;
        const msgId = parseInt(data.msgId, 10);
        if (isNaN(msgId)) return;
        deleteMessage(msgId, session.userId, (err, deleted, receiverId) => {
            if (!deleted) return;
            socket.emit('dmMessageDeleted', { msgId });
            if (receiverId) emitToUser(receiverId, 'dmMessageDeleted', { msgId });
        });
    });
}

module.exports = { setupDmHandlers };
