// ==================== МАГАЗИН (пользователь) ====================

window.userCosmetics = null;
let _shopItems = [];
let _shopCurrentCat = 'card_skin';

function _st(key, vars) {
    const s = (typeof window.t === 'function') ? window.t(key) : key;
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : '{' + k + '}'));
}

// ── Загрузка и рендер ────────────────────────────────────────────────────────

async function loadShopItems() {
    const grid = document.getElementById('shopItemsGrid');
    if (!grid) return;
    grid.innerHTML = `<div class="text-dim" style="padding:10px;grid-column:1/-1">${_st('shop_loading')}</div>`;
    try {
        const res = await fetch('/api/shop/items');
        if (!res.ok) throw new Error('fetch_failed');
        _shopItems = await res.json();
        renderShopGrid();
    } catch (_) {
        if (grid) grid.innerHTML = `<div class="metro-error" style="grid-column:1/-1">${_st('shop_load_error')}</div>`;
    }
}

function renderShopGrid() {
    const grid = document.getElementById('shopItemsGrid');
    if (!grid) return;
    const items = _shopItems.filter(i => i.category === _shopCurrentCat);

    if (!items.length) {
        grid.innerHTML = `<div class="text-dim" style="padding:10px;grid-column:1/-1">${_st('shop_empty')}</div>`;
        return;
    }

    grid.innerHTML = items.map(item => {
        const pd = item.preview_data || {};
        const ownedClass    = item.owned    ? ' owned'   : '';
        const equippedClass = item.equipped ? ' equipped' : '';
        const priceLabel    = item.price_mc === 0
            ? `<span class="shop-item-price free">${_st('shop_free')}</span>`
            : `<span class="shop-item-price">🪙 ${item.price_mc}</span>`;
        const rarityClass   = `shop-item-rarity ${item.rarity || 'common'}`;
        const equippedBadge = item.equipped ? `<span class="shop-equipped-badge">${_st('shop_equipped')}</span>` : '';
        const preview       = _buildItemPreview(item.category, pd);
        let   actionBtn     = '';

        if (item.equipped) {
            actionBtn = `<button class="metro-btn secondary shop-item-btn" disabled>${_st('shop_equipped')}</button>`;
        } else if (item.owned || item.price_mc === 0) {
            actionBtn = `<button class="metro-btn accent-purple shop-item-btn" onclick="shopEquipItem('${item.item_key}')">${_st('shop_equip')}</button>`;
        } else {
            actionBtn = `<button class="metro-btn primary shop-item-btn" onclick="shopBuyItem('${item.item_key}')">${_st('shop_buy')}</button>`;
        }

        return `
        <div class="shop-item${ownedClass}${equippedClass}" id="shop-item-${item.item_key}">
            ${equippedBadge}
            <div class="shop-item-preview">${preview}</div>
            <span class="shop-item-name">${window.escHtml ? window.escHtml(item.name) : item.name}</span>
            ${priceLabel}
            <span class="${rarityClass}">${_st('shop_rarity_' + (item.rarity || 'common'))}</span>
            ${actionBtn}
        </div>`;
    }).join('');
}

function _buildItemPreview(category, pd) {
    switch (category) {
        case 'card_skin': {
            const bg = pd.preview_bg2
                ? `linear-gradient(135deg,${pd.preview_bg || '#1283b9'} 0%,${pd.preview_bg2} 100%)`
                : (pd.preview_bg || '#1283b9');
            return `<div class="shop-item-preview" style="background:${bg};width:100%;height:100%"><span class="shop-preview-question">?</span></div>`;
        }
        case 'board_bg': {
            if (pd.image_url) {
                return `<div style="width:100%;height:100%;background:url('${pd.image_url}') center/cover;border-radius:1px"></div>`;
            }
            const bg = pd.preview_bg2
                ? `linear-gradient(135deg,${pd.preview_bg || '#000'} 0%,${pd.preview_bg2} 100%)`
                : (pd.preview_bg || '#000');
            return `<div style="width:100%;height:100%;background:${bg};border-radius:1px"></div>`;
        }
        case 'match_color':
            return `<div class="shop-preview-color" style="background:${pd.color || '#1283b9'}"></div>`;
        case 'avatar_frame': {
            const frameStyle = _getFrameInlineStyle(pd.css_class);
            return `<div class="shop-preview-avatar" style="${frameStyle}">😶</div>`;
        }
        case 'title': {
            if (!pd.label) return `<span style="color:var(--metro-text-dim);font-size:11px">—</span>`;
            return `<div class="shop-preview-title" style="color:${pd.color || 'inherit'}">${pd.label}</div>`;
        }
        default: return '?';
    }
}

function _getFrameInlineStyle(cssClass) {
    switch (cssClass) {
        case 'frame-silver':   return 'box-shadow:0 0 0 3px #c0c0c0;border-radius:4px;';
        case 'frame-gold':     return 'box-shadow:0 0 0 3px #ffd700,0 0 10px rgba(255,215,0,0.5);border-radius:4px;';
        case 'frame-neon':     return 'box-shadow:0 0 0 2px #06b6d4,0 0 12px rgba(6,182,212,0.6);border-radius:4px;';
        case 'frame-champion': return 'box-shadow:0 0 0 3px #9333ea,0 0 18px rgba(147,51,234,0.7);border-radius:4px;';
        default: return '';
    }
}

// ── Покупка и экипировка ─────────────────────────────────────────────────────

async function shopBuyItem(itemKey) {
    const item = _shopItems.find(i => i.item_key === itemKey);
    if (!item) return;
    if (!confirm(_st('shop_buy_confirm', { name: item.name, price: item.price_mc }))) return;

    showShopMsg('', false);
    try {
        const csrf = await _shopFetchCsrf();
        const res = await fetch('/api/shop/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
            body: JSON.stringify({ item_key: itemKey }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
            showShopMsg(_shopErrLabel(data.error, data) || _st('shop_err_generic'), true);
            return;
        }
        document.querySelectorAll('.coins-display-val').forEach(el => {
            if (data.newBalance !== undefined) el.textContent = data.newBalance;
        });
        const idx = _shopItems.findIndex(i => i.item_key === itemKey);
        if (idx !== -1) _shopItems[idx].owned = true;
        showShopMsg(_st('shop_bought', { name: item.name }), false);
        renderShopGrid();
    } catch (_) {
        showShopMsg(_st('shop_err_net'), true);
    }
}

async function shopEquipItem(itemKey) {
    const item = _shopItems.find(i => i.item_key === itemKey);
    if (!item) return;

    showShopMsg('', false);
    try {
        const csrf = await _shopFetchCsrf();
        const res = await fetch('/api/shop/equip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
            body: JSON.stringify({ item_key: itemKey }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
            showShopMsg(_shopErrLabel(data.error) || _st('shop_err_generic'), true);
            return;
        }
        _shopItems.forEach(i => {
            if (i.category === item.category) i.equipped = false;
        });
        const idx = _shopItems.findIndex(i => i.item_key === itemKey);
        if (idx !== -1) _shopItems[idx].equipped = true;

        await _reloadAndApplyCosmetics();
        showShopMsg(_st('shop_equipped_msg', { name: item.name }), false);
        renderShopGrid();
    } catch (_) {
        showShopMsg(_st('shop_err_net'), true);
    }
}

function showShopMsg(text, isError) {
    const el = document.getElementById('shopMsg');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('hidden', !text);
    el.style.color = isError ? 'var(--accent-red)' : 'var(--accent-green)';
}

function _shopErrLabel(error, data) {
    switch (error) {
        case 'not_enough_coins': return _st('shop_err_not_enough', { price: data?.price || '?', current: data?.current || 0 });
        case 'already_owned':    return _st('shop_err_already_owned');
        case 'item_free':        return _st('shop_err_item_free');
        case 'not_owned':        return _st('shop_err_not_owned');
        case 'item_not_found':   return _st('shop_err_not_found');
        default: return null;
    }
}

async function _shopFetchCsrf() {
    try {
        const r = await fetch('/api/csrf');
        const d = await r.json();
        return d.token || '';
    } catch { return ''; }
}

// ── Применение косметики к UI ────────────────────────────────────────────────

async function _reloadAndApplyCosmetics() {
    try {
        const res = await fetch('/api/shop/my');
        if (!res.ok) return;
        window.userCosmetics = await res.json();
        applyCosmetics(window.userCosmetics);
    } catch (_) {}
}

const COSMETIC_BODY_CLASSES = [
    'card-purple','card-fire','card-galaxy','card-gold',
    'bg-space','bg-grid','bg-forest',
];
const FRAME_CLASSES = ['frame-silver','frame-gold','frame-neon','frame-champion'];

function applyCosmetics(cosmetics) {
    if (!cosmetics) return;

    COSMETIC_BODY_CLASSES.filter(c => c.startsWith('card-')).forEach(c => document.body.classList.remove(c));
    const cardCss = cosmetics.card_skin?.css_class;
    if (cardCss) document.body.classList.add(cardCss);

    COSMETIC_BODY_CLASSES.filter(c => c.startsWith('bg-')).forEach(c => document.body.classList.remove(c));
    const bgData = cosmetics.board_bg;
    if (bgData?.css_class) {
        document.body.classList.add(bgData.css_class);
    } else if (bgData?.image_url) {
        document.body.style.setProperty('--shop-bg-image', `url('${bgData.image_url}')`);
        document.body.classList.add('bg-custom-image');
    }

    FRAME_CLASSES.forEach(c => {
        document.querySelectorAll('.user-avatar, .avatar-lg').forEach(el => el.classList.remove(c));
    });
    const frameCss = cosmetics.avatar_frame?.css_class;
    if (frameCss) {
        document.querySelectorAll('.user-avatar, .avatar-lg').forEach(el => el.classList.add(frameCss));
    }

    document.querySelectorAll('.shop-title-inject').forEach(el => el.remove());
    const titleData = cosmetics.title;
    if (titleData?.label && titleData?.css_class && titleData.css_class !== 'shop-title-none') {
        const badge = `<span class="shop-title-badge ${titleData.css_class} shop-title-inject">${titleData.label}</span>`;
        const el = document.getElementById('currentUserDisp');
        if (el) el.insertAdjacentHTML('afterend', badge);
    }
}

window.applyCosmetics = applyCosmetics;

// ── Вкладки магазина ─────────────────────────────────────────────────────────

function initShopTabs() {
    document.querySelectorAll('.shop-cat-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.shop-cat-tab').forEach(b => b.classList.replace('accent-purple', 'secondary'));
            btn.classList.replace('secondary', 'accent-purple');
            _shopCurrentCat = btn.dataset.cat;
            renderShopGrid();
            showShopMsg('', false);
        });
    });
}

async function initShopCosmetics() {
    try {
        const res = await fetch('/api/shop/my');
        if (!res.ok) return;
        window.userCosmetics = await res.json();
        applyCosmetics(window.userCosmetics);
    } catch (_) {}
}

window.initShopCosmetics = initShopCosmetics;
window.loadShopItems     = loadShopItems;
window.shopBuyItem       = shopBuyItem;
window.shopEquipItem     = shopEquipItem;
window.showShopMsg       = showShopMsg;

document.addEventListener('DOMContentLoaded', () => {
    initShopTabs();
});
