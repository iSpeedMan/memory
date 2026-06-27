// ==================== МАГАЗИН (администратор) ====================

const ADMIN_SHOP_CAT_LABELS = {
    card_skin:    '🃏 Рубашки',
    board_bg:     '🎨 Фоны',
    match_color:  '🎯 Цвета матча',
    avatar_frame: '🖼️ Рамки',
    title:        '🏷️ Звания',
};

let _adminShopAllItems = [];
let _adminShopCurrentCat = 'card_skin';
let _adminShopEditKey = null;

async function loadAdminShop() {
    try {
        const res = await fetch('/api/admin/shop/items');
        if (!res.ok) throw new Error('fetch_failed');
        _adminShopAllItems = await res.json();
        renderAdminShopList();
    } catch (_) {
        const el = document.getElementById('adminShopItemsList');
        if (el) el.innerHTML = '<div class="text-dim" style="padding:10px">Ошибка загрузки</div>';
    }
}

function renderAdminShopList() {
    const list = document.getElementById('adminShopItemsList');
    if (!list) return;
    const items = _adminShopAllItems.filter(i => i.category === _adminShopCurrentCat);

    if (!items.length) {
        list.innerHTML = '<div class="metro-list-item text-dim">Нет товаров. Добавьте первый!</div>';
        return;
    }
    list.innerHTML = items.map(item => {
        const pd = item.preview_data || {};
        const inactiveClass = item.is_active ? '' : ' inactive-item';
        const preview = _adminBuildPreviewSm(item.category, pd);
        const rarityClass = `admin-shop-rarity-${item.rarity || 'common'}`;
        return `
        <div class="admin-shop-item-row metro-list-item${inactiveClass}">
            <div class="admin-shop-preview-sm">${preview}</div>
            <div class="admin-shop-item-info">
                <div class="admin-shop-item-name">${window.escHtml ? window.escHtml(item.name) : item.name}</div>
                <div class="admin-shop-item-meta">
                    <span class="${rarityClass}">${item.rarity || 'common'}</span> ·
                    ${item.price_mc === 0 ? '<span style="color:var(--accent-green)">Бесплатно</span>' : `🪙 ${item.price_mc} MC`} ·
                    <code style="font-size:10px">${item.item_key}</code>
                    ${!item.is_active ? ' · <span style="color:var(--metro-text-dim)">скрыт</span>' : ''}
                </div>
            </div>
            <div class="admin-shop-actions">
                <button class="metro-btn secondary" onclick="adminShopEdit('${item.item_key}')" style="font-size:11px;padding:4px 8px">✏️</button>
                <button class="metro-btn danger" onclick="adminShopDelete('${item.item_key}')" style="font-size:11px;padding:4px 8px">✕</button>
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
            return `<div style="width:100%;height:100%;background:${bg};display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.8);font-weight:300">?</div>`;
        }
        case 'board_bg': {
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

function adminShopEdit(key) {
    const item = _adminShopAllItems.find(i => i.item_key === key);
    if (!item) return;
    _adminShopEditKey = key;

    const pd = item.preview_data || {};

    const f = {
        key:     document.getElementById('adminShopEditKey'),
        itemKey: document.getElementById('adminShopItemKey'),
        name:    document.getElementById('adminShopName'),
        price:   document.getElementById('adminShopPrice'),
        rarity:  document.getElementById('adminShopRarity'),
        active:  document.getElementById('adminShopActive'),
        preview: document.getElementById('adminShopPreviewData'),
        cat:     document.getElementById('adminShopCategory'),
        title:   document.getElementById('adminShopFormTitle'),
        cancelBtn: document.getElementById('adminShopCancelBtn'),
    };
    if (!f.key) return;

    f.key.value     = key;
    f.itemKey.value = item.item_key;
    f.itemKey.disabled = true;
    if (f.cat) { f.cat.value = item.category; f.cat.disabled = true; }
    f.name.value    = item.name;
    f.price.value   = item.price_mc;
    f.rarity.value  = item.rarity || 'common';
    f.active.checked = !!item.is_active;
    f.preview.value = JSON.stringify(pd, null, 2);
    if (f.title)     f.title.textContent = 'Редактировать товар';
    if (f.cancelBtn) f.cancelBtn.classList.remove('hidden');

    f.name.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function adminShopCancelEdit() {
    _adminShopEditKey = null;
    const f = {
        key:     document.getElementById('adminShopEditKey'),
        itemKey: document.getElementById('adminShopItemKey'),
        name:    document.getElementById('adminShopName'),
        price:   document.getElementById('adminShopPrice'),
        rarity:  document.getElementById('adminShopRarity'),
        active:  document.getElementById('adminShopActive'),
        preview: document.getElementById('adminShopPreviewData'),
        cat:     document.getElementById('adminShopCategory'),
        msg:     document.getElementById('adminShopMsg'),
        title:   document.getElementById('adminShopFormTitle'),
        cancelBtn: document.getElementById('adminShopCancelBtn'),
    };
    if (f.key) f.key.value = '';
    if (f.itemKey) { f.itemKey.value = ''; f.itemKey.disabled = false; }
    if (f.name)    f.name.value = '';
    if (f.price)   f.price.value = '';
    if (f.rarity)  f.rarity.value = 'common';
    if (f.active)  f.active.checked = true;
    if (f.preview) f.preview.value = '{}';
    if (f.cat)     { f.cat.value = _adminShopCurrentCat; f.cat.disabled = false; }
    if (f.msg)     { f.msg.classList.add('hidden'); f.msg.textContent = ''; }
    if (f.title)   f.title.textContent = 'Добавить товар';
    if (f.cancelBtn) f.cancelBtn.classList.add('hidden');
}

async function adminShopDelete(key) {
    if (!confirm(`Удалить товар «${key}»? Это не вернёт монеты покупателям.`)) return;
    try {
        const csrf = await fetchCsrf();
        const res = await fetch(`/api/admin/shop/items/${encodeURIComponent(key)}`, {
            method: 'DELETE',
            headers: { 'X-CSRF-Token': csrf },
        });
        if (!res.ok) throw new Error('delete_failed');
        await loadAdminShop();
    } catch (_) {
        alert('Ошибка удаления');
    }
}

async function fetchCsrf() {
    try {
        const r = await fetch('/api/csrf');
        const d = await r.json();
        return d.token || '';
    } catch { return ''; }
}

async function adminShopSave() {
    const msgEl = document.getElementById('adminShopMsg');
    if (msgEl) { msgEl.classList.add('hidden'); msgEl.textContent = ''; }

    const itemKey  = document.getElementById('adminShopItemKey')?.value.trim();
    const category = document.getElementById('adminShopCategory')?.value;
    const name     = document.getElementById('adminShopName')?.value.trim();
    const price    = parseInt(document.getElementById('adminShopPrice')?.value, 10);
    const rarity   = document.getElementById('adminShopRarity')?.value;
    const active   = document.getElementById('adminShopActive')?.checked;
    const previewRaw = document.getElementById('adminShopPreviewData')?.value.trim();

    if (!itemKey || !name || !category) {
        if (msgEl) { msgEl.textContent = 'Заполните ключ, категорию и название'; msgEl.classList.remove('hidden'); }
        return;
    }

    let previewData = {};
    try { previewData = JSON.parse(previewRaw || '{}'); } catch {
        if (msgEl) { msgEl.textContent = 'Ошибка в JSON preview_data'; msgEl.classList.remove('hidden'); }
        return;
    }

    const csrf = await fetchCsrf();
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
            if (msgEl) { msgEl.textContent = data.error || 'Ошибка'; msgEl.classList.remove('hidden'); }
            return;
        }
        adminShopCancelEdit();
        await loadAdminShop();
    } catch (_) {
        if (msgEl) { msgEl.textContent = 'Ошибка сети'; msgEl.classList.remove('hidden'); }
    }
}

function initAdminShopTabs() {
    document.querySelectorAll('.admin-shop-cat-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.admin-shop-cat-tab').forEach(b => {
                b.classList.replace('accent-purple','secondary');
            });
            btn.classList.replace('secondary','accent-purple');
            _adminShopCurrentCat = btn.dataset.cat;
            renderAdminShopList();
            adminShopCancelEdit();
            const catSel = document.getElementById('adminShopCategory');
            if (catSel) catSel.value = _adminShopCurrentCat;
        });
    });

    const saveBtn   = document.getElementById('adminShopSaveBtn');
    const cancelBtn = document.getElementById('adminShopCancelBtn');
    if (saveBtn)   saveBtn.addEventListener('click', adminShopSave);
    if (cancelBtn) cancelBtn.addEventListener('click', adminShopCancelEdit);
}

document.addEventListener('DOMContentLoaded', () => {
    initAdminShopTabs();
});

window._onAdminShopTabOpen = function() {
    loadAdminShop();
};
