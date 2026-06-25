const db = require('../db');
const logger = require('../utils/logger');
const { getRoom, deleteRoom, markRoomsDirty, broadcastRoomsList } = require('./roomManager');
const { invalidateLeaderboard } = require('./leaderboardService');
const botTracker = require('./botTracker');
const { addGameResult } = require('./gameHistory');
const { checkAndAward } = require('./achievementService');
const { playBotTurn } = require('./botLogic');
const { cleanChatHistory } = require('../websocket/chatHandlers');
const coinsService = require('./coinsService');
const hintSettings = require('./hintSettings');
const rematchService = require('./rematchService');
const friendNotifier = require('./friendNotifier');

const BASE_POINTS = 2;
const PROCESSING_SAFETY_MS = 2000;

const cardClickThrottle = new Map();
const THROTTLE_TTL_MS = 30000;

let leaderboardDebounceTimer = null;
function debouncedInvalidateLeaderboard(io) {
    if (leaderboardDebounceTimer) clearTimeout(leaderboardDebounceTimer);
    leaderboardDebounceTimer = setTimeout(() => {
        leaderboardDebounceTimer = null;
        invalidateLeaderboard(io);
    }, 500);
}

function upsertCardStat(userId, category, cardValue) {
    const cb = (err) => { if (err) logger.warn({ err, userId, category, cardValue }, 'upsertCardStat failed'); };
    if (db.type === 'mysql') {
        db.run(
            'INSERT INTO user_card_stats (user_id, category, card_value, matches) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE matches = matches + 1',
            [userId, category, cardValue], cb
        );
    } else {
        db.run(
            'INSERT INTO user_card_stats (user_id, category, card_value, matches) VALUES (?, ?, ?, 1) ON CONFLICT(user_id, category, card_value) DO UPDATE SET matches = matches + 1',
            [userId, category, cardValue], cb
        );
    }
}

function releaseProcessing(room) {
    room.processing = false;
    if (room._processingTimer) {
        clearTimeout(room._processingTimer);
        room._processingTimer = null;
    }
}

function armProcessing(room, roomId) {
    room.processing = true;
    room._processingTimer = setTimeout(() => {
        const r = getRoom(roomId);
        if (r && r.processing) {
            r.processing = false;
            r._processingTimer = null;
        }
    }, PROCESSING_SAFETY_MS);
}

function processCardFlip(io, roomId, playerId, cardIndex) {
    const room = getRoom(roomId);
    if (!room || room.status !== 'playing' || room.players[room.turnIndex].id !== playerId) return;
    if (room.processing) return;
    if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= room.deck.length) return;
    if (room.openedCards.includes(cardIndex) || room.openedCards.length >= 2 || room.matchedPairs.includes(room.deck[cardIndex])) return;

    armProcessing(room, roomId);

    try {
        room.openedCards.push(cardIndex);
        room.cardStats[cardIndex]++;

        if (room.isBotMatch) {
            if (!room.botMemory) room.botMemory = {};
            room.botMemory[cardIndex] = room.deck[cardIndex];
        }

        io.to(roomId).emit('cardOpened', { index: cardIndex, value: room.deck[cardIndex], stats: room.cardStats[cardIndex] });

        if (room.openedCards.length === 2) {
            const [i1, i2] = room.openedCards;
            const isMatch = room.deck[i1] === room.deck[i2];

            if (isMatch) {
                const currentPlayer = room.players[room.turnIndex];
                currentPlayer.combo = (currentPlayer.combo || 0) + 1;
                const comboCount = currentPlayer.combo;
                const multiplier = comboCount >= 2 ? Math.min(1 + (comboCount - 1) * 0.5, 3) : 1;
                const points = Math.round(BASE_POINTS * multiplier);
                currentPlayer.score += points;
                room.matchedPairs.push(room.deck[i1]);
                room.openedCards = [];
                const matchColor = room.turnIndex === 0 ? '#1ba1e2' : '#f09609';
                const matchedValue = room.deck[i1];

                if (comboCount > (room.maxCombo || 0)) room.maxCombo = comboCount;
                if (multiplier > (room.maxComboMultiplier || 1)) room.maxComboMultiplier = multiplier;

                if (playerId !== 'bot_cpu') {
                    const comboCoins = comboCount === 2 ? 5 : comboCount === 3 ? 10 : comboCount === 4 ? 20 : comboCount >= 5 ? 30 : 0;
                    if (comboCoins > 0) coinsService.awardCoins(playerId, comboCoins, io, 'combo_' + comboCount);
                }

                if (playerId !== 'bot_cpu') {
                    upsertCardStat(playerId, room.category, matchedValue);
                }

                room.matchedCards[i1] = { value: matchedValue, color: matchColor };
                room.matchedCards[i2] = { value: matchedValue, color: matchColor };

                io.to(roomId).emit('matchFound', {
                    indices: [i1, i2],
                    players: room.players.map(p => ({ id: p.id, score: p.score })),
                    matchColor
                });

                releaseProcessing(room);

                if (room.isBotMatch && !currentPlayer.isBot && (comboCount === 3 || comboCount === 5)) {
                    const bot = room.players.find(p => p.isBot);
                    if (bot) {
                        const pool3 = ['bot_combo_3_0','bot_combo_3_1','bot_combo_3_2','bot_combo_3_3'];
                        const pool5 = ['bot_combo_5_0','bot_combo_5_1','bot_combo_5_2','bot_combo_5_3'];
                        const pool = comboCount === 3 ? pool3 : pool5;
                        const msgKey = pool[Math.floor(Math.random() * pool.length)];
                        const capturedRid = roomId;
                        setTimeout(() => {
                            const r = getRoom(capturedRid);
                            if (r && r.status === 'playing') io.to(capturedRid).emit('chatMessage', {
                                username: bot.name, avatar: '🤖', msgKey, ts: Date.now(), isBot: true
                            });
                        }, 700);
                    }
                }

                if (room.matchedPairs.length === room.totalPairs) {
                    finishGame(io, room, roomId);
                } else if (room.players[room.turnIndex].isBot) {
                    const capturedRoomId = roomId;
                    setTimeout(() => {
                        const r = getRoom(capturedRoomId);
                        if (r && r.status === 'playing' && r.players[r.turnIndex]?.isBot) {
                            playBotTurn(io, capturedRoomId, processCardFlip);
                        }
                    }, 2200);
                }
            } else {
                room.failedFlips = (room.failedFlips || 0) + 1;
                room.players[room.turnIndex].combo = 0;
                releaseProcessing(room);
                const capturedRoomId = roomId;
                setTimeout(() => {
                    const currentRoom = getRoom(capturedRoomId);
                    if (!currentRoom) return;
                    io.to(capturedRoomId).emit('matchFailed', { indices: [i1, i2] });
                    currentRoom.openedCards = [];
                    const currentPlayerId = currentRoom.players[currentRoom.turnIndex].id;
                    const hs = currentRoom.hintsState && currentRoom.hintsState[currentPlayerId];
                    if (hs && hs.extraTurn) {
                        hs.extraTurn = false;
                        io.to(capturedRoomId).emit('extraTurnUsed', { playerId: currentPlayerId });
                    } else {
                        currentRoom.turnIndex = (currentRoom.turnIndex + 1) % 2;
                        io.to(capturedRoomId).emit('turnChanged', currentRoom.players[currentRoom.turnIndex].id);
                    }
                    if (currentRoom.players[currentRoom.turnIndex].isBot) {
                        setTimeout(() => {
                            const r = getRoom(capturedRoomId);
                            if (r && r.status === 'playing' && r.players[r.turnIndex]?.isBot) {
                                playBotTurn(io, capturedRoomId, processCardFlip);
                            }
                        }, 1600);
                    }
                }, 1000);
            }
        } else {
            releaseProcessing(room);
            if (room.players[room.turnIndex].isBot) {
                const capturedRoomId = roomId;
                setTimeout(() => {
                    const r = getRoom(capturedRoomId);
                    if (r && r.status === 'playing' && r.players[r.turnIndex]?.isBot) {
                        playBotTurn(io, capturedRoomId, processCardFlip);
                    }
                }, 1300);
            }
        }
    } catch (err) {
        logger.error({ err }, 'processCardFlip error');
        releaseProcessing(room);
    }
}

function finishGame(io, room, roomId) {
    const category = room.category;
    const failedFlips = room.failedFlips || 0;
    const maxCombo = room.maxCombo || 0;
    const gridSize = room.gridSize || 6;

    const cfg = hintSettings.get();
    const base = cfg.win_coins_base || 30;
    const GRID_MULT = { 4: 0.5, 6: 1.0, 8: 2.0 };
    const mult = GRID_MULT[gridSize] || 1.0;
    const winCoins = Math.round(base * mult);
    const drawCoins = Math.round(winCoins * 2 / 3);
    const lossCoins = Math.round(winCoins / 3);

    let rematchKey = null;

    if (room.isBotMatch) {
        const human = room.players.find(p => !p.isBot);
        const bot = room.players.find(p => p.isBot);
        if (human) {
            botTracker.markFinished(human.id);
            const isWinner = human.score > bot.score;
            addGameResult({
                player1Id: human.id, player2Id: null,
                player1Name: human.name, player2Name: bot.name,
                player1Score: human.score, player2Score: bot.score,
                category, isBotGame: true, botDifficulty: room.botDifficulty,
                failedFlips, maxCombo, gridSize
            });
            const humanHintsUsed = (room.hintsState && room.hintsState[human.id]) ? (room.hintsState[human.id].count || 0) : 0;
            checkAndAward(human.id, {
                isBotGame: true, botDifficulty: room.botDifficulty,
                isWinner, category, maxCombo, failedFlips, gridSize,
                myScore: human.score, oppScore: bot.score, hintsUsed: humanHintsUsed
            }, io);
            const isDraw = human.score === bot.score;
            coinsService.awardCoins(human.id, isWinner ? winCoins : isDraw ? drawCoins : lossCoins, io, isWinner ? 'win' : isDraw ? 'draw' : 'loss');
        }
    } else {
        const p1 = room.players[0], p2 = room.players[1];
        if (p1 && p2) {
            addGameResult({
                player1Id: p1.id, player2Id: p2.id,
                player1Name: p1.name, player2Name: p2.name,
                player1Score: p1.score, player2Score: p2.score,
                category, isBotGame: false,
                failedFlips, maxCombo, gridSize
            });
            const p1HintsUsed = (room.hintsState && room.hintsState[p1.id]) ? (room.hintsState[p1.id].count || 0) : 0;
            const p2HintsUsed = (room.hintsState && room.hintsState[p2.id]) ? (room.hintsState[p2.id].count || 0) : 0;
            checkAndAward(p1.id, { isBotGame: false, isWinner: p1.score > p2.score, category, maxCombo, failedFlips, gridSize, myScore: p1.score, oppScore: p2.score, hintsUsed: p1HintsUsed }, io);
            checkAndAward(p2.id, { isBotGame: false, isWinner: p2.score > p1.score, category, maxCombo, failedFlips, gridSize, myScore: p2.score, oppScore: p1.score, hintsUsed: p2HintsUsed }, io);
            coinsService.awardCoins(p1.id, p1.score > p2.score ? winCoins : p1.score === p2.score ? drawCoins : lossCoins, io, p1.score > p2.score ? 'win' : p1.score === p2.score ? 'draw' : 'loss');
            coinsService.awardCoins(p2.id, p2.score > p1.score ? winCoins : p2.score === p1.score ? drawCoins : lossCoins, io, p2.score > p1.score ? 'win' : p2.score === p1.score ? 'draw' : 'loss');

            rematchKey = `${[p1.id, p2.id].sort().join('_')}_${Date.now()}`;
            rematchService.createRematch(rematchKey, {
                p1Id: p1.id, p2Id: p2.id,
                p1Name: p1.name, p2Name: p2.name,
                p1Avatar: p1.avatar || '😶', p2Avatar: p2.avatar || '😶',
                category, gridSize
            });
        }
    }

    room.players.forEach(p => {
        if (p.id !== 'bot_cpu') {
            db.get('SELECT username FROM users WHERE id = ?', [p.id], (err, row) => {
                const username = (!err && row) ? row.username : p.name;
                db.run('INSERT INTO leaderboard (username, category, score) VALUES (?, ?, ?)',
                    [username, category, p.score],
                    (e) => { if (e) logger.warn({ err: e }, 'leaderboard insert failed'); }
                );
            });
        }
    });

    debouncedInvalidateLeaderboard(io);
    io.to(roomId).emit('gameOver', {
        players: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score })),
        failedFlips: room.failedFlips || 0,
        maxCombo: room.maxCombo || 0,
        maxComboMultiplier: room.maxComboMultiplier || 1,
        rematchKey,
        isBotMatch: !!room.isBotMatch
    });
    cleanChatHistory(roomId);
    // Освобождаем inGameUsers ДО удаления комнаты (пока есть доступ к players)
    room.players.forEach(p => {
        if (p.id && p.id !== 'bot_cpu') friendNotifier.setUserInGame(p.id, false);
    });
    deleteRoom(roomId);
    broadcastRoomsList(io);
}

function throttleCardClick(userId, now) {
    const lastClick = cardClickThrottle.get(userId) || 0;
    if (now - lastClick < 300) return false;
    cardClickThrottle.set(userId, now);
    return true;
}

const throttleCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of cardClickThrottle) {
        if (now - timestamp > THROTTLE_TTL_MS) cardClickThrottle.delete(userId);
    }
}, THROTTLE_TTL_MS);

function clearThrottleInterval() {
    clearInterval(throttleCleanupInterval);
    if (leaderboardDebounceTimer) {
        clearTimeout(leaderboardDebounceTimer);
        leaderboardDebounceTimer = null;
    }
}

module.exports = { processCardFlip, finishGame, throttleCardClick, clearThrottleInterval };
