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
            const coinsBadge = (a.coins > 0)
                ? `<span class="ann-reward-badge">🪙 ${a.coins} MC</span>` : '';
            return `
            <div class="achievement-tile${a.earned ? '' : ' locked'}">
                <div class="achievement-icon">${window.escHtml(a.icon || '🏆')}</div>
                <div class="achievement-info">
                    <div class="achievement-name">${window.escHtml(name)} ${coinsBadge}</div>
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

function closeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.add('hidden');
    window.modalPop('profile');
}

const profileModalEl = document.getElementById('profileModal');
if (profileModalEl) window.addSwipeClose(profileModalEl, closeProfileModal);

const profileTrigger = document.getElementById('profileTrigger');
if (profileTrigger) {
    profileTrigger.addEventListener('click', async () => {
        const modal = document.getElementById('profileModal');
        if (modal) modal.classList.remove('hidden');
        window.modalPush('profile', closeProfileModal);
        switchProfileTab('profSectionSettings');
        try {
            const profileUsernameEl = document.getElementById('profileUsername');
            if (profileUsernameEl) profileUsernameEl.textContent = window.currentUsername;
            const profileCoinsEl = document.getElementById('profileCoinsVal');
            if (profileCoinsEl) profileCoinsEl.textContent = window._myCoins || 0;
            const res = await fetch('/api/profile');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (document.getElementById('profEmail')) document.getElementById('profEmail').value = data.email || '';
            if (document.getElementById('profAvatar')) document.getElementById('profAvatar').value = data.avatar || '😶';
            if (document.getElementById('profNewPassword')) document.getElementById('profNewPassword').value = '';
            if (document.getElementById('profTheme')) document.getElementById('profTheme').value = data.theme || 'dark';
            if (document.getElementById('profLang')) document.getElementById('profLang').value = data.language || 'auto';
            if (document.getElementById('profGender')) document.getElementById('profGender').value = data.gender || '';
            if (window.t) {
                const lbl = document.getElementById('lbl_gender_label');
                if (lbl) lbl.textContent = window.t('lbl_gender');
                const optNone = document.getElementById('opt_gender_none');
                if (optNone) optNone.textContent = window.t('gender_not_specified');
                const optMale = document.getElementById('opt_gender_male');
                if (optMale) optMale.textContent = window.t('gender_male');
                const optFemale = document.getElementById('opt_gender_female');
                if (optFemale) optFemale.textContent = window.t('gender_female');
            }
            const chatDisabledEl = document.getElementById('profChatDisabled');
            if (chatDisabledEl) chatDisabledEl.checked = !!data.chatDisabled;
            setChatDisabledUI(data.chatDisabled);
            const statsContainer = document.getElementById('profStats');
            if (statsContainer) {
                if (data.topCards && data.topCards.length > 0) {
                    statsContainer.innerHTML = data.topCards.map(stat => {
                        let cardValue;
                        if (stat.category === 'unicode') {
                            cardValue = '🌐';
                        } else {
                            const icons = window.icons[stat.category];
                            cardValue = (icons && icons[stat.card_value - 1]) || '❓';
                        }
                        const isImage = typeof cardValue === 'string' && (cardValue.startsWith('/uploads/') || cardValue.startsWith('http://') || cardValue.startsWith('https://'));
                        const cardDisplay = isImage
                            ? `<img src="${window.escHtml(cardValue)}" class="stat-card-img" alt="">`
                            : window.escHtml(cardValue);
                        return `<div class="stat-tile"><div class="stat-emoji">${cardDisplay}</div><div class="stat-cat">${window.escHtml(stat.category)}</div><div class="stat-count">${window.escHtml(String(stat.max_matches))}</div></div>`;
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
        const genderVal = document.getElementById('profGender') ? document.getElementById('profGender').value : '';
        const res = await fetch('/api/profile', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: document.getElementById('profEmail') ? document.getElementById('profEmail').value : '',
                newPassword, avatar: avatarVal, theme: themeVal, language: langVal,
                chatDisabled: chatDisabledEl ? chatDisabledEl.checked : false,
                gender: genderVal
            })
        });
        const data = await res.json();
        if (data.success) {
            closeProfileModal();
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

if (document.getElementById('closeProfileBtn')) document.getElementById('closeProfileBtn').onclick = closeProfileModal;

function showPreGameOverlay(data) {
    const overlay = document.getElementById('preGameOverlay');
    if (!overlay) return;
    const players = data.room && data.room.players;
    if (!players || players.length < 2) return;
    const p1 = players[0], p2 = players[1];
    const stats = data.playerStats || {};
    const g = (id) => document.getElementById(id);
    if (g('preGameP1Avatar')) g('preGameP1Avatar').textContent = p1.avatar || '😶';
    if (g('preGameP1Name')) g('preGameP1Name').textContent = p1.name || '';
    const p1s = stats[String(p1.id)] || {};
    if (g('preGameP1Total')) g('preGameP1Total').textContent = p1s.total || 0;
    if (g('preGameP1WinRate')) g('preGameP1WinRate').textContent = (p1s.winRate || 0) + '%';
    if (g('preGameP2Avatar')) g('preGameP2Avatar').textContent = p2.avatar || '😶';
    if (g('preGameP2Name')) g('preGameP2Name').textContent = p2.name || '';
    const p2s = stats[String(p2.id)] || {};
    if (g('preGameP2Total')) g('preGameP2Total').textContent = p2s.total || 0;
    if (g('preGameP2WinRate')) g('preGameP2WinRate').textContent = (p2s.winRate || 0) + '%';
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => overlay.classList.add('pre-game-active'));
    setTimeout(() => {
        overlay.classList.add('pre-game-hiding');
        setTimeout(() => {
            overlay.classList.add('hidden');
            overlay.classList.remove('pre-game-active', 'pre-game-hiding');
        }, 500);
    }, 1500);
}

window.socket.on('gameStart', (data) => {
    document.getElementById('lobbyScreen').classList.add('hidden');
    document.getElementById('roomScreen').classList.add('hidden');
    document.getElementById('gameScreen').classList.remove('hidden');
    if (data && data.playerStats) showPreGameOverlay(data);
    if (typeof window.startGameLogic === 'function') window.startGameLogic(data);
});
