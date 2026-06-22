const { wsRateLimit } = require('../../middleware/wsRateLimit');
const { getRoom } = require('../../services/roomManager');
const coinsService = require('../../services/coinsService');
const hintSettings = require('../../services/hintSettings');
const { VALID_GRID_SIZES } = require('../state/roomState');

function handleCardClick(io, socket, throttleCardClick, processCardFlip) {
    socket.on('cardClick', (cardIndex) => {
        const session = socket.request.session;
        const MAX_CARD_INDEX = VALID_GRID_SIZES[VALID_GRID_SIZES.length - 1] ** 2 - 1;
        if (typeof cardIndex !== 'number' || !Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex > MAX_CARD_INDEX) return;
        const now = Date.now();
        if (!throttleCardClick(session.userId, now)) return;
        const roomId = Array.from(socket.rooms).find(r => r.startsWith('room_') || r.startsWith('botRoom_'));
        if (!roomId) return;
        processCardFlip(io, roomId, session.userId, cardIndex);
    });
}

function handleUseHint(io, socket) {
    socket.on('useHint', (data) => {
        if (!data || typeof data !== 'object') return;
        const session = socket.request.session;
        const userId = session?.userId;
        if (!userId) return;
        if (!wsRateLimit(userId, 'useHint', 5)) return;

        const hintType = data.type;
        const cfg = hintSettings.get();
        const HINT_COSTS = {
            reveal_one: cfg.hint_cost_reveal_one,
            reveal_pair: cfg.hint_cost_reveal_pair,
            extra_turn: cfg.hint_cost_extra_turn
        };
        const cost = HINT_COSTS[hintType];
        if (!cost && cost !== 0) return;

        const roomId = Array.from(socket.rooms).find(r => r.startsWith('room_') || r.startsWith('botRoom_'));
        if (!roomId) return;
        const room = getRoom(roomId);
        if (!room || room.status !== 'playing') return;

        if (!room.hintsState) room.hintsState = {};
        if (!room.hintsState[userId]) room.hintsState[userId] = { count: 0, extraTurn: false };
        const hs = room.hintsState[userId];
        if (hs.count >= cfg.hint_limit) { socket.emit('hintError', { reason: 'limit_reached' }); return; }
        hs.count++;

        coinsService.spendCoins(userId, cost, (err, result) => {
            if (err || !result.ok) {
                hs.count--;
                socket.emit('hintError', { reason: 'not_enough_coins', current: result?.current || 0, cost });
                return;
            }
            socket.emit('coinsUpdate', { coins: result.newBalance, delta: -cost, reason: 'hint_' + hintType });

            if (hintType === 'reveal_one') {
                const unmatched = [];
                room.deck.forEach((val, idx) => {
                    if (!room.matchedPairs.includes(val) && !room.openedCards.includes(idx)) {
                        unmatched.push({ index: idx, value: val });
                    }
                });
                if (!unmatched.length) { socket.emit('hintError', { reason: 'no_cards' }); return; }
                const pick = unmatched[Math.floor(Math.random() * unmatched.length)];
                socket.emit('hintReveal', { type: 'reveal_one', cards: [pick] });

            } else if (hintType === 'reveal_pair') {
                const unmatchedVals = [...new Set(
                    room.deck.filter((val, idx) => !room.matchedPairs.includes(val) && !room.openedCards.includes(idx))
                )];
                if (!unmatchedVals.length) { socket.emit('hintError', { reason: 'no_cards' }); return; }
                const targetVal = unmatchedVals[Math.floor(Math.random() * unmatchedVals.length)];
                const indices = [];
                room.deck.forEach((val, idx) => {
                    if (val === targetVal && !room.openedCards.includes(idx)) indices.push(idx);
                });
                socket.emit('hintReveal', { type: 'reveal_pair', cards: indices.map(i => ({ index: i, value: targetVal })) });

            } else if (hintType === 'extra_turn') {
                hs.extraTurn = true;
                socket.emit('hintReveal', { type: 'extra_turn', cards: [] });
            }
        });
    });
}

module.exports = { handleCardClick, handleUseHint };
