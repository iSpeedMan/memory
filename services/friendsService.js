const db = require('../db');
const { sanitizePreviewData } = require('./shopService');

function attachShopCosmetics(row) {
    const frame = sanitizePreviewData('avatar_frame', row.frame_preview);
    const title = sanitizePreviewData('title', row.title_preview);
    const nameColor = sanitizePreviewData('name_color', row.name_color_preview);
    const {
        frame_preview: _framePreview,
        title_preview: _titlePreview,
        name_color_preview: _nameColorPreview,
        ...result
    } = row;
    return {
        ...result,
        frame_class: frame.css_class || null,
        title_label: title.label || null,
        title_color: title.color || null,
        name_color: nameColor.color || null,
    };
}

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
        `SELECT f.id, friend.id AS friend_id, friend.username AS friend_name, friend.avatar AS friend_avatar,
            frame.preview_data AS frame_preview, title.preview_data AS title_preview,
            name_color.preview_data AS name_color_preview
         FROM friends f
         JOIN users friend ON (
             (f.requester_id = ? AND friend.id = f.addressee_id)
             OR (f.addressee_id = ? AND friend.id = f.requester_id)
         )
         LEFT JOIN shop_items frame ON frame.item_key = friend.active_avatar_frame
         LEFT JOIN shop_items title ON title.item_key = friend.active_title
         LEFT JOIN shop_items name_color ON name_color.item_key = friend.active_name_color
         WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'
         ORDER BY friend.username`,
        [userId, userId, userId, userId],
        (err, rows) => callback(err, (rows || []).map(attachShopCosmetics))
    );
}

function getPendingRequests(userId, callback) {
    db.all(
        `SELECT f.id, f.requester_id, u.username AS requester_name, u.avatar AS requester_avatar, f.created_at,
            frame.preview_data AS frame_preview, title.preview_data AS title_preview,
            name_color.preview_data AS name_color_preview
         FROM friends f
         JOIN users u ON u.id = f.requester_id
         LEFT JOIN shop_items frame ON frame.item_key = u.active_avatar_frame
         LEFT JOIN shop_items title ON title.item_key = u.active_title
         LEFT JOIN shop_items name_color ON name_color.item_key = u.active_name_color
         WHERE f.addressee_id = ? AND f.status = 'pending'
         ORDER BY f.created_at DESC`,
        [userId],
        (err, rows) => callback(err, (rows || []).map(attachShopCosmetics))
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
