const express = require('express');
const router = express.Router();
const { sendRequest, acceptRequest, declineRequest, removeFriend, getFriends, getPendingRequests, getOutgoingRequests } = require('../services/friendsService');
const { getLang } = require('../middleware/auth');
const i18n = require('../public/js/i18n.js');

function auth(req, res, next) {
    if (!req.session || !req.session.userId) return res.status(401).json({ error: i18n.t('not_authorized', getLang(req)) });
    next();
}

function notifyUser(userId, event, data) {
    try {
        const ws = require('../websocket');
        if (typeof ws.emitToUser === 'function') ws.emitToUser(userId, event, data);
    } catch (e) {}
}

router.get('/', auth, (req, res) => {
    getFriends(req.session.userId, (err, rows) => {
        if (err) return res.status(500).json({ error: i18n.t('database_error', getLang(req)) });
        res.json(rows || []);
    });
});

router.get('/requests', auth, (req, res) => {
    getPendingRequests(req.session.userId, (err, rows) => {
        if (err) return res.status(500).json({ error: i18n.t('database_error', getLang(req)) });
        res.json(rows || []);
    });
});

router.get('/requests/outgoing', auth, (req, res) => {
    getOutgoingRequests(req.session.userId, (err, rows) => {
        if (err) return res.status(500).json({ error: i18n.t('database_error', getLang(req)) });
        res.json(rows || []);
    });
});

router.post('/request', auth, (req, res) => {
    const username = (req.body.username || '').toString().trim().substring(0, 32);
    if (!username) return res.status(400).json({ error: i18n.t('user_not_found', getLang(req)) });
    sendRequest(req.session.userId, username, (result) => {
        if (result.error) return res.status(400).json({ error: i18n.t(result.error, getLang(req)) });
        notifyUser(result.addresseeId, 'friendRequest', {
            id: result.requestId,
            fromId: req.session.userId,
            fromUsername: req.session.username,
            fromAvatar: req.session.avatar || '😶'
        });
        res.json({ success: true });
    });
});

router.post('/accept/:requestId', auth, (req, res) => {
    const requestId = parseInt(req.params.requestId, 10);
    if (!requestId || isNaN(requestId)) return res.status(400).json({ error: i18n.t('invalid_request', getLang(req)) });
    acceptRequest(req.session.userId, requestId, (result) => {
        if (result.error) return res.status(400).json({ error: i18n.t(result.error, getLang(req)) });
        notifyUser(result.requesterId, 'friendAccepted', {
            byId: req.session.userId,
            byUsername: req.session.username,
            byAvatar: req.session.avatar || '😶'
        });
        res.json({ success: true });
    });
});

router.post('/decline/:requestId', auth, (req, res) => {
    const requestId = parseInt(req.params.requestId, 10);
    if (!requestId || isNaN(requestId)) return res.status(400).json({ error: i18n.t('invalid_request', getLang(req)) });
    declineRequest(req.session.userId, requestId, (result) => {
        if (result.error) return res.status(400).json({ error: i18n.t(result.error, getLang(req)) });
        res.json({ success: true });
    });
});

router.delete('/:friendId', auth, (req, res) => {
    const friendId = parseInt(req.params.friendId, 10);
    if (!friendId || isNaN(friendId)) return res.status(400).json({ error: i18n.t('invalid_request', getLang(req)) });
    removeFriend(req.session.userId, friendId, (result) => {
        if (result.error) return res.status(400).json({ error: i18n.t(result.error, getLang(req)) });
        res.json({ success: true });
    });
});

module.exports = router;
