window.friendInvitedRooms = new Set();
window.invitedFriendId = null;

var _friendsList = [];
var _pendingRequests = [];

async function loadFriends() {
    try {
        const [fRes, rRes] = await Promise.all([
            fetch('/api/friends'),
            fetch('/api/friends/requests')
        ]);
        if (fRes.ok) _friendsList = await fRes.json();
        if (rRes.ok) _pendingRequests = await rRes.json();
        _updateFriendsBadge();
        _renderFriendsPanel();
        _updateInviteSelect();
    } catch (e) {
        console.error('loadFriends error', e);
    }
}

function _updateFriendsBadge() {
    const badge = document.getElementById('friendsBadge');
    if (!badge) return;
    const count = _pendingRequests.length;
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
}

function _renderFriendsPanel() {
    _renderFriendsList();
    _renderPendingRequests();
}

function _renderFriendsList() {
    const container = document.getElementById('friendsListContainer');
    if (!container) return;
    if (!_friendsList.length) {
        container.innerHTML = `<div class="text-dim friends-empty">${window.t('friends_empty')}</div>`;
        return;
    }
    container.innerHTML = _friendsList.map(f => `
        <div class="friend-item">
            <span class="friend-avatar">${window.escHtml(f.friend_avatar || '😶')}</span>
            <span class="friend-name">${window.escHtml(f.friend_name)}</span>
            <div class="friend-actions">
                <button class="metro-btn primary friend-invite-btn" data-fid="${f.friend_id}" data-fname="${window.escHtml(f.friend_name)}">${window.t('btn_invite_game')}</button>
                <button class="metro-btn danger friend-remove-btn" data-fid="${f.friend_id}">${window.t('btn_remove_friend')}</button>
            </div>
        </div>`).join('');

    container.querySelectorAll('.friend-invite-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _setInvitedFriend(parseInt(btn.dataset.fid, 10), btn.dataset.fname);
            _closeFriendsPanel();
        });
    });
    container.querySelectorAll('.friend-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => _removeFriend(btn.dataset.fid));
    });
}

function _renderPendingRequests() {
    const container = document.getElementById('friendsRequestsContainer');
    if (!container) return;
    if (!_pendingRequests.length) {
        container.innerHTML = `<div class="text-dim friends-empty">${window.t('requests_empty')}</div>`;
        return;
    }
    container.innerHTML = _pendingRequests.map(r => `
        <div class="friend-request-item" data-rid="${r.id}">
            <span class="friend-avatar">${window.escHtml(r.requester_avatar || '😶')}</span>
            <span class="friend-name">${window.escHtml(r.requester_name)}</span>
            <div class="friend-actions">
                <button class="metro-btn accent-green req-accept-btn" data-rid="${r.id}">${window.t('btn_accept')}</button>
                <button class="metro-btn danger req-decline-btn" data-rid="${r.id}">${window.t('btn_decline')}</button>
            </div>
        </div>`).join('');

    container.querySelectorAll('.req-accept-btn').forEach(btn => {
        btn.addEventListener('click', () => _acceptRequest(btn.dataset.rid));
    });
    container.querySelectorAll('.req-decline-btn').forEach(btn => {
        btn.addEventListener('click', () => _declineRequest(btn.dataset.rid));
    });
}

function _updateInviteSelect() {
    const select = document.getElementById('inviteFriendSelect');
    if (!select) return;
    const prev = select.value;
    select.innerHTML = `<option value="">${window.t('no_friends_to_invite')}</option>`;
    _friendsList.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.friend_id;
        opt.textContent = `${f.friend_avatar || '😶'} ${f.friend_name}`;
        select.appendChild(opt);
    });
    if (prev && [...select.options].some(o => o.value === String(prev))) select.value = prev;
}

async function _acceptRequest(requestId) {
    try {
        await fetch(`/api/friends/accept/${requestId}`, { method: 'POST' });
        await loadFriends();
    } catch (e) {}
}

async function _declineRequest(requestId) {
    try {
        await fetch(`/api/friends/decline/${requestId}`, { method: 'POST' });
        await loadFriends();
    } catch (e) {}
}

async function _removeFriend(friendId) {
    try {
        await fetch(`/api/friends/${friendId}`, { method: 'DELETE' });
        if (window.invitedFriendId === parseInt(friendId, 10)) {
            window.invitedFriendId = null;
            const badge = document.getElementById('invitedFriendBadge');
            if (badge) badge.classList.add('hidden');
        }
        await loadFriends();
    } catch (e) {}
}

function _setInvitedFriend(friendId, friendName) {
    window.invitedFriendId = friendId;
    const badge = document.getElementById('invitedFriendBadge');
    if (badge) {
        badge.textContent = window.t('invited_friend') + friendName;
        badge.classList.remove('hidden');
    }
    const select = document.getElementById('inviteFriendSelect');
    if (select) {
        const opt = [...select.options].find(o => parseInt(o.value, 10) === friendId);
        if (opt) select.value = opt.value;
    }
}

function _openFriendsPanel() {
    const panel = document.getElementById('friendsModal');
    if (panel) panel.classList.remove('hidden');
    loadFriends();
}

function _closeFriendsPanel() {
    const panel = document.getElementById('friendsModal');
    if (panel) panel.classList.add('hidden');
}

function _showFriendNotification(icon, text, roomId) {
    const el = document.createElement('div');
    el.className = 'friend-notification';

    const body = document.createElement('div');
    body.className = 'friend-notif-body';
    body.innerHTML = `<span class="friend-notif-icon">${icon}</span><span class="friend-notif-text">${window.escHtml(text)}</span>`;
    el.appendChild(body);

    if (roomId) {
        const joinBtn = document.createElement('button');
        joinBtn.className = 'metro-btn primary friend-notif-join';
        joinBtn.textContent = window.t('join_invite');
        joinBtn.onclick = () => {
            if (typeof window.hasRejoinableRoom === 'function' && window.hasRejoinableRoom()) return;
            window.socket.emit('joinRoom', roomId);
            el.remove();
        };
        el.appendChild(joinBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'friend-notif-close';
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => el.remove();
    el.appendChild(closeBtn);

    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    setTimeout(() => { el.classList.remove('visible'); setTimeout(() => el.remove(), 400); }, 8000);
}

window.socket.on('friendRequest', (data) => {
    if (!data || !data.fromUsername) return;
    _pendingRequests.unshift({ id: data.id, requester_id: data.fromId, requester_name: data.fromUsername, requester_avatar: data.fromAvatar });
    _updateFriendsBadge();
    _renderPendingRequests();
    _showFriendNotification('👤', data.fromUsername + ' ' + window.t('friend_request_received_short'), null);
});

window.socket.on('friendAccepted', (data) => {
    if (!data || !data.byUsername) return;
    loadFriends();
    _showFriendNotification('✅', window.t('friend_accepted').replace('{name}', data.byUsername), null);
});

window.socket.on('friendGameInvite', (data) => {
    if (!data || !data.roomId) return;
    window.friendInvitedRooms.add(data.roomId);
    if (typeof window.reRenderRooms === 'function') window.reRenderRooms();
    _showFriendNotification('🎮', window.t('friend_game_invite').replace('{name}', data.fromName || '?'), data.roomId);
});

document.addEventListener('DOMContentLoaded', () => {
    const friendsBtn = document.getElementById('friendsBtn');
    if (friendsBtn) friendsBtn.addEventListener('click', _openFriendsPanel);

    const closeFriendsBtn = document.getElementById('closeFriendsBtn');
    if (closeFriendsBtn) closeFriendsBtn.addEventListener('click', _closeFriendsPanel);

    const friendsModal = document.getElementById('friendsModal');
    if (friendsModal) friendsModal.addEventListener('click', (e) => { if (e.target === friendsModal) _closeFriendsPanel(); });

    const addFriendBtn = document.getElementById('addFriendBtn');
    const addFriendInput = document.getElementById('addFriendInput');
    const addFriendMsg = document.getElementById('addFriendMsg');

    async function doSendRequest() {
        if (!addFriendInput) return;
        const username = addFriendInput.value.trim();
        if (!username) return;
        if (addFriendBtn) addFriendBtn.disabled = true;
        try {
            const res = await fetch('/api/friends/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });
            const data = await res.json();
            if (data.success) {
                addFriendInput.value = '';
                if (addFriendMsg) { addFriendMsg.textContent = window.t('friend_request_sent'); addFriendMsg.className = 'friends-msg success'; }
            } else {
                if (addFriendMsg) { addFriendMsg.textContent = window.t(data.error || 'server_error'); addFriendMsg.className = 'friends-msg error'; }
            }
        } catch (e) {
            if (addFriendMsg) { addFriendMsg.textContent = window.t('server_error'); addFriendMsg.className = 'friends-msg error'; }
        } finally {
            if (addFriendBtn) addFriendBtn.disabled = false;
        }
    }

    if (addFriendBtn) addFriendBtn.addEventListener('click', doSendRequest);
    if (addFriendInput) addFriendInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSendRequest(); });

    const inviteSelect = document.getElementById('inviteFriendSelect');
    if (inviteSelect) {
        inviteSelect.addEventListener('change', () => {
            window.invitedFriendId = inviteSelect.value ? parseInt(inviteSelect.value, 10) : null;
            const badge = document.getElementById('invitedFriendBadge');
            if (!badge) return;
            if (window.invitedFriendId) {
                const opt = inviteSelect.selectedOptions[0];
                badge.textContent = window.t('invited_friend') + (opt ? opt.textContent : '');
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        });
    }

    const clearInviteBtn = document.getElementById('clearInvitedFriendBtn');
    if (clearInviteBtn) {
        clearInviteBtn.addEventListener('click', () => {
            window.invitedFriendId = null;
            const badge = document.getElementById('invitedFriendBadge');
            if (badge) badge.classList.add('hidden');
            const sel = document.getElementById('inviteFriendSelect');
            if (sel) sel.value = '';
        });
    }
});

window.loadFriends = loadFriends;
window.openFriendsPanel = _openFriendsPanel;
