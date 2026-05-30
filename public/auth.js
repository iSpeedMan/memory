window.socket = io({
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
});

// ====================== HEARTBEAT ======================
let heartbeatInterval = null;

function startHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
        if (window.socket && window.socket.connected) {
            window.socket.emit('hb');
        }
    }, 10000);
}

window.socket.on('connect', () => {
    console.log('Socket connected');
    startHeartbeat();
    if (window.onSocketReconnect) window.onSocketReconnect();
});

window.socket.on('hb_ack', () => {});

window.socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
});

const authScreen = document.getElementById('authScreen');
const lobbyScreen = document.getElementById('lobbyScreen');

window.currentUsername = '';
window.currentUserAvatar = '😶';
window.currentUserId = null;
window.isAdmin = false;

window.toggleAuth = function(type) {
    const panels = ['loginPanel', 'registerPanel', 'forgotPanel', 'resetPanel'];
    panels.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    ['authError', 'regError', 'forgotMsg', 'resetMsg'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.classList.add('hidden'); el.textContent = ''; el.style.background = ''; }
    });

    if (type === 'register') document.getElementById('registerPanel').classList.remove('hidden');
    else if (type === 'forgot') document.getElementById('forgotPanel').classList.remove('hidden');
    else if (type === 'reset') document.getElementById('resetPanel').classList.remove('hidden');
    else document.getElementById('loginPanel').classList.remove('hidden');
};

const urlParams = new URLSearchParams(window.location.search);
const resetToken = urlParams.get('reset');

if (resetToken) {
    document.getElementById('resetTokenVal').value = resetToken;
    document.getElementById('authScreen').classList.remove('hidden');
    toggleAuth('reset');
}

async function handleLoginSuccess(data) {
    window.currentUsername = data.username;
    window.currentUserAvatar = data.avatar || '😶';
    window.currentUserId = data.userId || null;
    window.isAdmin = data.isAdmin;

    window.socket.disconnect();
    window.socket.connect();

    if (document.getElementById('currentUserDisp')) document.getElementById('currentUserDisp').textContent = window.currentUsername;
    if (document.getElementById('currentUserAvatar')) document.getElementById('currentUserAvatar').textContent = window.currentUserAvatar;
    if (window.isAdmin && document.getElementById('adminBtn')) document.getElementById('adminBtn').classList.remove('hidden');

    authScreen.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');

    try {
        const res = await fetch('/api/profile');
        const profData = await res.json();
        window.applySettings(profData.theme || 'dark', profData.language || 'auto');
        if (typeof window.loadCategories === 'function') await window.loadCategories();
    } catch (e) {
        console.error('Profile load error', e);
        window.applySettings('dark', 'auto');
    }

    window.history.replaceState({}, document.title, "/");
}

document.addEventListener('DOMContentLoaded', () => {
    const btn = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    btn('toggleRegisterBtn',    () => window.toggleAuth('register'));
    btn('toggleForgotBtn',      () => window.toggleAuth('forgot'));
    btn('toggleLoginFromRegBtn',() => window.toggleAuth('login'));
    btn('toggleCancelForgotBtn',() => window.toggleAuth('login'));
    if (typeof window.checkSession === 'function') window.checkSession();
});

window.checkSession = async function() {
    if (resetToken) return;
    try {
        const res = await fetch('/api/session');
        const data = await res.json();
        if (data.loggedIn) {
            handleLoginSuccess(data);
        } else {
            authScreen.classList.remove('hidden');
            toggleAuth('login');
        }
    } catch (e) {
        authScreen.classList.remove('hidden');
        toggleAuth('login');
    }
};

// ==================== ENTER HANDLERS ====================
['username', 'password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('loginBtn').click(); });
});

['regUsername', 'regEmail', 'regPassword', 'regPasswordConfirm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('registerBtn').click(); });
});

const forgotEmailEl = document.getElementById('forgotEmail');
if (forgotEmailEl) forgotEmailEl.addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('forgotBtn').click(); });

const resetPasswordEl = document.getElementById('resetPassword');
if (resetPasswordEl) resetPasswordEl.addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('resetBtn').click(); });

// ==================== LOGIN ====================
document.getElementById('loginBtn').onclick = async () => {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    if (!username || !password) return;

    const res = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) handleLoginSuccess(data);
    else {
        const err = document.getElementById('authError');
        err.textContent = data.error || window.t('login_error');
        err.classList.remove('hidden');
    }
};

// ==================== REGISTER ====================
document.getElementById('registerBtn').onclick = async () => {
    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regPasswordConfirm').value;

    const err = document.getElementById('regError');

    // Фронтенд-валидация в соответствии с бэкендом
    if (!username || !password) {
        err.textContent = window.t('please_fill_in_the_required_fields');
        err.classList.remove('hidden'); return;
    }
    const usernameRegex = /^[a-zA-Zа-яА-ЯёЁ0-9_-]{3,32}$/;
    if (!usernameRegex.test(username)) {
        err.textContent = window.t('username_invalid');
        err.classList.remove('hidden'); return;
    }
    if (password.length < 8) {
        err.textContent = window.t('password_too_short');
        err.classList.remove('hidden'); return;
    }
    if (password !== confirm) {
        err.textContent = window.t('passwords_dont_match');
        err.classList.remove('hidden'); return;
    }

    const res = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, email })
    });
    const data = await res.json();
    if (data.success) handleLoginSuccess(data);
    else {
        err.textContent = data.error || window.t('server_error');
        err.classList.remove('hidden');
    }
};

// ==================== FORGOT PASSWORD ====================
if (document.getElementById('forgotBtn')) {
    document.getElementById('forgotBtn').onclick = async () => {
        const email = document.getElementById('forgotEmail').value.trim();
        if (!email) return;
        const msg = document.getElementById('forgotMsg');
        msg.textContent = window.t('forgot_sending');
        msg.style.background = '';
        msg.classList.remove('hidden');
        await fetch('/api/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
        msg.style.background = 'var(--accent-green)';
        msg.textContent = window.t('forgot_sent');
    };
}

// ==================== RESET PASSWORD ====================
if (document.getElementById('resetBtn')) {
    document.getElementById('resetBtn').onclick = async () => {
        const token = document.getElementById('resetTokenVal').value;
        const newPassword = document.getElementById('resetPassword').value;
        const msg = document.getElementById('resetMsg');

        if (!newPassword) return;
        if (newPassword.length < 8) {
            msg.textContent = window.t('password_too_short');
            msg.classList.remove('hidden'); return;
        }

        const res = await fetch('/api/reset-password', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, newPassword })
        });
        const data = await res.json();
        if (data.success) {
            msg.style.background = 'var(--accent-green)';
            msg.textContent = window.t('password_changed');
            msg.classList.remove('hidden');
            setTimeout(() => { window.location.href = "/"; }, 1500);
        } else {
            msg.textContent = data.error || window.t('server_error');
            msg.classList.remove('hidden');
        }
    };
}

// ==================== LOGOUT ====================
if (document.getElementById('logoutBtn')) {
    document.getElementById('logoutBtn').onclick = async () => {
        await fetch('/api/logout', { method: 'POST' });
        location.reload();
    };
}

// ==================== INLINE VALIDATION ====================
const MIN_PASSWORD_LENGTH = 8;
const usernameRegexFront = /^[a-zA-Zа-яА-ЯёЁ0-9_-]{3,32}$/;

function setFieldState(input, valid) {
    if (!input || input.value.length === 0) {
        input.style.borderColor = '';
    } else {
        input.style.borderColor = valid ? 'var(--accent-green)' : 'var(--accent-red)';
    }
}

let validateTimeout = null;
function scheduleValidate(fn) {
    clearTimeout(validateTimeout);
    validateTimeout = setTimeout(fn, 150);
}

const regUsernameInput = document.getElementById('regUsername');
const regPasswordInput = document.getElementById('regPassword');
const regPassConfInput = document.getElementById('regPasswordConfirm');

if (regUsernameInput) regUsernameInput.addEventListener('input', () => {
    scheduleValidate(() => setFieldState(regUsernameInput, usernameRegexFront.test(regUsernameInput.value)));
});

if (regPasswordInput) regPasswordInput.addEventListener('input', () => {
    scheduleValidate(() => {
        setFieldState(regPasswordInput, regPasswordInput.value.length >= MIN_PASSWORD_LENGTH);
        if (regPassConfInput && regPassConfInput.value) {
            setFieldState(regPassConfInput, regPassConfInput.value === regPasswordInput.value && regPassConfInput.value.length >= MIN_PASSWORD_LENGTH);
        }
    });
});

if (regPassConfInput) regPassConfInput.addEventListener('input', () => {
    scheduleValidate(() => setFieldState(regPassConfInput, regPassConfInput.value === regPasswordInput.value && regPassConfInput.value.length >= MIN_PASSWORD_LENGTH));
});
