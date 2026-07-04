// ==================== CHAT SHARED UTILITIES ====================
window.knownUsers = [];

window.renderChatText = function(text) {
    let safe = window.escHtml(text);
    const known = window.knownUsers;
    if (known && known.length > 0) {
        safe = safe.replace(/@([\w-]{1,32})/g, (m, name) => {
            const isKnown = known.some(u => u.toLowerCase() === name.toLowerCase());
            return isKnown ? `<span class="chat-mention">${m}</span>` : m;
        });
    }
    return safe;
};

window.setupMentionInput = function(inputEl) {
    const dropdown = document.getElementById('mentionDropdown');
    if (!inputEl || !dropdown) return;

    inputEl.addEventListener('input', () => {
        const val = inputEl.value;
        const pos = inputEl.selectionStart != null ? inputEl.selectionStart : val.length;
        const before = val.slice(0, pos);
        const match = before.match(/@([\w-]*)$/);
        if (!match) { dropdown.classList.add('hidden'); return; }
        const query = match[1].toLowerCase();
        const self = (window.currentUsername || '').toLowerCase();
        const filtered = (window.knownUsers || [])
            .filter(u => u.toLowerCase().startsWith(query) && u.toLowerCase() !== self)
            .slice(0, 6);
        if (!filtered.length) { dropdown.classList.add('hidden'); return; }
        dropdown.innerHTML = filtered.map(u =>
            `<div class="mention-option" data-name="${window.escHtml(u)}" role="option">@${window.escHtml(u)}</div>`
        ).join('');
        const rect = inputEl.getBoundingClientRect();
        dropdown.style.left = rect.left + 'px';
        dropdown.style.width = Math.max(180, rect.width) + 'px';
        dropdown.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
        dropdown.style.top = 'auto';
        dropdown.classList.remove('hidden');
    });

    dropdown.addEventListener('mousedown', (e) => {
        const opt = e.target.closest('.mention-option');
        if (!opt) return;
        e.preventDefault();
        const name = opt.dataset.name;
        const val = inputEl.value;
        const pos = inputEl.selectionStart != null ? inputEl.selectionStart : val.length;
        const before = val.slice(0, pos);
        const newBefore = before.replace(/@[\w-]*$/, `@${name} `);
        inputEl.value = newBefore + val.slice(pos);
        inputEl.focus();
        dropdown.classList.add('hidden');
    });

    inputEl.addEventListener('blur', () => setTimeout(() => dropdown.classList.add('hidden'), 150));
    inputEl.addEventListener('keydown', (e) => {
        if (!dropdown.classList.contains('hidden') && (e.key === 'Escape' || e.key === 'Tab')) {
            dropdown.classList.add('hidden');
        }
    });
};

// ==================== CHAT MESSAGE BUILDER ====================
window.buildChatMsg = function(msg) {
    const el = document.createElement('div');
    el.className = 'chat-message';
    if (msg.id) el.dataset.msgId = msg.id;
    if (msg.userId) el.dataset.userId = String(msg.userId);
    el.dataset.username = msg.username || '';
    const isSelf = msg.username === window.currentUsername;
    if (isSelf) el.classList.add('chat-msg-self');
    const canDelete = isSelf || window.isAdmin;
    const canEdit = isSelf;
    const editBtn = (canEdit && msg.id)
        ? `<button class="chat-edit-btn" title="${window.t('chat_edit') || 'Edit'}">✏️</button>` : '';
    const delBtn = (canDelete && msg.id)
        ? `<button class="chat-delete-btn" title="${window.t('chat_delete') || 'Delete'}">🗑️</button>` : '';
    const actionsHtml = (editBtn || delBtn)
        ? `<div class="chat-msg-actions">${editBtn}${delBtn}</div>` : '';
    const editedTag = msg.edited
        ? ` <em class="chat-msg-edited">${window.t('chat_edited') || '(edited)'}</em>` : '';
    el.innerHTML = `<button class="chat-profile-btn" data-username="${window.escHtml(msg.username || '')}" title="${window.t('view_profile') || 'Profile'}"><span class="chat-msg-avatar">${window.escHtml(msg.avatar || '😶')}</span><span class="chat-msg-name">${window.escHtml(msg.username || '')}</span></button><span class="chat-msg-text">${window.renderChatText(msg.text || '')}${editedTag}</span>${actionsHtml}`;
    return el;
};

// ==================== CHAT CONTAINER EVENT DELEGATION ====================
function setupChatEditInPlace(msgEl, socket) {
    const textEl = msgEl.querySelector('.chat-msg-text');
    if (!textEl || msgEl.dataset.editing) return;
    msgEl.dataset.editing = '1';
    const origHtml = textEl.innerHTML;
    const origText = textEl.textContent.trim().replace(/[\u00a0]?\(edited\)$/, '').replace(/[\u00a0]?\(ред\.\)$/, '').trim();
    textEl.innerHTML = `<input class="chat-edit-input" value="${window.escHtml(origText)}" maxlength="100"><span class="chat-edit-actions"><button class="chat-edit-save" title="Save">✓</button><button class="chat-edit-cancel" title="Cancel">✕</button></span>`;
    const input = textEl.querySelector('.chat-edit-input');
    if (input) { input.focus(); input.select(); }

    function save() {
        const newText = input ? input.value.trim() : '';
        if (newText && msgEl.dataset.msgId) {
            socket.emit('editChatMessage', { msgId: msgEl.dataset.msgId, newText });
        }
        delete msgEl.dataset.editing;
        textEl.innerHTML = origHtml;
    }
    function cancel() {
        delete msgEl.dataset.editing;
        textEl.innerHTML = origHtml;
    }

    textEl.querySelector('.chat-edit-save')?.addEventListener('click', save);
    textEl.querySelector('.chat-edit-cancel')?.addEventListener('click', cancel);
    if (input) input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') cancel();
    });
}

window.setupChatDelegation = function(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.addEventListener('click', (e) => {
        const profileBtn = e.target.closest('.chat-profile-btn');
        if (profileBtn) {
            const username = profileBtn.dataset.username;
            if (username && typeof openPublicProfile === 'function') openPublicProfile(username);
            return;
        }
        const delBtn = e.target.closest('.chat-delete-btn');
        if (delBtn) {
            const msgEl = delBtn.closest('.chat-message');
            if (msgEl && msgEl.dataset.msgId) {
                window.socket.emit('deleteChatMessage', { msgId: msgEl.dataset.msgId });
            }
            return;
        }
        const editBtn = e.target.closest('.chat-edit-btn');
        if (editBtn) {
            const msgEl = editBtn.closest('.chat-message');
            if (msgEl) setupChatEditInPlace(msgEl, window.socket);
        }
    });
};

// ==================== LOBBY CHAT ====================
function addLobbyChatMessage(msg) {
    const container = document.getElementById('lobbyChatMessages');
    if (!container) return;
    const el = window.buildChatMsg(msg);
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
    while (container.children.length > 30) container.removeChild(container.firstChild);
}

window.socket.on('chatMessage', (msg) => {
    const lobbyScreen = document.getElementById('lobbyScreen');
    if (lobbyScreen && !lobbyScreen.classList.contains('hidden')) {
        addLobbyChatMessage(msg);
    }
});

window.socket.on('chatHistory', (data) => {
    const lobbyScreen = document.getElementById('lobbyScreen');
    if (lobbyScreen && !lobbyScreen.classList.contains('hidden')) {
        const container = document.getElementById('lobbyChatMessages');
        if (container) {
            container.innerHTML = '';
            (data.messages || []).forEach(msg => addLobbyChatMessage(msg));
        }
    }
});

window.socket.on('chatMessageDeleted', (data) => {
    if (!data || !data.msgId) return;
    document.querySelectorAll(`.chat-message[data-msg-id="${CSS.escape(data.msgId)}"]`).forEach(el => el.remove());
});

window.socket.on('chatMessageEdited', (data) => {
    if (!data || !data.msgId) return;
    document.querySelectorAll(`.chat-message[data-msg-id="${CSS.escape(data.msgId)}"]`).forEach(el => {
        const textEl = el.querySelector('.chat-msg-text');
        if (textEl && !el.dataset.editing) {
            const editedTag = ` <em class="chat-msg-edited">${window.t('chat_edited') || '(edited)'}</em>`;
            textEl.innerHTML = window.renderChatText(data.newText || '') + editedTag;
        }
    });
});

window.socket.on('usersList', (data) => {
    window.knownUsers = data.users || [];
});

function sendLobbyChat() {
    const input = document.getElementById('lobbyChatInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    window.socket.emit('sendChat', { text });
    input.value = '';
}

const lobbyChatSend = document.getElementById('lobbyChatSend');
const lobbyChatInput = document.getElementById('lobbyChatInput');
if (lobbyChatSend) lobbyChatSend.onclick = sendLobbyChat;
if (lobbyChatInput) {
    lobbyChatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendLobbyChat(); });
    window.setupMentionInput(lobbyChatInput);
}

window.setupChatDelegation('lobbyChatMessages');

// ==================== MOBILE CHAT MODAL ====================
const chatToggleBtn = document.getElementById('chatToggleBtn');
const lobbyChatWrapper = document.getElementById('lobbyChatWrapper');
const closeChatBtn = document.getElementById('closeChatBtn');

function closeLobbyChat() {
    if (lobbyChatWrapper) lobbyChatWrapper.classList.remove('show-modal');
    window.modalPop('lobbyChat');
}

if (chatToggleBtn && lobbyChatWrapper) {
    chatToggleBtn.addEventListener('click', () => {
        lobbyChatWrapper.classList.add('show-modal');
        window.modalPush('lobbyChat', closeLobbyChat);
        const container = document.getElementById('lobbyChatMessages');
        if (container) container.scrollTop = container.scrollHeight;
    });
}
if (closeChatBtn) closeChatBtn.addEventListener('click', closeLobbyChat);
if (lobbyChatWrapper) window.addSwipeClose(lobbyChatWrapper, closeLobbyChat);

window.socket.on('connect', () => {
    const lobbyScreen = document.getElementById('lobbyScreen');
    if (lobbyScreen && !lobbyScreen.classList.contains('hidden')) {
        window.socket.emit('getChatHistory', {});
    }
    window.socket.emit('getUsersList');
});

// ==================== CHAT MUTE EVENTS ====================
function showChatMuteToast(msg) {
    let toast = document.getElementById('chatMuteToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'chatMuteToast';
        toast.className = 'chat-mute-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('visible');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('visible'), 4000);
}
window.showChatMuteToast = showChatMuteToast;

window.socket.on('chatMuted', (data) => {
    const remaining = data.remainingMinutes || '?';
    const msg = data.isBanned
        ? window.t('chat_muted_banned')
        : window.t('chat_muted_status').replace('{min}', remaining);
    showChatMuteToast(msg);
    const input = document.getElementById('lobbyChatInput');
    if (input) input.disabled = true;
    const notice = document.getElementById('lobbyChatMutedNotice');
    if (notice) { notice.textContent = msg; notice.classList.remove('hidden'); }
});

window.socket.on('chatUnmuted', () => {
    const input = document.getElementById('lobbyChatInput');
    if (input) input.disabled = false;
    const notice = document.getElementById('lobbyChatMutedNotice');
    if (notice) notice.classList.add('hidden');
    showChatMuteToast(window.t('chat_unmuted'));
});

window.socket.on('chatWarning', (data) => {
    const v = data.violations || 0, max = data.maxBeforeBan || 6;
    showChatMuteToast(`${window.t('chat_muted_warning')} (${v}/${max})`);
});

// ==================== SERVER INFO (ANNOUNCEMENTS) ====================
const _infoBtn = document.getElementById('infoBtn');
const _serverInfoModal = document.getElementById('serverInfoModal');
const _serverInfoContent = document.getElementById('serverInfoContent');
const _infoBadge = document.getElementById('infoBadge');
const _closeServerInfoBtn = document.getElementById('closeServerInfoBtn');

const INFO_SEEN_LS = 'metro_info_seen_ts';

function closeServerInfoModal() {
    if (_serverInfoModal) _serverInfoModal.classList.add('hidden');
    window.modalPop('serverInfo');
}

const _claimedAnnouncements = new Set();

async function _claimAnnouncementRewards(announcements) {
    if (!announcements || !announcements.length) return;
    for (const ann of announcements) {
        if (!ann.coins_reward || ann.coins_reward <= 0) continue;
        if (_claimedAnnouncements.has(ann.id)) continue;
        try {
            const r = await fetch(`/api/announcements/${ann.id}/claim`, { method: 'POST' });
            if (!r.ok) continue;
            const data = await r.json();
            if (data.ok && !data.alreadyClaimed && data.coins > 0) {
                _claimedAnnouncements.add(ann.id);
            } else if (data.alreadyClaimed) {
                _claimedAnnouncements.add(ann.id);
            }
        } catch (_) {}
    }
}

let _currentAnnouncements = [];
let _dailyStatus = null;

// ── Ежедневная награда ─────────────────────────────────────────────────────────

async function fetchDailyStatus() {
    try {
        const r = await fetch('/api/daily-reward/status');
        if (!r.ok) return;
        _dailyStatus = await r.json();
    } catch (_) { return; }
    _updateBadge();
    _renderServerInfoContent();
}

function _dailyCardHtml(s) {
    if (!s) return '';
    if (s.available) {
        return `<div class="daily-reward-card daily-reward-available">
            <div class="daily-reward-header">
                <span class="daily-reward-icon">☀️</span>
                <span class="daily-reward-title">${window.t('daily_reward_header')}</span>
            </div>
            <div class="daily-reward-body">
                <div class="daily-reward-streak">🔥 ${window.t('daily_day_label')} ${s.nextStreak > 1 ? s.nextStreak : 1}${s.nextStreak > 1 ? ` <span class="text-dim">(${window.t('daily_streak_label')} ${s.nextStreak - 1} → ${s.nextStreak})</span>` : ''}</div>
                <div class="daily-reward-amount">+${s.todayReward} <span class="daily-reward-mc">MC</span></div>
                <div class="daily-reward-tomorrow text-dim">${window.t('daily_tomorrow_label')} +${s.tomorrowReward} MC</div>
            </div>
            <button class="metro-btn accent-green w-100 daily-claim-btn" id="dailyClaimBtn">${window.t('daily_claim_btn')}</button>
        </div>`;
    } else {
        return `<div class="daily-reward-card daily-reward-claimed">
            <div class="daily-reward-header">
                <span class="daily-reward-icon">✅</span>
                <span class="daily-reward-title">${window.t('daily_claimed_title')}</span>
            </div>
            <div class="daily-reward-body">
                <div class="daily-reward-streak">🔥 ${window.t('daily_streak_label')} ${s.streak} ${s.streak === 1 ? window.t('daily_streak_day_one') : s.streak < 5 ? window.t('daily_streak_day_few') : window.t('daily_streak_day_many')}</div>
                <div class="daily-reward-tomorrow text-dim">${window.t('daily_tomorrow_label')} +${s.tomorrowReward} MC</div>
            </div>
        </div>`;
    }
}

function _updateBadge() {
    if (!_infoBadge) return;
    const dailyAvailable = _dailyStatus && _dailyStatus.available;
    const announceUnread = _hasUnreadAnnouncements();

    if (dailyAvailable) {
        _infoBadge.textContent = '+' + _dailyStatus.todayReward;
        _infoBadge.classList.remove('hidden');
    } else if (announceUnread) {
        _infoBadge.textContent = '';
        _infoBadge.classList.remove('hidden');
    } else {
        _infoBadge.classList.add('hidden');
    }
}

function _hasUnreadAnnouncements() {
    if (!_currentAnnouncements.length) return false;
    const latestTs = String(new Date(_currentAnnouncements[0].created_at).getTime());
    let seenTs = '0';
    try { seenTs = localStorage.getItem(INFO_SEEN_LS) || '0'; } catch (_) {}
    return latestTs !== '0' && latestTs !== seenTs;
}

function _renderServerInfoContent() {
    if (!_serverInfoContent) return;
    let html = _dailyCardHtml(_dailyStatus);

    const items = _currentAnnouncements;
    if (items.length) {
        html += items.map(ann => {
            const date = new Date(ann.created_at).toLocaleString();
            const edited = ann.updated_at && ann.updated_at !== ann.created_at
                ? ` <span class="text-dim ann-edited-tag">(${window.t('announce_edited_at') || 'edited'})</span>`
                : '';
            const rewardTag = ann.coins_reward > 0
                ? `<div class="announce-reward-tag">🪙 +${ann.coins_reward} MC ${window.t ? window.t('coins_announce_label') : 'reward'}</div>`
                : '';
            return `<div class="announce-item">
                <div class="announce-text">${ann.text.split('\n').map(l => `<p>${window.escHtml(l)}</p>`).join('')}${edited}</div>
                ${rewardTag}
                <div class="announce-date text-dim"><small>${date}</small></div>
            </div>`;
        }).join('');
    } else if (!_dailyStatus) {
        html += `<span class="text-dim">${window.t('info_empty') || 'No announcements'}</span>`;
    }

    _serverInfoContent.innerHTML = html;

    const claimBtn = document.getElementById('dailyClaimBtn');
    if (claimBtn) {
        claimBtn.addEventListener('click', async () => {
            claimBtn.disabled = true;
            claimBtn.textContent = '...';
            try {
                const r = await fetch('/api/daily-reward/claim', { method: 'POST' });
                const data = await r.json();
                if (data.ok) {
                    if (typeof window.showToast === 'function') {
                        window.showToast(`☀️ +${data.coins} MC! Стрик: ${data.streak} дн.`);
                    }
                    _dailyStatus = { available: false, streak: data.streak, tomorrowReward: data.tomorrowReward, nextStreak: data.streak };
                    _updateBadge();
                    _renderServerInfoContent();
                } else if (data.reason === 'already_claimed') {
                    await fetchDailyStatus();
                }
            } catch (_) {
                claimBtn.disabled = false;
                claimBtn.textContent = window.t('daily_claim_btn');
            }
        });
    }
}

function openServerInfoModal() {
    if (!_serverInfoModal) return;
    _serverInfoModal.classList.remove('hidden');
    window.modalPush('serverInfo', closeServerInfoModal);

    // Помечаем объявления как прочитанные
    const latestTs = String(_currentAnnouncements[0] ? new Date(_currentAnnouncements[0].created_at).getTime() : 0);
    if (_serverInfoModal) _serverInfoModal.dataset.infoTs = latestTs;
    try { localStorage.setItem(INFO_SEEN_LS, latestTs); } catch (_) {}

    _updateBadge();
    _claimAnnouncementRewards(_currentAnnouncements);

    // Обновляем статус ежедневной награды при открытии
    fetchDailyStatus();
}

if (_infoBtn) _infoBtn.addEventListener('click', openServerInfoModal);
if (_closeServerInfoBtn) _closeServerInfoBtn.addEventListener('click', closeServerInfoModal);
if (_serverInfoModal) window.addSwipeClose(_serverInfoModal, closeServerInfoModal);

function applyServerInfo(info, ts) {
    if (!_serverInfoContent) return;
    const text = (info || '').trim();
    _serverInfoContent.innerHTML = text
        ? text.split('\n').map(l => `<p>${window.escHtml(l)}</p>`).join('')
        : `<span class="text-dim">${window.t('info_empty') || 'No announcements'}</span>`;
    if (_serverInfoModal) _serverInfoModal.dataset.infoTs = ts || '0';
    let seenTs = '0';
    try { seenTs = localStorage.getItem(INFO_SEEN_LS) || '0'; } catch (_) {}
    if (text && ts && ts !== '0' && ts !== seenTs) {
        if (_infoBadge) _infoBadge.classList.remove('hidden');
    }
}

window.socket.on('serverInfoUpdate', (data) => {
    applyServerInfo(data.info, data.ts);
});

function applyAnnouncements(announcements) {
    _currentAnnouncements = announcements || [];
    const latestTs = String(_currentAnnouncements[0] ? new Date(_currentAnnouncements[0].created_at).getTime() : 0);
    if (_serverInfoModal) _serverInfoModal.dataset.infoTs = latestTs;
    _updateBadge();
    _renderServerInfoContent();
}

let _announceInitLoaded = false;

window.socket.on('announcementsUpdate', (data) => {
    const list = data.announcements || [];
    const wasLoaded = _announceInitLoaded;
    _announceInitLoaded = true;
    applyAnnouncements(list);
    if (wasLoaded && list.length) {
        if (typeof window.showToast === 'function') {
            window.showToast(`📢 ${window.t('info_btn_title') || 'Announcement'}`);
        }
    }
});

fetch('/api/admin/announcements/public')
    .then(r => r.ok ? r.json() : null)
    .then(data => {
        if (data && !_announceInitLoaded) {
            _announceInitLoaded = true;
            applyAnnouncements(data.announcements || []);
        }
    })
    .catch(() => {});

// Загружаем статус ежедневной награды при старте
fetchDailyStatus();
