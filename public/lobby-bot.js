// ==================== BOT GAME (in startGameModal) ====================

function showBotError(msg) {
    const errEl = document.getElementById('botModalError');
    if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
}

function hideBotError() {
    const errEl = document.getElementById('botModalError');
    if (errEl) errEl.classList.add('hidden');
}

const startBotGameBtn = document.getElementById('startBotGameBtn');
if (startBotGameBtn) {
    startBotGameBtn.onclick = () => {
        if (hasRejoinableRoom()) {
            if (typeof window.closeStartGameModal === 'function') window.closeStartGameModal();
            showRejoinBlockBanner();
            return;
        }
        let selectedCategory = document.getElementById('botCategory').value;
        const difficulty = document.getElementById('botDifficulty').value;
        const gridSize = parseInt(document.getElementById('botGridSize') ? document.getElementById('botGridSize').value : '6', 10) || 6;
        if (selectedCategory === 'random') {
            const availableKeys = Object.keys(window.icons).filter(k => k !== 'unicode');
            selectedCategory = availableKeys.length > 0 ? availableKeys[Math.floor(Math.random() * availableKeys.length)] : 'animals';
        }
        const isPrivate = document.getElementById('botPrivate') ? document.getElementById('botPrivate').checked : false;
        hideBotError();
        window.socket.emit('createBotRoom', { category: selectedCategory, difficulty, gridSize, isPrivate });
    };
}

window.socket.on('botRoomThrottle', (data) => {
    const seconds = data.remainingSeconds || 60;
    const msg = `${window.t('bot_throttle_too_many')} ${window.t('bot_throttle_wait').replace('{n}', seconds)}`;
    showBotError(msg);
    let remaining = seconds;
    const tick = setInterval(() => {
        remaining--;
        const errEl = document.getElementById('botModalError');
        if (remaining <= 0 || !errEl || errEl.classList.contains('hidden')) {
            clearInterval(tick);
            hideBotError();
            return;
        }
        errEl.textContent = `${window.t('bot_throttle_too_many')} ${window.t('bot_throttle_wait').replace('{n}', remaining)}`;
    }, 1000);
});

window.socket.on('gameStart', () => {
    if (typeof window.closeStartGameModal === 'function') window.closeStartGameModal();
});
