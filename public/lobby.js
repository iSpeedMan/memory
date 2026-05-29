const roomsContainer = document.getElementById('roomsContainer');
const leaderBox = document.getElementById('leaderboardBox');
const leaderCat = document.getElementById('leaderCat');
window.icons = {};

function appendOption(select, value, text) {
    if (!select) return;
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    select.appendChild(option);
}

window.loadCategories = async function() {
    try {
        const res = await fetch('/api/categories');
        const categories = await res.json();

        const roomCatSelect = document.getElementById('roomCategory');
        const botCatSelect = document.getElementById('botCategory');
        if (roomCatSelect) { roomCatSelect.innerHTML = ''; appendOption(roomCatSelect, 'random', window.t('random_cat')); }
        if (botCatSelect) { botCatSelect.innerHTML = ''; appendOption(botCatSelect, 'random', window.t('random_cat')); }
        if (leaderCat) { leaderCat.innerHTML = ''; appendOption(leaderCat, 'all', window.t('all_cats')); }

        categories.forEach(cat => {
            const emojisArray = cat.emojis.split(',');
            window.icons[cat.key_name] = emojisArray;
            const randomEmoji = emojisArray[Math.floor(Math.random() * emojisArray.length)];
            const translatedName = window.currentLang === 'en'
                ? cat.key_name.charAt(0).toUpperCase() + cat.key_name.slice(1)
                : cat.display_name;
            const displayTitle = `${randomEmoji} ${translatedName}`;
            appendOption(roomCatSelect, cat.key_name, displayTitle);
            appendOption(botCatSelect, cat.key_name, displayTitle);
            appendOption(leaderCat, cat.key_name, displayTitle);
        });

        if (typeof window.loadAdminCategories === 'function') window.loadAdminCategories(categories);
    } catch (e) { console.error('loadCategories error:', e); }
};

let currentRooms = [];
const roomSearchInput = document.getElementById('roomSearch');

const VIRTUAL_SCROLL_THRESHOLD = 20;
const VISIBLE_ROOMS_COUNT = 12;
let virtualScrollOffset = 0;
let filteredRoomsCache = [];

function createRoomTileHTML(room) {
    const catSelect = document.getElementById('roomCategory');
    const isMyRoom = room.players.some(p => p.name === window.currentUsername) || room.creatorName === window.currentUsername;
    const isPlaying = room.status === 'playing';
    const statusText = isPlaying ? window.t('playing') : window.t('waiting');
    const privateIcon = room.isPrivate ? '🔒 ' : '';

    let actionBtnHtml = '';
    if (isPlaying) {
        if (!room.isPrivate) {
            actionBtnHtml = `<button class="metro-btn secondary action-btn" data-action="spectate" data-room="${window.escHtml(room.id)}">${window.t('spectate_btn')}</button>`;
        }
    } else if (!isMyRoom) {
        actionBtnHtml = `<button class="metro-btn primary action-btn" data-action="join" data-room="${window.escHtml(room.id)}">${window.t('join_btn')}</button>`;
    }

    let displayCategory = room.category;
    if (catSelect) {
        const option = Array.from(catSelect.options).find(opt => opt.value === room.category);
        if (option) displayCategory = option.textContent;
    }

    return `
        <div class="metro-tile ${isPlaying ? 'playing' : ''}" data-room-id="${window.escHtml(room.id)}">
            <div class="metro-tile-header">
                <span class="metro-tile-title">${privateIcon}${window.escHtml(room.name)}</span>
                <span class="metro-tile-cat">${window.escHtml(statusText)}</span>
                ${actionBtnHtml}
            </div>
            <div class="metro-tile-author">
                <span>${window.escHtml(room.creatorAvatar || '😶')}</span>
                <span>${window.escHtml(room.creatorName)}</span>
                <span class="metro-tile-room-cat">${window.escHtml(displayCategory)}</span>
            </div>
        </div>`;
}

function renderRooms() {
    if (!roomsContainer) return;
    const query = roomSearchInput ? roomSearchInput.value.toLowerCase().trim() : '';
    filteredRoomsCache = currentRooms.filter(room =>
        room.name.toLowerCase().includes(query) ||
        room.creatorName.toLowerCase().includes(query) ||
        room.category.toLowerCase().includes(query)
    );

    if (filteredRoomsCache.length > VIRTUAL_SCROLL_THRESHOLD) {
        renderVirtualRooms();
    } else {
        virtualScrollOffset = 0;
        roomsContainer.innerHTML = filteredRoomsCache.map(room => createRoomTileHTML(room)).join('')
            || `<div class="metro-list-item text-dim">${window.t('empty_rooms')}</div>`;
    }
}

function renderVirtualRooms() {
    const start = virtualScrollOffset;
    const end = Math.min(start + VISIBLE_ROOMS_COUNT, filteredRoomsCache.length);
    const visibleRooms = filteredRoomsCache.slice(start, end);
    let html = '';
    if (filteredRoomsCache.length > VISIBLE_ROOMS_COUNT) {
        html += `<div class="virtual-scroll-info metro-list-item text-dim">
            ${window.t('showing')} ${start + 1}-${end} ${window.t('of')} ${filteredRoomsCache.length}
        </div>`;
    }
    html += visibleRooms.map(room => createRoomTileHTML(room)).join('');
    if (filteredRoomsCache.length > VISIBLE_ROOMS_COUNT) {
        html += `<div class="virtual-scroll-nav">
            <button class="metro-btn secondary" id="prevRoomsBtn" ${start === 0 ? 'disabled' : ''}>◀ ${window.t('prev')}</button>
            <button class="metro-btn secondary" id="nextRoomsBtn" ${end >= filteredRoomsCache.length ? 'disabled' : ''}>${window.t('next')} ▶</button>
        </div>`;
    }
    roomsContainer.innerHTML = html || `<div class="metro-list-item text-dim">${window.t('empty_rooms')}</div>`;
    const prevBtn = document.getElementById('prevRoomsBtn');
    const nextBtn = document.getElementById('nextRoomsBtn');
    if (prevBtn) prevBtn.onclick = () => { virtualScrollOffset = Math.max(0, virtualScrollOffset - VISIBLE_ROOMS_COUNT); renderVirtualRooms(); };
    if (nextBtn) nextBtn.onclick = () => { virtualScrollOffset = Math.min(filteredRoomsCache.length - VISIBLE_ROOMS_COUNT, virtualScrollOffset + VISIBLE_ROOMS_COUNT); renderVirtualRooms(); };
}

let searchTimeout = null;
if (roomSearchInput) roomSearchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(renderRooms, 200);
});

window.socket.on('roomsList', (rooms) => { currentRooms = rooms; renderRooms(); });

if (document.getElementById('createRoomBtn')) document.getElementById('createRoomBtn').onclick = () => {
    let selectedCategory = document.getElementById('roomCategory') ? document.getElementById('roomCategory').value : 'random';
    if (selectedCategory === 'random') {
        const availableKeys = Object.keys(window.icons);
        selectedCategory = availableKeys.length > 0 ? availableKeys[Math.floor(Math.random() * availableKeys.length)] : 'animals';
    }
    const isPrivate = document.getElementById('roomPrivate') ? document.getElementById('roomPrivate').checked : false;
    window.socket.emit('createRoom', {
        name: document.getElementById('roomName') ? document.getElementById('roomName').value : '',
        category: selectedCategory, isPrivate
    });
};

window.socket.on('roomCreated', (room) => {
    document.getElementById('lobbyScreen').classList.add('hidden');
    document.getElementById('roomScreen').classList.remove('hidden');
    const roomTitleDisp = document.getElementById('roomTitleDisp');
    if (roomTitleDisp) roomTitleDisp.textContent = room.name;
    const roomCategoryDisp = document.getElementById('roomCategoryDisp');
    if (roomCategoryDisp) {
        const catSelect = document.getElementById('roomCategory');
        let catName = room.category;
        if (catSelect) {
            const option = Array.from(catSelect.options).find(opt => opt.value === room.category);
            if (option) catName = option.textContent;
        }
        roomCategoryDisp.textContent = catName;
    }
});

if (document.getElementById('leaveRoomBtn')) document.getElementById('leaveRoomBtn').onclick = () => location.reload();

// ==================== ПРОФИЛЬ ====================

// Переключение табов профиля
function switchProfileTab(activeTabId) {
    const tabs = ['profSectionSettings', 'profSectionHistory', 'profSectionStats'];
    const btns = ['profTabSettings', 'profTabHistory', 'profTabStats'];
    tabs.forEach((id, i) => {
        const sec = document.getElementById(id);
        const btn = document.getElementById(btns[i]);
        if (!sec || !btn) return;
        if (id === activeTabId) {
            sec.classList.remove('hidden');
            btn.classList.replace('secondary', 'accent-purple');
        } else {
            sec.classList.add('hidden');
            btn.classList.replace('accent-purple', 'secondary');
        }
    });
}

['profTabSettings', 'profTabHistory', 'profTabStats'].forEach((btnId, i) => {
    const btn = document.getElementById(btnId);
    const sections = ['profSectionSettings', 'profSectionHistory', 'profSectionStats'];
    if (btn) btn.onclick = () => {
        switchProfileTab(sections[i]);
        if (sections[i] === 'profSectionHistory') loadProfileHistory();
        if (sections[i] === 'profSectionStats') loadProfileStats();
    };
});

// Загрузка истории игр
async function loadProfileHistory() {
    const container = document.getElementById('profHistoryContent');
    if (!container) return;
    container.innerHTML = `<div class="metro-list-item text-dim">${window.t('wait_msg')}</div>`;
    try {
        const res = await fetch('/api/profile/history');
        const rows = await res.json();
        if (!rows.length) {
            container.innerHTML = `<div class="metro-list-item text-dim">${window.t('hist_empty')}</div>`;
            return;
        }
        container.innerHTML = `
            <div class="metro-list-item" style="font-weight:bold;border-bottom:1px solid #333;gap:8px;">
                <span style="flex:2">${window.t('hist_opponent')}</span>
                <span style="flex:1;text-align:center">${window.t('hist_score')}</span>
                <span style="flex:1;text-align:center">${window.t('hist_result')}</span>
                <span style="flex:1;text-align:right;font-size:0.8em">${window.t('hist_date')}</span>
            </div>
        ` + rows.map(row => {
            const myScore = row.my_score;
            const oppScore = row.opp_score;
            let result, resultClass;
            if (myScore > oppScore) { result = window.t('hist_win'); resultClass = 'text-accent'; }
            else if (myScore < oppScore) { result = window.t('hist_loss'); resultClass = 'metro-error'; }
            else { result = window.t('hist_draw'); resultClass = 'text-dim'; }

            const oppName = row.is_bot_game
                ? `${window.t('hist_bot')} (${window.t('stat_' + (row.bot_difficulty || 'medium'))})`
                : row.opponent_name || '?';
            const date = new Date(row.played_at).toLocaleDateString();

            return `<div class="metro-list-item" style="gap:8px;">
                <span style="flex:2">${window.escHtml(oppName)}</span>
                <span style="flex:1;text-align:center">${myScore}:${oppScore}</span>
                <span style="flex:1;text-align:center;font-size:0.85em" class="${resultClass}">${result}</span>
                <span style="flex:1;text-align:right;font-size:0.78em;color:#777">${date}</span>
            </div>`;
        }).join('');
    } catch (e) {
        container.innerHTML = `<div class="metro-list-item text-dim">${window.t('profile_load_error')}</div>`;
    }
}

// Загрузка статистики
async function loadProfileStats() {
    const container = document.getElementById('profStatsContent');
    if (!container) return;
    container.innerHTML = '';
    try {
        const res = await fetch('/api/profile/stats');
        const data = await res.json();
        const pvp = data.pvp || { total: 0, wins: 0, draws: 0, losses: 0 };
        const winRate = pvp.total > 0 ? Math.round((pvp.wins / pvp.total) * 100) : 0;

        container.innerHTML = `
            <h3 class="metro-subtitle mb-s">${window.t('stat_pvp_title')}</h3>
            <div class="metro-stats-grid" style="grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;">
                <div class="stat-tile"><div class="stat-count">${pvp.total}</div><div class="stat-cat">${window.t('stat_total')}</div></div>
                <div class="stat-tile"><div class="stat-count text-accent">${pvp.wins}</div><div class="stat-cat">${window.t('stat_wins')}</div></div>
                <div class="stat-tile"><div class="stat-count">${pvp.losses}</div><div class="stat-cat">${window.t('stat_losses')}</div></div>
                <div class="stat-tile"><div class="stat-count">${winRate}%</div><div class="stat-cat">${window.t('stat_winrate')}</div></div>
            </div>
            ${(data.bot && data.bot.length > 0) ? `
                <h3 class="metro-subtitle mb-s">${window.t('stat_bot_title')}</h3>
                <div class="metro-list">
                    ${data.bot.map(b => {
                        const botWr = b.total > 0 ? Math.round((b.wins / b.total) * 100) : 0;
                        const diffLabel = window.t('stat_' + (b.bot_difficulty || 'medium'));
                        return `<div class="metro-list-item">
                            <span>${diffLabel}</span>
                            <span>${b.wins}/${b.total} <span class="text-accent">(${botWr}%)</span></span>
                        </div>`;
                    }).join('')}
                </div>
            ` : ''}
        `;
    } catch (e) {
        container.innerHTML = `<div class="text-dim">${window.t('profile_load_error')}</div>`;
    }
}

const profileTrigger = document.getElementById('profileTrigger');
if (profileTrigger) {
    profileTrigger.addEventListener('click', async () => {
        const modal = document.getElementById('profileModal');
        if (modal) modal.classList.remove('hidden');
        switchProfileTab('profSectionSettings');

        try {
            const profileUsernameEl = document.getElementById('profileUsername');
            if (profileUsernameEl) profileUsernameEl.textContent = window.currentUsername;

            const res = await fetch('/api/profile');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();

            if (document.getElementById('profEmail')) document.getElementById('profEmail').value = data.email || '';
            if (document.getElementById('profAvatar')) document.getElementById('profAvatar').value = data.avatar || '😶';
            if (document.getElementById('profNewPassword')) document.getElementById('profNewPassword').value = '';
            if (document.getElementById('profTheme')) document.getElementById('profTheme').value = data.theme || 'dark';
            if (document.getElementById('profLang')) document.getElementById('profLang').value = data.language || 'auto';

            const statsContainer = document.getElementById('profStats');
            if (statsContainer) {
                if (data.topCards && data.topCards.length > 0) {
                    statsContainer.innerHTML = data.topCards.map(stat => {
                        const emoji = window.icons[stat.category] ? window.icons[stat.category][stat.card_value - 1] : '❓';
                        return `<div class="stat-tile"><div class="stat-emoji">${window.escHtml(emoji)}</div><div class="stat-cat">${window.escHtml(stat.category)}</div><div class="stat-count">${window.escHtml(String(stat.max_matches))}</div></div>`;
                    }).join('');
                } else {
                    statsContainer.innerHTML = `<span class="text-dim">${window.t('empty_leader')}</span>`;
                }
            }
        } catch (e) {
            console.error('Profile error:', e);
        }
    });
}

if (document.getElementById('saveProfileBtn')) document.getElementById('saveProfileBtn').onclick = async () => {
    const themeVal = document.getElementById('profTheme') ? document.getElementById('profTheme').value : 'dark';
    const langVal = document.getElementById('profLang') ? document.getElementById('profLang').value : 'auto';
    const avatarVal = document.getElementById('profAvatar') ? document.getElementById('profAvatar').value : '😶';
    const newPassword = document.getElementById('profNewPassword') ? document.getElementById('profNewPassword').value : '';
    const res = await fetch('/api/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: document.getElementById('profEmail') ? document.getElementById('profEmail').value : '',
            newPassword, avatar: avatarVal, theme: themeVal, language: langVal
        })
    });
    const data = await res.json();
    if (data.success) {
        document.getElementById('profileModal').classList.add('hidden');
        window.currentUserAvatar = avatarVal;
        if (document.getElementById('currentUserAvatar')) document.getElementById('currentUserAvatar').textContent = window.currentUserAvatar;
        localStorage.setItem('appTheme', themeVal);
        localStorage.setItem('appLang', langVal);
        window.applySettings(themeVal, langVal);
    } else {
        alert(data.error || window.t('saving_error'));
    }
};

if (document.getElementById('closeProfileBtn')) document.getElementById('closeProfileBtn').onclick = () => document.getElementById('profileModal').classList.add('hidden');

window.socket.on('gameStart', (data) => {
    document.getElementById('lobbyScreen').classList.add('hidden');
    document.getElementById('roomScreen').classList.add('hidden');
    document.getElementById('gameScreen').classList.remove('hidden');
    if (typeof window.startGameLogic === 'function') window.startGameLogic(data);
});

// ==================== LEADERBOARD ====================
const rankEmojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
let currentLeaderboardCategory = 'all';

function renderLeaderboard(data) {
    if (!leaderBox) return;
    let myRankEmoji = null;
    leaderBox.innerHTML = data.map((u, i) => {
        const emoji = rankEmojis[i] || `${i + 1}.`;
        if (u.username === window.currentUsername) myRankEmoji = emoji;
        return `<div class="metro-list-item"><span>${emoji} ${window.escHtml(u.username)}</span> <b>${u.totalScore}</b></div>`;
    }).join('') || `<div class="metro-list-item text-dim">${window.t('empty_leader')}</div>`;

    const rankBadge = document.getElementById('currentUserRankBadge');
    if (rankBadge) {
        if (myRankEmoji) { rankBadge.textContent = myRankEmoji; rankBadge.classList.remove('hidden'); }
        else rankBadge.classList.add('hidden');
    }
}

window.socket.on('leaderboardUpdate', (payload) => {
    if (payload.category === currentLeaderboardCategory || payload.category === 'all') {
        renderLeaderboard(payload.data);
    }
});

function subscribeLeaderboard(category) {
    if (currentLeaderboardCategory !== category) {
        window.socket.emit('unsubscribeLeaderboard', currentLeaderboardCategory);
    }
    currentLeaderboardCategory = category;
    window.socket.emit('subscribeLeaderboard', category);
}

if (leaderCat) leaderCat.onchange = () => subscribeLeaderboard(leaderCat.value);
window.socket.on('connect', () => { subscribeLeaderboard(currentLeaderboardCategory); });
window.onSocketReconnect = function() { subscribeLeaderboard(currentLeaderboardCategory); };

// ==================== ДЕЙСТВИЯ С КОМНАТАМИ ====================
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.action-btn');
    if (btn) {
        if (btn.dataset.action === 'join') window.socket.emit('joinRoom', btn.dataset.room);
        else if (btn.dataset.action === 'spectate') window.socket.emit('spectateRoom', btn.dataset.room);
    }
});

const lbToggleBtn = document.getElementById('leaderboardToggleBtn');
const lbCloseBtn = document.getElementById('closeLeaderboardBtn');
const lbWrapper = document.getElementById('leaderboardWrapper');
if (lbToggleBtn && lbWrapper) lbToggleBtn.onclick = () => lbWrapper.classList.add('show-modal');
if (lbCloseBtn && lbWrapper) lbCloseBtn.onclick = () => lbWrapper.classList.remove('show-modal');

// ==================== БОТ МОДАЛ ====================
const openBotModalBtn = document.getElementById('openBotModalBtn');
const botModal = document.getElementById('botModal');
const closeBotModalBtn = document.getElementById('closeBotModalBtn');

if (openBotModalBtn && botModal) openBotModalBtn.onclick = () => botModal.classList.remove('hidden');
if (closeBotModalBtn && botModal) closeBotModalBtn.onclick = () => { botModal.classList.add('hidden'); hideBotError(); };

function showBotError(msg) {
    let errEl = document.getElementById('botModalError');
    if (!errEl) {
        errEl = document.createElement('div');
        errEl.id = 'botModalError';
        errEl.className = 'metro-error';
        errEl.style.marginTop = '12px';
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
        let selectedCategory = document.getElementById('botCategory').value;
        const difficulty = document.getElementById('botDifficulty').value;
        if (selectedCategory === 'random') {
            const availableKeys = Object.keys(window.icons);
            selectedCategory = availableKeys.length > 0 ? availableKeys[Math.floor(Math.random() * availableKeys.length)] : 'animals';
        }
        hideBotError();
        window.socket.emit('createBotRoom', { category: selectedCategory, difficulty });
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
    if (botModal) botModal.classList.add('hidden');
    hideBotError();
});

// ==================== ESC ====================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        ['profileModal', 'adminModal', 'botModal'].forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.classList.contains('hidden')) el.classList.add('hidden');
        });
        if (lbWrapper && lbWrapper.classList.contains('show-modal')) lbWrapper.classList.remove('show-modal');
    }
});
