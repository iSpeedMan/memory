window.socket = io();

const authScreen = document.getElementById('authScreen');
const lobbyScreen = document.getElementById('lobbyScreen');

window.currentUsername = '';
window.currentUserAvatar = '😶';
window.isAdmin = false;

window.toggleAuth = function(type) {
    const panels = ['loginPanel', 'registerPanel', 'forgotPanel', 'resetPanel'];
    panels.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
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
        
        // Важно: сначала применяем настройки (тема + язык), потом остальное
        window.applySettings(profData.theme || 'dark', profData.language || 'auto');
        
        if (typeof window.loadCategories === 'function') await window.loadCategories();
        
    } catch (e) {
        console.error('Profile load error', e);
        window.applySettings('dark', 'auto');
    }

    window.history.replaceState({}, document.title, "/");
}

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

// ==================== КНОПКИ И ENTER ====================

// Логин по Enter
if (document.getElementById('username') && document.getElementById('password')) {
    const loginInputs = [document.getElementById('username'), document.getElementById('password')];
    loginInputs.forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('loginBtn').click();
            }
        });
    });
}

// Регистрация по Enter
if (document.getElementById('regUsername') && document.getElementById('regPassword') && document.getElementById('regPasswordConfirm')) {
    const regInputs = [
        document.getElementById('regUsername'),
        document.getElementById('regPassword'),
        document.getElementById('regPasswordConfirm')
    ];
    regInputs.forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('registerBtn').click();
            }
        });
    });
}

// Forgot password по Enter
if (document.getElementById('forgotEmail')) {
    document.getElementById('forgotEmail').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('forgotBtn').click();
        }
    });
}

// Reset password по Enter
if (document.getElementById('resetPassword')) {
    document.getElementById('resetPassword').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('resetBtn').click();
        }
    });
}

// ==================== КНОПКИ ====================
document.getElementById('loginBtn').onclick = async () => {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    if (!username || !password) return;

    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) handleLoginSuccess(data);
    else {
        const err = document.getElementById('authError');
        err.textContent = data.error || 'Login error';
        err.classList.remove('hidden');
    }
};

document.getElementById('registerBtn').onclick = async () => {
    const username = document.getElementById('regUsername').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regPasswordConfirm').value;
    if (!username || !password || password !== confirm) return;

    const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, email })
    });
    const data = await res.json();
    if (data.success) handleLoginSuccess(data);
    else {
        const err = document.getElementById('regError');
        err.textContent = data.error || 'Registration error';
        err.classList.remove('hidden');
    }
};

// forgot и reset — оставлены как были (без изменений)
if (document.getElementById('forgotBtn')) {
    document.getElementById('forgotBtn').onclick = async () => {
        const email = document.getElementById('forgotEmail').value.trim();
        if (!email) return;
        const msg = document.getElementById('forgotMsg');
        msg.textContent = "Sending..."; 
        msg.classList.remove('hidden');
        await fetch('/api/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
        msg.style.background = "var(--accent-green)";
        msg.textContent = "Check your email";
    };
}

if (document.getElementById('resetBtn')) {
    document.getElementById('resetBtn').onclick = async () => {
        const token = document.getElementById('resetTokenVal').value;
        const newPassword = document.getElementById('resetPassword').value;
        if (!newPassword) return;
        const res = await fetch('/api/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, newPassword }) });
        const data = await res.json();
        if (data.success) {
            alert("Password changed successfully!");
            window.location.href = "/";
        } else {
            const msg = document.getElementById('resetMsg');
            msg.textContent = data.error || 'Error';
            msg.classList.remove('hidden');
        }
    };
}

if (document.getElementById('logoutBtn')) {
    document.getElementById('logoutBtn').onclick = async () => {
        await fetch('/api/logout', { method: 'POST' });
        location.reload();
    };
}

// Валидация регистрации (оставлена)
const regUsernameInput = document.getElementById('regUsername');
const regPasswordInput = document.getElementById('regPassword');
const regPassConfInput = document.getElementById('regPasswordConfirm');

const loginRegex = /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{5,}$/;
const passRegex = /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{6,}$/;

function validateField(input, regex, isConfirm = false) {
    if (!input) return false;
    let isValid = isConfirm 
        ? (input.value === regPasswordInput.value && input.value.length >= 6)
        : (regex.test(input.value) && /[a-zA-Z]/.test(input.value));

    input.style.borderColor = input.value.length === 0 ? '' : (isValid ? 'var(--accent-green)' : 'var(--accent-red)');
    return isValid;
}

if (regUsernameInput) regUsernameInput.addEventListener('input', () => validateField(regUsernameInput, loginRegex));
if (regPasswordInput) regPasswordInput.addEventListener('input', () => {
    validateField(regPasswordInput, passRegex);
    if (regPassConfInput && regPassConfInput.value) validateField(regPassConfInput, null, true);
});
if (regPassConfInput) regPassConfInput.addEventListener('input', () => validateField(regPassConfInput, null, true));