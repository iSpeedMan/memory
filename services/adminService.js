const bcrypt = require('bcrypt');

async function createFirstAdmin(db, conf) {
    try {
        const row = await new Promise((resolve, reject) => {
            db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        if (row && row.count > 0) return;
        const admin = conf.firstAdmin;
        if (!admin || !admin.username || !admin.password) {
            console.warn("⚠️  Данные первого администратора не указаны в conf.js");
            return;
        }
        const hash = await bcrypt.hash(admin.password, 10);
        db.run('INSERT INTO users (username, password, email, is_admin, avatar) VALUES (?, ?, ?, 1, "😶")',
            [admin.username, hash, admin.email || null],
            function(err) {
                if (err) console.error("❌ Ошибка создания первого администратора:", err);
                else console.log(`✅ Первый администратор успешно создан!`);
            });
    } catch (e) {
        console.error("Ошибка при создании первого администратора:", e);
    }
}

module.exports = { createFirstAdmin };