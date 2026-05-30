// Общие утилиты для всех frontend-файлов
// Загружается первым в index.html

// Применяем тему из localStorage до DOMContentLoaded, чтобы избежать мигания
(function() {
    const theme = localStorage.getItem('appTheme') || 'dark';
    if (theme === 'light') {
        document.documentElement.classList.add('theme-light');
        document.body && document.body.classList.add('theme-light');
        // body может ещё не существовать — lobby.js вызовет applySettings после загрузки
    }
})();

window.escHtml = function(str) {
    if (str === null || str === undefined) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(str).replace(/[&<>"']/g, m => map[m]);
};
