window.friendInvitedRooms = new Set();
window.invitedFriendId = null;

let friendsList = [];
let pendingRequests = [];
const dmUnreadMap = new Map();
const onlineFriendIds = new Set();
const inGameFriendIds = new Set();
let currentDmFriendId = null;
let friendsPanelOpen = false;

function openFriendsPanel() {
    const panel = document.getElementById('friendsModal');
    if (!panel) return;
    panel.classList.remove('hidden');
    friendsPanelOpen = true;
    showFriendsList();
    loadFriends();
}

function closeFriendsPanel() {
    const panel = document.getElementById('friendsModal');
    if (panel) panel.classList.add('hidden');
    friendsPanelOpen = false;
    currentDmFriendId = null;
    showFriendsList();
}

const _friendsBtnEl = document.getElementById('friendsBtn');
if (_friendsBtnEl) _friendsBtnEl.onclick = () => {
    if (friendsPanelOpen) closeFriendsPanel();
    else openFriendsPanel();
};

const _closeFriendsBtnEl = document.getElementById('closeFriendsBtn');
if (_closeFriendsBtnEl) _closeFriendsBtnEl.onclick = closeFriendsPanel;

document.addEventListener('click', (e) => {
    if (!friendsPanelOpen) return;
    const panel = document.getElementById('friendsModal');
    const btn = document.getElementById('friendsBtn');
    if (panel && btn && !panel.contains(e.target) && !btn.contains(e.target)) {
        closeFriendsPanel();
    }
}, { capture: false });

const _friendsModalEl = document.getElementById('friendsModal');
if (_friendsModalEl && typeof window.addSwipeClose === 'function') {
    window.addSwipeClose(_friendsModalEl, closeFriendsPanel);
}

function loadFriends() {
    fetch('/api/friends')
        .then(r => r.json())
        .then(data => {
            friendsList = Array.isArray(data) ? data : [];
            renderFriendsList();
            window.socket.emit('getFriendsOnlineStatus');
        }).catch(() => {});
    fetch('/api/friends/requests')
        .then(r => r.json())
        .then(data => {
            pendingRequests = Array.isArray(data) ? data.map(r => ({
                id: r.id,
                requester_name: r.requester_name,
                requester_avatar: r.requester_avatar
            })) : [];
            renderFriendsList();
            updateFriendsBadge();
        }).catch(() => {});
}

function updateFriendsBadge() {
    const badge = document.getElementById('friendsBadge');
    if (!badge) return;
    const total = pendingRequests.length + [...dmUnreadMap.values()].reduce((a, b) => a + b, 0);
    badge.textContent = total;
    badge.classList.toggle('hidden', total === 0);
}

function renderFriendsList() {
    const listEl = document.getElementById('friendsListEl');
    const reqEl = document.getElementById('requestsListEl');
    const reqSection = document.getElementById('requestsSection');
    if (!listEl) return;

    if (reqEl && reqSection) {
        if (pendingRequests.length === 0) {
            reqSection.classList.add('hidden');
            reqEl.innerHTML = '';
        } else {
            reqSection.classList.remove('hidden');
            reqEl.innerHTML = pendingRequests.map(r => `
                <div class="friend-item friend-request">
                        <span class="friend-item-avatar">${window.escHtml(r.requester_avatar || '😶')}</span>
                        <span class="friend-item-name">${window.escHtml(r.requester_name || '?')}</span>|
                    <div class="friend-actions">
                        <button class="fr-btn fr-accept" data-req="${r.id}">${window.t('btn_accept')}</button>
                        <button class="fr-btn fr-decline" data-req="${r.id}">${window.t('btn_decline')}</button>
                    </div>
                </div>`).join('');
        }
    }

    if (friendsList.length === 0) {
        listEl.innerHTML = `<div class="friends-empty text-dim">${window.t('friends_empty')}</div>`;
    } else {
        listEl.innerHTML = friendsList.map(f => {
            const fid = f.friend_id;
            const fname = f.friend_name || '?';
            const favatar = f.friend_avatar || '😶';
            const unread = dmUnreadMap.get(fid) || 0;
            const badge = unread > 0 ? `<span class="dm-unread-badge">${unread}</span>` : '';
            const isOnline = onlineFriendIds.has(fid);
            const isInGame = inGameFriendIds.has(fid);
            const dotClass = isInGame ? 'ingame' : (isOnline ? '' : 'offline');
            return `<div class="friend-item">
                <button class="fr-profile" data-username="${window.escHtml(fname)}" title="${window.t('view_profile') || 'View profile'}">
                    <span class="friend-item-avatar">${window.escHtml(favatar)}</span>
                    <span class="friend-item-name">${window.escHtml(fname)}${badge}</span>
                </button>
                <span class="friend-online-dot ${dotClass}" title="${isInGame ? 'in game' : (isOnline ? 'online' : 'offline')}"></span>
                <div class="friend-actions">
                    <button class="fr-btn fr-dm" data-friend="${fid}" data-name="${window.escHtml(fname)}" data-avatar="${window.escHtml(favatar)}">${window.t('btn_open_dm')}</button>
                    <button class="fr-btn fr-invite" data-friend="${fid}" data-name="${window.escHtml(fname)}">${window.t('btn_invite_game')}</button>
                    <button class="fr-btn fr-remove" data-friend="${fid}" data-name="${window.escHtml(fname)}">✕</button>
                </div>
            </div>`;
        }).join('');
    }
    updateInviteSelect();
}

function updateInviteSelect() {
    const sel = document.getElementById('inviteFriendSelect');
    const row = document.getElementById('inviteFriendRow');
    if (!sel) return;
    if (friendsList.length === 0) { if (row) row.classList.add('hidden'); return; }
    if (row) row.classList.remove('hidden');
    const cur = sel.value;
    sel.innerHTML = `<option value="">${window.t('no_friends_to_invite')}</option>` +
        friendsList.map(f => `<option value="${f.friend_id}">${window.escHtml(f.friend_avatar || '😶')} ${window.escHtml(f.friend_name || '?')}</option>`).join('');
    if (cur && friendsList.some(f => String(f.friend_id) === cur)) sel.value = cur;
}

function showFriendsList() {
    const lv = document.getElementById('friendsListView');
    const dv = document.getElementById('friendsDmView');
    if (lv) lv.classList.remove('hidden');
    if (dv) dv.classList.add('hidden');
    currentDmFriendId = null;
}

function openDmChat(friendId, friendName, friendAvatar) {
    const lv = document.getElementById('friendsListView');
    const dv = document.getElementById('friendsDmView');
    const hdr = document.getElementById('dmChatHeader');
    const msgs = document.getElementById('dmMessages');
    if (!dv || !msgs) return;
    currentDmFriendId = friendId;
    dmUnreadMap.delete(friendId);
    updateFriendsBadge();
    if (friendsPanelOpen) renderFriendsList();
    if (lv) lv.classList.add('hidden');
    dv.classList.remove('hidden');
    if (hdr) hdr.textContent = `${friendAvatar} ${friendName}`;
    msgs.innerHTML = `<div class="dm-empty-hint text-dim">${window.t('dm_empty')}</div>`;
    window.socket.emit('getDmHistory', { friendId });
}

function appendDmMessage(msg, forceMine) {
    const msgs = document.getElementById('dmMessages');
    if (!msgs) return;
    const hint = msgs.querySelector('.dm-empty-hint');
    if (hint) hint.remove();
    const isMine = forceMine !== undefined ? forceMine : (msg.senderId !== currentDmFriendId);
    const div = document.createElement('div');
    div.className = `dm-msg ${isMine ? 'dm-msg-mine' : 'dm-msg-theirs'}`;
    if (msg.id) div.dataset.dmMsgId = String(msg.id);
    if (!isMine) {
        const senderBtn = document.createElement('button');
        senderBtn.className = 'dm-sender-btn';
        senderBtn.dataset.username = msg.senderName || '';
        senderBtn.textContent = `${msg.senderAvatar || '😶'} ${msg.senderName || ''}`;
        div.appendChild(senderBtn);
    }
    const bubble = document.createElement('div');
    bubble.className = 'dm-bubble';
    bubble.innerHTML = typeof window.renderChatText === 'function'
        ? window.renderChatText(msg.content || '')
        : window.escHtml(msg.content || '');
    div.appendChild(bubble);
    if (isMine && msg.id) {
        const actions = document.createElement('div');
        actions.className = 'dm-msg-actions';
        actions.innerHTML = `<button class="dm-delete-btn" title="${window.t ? window.t('chat_delete') : 'Delete'}">🗑️</button>`;
        div.appendChild(actions);
    }
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
}

window.socket.on('dmMessageDeleted', (data) => {
    if (!data || !data.msgId) return;
    const msgEl = document.querySelector(`[data-dm-msg-id="${data.msgId}"]`);
    if (msgEl) msgEl.remove();
});

document.addEventListener('click', (e) => {
    const senderBtn = e.target.closest('.dm-sender-btn');
    if (senderBtn && senderBtn.dataset.username) {
        if (typeof openPublicProfile === 'function') openPublicProfile(senderBtn.dataset.username);
        return;
    }
    const delBtn = e.target.closest('.dm-delete-btn');
    if (delBtn) {
        const msgEl = delBtn.closest('[data-dm-msg-id]');
        if (msgEl && msgEl.dataset.dmMsgId) {
            window.socket.emit('deleteDm', { msgId: parseInt(msgEl.dataset.dmMsgId, 10) });
        }
    }
});

window.socket.on('friendsOnlineStatus', (data) => {
    onlineFriendIds.clear();
    inGameFriendIds.clear();
    if (data && Array.isArray(data.onlineIds)) {
        data.onlineIds.forEach(id => onlineFriendIds.add(id));
    }
    if (data && Array.isArray(data.inGameIds)) {
        data.inGameIds.forEach(id => inGameFriendIds.add(id));
    }
    if (friendsPanelOpen) renderFriendsList();
});

window.socket.on('friendOnline', (data) => {
    if (!data || !data.userId) return;
    onlineFriendIds.add(data.userId);
    if (friendsPanelOpen) renderFriendsList();
});

window.socket.on('friendOffline', (data) => {
    if (!data || !data.userId) return;
    onlineFriendIds.delete(data.userId);
    inGameFriendIds.delete(data.userId);
    if (friendsPanelOpen) renderFriendsList();
});

window.socket.on('friendInGame', (data) => {
    if (!data || !data.userId) return;
    onlineFriendIds.add(data.userId);
    inGameFriendIds.add(data.userId);
    if (friendsPanelOpen) renderFriendsList();
});

window.socket.on('friendLeftGame', (data) => {
    if (!data || !data.userId) return;
    inGameFriendIds.delete(data.userId);
    if (friendsPanelOpen) renderFriendsList();
});

window.socket.on('friendRequest', (data) => {
    pendingRequests.push({ id: data.id, requester_name: data.fromUsername, requester_avatar: data.fromAvatar });
    updateFriendsBadge();
    if (friendsPanelOpen) renderFriendsList();
    if (typeof window.showToast === 'function') window.showToast(`👥 ${window.escHtml(data.fromUsername)} ${window.t('friend_request_received_short')}`);
});

window.socket.on('friendAccepted', (data) => {
    loadFriends();
    if (typeof window.showToast === 'function') window.showToast(`✅ ${window.t('friend_accepted').replace('{name}', data.byUsername)}`);
});

function updateFriendInviteNotice() {
    const notice = document.getElementById('friendInviteNotice');
    if (!notice) return;
    const count = window.friendInvitedRooms ? window.friendInvitedRooms.size : 0;
    if (count > 0) {
        notice.textContent = `🎮 ${window.t('friend_game_badge') || 'invited!'}`;
        notice.classList.remove('hidden');
    } else {
        notice.classList.add('hidden');
    }
}

window.socket.on('friendGameInvite', (data) => {
    window.friendInvitedRooms.add(data.roomId);
    if (typeof window.reRenderRooms === 'function') window.reRenderRooms();
    updateFriendInviteNotice();
    if (typeof window.showToast === 'function') window.showToast(`🎮 ${window.escHtml(data.fromAvatar)} ${window.escHtml(data.fromName)} ${window.t('friend_game_invite').replace('{name}', '').trim()}`);
    setTimeout(() => {
        window.friendInvitedRooms.delete(data.roomId);
        if (typeof window.reRenderRooms === 'function') window.reRenderRooms();
        updateFriendInviteNotice();
    }, 60000);
});

window.socket.on('dmMessage', (msg) => {
    const isOpen = friendsPanelOpen && currentDmFriendId === msg.senderId;
    if (isOpen) {
        appendDmMessage(msg, false);
        window.socket.emit('markDmRead', { friendId: msg.senderId });
    } else {
        dmUnreadMap.set(msg.senderId, (dmUnreadMap.get(msg.senderId) || 0) + 1);
        updateFriendsBadge();
        if (friendsPanelOpen) renderFriendsList();
        if (typeof window.showToast === 'function') window.showToast(`💬 ${window.escHtml(msg.senderName)}: ${window.escHtml(msg.content.substring(0, 50))}`);
    }
});

window.socket.on('dmSent', (msg) => {
    if (currentDmFriendId !== null) appendDmMessage(msg, true);
});

window.socket.on('dmHistory', (data) => {
    const msgs = document.getElementById('dmMessages');
    if (!msgs || currentDmFriendId !== data.friendId) return;
    msgs.innerHTML = '';
    if (!data.messages || data.messages.length === 0) {
        msgs.innerHTML = `<div class="dm-empty-hint text-dim">${window.t('dm_empty')}</div>`;
        return;
    }
    data.messages.forEach(msg => appendDmMessage(msg));
});

window.socket.on('dmError', (data) => {
    if (typeof window.showToast === 'function') window.showToast(window.t(data.error) || data.error);
});

const _friendsListEl = document.getElementById('friendsListEl');
if (_friendsListEl) {
    _friendsListEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        if (btn.classList.contains('fr-profile')) {
            e.stopPropagation();
            if (typeof openPublicProfile === 'function') openPublicProfile(btn.dataset.username);
        } else if (btn.classList.contains('fr-invite')) {
            const fid = parseInt(btn.dataset.friend, 10);
            window.invitedFriendId = fid;
            const sel = document.getElementById('inviteFriendSelect');
            if (sel) sel.value = String(fid);
            closeFriendsPanel();
            if (typeof window.showToast === 'function') window.showToast(`${window.t('invited_friend')}${btn.dataset.name}`);
        } else if (btn.classList.contains('fr-dm')) {
            e.stopPropagation();
            openDmChat(parseInt(btn.dataset.friend, 10), btn.dataset.name, btn.dataset.avatar);
        } else if (btn.classList.contains('fr-remove')) {
            e.stopPropagation();
            const fid = parseInt(btn.dataset.friend, 10);
            const fname = btn.dataset.name || '?';
            const actionsEl = btn.closest('.friend-actions');
            if (!actionsEl) return;
            actionsEl.dataset.confirmFid = fid;
            actionsEl.innerHTML = `
                <span class="fr-confirm-label">${window.escHtml(fname)}?</span>
                <button class="fr-btn fr-confirm-yes" data-friend="${fid}">✓</button>
                <button class="fr-btn fr-confirm-no">✕</button>`;
        } else if (btn.classList.contains('fr-confirm-yes')) {
            e.stopPropagation();
            const fid = parseInt(btn.dataset.friend, 10);
            fetch(`/api/friends/${fid}`, { method: 'DELETE' }).then(() => loadFriends()).catch(() => {});
        } else if (btn.classList.contains('fr-confirm-no')) {
            e.stopPropagation();
            renderFriendsList();
        }
    });
}

const _requestsListEl = document.getElementById('requestsListEl');
if (_requestsListEl) {
    _requestsListEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const rid = parseInt(btn.dataset.req, 10);
        const isAccept = btn.classList.contains('fr-accept');
        const url = isAccept ? `/api/friends/accept/${rid}` : `/api/friends/decline/${rid}`;
        fetch(url, { method: 'POST' })
            .then(() => {
                pendingRequests = pendingRequests.filter(r => r.id !== rid);
                renderFriendsList(); updateFriendsBadge();
                if (isAccept) loadFriends();
            }).catch(() => {});
    });
}

const _addFriendForm = document.getElementById('addFriendForm');
const _addFriendInput = document.getElementById('addFriendInput');
const _addFriendMsg = document.getElementById('addFriendMsg');
if (_addFriendForm) {
    _addFriendForm.onsubmit = (e) => {
        e.preventDefault();
        const username = (_addFriendInput ? _addFriendInput.value : '').trim();
        if (!username) return;
        fetch('/api/friends/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        }).then(r => r.json()).then(data => {
            if (_addFriendMsg) {
                _addFriendMsg.textContent = data.error ? (window.t(data.error) || data.error) : window.t('friend_request_sent');
                _addFriendMsg.className = `add-friend-msg ${data.error ? 'error' : 'success'}`;
            }
            if (!data.error && _addFriendInput) _addFriendInput.value = '';
            setTimeout(() => { if (_addFriendMsg) _addFriendMsg.textContent = ''; }, 3000);
        }).catch(() => {});
    };
}

const _dmBackBtn = document.getElementById('dmBackBtn');
if (_dmBackBtn) _dmBackBtn.onclick = showFriendsList;

const _dmInput = document.getElementById('dmInput');
const _dmSendBtn = document.getElementById('dmSendBtn');
function sendDm() {
    if (!_dmInput || currentDmFriendId === null) return;
    const content = _dmInput.value.trim();
    if (!content) return;
    window.socket.emit('sendDm', { receiverId: currentDmFriendId, content });
    _dmInput.value = '';
}
if (_dmSendBtn) _dmSendBtn.onclick = sendDm;
if (_dmInput && typeof window.setupMentionInput === 'function') window.setupMentionInput(_dmInput);
if (_dmInput) _dmInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDm(); }
});

const _inviteSel = document.getElementById('inviteFriendSelect');
if (_inviteSel) _inviteSel.onchange = function() {
    const val = parseInt(this.value, 10);
    window.invitedFriendId = (this.value && !isNaN(val)) ? val : null;
};

window.reRenderRooms = function() { if (typeof renderRooms === 'function') renderRooms(); };
