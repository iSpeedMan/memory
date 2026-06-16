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

    window.applySettings = function(theme, langPref) {
        theme = theme || 'dark';
        langPref = langPref || 'auto';
        localStorage.setItem('appTheme', theme);
        if (langPref === 'auto' || !langPref) {
            window.currentLang = (navigator.language || 'en').startsWith('ru') ? 'ru' : 'en';
        } else {
            window.currentLang = langPref;
        }
        document.documentElement.lang = window.currentLang;
        var isLight = theme === 'light';
        document.body.classList.toggle('theme-light', isLight);
        document.documentElement.classList.toggle('theme-light', isLight);
        document.querySelectorAll('[data-i18n]').forEach(function(el) {
            var key = el.getAttribute('data-i18n');
            var val = t(key, window.currentLang);
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = val;
            } else {
                el.textContent = val;
            }
        });
        if (typeof renderRooms === 'function') renderRooms();
        if (typeof loadCategories === 'function') loadCategories();
    };

    window.initI18n = function() {
        var saved = localStorage.getItem('appLang');
        var langPref = saved || 'auto';
        var theme = localStorage.getItem('appTheme') || 'dark';
        window.applySettings(theme, langPref);
    };

    document.addEventListener('DOMContentLoaded', function() {
        var langSelect = document.getElementById('profLang');
        if (langSelect) {
            var langNames = { ru: 'Русский', en: 'English' };
            langSelect.innerHTML = '<option value="auto" data-i18n="lang_auto">' + t('lang_auto', 'en') + '</option>';
            Object.keys(translations).forEach(function(lang) {
                langSelect.insertAdjacentHTML('beforeend', '<option value="' + lang + '">' + (langNames[lang] || lang) + '</option>');
            });
        }
        window.applySettings('dark', 'auto');
    });
}
