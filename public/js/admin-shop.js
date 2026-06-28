// ==================== МАГАЗИН (администратор) ====================

let _adminShopAllItems = [];
let _adminShopCurrentCat = 'card_skin';
let _adminShopEditKey = null;
let _adminShopBgFileObj = null;

function _ashT(key, vars) {
    const s = (typeof window.t === 'function') ? window.t(key) : key;
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : '{' + k + '}'));
}

// ── Загрузка списка ──────────────────────────────────────────────────────────

async function loadAdminShop() {
    try {
        const res = await fetch('/api/admin/shop/items');
        if (!res.ok) throw new Error('fetch_failed');
        _adminShopAllItems = await res.json();
        renderAdminShopList();
    } catch (_) {
        const el = document.getElementById('adminShopItemsList');
        if (el) el.innerHTML = `<div class="text-dim" style="padding:10px">${_ashT('admin_shop_load_err')}</div>`;
    }
}

function renderAdminShopList() {
    const list = document.getElementById('adminShopItemsList');
    if (!list) return;
    const items = _adminShopAllItems.filter(i => i.category === _adminShopCurrentCat);

    if (!items.length) {
        list.innerHTML = `<div class="metro-list-item text-dim">${_ashT('admin_shop_no_items')}</div>`;
        return;
    }
    list.innerHTML = items.map(item => {
        const pd = item.preview_data || {};
        const inactiveClass = item.is_active ? '' : ' inactive-item';
        const preview = _adminBuildPreviewSm(item.category, pd);
        const rarityClass = `admin-shop-rarity-${item.rarity || 'common'}`;
        const hiddenLabel = !item.is_active ? ` · <span style="color:var(--metro-text-dim)">${_ashT('admin_shop_hidden')}</span>` : '';
        const priceLabel = item.price_mc === 0
            ? `<span style="color:var(--accent-green)">${_ashT('shop_free')}</span>`
            : `🪙 ${item.price_mc} MC`;
        return `
        <div class="admin-shop-item-row metro-list-item${inactiveClass}">
            <div class="admin-shop-preview-sm">${preview}</div>
            <div class="admin-shop-item-info">
                <div class="admin-shop-item-name">${window.escHtml ? window.escHtml(item.name) : item.name}</div>
                <div class="admin-shop-item-meta">
                    <span class="${rarityClass}">${_ashT('shop_rarity_' + (item.rarity || 'common'))}</span> ·
                    ${priceLabel} ·
                    <code style="font-size:10px">${item.item_key}</code>${hiddenLabel}
                </div>
            </div>
            <div class="admin-shop-actions">
                <button class="metro-btn secondary ash-edit-btn" data-key="${item.item_key}" style="font-size:11px;padding:4px 8px">✏️</button>
                <button class="metro-btn danger ash-delete-btn" data-key="${item.item_key}" style="font-size:11px;padding:4px 8px">✕</button>
            </div>
        </div>`;
    }).join('');
}

function _adminBuildPreviewSm(category, pd) {
    switch (category) {
        case 'card_skin': {
            const bg = pd.preview_bg2
                ? `linear-gradient(135deg,${pd.preview_bg||'#1283b9'} 0%,${pd.preview_bg2} 100%)`
                : (pd.preview_bg || '#1283b9');
            const sym = pd.card_symbol || '?';
            return `<div style="width:100%;height:100%;background:${bg};display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.8);font-weight:300">${window.escHtml ? window.escHtml(sym) : sym}</div>`;
        }
        case 'board_bg': {
            if (pd.image_url) {
                return `<div style="width:100%;height:100%;background:url('${pd.image_url}') center/cover;border-radius:1px"></div>`;
            }
            const bg = pd.preview_bg2
                ? `linear-gradient(135deg,${pd.preview_bg||'#000'} 0%,${pd.preview_bg2} 100%)`
                : (pd.preview_bg || '#000');
            return `<div style="width:100%;height:100%;background:${bg};border-radius:1px"></div>`;
        }
        case 'match_color':
            return `<div class="admin-shop-color-sm" style="background:${pd.color||'#1283b9'}"></div>`;
        case 'avatar_frame':
            return `<span style="font-size:18px">😶</span>`;
        case 'title':
            return pd.label ? `<span style="font-size:10px;font-weight:700;color:${pd.color||'#fff'}">${pd.label.slice(0,3)}</span>` : '—';
        default:
            return '?';
    }
}

// ── Редактирование ───────────────────────────────────────────────────────────

function adminShopEdit(key) {
    const item = _adminShopAllItems.find(i => i.item_key === key);
    if (!item) return;
    _adminShopEditKey = key;

    const pd = item.preview_data || {};
    const f = _ashFields();
    if (!f.key) return;

    f.key.value     = key;
    f.itemKey.value = item.item_key;
    f.itemKey.disabled = true;
    if (f.cat) { f.cat.value = item.category; f.cat.disabled = true; }
    f.name.value     = item.name;
    f.price.value    = item.price_mc;
    f.rarity.value   = item.rarity || 'common';
    f.active.checked = !!item.is_active;
    f.preview.value  = JSON.stringify(pd, null, 2);
    if (f.title)     f.title.textContent = _ashT('admin_shop_edit_item');
    if (f.cancelBtn) f.cancelBtn.classList.remove('hidden');

    _ashBgFileReset();
    _ashUpdateColorHelper();
    f.name.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function adminShopCancelEdit() {
    _adminShopEditKey = null;
    const f = _ashFields();
    if (f.key)      f.key.value = '';
    if (f.itemKey)  { f.itemKey.value = ''; f.itemKey.disabled = false; }
    if (f.name)     f.name.value = '';
    if (f.price)    f.price.value = '';
    if (f.rarity)   f.rarity.value = 'common';
    if (f.active)   f.active.checked = true;
    if (f.preview)  f.preview.value = '{}';
    if (f.cat)      { f.cat.value = _adminShopCurrentCat; f.cat.disabled = false; }
    if (f.msg)      { f.msg.classList.add('hidden'); f.msg.textContent = ''; }
    if (f.title)    f.title.textContent = _ashT('admin_shop_add_item');
    if (f.cancelBtn) f.cancelBtn.classList.add('hidden');
    _ashBgFileReset();
    _ashUpdateColorHelper();
}

function _ashFields() {
    return {
        key:       document.getElementById('adminShopEditKey'),
        itemKey:   document.getElementById('adminShopItemKey'),
        name:      document.getElementById('adminShopName'),
        price:     document.getElementById('adminShopPrice'),
        rarity:    document.getElementById('adminShopRarity'),
        active:    document.getElementById('adminShopActive'),
        preview:   document.getElementById('adminShopPreviewData'),
        cat:       document.getElementById('adminShopCategory'),
        msg:       document.getElementById('adminShopMsg'),
        title:     document.getElementById('adminShopFormTitle'),
        cancelBtn: document.getElementById('adminShopCancelBtn'),
    };
}

// ── Сохранение/удаление ──────────────────────────────────────────────────────

async function adminShopDelete(key) {
    if (!confirm(_ashT('admin_shop_del_confirm', { key }))) return;
    try {
        const csrf = await _ashFetchCsrf();
        const res = await fetch(`/api/admin/shop/items/${encodeURIComponent(key)}`, {
            method: 'DELETE',
            headers: { 'X-CSRF-Token': csrf },
        });
        if (!res.ok) throw new Error('delete_failed');
        await loadAdminShop();
    } catch (_) {
        alert(_ashT('admin_shop_del_err'));
    }
}

async function adminShopSave() {
    const msgEl = document.getElementById('adminShopMsg');
    if (msgEl) { msgEl.classList.add('hidden'); msgEl.textContent = ''; }

    const itemKey    = document.getElementById('adminShopItemKey')?.value.trim();
    const category   = document.getElementById('adminShopCategory')?.value;
    const name       = document.getElementById('adminShopName')?.value.trim();
    const price      = parseInt(document.getElementById('adminShopPrice')?.value, 10);
    const rarity     = document.getElementById('adminShopRarity')?.value;
    const active     = document.getElementById('adminShopActive')?.checked;
    const previewRaw = document.getElementById('adminShopPreviewData')?.value.trim();

    if (!itemKey || !name || !category) {
        if (msgEl) { msgEl.textContent = _ashT('admin_shop_fill_req'); msgEl.classList.remove('hidden'); }
        return;
    }

    let previewData = {};
    try { previewData = JSON.parse(previewRaw || '{}'); } catch {
        if (msgEl) { msgEl.textContent = _ashT('admin_shop_json_err'); msgEl.classList.remove('hidden'); }
        return;
    }

    const csrf   = await _ashFetchCsrf();
    const isEdit = !!_adminShopEditKey;
    const url    = isEdit
        ? `/api/admin/shop/items/${encodeURIComponent(_adminShopEditKey)}`
        : '/api/admin/shop/items';
    const method = isEdit ? 'PUT' : 'POST';

    const body = isEdit
        ? { name, price_mc: isNaN(price) ? 0 : price, rarity, is_active: active, preview_data: previewData }
        : { item_key: itemKey, category, name, price_mc: isNaN(price) ? 0 : price, rarity, is_active: active, preview_data: previewData };

    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
            if (msgEl) { msgEl.textContent = data.error || _ashT('admin_shop_net_err'); msgEl.classList.remove('hidden'); }
            return;
        }
        adminShopCancelEdit();
        await loadAdminShop();
    } catch (_) {
        if (msgEl) { msgEl.textContent = _ashT('admin_shop_net_err'); msgEl.classList.remove('hidden'); }
    }
}

async function _ashFetchCsrf() {
    try {
        const r = await fetch('/api/csrf');
        const d = await r.json();
        return d.token || '';
    } catch { return ''; }
}

// ── Помощник цветов ───────────────────────────────────────────────────────────

function _ashUpdateColorHelper() {
    const cat = document.getElementById('adminShopCategory')?.value || _adminShopCurrentCat;
    const textarea = document.getElementById('adminShopPreviewData');
    let pd = {};
    try { pd = JSON.parse(textarea?.value || '{}'); } catch {}

    const helper   = document.getElementById('adminShopColorHelper');
    const fields   = document.getElementById('adminShopColorFields');
    const preview  = document.getElementById('adminShopColorPreview');
    const bgUpload = document.getElementById('adminShopBgUpload');

    if (!helper) return;

    if (cat === 'card_skin' || cat === 'board_bg') {
        helper.classList.remove('hidden');
        const c1 = pd.preview_bg  || '#1283b9';
        const c2 = pd.preview_bg2 || '';
        const symRow = cat === 'card_skin' ? `
            <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
                <label style="font-size:11px;color:var(--metro-text-dim);min-width:68px">Символ</label>
                <input type="text" id="ashSymbol" value="${pd.card_symbol || '?'}" class="metro-input" style="width:56px;font-size:18px;text-align:center" maxlength="2" placeholder="?">
                <span style="font-size:10px;color:var(--metro-text-dim)">emoji на рубашке</span>
            </div>` : '';
        fields.innerHTML = `
            <div style="display:flex;gap:8px;align-items:center">
                <label style="font-size:11px;color:var(--metro-text-dim);min-width:68px">${_ashT('admin_shop_color1_lbl')}</label>
                <input type="color" id="ashC1" value="${_safeHex(c1,'#1283b9')}" style="width:36px;height:26px;border:none;padding:0;cursor:pointer;border-radius:3px">
                <input type="text"  id="ashC1T" value="${c1}" class="metro-input" style="width:90px;font-size:11px">
            </div>
            <div style="display:flex;gap:8px;align-items:center">
                <label style="font-size:11px;color:var(--metro-text-dim);min-width:68px">${_ashT('admin_shop_color2_lbl')}</label>
                <input type="color" id="ashC2" value="${_safeHex(c2||c1,'#000000')}" style="width:36px;height:26px;border:none;padding:0;cursor:pointer;border-radius:3px">
                <input type="text"  id="ashC2T" value="${c2}" class="metro-input" style="width:90px;font-size:11px" placeholder="(нет градиента)">
                <button type="button" id="ashClearGradBtn" class="metro-btn secondary" style="font-size:10px;padding:3px 7px">✕</button>
            </div>${symRow}`;
        _ashBindGradient(pd, cat);
        _ashRefreshGradientPreview(c1, c2);

        if (cat === 'card_skin') {
            const symEl = document.getElementById('ashSymbol');
            if (symEl) {
                symEl.addEventListener('input', () => {
                    const textarea = document.getElementById('adminShopPreviewData');
                    let pdd = {};
                    try { pdd = JSON.parse(textarea?.value || '{}'); } catch {}
                    pdd.card_symbol = symEl.value || '?';
                    if (textarea) textarea.value = JSON.stringify(pdd, null, 2);
                });
            }
        }

        if (bgUpload) bgUpload.classList.toggle('hidden', cat !== 'board_bg');
    } else if (cat === 'match_color' || cat === 'title') {
        helper.classList.remove('hidden');
        const c = pd.color || '#1283b9';
        fields.innerHTML = `
            <div style="display:flex;gap:8px;align-items:center">
                <label style="font-size:11px;color:var(--metro-text-dim);min-width:68px">${_ashT('admin_shop_single_color')}</label>
                <input type="color" id="ashCS" value="${_safeHex(c,'#1283b9')}" style="width:36px;height:26px;border:none;padding:0;cursor:pointer;border-radius:3px">
                <input type="text"  id="ashCST" value="${c}" class="metro-input" style="width:90px;font-size:11px">
            </div>`;
        if (preview) { preview.style.background = c; preview.style.display = 'block'; }
        _ashBindSingleColor(pd, cat, 'color', 'ashCS', 'ashCST');
        if (bgUpload) bgUpload.classList.add('hidden');
    } else {
        helper.classList.add('hidden');
        if (bgUpload) bgUpload.classList.add('hidden');
    }

    // Кнопка "убрать градиент" — через делегирование
    const clearBtn = document.getElementById('ashClearGradBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            const c2TEl = document.getElementById('ashC2T');
            if (c2TEl) { c2TEl.value = ''; c2TEl.dispatchEvent(new Event('input')); }
        });
    }
}

function _safeHex(val, fallback) {
    return /^#[0-9a-fA-F]{3,6}$/.test(val) ? val : fallback;
}

function _ashRefreshGradientPreview(c1, c2) {
    const preview = document.getElementById('adminShopColorPreview');
    if (!preview) return;
    preview.style.background = c2
        ? `linear-gradient(135deg,${c1} 0%,${c2} 100%)`
        : c1;
}

function _ashBindGradient(pd, cat) {
    const textarea = document.getElementById('adminShopPreviewData');

    function _syncToJson() {
        const c1 = document.getElementById('ashC1T')?.value || '';
        const c2 = document.getElementById('ashC2T')?.value || '';
        try { pd = JSON.parse(textarea?.value || '{}'); } catch { pd = {}; }
        if (c1) pd.preview_bg = c1; else delete pd.preview_bg;
        if (c2) pd.preview_bg2 = c2; else delete pd.preview_bg2;
        if (textarea) textarea.value = JSON.stringify(pd, null, 2);
        _ashRefreshGradientPreview(c1 || '#000', c2);
    }

    const c1El  = document.getElementById('ashC1');
    const c1TEl = document.getElementById('ashC1T');
    const c2El  = document.getElementById('ashC2');
    const c2TEl = document.getElementById('ashC2T');

    if (c1El)  c1El.addEventListener('input',  () => { if (c1TEl) c1TEl.value = c1El.value; _syncToJson(); });
    if (c1TEl) c1TEl.addEventListener('input', () => { if (/^#[0-9a-fA-F]{3,6}$/.test(c1TEl.value) && c1El) c1El.value = c1TEl.value; _syncToJson(); });
    if (c2El)  c2El.addEventListener('input',  () => { if (c2TEl) c2TEl.value = c2El.value; _syncToJson(); });
    if (c2TEl) c2TEl.addEventListener('input', () => { if (/^#[0-9a-fA-F]{3,6}$/.test(c2TEl.value) && c2El) c2El.value = c2TEl.value; _syncToJson(); });
}

function _ashBindSingleColor(pd, cat, field, colorId, textId) {
    const textarea = document.getElementById('adminShopPreviewData');
    const preview  = document.getElementById('adminShopColorPreview');

    function _syncToJson() {
        const val = document.getElementById(textId)?.value || '';
        try { pd = JSON.parse(textarea?.value || '{}'); } catch { pd = {}; }
        pd[field] = val;
        if (textarea) textarea.value = JSON.stringify(pd, null, 2);
        if (preview) preview.style.background = val;
    }

    const cEl  = document.getElementById(colorId);
    const cTEl = document.getElementById(textId);
    if (cEl)  cEl.addEventListener('input',  () => { if (cTEl) cTEl.value = cEl.value; _syncToJson(); });
    if (cTEl) cTEl.addEventListener('input', () => { if (/^#[0-9a-fA-F]{3,6}$/.test(cTEl.value) && cEl) cEl.value = cTEl.value; _syncToJson(); });
}

// ── Загрузка изображения фона ────────────────────────────────────────────────

function _ashBgFileReset() {
    _adminShopBgFileObj = null;
    const fileEl = document.getElementById('adminShopBgFile');
    if (fileEl) fileEl.value = '';
    const nameEl = document.getElementById('adminShopBgFileName');
    if (nameEl) nameEl.textContent = _ashT('admin_shop_bg_hint');
    const uploadBtn = document.getElementById('adminShopBgUploadBtn');
    if (uploadBtn) uploadBtn.classList.add('hidden');
    const previewImg = document.getElementById('adminShopBgPreviewImg');
    if (previewImg) previewImg.innerHTML = '';
    const msgEl = document.getElementById('adminShopBgMsg');
    if (msgEl) msgEl.textContent = '';
}

function _ashInitBgUpload() {
    const pickBtn   = document.getElementById('adminShopBgPickBtn');
    const fileEl    = document.getElementById('adminShopBgFile');
    const uploadBtn = document.getElementById('adminShopBgUploadBtn');

    if (pickBtn && fileEl) {
        pickBtn.addEventListener('click', () => fileEl.click());
        fileEl.addEventListener('change', () => {
            const f = fileEl.files?.[0];
            if (!f) return;
            if (f.size > 2 * 1024 * 1024) {
                const msgEl = document.getElementById('adminShopBgMsg');
                if (msgEl) { msgEl.textContent = _ashT('admin_shop_bg_size_err'); msgEl.style.color = 'var(--accent-red)'; }
                return;
            }
            _adminShopBgFileObj = f;
            const nameEl = document.getElementById('adminShopBgFileName');
            if (nameEl) nameEl.textContent = f.name;
            if (uploadBtn) uploadBtn.classList.remove('hidden');

            const reader = new FileReader();
            reader.onload = e => {
                const previewImg = document.getElementById('adminShopBgPreviewImg');
                if (previewImg) previewImg.innerHTML = `<img src="${e.target.result}" style="max-height:80px;border-radius:3px;margin-top:4px" alt="preview">`;
            };
            reader.readAsDataURL(f);
        });
    }

    if (uploadBtn) {
        uploadBtn.addEventListener('click', async () => {
            if (!_adminShopBgFileObj) return;
            const msgEl = document.getElementById('adminShopBgMsg');
            if (msgEl) { msgEl.textContent = '📤 Загрузка...'; msgEl.style.color = 'var(--metro-text-dim)'; }
            uploadBtn.disabled = true;

            try {
                const csrf = await _ashFetchCsrf();
                const formData = new FormData();
                formData.append('image', _adminShopBgFileObj);
                const res = await fetch('/api/admin/upload-bg', {
                    method: 'POST',
                    headers: { 'X-CSRF-Token': csrf },
                    body: formData,
                });
                const data = await res.json();
                if (!res.ok || !data.url) throw new Error(data.error || 'upload_failed');

                if (msgEl) { msgEl.textContent = `${_ashT('admin_shop_bg_ok')} ${data.url}`; msgEl.style.color = 'var(--accent-green)'; }

                const textarea = document.getElementById('adminShopPreviewData');
                let pd = {};
                try { pd = JSON.parse(textarea?.value || '{}'); } catch {}
                pd.image_url = data.url;
                if (textarea) textarea.value = JSON.stringify(pd, null, 2);
                _ashUpdateColorHelper();
            } catch (e) {
                if (msgEl) { msgEl.textContent = _ashT('admin_shop_bg_err'); msgEl.style.color = 'var(--accent-red)'; }
            } finally {
                uploadBtn.disabled = false;
            }
        });
    }
}

// ── Вкладки + event delegation ────────────────────────────────────────────────

function initAdminShopTabs() {
    // Вкладки категорий
    document.querySelectorAll('.admin-shop-cat-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.admin-shop-cat-tab').forEach(b => {
                b.classList.replace('accent-purple', 'secondary');
            });
            btn.classList.replace('secondary', 'accent-purple');
            _adminShopCurrentCat = btn.dataset.cat;
            renderAdminShopList();
            adminShopCancelEdit();
            const catSel = document.getElementById('adminShopCategory');
            if (catSel) catSel.value = _adminShopCurrentCat;
        });
    });

    // Кнопки формы
    const saveBtn   = document.getElementById('adminShopSaveBtn');
    const cancelBtn = document.getElementById('adminShopCancelBtn');
    if (saveBtn)   saveBtn.addEventListener('click', adminShopSave);
    if (cancelBtn) cancelBtn.addEventListener('click', adminShopCancelEdit);

    // EVENT DELEGATION для Edit / Delete в списке товаров
    const list = document.getElementById('adminShopItemsList');
    if (list) {
        list.addEventListener('click', e => {
            const editBtn   = e.target.closest('.ash-edit-btn');
            const deleteBtn = e.target.closest('.ash-delete-btn');
            if (editBtn)   adminShopEdit(editBtn.dataset.key);
            if (deleteBtn) adminShopDelete(deleteBtn.dataset.key);
        });
    }

    // Смена категории → обновить помощник цветов
    const catSel = document.getElementById('adminShopCategory');
    if (catSel) catSel.addEventListener('change', _ashUpdateColorHelper);

    const textarea = document.getElementById('adminShopPreviewData');
    if (textarea) textarea.addEventListener('input', _ashUpdateColorHelper);

    _ashInitBgUpload();
    _ashUpdateColorHelper();
}

document.addEventListener('DOMContentLoaded', () => {
    initAdminShopTabs();
});

window._onAdminShopTabOpen = function() {
    loadAdminShop();
};

window.adminShopEdit       = adminShopEdit;
window.adminShopDelete     = adminShopDelete;
window.adminShopSave       = adminShopSave;
window.adminShopCancelEdit = adminShopCancelEdit;
