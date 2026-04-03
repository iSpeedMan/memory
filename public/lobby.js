const t = window.t;
const roomsContainer = document.getElementById('roomsContainer');
const leaderBox = document.getElementById('leaderboardBox');
const leaderCat = document.getElementById('leaderCat');
window.icons = {}; 

window.loadCategories = async function() {
    try {
        const res = await fetch('/api/categories');
        const categories = await res.json();
        
        const roomCatSelect = document.getElementById('roomCategory');
        const botCatSelect = document.getElementById('botCategory');
        if (roomCatSelect) roomCatSelect.innerHTML = `<option value="random">${window.t('random_cat')}</option>`;
        if (botCatSelect) botCatSelect.innerHTML = `<option value="random">${window.t('random_cat')}</option>`;
        if (leaderCat) leaderCat.innerHTML = `<option value="all">${window.t('all_cats')}</option>`;
        
        categories.forEach(cat => {
            const emojisArray = cat.emojis.split(',');
            window.icons[cat.key_name] = emojisArray;
            const randomEmoji = emojisArray[Math.floor(Math.random() * emojisArray.length)];
            const translatedName = window.currentLang === 'en' ? cat.key_name.charAt(0).toUpperCase() + cat.key_name.slice(1) : cat.display_name;
            const displayTitle = `${randomEmoji} ${translatedName}`;
            
            if (roomCatSelect) roomCatSelect.insertAdjacentHTML('beforeend', `<option value="${cat.key_name}">${displayTitle}</option>`);
            if (botCatSelect) botCatSelect.insertAdjacentHTML('beforeend', `<option value="${cat.key_name}">${displayTitle}</option>`);
            if (leaderCat) leaderCat.insertAdjacentHTML('beforeend', `<option value="${cat.key_name}">${displayTitle}</option>`);
        });

        if (typeof window.loadAdminCategories === 'function') window.loadAdminCategories(categories);
    } catch (e) { console.error("Ошибка:", e); }
};

let currentRooms = []; 
const roomSearchInput = document.getElementById('roomSearch');

// ====================== VIRTUAL SCROLLING ======================
const VIRTUAL_SCROLL_THRESHOLD = 20; // Включается при > 20 комнатах
const VISIBLE_ROOMS_COUNT = 12; // Количество видимых комнат
let virtualScrollOffset = 0;
let filteredRoomsCache = [];

function createRoomTileHTML(room) {
    const catSelect = document.getElementById('roomCategory');
    const isMyRoom = room.players.some(p => p.name === window.currentUsername) || room.creatorName === window.currentUsername;
    const isPlaying = room.status === 'playing';
    const statusClass = isPlaying ? 'playing' : '';
    const statusText = isPlaying ? window.t('playing') : window.t('waiting');
    const privateIcon = room.isPrivate ? '🔒 ' : '';

    let actionBtnHtml = '';
    if (isPlaying) {
        // Скрываем кнопку просмотра для приватных комнат
        if (!room.isPrivate) {
            actionBtnHtml = `<button class=\"metro-btn secondary action-btn\" data-action=\"spectate\" data-room=\"${escHtml(room.id)}\">${window.t('spectate_btn')}</button>`;
        }
    } else if (!isMyRoom) {
        actionBtnHtml = `<button class=\"metro-btn primary action-btn\" data-action=\"join\" data-room=\"${escHtml(room.id)}\">${window.t('join_btn')}</button>`;
    }

    let displayCategory = room.category;
    if (catSelect) {
        const option = Array.from(catSelect.options).find(opt => opt.value === room.category);
        if (option) displayCategory = option.textContent;
    }

    return `
        <div class=\"metro-tile ${statusClass}\" data-room-id=\"${escHtml(room.id)}\">
            <div class=\"metro-tile-header\">
                <span class=\"metro-tile-title\">${privateIcon}${escHtml(room.name)}</span>
                <span class=\"metro-tile-cat\">${escHtml(statusText)}</span>
            ${actionBtnHtml}
            </div>
            <div class=\"metro-tile-author\">
                <span>${escHtml(room.creatorAvatar || '😶')}</span>
                <span>${escHtml(room.creatorName)}</span>
                <span class=\"metro-tile-room-cat\">${escHtml(displayCategory)}</span>
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

    // Virtual scrolling для больших списков
    if (filteredRoomsCache.length > VIRTUAL_SCROLL_THRESHOLD) {
        renderVirtualRooms();
    } else {
        // Обычный рендеринг для маленьких списков
        virtualScrollOffset = 0;
        roomsContainer.innerHTML = filteredRoomsCache.map(room => createRoomTileHTML(room)).join('') 
            || `<div class=\"metro-list-item text-dim\">${window.t('empty_rooms')}</div>`;
    }
}

function renderVirtualRooms() {
    const start = virtualScrollOffset;
    const end = Math.min(start + VISIBLE_ROOMS_COUNT, filteredRoomsCache.length);
    const visibleRooms = filteredRoomsCache.slice(start, end);
    
    let html = '';
    
    // Показываем информацию о пагинации
    if (filteredRoomsCache.length > VISIBLE_ROOMS_COUNT) {
        html += `<div class=\"virtual-scroll-info metro-list-item text-dim\">
            ${window.t('showing') || 'Показано'} ${start + 1}-${end} ${window.t('of') || 'из'} ${filteredRoomsCache.length}
        </div>`;
    }
    
    html += visibleRooms.map(room => createRoomTileHTML(room)).join('');
    
    // Кнопки навигации
    if (filteredRoomsCache.length > VISIBLE_ROOMS_COUNT) {
        html += `<div class=\"virtual-scroll-nav\">
            <button class=\"metro-btn secondary\" id=\"prevRoomsBtn\" ${start === 0 ? 'disabled' : ''}>◀ ${window.t('prev') || 'Назад'}</button>
            <button class=\"metro-btn secondary\" id=\"nextRoomsBtn\" ${end >= filteredRoomsCache.length ? 'disabled' : ''}>${window.t('next') || 'Вперёд'} ▶</button>
        </div>`;
    }
    
    roomsContainer.innerHTML = html || `<div class=\"metro-list-item text-dim\">${window.t('empty_rooms')}</div>`;
    
    // Event listeners для навигации
    const prevBtn = document.getElementById('prevRoomsBtn');
    const nextBtn = document.getElementById('nextRoomsBtn');
    if (prevBtn) prevBtn.onclick = () => { virtualScrollOffset = Math.max(0, virtualScrollOffset - VISIBLE_ROOMS_COUNT); renderVirtualRooms(); };
    if (nextBtn) nextBtn.onclick = () => { virtualScrollOffset = Math.min(filteredRoomsCache.length - VISIBLE_ROOMS_COUNT, virtualScrollOffset + VISIBLE_ROOMS_COUNT); renderVirtualRooms(); };
}


if (roomSearchInput) roomSearchInput.addEventListener('input', renderRooms);
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
        category: selectedCategory,
        isPrivate: isPrivate
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

const profileTrigger = document.getElementById('profileTrigger') || document.getElementById('currentUserDisp');
if (profileTrigger) profileTrigger.onclick = async () => {
    document.getElementById('profileUsername').textContent = window.currentUsername;
    const data = await (await fetch('/api/profile')).json();
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
                return `<div class="stat-tile"><div class="stat-emoji">${emoji}</div><div class="stat-cat">${stat.category}</div><div class="stat-count">${stat.max_matches}</div></div>`;
            }).join('');
        } else statsContainer.innerHTML = `<span class="text-dim">${window.t('empty_leader')}</span>`;
    }
    document.getElementById('profileModal').classList.remove('hidden');
};

if (document.getElementById('saveProfileBtn')) document.getElementById('saveProfileBtn').onclick = async () => {
    const themeVal = document.getElementById('profTheme') ? document.getElementById('profTheme').value : 'dark';
    const langVal = document.getElementById('profLang') ? document.getElementById('profLang').value : 'auto';
    const avatarVal = document.getElementById('profAvatar') ? document.getElementById('profAvatar').value : '😶';
    const res = await fetch('/api/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: document.getElementById('profEmail') ? document.getElementById('profEmail').value : '', newPassword: document.getElementById('profNewPassword') ? document.getElementById('profNewPassword').value : '', avatar: avatarVal, theme: themeVal, language: langVal })
    });
    if ((await res.json()).success) { 
        document.getElementById('profileModal').classList.add('hidden');
        window.currentUserAvatar = avatarVal;
        if (document.getElementById('currentUserAvatar')) document.getElementById('currentUserAvatar').textContent = window.currentUserAvatar;
        
        // ДОБАВЛЕНО: Сохраняем язык и тему при изменении профиля
        localStorage.setItem('appTheme', themeVal);
        localStorage.setItem('appLang', langVal);
        
        window.applySettings(themeVal, langVal);
    } 
};

if (document.getElementById('closeProfileBtn')) document.getElementById('closeProfileBtn').onclick = () => document.getElementById('profileModal').classList.add('hidden');

window.socket.on('gameStart', (data) => {
    document.getElementById('lobbyScreen').classList.add('hidden');
    document.getElementById('roomScreen').classList.add('hidden');
    document.getElementById('gameScreen').classList.remove('hidden');
    if (typeof window.startGameLogic === 'function') window.startGameLogic(data);
});

// ====================== LEADERBOARD ЧЕРЕЗ WEBSOCKET ======================
const rankEmojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
let currentLeaderboardCategory = 'all';

function renderLeaderboard(data) {
    if (!leaderBox) return;
    let myRankEmoji = null;
    leaderBox.innerHTML = data.map((u, i) => {
        const emoji = rankEmojis[i] || `${i + 1}.`; 
        if (u.username === window.currentUsername) myRankEmoji = emoji;
        return `<div class=\"metro-list-item\"><span>${emoji} ${escHtml(u.username)}</span> <b>${u.totalScore}</b></div>`;
    }).join('') || `<div class=\"metro-list-item text-dim\">${window.t('empty_leader')}</div>`;

    const rankBadge = document.getElementById('currentUserRankBadge');
    if (rankBadge) {
        if (myRankEmoji) { rankBadge.textContent = myRankEmoji; rankBadge.classList.remove('hidden'); } 
        else rankBadge.classList.add('hidden');
    }
}

// WebSocket событие обновления leaderboard
window.socket.on('leaderboardUpdate', (payload) => {
    if (payload.category === currentLeaderboardCategory || payload.category === 'all') {
        renderLeaderboard(payload.data);
    }
});

// Подписка на leaderboard
function subscribeLeaderboard(category) {
    if (currentLeaderboardCategory !== category) {
        window.socket.emit('unsubscribeLeaderboard', currentLeaderboardCategory);
    }
    currentLeaderboardCategory = category;
    window.socket.emit('subscribeLeaderboard', category);
}

if (leaderCat) {
    leaderCat.onchange = () => subscribeLeaderboard(leaderCat.value);
}

// Fallback: HTTP запрос если WebSocket не сработал (первая загрузка)
async function updateLeaderboard() {
    try {
        if (!leaderCat || !leaderBox) return;
        const data = await (await fetch(`/api/leaderboard?category=${encodeURIComponent(leaderCat.value)}`)).json();
        renderLeaderboard(data);
    } catch (e) {}
}

// Инициализация: подписываемся на leaderboard после подключения socket
window.socket.on('connect', () => {
    subscribeLeaderboard(currentLeaderboardCategory);
});

// Обработчик reconnect для переподписки
window.onSocketReconnect = function() {
    subscribeLeaderboard(currentLeaderboardCategory);
    // Обновляем leaderboard через HTTP как fallback
    updateLeaderboard();
};

// Первичная загрузка (HTTP fallback)
updateLeaderboard();

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

if (lbToggleBtn && lbWrapper) {
    lbToggleBtn.onclick = () => {
        lbWrapper.classList.add('show-modal');
    };
}

if (lbCloseBtn && lbWrapper) {
    lbCloseBtn.onclick = () => {
        lbWrapper.classList.remove('show-modal');
    };
}

const openBotModalBtn = document.getElementById('openBotModalBtn');
const botModal = document.getElementById('botModal');
const closeBotModalBtn = document.getElementById('closeBotModalBtn');
const startBotGameBtn = document.getElementById('startBotGameBtn');

if (openBotModalBtn && botModal) {
    openBotModalBtn.onclick = () => botModal.classList.remove('hidden');
}

if (closeBotModalBtn && botModal) {
    closeBotModalBtn.onclick = () => botModal.classList.add('hidden');
}

if (startBotGameBtn) {
    startBotGameBtn.onclick = () => {
        let selectedCategory = document.getElementById('botCategory').value;
        const difficulty = document.getElementById('botDifficulty').value;

        if (selectedCategory === 'random') {
            const availableKeys = Object.keys(window.icons);
            selectedCategory = availableKeys.length > 0 ? availableKeys[Math.floor(Math.random() * availableKeys.length)] : 'animals';
        }

        window.socket.emit('createBotRoom', { 
            category: selectedCategory,
            difficulty: difficulty
        });

        botModal.classList.add('hidden');
    };
}