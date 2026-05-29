const db = require('../db');

/**
 * Сохраняет результат игры.
 * Для PvP: player1 = создатель комнаты, player2 = вошедший игрок.
 * Для бот-игр: player1 = человек (всегда), player2 = null.
 * winner_id = userId победителя. null = ничья ИЛИ победа бота.
 */
function addGameResult({ player1Id, player2Id, player1Name, player2Name, player1Score, player2Score, category, isBotGame, botDifficulty }) {
    let winnerId = null;
    if (player1Score > player2Score) {
        winnerId = player1Id;
    } else if (!isBotGame && player2Score > player1Score) {
        winnerId = player2Id;
    }

    db.run(
        `INSERT INTO game_history
            (player1_id, player2_id, player1_name, player2_name,
             player1_score, player2_score, winner_id, category, is_bot_game, bot_difficulty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [player1Id, player2Id || null, player1Name, player2Name,
         player1Score, player2Score, winnerId, category, isBotGame ? 1 : 0, botDifficulty || null],
        (err) => { if (err) console.error('gameHistory.addGameResult error:', err); }
    );
}

/**
 * История последних N игр пользователя.
 * Возвращает строки с полями: opponent_name, my_score, opp_score, winner_id, is_bot_game, bot_difficulty, category, played_at
 */
function getUserHistory(userId, limit, callback) {
    const n = Number.isInteger(limit) && limit > 0 ? limit : 20;
    db.all(
        `SELECT
            id, played_at, category, is_bot_game, bot_difficulty, winner_id,
            CASE WHEN player1_id = ? THEN player2_name ELSE player1_name END AS opponent_name,
            CASE WHEN player1_id = ? THEN player1_score ELSE player2_score END AS my_score,
            CASE WHEN player1_id = ? THEN player2_score ELSE player1_score END AS opp_score
         FROM game_history
         WHERE player1_id = ? OR player2_id = ?
         ORDER BY played_at DESC LIMIT ?`,
        [userId, userId, userId, userId, userId, n],
        callback
    );
}

/**
 * PvP-статистика: всего / побед / ничьих / поражений
 */
function getUserPvpStats(userId, callback) {
    db.get(
        `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN winner_id IS NULL THEN 1 ELSE 0 END) AS draws,
            SUM(CASE WHEN winner_id IS NOT NULL AND winner_id != ? THEN 1 ELSE 0 END) AS losses
         FROM game_history
         WHERE (player1_id = ? OR player2_id = ?) AND is_bot_game = 0`,
        [userId, userId, userId, userId],
        callback
    );
}

/**
 * Статистика по боту: по уровням сложности
 */
function getUserBotStats(userId, callback) {
    db.all(
        `SELECT
            COALESCE(bot_difficulty, 'medium') AS bot_difficulty,
            COUNT(*) AS total,
            SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN player1_score = player2_score THEN 1 ELSE 0 END) AS draws,
            SUM(CASE WHEN winner_id IS NULL AND player1_score < player2_score THEN 1 ELSE 0 END) AS losses
         FROM game_history
         WHERE player1_id = ? AND is_bot_game = 1
         GROUP BY bot_difficulty`,
        [userId, userId],
        callback
    );
}

module.exports = { addGameResult, getUserHistory, getUserPvpStats, getUserBotStats };
