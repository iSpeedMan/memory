// ==================== BOT MODAL ====================
const openBotModalBtn = document.getElementById('openBotModalBtn');
const botModal = document.getElementById('botModal');
const closeBotModalBtn = document.getElementById('closeBotModalBtn');

function closeBotModal() {
    if (botModal) botModal.classList.add('hidden');
    hideBotError();
    window.modalPop('bot');
}

if (openBotModalBtn && botModal) {
    openBotModalBtn.onclick = () => {
        botModal.classList.remove('hidden');
        window.modalPush('bot', closeBotModal);
    };
}
if (closeBotModalBtn && botModal) closeBotModalBtn.onclick = closeBotModal;
if (botModal) window.addSwipeClose(botModal, closeBotModal);

function showBotError(msg) {
    let errEl = document.getElementById('botModalError');
    if (!errEl) {
        errEl = document.createElement('div');
        errEl.id = 'botModalError';
        errEl.className = 'metro-error bot-error-msg';
        const startBtn = document.getElementById('startBotGameBtn');
        if (startBtn && startBtn.parentNode) startBtn.parentNode.insertBefore(errEl, startBtn);
    }
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
}

function hideBotError() {
    const errEl = document.getElementById('botModalError');
    if (errEl) errEl.classList.add('hidden');
}

const startBotGameBtn = document.getElementById('startBotGameBtn');
if (startBotGameBtn) {
    startBotGameBtn.onclick = () => {
        if (hasRejoinableRoom()) {
            if (botModal) botModal.classList.add('hidden');
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
        hideBotError();
        window.socket.emit('createBotRoom', { category: selectedCategory, difficulty, gridSize });
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
    closeBotModal();
});
