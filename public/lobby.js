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

function renderRooms() {
    if (!roomsContainer) return;
    const query = roomSearchInput ? roomSearchInput.value.toLowerCase().trim() : '';
    const filteredRooms = currentRooms.filter(room => room.name.toLowerCase().includes(query) || room.creatorName.toLowerCase().includes(query) || room.category.toLowerCase().includes(query));

    const catSelect = document.getElementById('roomCategory');

    roomsContainer.innerHTML = filteredRooms.map(room => {
        const isMyRoom = room.players.some(p => p.name === window.currentUsername) || room.creatorName === window.currentUsername;
        const isPlaying = room.status === 'playing';
        const statusClass = isPlaying ? 'playing' : '';
        const statusText = isPlaying ? window.t('playing') : window.t('waiting');

        let actionBtnHtml = '';
        if (isPlaying) {
            actionBtnHtml = `<button class="metro-btn secondary action-btn" data-action="spectate" data-room="${room.id}">${window.t('spectate_btn')}</button>`;
        } else if (!isMyRoom) {
            actionBtnHtml = `<button class="metro-btn primary action-btn" data-action="join" data-room="${room.id}">${window.t('join_btn')}</button>`;
        }

        let displayCategory = room.category;
        if (catSelect) {
            const option = Array.from(catSelect.options).find(opt => opt.value === room.category);
            if (option) displayCategory = option.textContent;
        }

        return `
            <div class="metro-tile ${statusClass}">
                <div class="metro-tile-header">
                    <span class="metro-tile-title">${room.name}</span>
                    <span class="metro-tile-cat">${statusText}</span>
                ${actionBtnHtml}
                </div>
                <div class="metro-tile-author">
                    <span>${room.creatorAvatar || '😶'}</span>
                    <span>${room.creatorName}</span>
                    <span class="metro-tile-room-cat">${displayCategory}</span>
                </div>
            </div>`;
    }).join('') || `<div class="metro-list-item text-dim">${window.t('empty_rooms')}</div>`;
}


if (roomSearchInput) roomSearchInput.addEventListener('input', renderRooms);
window.socket.on('roomsList', (rooms) => { currentRooms = rooms; renderRooms(); });

if (document.getElementById('createRoomBtn')) document.getElementById('createRoomBtn').onclick = () => {
    let selectedCategory = document.getElementById('roomCategory') ? document.getElementById('roomCategory').value : 'random';
    if (selectedCategory === 'random') {
        const availableKeys = Object.keys(window.icons);
        selectedCategory = availableKeys.length > 0 ? availableKeys[Math.floor(Math.random() * availableKeys.length)] : 'animals';
    }
    window.socket.emit('createRoom', { name: document.getElementById('roomName') ? document.getElementById('roomName').value : '', category: selectedCategory });
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

async function updateLeaderboard() {
    try {
        if (!leaderCat || !leaderBox) return;
        const data = await (await fetch(`/api/leaderboard?category=${leaderCat.value}`)).json();
        const rankEmojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        let myRankEmoji = null; 
        leaderBox.innerHTML = data.map((u, i) => {
            const emoji = rankEmojis[i] || `${i + 1}.`; 
            if (u.username === window.currentUsername) myRankEmoji = emoji;
            return `<div class="metro-list-item"><span>${emoji} ${u.username}</span> <b>${u.totalScore}</b></div>`;
        }).join('') || `<div class="metro-list-item text-dim">${window.t('empty_leader')}</div>`;

        const rankBadge = document.getElementById('currentUserRankBadge');
        if (rankBadge) {
            if (myRankEmoji) { rankBadge.textContent = myRankEmoji; rankBadge.classList.remove('hidden'); } 
            else rankBadge.classList.add('hidden');
        }
    } catch (e) {}
}
if (leaderCat) leaderCat.onchange = updateLeaderboard;
setInterval(updateLeaderboard, 10000); 
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