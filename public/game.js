const board = document.getElementById('board');
let currentRoomCategory = '';
let currentGridSize = 6;
let currentTotalPairs = 18;
let currentCategoryEmojis = null;
let amISpectator = false;
let currentTurnPlayerId = null;
let comboCounters = {};
let prevScores = {};

const domCache = {
    p1Avatar: null, p1Name: null, p1Score: null, p1Display: null,
    p2Avatar: null, p2Name: null, p2Score: null, p2Display: null,
    activePlayerName: null, comboPopup: null, comboMultiplier: null,
    scoreFloatContainer: null
};

function initDomCache() {
    domCache.p1Avatar = document.getElementById('p1Avatar');
    domCache.p1Name = document.getElementById('p1Name');
    domCache.p1Score = document.getElementById('p1Score');
    domCache.p1Display = document.getElementById('p1Display');
    domCache.p2Avatar = document.getElementById('p2Avatar');
    domCache.p2Name = document.getElementById('p2Name');
    domCache.p2Score = document.getElementById('p2Score');
    domCache.p2Display = document.getElementById('p2Display');
    domCache.activePlayerName = document.getElementById('activePlayerName');
    domCache.comboPopup = document.getElementById('comboPopup');
    domCache.comboMultiplier = document.getElementById('comboMultiplier');
    domCache.scoreFloatContainer = document.getElementById('scoreFloatContainer');
}

function getEmojiForValue(value) {
    const emojiArray = currentCategoryEmojis || window.icons[currentRoomCategory] || [];
    if (!emojiArray.length) return '❓';
    const idx = (value - 1) % emojiArray.length;
    return emojiArray[idx] || '❓';
}

function isMirroredValue(value) {
    const emojiArray = currentCategoryEmojis || window.icons[currentRoomCategory] || [];
    return emojiArray.length > 0 && value > emojiArray.length;
}

function initBoard() {
    if (!board) return;
    const size = currentGridSize || 6;
    const cardCount = size * size;
    board.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    board.style.gridTemplateRows = `repeat(${size}, 1fr)`;
    board.innerHTML = '';
    for (let i = 0; i < cardCount; i++) {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.index = i;
        card.innerHTML = `<div class="card-inner"><div class="card-front"></div><div class="card-back"></div><div class="metro-card-count" id="count-${i}">0</div></div>`;
        card.onclick = () => {
            if (!amISpectator && !card.classList.contains('flipped')) {
                window.socket.emit('cardClick', i);
            }
        };
        board.appendChild(card);
    }
}

function updateGameStatus(room, activeTurnId) {
    const p1 = room.players[0];
    const p2 = room.players[1];
    currentTurnPlayerId = activeTurnId;
    comboCounters = {};
    prevScores = {};
    room.players.forEach(p => {
        comboCounters[String(p.id)] = 0;
        prevScores[String(p.id)] = p.score || 0;
    });
    if (domCache.p1Avatar) domCache.p1Avatar.textContent = p1.avatar || '😶';
    if (domCache.p1Name) domCache.p1Name.textContent = p1.name;
    if (domCache.p1Score) domCache.p1Score.textContent = p1.score || 0;
    if (p2) {
        if (domCache.p2Avatar) domCache.p2Avatar.textContent = p2.avatar || '😶';
        if (domCache.p2Name) domCache.p2Name.textContent = p2.name;
        if (domCache.p2Score) domCache.p2Score.textContent = p2.score || 0;
    }
    if (domCache.p1Display) {
        domCache.p1Display.dataset.playerId = p1.id;
        domCache.p1Display.classList.toggle('active', activeTurnId === p1.id);
    }
    if (domCache.p2Display && p2) {
        domCache.p2Display.dataset.playerId = p2.id;
        domCache.p2Display.classList.toggle('active', activeTurnId === p2.id);
    }
    const activePlayer = room.players.find(p => p.id === activeTurnId);
    if (activePlayer && domCache.activePlayerName) domCache.activePlayerName.textContent = activePlayer.name;
}

function flipCard(index, value, matchColor = null) {
    if (!board) return;
    const card = board.children[index];
    if (!card) return;
    card.classList.add('flipped');
    const back = card.querySelector('.card-back');
    const emoji = getEmojiForValue(value);
    if (back) {
        back.textContent = emoji;
        if (isMirroredValue(value)) {
            back.classList.add('card-emoji-mirrored');
        } else {
            back.classList.remove('card-emoji-mirrored');
        }
    }
    if (matchColor) {
        if (back) { back.style.borderColor = matchColor; back.style.color = matchColor; }
        card.classList.add('matched');
    }
}

function unflipCards(indices) {
    if (!board) return;
    indices.forEach(index => {
        const card = board.children[index];
        if (card) {
            card.classList.remove('flipped');
            setTimeout(() => {
                const back = card.querySelector('.card-back');
                if (back) { back.textContent = ''; back.classList.remove('card-emoji-mirrored'); }
            }, 300);
        }
    });
}

// ==================== COMBO ====================
function getComboLevel(multiplier) {
    if (multiplier >= 3) return 4;
    if (multiplier >= 2.5) return 3;
    if (multiplier >= 2) return 2;
    return 1;
}

function showCombo(multiplier, isBot) {
    if (!domCache.comboPopup) return;
    const level = getComboLevel(multiplier);
    const label = multiplier % 1 === 0 ? `×${multiplier}` : `×${multiplier.toFixed(1)}`;
    if (domCache.comboMultiplier) domCache.comboMultiplier.textContent = label;
    domCache.comboPopup.classList.remove('show', 'bot', 'combo-level-1', 'combo-level-2', 'combo-level-3', 'combo-level-4');
    domCache.comboPopup.classList.add(`combo-level-${level}`);
    if (isBot) domCache.comboPopup.classList.add('bot');
    void domCache.comboPopup.offsetWidth;
    domCache.comboPopup.classList.add('show');
    window.playSnd('combo');
    setTimeout(() => { domCache.comboPopup.classList.remove('show'); }, 2600);
}

function showScoreFloat(playerId, delta, isCombo) {
    const container = domCache.scoreFloatContainer;
    if (!container) return;
    const isP1 = domCache.p1Display && String(domCache.p1Display.dataset.playerId) === String(playerId);
    const el = document.createElement('div');
    el.className = `score-float ${isP1 ? 'score-float-p1' : 'score-float-p2'}${isCombo ? ' score-float-combo' : ''}`;
    const formattedDelta = Number.isInteger(delta) ? delta : delta.toFixed(1);
    el.textContent = `+${formattedDelta}`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 1100);
}

function pulseScore(isP1) {
    const el = isP1 ? domCache.p1Score : domCache.p2Score;
    if (!el) return;
    el.classList.remove('score-pulse');
    void el.offsetWidth;
    el.classList.add('score-pulse');
    setTimeout(() => el.classList.remove('score-pulse'), 500);
}

// ==================== ACHIEVEMENT TOAST ====================
function showAchievementToast(ach) {
    const toast = document.getElementById('achievementToast');
    if (!toast) return;
    const iconEl = document.getElementById('achievementToastIcon');
    const nameEl = document.getElementById('achievementToastName');
    const descEl = document.getElementById('achievementToastDesc');
    if (iconEl) iconEl.textContent = ach.icon || '🏆';
    if (nameEl) nameEl.textContent = window.currentLang === 'ru' ? (ach.name_ru || ach.name_en) : (ach.name_en || ach.name_ru);
    if (descEl) descEl.textContent = window.currentLang === 'ru' ? (ach.desc_ru || ach.desc_en) : (ach.desc_en || ach.desc_ru);
    toast.classList.remove('hidden', 'toast-out');
    void toast.offsetWidth;
    clearTimeout(window._achievementToastTimer);
    window._achievementToastTimer = setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.classList.add('hidden'), 500);
    }, 4000);
}

window.socket.on('achievementUnlocked', (ach) => {
    showAchievementToast(ach);
});

// ==================== RECONNECT ====================
function showReconnectOverlay() {
    const overlay = document.getElementById('reconnectOverlay');
    const msg = document.getElementById('reconnectMsg');
    const countdown = document.getElementById('reconnectCountdown');
    if (!overlay) return;
    if (msg) msg.textContent = window.t('opponent_disconnected_wait');
    if (countdown) countdown.textContent = '⏳';
    overlay.classList.remove('hidden');
}

function hideReconnectOverlay() {
    const overlay = document.getElementById('reconnectOverlay');
    if (overlay) overlay.classList.add('hidden');
}

window.socket.on('opponentDisconnected', showReconnectOverlay);
window.socket.on('opponentReconnected', () => {
    hideReconnectOverlay();
    const overlay = document.getElementById('reconnectOverlay');
    const msg = document.getElementById('reconnectMsg');
    const countdown = document.getElementById('reconnectCountdown');
    if (overlay && msg && countdown) {
        msg.textContent = window.t('opponent_reconnected');
        countdown.textContent = '✅';
        overlay.classList.remove('hidden');
        setTimeout(() => overlay.classList.add('hidden'), 2000);
    }
});

window.socket.on('gameReconnect', (data) => {
    if (data.cardStats) {
        data.cardStats.forEach((stat, idx) => {
            const el = document.getElementById(`count-${idx}`);
            if (el) el.textContent = stat;
        });
    }
    for (const [idx, cardData] of Object.entries(data.matchedCards || {})) {
        flipCard(Number(idx), cardData.value, cardData.color);
    }
    (data.openedCards || []).forEach(card => flipCard(card.index, card.value));
});

// ==================== GAME CHAT ====================
let gameChatOpen = false;

function addGameChatMessage(msg) {
    const container = document.getElementById('gameChatMessages');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'chat-message';
    const isSelf = msg.username === window.currentUsername;
    el.classList.toggle('chat-msg-self', isSelf);
    el.innerHTML = `<span class="chat-msg-avatar">${window.escHtml(msg.avatar || '😶')}</span><span class="chat-msg-name">${window.escHtml(msg.username)}</span><span class="chat-msg-text">${window.escHtml(msg.text)}</span>`;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
    // Keep max 30 messages
    while (container.children.length > 30) container.removeChild(container.firstChild);
}

const gameChatToggle = document.getElementById('gameChatToggle');
const gameChatPanel = document.getElementById('gameChatPanel');
const gameChatClose = document.getElementById('gameChatClose');
const gameChatSend = document.getElementById('gameChatSend');
const gameChatInput = document.getElementById('gameChatInput');

if (gameChatToggle) {
    gameChatToggle.onclick = () => {
        gameChatOpen = !gameChatOpen;
        if (gameChatPanel) gameChatPanel.classList.toggle('hidden', !gameChatOpen);
        if (gameChatOpen) {
            window.socket.emit('getChatHistory', {});
            if (gameChatInput) gameChatInput.focus();
        }
    };
}

if (gameChatClose) {
    gameChatClose.onclick = () => {
        gameChatOpen = false;
        if (gameChatPanel) gameChatPanel.classList.add('hidden');
    };
}

function sendGameChat() {
    if (!gameChatInput) return;
    const text = gameChatInput.value.trim();
    if (!text) return;
    window.socket.emit('sendChat', { text });
    gameChatInput.value = '';
}

if (gameChatSend) gameChatSend.onclick = sendGameChat;
if (gameChatInput) gameChatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendGameChat(); });

window.socket.on('chatMessage', (msg) => {
    // Only display in game chat if game chat panel exists
    const gameScreen = document.getElementById('gameScreen');
    if (gameScreen && !gameScreen.classList.contains('hidden')) {
        addGameChatMessage(msg);
        // Show badge on toggle button if chat is closed
        if (!gameChatOpen && gameChatToggle) {
            gameChatToggle.classList.add('chat-has-new');
        }
    }
});

window.socket.on('chatHistory', (data) => {
    const gameScreen = document.getElementById('gameScreen');
    if (gameScreen && !gameScreen.classList.contains('hidden')) {
        const container = document.getElementById('gameChatMessages');
        if (container) {
            container.innerHTML = '';
            (data.messages || []).forEach(msg => addGameChatMessage(msg));
        }
    }
});

// ==================== GAME ====================
window.startGameLogic = function(data) {
    amISpectator = false;
    currentRoomCategory = data.room.category;
    currentGridSize = data.room.gridSize || 6;
    currentTotalPairs = data.room.totalPairs || 18;
    currentCategoryEmojis = data.room.categoryEmojis || null;
    if (currentCategoryEmojis) window.icons[currentRoomCategory] = currentCategoryEmojis;
    hideReconnectOverlay();
    initDomCache();
    initBoard();
    updateGameStatus(data.room, data.turn);
    // Reset chat
    gameChatOpen = false;
    if (gameChatPanel) gameChatPanel.classList.add('hidden');
    if (gameChatToggle) gameChatToggle.classList.remove('chat-has-new');
    const gameChatMessages = document.getElementById('gameChatMessages');
    if (gameChatMessages) gameChatMessages.innerHTML = '';
};

window.socket.on('spectateStart', (data) => {
    document.getElementById('lobbyScreen').classList.add('hidden');
    document.getElementById('gameScreen').classList.remove('hidden');
    amISpectator = true;
    currentRoomCategory = data.room.category;
    currentGridSize = data.room.gridSize || 6;
    currentTotalPairs = data.room.totalPairs || 18;
    currentCategoryEmojis = data.room.categoryEmojis || null;
    if (currentCategoryEmojis) window.icons[currentRoomCategory] = currentCategoryEmojis;
    initDomCache();
    initBoard();
    updateGameStatus(data.room, data.turn);
    if (data.cardStats) {
        data.cardStats.forEach((stat, idx) => {
            const el = document.getElementById(`count-${idx}`);
            if (el) el.textContent = stat;
        });
    }
    for (const [index, cardData] of Object.entries(data.matchedCards)) {
        flipCard(Number(index), cardData.value, cardData.color);
    }
    data.openedCards.forEach(card => flipCard(card.index, card.value));
});

window.socket.on('cardOpened', (data) => {
    window.playSnd('tile');
    flipCard(data.index, data.value);
    const countEl = document.getElementById(`count-${data.index}`);
    if (countEl) countEl.textContent = data.stats;
});

window.socket.on('matchFound', (data) => {
    window.playSnd('tile-closed');
    data.indices.forEach(index => {
        const card = board ? board.children[index] : null;
        if (card) {
            const back = card.querySelector('.card-back');
            if (back) { back.style.borderColor = data.matchColor; back.style.color = data.matchColor; }
            card.classList.add('matched');
        }
    });
    const turnKey = String(currentTurnPlayerId);
    data.players.forEach(p => {
        const pKey = String(p.id);
        const oldScore = prevScores[pKey] || 0;
        const delta = p.score - oldScore;
        prevScores[pKey] = p.score;
        const isP1 = domCache.p1Display && String(domCache.p1Display.dataset.playerId) === pKey;
        if (isP1) { if (domCache.p1Score) domCache.p1Score.textContent = p.score; }
        else { if (domCache.p2Score) domCache.p2Score.textContent = p.score; }
        if (delta > 0 && pKey === turnKey) {
            const comboNow = (comboCounters[turnKey] || 0) + 1;
            showScoreFloat(p.id, delta, comboNow >= 2);
            pulseScore(isP1);
        }
    });
    if (turnKey && comboCounters[turnKey] !== undefined) {
        comboCounters[turnKey]++;
        const combo = comboCounters[turnKey];
        if (combo >= 2) {
            const multiplier = Math.min(1 + (combo - 1) * 0.5, 3);
            showCombo(multiplier, turnKey === 'bot_cpu');
        }
    }
});

window.socket.on('matchFailed', (data) => {
    unflipCards(data.indices);
    const turnKey = String(currentTurnPlayerId);
    if (turnKey && comboCounters[turnKey] !== undefined) comboCounters[turnKey] = 0;
});

window.socket.on('turnChanged', (activePlayerId) => {
    currentTurnPlayerId = activePlayerId;
    if (!domCache.p1Display || !domCache.p2Display || !domCache.p1Name || !domCache.p2Name || !domCache.activePlayerName) return;
    const activeId = String(activePlayerId);
    const p1Id = domCache.p1Display.dataset.playerId;
    if (activeId === p1Id) {
        domCache.p1Display.classList.add('active');
        domCache.p2Display.classList.remove('active');
        domCache.activePlayerName.textContent = domCache.p1Name.textContent;
    } else {
        domCache.p2Display.classList.add('active');
        domCache.p1Display.classList.remove('active');
        domCache.activePlayerName.textContent = domCache.p2Name.textContent;
    }
});

window.socket.on('gameOver', (data) => {
    hideReconnectOverlay();
    const p1 = data.players[0], p2 = data.players[1];
    let resultText = '';
    let isWin = false, isLose = false, isDraw = false;
    const amIP1 = p1.name === window.currentUsername;
    const amIP2 = p2 && p2.name === window.currentUsername;
    if (p1.score > p2.score) {
        resultText = `${window.t('win')} ${window.escHtml(p1.name)}! `;
        if (amIP1) isWin = true; else isLose = true;
    } else if (p2.score > p1.score) {
        resultText = `${window.t('win')} ${window.escHtml(p2.name)}! `;
        if (amIP2) isWin = true; else isLose = true;
    } else {
        resultText = window.t('draw');
        isDraw = true;
    }
    if (!amISpectator) {
        if (isWin) window.playSnd('win');
        else if (isLose) window.playSnd('lose');
        else if (isDraw) window.playSnd('match');
    }
    const resultEl = document.getElementById('gameOverResult');
    if (resultEl) resultEl.innerHTML = resultText;
    const scoresEl = document.getElementById('gameOverScores');
    if (scoresEl) {
        scoresEl.innerHTML = `${window.escHtml(p1.avatar || '😶')} ${window.escHtml(p1.name)}: <span class="text-accent">${Number(p1.score)}</span><br>${window.escHtml(p2.avatar || '😶')} ${window.escHtml(p2.name)}: <span class="text-accent">${Number(p2.score)}</span>`;
    }
    const modal = document.getElementById('gameOverModal');
    if (modal) modal.classList.remove('hidden');
    // Close chat on game over
    if (gameChatPanel) gameChatPanel.classList.add('hidden');
    gameChatOpen = false;
});

if (document.getElementById('backToLobbyBtn')) document.getElementById('backToLobbyBtn').onclick = () => location.reload();
if (document.getElementById('exitLobbyBtn')) document.getElementById('exitLobbyBtn').onclick = () => location.reload();

window.socket.on('roomClosed', (reasonCode) => {
    hideReconnectOverlay();
    const modal = document.getElementById('customAlertModal');
    const textEl = document.getElementById('customAlertText');
    const btnOk = document.getElementById('customAlertBtn');
    if (modal && textEl && btnOk) {
        textEl.textContent = window.t(reasonCode);
        modal.classList.remove('hidden');
        btnOk.onclick = () => location.reload();
    } else {
        alert(window.t(reasonCode));
        location.reload();
    }
});
