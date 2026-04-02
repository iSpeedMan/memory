const tabCatsBtn = document.getElementById('tabCatsBtn');
const tabUsersBtn = document.getElementById('tabUsersBtn');
const adminCatsSection = document.getElementById('adminCatsSection');
const adminUsersSection = document.getElementById('adminUsersSection');

if (tabCatsBtn && tabUsersBtn) {
    tabCatsBtn.onclick = () => {
        tabCatsBtn.classList.replace('secondary', 'accent-purple');
        tabUsersBtn.classList.replace('accent-purple', 'secondary');
        adminCatsSection.classList.remove('hidden');
        adminUsersSection.classList.add('hidden');
    };
    tabUsersBtn.onclick = () => {
        tabUsersBtn.classList.replace('secondary', 'accent-purple');
        tabCatsBtn.classList.replace('accent-purple', 'secondary');
        adminUsersSection.classList.remove('hidden');
        adminCatsSection.classList.add('hidden');
        loadAdminUsers();
    };
}

if (document.getElementById('adminBtn')) {
    document.getElementById('adminBtn').onclick = () => document.getElementById('adminModal').classList.remove('hidden');
}

window.loadAdminCategories = function(categories) {
    const adminList = document.getElementById('adminCategoryList');
    if (!adminList || !window.isAdmin) return;
    
    adminList.innerHTML = '';
    categories.forEach(cat => {
        const translatedName = window.currentLang === 'en' ? cat.key_name.charAt(0).toUpperCase() + cat.key_name.slice(1) : cat.display_name;
        const displayTitle = `📁 ${translatedName}`;
        adminList.insertAdjacentHTML('beforeend', `
            <div class="metro-list-item">
                <div><b>${displayTitle}</b> <small class="text-dim">(${cat.key_name})</small></div>
                <div class="metro-btn-group">
                    <button class="metro-btn secondary" onclick="editCategory(${cat.id}, '${cat.key_name}', '${cat.display_name}', '${cat.emojis}')">✏️</button>
                    <button class="metro-btn danger" onclick="deleteCategory(${cat.id})">🗑️</button>
                </div>
            </div>
        `);
    });
};

window.editCategory = function(id, key, name, emojis) {
    document.getElementById('editCatId').value = id;
    document.getElementById('newCatKey').value = key;
    document.getElementById('newCatKey').disabled = true; 
    document.getElementById('newCatDisplay').value = name;
    document.getElementById('newCatEmojis').value = emojis;
    document.getElementById('cancelCatEditBtn').classList.remove('hidden');
};

window.deleteCategory = async function(id) {
    if(!confirm(window.t("delete_category"))) return; 
    const res = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
    if ((await res.json()).success && typeof window.loadCategories === 'function') window.loadCategories();
};

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
    if(!key_name || !display_name || !emojis) return;
    const res = await fetch(id ? `/api/admin/categories/${id}` : '/api/admin/categories', {
        method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_name, display_name, emojis })
    });
    if((await res.json()).success) { if (cancelCatEditBtn) cancelCatEditBtn.click(); if (typeof window.loadCategories === 'function') window.loadCategories(); }
};

async function loadAdminUsers() {
    const adminUsersList = document.getElementById('adminUsersList');
    if (!adminUsersList || !window.isAdmin) return;
    try {
        const res = await fetch('/api/admin/users');
        const users = await res.json();
        adminUsersList.innerHTML = users.map(u => `
            <div class="metro-list-item">
                <div>
                     <b>${u.username}</b> ${u.is_admin? `<span class="text-accent admin-badge">${window.t('set_admin')}</span>` : ''}
                    <br><small class="text-dim" data-i18n="not_email">${u.email || window.t('no_mail')}</small>
                </div>
                <div class="metro-btn-group">
                    <button class="metro-btn secondary" onclick="editUser(${u.id}, '${u.username}', '${u.email || ''}', ${u.is_admin})">✏️</button>
                    <button class="metro-btn danger" onclick="deleteUser(${u.id})">🗑️</button>
                </div>
            </div>
        `).join('');
    } catch(e) { console.error(e); }
}

window.editUser = function(id, username, email, is_admin) {
    document.getElementById('editUserId').value = id;
    document.getElementById('adminUsername').value = username;
    document.getElementById('adminEmail').value = email;
    document.getElementById('adminPassword').value = '';
    document.getElementById('adminPassword').placeholder = window.t("new_password");
    document.getElementById('adminIsAdmin').checked = is_admin == 1;
    document.getElementById('adminUserFormTitle').textContent = window.t("edit");
    document.getElementById('cancelUserEditBtn').classList.remove('hidden');
};

window.deleteUser = async function(id) {
    if(!confirm(window.t("delete_user_permanently"))) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) loadAdminUsers();
    else alert(data.error);
};

const cancelUserEditBtn = document.getElementById('cancelUserEditBtn');
if (cancelUserEditBtn) cancelUserEditBtn.onclick = () => {
    document.getElementById('editUserId').value = '';
    document.getElementById('adminUsername').value = '';
    document.getElementById('adminEmail').value = '';
    document.getElementById('adminPassword').value = '';
    document.getElementById('adminPassword').placeholder = window.t("ph_pass");
    document.getElementById('adminIsAdmin').checked = false;
    document.getElementById('adminUserFormTitle').textContent = window.t("ph_subtitle_add_newpass"); 
    cancelUserEditBtn.classList.add('hidden');
};

const saveUserBtn = document.getElementById('saveUserBtn');
if (saveUserBtn) saveUserBtn.onclick = async () => {
    const id = document.getElementById('editUserId').value;
    const username = document.getElementById('adminUsername').value.trim();
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const is_admin = document.getElementById('adminIsAdmin').checked;
    
    if(!username || (!id && !password)) return alert(window.t("login_and_password_are_required"));
    
    const res = await fetch(id ? `/api/admin/users/${id}` : '/api/admin/users', {
        method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, is_admin })
    });
    const data = await res.json();
    if(data.success) { if (cancelUserEditBtn) cancelUserEditBtn.click(); loadAdminUsers(); }
    else alert(data.error);
};