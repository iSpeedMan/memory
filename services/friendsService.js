const db = require('../db');

function sendRequest(requesterId, addresseeUsername, callback) {
    db.get('SELECT id, avatar FROM users WHERE username = ?', [addresseeUsername], (err, row) => {
        if (err || !row) return callback({ error: 'user_not_found' });
        const addresseeId = row.id;
        if (requesterId === addresseeId) return callback({ error: 'cannot_add_self' });
        db.get(
            `SELECT id, status FROM friends WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
            [requesterId, addresseeId, addresseeId, requesterId],
            (err2, existing) => {
                if (err2) return callback({ error: 'database_error' });
                if (existing) {
                    if (existing.status === 'accepted') return callback({ error: 'already_friends' });
                    return callback({ error: 'request_exists' });
                }
                db.run(
                    `INSERT INTO friends (requester_id, addressee_id, status) VALUES (?, ?, 'pending')`,
                    [requesterId, addresseeId],
                    function(err3) {
                        if (err3) return callback({ error: 'database_error' });
                        callback({ success: true, requestId: this.lastID, addresseeId });
                    }
                );
            }
        );
    });
}

function acceptRequest(userId, requestId, callback) {
    db.get(`SELECT * FROM friends WHERE id = ? AND addressee_id = ? AND status = 'pending'`, [requestId, userId], (err, row) => {
        if (err || !row) return callback({ error: 'not_found' });
        db.run(`UPDATE friends SET status = 'accepted' WHERE id = ?`, [requestId], (err2) => {
            if (err2) return callback({ error: 'database_error' });
            callback({ success: true, requesterId: row.requester_id });
        });
    });
}

function declineRequest(userId, requestId, callback) {
    db.run(
        `DELETE FROM friends WHERE id = ? AND addressee_id = ? AND status = 'pending'`,
        [requestId, userId],
        function(err) {
            if (err) return callback({ error: 'database_error' });
            callback({ success: true });
        }
    );
}

function removeFriend(userId, friendId, callback) {
    db.run(
        `DELETE FROM friends WHERE ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)) AND status = 'accepted'`,
        [userId, friendId, friendId, userId],
        function(err) {
            if (err) return callback({ error: 'database_error' });
            callback({ success: true });
        }
    );
}

function getFriends(userId, callback) {
    db.all(
        `SELECT f.id,
            CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END AS friend_id,
            CASE WHEN f.requester_id = ? THEN u2.username ELSE u1.username END AS friend_name,
            CASE WHEN f.requester_id = ? THEN u2.avatar ELSE u1.avatar END AS friend_avatar
         FROM friends f
         JOIN users u1 ON u1.id = f.requester_id
         JOIN users u2 ON u2.id = f.addressee_id
         WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'
         ORDER BY friend_name`,
        [userId, userId, userId, userId, userId],
        callback
    );
}

function getPendingRequests(userId, callback) {
    db.all(
        `SELECT f.id, f.requester_id, u.username AS requester_name, u.avatar AS requester_avatar, f.created_at
         FROM friends f
         JOIN users u ON u.id = f.requester_id
         WHERE f.addressee_id = ? AND f.status = 'pending'
         ORDER BY f.created_at DESC`,
        [userId],
        callback
    );
}

function getOutgoingRequests(userId, callback) {
    db.all(
        `SELECT f.id, f.addressee_id, u.username AS addressee_name, u.avatar AS addressee_avatar
         FROM friends f
         JOIN users u ON u.id = f.addressee_id
         WHERE f.requester_id = ? AND f.status = 'pending'
         ORDER BY f.created_at DESC`,
        [userId],
        callback
    );
}

function areFriends(userId1, userId2, callback) {
    db.get(
        `SELECT id FROM friends WHERE ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)) AND status = 'accepted'`,
        [userId1, userId2, userId2, userId1],
        (err, row) => callback(!err && !!row)
    );
}

module.exports = { sendRequest, acceptRequest, declineRequest, removeFriend, getFriends, getPendingRequests, getOutgoingRequests, areFriends };
