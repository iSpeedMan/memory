const db = require('../db');
const i18n = require('../public/js/i18n.js');
const conf = require('../conf');

function getLang(req) {
    if (req && req.session && req.session.language && req.session.language !== 'auto') {
        return req.session.language;
    }
    const acceptLang = req.headers && req.headers['accept-language'];
    if (acceptLang) {
        const primaryLang = acceptLang.split(',')[0].split(';')[0].trim().split('-')[0].toLowerCase();
        if (primaryLang === 'ru') return 'ru';
    }
    return conf.appLang || 'en';
}

function isAdmin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: i18n.t('not_authorized', getLang(req)) });
    }
    db.get('SELECT is_admin FROM users WHERE id = ?', [req.session.userId], (err, user) => {
        if (err || !user || user.is_admin !== 1) {
            return res.status(403).json({ error: i18n.t('no_rights', getLang(req)) });
        }
        next();
    });
}

module.exports = { getLang, isAdmin };