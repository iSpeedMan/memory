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

if (leaderBox) {
    leaderBox.addEventListener('click', (e) => {
        const entry = e.target.closest('.leaderboard-entry');
        if (entry && entry.dataset.username) {
            openPublicProfile(entry.dataset.username);
        }
    });
}

// ==================== PUBLIC PROFILE ====================
function closePublicProfile() {
    const modal = document.getElementById('publicProfileModal');
    if (modal) modal.classList.add('hidden');
    window.modalPop('publicProfile');
}

function _pubFrameStyle(cssClass) {
    switch (cssClass) {
        case 'frame-silver':   return 'box-shadow:0 0 0 3px #c0c0c0;border-radius:6px;';
        case 'frame-gold':     return 'box-shadow:0 0 0 3px #ffd700,0 0 12px rgba(255,215,0,0.5);border-radius:6px;';
        case 'frame-neon':     return 'box-shadow:0 0 0 2px #06b6d4,0 0 14px rgba(6,182,212,0.6);border-radius:6px;';
        case 'frame-champion': return 'box-shadow:0 0 0 3px #9333ea,0 0 20px rgba(147,51,234,0.7);border-radius:6px;';
        default: return '';
    }
}

async function openPublicProfile(username) {
    const modal = document.getElementById('publicProfileModal');
    const content = document.getElementById('publicProfileContent');
    if (!modal || !content) return;
    modal.classList.remove('hidden');
    window.modalPush('publicProfile', closePublicProfile);
    content.innerHTML = `<div class="text-dim text-center">${window.t('pub_profile_loading')}</div>`;
    try {
        const res = await fetch(`/api/user/${encodeURIComponent(username)}/profile`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const pvp = data.pvp || { total: 0, wins: 0, draws: 0, losses: 0 };
        const winRate = pvp.total > 0 ? Math.round((pvp.wins / pvp.total) * 100) : 0;
        const achs = data.achievements || [];
        const genderIcon = data.gender === 'male' ? '♂' : data.gender === 'female' ? '♀' : '';
        const genderLabel = data.gender === 'male'
            ? window.t('pub_profile_gender_male')
            : data.gender === 'female' ? window.t('pub_profile_gender_female') : '';

        const cos = data.cosmetics || {};
        const frameStyle = _pubFrameStyle(cos.avatar_frame?.css_class || '');
        const titleData = cos.title;
        const showTitle = titleData?.label && titleData?.css_class && titleData.css_class !== 'shop-title-none';
        const titleHtml = showTitle
            ? `<span class="shop-title-badge ${window.escHtml(titleData.css_class)}" style="color:${window.escHtml(titleData.color || '#fff')}">${window.escHtml(titleData.label)}</span>`
            : '';

        content.innerHTML = `
            <div class="pub-profile-header">
                <span class="pub-profile-avatar" style="${frameStyle}">${window.escHtml(data.avatar || '😶')}</span>
                <div class="pub-profile-name-col">
                    <span class="pub-profile-username">${window.escHtml(data.username)}${genderIcon ? ` <span class="pub-profile-gender" title="${window.escHtml(genderLabel)}">${genderIcon}</span>` : ''}</span>
                    ${titleHtml}
                </div>
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

// ==================== LEADERBOARD CATEGORY SEARCH ====================
(function initLeaderCatSearch() {
    const searchEl = document.getElementById('leaderCatSearch');
    const listEl   = document.getElementById('leaderCatList');
    if (!searchEl || !listEl) return;

    let _cats = []; // { value, label }
    let _selected = { value: 'all', label: '' };

    window._leaderCatAdd = function(value, label) {
        _cats.push({ value, label });
        if (value === 'all') {
            _selected.label = label;
            searchEl.placeholder = label;
        }
    };

    function _setSelected(value, label) {
        _selected = { value, label };
        searchEl.value = '';
        searchEl.placeholder = label;
        listEl.classList.add('hidden');
        subscribeLeaderboard(value);
    }

    function _renderList(query) {
        const q = (query || '').toLowerCase();
        const matches = q
            ? _cats.filter(c => c.label.toLowerCase().includes(q))
            : _cats;
        if (!matches.length) { listEl.classList.add('hidden'); return; }
        listEl.innerHTML = matches.map(c =>
            `<div class="leader-cat-item${c.value === _selected.value ? ' active' : ''}" data-val="${window.escHtml(c.value)}">${window.escHtml(c.label)}</div>`
        ).join('');
        listEl.classList.remove('hidden');
    }

    searchEl.addEventListener('focus', () => _renderList(searchEl.value));
    searchEl.addEventListener('input', () => _renderList(searchEl.value));
    listEl.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.leader-cat-item');
        if (!item) return;
        e.preventDefault();
        const cat = _cats.find(c => c.value === item.dataset.val);
        if (cat) _setSelected(cat.value, cat.label);
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.leader-cat-wrapper')) listEl.classList.add('hidden');
    });
    searchEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { listEl.classList.add('hidden'); searchEl.blur(); }
    });
})();

const closePublicProfileBtn = document.getElementById('closePublicProfileBtn');
if (closePublicProfileBtn) closePublicProfileBtn.onclick = closePublicProfile;
const pubProfileModal = document.getElementById('publicProfileModal');
if (pubProfileModal) window.addSwipeClose(pubProfileModal, closePublicProfile);

// ==================== LEADERBOARD TOGGLE ====================
const lbToggleBtn = document.getElementById('leaderboardToggleBtn');
const lbCloseBtn = document.getElementById('closeLeaderboardBtn');
const lbWrapper = document.getElementById('leaderboardWrapper');

function closeLeaderboard() {
    if (lbWrapper) lbWrapper.classList.remove('show-modal');
    window.modalPop('leaderboard');
}

if (lbToggleBtn && lbWrapper) {
    lbToggleBtn.onclick = () => {
        lbWrapper.classList.add('show-modal');
        window.modalPush('leaderboard', closeLeaderboard);
    };
}
if (lbCloseBtn) lbCloseBtn.onclick = closeLeaderboard;
if (lbWrapper) window.addSwipeClose(lbWrapper, closeLeaderboard);
