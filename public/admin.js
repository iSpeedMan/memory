const tabCatsBtn = document.getElementById('tabCatsBtn');
const tabUsersBtn = document.getElementById('tabUsersBtn');
const tabStatsBtn = document.getElementById('tabStatsBtn');
const adminCatsSection = document.getElementById('adminCatsSection');
const adminUsersSection = document.getElementById('adminUsersSection');
const adminStatsSection = document.getElementById('adminStatsSection');

function setAdminTab(active) {
    const tabs = [
        { btn: tabCatsBtn, sec: adminCatsSection },
        { btn: tabUsersBtn, sec: adminUsersSection },
        { btn: tabStatsBtn, sec: adminStatsSection }
    ];
    tabs.forEach(({ btn, sec }) => {
        if (!btn || !sec) return;
        if (btn === active.btn) {
            btn.classList.replace('secondary', 'accent-purple');
            sec.classList.remove('hidden');
        } else {
            btn.classList.replace('accent-purple', 'secondary');
            sec.classList.add('hidden');
        }
    });
}

if (tabCatsBtn) tabCatsBtn.onclick = () => setAdminTab({ btn: tabCatsBtn, sec: adminCatsSection });
if (tabUsersBtn) tabUsersBtn.onclick = () => {
    setAdminTab({ btn: tabUsersBtn, sec: adminUsersSection });
    loadAdminUsers();
};
if (tabStatsBtn) tabStatsBtn.onclick = () => {
    setAdminTab({ btn: tabStatsBtn, sec: adminStatsSection });
    loadServerStats();
};

if (document.getElementById('adminBtn')) {
    document.getElementById('adminBtn').onclick = () => document.getElementById('adminModal').classList.remove('hidden');
}

// ==================== СТАТИСТИКА СЕРВЕРА ====================
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

// ==================== КАТЕГОРИИ ====================
let categoriesData = [];
let usersData = [];

window.loadAdminCategories = function(categories) {
    const adminList = document.getElementById('adminCategoryList');
    if (!adminList || !window.isAdmin) return;
    
    categoriesData = categories;
    adminList.innerHTML = '';
    
    categories.forEach((cat, idx) => {
        const translatedName = window.currentLang === 'en' ? cat.key_name.charAt(0).toUpperCase() + cat.key_name.slice(1) : cat.display_name;
        const item = document.createElement('div');
        item.className = 'metro-list-item';
        item.innerHTML = `
            <div><b>📁 ${window.escHtml(translatedName)}</b> <small class="text-dim">(${window.escHtml(cat.key_name)})</small></div>
            <div class="metro-btn-group">
                <button class="metro-btn secondary" data-cat-edit="${idx}">✏️</button>
                <button class="metro-btn danger" data-cat-delete="${cat.id}">🗑️</button>
            </div>
        `;
        adminList.appendChild(item);
    });
    
    adminList.onclick = (e) => {
        const editBtn = e.target.closest('[data-cat-edit]');
        const deleteBtn = e.target.closest('[data-cat-delete]');
        if (editBtn) {
            const cat = categoriesData[Number(editBtn.dataset.catEdit)];
            if (cat) editCategory(cat.id, cat.key_name, cat.display_name, cat.emojis);
        }
        if (deleteBtn) deleteCategory(Number(deleteBtn.dataset.catDelete));
    };
};

function editCategory(id, key, name, emojis) {
    document.getElementById('editCatId').value = id;
    document.getElementById('newCatKey').value = key;
    document.getElementById('newCatKey').disabled = true;
    document.getElementById('newCatDisplay').value = name;
    document.getElementById('newCatEmojis').value = emojis;
    document.getElementById('cancelCatEditBtn').classList.remove('hidden');
}

async function deleteCategory(id) {
    if (!confirm(window.t('delete_category'))) return;
    const res = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
    if ((await res.json()).success && typeof window.loadCategories === 'function') window.loadCategories();
}

const cancelCatEditBtn = document.getElementById('cancelCatEditBtn');
if (cancelCatEditBtn) cancelCatEditBtn.onclick = () => {
    document.getElementById('editCatId').value = '';
    document.getElementById('newCatKey').value = '';
    document.getElementById('newCatKey').disabled = false;
    document.getElementById('newCatDisplay').value = '';
    document.getElementById('newCatEmojis').value = '';
    cancelCatEditBtn.classList.add('hidden');
};

const saveCatBtn = document.getElementById('saveCategoryBtn');
if (saveCatBtn) saveCatBtn.onclick = async () => {
    const id = document.getElementById('editCatId').value;
    const key_name = document.getElementById('newCatKey').value.trim();
    const display_name = document.getElementById('newCatDisplay').value.trim();
    const emojis = document.getElementById('newCatEmojis').value.trim();
    if (!key_name || !display_name || !emojis) return;
    const res = await fetch(id ? `/api/admin/categories/${id}` : '/api/admin/categories', {
        method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_name, display_name, emojis })
    });
    if ((await res.json()).success) {
        if (cancelCatEditBtn) cancelCatEditBtn.click();
        if (typeof window.loadCategories === 'function') window.loadCategories();
    }
};

// ==================== ПОЛЬЗОВАТЕЛИ ====================
async function loadAdminUsers() {
    const adminUsersList = document.getElementById('adminUsersList');
    if (!adminUsersList || !window.isAdmin) return;
    try {
        const res = await fetch('/api/admin/users');
        usersData = await res.json();
        adminUsersList.innerHTML = '';
        usersData.forEach((u, idx) => {
            const item = document.createElement('div');
            item.className = 'metro-list-item';
            item.innerHTML = `
                <div>
                    <b>${window.escHtml(u.username)}</b> ${u.is_admin ? `<span class="text-accent admin-badge">${window.t('set_admin')}</span>` : ''}
                    <br><small class="text-dim">${window.escHtml(u.email || window.t('no_mail'))}</small>
                </div>
                <div class="metro-btn-group">
                    <button class="metro-btn secondary" data-user-edit="${idx}">✏️</button>
                    <button class="metro-btn danger" data-user-delete="${u.id}">🗑️</button>
                </div>
            `;
            adminUsersList.appendChild(item);
        });
        adminUsersList.onclick = (e) => {
            const editBtn = e.target.closest('[data-user-edit]');
            const deleteBtn = e.target.closest('[data-user-delete]');
            if (editBtn) {
                const u = usersData[Number(editBtn.dataset.userEdit)];
                if (u) editUser(u.id, u.username, u.email || '', u.is_admin);
            }
            if (deleteBtn) deleteUser(Number(deleteBtn.dataset.userDelete));
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
