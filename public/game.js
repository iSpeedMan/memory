const board = document.getElementById('board');
let currentRoomCategory = '';
let amISpectator = false;
let currentTurnPlayerId = null; // Хранит ID текущего игрока для combo-логики
let comboCounters = {};         // Combo для каждого игрока отдельно

function initBoard() {
    if (!board) return;
    board.innerHTML = '';
    for (let i = 0; i < 36; i++) {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.index = i;
        card.innerHTML = `<div class=\"card-inner\"><div class=\"card-front\"></div><div class=\"card-back\"></div><div class=\"metro-card-count\" id=\"count-${i}\">0</div></div>`;
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

    // Инициализация combo-счётчиков
    comboCounters = {};
    room.players.forEach(p => { comboCounters[p.id] = 0; });

    const el = (id) => document.getElementById(id);
    if (el('p1Avatar')) el('p1Avatar').textContent = p1.avatar || '😶';
    if (el('p1Name')) el('p1Name').textContent = p1.name;
    if (el('p1Score')) el('p1Score').textContent = p1.score || 0;
    
    if (p2) {
        if (el('p2Avatar')) el('p2Avatar').textContent = p2.avatar || '😶';
        if (el('p2Name')) el('p2Name').textContent = p2.name;
        if (el('p2Score')) el('p2Score').textContent = p2.score || 0;
    }

    if (el('p1Display')) {
        el('p1Display').dataset.playerId = p1.id;
        el('p1Display').classList.toggle('active', activeTurnId === p1.id);
    }
    if (el('p2Display') && p2) {
        el('p2Display').dataset.playerId = p2.id;
        el('p2Display').classList.toggle('active', activeTurnId === p2.id);
    }

    const activePlayer = room.players.find(p => p.id === activeTurnId);
    if (activePlayer && el('activePlayerName')) el('activePlayerName').textContent = activePlayer.name;
}

function flipCard(index, value, matchColor = null) {
    if (!board) return;
    const card = board.children[index];
    if (!card) return;
    card.classList.add('flipped');
    const back = card.querySelector('.card-back');
    const emojiArray = window.icons[currentRoomCategory] || [];
    if (back) back.textContent = emojiArray[value - 1] || '❓';
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
                if (back) back.textContent = ''; 
            }, 300); 
        }
    });
}

function showCombo(multiplier, isBot) {
    const popup = document.getElementById('comboPopup');
    if (!popup) return;

    const multiplierEl = document.getElementById('comboMultiplier');
    if (multiplierEl) multiplierEl.textContent = `×${multiplier}`;

    popup.classList.remove('show', 'bot');
    if (isBot) popup.classList.add('bot');

    // Force reflow для рестарта анимации
    void popup.offsetWidth;
    popup.classList.add('show');
    window.playSnd('combo');

    setTimeout(() => { popup.classList.remove('show'); }, 2600);
}

window.startGameLogic = function(data) {
    amISpectator = false;
    currentRoomCategory = data.room.category;
    initBoard();
    updateGameStatus(data.room, data.turn);
};

// === SPECTATE ===
window.socket.on('spectateStart', (data) => {
    document.getElementById('lobbyScreen').classList.add('hidden');
    document.getElementById('gameScreen').classList.remove('hidden');
    amISpectator = true;
    currentRoomCategory = data.room.category;
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

// === КАРТОЧКА ОТКРЫТА ===
window.socket.on('cardOpened', (data) => {
    window.playSnd('tile');
    flipCard(data.index, data.value);
    const countEl = document.getElementById(`count-${data.index}`);
    if (countEl) countEl.textContent = data.stats;
});

// === СОВПАДЕНИЕ ПАРЫ (ЕДИНСТВЕННЫЙ обработчик) ===
window.socket.on('matchFound', (data) => {
    window.playSnd('tile-closed');

    // Обновляем карточки
    data.indices.forEach(index => {
        const card = board ? board.children[index] : null;
        if (card) {
            const back = card.querySelector('.card-back');
            if (back) {
                back.style.borderColor = data.matchColor;
                back.style.color = data.matchColor;
            }
            card.classList.add('matched');
        }
    });

    // Обновляем счёт
    if (document.getElementById('p1Score')) document.getElementById('p1Score').textContent = data.players[0].score;
    if (data.players[1] && document.getElementById('p2Score')) document.getElementById('p2Score').textContent = data.players[1].score;

    // Combo — увеличиваем для текущего игрока
    if (currentTurnPlayerId && comboCounters[currentTurnPlayerId] !== undefined) {
        comboCounters[currentTurnPlayerId]++;
        const combo = comboCounters[currentTurnPlayerId];
        if (combo >= 2) {
            const multiplier = Math.min(1 + (combo - 1) * 0.5, 3);
            const isBot = currentTurnPlayerId === 'bot_cpu';
            showCombo(multiplier, isBot);
        }
    }
});

// === ПРОМАХ (ЕДИНСТВЕННЫЙ обработчик) ===
window.socket.on('matchFailed', (data) => {
    unflipCards(data.indices);
    // Сбрасываем combo текущего игрока при промахе
    if (currentTurnPlayerId && comboCounters[currentTurnPlayerId] !== undefined) {
        comboCounters[currentTurnPlayerId] = 0;
    }
});

// === СМЕНА ХОДА — использует переданный ID напрямую ===
window.socket.on('turnChanged', (activePlayerId) => {
    currentTurnPlayerId = activePlayerId;

    const p1Display = document.getElementById('p1Display');
    const p2Display = document.getElementById('p2Display');
    const p1Name = document.getElementById('p1Name');
    const p2Name = document.getElementById('p2Name');
    const activeNameEl = document.getElementById('activePlayerName');

    if (!p1Display || !p2Display || !p1Name || !p2Name || !activeNameEl) return;

    // Определяем кто p1, кто p2 по data-атрибуту или по сравнению
    const p1Id = p1Display.dataset.playerId;
    const p2Id = p2Display.dataset.playerId;
    
    if (activePlayerId === p1Id) {
        p1Display.classList.add('active');
        p2Display.classList.remove('active');
        activeNameEl.textContent = p1Name.textContent;
    } else {
        p2Display.classList.add('active');
        p1Display.classList.remove('active');
        activeNameEl.textContent = p2Name.textContent;
    }
});

// === КОНЕЦ ИГРЫ ===
window.socket.on('gameOver', (data) => {
    const p1 = data.players[0], p2 = data.players[1];
    let resultText = '';
    let isWin = false, isLose = false, isDraw = false;
    
    const amIP1 = p1.name === window.currentUsername;
    const amIP2 = p2 && p2.name === window.currentUsername;

    if (p1.score > p2.score) {
        resultText = `${window.t('win')} ${escapeHtml(p1.name)}! `;
        if (amIP1) isWin = true; else isLose = true;
    } else if (p2.score > p1.score) {
        resultText = `${window.t('win')} ${escapeHtml(p2.name)}! `;
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
    if (resultEl) resultEl.textContent = resultText;
    
    const scoresEl = document.getElementById('gameOverScores');
    if (scoresEl) {
        scoresEl.innerHTML = `${escapeHtml(p1.avatar || '😶')} ${escapeHtml(p1.name)}: <span class=\"text-accent\">${p1.score}</span> <br>${escapeHtml(p2.avatar || '😶')} ${escapeHtml(p2.name)}: <span class=\"text-accent\">${p2.score}</span>`;
    }
    
    const modal = document.getElementById('gameOverModal');
    if (modal) modal.classList.remove('hidden');
});

if (document.getElementById('backToLobbyBtn')) {
    document.getElementById('backToLobbyBtn').onclick = () => location.reload();
}

// === КОМНАТА ЗАКРЫТА ===
window.socket.on('roomClosed', (reasonCode) => {
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

// === Утилита для экранирования HTML ===
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
