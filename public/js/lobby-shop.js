// ==================== МАГАЗИН (пользователь) ====================

window.userCosmetics = null;
let _shopItems = [];
let _shopCurrentCat = 'card_skin';

function _st(key, vars) {
    const s = (typeof window.t === 'function') ? window.t(key) : key;
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : '{' + k + '}'));
}

function _shopEsc(value) {
    return window.escHtml ? window.escHtml(String(value ?? '')) : String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
}

function _shopLocalizedName(item) {
    const lang = window.currentLang === 'ru' ? 'ru' : 'en';
    const pd = item.preview_data || {};
    return pd[`name_${lang}`] || pd.name_ru || pd.name_en || item.name || '';
}

function _shopLocalizedDescription(item) {
    const lang = window.currentLang === 'ru' ? 'ru' : 'en';
    const pd = item.preview_data || {};
    return pd[`description_${lang}`] || pd.description_ru || pd.description_en || _st('shop_desc_' + item.category);
}

function _shopSafeColor(value, fallback = '#1283b9') {
    return typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : fallback;
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
    let items = _shopItems.filter(i => i.category === _shopCurrentCat);
    const query = (document.getElementById('shopSearch')?.value || '').trim().toLocaleLowerCase();
    const ownedOnly = !!document.getElementById('shopOwnedOnly')?.checked;
    if (query) {
        items = items.filter(item => `${_shopLocalizedName(item)} ${_shopLocalizedDescription(item)}`.toLocaleLowerCase().includes(query));
    }
    if (ownedOnly) items = items.filter(item => item.owned);

    const sort = document.getElementById('shopSort')?.value || 'recommended';
    const rarityOrder = { common: 0, rare: 1, epic: 2, legendary: 3 };
    if (sort === 'price_asc') items.sort((a, b) => Number(a.price_mc) - Number(b.price_mc));
    else if (sort === 'price_desc') items.sort((a, b) => Number(b.price_mc) - Number(a.price_mc));
    else if (sort === 'rarity') items.sort((a, b) => (rarityOrder[a.rarity] ?? 0) - (rarityOrder[b.rarity] ?? 0));

    const resultCount = document.getElementById('shopResultCount');
    if (resultCount) resultCount.textContent = _st('shop_results', { count: items.length });

    if (!items.length) {
        const hasFilters = !!query || ownedOnly;
        grid.innerHTML = `<div class="text-dim" style="padding:10px;grid-column:1/-1">${_st(hasFilters ? 'shop_no_results' : 'shop_empty')}</div>`;
        return;
    }

    grid.innerHTML = items.map(item => {
        const pd = item.preview_data || {};
        const ownedClass    = item.owned ? ' owned' : '';
        const equippedClass = item.equipped ? ' equipped' : '';
        const inactiveClass = item.available === false ? ' inactive-owned' : '';
        const name = _shopLocalizedName(item);
        const description = _shopLocalizedDescription(item);
        const priceLabel    = item.price_mc === 0
            ? `<span class="shop-item-price free">${_st('shop_free')}</span>`
            : `<span class="shop-item-price">🪙 ${item.price_mc}</span>`;
        const rarityClass   = `shop-item-rarity ${['common', 'rare', 'epic', 'legendary'].includes(item.rarity) ? item.rarity : 'common'}`;
        const equippedBadge = item.equipped ? `<span class="shop-equipped-badge">${_st('shop_equipped')}</span>` : '';
        const preview       = _buildItemPreview(item.category, pd);

        let actionBtn = '';
        if (item.equipped) {
            actionBtn = `<button type="button" class="metro-btn secondary shop-item-btn" disabled aria-label="${_shopEsc(_st('shop_equipped'))}">${_st('shop_equipped')}</button>`;
        } else if (item.owned) {
            actionBtn = `<button type="button" class="metro-btn accent-purple shop-item-btn shop-equip-btn" data-key="${_shopEsc(item.item_key)}" aria-label="${_shopEsc(_st('shop_equip') + ': ' + name)}">${_st('shop_equip')}</button>`;
        } else if (item.available !== false) {
            actionBtn = `<button type="button" class="metro-btn primary shop-item-btn shop-buy-btn" data-key="${_shopEsc(item.item_key)}" aria-label="${_shopEsc(_st('shop_buy') + ': ' + name)}">${_st('shop_buy')}</button>`;
        } else {
            actionBtn = `<span class="shop-item-unavailable">${_st('shop_not_for_sale')}</span>`;
        }

        return `
        <article class="shop-item${ownedClass}${equippedClass}${inactiveClass}" data-key="${_shopEsc(item.item_key)}" id="shop-item-${_shopEsc(item.item_key)}">
            ${equippedBadge}
            <div class="shop-item-preview">${preview}</div>
            <span class="shop-item-name">${_shopEsc(name)}</span>
            <span class="shop-item-description">${_shopEsc(description)}</span>
            ${priceLabel}
            <span class="${rarityClass}">${_st('shop_rarity_' + (item.rarity || 'common'))}</span>
            ${actionBtn}
        </article>`;
    }).join('');
}

function _buildItemPreview(category, pd) {
    const c1 = _shopSafeColor(pd.preview_bg, '#1283b9');
    const c2 = _shopSafeColor(pd.preview_bg2, '');
    switch (category) {
        case 'card_skin': {
            const bg = pd.preview_bg2
                ? `linear-gradient(135deg,${c1} 0%,${c2} 100%)`
                : c1;
            const sym = pd.card_symbol || '?';
            return `<div style="background:${bg};width:100%;height:100%;display:flex;align-items:center;justify-content:center"><span class="shop-preview-question">${_shopEsc(sym)}</span></div>`;
        }
        case 'board_bg': {
            if (typeof pd.image_url === 'string' && /^\/uploads\/shop-bg\/[A-Za-z0-9_.-]+$/.test(pd.image_url)) {
                return `<div style="width:100%;height:100%;background-image:url(&quot;${_shopEsc(pd.image_url)}&quot;);background-position:center;background-size:cover;border-radius:1px"></div>`;
            }
            const bg = pd.preview_bg2
                ? `linear-gradient(135deg,${c1} 0%,${c2} 100%)`
                : _shopSafeColor(pd.preview_bg, '#000');
            return `<div style="width:100%;height:100%;background:${bg};border-radius:1px"></div>`;
        }
        case 'match_color':
        case 'name_color':
            return `<div class="shop-preview-color" style="background:${_shopSafeColor(pd.color)}"></div>`;
        case 'avatar_frame': {
            const frameStyle = _getFrameInlineStyle(pd.css_class);
            return `<div class="shop-preview-avatar" style="${frameStyle}">😶</div>`;
        }
        case 'title': {
            if (!pd.label) return `<span style="color:var(--metro-text-dim);font-size:11px">—</span>`;
            return `<div class="shop-preview-title" style="color:${_shopSafeColor(pd.color, 'inherit')}">${_shopEsc(pd.label)}</div>`;
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
        case 'frame-ember':    return 'box-shadow:0 0 0 3px #f97316,0 0 14px rgba(249,115,22,0.75);border-radius:4px;';
        default: return '';
    }
}

// ── Custom confirm modal ─────────────────────────────────────────────────────

function _shopConfirm(item) {
    return new Promise(resolve => {
        const name = _shopLocalizedName(item);
        const overlay = document.createElement('div');
        overlay.className = 'shop-confirm-overlay';
        overlay.innerHTML = `
            <div class="shop-confirm-modal">
                <div class="shop-confirm-icon">🛒</div>
                <div class="shop-confirm-text">
                    ${_shopEsc(_st('shop_buy_confirm', { name, price: item.price_mc }))}<br>
                    <span class="shop-confirm-price">🪙 ${item.price_mc} MC</span>
                </div>
                <div class="shop-confirm-btns">
                    <button type="button" class="metro-btn secondary" id="_scCancel">${_st('shop_cancel')}</button>
                    <button type="button" class="metro-btn primary" id="_scOk">${_st('shop_buy')}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const onKey = e => { if (e.key === 'Escape') cleanup(false); };
        const cleanup = (val) => {
            document.removeEventListener('keydown', onKey);
            overlay.remove();
            resolve(val);
        };
        overlay.querySelector('#_scOk').onclick    = () => cleanup(true);
        overlay.querySelector('#_scCancel').onclick = () => cleanup(false);
        overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); });
        document.addEventListener('keydown', onKey);
        overlay.querySelector('#_scOk')?.focus();
    });
}

// ── Toast уведомления ────────────────────────────────────────────────────────

let _activeToast = null;

function showShopToast(text, type = 'success') {
    if (_activeToast) { _activeToast.remove(); _activeToast = null; }

    const cfg = {
        success: { icon: '🛍️', label: window.t('shop_toast_label_bought'), cls: '' },
        error:   { icon: '❌', label: window.t('shop_err_generic'),        cls: ' shop-toast-error' },
        equip:   { icon: '✨', label: window.t('shop_toast_label_equip'),  cls: ' shop-toast-equip' },
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
        showShopToast(_st('shop_bought', { name: _shopLocalizedName(item) }), 'success');
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
        showShopToast(_st('shop_equipped_msg', { name: _shopLocalizedName(item) }), 'equip');
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
const CARD_SKIN_CLASSES = ['card-purple','card-fire','card-galaxy','card-gold'];
const FRAME_CLASSES = ['frame-silver','frame-gold','frame-neon','frame-champion','frame-ember'];
const TITLE_CLASSES = ['shop-title-none','shop-title-veteran','shop-title-master','shop-title-legend','shop-title-king'];

function applyCosmetics(cosmetics) {
    if (!cosmetics) return;

    COSMETIC_BODY_CLASSES.filter(c => c.startsWith('card-')).forEach(c => document.body.classList.remove(c));
    document.body.style.removeProperty('--shop-card-back');
    document.body.style.removeProperty('--card-symbol');
    const cardCss = cosmetics.card_skin?.css_class;
    if (CARD_SKIN_CLASSES.includes(cardCss)) document.body.classList.add(cardCss);
    const cardData = cosmetics.card_skin || {};
    const cardBg = cardData.preview_bg2
        ? `linear-gradient(135deg,${_shopSafeColor(cardData.preview_bg)} 0%,${_shopSafeColor(cardData.preview_bg2)} 100%)`
        : _shopSafeColor(cardData.preview_bg);
    document.body.style.setProperty('--shop-card-back', cardBg);
    document.body.style.setProperty('--card-symbol', JSON.stringify(typeof cardData.card_symbol === 'string' ? cardData.card_symbol : '?'));

    // Фон доски — раздельные CSS-переменные --board-bg-image и --board-bg-size
    COSMETIC_BODY_CLASSES.filter(c => c.startsWith('bg-')).forEach(c => document.body.classList.remove(c));
    document.body.classList.remove('bg-custom-color');
    document.body.style.removeProperty('--board-bg-image');
    document.body.style.removeProperty('--board-bg-size');
    const bgData = cosmetics.board_bg;
    if (bgData && bgData.item_key !== 'bg_default') {
        if (typeof bgData.image_url === 'string' && /^\/uploads\/shop-bg\/[A-Za-z0-9_.-]+$/.test(bgData.image_url)) {
            document.body.style.setProperty('--board-bg-image', `url("${bgData.image_url}")`);
            document.body.style.setProperty('--board-bg-size', 'cover');
            document.body.classList.add('bg-custom-color');
        } else if (bgData.preview_bg) {
            const grad = bgData.preview_bg2
                ? `linear-gradient(135deg,${bgData.preview_bg} 0%,${bgData.preview_bg2} 100%)`
                : bgData.preview_bg;
            document.body.style.setProperty('--board-bg-image', grad);
            document.body.style.setProperty('--board-bg-size', 'auto');
            document.body.classList.add('bg-custom-color');
        }
    }

    // Рамки аватаров — только лобби (.user-avatar); игровые (.avatar-lg) управляются applyPlayerDisplay
    FRAME_CLASSES.forEach(c => {
        document.querySelectorAll('.user-avatar').forEach(el => el.classList.remove(c));
    });
    const frameCss = cosmetics.avatar_frame?.css_class;
    if (FRAME_CLASSES.includes(frameCss) && frameCss !== 'frame-none') {
        document.querySelectorAll('.user-avatar').forEach(el => el.classList.add(frameCss));
    }

    document.querySelectorAll('.shop-title-inject').forEach(el => el.remove());
    const currentUser = document.getElementById('currentUserDisp');
    const nameColor = _shopSafeColor(cosmetics.name_color?.color, '');
    if (currentUser) {
        if (nameColor) currentUser.style.color = nameColor;
        else currentUser.style.removeProperty('color');
    }
    const titleData = cosmetics.title;
    if (titleData?.label && TITLE_CLASSES.includes(titleData.css_class) && titleData.css_class !== 'shop-title-none') {
        const badge = document.createElement('span');
        badge.className = `shop-title-badge ${titleData.css_class} shop-title-inject`;
        badge.textContent = titleData.label;
        const titleColor = _shopSafeColor(titleData.color, '');
        if (titleColor) badge.style.color = titleColor;
        if (currentUser) currentUser.insertAdjacentElement('afterend', badge);
    }
}

window.applyCosmetics = applyCosmetics;

// ── Живой предпросмотр предметов ─────────────────────────────────────────────

function _initShopLivePreview() {
    const grid = document.getElementById('shopItemsGrid');
    if (!grid || grid.dataset.shopPreviewBound === '1') return;
    grid.dataset.shopPreviewBound = '1';

    // Используем event delegation для hover
    grid.addEventListener('mouseenter', e => {
        const card = e.target.closest('.shop-item[data-key]');
        if (!card) return;
        const key  = card.dataset.key;
        const item = _shopItems.find(i => i.item_key === key);
        if (item) _showLivePreview(item);
    }, true);
    grid.addEventListener('focusin', e => {
        const card = e.target.closest('.shop-item[data-key]');
        const item = card && _shopItems.find(i => i.item_key === card.dataset.key);
        if (item) _showLivePreview(item);
    });
    grid.addEventListener('click', e => {
        const card = e.target.closest('.shop-item[data-key]');
        const item = card && _shopItems.find(i => i.item_key === card.dataset.key);
        if (item) _showLivePreview(item);
    });

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
    const userName    = window.currentUsername || document.getElementById('currentUserDisp')?.textContent || '';

    // Рамка: если это avatar_frame — берём из предмета, иначе из текущей косметики
    const frameStyle = item.category === 'avatar_frame'
        ? _getFrameInlineStyle(pd.css_class)
        : _getFrameInlineStyle(cos.avatar_frame?.css_class || '');

    // Звание: если это title — берём из предмета
    let titleHtml = '';
    if (item.category === 'title') {
        if (pd.label) titleHtml = `<span class="shop-lp-title-badge" style="background:rgba(0,0,0,0.4);color:${_shopSafeColor(pd.color, '#fff')}">${_shopEsc(pd.label)}</span>`;
    } else {
        const t = cos.title;
        if (t?.label && t.css_class !== 'shop-title-none') {
            titleHtml = `<span class="shop-lp-title-badge" style="background:rgba(0,0,0,0.4);color:${_shopSafeColor(t.color, '#fff')}">${_shopEsc(t.label)}</span>`;
        }
    }

    // Цвет карточки совпадения
    const matchColor = item.category === 'match_color'
        ? _shopSafeColor(pd.color, '#1ba1e2')
        : _shopSafeColor(cos.match_color?.color, '#1ba1e2');
    const nameColor = item.category === 'name_color'
        ? _shopSafeColor(pd.color, '#fff')
        : _shopSafeColor(cos.name_color?.color, '#fff');

    const esc = _shopEsc;

    plrEl.innerHTML = `
        <div class="shop-lp-avatar" style="${frameStyle}">${esc(avatarEmoji)}</div>
        <div class="shop-lp-info">
            <div class="shop-lp-name" style="color:${nameColor}">${esc(userName)}</div>
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
                ? `linear-gradient(135deg,${_shopSafeColor(pd.preview_bg)} 0%,${_shopSafeColor(pd.preview_bg2)} 100%)`
                : _shopSafeColor(pd.preview_bg);
            const sym = pd.card_symbol || '?';
            return `<div style="background:${bg};width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem">${_shopEsc(sym)}</div>`;
        }
        case 'board_bg': {
            let bgCss = '';
            if (typeof pd.image_url === 'string' && /^\/uploads\/shop-bg\/[A-Za-z0-9_.-]+$/.test(pd.image_url)) {
                bgCss = `url("${pd.image_url}") center/cover no-repeat`;
            } else {
                bgCss = pd.preview_bg2
                    ? `linear-gradient(135deg,${_shopSafeColor(pd.preview_bg, '#000')} 0%,${_shopSafeColor(pd.preview_bg2, '#000')} 100%)`
                    : _shopSafeColor(pd.preview_bg, '#000');
            }
            return `<div class="shop-lp-bg-preview" style="background:${bgCss}">
                ${'<div class="shop-lp-bg-card"></div>'.repeat(9)}
            </div>`;
        }
        case 'match_color': {
            return `<div style="width:100%;height:100%;background:${_shopSafeColor(pd.color, '#1ba1e2')};border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:1.5rem">✓</div>`;
        }
        case 'name_color': {
            return `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:15px;font-weight:700;color:${_shopSafeColor(pd.color, '#fff')}">Игрок</div>`;
        }
        case 'avatar_frame': {
            const fs = _getFrameInlineStyle(pd.css_class);
            const av = document.getElementById('currentUserAvatar')?.textContent || '😶';
            return `<div style="${fs};display:flex;align-items:center;justify-content:center;font-size:2.4rem;width:100%;height:100%">${window.escHtml ? window.escHtml(av) : av}</div>`;
        }
        case 'title': {
            if (!pd.label) return `<span style="color:var(--metro-text-dim)">—</span>`;
            return `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:0.85rem;font-weight:700;color:${_shopSafeColor(pd.color, '#fff')};padding:4px;text-align:center">${_shopEsc(pd.label)}</div>`;
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
            document.querySelectorAll('.shop-cat-tab').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
            _shopCurrentCat = btn.dataset.cat;
            renderShopGrid();
            _hideLivePreview();
            showShopMsg('', false);
        });
    });
    document.getElementById('shopSearch')?.addEventListener('input', renderShopGrid);
    document.getElementById('shopOwnedOnly')?.addEventListener('change', renderShopGrid);
    document.getElementById('shopSort')?.addEventListener('change', renderShopGrid);
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
