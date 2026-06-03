const db = require('../db');

const ACHIEVEMENTS = {
    'first_win':       { icon: '🏆', name_ru: 'Первая победа',    name_en: 'First Win',       desc_ru: 'Выиграйте первую PvP игру',         desc_en: 'Win your first PvP game' },
    'win_streak_3':    { icon: '🔥', name_ru: 'Серия ×3',         name_en: 'Hot Streak',       desc_ru: '3 победы PvP подряд',              desc_en: '3 PvP wins in a row' },
    'win_streak_5':    { icon: '⚡', name_ru: 'Молния',           name_en: 'Lightning',        desc_ru: '5 побед PvP подряд',              desc_en: '5 PvP wins in a row' },
    'beat_hard_bot':   { icon: '🤖', name_ru: 'Укротитель ботов', name_en: 'Bot Slayer',       desc_ru: 'Победите сложного бота',           desc_en: 'Beat the hard bot' },
    'beat_gm_bot':     { icon: '👑', name_ru: 'Антигроссмейстер', name_en: 'GM Killer',        desc_ru: 'Победите бота-гроссмейстера',      desc_en: 'Beat the grandmaster bot' },
    'veteran':         { icon: '🎖️', name_ru: 'Ветеран',          name_en: 'Veteran',          desc_ru: 'Сыграйте 10 игр',                  desc_en: 'Play 10 games' },
    'experienced':     { icon: '🏅', name_ru: 'Опытный',          name_en: 'Experienced',      desc_ru: 'Сыграйте 50 игр',                  desc_en: 'Play 50 games' },
    'omnivore':        { icon: '🌍', name_ru: 'Всеядный',         name_en: 'Omnivore',         desc_ru: '5 разных категорий',               desc_en: 'Play 5 different categories' },
    'combo_master':    { icon: '💥', name_ru: 'Мастер комбо',     name_en: 'Combo Master',     desc_ru: 'Достигните множителя ×3',          desc_en: 'Reach ×3 combo multiplier' },
    'flawless':        { icon: '✨', name_ru: 'Безупречно',       name_en: 'Flawless',         desc_ru: 'Выиграйте игру без единой ошибки', desc_en: 'Win a game without any misses' },
    'big_board':       { icon: '🗺️', name_ru: 'Большая карта',   name_en: 'Big Board',        desc_ru: 'Завершите игру 8×8',               desc_en: 'Complete an 8×8 game' },
    'unicode_explorer':{ icon: '🌐', name_ru: 'Исследователь',    name_en: 'Unicode Explorer', desc_ru: 'Сыграйте в категории «Все эмодзи»', desc_en: 'Play in Unicode category' },
};

function getAll() {
    return ACHIEVEMENTS;
}

function hasAchievement(userId, key, callback) {
    db.get('SELECT 1 FROM user_achievements WHERE user_id = ? AND achievement_key = ?', [userId, key], (err, row) => {
        callback(!err && !!row);
    });
}

function awardAchievement(userId, key, io) {
    db.run(
        'INSERT OR IGNORE INTO user_achievements (user_id, achievement_key) VALUES (?, ?)',
        [userId, key],
        function(err) {
            if (!err && this.changes > 0 && io) {
                const ach = ACHIEVEMENTS[key];
                if (ach) {
                    io.to(`user_${userId}`).emit('achievementUnlocked', { key, ...ach });
                }
            }
        }
    );
}

function getAllWithStatus(userId, callback) {
    db.all('SELECT achievement_key, achieved_at FROM user_achievements WHERE user_id = ?', [userId], (err, rows) => {
        const earned = new Map();
        (rows || []).forEach(r => earned.set(r.achievement_key, r.achieved_at));
        const result = Object.entries(ACHIEVEMENTS).map(([key, def]) => ({
            key,
            ...def,
            earned: earned.has(key),
            achieved_at: earned.get(key) || null
        }));
        callback(result);
    });
}

function getUserAchievements(userId, callback) {
    db.all(
        'SELECT achievement_key, achieved_at FROM user_achievements WHERE user_id = ? ORDER BY achieved_at ASC',
        [userId],
        (err, rows) => {
            if (err || !rows) return callback([]);
            callback(rows.map(r => ({
                key: r.achievement_key,
                achieved_at: r.achieved_at,
                ...(ACHIEVEMENTS[r.achievement_key] || { icon: '?', name_ru: r.achievement_key, name_en: r.achievement_key, desc_ru: '', desc_en: '' })
            })));
        }
    );
}

function checkAndAward(userId, gameData, io) {
    if (!userId || userId === 'bot_cpu') return;
    const { isBotGame, botDifficulty, isWinner, category, maxCombo, failedFlips, gridSize, myScore, oppScore } = gameData;

    // Big board: finished 8x8
    if (gridSize === 8) awardAchievement(userId, 'big_board', io);

    // Unicode explorer
    if (category === 'unicode') awardAchievement(userId, 'unicode_explorer', io);

    // Combo master: reached x3 (combo count >= 6: 1+5*0.5=3.5... actually combo=6 gives 1+(6-1)*0.5=3.5 > 3. Let's check maxCombo >= 5 for x3)
    if (maxCombo >= 5) awardAchievement(userId, 'combo_master', io);

    // Bot-specific achievements
    if (isBotGame && isWinner) {
        if (botDifficulty === 'hard') awardAchievement(userId, 'beat_hard_bot', io);
        if (botDifficulty === 'grandmaster') awardAchievement(userId, 'beat_gm_bot', io);
    }

    // Flawless: win with 0 failed flips
    if (isWinner && failedFlips === 0) awardAchievement(userId, 'flawless', io);

    // Stats-based achievements (require DB queries)
    db.get('SELECT COUNT(*) as total FROM game_history WHERE player1_id = ? OR player2_id = ?', [userId, userId], (err, row) => {
        if (err || !row) return;
        const total = row.total;
        if (total >= 10) awardAchievement(userId, 'veteran', io);
        if (total >= 50) awardAchievement(userId, 'experienced', io);
    });

    // Omnivore: 5 different categories
    db.get('SELECT COUNT(DISTINCT category) as cats FROM game_history WHERE (player1_id = ? OR player2_id = ?)', [userId, userId], (err, row) => {
        if (!err && row && row.cats >= 5) awardAchievement(userId, 'omnivore', io);
    });

    // PvP-only achievements
    if (!isBotGame && isWinner) {
        // First win
        awardAchievement(userId, 'first_win', io);

        // Win streak: get last 5 PvP games
        db.all(
            `SELECT winner_id FROM game_history
             WHERE (player1_id = ? OR player2_id = ?) AND is_bot_game = 0
             ORDER BY played_at DESC LIMIT 5`,
            [userId, userId],
            (err, rows) => {
                if (err || !rows) return;
                const streak = rows.filter(r => String(r.winner_id) === String(userId)).length;
                if (rows.length >= 3 && rows.slice(0, 3).every(r => String(r.winner_id) === String(userId))) {
                    awardAchievement(userId, 'win_streak_3', io);
                }
                if (rows.length >= 5 && rows.slice(0, 5).every(r => String(r.winner_id) === String(userId))) {
                    awardAchievement(userId, 'win_streak_5', io);
                }
            }
        );
    }
}

module.exports = { ACHIEVEMENTS, getAll, getUserAchievements, getAllWithStatus, checkAndAward, awardAchievement };
