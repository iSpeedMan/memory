// hints.js — client-side coins & hints system

window._myCoins = 0;
const _hintRevealedCards = new Set();

// ==================== COINS DISPLAY ====================
function updateCoinsDisplay(coins) {
    window._myCoins = coins;
    document.querySelectorAll('.coins-display-val').forEach(el => { el.textContent = coins; });
}
window.updateCoinsDisplay = updateCoinsDisplay;

window.socket.on('coinsUpdate', (data) => {
    if (!data || typeof data.coins !== 'number') return;
    updateCoinsDisplay(data.coins);
    const delta = data.delta || 0;
    if (delta > 0) {
        const reasonMap = {
            daily_bonus: (window.t ? window.t('coins_daily_bonus') : '🎁 Daily bonus: +{n}!').replace('{n}', delta),
            win: `🏆 +${delta} 🪙`,
            loss: `💪 +${delta} 🪙`,
            draw: `🤝 +${delta} 🪙`,
        };
        const msg = reasonMap[data.reason] || (data.reason && data.reason.startsWith('combo_') ? `🔥 +${delta} 🪙` : `+${delta} 🪙`);
        if (typeof window.showToast === 'function') window.showToast(msg);
    }
});

// ==================== HINT STATE ====================
const HINT_COSTS = { reveal_one: 30, reveal_pair: 50, extra_turn: 40 };
const MAX_HINTS = 5;
let _hintUsedCount = 0;
let _extraTurnActive = false;
let _hintGameActive = false;

function setHintButtonsVisible(visible) {
    const wrap = document.getElementById('hintBtnsWrap');
    if (wrap) wrap.classList.toggle('hidden', !visible);
    _hintGameActive = visible;
    if (visible) {
        _hintUsedCount = 0;
        _extraTurnActive = false;
        _hintRevealedCards.clear();
    }
    _updateHintButtons();
}
window.setHintButtonsVisible = setHintButtonsVisible;

function _updateHintButtons() {
    const coins = window._myCoins || 0;
    const remaining = MAX_HINTS - _hintUsedCount;
    [
        { id: 'hintRevealOneBtn', cost: HINT_COSTS.reveal_one },
        { id: 'hintRevealPairBtn', cost: HINT_COSTS.reveal_pair },
        { id: 'hintExtraTurnBtn', cost: HINT_COSTS.extra_turn },
    ].forEach(({ id, cost }) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.disabled = remaining <= 0 || coins < cost;
    });
    const countEl = document.getElementById('hintCountDisplay');
    if (countEl) countEl.textContent = remaining;
    const etBtn = document.getElementById('hintExtraTurnBtn');
    if (etBtn) etBtn.classList.toggle('hint-btn-active', _extraTurnActive);
}

function _sendHint(type) {
    if (!_hintGameActive) return;
    if (_hintUsedCount >= MAX_HINTS) {
        if (typeof window.showToast === 'function') window.showToast(window.t ? window.t('hint_limit_reached') : 'Hint limit reached!');
        return;
    }
    if ((window._myCoins || 0) < HINT_COSTS[type]) {
        if (typeof window.showToast === 'function') window.showToast(window.t ? window.t('hint_not_enough_coins') : 'Not enough coins!');
        return;
    }
    window.socket.emit('useHint', { type });
}

// ==================== HINT REVEAL ====================
const HINT_SHOW_MS = 2500;

window.socket.on('hintReveal', (data) => {
    if (!data || !data.type) return;
    _hintUsedCount++;

    if (data.type === 'extra_turn') {
        _extraTurnActive = true;
        _updateHintButtons();
        if (typeof window.showToast === 'function') window.showToast(window.t ? window.t('hint_extra_turn_active') : '🔄 Extra turn active!');
        return;
    }

    _updateHintButtons();
    if (!Array.isArray(data.cards) || !data.cards.length) return;

    const indices = data.cards.map(c => c.index);

    data.cards.forEach(card => {
        if (typeof window.flipCard === 'function') window.flipCard(card.index, card.value);
    });

    setTimeout(() => {
        indices.forEach(idx => _hintRevealedCards.add(idx));
        if (typeof window.unflipCards === 'function') window.unflipCards(indices);
        setTimeout(() => {
            const board = document.getElementById('board');
            if (!board) return;
            indices.forEach(idx => {
                const card = board.children[idx];
                if (card && !card.classList.contains('matched')) card.classList.add('hint-revealed');
            });
        }, 350);
    }, HINT_SHOW_MS);
});

window.socket.on('extraTurnUsed', () => {
    _extraTurnActive = false;
    _updateHintButtons();
    if (typeof window.showToast === 'function') window.showToast(window.t ? window.t('hint_extra_turn_used') : '🔄 Extra turn used!');
});

window.socket.on('hintError', (data) => {
    if (!data) return;
    const msg = data.reason === 'not_enough_coins'
        ? (window.t ? window.t('hint_not_enough_coins') : 'Not enough coins!')
        : data.reason === 'limit_reached'
            ? (window.t ? window.t('hint_limit_reached') : 'Hint limit reached!')
            : 'Hint unavailable';
    if (typeof window.showToast === 'function') window.showToast(msg);
});

window.socket.on('matchFound', () => {
    setTimeout(() => {
        const board = document.getElementById('board');
        if (!board) return;
        board.querySelectorAll('.hint-revealed.matched').forEach(el => el.classList.remove('hint-revealed'));
    }, 100);
});

// ==================== GAME LIFECYCLE ====================
window.socket.on('gameStart', () => {
    setHintButtonsVisible(true);
});
window.socket.on('gameOver', () => {
    setHintButtonsVisible(false);
});
window.socket.on('roomClosed', () => {
    setHintButtonsVisible(false);
});

// ==================== BUTTON WIRING ====================
document.addEventListener('DOMContentLoaded', () => {
    const b1 = document.getElementById('hintRevealOneBtn');
    const b2 = document.getElementById('hintRevealPairBtn');
    const b3 = document.getElementById('hintExtraTurnBtn');
    if (b1) b1.onclick = () => _sendHint('reveal_one');
    if (b2) b2.onclick = () => _sendHint('reveal_pair');
    if (b3) b3.onclick = () => _sendHint('extra_turn');
});
