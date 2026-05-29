// Отслеживает незавершённые игры с ботом per-user.
// Незавершённая = создана, но gameOver не получен (игрок вышел досрочно).

const botSessions = new Map(); // userId -> { unfinished: number, blockedUntil: number }

const MAX_UNFINISHED = 5;
const BLOCK_DURATION_MS = 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // чистим раз в 5 минут

function _getOrCreate(userId) {
    if (!botSessions.has(userId)) {
        botSessions.set(userId, { unfinished: 0, blockedUntil: 0 });
    }
    return botSessions.get(userId);
}

/**
 * Проверяет, может ли пользователь создать новую бот-комнату.
 * @returns {{ allowed: true } | { allowed: false, remainingSeconds: number }}
 */
function checkCanCreate(userId) {
    const now = Date.now();
    const info = _getOrCreate(userId);

    // Если блок истёк — сбрасываем
    if (info.blockedUntil > 0 && now >= info.blockedUntil) {
        info.unfinished = 0;
        info.blockedUntil = 0;
    }

    if (now < info.blockedUntil) {
        return { allowed: false, remainingSeconds: Math.ceil((info.blockedUntil - now) / 1000) };
    }

    if (info.unfinished >= MAX_UNFINISHED) {
        info.blockedUntil = now + BLOCK_DURATION_MS;
        info.unfinished = 0;
        return { allowed: false, remainingSeconds: 60 };
    }

    return { allowed: true };
}

/**
 * Вызывается при создании бот-комнаты.
 */
function markCreated(userId) {
    _getOrCreate(userId).unfinished++;
}

/**
 * Вызывается при нормальном завершении бот-игры (gameOver).
 */
function markFinished(userId) {
    const info = botSessions.get(userId);
    if (info && info.unfinished > 0) info.unfinished--;
}

// Периодическая очистка неактивных записей (предотвращает утечку памяти)
const _cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [userId, info] of botSessions) {
        if (info.unfinished === 0 && now >= info.blockedUntil) {
            botSessions.delete(userId);
        }
    }
}, CLEANUP_INTERVAL_MS);

function clearCleanupTimer() {
    clearInterval(_cleanupTimer);
}

module.exports = { checkCanCreate, markCreated, markFinished, clearCleanupTimer };
