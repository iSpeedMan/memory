// ==================== LOCAL 2-PLAYER GAME ====================
window.isLocalGame = false;
window.localCardClickHandler = null;

const LOCAL_MATCH_COLORS = ['#7c5cbf','#4CAF50','#2196F3','#FF9800','#f44336','#00BCD4','#E91E63','#9C27B0','#CDDC39','#795548'];
let localState = null;
let lastLocalConfig = null;

window.startLocalGame = function(config) {
    const gridSize = parseInt(config.gridSize, 10) || 6;
    const totalCards = gridSize * gridSize;
    const totalPairs = totalCards / 2;

    let cat = config.category || 'random';
    if (cat === 'random') {
        const keys = Object.keys(window.icons || {}).filter(k => k !== 'unicode');
        cat = keys.length > 0 ? keys[Math.floor(Math.random() * keys.length)] : 'animals';
    }

    const p1raw = (config.p1name || '').trim();
    const p2raw = (config.p2name || '').trim();
    const p1name = p1raw || (window.t ? window.t('local_p1_ph') : 'Player 1');
    let p2name = p2raw || (window.t ? window.t('local_p2_ph') : 'Player 2');
    if (p1name === p2name) p2name += ' 2';

    lastLocalConfig = { gridSize, category: cat, p1name, p2name };

    const values = [];
    for (let i = 1; i <= totalPairs; i++) values.push(i, i);
    for (let i = values.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [values[i], values[j]] = [values[j], values[i]];
    }

    localState = {
        cards: values,
        flipped: [],
        matched: [],
        scores: [0, 0],
        combos: [0, 0],
        currentPlayer: 0,
        players: [
            { id: 'local_p1', name: p1name, avatar: '🎮', score: 0 },
            { id: 'local_p2', name: p2name, avatar: '🕹️', score: 0 }
        ],
        gridSize,
        category: cat,
        totalPairs,
        isActive: true,
        lockInput: false,
        matchColorIdx: 0,
    };

    window.isLocalGame = true;
    window.localCardClickHandler = localHandleCardClick;

    if (typeof window.closeStartGameModal === 'function') window.closeStartGameModal();

    const lobbyScreen = document.getElementById('lobbyScreen');
    const gameScreen = document.getElementById('gameScreen');
    if (lobbyScreen) lobbyScreen.classList.add('hidden');
    if (gameScreen) gameScreen.classList.remove('hidden');

    const chatToggle = document.getElementById('gameChatToggle');
    if (chatToggle) chatToggle.style.display = 'none';

    const oldBtn = document.getElementById('localNewGameBtn');
    if (oldBtn) oldBtn.style.display = 'none';

    if (typeof window.startGameLogic === 'function') {
        window.startGameLogic({
            room: {
                category: cat,
                gridSize,
                totalPairs,
                categoryEmojis: (window.icons && window.icons[cat]) ? window.icons[cat] : null,
                players: localState.players,
            },
            turn: 'local_p1'
        });
    }

    localShowBadge();
    localUpdateUI();
};

function localShowBadge() {
    let badge = document.getElementById('localGameBadge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'localGameBadge';
        badge.className = 'local-game-badge';
        const gameScreen = document.getElementById('gameScreen');
        if (gameScreen) gameScreen.prepend(badge);
    }
    badge.textContent = (window.t && window.t('local_game_badge')) || '⚡ Local Game';
}

function localUpdateUI() {
    if (!localState) return;
    const cp = localState.currentPlayer;
    const p1El = document.getElementById('p1Display');
    const p2El = document.getElementById('p2Display');
    const activeEl = document.getElementById('activePlayerName');
    const p1s = document.getElementById('p1Score');
    const p2s = document.getElementById('p2Score');
    if (p1El) p1El.classList.toggle('active', cp === 0);
    if (p2El) p2El.classList.toggle('active', cp === 1);
    if (activeEl) activeEl.textContent = localState.players[cp].name;
    if (p1s) p1s.textContent = localState.scores[0];
    if (p2s) p2s.textContent = localState.scores[1];
}

function localHandleCardClick(index) {
    if (!localState || !localState.isActive || localState.lockInput) return;
    if (localState.matched.includes(index)) return;
    if (localState.flipped.includes(index)) return;
    if (localState.flipped.length >= 2) return;

    const cp = localState.currentPlayer;
    localState.flipped.push(index);

    if (typeof window.flipCard === 'function') window.flipCard(index, localState.cards[index]);
    if (typeof window.playSnd === 'function') window.playSnd('tile');

    if (localState.flipped.length === 2) {
        localState.lockInput = true;
        const [a, b] = localState.flipped;

        if (localState.cards[a] === localState.cards[b]) {
            localState.combos[cp]++;
            const combo = localState.combos[cp];
            const points = 100 + Math.max(0, combo - 1) * 50;
            localState.scores[cp] += points;
            localState.players[cp].score = localState.scores[cp];

            const color = LOCAL_MATCH_COLORS[localState.matchColorIdx++ % LOCAL_MATCH_COLORS.length];

            setTimeout(() => {
                localState.matched.push(a, b);
                const board = document.getElementById('board');
                if (board) {
                    [a, b].forEach(idx => {
                        const card = board.children[idx];
                        if (card) {
                            const back = card.querySelector('.card-back');
                            if (back) { back.style.borderColor = color; back.style.color = color; }
                            card.classList.add('matched');
                        }
                    });
                }
                if (typeof window.playSnd === 'function') window.playSnd('tile-closed');
                if (combo >= 2 && typeof window.showCombo === 'function') {
                    window.showCombo(Math.min(1 + (combo - 1) * 0.5, 3), false);
                }
                if (typeof window.showScoreFloat === 'function') {
                    window.showScoreFloat(localState.players[cp].id, points, combo >= 2);
                }
                localState.flipped = [];
                localState.lockInput = false;
                localUpdateUI();

                if (localState.matched.length === localState.cards.length) {
                    setTimeout(localShowGameOver, 600);
                }
            }, 400);
        } else {
            localState.combos[cp] = 0;
            setTimeout(() => {
                if (typeof window.unflipCards === 'function') window.unflipCards([a, b]);
                localState.flipped = [];
                localState.currentPlayer = 1 - cp;
                localState.lockInput = false;
                localUpdateUI();
            }, 1000);
        }
    }
}

function localShowGameOver() {
    if (!localState) return;
    localState.isActive = false;
    window.localCardClickHandler = null;

    const s1 = localState.scores[0];
    const s2 = localState.scores[1];
    const winnerIdx = s1 > s2 ? 0 : s2 > s1 ? 1 : -1;

    if (typeof window.playSnd === 'function') window.playSnd(winnerIdx >= 0 ? 'win' : 'match');

    if (winnerIdx >= 0) {
        const container = document.getElementById('confettiContainer');
        if (container && typeof window.createConfetti === 'function') {
            container.innerHTML = '';
            window.createConfetti(container, 70);
            setTimeout(() => { container.innerHTML = ''; }, 5500);
        }
    }

    const modal = document.getElementById('gameOverModal');
    const content = modal && modal.querySelector('.game-over-content');
    if (content) {
        content.classList.remove('win', 'lose', 'draw');
        content.classList.add(winnerIdx >= 0 ? 'win' : 'draw');
    }

    const p1 = localState.players[0], p2 = localState.players[1];
    const winName = winnerIdx >= 0 ? localState.players[winnerIdx].name : null;
    const el = (id) => document.getElementById(id);

    if (el('gameOverIcon')) el('gameOverIcon').textContent = winnerIdx >= 0 ? '🏆' : '🤝';
    if (el('gameOverTitle')) el('gameOverTitle').textContent = (window.t && window.t(winnerIdx >= 0 ? 'game_over_win_title' : 'game_over_draw_title')) || '';
    if (el('gameOverSubtitle')) el('gameOverSubtitle').textContent = winName || (window.t && window.t('game_over_draw_sub')) || '';
    if (el('gameOverResult')) el('gameOverResult').textContent = winName ? `${(window.t && window.t('win')) || 'win'} ${winName}` : (window.t && window.t('draw')) || '';
    if (el('gameOverScores')) {
        el('gameOverScores').innerHTML =
            `<div class="score-row">${window.escHtml(p1.avatar)} <b>${window.escHtml(p1.name)}</b> — <span class="score-num">${s1}</span></div>
             <div class="score-row">${window.escHtml(p2.avatar)} <b>${window.escHtml(p2.name)}</b> — <span class="score-num">${s2}</span></div>`;
    }

    const backBtn = el('backToLobbyBtn');
    if (backBtn) {
        let newBtn = el('localNewGameBtn');
        if (!newBtn) {
            newBtn = document.createElement('button');
            newBtn.id = 'localNewGameBtn';
            newBtn.className = 'metro-btn accent-green w-100 mt-s';
            backBtn.parentNode.insertBefore(newBtn, backBtn);
        }
        newBtn.textContent = (window.t && window.t('btn_new_local_game')) || '🔄 Play Again';
        newBtn.style.display = '';
        newBtn.onclick = () => {
            if (modal) modal.classList.add('hidden');
            window.startLocalGame(lastLocalConfig);
        };
    }

    if (modal) modal.classList.remove('hidden');

    if (window.socket && typeof window.socket.emit === 'function') {
        window.socket.emit('localGameCompleted');
    }
}

const startLocalBtn = document.getElementById('startLocalGameBtn');
if (startLocalBtn) {
    startLocalBtn.onclick = () => {
        const p1name = (document.getElementById('localP1Name') || {}).value || '';
        const p2name = (document.getElementById('localP2Name') || {}).value || '';
        const category = (document.getElementById('localCategory') || {}).value || 'random';
        const gridSize = (document.getElementById('localGridSize') || {}).value || '6';
        window.startLocalGame({ p1name, p2name, category, gridSize });
    };
}
