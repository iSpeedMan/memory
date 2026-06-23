function switchAdminStatsTab(tabId) {
    document.querySelectorAll('.admin-stat-pane').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.admin-stat-tab').forEach(b => {
        b.classList.remove('accent-purple');
        b.classList.add('secondary');
    });
    const pane = document.getElementById(tabId);
    if (pane) pane.classList.remove('hidden');
    const btn = document.querySelector(`.admin-stat-tab[data-tab="${tabId}"]`);
    if (btn) { btn.classList.remove('secondary'); btn.classList.add('accent-purple'); }

    if (tabId === 'hintsPane' || tabId === 'gameRewardsPane') loadHintSettings();
    if (tabId === 'achievementsPane') loadAchievementRewards();
    if (tabId === 'announcementsPane') loadAdminAnnouncements();
}

document.querySelectorAll('.admin-stat-tab').forEach(btn => {
    btn.addEventListener('click', () => switchAdminStatsTab(btn.dataset.tab));
});

async function loadHintSettings() {
    try {
        const res = await fetch('/api/admin/hint-settings');
        if (!res.ok) return;
        const cfg = await res.json();
        const fields = ['hint_limit', 'hint_cost_reveal_one', 'hint_cost_reveal_pair', 'hint_cost_extra_turn', 'win_coins_base', 'suggest_cat_cost'];
        fields.forEach(key => {
            const el = document.getElementById('adminHint_' + key);
            if (el) el.value = cfg[key] ?? '';
        });
    } catch (_) {}
}

const saveHintSettingsBtn = document.getElementById('saveHintSettingsBtn');
if (saveHintSettingsBtn) {
    saveHintSettingsBtn.addEventListener('click', async () => {
        const fields = ['hint_limit', 'hint_cost_reveal_one', 'hint_cost_reveal_pair', 'hint_cost_extra_turn'];
        const body = {};
        fields.forEach(key => {
            const el = document.getElementById('adminHint_' + key);
            if (el) body[key] = parseInt(el.value, 10) || 0;
        });
        try {
            saveHintSettingsBtn.disabled = true;
            const res = await fetch('/api/admin/hint-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!res.ok) throw new Error();
            const savedMsg = document.getElementById('hintSettingsSavedMsg');
            if (savedMsg) {
                savedMsg.classList.remove('hidden');
                setTimeout(() => savedMsg.classList.add('hidden'), 2500);
            }
        } catch (e) {
            if (typeof window.showToast === 'function') window.showToast('Error saving');
        } finally {
            saveHintSettingsBtn.disabled = false;
        }
    });
}

const saveGameRewardsBtn = document.getElementById('saveGameRewardsBtn');
if (saveGameRewardsBtn) {
    saveGameRewardsBtn.addEventListener('click', async () => {
        const body = {};
        ['win_coins_base', 'suggest_cat_cost'].forEach(key => {
            const el = document.getElementById('adminHint_' + key);
            if (el) body[key] = parseInt(el.value, 10) || 0;
        });
        try {
            saveGameRewardsBtn.disabled = true;
            const res = await fetch('/api/admin/hint-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!res.ok) throw new Error();
            const savedMsg = document.getElementById('gameRewardsSavedMsg');
            if (savedMsg) {
                savedMsg.classList.remove('hidden');
                setTimeout(() => savedMsg.classList.add('hidden'), 2500);
            }
        } catch (e) {
            if (typeof window.showToast === 'function') window.showToast('Error saving');
        } finally {
            saveGameRewardsBtn.disabled = false;
        }
    });
}

async function loadAchievementRewards() {
    const grid = document.getElementById('achievementRewardsGrid');
    if (!grid) return;
    try {
        const res = await fetch('/api/admin/achievement-rewards');
        if (!res.ok) return;
        const list = await res.json();
        const lang = window.currentLang === 'ru' ? 'ru' : 'en';
        grid.innerHTML = list.map(a => {
            const name = a[`name_${lang}`] || a.name_en || a.key;
            return `
                <label class="metro-label">${window.escHtml(a.icon || '')} ${window.escHtml(name)}</label>
                <input type="number" class="metro-input hint-num-input" data-ach-key="${window.escHtml(a.key)}" min="0" max="9999" value="${a.coins}">
            `;
        }).join('');
    } catch (_) {}
}

const saveAchievementRewardsBtn = document.getElementById('saveAchievementRewardsBtn');
if (saveAchievementRewardsBtn) {
    saveAchievementRewardsBtn.addEventListener('click', async () => {
        const inputs = document.querySelectorAll('#achievementRewardsGrid [data-ach-key]');
        const body = {};
        inputs.forEach(inp => { body[inp.dataset.achKey] = parseInt(inp.value, 10) || 0; });
        try {
            saveAchievementRewardsBtn.disabled = true;
            const res = await fetch('/api/admin/achievement-rewards', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error();
            const savedMsg = document.getElementById('achievementRewardsSavedMsg');
            if (savedMsg) {
                savedMsg.classList.remove('hidden');
                setTimeout(() => savedMsg.classList.add('hidden'), 2500);
            }
        } catch (e) {
            if (typeof window.showToast === 'function') window.showToast('Error saving');
        } finally {
            saveAchievementRewardsBtn.disabled = false;
        }
    });
}

async function loadServerStats() {
    const grid = document.getElementById('serverStatsGrid');
    if (!grid) return;
    grid.innerHTML = `<div class="stat-tile"><div class="stat-count">...</div></div>`;
    try {
        const res = await fetch('/api/admin/stats');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const s = await res.json();
        const items = [
            { label: window.t('stat_online'), value: s.onlineUsers, icon: '🟢' },
            { label: window.t('stat_active_games'), value: s.activeGames, icon: '🎮' },
            { label: window.t('stat_waiting_rooms'), value: s.waitingRooms, icon: '⏳' },
            { label: window.t('stat_games_today'), value: s.gamesToday, icon: '📅' },
            { label: window.t('stat_total_users'), value: s.totalUsers, icon: '👥' },
            { label: window.t('stat_total_games'), value: s.totalGames, icon: '🏆' }
        ];
        grid.innerHTML = items.map(item => `
            <div class="stat-tile">
                <div class="stat-emoji">${item.icon}</div>
                <div class="stat-count">${item.value}</div>
                <div class="stat-cat">${window.escHtml(item.label)}</div>
            </div>
        `).join('');
    } catch (e) {
        grid.innerHTML = `<div class="metro-list-item text-dim">${window.t('database_error')}</div>`;
    }
}

const refreshStatsBtn = document.getElementById('refreshStatsBtn');
if (refreshStatsBtn) refreshStatsBtn.onclick = loadServerStats;

const saveServerInfoBtn = document.getElementById('saveServerInfoBtn');
if (saveServerInfoBtn) {
    saveServerInfoBtn.addEventListener('click', async () => {
        const input = document.getElementById('adminServerInfoInput');
        const rewardInput = document.getElementById('adminAnnounceReward');
        const savedMsg = document.getElementById('serverInfoSavedMsg');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        const coins_reward = parseInt(rewardInput?.value, 10) || 0;
        try {
            saveServerInfoBtn.disabled = true;
            const res = await fetch('/api/admin/announcements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, coins_reward })
            });
            if (!res.ok) throw new Error();
            input.value = '';
            if (rewardInput) rewardInput.value = '';
            if (savedMsg) {
                savedMsg.classList.remove('hidden');
                setTimeout(() => savedMsg.classList.add('hidden'), 2500);
            }
            loadAdminAnnouncements();
        } catch (e) {
            if (typeof window.showToast === 'function') window.showToast('Error saving');
        } finally {
            saveServerInfoBtn.disabled = false;
        }
    });
}

async function loadAdminAnnouncements() {
    const list = document.getElementById('adminAnnouncementsList');
    if (!list) return;
    try {
        const res = await fetch('/api/admin/announcements');
        if (!res.ok) throw new Error();
        const data = await res.json();
        const items = data.announcements || [];
        if (!items.length) {
            list.innerHTML = `<div class="metro-list-item text-dim">${window.t('admin_announce_empty')}</div>`;
            return;
        }
        list.innerHTML = '';
        items.forEach(ann => {
            const postedDate = new Date(ann.created_at).toLocaleString();
            const editedDate = ann.updated_at !== ann.created_at ? new Date(ann.updated_at).toLocaleString() : null;

            const item = document.createElement('div');
            item.className = 'metro-list-item admin-announce-item';
            item.dataset.announceId = ann.id;

            function renderView() {
                const rewardBadge = ann.coins_reward > 0
                    ? `<span class="ann-reward-badge">🪙 ${ann.coins_reward} MC</span>` : '';
                item.innerHTML = `
                    <div class="admin-announce-text">${window.escHtml(ann.text)} ${rewardBadge}</div>
                    <div class="admin-announce-meta text-dim">
                        <small>${window.t('announce_posted_at')}: ${postedDate}${editedDate ? ` · ${window.t('announce_edited_at')}: ${editedDate}` : ''}</small>
                    </div>
                    <div class="metro-btn-group mt-xs">
                        <button class="metro-btn secondary btn-sm ann-edit-btn">${window.t('admin_announce_edit')}</button>
                        <button class="metro-btn danger btn-sm ann-delete-btn">${window.t('admin_announce_delete')}</button>
                    </div>`;

                item.querySelector('.ann-edit-btn').addEventListener('click', () => renderEdit());
                item.querySelector('.ann-delete-btn').addEventListener('click', async () => {
                    const confirmEl = item.querySelector('.ann-delete-confirm');
                    if (!confirmEl) {
                        const btnGrp = item.querySelector('.metro-btn-group');
                        const conf = document.createElement('div');
                        conf.className = 'ann-delete-confirm metro-btn-group mt-xs';
                        conf.innerHTML = `
                            <span class="text-dim ann-confirm-label">${window.t('admin_announce_delete_confirm') || 'Delete?'}</span>
                            <button class="metro-btn danger btn-sm ann-confirm-yes">✓ OK</button>
                            <button class="metro-btn secondary btn-sm ann-confirm-no">${window.t('btn_cancel') || 'Cancel'}</button>`;
                        btnGrp.after(conf);
                        conf.querySelector('.ann-confirm-yes').addEventListener('click', async () => {
                            const r = await fetch(`/api/admin/announcements/${ann.id}`, { method: 'DELETE' });
                            if (r.ok) loadAdminAnnouncements();
                        });
                        conf.querySelector('.ann-confirm-no').addEventListener('click', () => conf.remove());
                    } else {
                        confirmEl.remove();
                    }
                });
            }

            function renderEdit() {
                item.innerHTML = `
                    <textarea class="metro-input ann-edit-textarea" rows="3" maxlength="2000">${window.escHtml(ann.text)}</textarea>
                    <label class="metro-label mt-xs">${window.t('admin_announce_reward') || 'Memcoin reward:'}</label>
                    <input type="number" class="metro-input ann-edit-reward hint-reward-input" value="${ann.coins_reward || 0}" min="0" max="9999">
                    <div class="metro-btn-group mt-xs">
                        <button class="metro-btn accent-purple btn-sm ann-save-btn">${window.t('btn_save') || 'Save'}</button>
                        <button class="metro-btn secondary btn-sm ann-cancel-btn">${window.t('btn_cancel') || 'Cancel'}</button>
                    </div>`;

                const ta = item.querySelector('.ann-edit-textarea');
                ta.focus();
                ta.setSelectionRange(ta.value.length, ta.value.length);

                item.querySelector('.ann-save-btn').addEventListener('click', async () => {
                    const newText = ta.value.trim();
                    if (!newText) return;
                    const coins_reward = parseInt(item.querySelector('.ann-edit-reward')?.value, 10) || 0;
                    const r = await fetch(`/api/admin/announcements/${ann.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: newText, coins_reward })
                    });
                    if (r.ok) loadAdminAnnouncements();
                });
                item.querySelector('.ann-cancel-btn').addEventListener('click', () => renderView());
            }

            renderView();
            list.appendChild(item);
        });
    } catch (e) {
        if (list) list.innerHTML = `<div class="metro-list-item text-dim">${window.t('database_error')}</div>`;
    }
}
