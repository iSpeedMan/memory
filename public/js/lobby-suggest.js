// ==================== SUGGEST CATEGORY (My Suggestions) ====================
async function loadMySuggestions() {
    const container = document.getElementById('mySuggestionsContainer');
    if (!container) return;
    container.innerHTML = `<div class="metro-list-item text-dim">${window.t('wait_msg')}</div>`;
    try {
        const res = await fetch('/api/categories/my-suggestions');
        const rows = await res.json();
        if (!rows.length) {
            container.innerHTML = `<div class="metro-list-item text-dim">${window.t('custom_cat_empty')}</div>`;
            return;
        }
        container.innerHTML = rows.map(r => {
            const statusMap = { pending: `<span class="text-dim">${window.t('custom_cat_pending')}</span>`, approved: `<span class="text-accent">${window.t('custom_cat_approved')}</span>`, rejected: `<span class="metro-error">${window.t('custom_cat_rejected')}</span>` };
            const statusHtml = statusMap[r.status] || r.status;
            const imgHtml = r.image_url ? `<img src="${window.escHtml(r.image_url)}" class="suggest-submission-img" alt="">` : '';
            return `<div class="metro-list-item suggest-submission-item">${imgHtml}<div><b>${window.escHtml(r.key_name)}</b> ${window.escHtml(r.display_name)} ${statusHtml}</div></div>`;
        }).join('');
    } catch (e) {
        container.innerHTML = `<div class="metro-list-item text-dim">${window.t('profile_load_error')}</div>`;
    }
}

// ==================== SUGGEST TABS ====================
const suggestTabEmoji = document.getElementById('suggestTabEmoji');
const suggestTabImage = document.getElementById('suggestTabImage');
const suggestFormEmoji = document.getElementById('suggestFormEmoji');
const suggestFormImage = document.getElementById('suggestFormImage');

function switchSuggestTab(tab) {
    if (tab === 'emoji') {
        if (suggestFormEmoji) suggestFormEmoji.classList.remove('hidden');
        if (suggestFormImage) suggestFormImage.classList.add('hidden');
        if (suggestTabEmoji) { suggestTabEmoji.classList.remove('secondary'); suggestTabEmoji.classList.add('accent-purple'); }
        if (suggestTabImage) { suggestTabImage.classList.remove('accent-purple'); suggestTabImage.classList.add('secondary'); }
    } else {
        if (suggestFormEmoji) suggestFormEmoji.classList.add('hidden');
        if (suggestFormImage) suggestFormImage.classList.remove('hidden');
        if (suggestTabImage) { suggestTabImage.classList.remove('secondary'); suggestTabImage.classList.add('accent-purple'); }
        if (suggestTabEmoji) { suggestTabEmoji.classList.remove('accent-purple'); suggestTabEmoji.classList.add('secondary'); }
    }
}

if (suggestTabEmoji) suggestTabEmoji.onclick = () => switchSuggestTab('emoji');
if (suggestTabImage) suggestTabImage.onclick = () => switchSuggestTab('image');

let suggestFilePicker = null;
if (document.getElementById('suggestCatFileZone')) {
    suggestFilePicker = window.initFilePickerZone({ zoneId: 'suggestCatFileZone', inputId: 'suggestCatImages', min: 9, max: 32 });
}

async function submitSuggestForm(key, name, formData, msgEl, btn) {
    btn.disabled = true;
    try {
        const res = await fetch('/api/categories/suggest', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
            if (msgEl) { msgEl.textContent = window.t('custom_cat_success'); msgEl.className = 'metro-error text-accent'; msgEl.classList.remove('hidden'); }
            loadMySuggestions();
            setTimeout(() => { if (msgEl) msgEl.classList.add('hidden'); }, 3000);
        } else {
            if (msgEl) { msgEl.textContent = data.error || window.t('server_error'); msgEl.className = 'metro-error'; msgEl.classList.remove('hidden'); }
        }
    } catch (e) {
        if (msgEl) { msgEl.textContent = window.t('server_error'); msgEl.className = 'metro-error'; msgEl.classList.remove('hidden'); }
    } finally {
        btn.disabled = false;
    }
}

const sendSuggestEmojiBtn = document.getElementById('sendSuggestEmojiBtn');
if (sendSuggestEmojiBtn) sendSuggestEmojiBtn.onclick = async () => {
    const key = (document.getElementById('suggestEmojiKey')?.value || '').trim();
    const name = (document.getElementById('suggestEmojiName')?.value || '').trim();
    const emojis = (document.getElementById('suggestEmojiList')?.value || '').trim();
    const msgEl = document.getElementById('suggestEmojiMsg');
    if (!key || !name) {
        if (msgEl) { msgEl.textContent = window.t('please_fill_in_the_required_fields'); msgEl.className = 'metro-error'; msgEl.classList.remove('hidden'); }
        return;
    }
    if (!emojis) {
        if (msgEl) { msgEl.textContent = window.t('exactly_18_emojis'); msgEl.className = 'metro-error'; msgEl.classList.remove('hidden'); }
        return;
    }
    const formData = new FormData();
    formData.append('key_name', key);
    formData.append('display_name', name);
    formData.append('emojis', emojis);
    await submitSuggestForm(key, name, formData, msgEl, sendSuggestEmojiBtn);
    if (msgEl && !msgEl.classList.contains('hidden') && msgEl.classList.contains('text-accent')) {
        document.getElementById('suggestEmojiKey').value = '';
        document.getElementById('suggestEmojiName').value = '';
        document.getElementById('suggestEmojiList').value = '';
    }
};

const sendSuggestImageBtn = document.getElementById('sendSuggestImageBtn');
if (sendSuggestImageBtn) sendSuggestImageBtn.onclick = async () => {
    const key = (document.getElementById('suggestImageKey')?.value || '').trim();
    const name = (document.getElementById('suggestImageName')?.value || '').trim();
    const imageInput = document.getElementById('suggestCatImages');
    const msgEl = document.getElementById('suggestImageMsg');
    if (!key || !name) {
        if (msgEl) { msgEl.textContent = window.t('please_fill_in_the_required_fields'); msgEl.className = 'metro-error'; msgEl.classList.remove('hidden'); }
        return;
    }
    const count = imageInput ? imageInput.files.length : 0;
    if (count < 9 || count > 32) {
        if (msgEl) {
            msgEl.textContent = window.t ? window.t('admin_cat_select_images') : 'Select 9–32 images';
            msgEl.className = 'metro-error';
            msgEl.classList.remove('hidden');
        }
        return;
    }
    const reprEmoji = (document.getElementById('suggestImageEmoji')?.value || '').trim();
    const formData = new FormData();
    formData.append('key_name', key);
    formData.append('display_name', name);
    formData.append('repr_emoji', reprEmoji || '🖼️');
    sendSuggestImageBtn.disabled = true;
    if (msgEl) { msgEl.textContent = window.t ? window.t('compressing') : '⏳ Compressing…'; msgEl.className = 'metro-error upload-progress-msg'; msgEl.classList.remove('hidden'); }
    const filesToUpload = suggestFilePicker
        ? await suggestFilePicker.getCompressedFiles()
        : Array.from(imageInput.files);
    filesToUpload.forEach(f => formData.append('images', f));
    if (msgEl) { msgEl.textContent = window.t ? window.t('uploading') : '📤 Uploading…'; }
    sendSuggestImageBtn.disabled = false;
    await submitSuggestForm(key, name, formData, msgEl, sendSuggestImageBtn);
    if (msgEl && !msgEl.classList.contains('hidden') && msgEl.classList.contains('text-accent')) {
        document.getElementById('suggestImageKey').value = '';
        document.getElementById('suggestImageName').value = '';
        const suggestEmojiEl = document.getElementById('suggestImageEmoji');
        if (suggestEmojiEl) suggestEmojiEl.value = '';
        if (suggestFilePicker) suggestFilePicker.reset();
    }
};

// ==================== ESC ====================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        ['profileModal', 'adminModal', 'botModal', 'publicProfileModal'].forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.classList.contains('hidden')) el.classList.add('hidden');
        });
        const lbWrapper = document.getElementById('leaderboardWrapper');
        if (lbWrapper && lbWrapper.classList.contains('show-modal')) lbWrapper.classList.remove('show-modal');
    }
});
