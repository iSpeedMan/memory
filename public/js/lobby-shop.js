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

        let actionBtn = '';
        if (item.equipped) {
            actionBtn = `<button class="metro-btn secondary shop-item-btn" disabled>${_st('shop_equipped')}</button>`;
        } else if (item.owned || item.price_mc === 0) {
            actionBtn = `<button class="metro-btn accent-purple shop-item-btn shop-equip-btn" data-key="${item.item_key}">${_st('shop_equip')}</button>`;
        } else {
            actionBtn = `<button class="metro-btn primary shop-item-btn shop-buy-btn" data-key="${item.item_key}">${_st('shop_buy')}</button>`;
        }

        return `
        <div class="shop-item${ownedClass}${equippedClass}" data-key="${item.item_key}" id="shop-item-${item.item_key}">
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
            const sym = pd.card_symbol || '?';
            return `<div style="background:${bg};width:100%;height:100%;display:flex;align-items:center;justify-content:center"><span class="shop-preview-question">${window.escHtml ? window.escHtml(sym) : sym}</span></div>`;
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

// ── Custom confirm modal ─────────────────────────────────────────────────────

function _shopConfirm(item) {
    return new Promise(resolve => {
        const esc = s => (window.escHtml ? window.escHtml(s) : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'));
        const overlay = document.createElement('div');
        overlay.className = 'shop-confirm-overlay';
        overlay.innerHTML = `
            <div class="shop-confirm-modal">
                <div class="shop-confirm-icon">🛒</div>
                <div class="shop-confirm-text">
                    Купить <strong>${esc(item.name)}</strong>?<br>
                    <span class="shop-confirm-price">🪙 ${item.price_mc} MC</span>
                </div>
                <div class="shop-confirm-btns">
                    <button class="metro-btn secondary" id="_scCancel">Отмена</button>
                    <button class="metro-btn primary" id="_scOk">Купить</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const cleanup = (val) => { overlay.remove(); resolve(val); };
        overlay.querySelector('#_scOk').onclick    = () => cleanup(true);
        overlay.querySelector('#_scCancel').onclick = () => cleanup(false);
        overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); });
        const onKey = e => { if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); cleanup(false); } };
        document.addEventListener('keydown', onKey);
    });
}

// ── Toast уведомления ────────────────────────────────────────────────────────

let _activeToast = null;

function showShopToast(text, type = 'success') {
    if (_activeToast) { _activeToast.remove(); _activeToast = null; }

    const cfg = {
        success: { icon: '🛍️', label: 'Куплено',     cls: '' },
        error:   { icon: '❌', label: 'Ошибка',       cls: ' shop-toast-error' },
        equip:   { icon: '✨', label: 'Экипировано',   cls: ' shop-toast-equip' },
    }[type] || { icon: '🛍️', label: '', cls: '' };

    const toast = document.createElement('div');
    toast.className = `achievement-toast shop-toast${cfg.cls}`;
    toast.innerHTML = `
        <div class="achievement-toast-icon">${cfg.icon}</div>
        <div class="achievement-toast-body">
            <div class="achievement-toast-title">${cfg.label}</div>
            <div class="achievement-toast-name">${window.escHtml ? window.escHtml(text) : text}</div>
        </div>`;
    document.body.appendChild(toast);
    _activeToast = toast;

    const hide = () => {
        toast.classList.add('toast-out');
        setTimeout(() => { if (toast.parentNode) toast.remove(); if (_activeToast === toast) _activeToast = null; }, 520);
    };
    const timer = setTimeout(hide, 3200);
    toast.addEventListener('click', () => { clearTimeout(timer); hide(); });
}

function showShopMsg(text, isError) {
    const el = document.getElementById('shopMsg');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('hidden', !text);
    el.style.color = isError ? 'var(--accent-red)' : 'var(--accent-green)';
    if (text) showShopToast(text, isError ? 'error' : 'success');
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

// ── EVENT DELEGATION для кнопок покупки/экипировки ───────────────────────────

function _initShopGridDelegation() {
    const grid = document.getElementById('shopItemsGrid');
    if (!grid) return;
    grid.addEventListener('click', e => {
        const buyBtn   = e.target.closest('.shop-buy-btn');
        const equipBtn = e.target.closest('.shop-equip-btn');
        if (buyBtn)   shopBuyItem(buyBtn.dataset.key);
        if (equipBtn) shopEquipItem(equipBtn.dataset.key);
    });
}

// ── Покупка и экипировка ─────────────────────────────────────────────────────

async function shopBuyItem(itemKey) {
    const item = _shopItems.find(i => i.item_key === itemKey);
    if (!item) return;
    const confirmed = await _shopConfirm(item);
    if (!confirmed) return;

    try {
        const csrf = await _shopFetchCsrf();
        const res = await fetch('/api/shop/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
            body: JSON.stringify({ item_key: itemKey }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
            showShopToast(_shopErrLabel(data.error, data) || _st('shop_err_generic'), 'error');
            return;
        }
        document.querySelectorAll('.coins-display-val').forEach(el => {
            if (data.newBalance !== undefined) el.textContent = data.newBalance;
        });
        const idx = _shopItems.findIndex(i => i.item_key === itemKey);
        if (idx !== -1) _shopItems[idx].owned = true;
        showShopToast(_st('shop_bought', { name: item.name }), 'success');
        renderShopGrid();
        _initShopLivePreview();
    } catch (_) {
        showShopToast(_st('shop_err_net'), 'error');
    }
}

async function shopEquipItem(itemKey) {
    const item = _shopItems.find(i => i.item_key === itemKey);
    if (!item) return;

    try {
        const csrf = await _shopFetchCsrf();
        const res = await fetch('/api/shop/equip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
            body: JSON.stringify({ item_key: itemKey }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
            showShopToast(_shopErrLabel(data.error) || _st('shop_err_generic'), 'error');
            return;
        }
        _shopItems.forEach(i => { if (i.category === item.category) i.equipped = false; });
        const idx = _shopItems.findIndex(i => i.item_key === itemKey);
        if (idx !== -1) _shopItems[idx].equipped = true;

        await _reloadAndApplyCosmetics();
        showShopToast(_st('shop_equipped_msg', { name: item.name }), 'equip');
        renderShopGrid();
        _initShopLivePreview();
    } catch (_) {
        showShopToast(_st('shop_err_net'), 'error');
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
    'bg-space','bg-grid','bg-forest','bg-custom-image',
];
const FRAME_CLASSES = ['frame-silver','frame-gold','frame-neon','frame-champion'];

function applyCosmetics(cosmetics) {
    if (!cosmetics) return;

    COSMETIC_BODY_CLASSES.filter(c => c.startsWith('card-')).forEach(c => document.body.classList.remove(c));
    const cardCss = cosmetics.card_skin?.css_class;
    if (cardCss) document.body.classList.add(cardCss);

    // Фон доски — применяем через CSS-переменную --board-bg к .metro-board
    COSMETIC_BODY_CLASSES.filter(c => c.startsWith('bg-')).forEach(c => document.body.classList.remove(c));
    document.body.classList.remove('bg-custom-color');
    document.body.style.removeProperty('--board-bg');
    const bgData = cosmetics.board_bg;
    if (bgData && bgData.item_key !== 'bg_default') {
        if (bgData.image_url) {
            document.body.style.setProperty('--board-bg', `url('${bgData.image_url}') center/cover no-repeat`);
            document.body.classList.add('bg-custom-color');
        } else if (bgData.preview_bg) {
            const grad = bgData.preview_bg2
                ? `linear-gradient(135deg,${bgData.preview_bg} 0%,${bgData.preview_bg2} 100%)`
                : bgData.preview_bg;
            document.body.style.setProperty('--board-bg', grad);
            document.body.classList.add('bg-custom-color');
        }
    }

    // Рамки аватаров — только лобби (.user-avatar); игровые (.avatar-lg) управляются applyPlayerDisplay
    FRAME_CLASSES.forEach(c => {
        document.querySelectorAll('.user-avatar').forEach(el => el.classList.remove(c));
    });
    const frameCss = cosmetics.avatar_frame?.css_class;
    if (frameCss && frameCss !== 'frame-none') {
        document.querySelectorAll('.user-avatar').forEach(el => el.classList.add(frameCss));
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

// ── Живой предпросмотр предметов ─────────────────────────────────────────────

function _initShopLivePreview() {
    const grid = document.getElementById('shopItemsGrid');
    if (!grid) return;

    // Используем event delegation для hover
    grid.addEventListener('mouseenter', e => {
        const card = e.target.closest('.shop-item[data-key]');
        if (!card) return;
        const key  = card.dataset.key;
        const item = _shopItems.find(i => i.item_key === key);
        if (item) _showLivePreview(item);
    }, true);

    grid.addEventListener('mouseleave', e => {
        if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('.shop-item')) {
            _hideLivePreview();
        }
    }, true);
}

function _showLivePreview(item) {
    const panel  = document.getElementById('shopLivePreview');
    const cosmEl = document.getElementById('shopLpCosm');
    const plrEl  = document.getElementById('shopLpPlayer');
    if (!panel || !cosmEl || !plrEl) return;

    const pd  = item.preview_data || {};
    const cos = window.userCosmetics || {};

    // — большой превью косметики —
    cosmEl.innerHTML = _buildLargeCosm(item.category, pd);

    // — панель игрока с применённой косметикой —
    const avatarEmoji = document.getElementById('currentUserAvatar')?.textContent || '😶';
    const userName    = document.getElementById('currentUserDisp')?.textContent   || '';

    // Рамка: если это avatar_frame — берём из предмета, иначе из текущей косметики
    const frameStyle = item.category === 'avatar_frame'
        ? _getFrameInlineStyle(pd.css_class)
        : _getFrameInlineStyle(cos.avatar_frame?.css_class || '');

    // Звание: если это title — берём из предмета
    let titleHtml = '';
    if (item.category === 'title') {
        if (pd.label) titleHtml = `<span class="shop-lp-title-badge" style="background:rgba(0,0,0,0.4);color:${pd.color || '#fff'}">${pd.label}</span>`;
    } else {
        const t = cos.title;
        if (t?.label && t.css_class !== 'shop-title-none') {
            titleHtml = `<span class="shop-lp-title-badge" style="background:rgba(0,0,0,0.4);color:${t.color || '#fff'}">${t.label}</span>`;
        }
    }

    // Цвет карточки совпадения
    const matchColor = item.category === 'match_color'
        ? (pd.color || '#1ba1e2')
        : (cos.match_color?.color || '#1ba1e2');

    const esc = s => (window.escHtml ? window.escHtml(s) : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'));

    plrEl.innerHTML = `
        <div class="shop-lp-avatar" style="${frameStyle}">${esc(avatarEmoji)}</div>
        <div class="shop-lp-info">
            <div class="shop-lp-name">${esc(userName)}</div>
            ${titleHtml}
            <div class="shop-lp-color-row">
                <div class="shop-lp-color-dot" style="background:${matchColor}"></div>
                <span>цвет пар</span>
            </div>
        </div>`;

    panel.classList.remove('hidden');
}

function _buildLargeCosm(category, pd) {
    switch (category) {
        case 'card_skin': {
            const bg = pd.preview_bg2
                ? `linear-gradient(135deg,${pd.preview_bg || '#1283b9'} 0%,${pd.preview_bg2} 100%)`
                : (pd.preview_bg || '#1283b9');
            const sym = pd.card_symbol || '?';
            return `<div style="background:${bg};width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem">${window.escHtml ? window.escHtml(sym) : sym}</div>`;
        }
        case 'board_bg': {
            let bgCss = '';
            if (pd.image_url) {
                bgCss = `url('${pd.image_url}') center/cover no-repeat`;
            } else {
                bgCss = pd.preview_bg2
                    ? `linear-gradient(135deg,${pd.preview_bg || '#000'} 0%,${pd.preview_bg2} 100%)`
                    : (pd.preview_bg || '#000');
            }
            return `<div class="shop-lp-bg-preview" style="background:${bgCss}">
                ${'<div class="shop-lp-bg-card"></div>'.repeat(9)}
            </div>`;
        }
        case 'match_color': {
            return `<div style="width:100%;height:100%;background:${pd.color || '#1ba1e2'};border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:1.5rem">✓</div>`;
        }
        case 'avatar_frame': {
            const fs = _getFrameInlineStyle(pd.css_class);
            const av = document.getElementById('currentUserAvatar')?.textContent || '😶';
            return `<div style="${fs};display:flex;align-items:center;justify-content:center;font-size:2.4rem;width:100%;height:100%">${window.escHtml ? window.escHtml(av) : av}</div>`;
        }
        case 'title': {
            if (!pd.label) return `<span style="color:var(--metro-text-dim)">—</span>`;
            return `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:0.85rem;font-weight:700;color:${pd.color || '#fff'};padding:4px;text-align:center">${pd.label}</div>`;
        }
        default: return '';
    }
}

function _hideLivePreview() {
    const panel = document.getElementById('shopLivePreview');
    if (panel) panel.classList.add('hidden');
}

// ── Вкладки магазина ─────────────────────────────────────────────────────────

function initShopTabs() {
    document.querySelectorAll('.shop-cat-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.shop-cat-tab').forEach(b => b.classList.replace('accent-purple', 'secondary'));
            btn.classList.replace('secondary', 'accent-purple');
            _shopCurrentCat = btn.dataset.cat;
            renderShopGrid();
            _hideLivePreview();
            showShopMsg('', false);
        });
    });
    _initShopGridDelegation();
    _initShopLivePreview();
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
