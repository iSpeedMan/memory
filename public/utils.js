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
