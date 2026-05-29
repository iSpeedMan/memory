const bcrypt = require('bcrypt');

/**
 * Создаёт первого администратора при старте, если его ещё нет.
 * Проверяет по username (идемпотентно), не по количеству пользователей.
 */
async function createFirstAdmin(db, conf) {
    const admin = conf.firstAdmin;
    if (!admin || !admin.username || !admin.password) {
        console.warn('⚠️  Данные первого администратора не указаны в conf.js');
        return;
    }

    try {
        const existing = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM users WHERE username = ?', [admin.username], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (existing) return; // Уже существует — ничего не делаем

        const hash = await bcrypt.hash(admin.password, 10);
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
        console.log(`✅ Первый администратор "${admin.username}" создан`);
    } catch (e) {
        console.error('❌ Ошибка создания первого администратора:', e.message);
    }
}

module.exports = { createFirstAdmin };
