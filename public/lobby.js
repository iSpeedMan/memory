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
            if (cat.key_name === 'unicode') {
                window.icons['unicode'] = [];
                appendOption(roomCatSelect, 'unicode', window.t('cat_unicode'));
                appendOption(botCatSelect, 'unicode', window.t('cat_unicode'));
                appendOption(leaderCat, 'unicode', window.t('cat_unicode'));
                return;
            }
            const emojisArray = cat.emojis.split(',');
            window.icons[cat.key_name] = emojisArray;
            const rawRandom = emojisArray[Math.floor(Math.random() * emojisArray.length)];
            const isImgCat = rawRandom && (rawRandom.startsWith('/uploads/') || rawRandom.startsWith('http://') || rawRandom.startsWith('https://'));
            const randomEmoji = isImgCat ? '🖼️' : rawRandom;
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

function isMyRejoinableRoom(room) {
    if (!window.currentUserId) return false;
    if (room.status !== 'playing') return false;
    return room.players.some(p => String(p.id) === String(window.currentUserId));
}

function createRoomTileHTML(room) {
    const catSelect = document.getElementById('roomCategory');
    const isPlaying = room.status === 'playing';
    const isRejoinable = isMyRejoinableRoom(room);
    const isMyWaiting = !isPlaying && (room.players.some(p => String(p.id) === String(window.currentUserId)) || room.creatorName === window.currentUsername);
    const statusText = isPlaying ? window.t('playing') : window.t('waiting');
    const privateIcon = room.isPrivate ? '🔒 ' : '';
    const gridLabel = room.gridSize ? `${room.gridSize}×${room.gridSize}` : '';

    let actionBtnHtml = '';
    if (isRejoinable) {
        actionBtnHtml = `
            <button class="metro-btn accent-green action-btn" data-action="rejoin" data-room="${window.escHtml(room.id)}">${window.t('rejoin_btn')}</button>
            <button class="metro-btn danger action-btn" data-action="leave-rejoin" data-room="${window.escHtml(room.id)}">${window.t('leave_game_btn')}</button>`;
    } else if (isPlaying) {
        if (!room.isPrivate) {
            actionBtnHtml = `<button class="metro-btn secondary action-btn" data-action="spectate" data-room="${window.escHtml(room.id)}">${window.t('spectate_btn')}</button>`;
        }
    } else if (!isMyWaiting) {
        actionBtnHtml = `<button class="metro-btn primary action-btn" data-action="join" data-room="${window.escHtml(room.id)}">${window.t('join_btn')}</button>`;
    }

    let displayCategory = room.category;
    if (room.category === 'unicode') {
        displayCategory = window.t('cat_unicode');
    } else if (catSelect) {
        const option = Array.from(catSelect.options).find(opt => opt.value === room.category);
        if (option) displayCategory = option.textContent;
    }

    let tileClass = 'metro-tile';
    if (isRejoinable) tileClass += ' rejoinable';
    else if (isPlaying) tileClass += ' playing';

    let rejoinBadge = '';
    if (isRejoinable) rejoinBadge = `<div class="rejoin-badge">${window.t('rejoin_badge')}</div>`;

    return `
        <div class="${tileClass}" data-room-id="${window.escHtml(room.id)}">
            ${rejoinBadge}
            <div class="metro-tile-header">
                <span class="metro-tile-title">${privateIcon}${window.escHtml(room.name)}</span>
                <span class="metro-tile-cat">${window.escHtml(statusText)}${gridLabel ? ` · ${gridLabel}` : ''}</span>
                ${actionBtnHtml}
            </div>
            <div class="metro-tile-author">
                <span>${window.escHtml(room.creatorAvatar || '😶')}</span>
                <span>${window.escHtml(room.creatorName)}</span>
                <span class="metro-tile-room-cat">${window.escHtml(displayCategory)}</span>
            </div>
        </div>`;
}

function sortRooms(rooms) {
    return [...rooms].sort((a, b) => {
        const aRejoin = isMyRejoinableRoom(a) ? 0 : 1;
        const bRejoin = isMyRejoinableRoom(b) ? 0 : 1;
        if (aRejoin !== bRejoin) return aRejoin - bRejoin;
        const aWaiting = a.status === 'waiting' ? 0 : 1;
        const bWaiting = b.status === 'waiting' ? 0 : 1;
        return aWaiting - bWaiting;
    });
}

function renderRooms() {
    if (!roomsContainer) return;
    const query = roomSearchInput ? roomSearchInput.value.toLowerCase().trim() : '';
    const filtered = currentRooms.filter(room =>
        room.name.toLowerCase().includes(query) ||
        room.creatorName.toLowerCase().includes(query) ||
        room.category.toLowerCase().includes(query)
    );
    filteredRoomsCache = sortRooms(filtered);
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
    if (hasRejoinableRoom()) { showRejoinBlockBanner(); return; }
    let selectedCategory = document.getElementById('roomCategory') ? document.getElementById('roomCategory').value : 'random';
    if (selectedCategory === 'random') {
        const availableKeys = Object.keys(window.icons).filter(k => k !== 'unicode');
        selectedCategory = availableKeys.length > 0 ? availableKeys[Math.floor(Math.random() * availableKeys.length)] : 'animals';
    }
    const isPrivate = document.getElementById('roomPrivate') ? document.getElementById('roomPrivate').checked : false;
    const gridSize = parseInt(document.getElementById('roomGridSize') ? document.getElementById('roomGridSize').value : '6', 10) || 6;
    window.socket.emit('createRoom', {
        name: document.getElementById('roomName') ? document.getElementById('roomName').value : '',
        category: selectedCategory, isPrivate, gridSize
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
        let catName = room.category === 'unicode' ? window.t('cat_unicode') : room.category;
        if (catSelect && room.category !== 'unicode') {
            const option = Array.from(catSelect.options).find(opt => opt.value === room.category);
            if (option) catName = option.textContent;
        }
        roomCategoryDisp.textContent = catName;
    }
});

if (document.getElementById('leaveRoomBtn')) document.getElementById('leaveRoomBtn').onclick = () => location.reload();

// ==================== ПРОФИЛЬ ====================
function switchProfileTab(activeTabId) {
    const tabs = ['profSectionSettings', 'profSectionHistory', 'profSectionStats', 'profSectionAchievements', 'profSectionSuggest'];
    const btns = ['profTabSettings', 'profTabHistory', 'profTabStats', 'profTabAchievements', 'profTabSuggest'];
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

['profTabSettings', 'profTabHistory', 'profTabStats', 'profTabAchievements', 'profTabSuggest'].forEach((btnId, i) => {
    const btn = document.getElementById(btnId);
    const sections = ['profSectionSettings', 'profSectionHistory', 'profSectionStats', 'profSectionAchievements', 'profSectionSuggest'];
    if (btn) btn.onclick = () => {
        switchProfileTab(sections[i]);
        if (sections[i] === 'profSectionHistory') loadProfileHistory();
        if (sections[i] === 'profSectionStats') loadProfileStats();
        if (sections[i] === 'profSectionAchievements') loadProfileAchievements();
        if (sections[i] === 'profSectionSuggest') loadMySuggestions();
    };
});

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
            <div class="metro-list-item hist-table-row hist-table-header">
                <span class="hist-col-main">${window.t('hist_opponent')}</span>
                <span class="hist-col-center">${window.t('hist_score')}</span>
                <span class="hist-col-result">${window.t('hist_result')}</span>
                <span class="hist-col-date">${window.t('hist_date')}</span>
            </div>
        ` + rows.map(row => {
            const myScore = row.my_score, oppScore = row.opp_score;
            let result, resultClass;
            if (myScore > oppScore) { result = window.t('hist_win'); resultClass = 'text-accent'; }
            else if (myScore < oppScore) { result = window.t('hist_loss'); resultClass = 'metro-error'; }
            else { result = window.t('hist_draw'); resultClass = 'text-dim'; }
            const oppName = row.is_bot_game
                ? `${window.t('hist_bot')} (${window.t('stat_' + (row.bot_difficulty || 'medium'))})`
                : row.opponent_name || '?';
            const date = new Date(row.played_at).toLocaleDateString();
            return `<div class="metro-list-item hist-table-row">
                <span class="hist-col-main">${window.escHtml(oppName)}</span>
                <span class="hist-col-center">${myScore}:${oppScore}</span>
                <span class="hist-col-result ${resultClass}">${result}</span>
                <span class="hist-col-date">${date}</span>
            </div>`;
        }).join('');
    } catch (e) {
        container.innerHTML = `<div class="metro-list-item text-dim">${window.t('profile_load_error')}</div>`;
    }
}

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
            <div class="metro-stats-grid pvp-stats-grid">
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

async function loadProfileAchievements() {
    const container = document.getElementById('profAchievementsContent');
    if (!container) return;
    container.innerHTML = `<div class="text-dim">${window.t('wait_msg')}</div>`;
    try {
        const res = await fetch('/api/achievements');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const achs = await res.json();
        if (!Array.isArray(achs) || !achs.length) {
            container.innerHTML = `<div class="text-dim text-center mt-m">${window.t('ach_empty')}</div>`;
            return;
        }
        const lang = window.currentLang === 'ru' ? 'ru' : 'en';
        container.innerHTML = achs.map(a => {
            const name = a[`name_${lang}`] || a.name_en || a.name_ru || a.key || '';
            const desc = a[`desc_${lang}`] || a.desc_en || a.desc_ru || '';
            const dateStr = a.achieved_at
                ? new Date(a.achieved_at).toLocaleDateString()
                : window.t('ach_locked');
            return `
            <div class="achievement-tile${a.earned ? '' : ' locked'}">
                <div class="achievement-icon">${window.escHtml(a.icon || '🏆')}</div>
                <div class="achievement-info">
                    <div class="achievement-name">${window.escHtml(name)}</div>
                    <div class="achievement-desc text-dim">${window.escHtml(desc)}</div>
                    <div class="achievement-date text-dim">${window.escHtml(dateStr)}</div>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        container.innerHTML = `<div class="text-dim">${window.t('profile_load_error')}</div>`;
    }
}

function setChatDisabledUI(disabled) {
    const wrapper = document.querySelector('.lobby-chat-wrapper');
    if (wrapper) wrapper.classList.toggle('hidden', !!disabled);
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
            const chatDisabledEl = document.getElementById('profChatDisabled');
            if (chatDisabledEl) chatDisabledEl.checked = !!data.chatDisabled;
            setChatDisabledUI(data.chatDisabled);
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
        } catch (e) { console.error('Profile error:', e); }
    });
}

if (document.getElementById('saveProfileBtn')) document.getElementById('saveProfileBtn').onclick = async (e) => {
    const btn = e.currentTarget;
    const themeVal = document.getElementById('profTheme') ? document.getElementById('profTheme').value : 'dark';
    const langVal = document.getElementById('profLang') ? document.getElementById('profLang').value : 'auto';
    const avatarVal = document.getElementById('profAvatar') ? document.getElementById('profAvatar').value : '😶';
    const newPassword = document.getElementById('profNewPassword') ? document.getElementById('profNewPassword').value : '';
    btn.disabled = true;
    try {
        const chatDisabledEl = document.getElementById('profChatDisabled');
        const res = await fetch('/api/profile', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: document.getElementById('profEmail') ? document.getElementById('profEmail').value : '',
                newPassword, avatar: avatarVal, theme: themeVal, language: langVal,
                chatDisabled: chatDisabledEl ? chatDisabledEl.checked : false
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
            setChatDisabledUI(chatDisabledEl ? chatDisabledEl.checked : false);
        } else {
            alert(data.error || window.t('saving_error'));
        }
    } finally {
        btn.disabled = false;
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
        return `<div class="metro-list-item leaderboard-entry" data-username="${window.escHtml(u.username)}">
            <span>${emoji} ${window.escHtml(u.username)}</span>
            <b>${Number(u.totalScore)}</b>
        </div>`;
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

// Clickable leaderboard entries
if (leaderBox) {
    leaderBox.addEventListener('click', (e) => {
        const entry = e.target.closest('.leaderboard-entry');
        if (entry && entry.dataset.username) {
            openPublicProfile(entry.dataset.username);
        }
    });
}

// ==================== PUBLIC PROFILE ====================
async function openPublicProfile(username) {
    const modal = document.getElementById('publicProfileModal');
    const content = document.getElementById('publicProfileContent');
    if (!modal || !content) return;
    modal.classList.remove('hidden');
    content.innerHTML = `<div class="text-dim text-center">${window.t('pub_profile_loading')}</div>`;
    try {
        const res = await fetch(`/api/user/${encodeURIComponent(username)}/profile`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const pvp = data.pvp || { total: 0, wins: 0, draws: 0, losses: 0 };
        const winRate = pvp.total > 0 ? Math.round((pvp.wins / pvp.total) * 100) : 0;
        const achs = data.achievements || [];
        content.innerHTML = `
            <div class="pub-profile-header">
                <span class="pub-profile-avatar">${window.escHtml(data.avatar || '😶')}</span>
                <span class="pub-profile-username">${window.escHtml(data.username)}</span>
            </div>
            <div class="metro-stats-grid pvp-stats-grid mt-m">
                <div class="stat-tile"><div class="stat-count">${pvp.total}</div><div class="stat-cat">${window.t('stat_total')}</div></div>
                <div class="stat-tile"><div class="stat-count text-accent">${pvp.wins}</div><div class="stat-cat">${window.t('stat_wins')}</div></div>
                <div class="stat-tile"><div class="stat-count">${pvp.losses}</div><div class="stat-cat">${window.t('stat_losses')}</div></div>
                <div class="stat-tile"><div class="stat-count">${winRate}%</div><div class="stat-cat">${window.t('stat_winrate')}</div></div>
            </div>
            ${achs.length > 0 ? `
                <h3 class="metro-subtitle mt-l mb-s" data-i18n="ach_title">${window.t('ach_title')}</h3>
                <div class="achievements-grid">
                    ${achs.map(a => `<div class="achievement-tile">
                        <div class="achievement-icon">${window.escHtml(a.icon || '🏆')}</div>
                        <div class="achievement-info">
                            <div class="achievement-name">${window.escHtml(window.currentLang === 'ru' ? (a.name_ru || a.name_en) : (a.name_en || a.name_ru))}</div>
                        </div>
                    </div>`).join('')}
                </div>
            ` : ''}
        `;
    } catch (e) {
        content.innerHTML = `<div class="text-dim text-center">${window.t('pub_profile_error')}</div>`;
    }
}

const closePublicProfileBtn = document.getElementById('closePublicProfileBtn');
if (closePublicProfileBtn) closePublicProfileBtn.onclick = () => document.getElementById('publicProfileModal').classList.add('hidden');

// ==================== УТИЛИТЫ ДЛЯ БЛОКИРОВКИ ====================
function hasRejoinableRoom() {
    return currentRooms.some(r => isMyRejoinableRoom(r));
}

function getRejoinableRoomId() {
    const room = currentRooms.find(r => isMyRejoinableRoom(r));
    return room ? room.id : null;
}

let rejoinBannerTimeout = null;

function showRejoinBlockBanner() {
    let banner = document.getElementById('rejoinBlockBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'rejoinBlockBanner';
        banner.className = 'rejoin-block-banner';
        const roomsSection = roomsContainer ? roomsContainer.parentElement : document.body;
        roomsSection.insertBefore(banner, roomsContainer);
    }
    const roomId = getRejoinableRoomId();
    banner.innerHTML = `
        <span class="rejoin-block-icon">⚠️</span>
        <span class="rejoin-block-text">${window.t('rejoin_block_msg')}</span>
        <div class="rejoin-block-actions">
            <button class="metro-btn accent-green rejoin-block-btn" id="rejoinBlockReturnBtn">${window.t('rejoin_btn')}</button>
            <button class="metro-btn danger rejoin-block-btn" id="rejoinBlockLeaveBtn">${window.t('leave_game_btn')}</button>
        </div>
    `;
    banner.classList.add('visible');
    document.getElementById('rejoinBlockReturnBtn').onclick = () => {
        if (roomId) window.socket.emit('rejoinRoom', roomId);
        hideRejoinBlockBanner();
    };
    document.getElementById('rejoinBlockLeaveBtn').onclick = () => {
        if (roomId) window.socket.emit('leaveRejoinableRoom', roomId);
        hideRejoinBlockBanner();
    };
    clearTimeout(rejoinBannerTimeout);
    rejoinBannerTimeout = setTimeout(hideRejoinBlockBanner, 8000);
}

function hideRejoinBlockBanner() {
    const banner = document.getElementById('rejoinBlockBanner');
    if (banner) banner.classList.remove('visible');
}

// ==================== ДЕЙСТВИЯ С КОМНАТАМИ ====================
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.action-btn');
    if (btn) {
        if (btn.dataset.action === 'join') {
            if (hasRejoinableRoom()) { showRejoinBlockBanner(); return; }
            window.socket.emit('joinRoom', btn.dataset.room);
        }
        else if (btn.dataset.action === 'spectate') window.socket.emit('spectateRoom', btn.dataset.room);
        else if (btn.dataset.action === 'rejoin') window.socket.emit('rejoinRoom', btn.dataset.room);
        else if (btn.dataset.action === 'leave-rejoin') window.socket.emit('leaveRejoinableRoom', btn.dataset.room);
    }
});

window.socket.on('joinError', (msg) => { alert(msg); });

// ==================== LOBBY CHAT ====================
function addLobbyChatMessage(msg) {
    const container = document.getElementById('lobbyChatMessages');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'chat-message';
    const isSelf = msg.username === window.currentUsername;
    el.classList.toggle('chat-msg-self', isSelf);
    el.innerHTML = `<span class="chat-msg-avatar">${window.escHtml(msg.avatar || '😶')}</span><span class="chat-msg-name">${window.escHtml(msg.username)}</span><span class="chat-msg-text">${window.escHtml(msg.text)}</span>`;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
    while (container.children.length > 30) container.removeChild(container.firstChild);
}

window.socket.on('chatMessage', (msg) => {
    const lobbyScreen = document.getElementById('lobbyScreen');
    if (lobbyScreen && !lobbyScreen.classList.contains('hidden')) {
        addLobbyChatMessage(msg);
    }
});

window.socket.on('chatHistory', (data) => {
    const lobbyScreen = document.getElementById('lobbyScreen');
    if (lobbyScreen && !lobbyScreen.classList.contains('hidden')) {
        const container = document.getElementById('lobbyChatMessages');
        if (container) {
            container.innerHTML = '';
            (data.messages || []).forEach(msg => addLobbyChatMessage(msg));
        }
    }
});

function sendLobbyChat() {
    const input = document.getElementById('lobbyChatInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    window.socket.emit('sendChat', { text });
    input.value = '';
}

const lobbyChatSend = document.getElementById('lobbyChatSend');
const lobbyChatInput = document.getElementById('lobbyChatInput');
if (lobbyChatSend) lobbyChatSend.onclick = sendLobbyChat;
if (lobbyChatInput) lobbyChatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendLobbyChat(); });

// Request lobby chat history when lobby becomes visible
window.socket.on('connect', () => {
    const lobbyScreen = document.getElementById('lobbyScreen');
    if (lobbyScreen && !lobbyScreen.classList.contains('hidden')) {
        window.socket.emit('getChatHistory', {});
    }
});

// ==================== LEADERBOARD TOGGLE ====================
const lbToggleBtn = document.getElementById('leaderboardToggleBtn');
const lbCloseBtn = document.getElementById('closeLeaderboardBtn');
const lbWrapper = document.getElementById('leaderboardWrapper');
if (lbToggleBtn && lbWrapper) lbToggleBtn.onclick = () => lbWrapper.classList.add('show-modal');
if (lbCloseBtn && lbWrapper) lbCloseBtn.onclick = () => lbWrapper.classList.remove('show-modal');

// ==================== BOT MODAL ====================
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
    if (botModal) botModal.classList.add('hidden');
    hideBotError();
});

// ==================== PROFILE SUGGEST TAB ====================
async function loadMySuggestions() {
    const container = document.getElementById('mySuggestionsContainer');
    if (!container) return;
    container.innerHTML = `<div class="metro-list-item text-dim">${window.t('wait_msg')}</div>`;
    try {
        const res = await fetch('/api/categories/my-suggestions');
        const rows = await res.json();
        if (!rows.length) {
            container.innerHTML = `<div class="metro-list-item text-dim">${window.t('custom_cat_empty')}</div>`;
            return;
        }
        container.innerHTML = rows.map(r => {
            const statusMap = { pending: `<span class="text-dim">${window.t('custom_cat_pending')}</span>`, approved: `<span class="text-accent">${window.t('custom_cat_approved')}</span>`, rejected: `<span class="metro-error">${window.t('custom_cat_rejected')}</span>` };
            const statusHtml = statusMap[r.status] || r.status;
            const imgHtml = r.image_url ? `<img src="${window.escHtml(r.image_url)}" class="suggest-submission-img" alt="">` : '';
            return `<div class="metro-list-item suggest-submission-item">${imgHtml}<div><b>${window.escHtml(r.key_name)}</b> ${window.escHtml(r.display_name)} ${statusHtml}</div></div>`;
        }).join('');
    } catch (e) {
        container.innerHTML = `<div class="metro-list-item text-dim">${window.t('profile_load_error')}</div>`;
    }
}

// ==================== SUGGEST CATEGORY TABS ====================
const suggestTabEmoji = document.getElementById('suggestTabEmoji');
const suggestTabImage = document.getElementById('suggestTabImage');
const suggestFormEmoji = document.getElementById('suggestFormEmoji');
const suggestFormImage = document.getElementById('suggestFormImage');

function switchSuggestTab(tab) {
    if (tab === 'emoji') {
        if (suggestFormEmoji) suggestFormEmoji.classList.remove('hidden');
        if (suggestFormImage) suggestFormImage.classList.add('hidden');
        if (suggestTabEmoji) { suggestTabEmoji.classList.remove('secondary'); suggestTabEmoji.classList.add('accent-purple'); }
        if (suggestTabImage) { suggestTabImage.classList.remove('accent-purple'); suggestTabImage.classList.add('secondary'); }
    } else {
        if (suggestFormEmoji) suggestFormEmoji.classList.add('hidden');
        if (suggestFormImage) suggestFormImage.classList.remove('hidden');
        if (suggestTabImage) { suggestTabImage.classList.remove('secondary'); suggestTabImage.classList.add('accent-purple'); }
        if (suggestTabEmoji) { suggestTabEmoji.classList.remove('accent-purple'); suggestTabEmoji.classList.add('secondary'); }
    }
}

if (suggestTabEmoji) suggestTabEmoji.onclick = () => switchSuggestTab('emoji');
if (suggestTabImage) suggestTabImage.onclick = () => switchSuggestTab('image');

// Image file counter
const suggestCatImagesInput = document.getElementById('suggestCatImages');
const suggestImageCounter = document.getElementById('suggestImageCounter');
if (suggestCatImagesInput && suggestImageCounter) {
    suggestCatImagesInput.addEventListener('change', () => {
        const count = suggestCatImagesInput.files.length;
        const ok = count >= 9 && count <= 18;
        suggestImageCounter.textContent = window.currentLang === 'ru'
            ? `Выбрано: ${count} (нужно 9–18)`
            : `Selected: ${count} (need 9–18)`;
        suggestImageCounter.style.color = ok ? '' : 'var(--color-error, #e74c3c)';
    });
}

async function submitSuggestForm(key, name, formData, msgEl, btn) {
    btn.disabled = true;
    try {
        const res = await fetch('/api/categories/suggest', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
            if (msgEl) { msgEl.textContent = window.t('custom_cat_success'); msgEl.className = 'metro-error text-accent'; msgEl.classList.remove('hidden'); }
            loadMySuggestions();
            setTimeout(() => { if (msgEl) msgEl.classList.add('hidden'); }, 3000);
        } else {
            if (msgEl) { msgEl.textContent = data.error || window.t('server_error'); msgEl.className = 'metro-error'; msgEl.classList.remove('hidden'); }
        }
    } catch (e) {
        if (msgEl) { msgEl.textContent = window.t('server_error'); msgEl.className = 'metro-error'; msgEl.classList.remove('hidden'); }
    } finally {
        btn.disabled = false;
    }
}

// Emoji form submit
const sendSuggestEmojiBtn = document.getElementById('sendSuggestEmojiBtn');
if (sendSuggestEmojiBtn) sendSuggestEmojiBtn.onclick = async () => {
    const key = (document.getElementById('suggestEmojiKey')?.value || '').trim();
    const name = (document.getElementById('suggestEmojiName')?.value || '').trim();
    const emojis = (document.getElementById('suggestEmojiList')?.value || '').trim();
    const msgEl = document.getElementById('suggestEmojiMsg');
    if (!key || !name) {
        if (msgEl) { msgEl.textContent = window.t('please_fill_in_the_required_fields'); msgEl.className = 'metro-error'; msgEl.classList.remove('hidden'); }
        return;
    }
    if (!emojis) {
        if (msgEl) { msgEl.textContent = window.t('exactly_18_emojis'); msgEl.className = 'metro-error'; msgEl.classList.remove('hidden'); }
        return;
    }
    const formData = new FormData();
    formData.append('key_name', key);
    formData.append('display_name', name);
    formData.append('emojis', emojis);
    await submitSuggestForm(key, name, formData, msgEl, sendSuggestEmojiBtn);
    if (msgEl && !msgEl.classList.contains('hidden') && msgEl.classList.contains('text-accent')) {
        document.getElementById('suggestEmojiKey').value = '';
        document.getElementById('suggestEmojiName').value = '';
        document.getElementById('suggestEmojiList').value = '';
    }
};

// Image form submit
const sendSuggestImageBtn = document.getElementById('sendSuggestImageBtn');
if (sendSuggestImageBtn) sendSuggestImageBtn.onclick = async () => {
    const key = (document.getElementById('suggestImageKey')?.value || '').trim();
    const name = (document.getElementById('suggestImageName')?.value || '').trim();
    const imageInput = document.getElementById('suggestCatImages');
    const msgEl = document.getElementById('suggestImageMsg');
    if (!key || !name) {
        if (msgEl) { msgEl.textContent = window.t('please_fill_in_the_required_fields'); msgEl.className = 'metro-error'; msgEl.classList.remove('hidden'); }
        return;
    }
    const count = imageInput ? imageInput.files.length : 0;
    if (count < 9 || count > 18) {
        if (msgEl) {
            msgEl.textContent = window.currentLang === 'ru'
                ? 'Выберите от 9 до 18 изображений'
                : 'Please select between 9 and 18 images';
            msgEl.className = 'metro-error';
            msgEl.classList.remove('hidden');
        }
        return;
    }
    const formData = new FormData();
    formData.append('key_name', key);
    formData.append('display_name', name);
    Array.from(imageInput.files).forEach(f => formData.append('images', f));
    await submitSuggestForm(key, name, formData, msgEl, sendSuggestImageBtn);
    if (msgEl && !msgEl.classList.contains('hidden') && msgEl.classList.contains('text-accent')) {
        document.getElementById('suggestImageKey').value = '';
        document.getElementById('suggestImageName').value = '';
        if (imageInput) imageInput.value = '';
        if (suggestImageCounter) suggestImageCounter.textContent = '';
    }
};

// ==================== ESC ====================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        ['profileModal', 'adminModal', 'botModal', 'publicProfileModal'].forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.classList.contains('hidden')) el.classList.add('hidden');
        });
        if (lbWrapper && lbWrapper.classList.contains('show-modal')) lbWrapper.classList.remove('show-modal');
    }
});

// ==================== CHAT MUTE EVENTS (lobby) ====================
window.socket.on('chatMuted', (data) => {
    const remaining = data.remainingMinutes || '?';
    const msg = data.isBanned
        ? window.t('chat_muted_banned')
        : window.t('chat_muted_status').replace('{min}', remaining);
    showChatMuteToast(msg);
    const input = document.getElementById('lobbyChatInput');
    if (input) input.disabled = true;
    const notice = document.getElementById('lobbyChatMutedNotice');
    if (notice) { notice.textContent = msg; notice.classList.remove('hidden'); }
});

window.socket.on('chatUnmuted', () => {
    const input = document.getElementById('lobbyChatInput');
    if (input) input.disabled = false;
    const notice = document.getElementById('lobbyChatMutedNotice');
    if (notice) notice.classList.add('hidden');
    showChatMuteToast(window.t('chat_unmuted'));
});

window.socket.on('chatWarning', (data) => {
    const v = data.violations || 0, max = data.maxBeforeBan || 6;
    showChatMuteToast(`${window.t('chat_muted_warning')} (${v}/${max})`);
});

function showChatMuteToast(msg) {
    let toast = document.getElementById('chatMuteToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'chatMuteToast';
        toast.className = 'chat-mute-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('visible');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('visible'), 4000);
}
window.showChatMuteToast = showChatMuteToast;
