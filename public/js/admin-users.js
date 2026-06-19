let usersData = [];

async function loadAdminUsers() {
    const adminUsersList = document.getElementById('adminUsersList');
    if (!adminUsersList || !window.isAdmin) return;
    try {
        const res = await fetch('/api/admin/users');
        usersData = await res.json();
        adminUsersList.innerHTML = '';
        usersData.forEach((u, idx) => {
            const now = Date.now();
            const isMuted = u.chat_muted_until && u.chat_muted_until > now;
            const mutedLabel = isMuted ? `<span class="chat-muted-label">${window.t('chat_muted_badge')}</span>` : '';
            const muteBtn = isMuted
                ? `<button class="metro-btn accent-orange" data-user-unmute="${u.id}" title="${window.t('unmute_chat')}">🔓</button>`
                : `<button class="metro-btn secondary" data-user-mute="${u.id}" title="${window.t('mute_chat')}">🔇</button>`;
            const item = document.createElement('div');
            item.className = 'metro-list-item admin-user-item';
            item.dataset.userId = u.id;
            item.innerHTML = `
                <div>
                    <b>${window.escHtml(u.username)}</b> ${u.is_admin ? `<span class="text-accent admin-badge">${window.t('set_admin')}</span>` : ''} ${mutedLabel}
                    <br><small class="text-dim">${window.escHtml(u.email || window.t('no_mail'))} · ${window.t('admin_coins_label')} <span class="user-coins-val">${u.coins || 0}</span></small>
                </div>
                <div class="metro-btn-group">
                    ${muteBtn}
                    <button class="metro-btn secondary" data-user-edit="${idx}">✏️</button>
                    <button class="metro-btn danger" data-user-delete="${u.id}">🗑️</button>
                    <button class="metro-btn accent-orange admin-coins-btn" data-user-id="${u.id}" title="${window.t('admin_coins_award_btn')}">🪙</button>
                </div>
                <div class="admin-coins-form hidden" data-coins-form="${u.id}">
                    <input type="number" class="metro-input admin-coins-input" placeholder="${window.t('admin_coins_amount_ph')}">
                    <button class="metro-btn accent-orange admin-coins-submit" data-user-id="${u.id}">${window.t('admin_coins_award_btn')}</button>
                </div>
            `;
            adminUsersList.appendChild(item);
        });
        adminUsersList.onclick = async (e) => {
            const editBtn = e.target.closest('[data-user-edit]');
            const deleteBtn = e.target.closest('[data-user-delete]');
            const muteBtn = e.target.closest('[data-user-mute]');
            const unmuteBtn = e.target.closest('[data-user-unmute]');
            const coinsBtn = e.target.closest('.admin-coins-btn');
            const coinsSubmit = e.target.closest('.admin-coins-submit');
            if (editBtn) {
                const u = usersData[Number(editBtn.dataset.userEdit)];
                if (u) editUser(u.id, u.username, u.email || '', u.is_admin);
            }
            if (deleteBtn) deleteUser(Number(deleteBtn.dataset.userDelete));
            if (muteBtn) {
                await fetch(`/api/admin/users/${muteBtn.dataset.userMute}/mute-chat`, { method: 'POST' });
                loadAdminUsers();
            }
            if (unmuteBtn) {
                await fetch(`/api/admin/users/${unmuteBtn.dataset.userUnmute}/unmute-chat`, { method: 'POST' });
                loadAdminUsers();
            }
            if (coinsBtn) {
                const uid = coinsBtn.dataset.userId;
                const form = adminUsersList.querySelector(`[data-coins-form="${uid}"]`);
                if (form) form.classList.toggle('hidden');
            }
            if (coinsSubmit) {
                const uid = coinsSubmit.dataset.userId;
                const item = adminUsersList.querySelector(`.admin-user-item[data-user-id="${uid}"]`);
                const input = item && item.querySelector('.admin-coins-input');
                if (!input) return;
                const amount = parseInt(input.value, 10);
                if (!Number.isFinite(amount) || amount === 0) { input.focus(); return; }
                try {
                    const res = await fetch(`/api/admin/coins/award/${uid}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ amount })
                    });
                    const data = await res.json();
                    if (data.success) {
                        const coinsEl = item && item.querySelector('.user-coins-val');
                        if (coinsEl) coinsEl.textContent = data.newBalance;
                        input.value = '';
                        const form = adminUsersList.querySelector(`[data-coins-form="${uid}"]`);
                        if (form) form.classList.add('hidden');
                    } else {
                        alert(data.error || 'Error');
                    }
                } catch (e) { alert('Error'); }
            }
        };
    } catch(e) { console.error(e); }
}

function editUser(id, username, email, is_admin) {
    document.getElementById('editUserId').value = id;
    document.getElementById('adminUsername').value = username;
    document.getElementById('adminEmail').value = email;
    document.getElementById('adminPassword').value = '';
    document.getElementById('adminPassword').placeholder = window.t('new_password');
    document.getElementById('adminIsAdmin').checked = is_admin == 1;
    document.getElementById('adminUserFormTitle').textContent = window.t('edit');
    document.getElementById('cancelUserEditBtn').classList.remove('hidden');
}

async function deleteUser(id) {
    if (!confirm(window.t('delete_user_permanently'))) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) loadAdminUsers();
    else alert(data.error);
}

const cancelUserEditBtn = document.getElementById('cancelUserEditBtn');
if (cancelUserEditBtn) cancelUserEditBtn.onclick = () => {
    document.getElementById('editUserId').value = '';
    document.getElementById('adminUsername').value = '';
    document.getElementById('adminEmail').value = '';
    document.getElementById('adminPassword').value = '';
    document.getElementById('adminPassword').placeholder = window.t('ph_pass');
    document.getElementById('adminIsAdmin').checked = false;
    document.getElementById('adminUserFormTitle').textContent = window.t('subtitle_add_new');
    cancelUserEditBtn.classList.add('hidden');
};

const saveUserBtn = document.getElementById('saveUserBtn');
if (saveUserBtn) saveUserBtn.onclick = async () => {
    const id = document.getElementById('editUserId').value;
    const username = document.getElementById('adminUsername').value.trim();
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const is_admin = document.getElementById('adminIsAdmin').checked;
    if (!username || (!id && !password)) return alert(window.t('login_and_password_are_required'));
    const res = await fetch(id ? `/api/admin/users/${id}` : '/api/admin/users', {
        method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, is_admin })
    });
    const data = await res.json();
    if (data.success) { if (cancelUserEditBtn) cancelUserEditBtn.click(); loadAdminUsers(); }
    else alert(data.error);
};
