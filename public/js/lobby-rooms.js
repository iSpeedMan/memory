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

// ── Избранные категории (localStorage) ────────────────────────────────────────

const _SS_FAV_KEY = 'mm_fav_cats';
const _SS_FAV_MAX = 10;
const _SS_NO_FAV  = new Set(['all', 'random']); // эти не избираемы

function _ssGetFavs() {
    try { return JSON.parse(localStorage.getItem(_SS_FAV_KEY) || '[]'); } catch { return []; }
}
function _ssSetFavs(arr) {
    localStorage.setItem(_SS_FAV_KEY, JSON.stringify(arr));
}
function _ssToggleFav(value) {
    let favs = _ssGetFavs();
    const idx = favs.indexOf(value);
    if (idx !== -1) {
        favs.splice(idx, 1);
    } else {
        favs.unshift(value);
        if (favs.length > _SS_FAV_MAX) favs = favs.slice(0, _SS_FAV_MAX);
    }
    _ssSetFavs(favs);
    return favs;
}

// ── Универсальный поиск по select ─────────────────────────────────────────────

function makeSearchableSelect(selectEl, { showFavs = false } = {}) {
    if (!selectEl || selectEl._searchable) return;
    selectEl._searchable = true;

    const esc = s => (window.escHtml ? window.escHtml(String(s)) : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'));

    const wrapper = document.createElement('div');
    wrapper.className = 'ss-wrapper';
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'metro-input ss-input';
    input.autocomplete = 'off';
    input.spellcheck = false;
    wrapper.insertBefore(input, selectEl);

    const drop = document.createElement('div');
    drop.className = 'ss-drop hidden';
    wrapper.appendChild(drop);

    selectEl.style.display = 'none';

    function syncPlaceholder() {
        const sel = selectEl.options[selectEl.selectedIndex];
        if (!sel) { input.placeholder = '🔍'; return; }
        const favs = showFavs ? _ssGetFavs() : [];
        const isFav = favs.includes(sel.value);
        input.placeholder = (showFavs && isFav && !_SS_NO_FAV.has(sel.value))
            ? '⭐ ' + sel.textContent
            : sel.textContent;
    }
    syncPlaceholder();

    function buildItem(o, isFav, isActive) {
        const canFav = showFavs && !_SS_NO_FAV.has(o.value);
        const starHtml = canFav
            ? `<button class="ss-star${isFav ? ' ss-star-on' : ''}" data-fav="${esc(o.value)}" tabindex="-1" title="${isFav ? 'Убрать из избранного' : 'В избранное'}">${isFav ? '★' : '☆'}</button>`
            : '';
        return `<div class="ss-item${isActive ? ' ss-active' : ''}" data-val="${esc(o.value)}">`
             + `<span class="ss-item-label">${esc(o.textContent)}</span>${starHtml}</div>`;
    }

    function renderDrop(query) {
        const q = (query || '').toLowerCase().trim();
        const allOpts = Array.from(selectEl.options);
        const opts = q ? allOpts.filter(o => o.textContent.toLowerCase().includes(q)) : allOpts;
        if (!opts.length) { drop.classList.add('hidden'); return; }

        const curVal = selectEl.value;
        const favs = showFavs ? _ssGetFavs() : [];
        const favSet = new Set(favs);

        // Разбиваем на избранные (в порядке favs) и остальные
        const favOpts = favs.map(fv => opts.find(o => o.value === fv)).filter(Boolean);
        const restOpts = opts.filter(o => !favSet.has(o.value));

        let html = '';
        if (showFavs && favOpts.length && !q) {
            html += favOpts.map(o => buildItem(o, true, o.value === curVal)).join('');
            if (restOpts.length) html += `<div class="ss-divider"></div>`;
        }
        const renderList = (showFavs && !q) ? restOpts : opts;
        html += renderList.map(o => buildItem(o, favSet.has(o.value), o.value === curVal)).join('');

        drop.innerHTML = html;
        drop.classList.remove('hidden');
    }

    function closeDrop() { drop.classList.add('hidden'); }

    function selectVal(value) {
        selectEl.value = value;
        input.value = '';
        syncPlaceholder();
        closeDrop();
        selectEl.dispatchEvent(new Event('change'));
    }

    input.addEventListener('focus', () => renderDrop(input.value));
    input.addEventListener('input', () => renderDrop(input.value));
    input.addEventListener('keydown', e => {
        if (e.key === 'Escape') { closeDrop(); input.blur(); }
        if (e.key === 'Enter') {
            const active = drop.querySelector('.ss-active') || drop.querySelector('.ss-item');
            if (active) selectVal(active.dataset.val);
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const items = [...drop.querySelectorAll('.ss-item')];
            const idx = items.indexOf(drop.querySelector('.ss-active'));
            const next = items[idx + 1] || items[0];
            if (next) { items.forEach(i => i.classList.remove('ss-active')); next.classList.add('ss-active'); }
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            const items = [...drop.querySelectorAll('.ss-item')];
            const idx = items.indexOf(drop.querySelector('.ss-active'));
            const prev = items[idx - 1] || items[items.length - 1];
            if (prev) { items.forEach(i => i.classList.remove('ss-active')); prev.classList.add('ss-active'); }
        }
    });

    drop.addEventListener('mousedown', e => {
        e.preventDefault();
        // Клик по звезде — тоглируем, не закрываем дропдаун
        const starBtn = e.target.closest('.ss-star');
        if (starBtn) {
            _ssToggleFav(starBtn.dataset.fav);
            syncPlaceholder();
            renderDrop(input.value);
            return;
        }
        const item = e.target.closest('.ss-item');
        if (item) selectVal(item.dataset.val);
    });

    document.addEventListener('click', e => {
        if (!wrapper.contains(e.target)) closeDrop();
    });

    new MutationObserver(() => syncPlaceholder()).observe(selectEl, { childList: true, subtree: false });
}

window._makeSearchableSelect = makeSearchableSelect;
window._ssToggleFav = _ssToggleFav;
window._ssGetFavs   = _ssGetFavs;

window.categoryDisplayNames = {};

window.loadCategories = async function() {
    try {
        const res = await fetch('/api/categories');
        const categories = await res.json();
        const roomCatSelect = document.getElementById('roomCategory');
        const botCatSelect = document.getElementById('botCategory');
        const localCatSelect = document.getElementById('localCategory');
        if (roomCatSelect) { roomCatSelect.innerHTML = ''; appendOption(roomCatSelect, 'random', window.t('random_cat')); }
        if (botCatSelect) { botCatSelect.innerHTML = ''; appendOption(botCatSelect, 'random', window.t('random_cat')); }
        if (localCatSelect) { localCatSelect.innerHTML = ''; appendOption(localCatSelect, 'random', window.t('random_cat')); }
        if (leaderCat) { leaderCat.innerHTML = ''; appendOption(leaderCat, 'all', window.t('all_cats')); }
        window.categoryDisplayNames = { random: window.t('random_cat'), unicode: window.t('cat_unicode') };
        categories.forEach(cat => {
            if (cat.key_name === 'unicode') {
                window.icons['unicode'] = [];
                window.categoryDisplayNames['unicode'] = window.t('cat_unicode');
                appendOption(roomCatSelect, 'unicode', window.t('cat_unicode'));
                appendOption(botCatSelect, 'unicode', window.t('cat_unicode'));
                appendOption(localCatSelect, 'unicode', window.t('cat_unicode'));
                appendOption(leaderCat, 'unicode', window.t('cat_unicode'));
                return;
            }
            const emojisArray = cat.emojis.split(',');
            window.icons[cat.key_name] = emojisArray;
            const rawRandom = emojisArray[Math.floor(Math.random() * emojisArray.length)];
            const isImgCat = rawRandom && (rawRandom.startsWith('/uploads/') || rawRandom.startsWith('http://') || rawRandom.startsWith('https://'));
            const randomEmoji = isImgCat ? (cat.repr_emoji || '🖼️') : rawRandom;
            const translatedName = window.currentLang === 'en'
                ? cat.key_name.charAt(0).toUpperCase() + cat.key_name.slice(1)
                : cat.display_name;
            const displayTitle = `${randomEmoji} ${translatedName}`;
            window.categoryDisplayNames[cat.key_name] = displayTitle;
            appendOption(roomCatSelect, cat.key_name, displayTitle);
            appendOption(botCatSelect, cat.key_name, displayTitle);
            appendOption(localCatSelect, cat.key_name, displayTitle);
            appendOption(leaderCat, cat.key_name, displayTitle);
        });
        if (typeof window.loadAdminCategories === 'function') window.loadAdminCategories(categories);

        // Применяем поиск ко всем нужным select-ам после загрузки
        makeSearchableSelect(leaderCat,      { showFavs: true  });
        makeSearchableSelect(roomCatSelect,  { showFavs: true  });
        makeSearchableSelect(botCatSelect,   { showFavs: true  });
        makeSearchableSelect(localCatSelect, { showFavs: false });
    } catch (e) { console.error('loadCategories error:', e); }
};

var currentRooms = [];
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

    const isFriendInvited = !isPlaying && !isRejoinable && window.friendInvitedRooms && window.friendInvitedRooms.has(room.id);

    let tileClass = 'metro-tile';
    if (isRejoinable) tileClass += ' rejoinable';
    else if (isFriendInvited) tileClass += ' friend-game';
    else if (isPlaying) tileClass += ' playing';

    let rejoinBadge = '';
    if (isRejoinable) rejoinBadge = `<div class="rejoin-badge">${window.t('rejoin_badge')}</div>`;
    else if (isFriendInvited) rejoinBadge = `<div class="friend-invite-badge">${window.t('friend_game_badge')}</div>`;

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
        category: selectedCategory, isPrivate, gridSize,
        invitedFriendId: window.invitedFriendId || null
    });
};

let _waitingTimerInterval = null;
function startWaitingTimer() {
    stopWaitingTimer();
    let seconds = 0;
    const disp = document.getElementById('waitingTimerDisp');
    if (disp) disp.textContent = '0:00';
    _waitingTimerInterval = setInterval(() => {
        seconds++;
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        if (disp) disp.textContent = `${m}:${String(s).padStart(2, '0')}`;
    }, 1000);
}
function stopWaitingTimer() {
    if (_waitingTimerInterval) { clearInterval(_waitingTimerInterval); _waitingTimerInterval = null; }
    const disp = document.getElementById('waitingTimerDisp');
    if (disp) disp.textContent = '0:00';
}

window.socket.on('roomCreated', (room) => {
    window.invitedFriendId = null;
    const _invSel = document.getElementById('inviteFriendSelect');
    if (_invSel) _invSel.value = '';
    if (typeof window.closeStartGameModal === 'function') window.closeStartGameModal();
    document.getElementById('lobbyScreen').classList.add('hidden');
    document.getElementById('roomScreen').classList.remove('hidden');
    startWaitingTimer();
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

if (document.getElementById('leaveRoomBtn')) document.getElementById('leaveRoomBtn').onclick = () => { stopWaitingTimer(); location.reload(); };

window.socket.on('gameStart', () => stopWaitingTimer());

// ==================== REJOIN UTILITIES ====================
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

// ==================== ROOM ACTION BUTTONS ====================
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

// ==================== START GAME MODAL ====================
window.closeStartGameModal = function() {
    const modal = document.getElementById('startGameModal');
    if (modal) {
        modal.classList.add('hidden');
        if (typeof window.modalPop === 'function') window.modalPop('startGame');
    }
};

(function() {
    const startGameBtn = document.getElementById('startGameBtn');
    const modal = document.getElementById('startGameModal');
    const closeBtn = document.getElementById('closeStartGameBtn');

    function switchModeTab(tabName) {
        document.querySelectorAll('.mode-tab-btn').forEach(t => {
            const active = t.dataset.tab === tabName;
            t.classList.toggle('accent-purple', active);
            t.classList.toggle('secondary', !active);
        });
        document.querySelectorAll('.mode-tab-content').forEach(s => {
            const name = s.id.replace('modeTab', '').toLowerCase();
            s.classList.toggle('hidden', name !== tabName);
        });
    }

    function openStartGameModal(tab) {
        if (!modal) return;
        modal.classList.remove('hidden');
        if (typeof window.modalPush === 'function') window.modalPush('startGame', window.closeStartGameModal);
        switchModeTab(tab || 'pvp');
    }

    window.openStartGameModal = openStartGameModal;

    if (startGameBtn) startGameBtn.onclick = () => openStartGameModal('pvp');
    if (closeBtn) closeBtn.onclick = () => window.closeStartGameModal();
    if (modal) {
        if (typeof window.addSwipeClose === 'function') window.addSwipeClose(modal, window.closeStartGameModal);
        document.querySelectorAll('.mode-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => switchModeTab(btn.dataset.tab));
        });
    }
})();
