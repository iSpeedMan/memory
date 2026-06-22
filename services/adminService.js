const bcrypt = require('bcrypt');
const logger = require('../utils/logger');

/**
 * Creates the first admin account on startup if it does not exist yet.
 * Checks by username (idempotent), not by user count.
 */
async function createFirstAdmin(db, conf) {
    const admin = conf.firstAdmin;
    if (!admin || !admin.username || !admin.password) {
        logger.warn('First admin credentials are not set in conf.js');
        return;
    }

    try {
        const existing = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM users WHERE username = ?', [admin.username], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (existing) return;

        const hash = await bcrypt.hash(admin.password, conf.bcryptRounds);
        await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO users (username, password, email, is_admin, avatar) VALUES (?, ?, ?, 1, ?)',
                [admin.username, hash, admin.email || null, '😶'],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
        logger.info(`First admin "${admin.username}" created`);
    } catch (e) {
        logger.error({ err: e }, 'Failed to create first admin');
    }
}

module.exports = { createFirstAdmin };
