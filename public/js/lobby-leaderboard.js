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
        content.innerHTML = `
            <div class="pub-profile-header">
                <span class="pub-profile-avatar">${window.escHtml(data.avatar || '😶')}</span>
                <span class="pub-profile-username">${window.escHtml(data.username)}${genderIcon ? ` <span class="pub-profile-gender" title="${window.escHtml(genderLabel)}">${genderIcon}</span>` : ''}</span>
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
