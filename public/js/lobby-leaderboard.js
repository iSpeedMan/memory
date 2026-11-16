// ==================== LEADERBOARD ====================
const rankEmojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
let currentLeaderboardCategory = 'all';

function renderLeaderboard(data) {
    if (!leaderBox) return;
    let myRankEmoji = null;
    leaderBox.innerHTML = data.map((u, i) => {
        const emoji = rankEmojis[i] || `${i + 1}.`;
        if (u.username === window.currentUsername) myRankEmoji = emoji;
        const frameClass = ['frame-silver','frame-gold','frame-neon','frame-champion','frame-ember'].includes(u.frameClass) ? u.frameClass : '';
        const nameColor = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(u.nameColor || '') ? u.nameColor : '';
        const titleColor = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(u.titleColor || '') ? u.titleColor : '';
        const title = u.titleLabel
            ? `<small class="leaderboard-player-title" style="${titleColor ? `color:${titleColor}` : ''}">${window.escHtml(u.titleLabel)}</small>`
            : '';
        return `<div class="metro-list-item leaderboard-entry" data-username="${window.escHtml(u.username)}">
            <span class="leaderboard-player"><span class="leaderboard-rank">${emoji}</span><span class="leaderboard-player-avatar ${frameClass}">${window.escHtml(u.avatar || '😶')}</span><span class="leaderboard-player-name" style="${nameColor ? `color:${nameColor}` : ''}">${window.escHtml(u.username)}${title}</span></span>
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
        case 'frame-ember':    return 'box-shadow:0 0 0 3px #f97316,0 0 16px rgba(249,115,22,0.75);border-radius:6px;';
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
        const nameColor = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cos.name_color?.color || '') ? cos.name_color.color : '';
        const showTitle = titleData?.label && titleData?.css_class && titleData.css_class !== 'shop-title-none';
        const titleHtml = showTitle
            ? `<span class="shop-title-badge ${window.escHtml(titleData.css_class)}" style="color:${/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(titleData.color || '') ? titleData.color : '#fff'}">${window.escHtml(titleData.label)}</span>`
            : '';

        content.innerHTML = `
            <div class="pub-profile-header">
                <span class="pub-profile-avatar" style="${frameStyle}">${window.escHtml(data.avatar || '😶')}</span>
                <div class="pub-profile-name-col">
                <span class="pub-profile-username" style="${nameColor ? `color:${nameColor}` : ''}">${window.escHtml(data.username)}${genderIcon ? ` <span class="pub-profile-gender" title="${window.escHtml(genderLabel)}">${genderIcon}</span>` : ''}</span>
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
