const db = require('../db');
const achievementRewards = require('./achievementRewards');

const ACHIEVEMENTS = {
    'first_win':       { icon: '🏆', name_ru: 'Первая победа',     name_en: 'First Win',        desc_ru: 'Выиграйте первую PvP игру',               desc_en: 'Win your first PvP game' },
    'winner':          { icon: '🎉', name_ru: 'Победитель',         name_en: 'Winner',            desc_ru: '3 победы в PvP',                          desc_en: 'Win 3 PvP games' },
    'win_streak_3':    { icon: '🔥', name_ru: 'Серия ×3',           name_en: 'Hot Streak',        desc_ru: '3 победы PvP подряд',                     desc_en: '3 PvP wins in a row' },
    'win_streak_5':    { icon: '⚡', name_ru: 'Молния',             name_en: 'Lightning',         desc_ru: '5 побед PvP подряд',                      desc_en: '5 PvP wins in a row' },
    'pvp_champion':    { icon: '🥊', name_ru: 'PvP Чемпион',        name_en: 'PvP Champion',      desc_ru: '10 побед в PvP',                          desc_en: 'Win 10 PvP games' },
    'beat_hard_bot':   { icon: '🤖', name_ru: 'Укротитель ботов',   name_en: 'Bot Slayer',        desc_ru: 'Победите сложного бота',                  desc_en: 'Beat the hard bot' },
    'beat_gm_bot':     { icon: '👑', name_ru: 'Антигроссмейстер',   name_en: 'GM Killer',         desc_ru: 'Победите бота-гроссмейстера',             desc_en: 'Beat the grandmaster bot' },
    'veteran':         { icon: '🎖️', name_ru: 'Ветеран',            name_en: 'Veteran',           desc_ru: 'Сыграйте 10 игр',                         desc_en: 'Play 10 games' },
    'experienced':     { icon: '🏅', name_ru: 'Опытный',            name_en: 'Experienced',       desc_ru: 'Сыграйте 50 игр',                         desc_en: 'Play 50 games' },
    'centurion':       { icon: '⚔️', name_ru: 'Центурион',          name_en: 'Centurion',         desc_ru: 'Сыграйте 100 игр',                        desc_en: 'Play 100 games' },
    'omnivore':        { icon: '🌍', name_ru: 'Всеядный',           name_en: 'Omnivore',          desc_ru: '5 разных категорий',                      desc_en: 'Play 5 different categories' },
    'combo_master':    { icon: '💥', name_ru: 'Мастер комбо',       name_en: 'Combo Master',      desc_ru: 'Достигните множителя ×3',                 desc_en: 'Reach ×3 combo multiplier' },
    'flawless':        { icon: '✨', name_ru: 'Безупречно',         name_en: 'Flawless',          desc_ru: 'Выиграйте игру без единой ошибки',        desc_en: 'Win without any misses' },
    'no_hints_win':    { icon: '🧠', name_ru: 'Интуиция',           name_en: 'Pure Instinct',     desc_ru: 'Выиграйте игру без использования подсказок', desc_en: 'Win a game without using any hints' },
    'big_win':         { icon: '💪', name_ru: 'Разгром',            name_en: 'Landslide',         desc_ru: 'Победите с отрывом 5+ очков',             desc_en: 'Win with a 5+ point lead' },
    'big_board':       { icon: '🗺️', name_ru: 'Большая карта',     name_en: 'Big Board',         desc_ru: 'Завершите игру 8×8',                      desc_en: 'Complete an 8×8 game' },
    'small_board_ace': { icon: '🎯', name_ru: 'Мини-мастер',        name_en: 'Mini Master',       desc_ru: 'Победите в игре 4×4',                     desc_en: 'Win a 4×4 game' },
    'draw_king':       { icon: '🏳️', name_ru: 'Дипломат',           name_en: 'Diplomat',          desc_ru: '3 ничьих в PvP',                          desc_en: 'Get 3 PvP draws' },
    'daily_devotee':   { icon: '☀️', name_ru: 'Каждый день',        name_en: 'Daily Player',      desc_ru: 'Получите ежедневный бонус',               desc_en: 'Claim your daily bonus' },
    'unicode_explorer':{ icon: '🌐', name_ru: 'Исследователь',      name_en: 'Unicode Explorer',  desc_ru: 'Сыграйте в категории «Все эмодзи»',       desc_en: 'Play in Unicode category' },
    'local_player':    { icon: '🕹️', name_ru: 'Местный герой',      name_en: 'Local Hero',        desc_ru: 'Завершите первую локальную игру',         desc_en: 'Complete your first local game' },
};

function getAll() { return ACHIEVEMENTS; }

function hasAchievement(userId, key, callback) {
    db.get('SELECT 1 FROM user_achievements WHERE user_id = ? AND achievement_key = ?', [userId, key], (err, row) => {
        callback(!err && !!row);
    });
}

function awardAchievement(userId, key, io) {
    if (!ACHIEVEMENTS[key]) return;
    db.run(
        'INSERT OR IGNORE INTO user_achievements (user_id, achievement_key) VALUES (?, ?)',
        [userId, key],
        function(err) {
            if (!err && this.changes > 0) {
                const ach = ACHIEVEMENTS[key];
                const coins = achievementRewards.getReward(key);
                if (coins > 0) {
                    const coinsService = require('./coinsService');
                    coinsService.awardCoins(userId, coins, io, 'achievement_' + key);
                }
                if (io) {
                    io.to(`user_${userId}`).emit('achievementUnlocked', { key, ...ach, coins });
                }
            }
        }
    );
}

function getAllWithStatus(userId, callback) {
    db.all('SELECT achievement_key, achieved_at FROM user_achievements WHERE user_id = ?', [userId], (err, rows) => {
        const earned = new Map();
        (rows || []).forEach(r => earned.set(r.achievement_key, r.achieved_at));
        const rewards = achievementRewards.get();
        const result = Object.entries(ACHIEVEMENTS).map(([key, def]) => ({
            key, ...def,
            coins: rewards[key] ?? 0,
            earned: earned.has(key),
            achieved_at: earned.get(key) || null,
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
            const rewards = achievementRewards.get();
            callback(rows.map(r => ({
                key: r.achievement_key,
                achieved_at: r.achieved_at,
                ...(ACHIEVEMENTS[r.achievement_key] || { icon: '?', name_ru: r.achievement_key, name_en: r.achievement_key, desc_ru: '', desc_en: '' }),
                coins: rewards[r.achievement_key] ?? 0,
            })));
        }
    );
}

function checkAndAward(userId, gameData, io) {
    if (!userId || userId === 'bot_cpu') return;
    const { isBotGame, botDifficulty, isWinner, category, maxCombo, failedFlips, gridSize, myScore, oppScore, hintsUsed } = gameData;

    if (gridSize === 8) awardAchievement(userId, 'big_board', io);
    if (gridSize === 4 && isWinner) awardAchievement(userId, 'small_board_ace', io);
    if (category === 'unicode') awardAchievement(userId, 'unicode_explorer', io);
    if (maxCombo >= 5) awardAchievement(userId, 'combo_master', io);
    if (isWinner && failedFlips === 0) awardAchievement(userId, 'flawless', io);
    if (isWinner && (hintsUsed === 0)) awardAchievement(userId, 'no_hints_win', io);
    if (isWinner && typeof myScore === 'number' && typeof oppScore === 'number' && (myScore - oppScore) >= 5) {
        awardAchievement(userId, 'big_win', io);
    }

    if (isBotGame && isWinner) {
        if (botDifficulty === 'hard') awardAchievement(userId, 'beat_hard_bot', io);
        if (botDifficulty === 'grandmaster') awardAchievement(userId, 'beat_gm_bot', io);
    }

    db.get('SELECT COUNT(*) as total FROM game_history WHERE player1_id = ? OR player2_id = ?', [userId, userId], (err, row) => {
        if (err || !row) return;
        const total = row.total;
        if (total >= 10) awardAchievement(userId, 'veteran', io);
        if (total >= 50) awardAchievement(userId, 'experienced', io);
        if (total >= 100) awardAchievement(userId, 'centurion', io);
    });

    db.get('SELECT COUNT(DISTINCT category) as cats FROM game_history WHERE (player1_id = ? OR player2_id = ?)', [userId, userId], (err, row) => {
        if (!err && row && row.cats >= 5) awardAchievement(userId, 'omnivore', io);
    });

    if (!isBotGame) {
        if (isWinner) {
            awardAchievement(userId, 'first_win', io);

            db.all(
                `SELECT winner_id FROM game_history
                 WHERE (player1_id = ? OR player2_id = ?) AND is_bot_game = 0
                 ORDER BY played_at DESC LIMIT 10`,
                [userId, userId],
                (err, rows) => {
                    if (err || !rows) return;
                    const wins = rows.filter(r => String(r.winner_id) === String(userId)).length;
                    if (wins >= 3) awardAchievement(userId, 'winner', io);
                    if (wins >= 10) awardAchievement(userId, 'pvp_champion', io);
                    if (rows.length >= 3 && rows.slice(0, 3).every(r => String(r.winner_id) === String(userId))) {
                        awardAchievement(userId, 'win_streak_3', io);
                    }
                    if (rows.length >= 5 && rows.slice(0, 5).every(r => String(r.winner_id) === String(userId))) {
                        awardAchievement(userId, 'win_streak_5', io);
                    }
                }
            );
        }

        const isDraw = typeof myScore === 'number' && myScore === oppScore;
        if (isDraw) {
            db.get(
                `SELECT COUNT(*) as draws FROM game_history
                 WHERE (player1_id = ? OR player2_id = ?) AND is_bot_game = 0 AND winner_id IS NULL`,
                [userId, userId],
                (err, row) => {
                    if (!err && row && row.draws >= 3) awardAchievement(userId, 'draw_king', io);
                }
            );
        }
    }
}

module.exports = { ACHIEVEMENTS, getAll, getUserAchievements, getAllWithStatus, checkAndAward, awardAchievement };
