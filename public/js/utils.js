(function() {
    const theme = localStorage.getItem('appTheme') || 'dark';
    if (theme === 'light') {
        document.documentElement.classList.add('theme-light');
        document.body && document.body.classList.add('theme-light');
    }
})();

window.escHtml = function(str) {
    if (str === null || str === undefined) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(str).replace(/[&<>"']/g, m => map[m]);
};

window._csrfToken = null;

window.fetchCsrfToken = async function() {
    try {
        const res = await window._origFetch('/api/csrf');
        const data = await res.json();
        window._csrfToken = data.token || null;
    } catch (e) {
        window._csrfToken = null;
    }
};

(function() {
    const _stack = [];

    window.modalPush = function(id, closeFn) {
        const idx = _stack.findIndex(m => m.id === id);
        if (idx !== -1) _stack.splice(idx, 1);
        _stack.push({ id, close: closeFn });
    };

    window.modalPop = function(id) {
        const idx = _stack.findIndex(m => m.id === id);
        if (idx !== -1) _stack.splice(idx, 1);
    };

    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape' || _stack.length === 0) return;
        _stack[_stack.length - 1].close();
    });

    window.addSwipeClose = function(element, closeFn, threshold) {
        if (!element) return;
        threshold = threshold || 60;
        var startY = 0, startX = 0;
        element.addEventListener('touchstart', function(e) {
            startY = e.touches[0].clientY;
            startX = e.touches[0].clientX;
        }, { passive: true });
        element.addEventListener('touchend', function(e) {
            var dy = e.changedTouches[0].clientY - startY;
            var dx = Math.abs(e.changedTouches[0].clientX - startX);
            if (dy > threshold && dx < threshold) closeFn();
        }, { passive: true });
    };
})();

(function() {
    const _orig = window.fetch.bind(window);
    window._origFetch = _orig;
    window.fetch = function(url, options) {
        options = options || {};
        const method = (options.method || 'GET').toUpperCase();
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && window._csrfToken) {
            const rawHeaders = options.headers || {};
            const merged = rawHeaders instanceof Headers ? rawHeaders : new Headers(rawHeaders);
            if (!merged.has('X-CSRF-Token')) {
                merged.set('X-CSRF-Token', window._csrfToken);
            }
            options = Object.assign({}, options, { headers: merged });
        }
        return _orig(url, options);
    };
})();
