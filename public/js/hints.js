// hints.js — client-side Memcoin & hints system

window._myCoins = 0;
const _hintRevealedCards = new Set();

// Dynamic hint settings (loaded from server on gameStart)
let _hintCosts = { reveal_one: 30, reveal_pair: 50, extra_turn: 40 };
let _hintLimit = 3;

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
            daily_bonus: (window.t ? window.t('coins_daily_bonus') : '🎁 Daily bonus: +{n} MC!').replace('{n}', delta),
            win: `🏆 +${delta} 🪙MC`,
            loss: `💪 +${delta} 🪙MC`,
            draw: `🤝 +${delta} 🪙MC`,
            announcement: (window.t ? window.t('coins_reward_claimed') : '🪙 +{n} MC!').replace('{n}', delta),
        };
        const msg = reasonMap[data.reason] || (data.reason && data.reason.startsWith('combo_') ? `🔥 +${delta} 🪙MC` : `+${delta} 🪙MC`);
        if (typeof window.showToast === 'function') window.showToast(msg);
        _triggerCoinRain(delta);
    }
});

// ==================== COIN RAIN ANIMATION ====================
function _triggerCoinRain(amount) {
    if (amount < 20) return;
    const container = document.body;
    const count = Math.min(Math.floor(amount / 5), 20);
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const el = document.createElement('div');
            el.className = 'coin-rain-particle';
            el.textContent = '🪙';
            el.style.left = (Math.random() * 90 + 5) + 'vw';
            el.style.animationDuration = (0.8 + Math.random() * 0.8) + 's';
            el.style.fontSize = (16 + Math.random() * 12) + 'px';
            container.appendChild(el);
            setTimeout(() => el.remove(), 2000);
        }, i * 60);
    }
}

// ==================== HINT STATE ====================
let _hintUsedCount = 0;
let _extraTurnActive = false;
let _hintGameActive = false;

function _updateCostLabels() {
    const map = { reveal_one: 'hintCost_reveal_one', reveal_pair: 'hintCost_reveal_pair', extra_turn: 'hintCost_extra_turn' };
    Object.entries(map).forEach(([key, elId]) => {
        const el = document.getElementById(elId);
        if (el) el.textContent = _hintCosts[key];
    });
    const countEl = document.getElementById('hintCountDisplay');
    if (countEl) countEl.textContent = _hintLimit - _hintUsedCount;
}

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
    const remaining = _hintLimit - _hintUsedCount;
    [
        { id: 'hintRevealOneBtn', cost: _hintCosts.reveal_one },
        { id: 'hintRevealPairBtn', cost: _hintCosts.reveal_pair },
        { id: 'hintExtraTurnBtn', cost: _hintCosts.extra_turn },
    ].forEach(({ id, cost }) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.disabled = remaining <= 0 || coins < cost;
        btn.classList.toggle('hint-btn-unaffordable', coins < cost && remaining > 0);
    });
    const countEl = document.getElementById('hintCountDisplay');
    if (countEl) countEl.textContent = Math.max(0, remaining);
    const etBtn = document.getElementById('hintExtraTurnBtn');
    if (etBtn) etBtn.classList.toggle('hint-btn-active', _extraTurnActive);
    _updateCostLabels();
}

function _sendHint(type) {
    if (!_hintGameActive) return;
    if (_hintUsedCount >= _hintLimit) {
        if (typeof window.showToast === 'function') window.showToast(window.t ? window.t('hint_limit_reached') : 'Hint limit reached!');
        return;
    }
    if ((window._myCoins || 0) < _hintCosts[type]) {
        if (typeof window.showToast === 'function') window.showToast(window.t ? window.t('hint_not_enough_coins') : 'Not enough Memcoin!');
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
    if (data.reason === 'limit_reached' || data.reason === 'not_enough_coins') _hintUsedCount = Math.max(0, _hintUsedCount - 1);
    const msg = data.reason === 'not_enough_coins'
        ? (window.t ? window.t('hint_not_enough_coins') : 'Not enough Memcoin!')
        : data.reason === 'limit_reached'
            ? (window.t ? window.t('hint_limit_reached') : 'Hint limit reached!')
            : 'Hint unavailable';
    _updateHintButtons();
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
window.socket.on('gameStart', (data) => {
    if (data && data.hintSettings) {
        const hs = data.hintSettings;
        if (Number.isFinite(hs.hint_limit) && hs.hint_limit > 0) _hintLimit = hs.hint_limit;
        if (Number.isFinite(hs.hint_cost_reveal_one)) _hintCosts.reveal_one = hs.hint_cost_reveal_one;
        if (Number.isFinite(hs.hint_cost_reveal_pair)) _hintCosts.reveal_pair = hs.hint_cost_reveal_pair;
        if (Number.isFinite(hs.hint_cost_extra_turn)) _hintCosts.extra_turn = hs.hint_cost_extra_turn;
    }
    setHintButtonsVisible(true);
});
window.socket.on('gameOver', () => { setHintButtonsVisible(false); });
window.socket.on('roomClosed', () => { setHintButtonsVisible(false); });

// Load hint settings from server on startup for display
fetch('/api/admin/hint-settings-public')
    .then(r => r.ok ? r.json() : null)
    .then(cfg => {
        if (!cfg) return;
        if (Number.isFinite(cfg.hint_limit) && cfg.hint_limit > 0) _hintLimit = cfg.hint_limit;
        if (Number.isFinite(cfg.hint_cost_reveal_one)) _hintCosts.reveal_one = cfg.hint_cost_reveal_one;
        if (Number.isFinite(cfg.hint_cost_reveal_pair)) _hintCosts.reveal_pair = cfg.hint_cost_reveal_pair;
        if (Number.isFinite(cfg.hint_cost_extra_turn)) _hintCosts.extra_turn = cfg.hint_cost_extra_turn;
        _updateCostLabels();
    })
    .catch(() => {});

// ==================== BUTTON WIRING ====================
document.addEventListener('DOMContentLoaded', () => {
    const b1 = document.getElementById('hintRevealOneBtn');
    const b2 = document.getElementById('hintRevealPairBtn');
    const b3 = document.getElementById('hintExtraTurnBtn');
    if (b1) b1.onclick = () => _sendHint('reveal_one');
    if (b2) b2.onclick = () => _sendHint('reveal_pair');
    if (b3) b3.onclick = () => _sendHint('extra_turn');
    _updateCostLabels();
});
