const tabCatsBtn = document.getElementById('tabCatsBtn');
const tabUsersBtn = document.getElementById('tabUsersBtn');
const tabStatsBtn = document.getElementById('tabStatsBtn');
const tabCustomCatsBtn = document.getElementById('tabCustomCatsBtn');
const adminCatsSection = document.getElementById('adminCatsSection');
const adminUsersSection = document.getElementById('adminUsersSection');
const adminStatsSection = document.getElementById('adminStatsSection');
const adminCustomCatsSection = document.getElementById('adminCustomCatsSection');

function setAdminTab(active) {
    const tabs = [
        { btn: tabCatsBtn, sec: adminCatsSection },
        { btn: tabUsersBtn, sec: adminUsersSection },
        { btn: tabStatsBtn, sec: adminStatsSection },
        { btn: tabCustomCatsBtn, sec: adminCustomCatsSection }
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
if (tabCustomCatsBtn) tabCustomCatsBtn.onclick = () => {
    setAdminTab({ btn: tabCustomCatsBtn, sec: adminCustomCatsSection });
    loadCustomCats();
};

const _adminModal = document.getElementById('adminModal');

function closeAdminModal() {
    if (_adminModal) _adminModal.classList.add('hidden');
    window.modalPop('admin');
}

if (document.getElementById('adminBtn')) {
    document.getElementById('adminBtn').onclick = () => {
        if (_adminModal) _adminModal.classList.remove('hidden');
        window.modalPush('admin', closeAdminModal);
        loadPendingCatsBadge();
    };
}
if (document.getElementById('closeAdminModalBtn')) {
    document.getElementById('closeAdminModalBtn').onclick = closeAdminModal;
}
if (_adminModal) window.addSwipeClose(_adminModal, closeAdminModal);

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
                            <button class="metro-btn danger btn-sm ann-confirm-yes">${window.t('btn_close') ? '✓' : '✓'} OK</button>
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

// ==================== КАТЕГОРИИ ====================
let categoriesData = [];
let usersData = [];

window.loadAdminCategories = function(categories) {
    const adminList = document.getElementById('adminCategoryList');
    if (!adminList || !window.isAdmin) return;
    categoriesData = categories;
    adminList.innerHTML = '';
    categories.forEach((cat, idx) => {
        if (cat.key_name === 'unicode') return;
        const translatedName = window.currentLang === 'en' ? cat.key_name.charAt(0).toUpperCase() + cat.key_name.slice(1) : cat.display_name;
        const emojisArray = (cat.emojis || '').split(',');
        const rawFirst = emojisArray[Math.floor(Math.random() * emojisArray.length)];
        const isImgCat = rawFirst && (rawFirst.startsWith('/uploads/') || rawFirst.startsWith('http'));
        const catIcon = isImgCat ? (cat.repr_emoji || '🖼️') : rawFirst;
        const item = document.createElement('div');
        item.className = 'metro-list-item';
        item.innerHTML = `
            <div><b>${catIcon} ${window.escHtml(translatedName)}</b> <small class="text-dim">(${window.escHtml(cat.key_name)})</small></div>
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

// ==================== ADMIN CAT FORM TABS ====================
let adminCatMode = 'emoji';
let adminIsEditingImageCat = false;
let editImageState = []; // { id, serverPath, previewUrl, file }
let replaceTargetId = null;

function genEditId() { return '_' + Math.random().toString(36).slice(2); }

async function fileToDataUrl(file) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
    });
}

function renderEditImageGrid() {
    const grid = document.getElementById('adminCatExistingGrid');
    const countEl = document.getElementById('adminCatEditCount');
    if (!grid) return;
    grid.innerHTML = '';
    editImageState.forEach(item => {
        const tile = document.createElement('div');
        tile.className = 'cat-edit-tile';
        tile.innerHTML = `
            <img src="${window.escHtml(item.previewUrl)}" class="cat-edit-tile-img" alt="">
            <div class="cat-edit-tile-overlay">
                <button type="button" class="cat-tile-btn cat-tile-replace" data-edit-id="${item.id}" title="${window.currentLang === 'ru' ? 'Заменить' : 'Replace'}">↺</button>
                <button type="button" class="cat-tile-btn cat-tile-delete" data-edit-id="${item.id}" title="${window.currentLang === 'ru' ? 'Удалить' : 'Delete'}">×</button>
            </div>`;
        grid.appendChild(tile);
    });
    if (countEl) {
        const n = editImageState.length;
        const ok = n >= 9 && n <= 32;
        countEl.textContent = window.currentLang === 'ru'
            ? `Изображений: ${n} (мин. 9, макс. 32)`
            : `Images: ${n} (min 9, max 32)`;
        countEl.style.color = ok ? 'var(--metro-accent)' : 'var(--color-error, #e74c3c)';
    }
}

function setAdminCatTab(mode) {
    adminCatMode = mode;
    const emojiTab = document.getElementById('adminCatTabEmoji');
    const imageTab = document.getElementById('adminCatTabImage');
    const emojiFields = document.getElementById('adminCatEmojiFields');
    const imageFields = document.getElementById('adminCatImageFields');
    if (mode === 'image') {
        if (emojiTab) { emojiTab.classList.remove('accent-purple'); emojiTab.classList.add('secondary'); }
        if (imageTab) { imageTab.classList.remove('secondary'); imageTab.classList.add('accent-purple'); }
        if (emojiFields) emojiFields.classList.add('hidden');
        if (imageFields) imageFields.classList.remove('hidden');
    } else {
        if (emojiTab) { emojiTab.classList.remove('secondary'); emojiTab.classList.add('accent-purple'); }
        if (imageTab) { imageTab.classList.remove('accent-purple'); imageTab.classList.add('secondary'); }
        if (emojiFields) emojiFields.classList.remove('hidden');
        if (imageFields) imageFields.classList.add('hidden');
    }
}

const adminCatTabEmoji = document.getElementById('adminCatTabEmoji');
const adminCatTabImage = document.getElementById('adminCatTabImage');
if (adminCatTabEmoji) adminCatTabEmoji.onclick = () => setAdminCatTab('emoji');
if (adminCatTabImage) adminCatTabImage.onclick = () => setAdminCatTab('image');

let adminCatFilePicker = null;
if (document.getElementById('adminCatFileZone')) {
    adminCatFilePicker = window.initFilePickerZone({ zoneId: 'adminCatFileZone', inputId: 'adminCatImages', min: 9, max: 32 });
}

// Grid click: delete or replace tile
const adminEditGrid = document.getElementById('adminCatExistingGrid');
if (adminEditGrid) {
    adminEditGrid.addEventListener('click', e => {
        const delBtn = e.target.closest('.cat-tile-delete');
        const repBtn = e.target.closest('.cat-tile-replace');
        if (delBtn) {
            const eid = delBtn.dataset.editId;
            editImageState = editImageState.filter(i => i.id !== eid);
            renderEditImageGrid();
        }
        if (repBtn) {
            replaceTargetId = repBtn.dataset.editId;
            const inp = document.getElementById('adminCatReplaceInput');
            if (inp) { inp.value = ''; inp.click(); }
        }
    });
}

// Replace single image via hidden input
const adminCatReplaceInput = document.getElementById('adminCatReplaceInput');
if (adminCatReplaceInput) {
    adminCatReplaceInput.addEventListener('change', async () => {
        if (!adminCatReplaceInput.files.length || !replaceTargetId) return;
        const f = adminCatReplaceInput.files[0];
        const compressed = window.compressImage ? await window.compressImage(f) : f;
        const dataUrl = await fileToDataUrl(compressed);
        const idx = editImageState.findIndex(i => i.id === replaceTargetId);
        if (idx >= 0) {
            editImageState[idx] = { ...editImageState[idx], previewUrl: dataUrl || editImageState[idx].previewUrl, file: compressed, serverPath: null };
        }
        replaceTargetId = null;
        renderEditImageGrid();
    });
}

// Add more images
const adminCatAddImagesBtn = document.getElementById('adminCatAddImagesBtn');
const adminCatAddInput = document.getElementById('adminCatAddInput');
if (adminCatAddImagesBtn) {
    adminCatAddImagesBtn.addEventListener('click', () => {
        if (adminCatAddInput) { adminCatAddInput.value = ''; adminCatAddInput.click(); }
    });
}
if (adminCatAddInput) {
    adminCatAddInput.addEventListener('change', async () => {
        if (!adminCatAddInput.files.length) return;
        const files = Array.from(adminCatAddInput.files);
        for (const f of files) {
            const compressed = window.compressImage ? await window.compressImage(f) : f;
            const dataUrl = await fileToDataUrl(compressed);
            editImageState.push({ id: genEditId(), serverPath: null, previewUrl: dataUrl, file: compressed });
        }
        renderEditImageGrid();
    });
}

function editCategory(id, key, name, emojis) {
    document.getElementById('editCatId').value = id;
    document.getElementById('newCatKey').value = key;
    document.getElementById('newCatKey').disabled = true;
    document.getElementById('newCatDisplay').value = name;
    const tabsEl = document.getElementById('adminCatTypeTabs');
    if (tabsEl) tabsEl.classList.add('hidden');

    const paths = (emojis || '').split(',').map(p => p.trim()).filter(Boolean);
    const isImgCat = paths.length > 0 && (paths[0].startsWith('/uploads/') || paths[0].startsWith('http'));

    // Reset existing images panel
    const existingPanel = document.getElementById('adminCatExistingImages');
    const existingGrid = document.getElementById('adminCatExistingGrid');
    const fileZoneWrap = document.getElementById('adminCatFileZoneWrap');

    if (isImgCat) {
        adminIsEditingImageCat = true;
        setAdminCatTab('image');
        // Init interactive state from existing paths
        editImageState = paths.map(p => ({ id: genEditId(), serverPath: p, previewUrl: p, file: null }));
        renderEditImageGrid();
        if (existingPanel) existingPanel.classList.remove('hidden');
        if (fileZoneWrap) fileZoneWrap.classList.add('hidden');
        document.getElementById('newCatEmojis').value = emojis;
    } else {
        adminIsEditingImageCat = false;
        setAdminCatTab('emoji');
        if (existingPanel) existingPanel.classList.add('hidden');
        if (fileZoneWrap) fileZoneWrap.classList.remove('hidden');
        document.getElementById('newCatEmojis').value = emojis;
    }
    document.getElementById('cancelCatEditBtn').classList.remove('hidden');
}

async function deleteCategory(id) {
    if (!confirm(window.t('delete_category'))) return;
    const res = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
    if ((await res.json()).success && typeof window.loadCategories === 'function') window.loadCategories();
}

const cancelCatEditBtn = document.getElementById('cancelCatEditBtn');
if (cancelCatEditBtn) cancelCatEditBtn.onclick = () => {
    adminIsEditingImageCat = false;
    editImageState = [];
    replaceTargetId = null;
    document.getElementById('editCatId').value = '';
    document.getElementById('newCatKey').value = '';
    document.getElementById('newCatKey').disabled = false;
    document.getElementById('newCatDisplay').value = '';
    document.getElementById('newCatEmojis').value = '';
    const adminEmojiEl = document.getElementById('adminCatImageEmoji');
    if (adminEmojiEl) adminEmojiEl.value = '';
    if (adminCatFilePicker) adminCatFilePicker.reset();
    const tabsEl = document.getElementById('adminCatTypeTabs');
    if (tabsEl) tabsEl.classList.remove('hidden');
    const existingPanel = document.getElementById('adminCatExistingImages');
    if (existingPanel) existingPanel.classList.add('hidden');
    const fileZoneWrap = document.getElementById('adminCatFileZoneWrap');
    if (fileZoneWrap) fileZoneWrap.classList.remove('hidden');
    const msgEl = document.getElementById('adminCatMsg');
    if (msgEl) msgEl.classList.add('hidden');
    setAdminCatTab('emoji');
    cancelCatEditBtn.classList.add('hidden');
};

const saveCatBtn = document.getElementById('saveCategoryBtn');
if (saveCatBtn) saveCatBtn.onclick = async () => {
    const id = document.getElementById('editCatId').value;
    const key_name = document.getElementById('newCatKey').value.trim();
    const display_name = document.getElementById('newCatDisplay').value.trim();
    const msgEl = document.getElementById('adminCatMsg');
    if (!key_name || !display_name) return;

    const showProgress = (text) => {
        if (msgEl) { msgEl.textContent = text; msgEl.className = 'metro-error upload-progress-msg'; msgEl.classList.remove('hidden'); }
        saveCatBtn.disabled = true;
    };
    const hideProgress = () => {
        if (msgEl) msgEl.classList.add('hidden');
        saveCatBtn.disabled = false;
    };

    if (adminCatMode === 'image' && id && adminIsEditingImageCat) {
        // Update existing image category (delete/replace/add images)
        const n = editImageState.length;
        if (n < 9 || n > 32) {
            const countEl = document.getElementById('adminCatEditCount');
            if (countEl) {
                countEl.textContent = window.currentLang === 'ru'
                    ? `Нужно от 9 до 32 изображений (сейчас: ${n})`
                    : `Need 9–32 images (current: ${n})`;
                countEl.style.color = 'var(--color-error, #e74c3c)';
            }
            return;
        }
        try {
            showProgress(window.currentLang === 'ru' ? '⏳ Сжатие…' : '⏳ Compressing…');
            const keepPaths = editImageState.filter(i => !i.file && i.serverPath).map(i => i.serverPath);
            const newItems = editImageState.filter(i => i.file);
            const reprEmoji = (document.getElementById('adminCatImageEmoji')?.value || '').trim();
            const formData = new FormData();
            formData.append('key_name', key_name);
            formData.append('display_name', display_name);
            formData.append('repr_emoji', reprEmoji || '🖼️');
            formData.append('keep_paths', JSON.stringify(keepPaths));
            for (const item of newItems) { formData.append('images', item.file); }
            showProgress(window.currentLang === 'ru' ? '📤 Загрузка…' : '📤 Uploading…');
            const res = await fetch(`/api/admin/categories/${id}/images`, { method: 'PUT', body: formData });
            const data = await res.json();
            hideProgress();
            if (data.success) {
                if (cancelCatEditBtn) cancelCatEditBtn.click();
                if (typeof window.loadCategories === 'function') window.loadCategories();
            } else {
                alert(data.error || window.t('server_error'));
            }
        } catch (e) {
            hideProgress();
            alert(window.t('server_error'));
        }
    } else if (adminCatMode === 'image' && !id) {
        // Create new image category
        const imagesInput = document.getElementById('adminCatImages');
        const count = imagesInput ? imagesInput.files.length : 0;
        if (count < 9 || count > 32) {
            const countEl = document.querySelector('#adminCatFileZone .custom-file-zone__count');
            if (countEl) {
                countEl.textContent = window.currentLang === 'ru'
                    ? `Выберите от 9 до 32 изображений`
                    : `Select between 9 and 32 images`;
                countEl.style.color = 'var(--color-error, #e74c3c)';
            }
            return;
        }
        const reprEmoji = (document.getElementById('adminCatImageEmoji')?.value || '').trim();
        const formData = new FormData();
        formData.append('key_name', key_name);
        formData.append('display_name', display_name);
        formData.append('repr_emoji', reprEmoji || '🖼️');
        try {
            showProgress(window.currentLang === 'ru' ? '⏳ Сжатие изображений…' : '⏳ Compressing images…');
            const filesToUpload = adminCatFilePicker
                ? await adminCatFilePicker.getCompressedFiles()
                : Array.from(imagesInput.files);
            filesToUpload.forEach(f => formData.append('images', f));
            showProgress(window.currentLang === 'ru' ? '📤 Загрузка…' : '📤 Uploading…');
            const res = await fetch('/api/admin/categories/with-images', { method: 'POST', body: formData });
            const data = await res.json();
            hideProgress();
            if (data.success) {
                if (cancelCatEditBtn) cancelCatEditBtn.click();
                if (typeof window.loadCategories === 'function') window.loadCategories();
            } else {
                alert(data.error || window.t('server_error'));
            }
        } catch (e) {
            hideProgress();
            alert(window.t('server_error'));
        }
    } else {
        // Emoji category
        const emojis = document.getElementById('newCatEmojis').value.trim();
        if (!emojis) return;
        try {
            showProgress(window.currentLang === 'ru' ? '💾 Сохранение…' : '💾 Saving…');
            const res = await fetch(id ? `/api/admin/categories/${id}` : '/api/admin/categories', {
                method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key_name, display_name, emojis })
            });
            const data = await res.json();
            hideProgress();
            if (data.success) {
                if (cancelCatEditBtn) cancelCatEditBtn.click();
                if (typeof window.loadCategories === 'function') window.loadCategories();
            } else {
                alert(data.error || window.t('server_error'));
            }
        } catch (e) {
            hideProgress();
            alert(window.t('server_error'));
        }
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
                    <input type="number" class="metro-input admin-coins-input" placeholder="${window.t('admin_coins_amount_ph')}"">
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
                if (!Number.isFinite(amount) || amount === 0) return;
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

// ==================== CUSTOM CATEGORIES MODERATION ====================
async function loadPendingCatsBadge() {
    try {
        const res = await fetch('/api/admin/custom-categories?status=pending');
        if (!res.ok) return;
        const data = await res.json();
        const cats = Array.isArray(data) ? data : (data.categories || []);
        const count = cats.length;
        ['pendingCatsBadge', 'adminHeaderBadge'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (count > 0) { el.textContent = count; el.classList.remove('hidden'); }
            else el.classList.add('hidden');
        });
    } catch (e) { /* ignore */ }
}

async function loadCustomCats() {
    const list = document.getElementById('adminCustomCatsList');
    if (!list || !window.isAdmin) return;
    list.innerHTML = `<div class="metro-list-item text-dim">${window.t('wait_msg')}</div>`;
    try {
        const res = await fetch('/api/admin/custom-categories');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const allCats = Array.isArray(data) ? data : (data.categories || []);
        const cats = allCats.filter(c => !c.status || c.status === 'pending');
        if (!cats.length) {
            list.innerHTML = `<div class="metro-list-item text-dim">${window.t('custom_cat_empty')}</div>`;
            return;
        }
        list.innerHTML = '';
        cats.forEach(cat => {
            const item = document.createElement('div');
            item.className = 'metro-list-item custom-cat-mod-item';
            const statusKey = `custom_cat_${cat.status || 'pending'}`;
            const statusText = window.t(statusKey);
            let statusClass = '';
            if (cat.status === 'approved') statusClass = 'text-accent';
            if (cat.status === 'rejected') statusClass = 'metro-error';
            const firstEmoji = (cat.emojis || '').split(',')[0] || '';
            const isImgCat = firstEmoji.startsWith('/uploads/') || firstEmoji.startsWith('http');
            const reprIcon = isImgCat ? (cat.repr_emoji || '🖼️') : firstEmoji;
            const imgPaths = isImgCat ? (cat.emojis || '').split(',').map(p => p.trim()).filter(Boolean) : [];
            const previewHtml = isImgCat
                ? `<div class="custom-cat-img-previews">${imgPaths.map(p =>
                    `<img src="${window.escHtml(p)}" class="custom-cat-thumb" alt="" loading="lazy">`).join('')}</div>`
                : `<small class="text-dim custom-cat-emojis-preview">${window.escHtml((cat.emojis || '').substring(0, 60))}${cat.emojis && cat.emojis.length > 60 ? '…' : ''}</small>`;
            item.innerHTML = `
                <div class="custom-cat-mod-info">
                    <b>${reprIcon} ${window.escHtml(cat.display_name)}</b>
                    <small class="text-dim"> (${window.escHtml(cat.key_name)})</small>
                    <span class="custom-cat-status ${statusClass}">${statusText}</span>
                    <br><small class="text-dim">by <b>${window.escHtml(cat.username || '?')}</b></small>
                    <br>${previewHtml}
                </div>
                <div class="metro-btn-group custom-cat-mod-actions">
                    ${cat.status !== 'approved' ? `<button class="metro-btn accent-green custom-cat-approve-btn" data-cat-id="${cat.id}">${window.t('custom_cat_approve')}</button>` : ''}
                    ${cat.status !== 'rejected' ? `<button class="metro-btn danger custom-cat-reject-btn" data-cat-id="${cat.id}">${window.t('custom_cat_reject')}</button>` : ''}
                </div>
            `;
            list.appendChild(item);
        });

        list.onclick = async (e) => {
            const approveBtn = e.target.closest('.custom-cat-approve-btn');
            const rejectBtn = e.target.closest('.custom-cat-reject-btn');
            if (approveBtn) {
                const id = approveBtn.dataset.catId;
                approveBtn.disabled = true;
                try {
                    const r = await fetch(`/api/admin/custom-categories/${id}/approve`, { method: 'POST' });
                    if ((await r.json()).success) {
                        loadCustomCats();
                        loadPendingCatsBadge();
                        if (typeof window.loadCategories === 'function') window.loadCategories();
                    }
                } catch (err) { console.error(err); approveBtn.disabled = false; }
            }
            if (rejectBtn) {
                const id = rejectBtn.dataset.catId;
                rejectBtn.disabled = true;
                try {
                    const r = await fetch(`/api/admin/custom-categories/${id}/reject`, { method: 'POST' });
                    if ((await r.json()).success) { loadCustomCats(); loadPendingCatsBadge(); }
                } catch (err) { console.error(err); rejectBtn.disabled = false; }
            }
        };
    } catch (e) {
        list.innerHTML = `<div class="metro-list-item text-dim">${window.t('database_error')}</div>`;
    }
}
