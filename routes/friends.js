const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { sendRequest, acceptRequest, declineRequest, removeFriend, getFriends, getPendingRequests, getOutgoingRequests } = require('../services/friendsService');

function notifyUser(userId, event, data) {
    try {
        const ws = require('../websocket');
        if (typeof ws.emitToUser === 'function') ws.emitToUser(userId, event, data);
    } catch (e) {}
}

router.get('/', requireAuth, (req, res) => {
    getFriends(req.session.userId, (err, rows) => {
        if (err) return res.status(500).json({ error: 'database_error' });
        res.json(rows || []);
    });
});

router.get('/requests', requireAuth, (req, res) => {
    getPendingRequests(req.session.userId, (err, rows) => {
        if (err) return res.status(500).json({ error: 'database_error' });
        res.json(rows || []);
    });
});

router.get('/requests/outgoing', requireAuth, (req, res) => {
    getOutgoingRequests(req.session.userId, (err, rows) => {
        if (err) return res.status(500).json({ error: 'database_error' });
        res.json(rows || []);
    });
});

router.post('/request', requireAuth, (req, res) => {
    const username = (req.body.username || '').toString().trim().substring(0, 32);
    if (!username) return res.status(400).json({ error: 'user_not_found' });
    const requesterId = req.session.userId;
    const requesterName = req.session.username;
    const requesterAvatar = req.session.avatar || '😶';

    sendRequest(requesterId, username, (result) => {
        if (result.error) return res.status(400).json({ error: result.error });
        notifyUser(result.addresseeId, 'friendRequest', {
            id: result.requestId,
            fromId: requesterId,
            fromUsername: requesterName,
            fromAvatar: requesterAvatar
        });
        res.json({ success: true });
    });
});

router.post('/accept/:requestId', requireAuth, (req, res) => {
    const requestId = parseInt(req.params.requestId, 10);
    if (!requestId || isNaN(requestId)) return res.status(400).json({ error: 'invalid_request' });
    const userId = req.session.userId;

    acceptRequest(userId, requestId, (result) => {
        if (result.error) return res.status(400).json({ error: result.error });
        notifyUser(result.requesterId, 'friendAccepted', {
            byId: userId,
            byUsername: req.session.username,
            byAvatar: req.session.avatar || '😶'
        });
        res.json({ success: true });
    });
});

router.post('/decline/:requestId', requireAuth, (req, res) => {
    const requestId = parseInt(req.params.requestId, 10);
    if (!requestId || isNaN(requestId)) return res.status(400).json({ error: 'invalid_request' });

    declineRequest(req.session.userId, requestId, (result) => {
        if (result.error) return res.status(400).json({ error: result.error });
        res.json({ success: true });
    });
});

router.delete('/:friendId', requireAuth, (req, res) => {
    const friendId = parseInt(req.params.friendId, 10);
    if (!friendId || isNaN(friendId)) return res.status(400).json({ error: 'invalid_request' });

    removeFriend(req.session.userId, friendId, (result) => {
        if (result.error) return res.status(400).json({ error: result.error });
        res.json({ success: true });
    });
});

module.exports = router;
