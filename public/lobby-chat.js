// ==================== LOBBY CHAT ====================
function addLobbyChatMessage(msg) {
    const container = document.getElementById('lobbyChatMessages');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'chat-message';
    const isSelf = msg.username === window.currentUsername;
    el.classList.toggle('chat-msg-self', isSelf);
    el.innerHTML = `<span class="chat-msg-avatar">${window.escHtml(msg.avatar || '😶')}</span><span class="chat-msg-name">${window.escHtml(msg.username)}</span><span class="chat-msg-text">${window.escHtml(msg.text)}</span>`;
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
if (lobbyChatInput) lobbyChatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendLobbyChat(); });

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
