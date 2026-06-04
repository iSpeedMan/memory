const db = require('../db');

function addGameResult({ player1Id, player2Id, player1Name, player2Name, player1Score, player2Score, category, isBotGame, botDifficulty, failedFlips, maxCombo, gridSize }) {
    let winnerId = null;
    if (player1Score > player2Score) {
        winnerId = player1Id;
    } else if (!isBotGame && player2Score > player1Score) {
        winnerId = player2Id;
    }

    db.run(
        `INSERT INTO game_history
            (player1_id, player2_id, player1_name, player2_name,
             player1_score, player2_score, winner_id, category, is_bot_game, bot_difficulty,
             failed_flips, max_combo, grid_size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [player1Id, player2Id || null, player1Name, player2Name,
         player1Score, player2Score, winnerId, category, isBotGame ? 1 : 0, botDifficulty || null,
         failedFlips || 0, maxCombo || 0, gridSize || 6],
        (err) => { if (err) console.error('gameHistory.addGameResult error:', err); }
    );
}

function getUserHistory(userId, limit, callback) {
    const n = Number.isInteger(limit) && limit > 0 ? limit : 20;
    db.all(
        `SELECT
            id, played_at, category, is_bot_game, bot_difficulty, winner_id, grid_size,
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

function getUserPvpStats(userId, callback) {
    db.get(
        `SELECT
            SUM(total) AS total,
            SUM(wins)  AS wins,
            SUM(draws) AS draws,
            SUM(losses) AS losses
         FROM (
             SELECT
                 COUNT(*) AS total,
                 SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) AS wins,
                 SUM(CASE WHEN winner_id IS NULL THEN 1 ELSE 0 END) AS draws,
                 SUM(CASE WHEN winner_id IS NOT NULL AND winner_id != ? THEN 1 ELSE 0 END) AS losses
             FROM game_history
             WHERE player1_id = ? AND is_bot_game = 0
             UNION ALL
             SELECT
                 COUNT(*) AS total,
                 SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) AS wins,
                 SUM(CASE WHEN winner_id IS NULL THEN 1 ELSE 0 END) AS draws,
                 SUM(CASE WHEN winner_id IS NOT NULL AND winner_id != ? THEN 1 ELSE 0 END) AS losses
             FROM game_history
             WHERE player2_id = ? AND is_bot_game = 0
         )`,
        [userId, userId, userId, userId, userId, userId],
        callback
    );
}

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
