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
