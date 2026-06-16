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
    loadAdminAnnouncements();
}

const refreshStatsBtn = document.getElementById('refreshStatsBtn');
if (refreshStatsBtn) refreshStatsBtn.onclick = loadServerStats;

const saveServerInfoBtn = document.getElementById('saveServerInfoBtn');
if (saveServerInfoBtn) {
    saveServerInfoBtn.addEventListener('click', async () => {
        const input = document.getElementById('adminServerInfoInput');
        const savedMsg = document.getElementById('serverInfoSavedMsg');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        try {
            saveServerInfoBtn.disabled = true;
            const res = await fetch('/api/admin/announcements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            if (!res.ok) throw new Error();
            input.value = '';
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
                item.innerHTML = `
                    <div class="admin-announce-text">${window.escHtml(ann.text)}</div>
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
                    const r = await fetch(`/api/admin/announcements/${ann.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: newText })
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
