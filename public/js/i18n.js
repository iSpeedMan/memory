const translations = (function() {
    if (typeof require !== 'undefined' && typeof window === 'undefined') {
        return {
            ru: require('../locales/ru.js'),
            en: require('../locales/en.js')
        };
    }
    return {
        ru: window.__locale_ru || {},
        en: window.__locale_en || {}
    };
})();

function t(key, lang) {
    var l = lang || (typeof currentLang !== 'undefined' ? currentLang : 'en');
    return (translations[l] && translations[l][key]) || (translations['en'] && translations['en'][key]) || key;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { translations, t };
} else {
    window.translations = translations;
    window.currentLang = 'en';

    window.applyTranslations = function(lang) {
        window.currentLang = lang || 'en';
        document.querySelectorAll('[data-i18n]').forEach(function(el) {
            var key = el.getAttribute('data-i18n');
            var attr = el.getAttribute('data-i18n-attr');
            var val = t(key, window.currentLang);
            if (attr) { el.setAttribute(attr, val); }
            else { el.textContent = val; }
        });
        document.querySelectorAll('[data-i18n-ph]').forEach(function(el) {
            el.placeholder = t(el.getAttribute('data-i18n-ph'), window.currentLang);
        });
    };

    window.t = t;

    window.initI18n = function() {
        var saved = localStorage.getItem('lang');
        var browserLang = (navigator.language || 'en').split('-')[0];
        var lang = saved || (translations[browserLang] ? browserLang : 'en');
        window.applyTranslations(lang);
    };
}
