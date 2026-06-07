const db = require('../db');

const MAX_DM_LENGTH = 500;

function saveMessage(senderId, receiverId, content, callback) {
    const safe = (content || '').toString().trim().substring(0, MAX_DM_LENGTH);
    if (!safe) return callback({ error: 'empty_message' });
    db.run(
        `INSERT INTO direct_messages (sender_id, receiver_id, content) VALUES (?, ?, ?)`,
        [senderId, receiverId, safe],
        function(err) {
            if (err) return callback({ error: 'database_error' });
            callback({ success: true, messageId: this.lastID, content: safe });
        }
    );
}

function getHistory(userId1, userId2, limit, callback) {
    const n = (Number.isInteger(limit) && limit > 0) ? Math.min(limit, 100) : 50;
    db.all(
        `SELECT dm.id AS id,
                dm.sender_id AS senderId,
                dm.receiver_id AS receiverId,
                dm.content,
                dm.sent_at AS sentAt,
                dm.is_read AS isRead,
                u.username AS senderName,
                u.avatar AS senderAvatar
         FROM direct_messages dm
         JOIN users u ON u.id = dm.sender_id
         WHERE (dm.sender_id = ? AND dm.receiver_id = ?) OR (dm.sender_id = ? AND dm.receiver_id = ?)
         ORDER BY dm.sent_at DESC LIMIT ?`,
        [userId1, userId2, userId2, userId1, n],
        (err, rows) => {
            if (err) return callback(err, []);
            callback(null, (rows || []).reverse());
        }
    );
}

function markRead(readerId, senderId, callback) {
    db.run(
        `UPDATE direct_messages SET is_read = 1 WHERE receiver_id = ? AND sender_id = ? AND is_read = 0`,
        [readerId, senderId],
        (err) => { if (callback) callback(err); }
    );
}

function getUnreadCounts(userId, callback) {
    db.all(
        `SELECT sender_id, COUNT(*) AS cnt
         FROM direct_messages
         WHERE receiver_id = ? AND is_read = 0
         GROUP BY sender_id`,
        [userId],
        (err, rows) => callback(err, rows || [])
    );
}

module.exports = { saveMessage, getHistory, markRead, getUnreadCounts };
