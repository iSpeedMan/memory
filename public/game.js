const board = document.getElementById('board');
let currentRoomCategory = '';
let amISpectator = false;

function initBoard() {
    if (!board) return;
    board.innerHTML = '';
    for (let i = 0; i < 36; i++) {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.index = i;
        card.innerHTML = `<div class="card-inner"><div class="card-front"></div><div class="card-back"></div><div class="metro-card-count" id="count-${i}">0</div></div>`;
        card.onclick = () => { 
            if (!amISpectator && !card.classList.contains('flipped')) {
                // Звук перенесен ниже в socket.on('cardOpened')
                window.socket.emit('cardClick', i); 
            }
        };
        board.appendChild(card);
    }
}

function updateGameStatus(room, activeTurnId) {
    const p1 = room.players[0];
    const p2 = room.players[1];

    if (document.getElementById('p1Avatar')) document.getElementById('p1Avatar').textContent = p1.avatar || '😶';
    if (document.getElementById('p1Name')) document.getElementById('p1Name').textContent = p1.name;
    if (document.getElementById('p1Score')) document.getElementById('p1Score').textContent = p1.score || 0;
    
    if (p2) {
        if (document.getElementById('p2Avatar')) document.getElementById('p2Avatar').textContent = p2.avatar || '😶';
        if (document.getElementById('p2Name')) document.getElementById('p2Name').textContent = p2.name;
        if (document.getElementById('p2Score')) document.getElementById('p2Score').textContent = p2.score || 0;
    }

    if (document.getElementById('p1Display')) document.getElementById('p1Display').classList.toggle('active', activeTurnId === p1.id);
    if (document.getElementById('p2Display')) document.getElementById('p2Display').classList.toggle('active', p2 && activeTurnId === p2.id);

    const activePlayer = room.players.find(p => p.id === activeTurnId);
    if (activePlayer && document.getElementById('activePlayerName')) document.getElementById('activePlayerName').textContent = activePlayer.name;
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
            setTimeout(() => { if (card.querySelector('.card-back')) card.querySelector('.card-back').textContent = ''; }, 300); 
        }
    });
}

window.startGameLogic = function(data) {
    amISpectator = false;
    currentRoomCategory = data.room.category;
    initBoard();
    updateGameStatus(data.room, data.turn);
};

window.socket.on('spectateStart', (data) => {
    document.getElementById('lobbyScreen').classList.add('hidden');
    document.getElementById('gameScreen').classList.remove('hidden');
    amISpectator = true;
    currentRoomCategory = data.room.category;
    initBoard();
    updateGameStatus(data.room, data.turn);
    if (data.cardStats) data.cardStats.forEach((stat, idx) => { if (document.getElementById(`count-${idx}`)) document.getElementById(`count-${idx}`).textContent = stat; });
    for (const [index, cardData] of Object.entries(data.matchedCards)) flipCard(index, cardData.value, cardData.color);
    data.openedCards.forEach(card => flipCard(card.index, card.value));
});

// КАРТОЧКА ОТКРЫТА (Вызывается и для твоих ходов, и для ботов)
window.socket.on('cardOpened', (data) => {
    window.playSnd('tile'); // ЗВУК ОТКРЫТИЯ ПЛИТКИ
    flipCard(data.index, data.value);
    if (document.getElementById(`count-${data.index}`)) document.getElementById(`count-${data.index}`).textContent = data.stats;
});

// СОВПАДЕНИЕ ПАРЫ
window.socket.on('matchFound', (data) => {
    window.playSnd('tile-closed'); // ЗВУК СОВПАДЕНИЯ

    data.indices.forEach(index => {
        if (!board) return;
        const card = board.children[index];
        if (card) {
            const back = card.querySelector('.card-back');
            if (back) { back.style.borderColor = data.matchColor; back.style.color = data.matchColor; }
            card.classList.add('matched');
        }
    });
    if (document.getElementById('p1Score')) document.getElementById('p1Score').textContent = data.players[0].score;
    if (data.players[1] && document.getElementById('p2Score')) document.getElementById('p2Score').textContent = data.players[1].score;
});

window.socket.on('matchFailed', (data) => unflipCards(data.indices));

window.socket.on('turnChanged', (activePlayerId) => {
    const actNmEl = document.getElementById('activePlayerName');
    if (!document.getElementById('p1Name') || !actNmEl) return;
    const p1Name = document.getElementById('p1Name').textContent;
    if (actNmEl.textContent === p1Name) {
        actNmEl.textContent = document.getElementById('p2Name').textContent;
        document.getElementById('p1Display').classList.remove('active');
        document.getElementById('p2Display').classList.add('active');
    } else {
        actNmEl.textContent = p1Name;
        document.getElementById('p1Display').classList.add('active');
        document.getElementById('p2Display').classList.remove('active');
    }
});

window.socket.on('gameOver', (data) => {
    const p1 = data.players[0], p2 = data.players[1];
    let resultText = '';
    
    let isWin = false;
    let isLose = false;
    let isDraw = false;
    
    const amIP1 = p1.name === window.currentUsername;
    const amIP2 = p2 && p2.name === window.currentUsername;

    if (p1.score > p2.score) {
        resultText = `${window.t('win')} ${p1.name}! 🎉`;
        if (amIP1) isWin = true; else isLose = true;
    } else if (p2.score > p1.score) {
        resultText = `${window.t('win')} ${p2.name}! 🎉`;
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

    if (document.getElementById('gameOverResult')) document.getElementById('gameOverResult').textContent = resultText;
    if (document.getElementById('gameOverScores')) {
        document.getElementById('gameOverScores').innerHTML = `${p1.avatar || '😶'} ${p1.name}: <span class="text-accent">${p1.score}</span> <br>${p2.avatar || '😶'} ${p2.name}: <span class="text-accent">${p2.score}</span>`;
    }
    if (document.getElementById('gameOverModal')) document.getElementById('gameOverModal').classList.remove('hidden');
});

if (document.getElementById('backToLobbyBtn')) document.getElementById('backToLobbyBtn').onclick = () => location.reload();

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

let currentCombo = 0;           // текущее комбо (сбрасывается при промахе)

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

    // Определяем, мой ли это ход
    const isMyTurn = document.getElementById('p1Display') && 
                     document.getElementById('p1Display').classList.contains('active');

    if (isMyTurn) {
        currentCombo++;                    // увеличиваем комбо
        if (currentCombo >= 2) {
            const multiplier = Math.min(1 + (currentCombo - 1) * 0.5, 3);
            showCombo(multiplier, false);  // false = игрок
        }
    } else {
        // Ход бота
        currentCombo++;                    // бот тоже набирает комбо
        if (currentCombo >= 2) {
            const multiplier = Math.min(1 + (currentCombo - 1) * 0.5, 3);
            showCombo(multiplier, true);   // true = бот
        }
    }
});

window.socket.on('matchFailed', () => {
    currentCombo = 0;   // Сбрасываем комбо при любом промахе
});

function showCombo(multiplier, isBot) {
    const popup = document.getElementById('comboPopup');
    if (!popup) return;

    const multiplierEl = document.getElementById('comboMultiplier');
    if (multiplierEl) multiplierEl.textContent = `×${multiplier}`;

    popup.classList.remove('show', 'bot');

    if (isBot) {
        popup.classList.add('bot');
    }

    popup.classList.add('show');
    window.playSnd('combo');

    setTimeout(() => {
        popup.classList.remove('show');
    }, 2600);
}

