const db = require('../db');
const { getRoom, deleteRoom, markRoomsDirty, broadcastRoomsList } = require('./roomManager');
const { invalidateLeaderboard } = require('./leaderboardService');
const botTracker = require('./botTracker');
const { addGameResult } = require('./gameHistory');
const { checkAndAward } = require('./achievementService');

const cardClickThrottle = new Map();

let leaderboardDebounceTimer = null;
function debouncedInvalidateLeaderboard(io) {
    if (leaderboardDebounceTimer) clearTimeout(leaderboardDebounceTimer);
    leaderboardDebounceTimer = setTimeout(() => {
        leaderboardDebounceTimer = null;
        invalidateLeaderboard(io);
    }, 500);
}

function upsertCardStat(userId, category, cardValue) {
    if (db.type === 'mysql') {
        db.run(
            'INSERT INTO user_card_stats (user_id, category, card_value, matches) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE matches = matches + 1',
            [userId, category, cardValue],
            (err) => { if (err) console.error('upsertCardStat error:', err); }
        );
    } else {
        db.run(
            'INSERT INTO user_card_stats (user_id, category, card_value, matches) VALUES (?, ?, ?, 1) ON CONFLICT(user_id, category, card_value) DO UPDATE SET matches = matches + 1',
            [userId, category, cardValue],
            (err) => { if (err) console.error('upsertCardStat error:', err); }
        );
    }
}

function processCardFlip(io, roomId, playerId, cardIndex) {
    const room = getRoom(roomId);
    if (!room || room.status !== 'playing' || room.players[room.turnIndex].id !== playerId) return;
    if (room.processing) return;
    if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= room.deck.length) return;
    if (room.openedCards.includes(cardIndex) || room.openedCards.length >= 2 || room.matchedPairs.includes(room.deck[cardIndex])) return;

    room.processing = true;

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
                const points = Math.round(1 * multiplier);
                currentPlayer.score += points;
                room.matchedPairs.push(room.deck[i1]);
                room.openedCards = [];
                const matchColor = room.turnIndex === 0 ? '#1ba1e2' : '#f09609';
                const matchedValue = room.deck[i1];

                // Track max combo for achievements
                if (comboCount > (room.maxCombo || 0)) room.maxCombo = comboCount;

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

                room.processing = false;

                // Bot sends congratulations on player combo 3 or 5
                if (room.isBotMatch && !currentPlayer.isBot && (comboCount === 3 || comboCount === 5)) {
                    const bot = room.players.find(p => p.isBot);
                    if (bot) {
                        const msgs3 = ['Неплохо! 👏', 'Хорошая память! 🧠', 'Молодец! 🎉', 'Ого, комбо! 😮'];
                        const msgs5 = ['Невероятно! 🔥🔥🔥', 'Ты просто машина! 💪', 'КОМБО x5! Легенда! 🏆', 'Да ты читер! 😆'];
                        const pool = comboCount === 3 ? msgs3 : msgs5;
                        const botText = pool[Math.floor(Math.random() * pool.length)];
                        const capturedRid = roomId;
                        setTimeout(() => {
                            const r = getRoom(capturedRid);
                            if (r) io.to(capturedRid).emit('chatMessage', {
                                username: bot.name, avatar: '🤖', text: botText, ts: Date.now(), isBot: true
                            });
                        }, 700);
                    }
                }

                if (room.matchedPairs.length === room.totalPairs) {
                    finishGame(io, room, roomId);
                } else {
                    if (room.players[room.turnIndex].isBot) {
                        const capturedRoomId = roomId;
                        setTimeout(() => {
                            const r = getRoom(capturedRoomId);
                            if (r && r.status === 'playing' && r.players[r.turnIndex]?.isBot) {
                                playBotTurn(io, capturedRoomId);
                            }
                        }, 2200);
                    }
                }
            } else {
                room.failedFlips = (room.failedFlips || 0) + 1;
                room.players[room.turnIndex].combo = 0;
                room.processing = false;
                const capturedRoomId = roomId;
                setTimeout(() => {
                    const currentRoom = getRoom(capturedRoomId);
                    if (!currentRoom) return;
                    io.to(capturedRoomId).emit('matchFailed', { indices: [i1, i2] });
                    currentRoom.openedCards = [];
                    currentRoom.turnIndex = (currentRoom.turnIndex + 1) % 2;
                    io.to(capturedRoomId).emit('turnChanged', currentRoom.players[currentRoom.turnIndex].id);
                    if (currentRoom.players[currentRoom.turnIndex].isBot) {
                        setTimeout(() => {
                            const r = getRoom(capturedRoomId);
                            if (r && r.status === 'playing' && r.players[r.turnIndex]?.isBot) {
                                playBotTurn(io, capturedRoomId);
                            }
                        }, 1600);
                    }
                }, 1000);
            }
        } else {
            room.processing = false;
            if (room.players[room.turnIndex].isBot) {
                const capturedRoomId = roomId;
                setTimeout(() => {
                    const r = getRoom(capturedRoomId);
                    if (r && r.status === 'playing' && r.players[r.turnIndex]?.isBot) {
                        playBotTurn(io, capturedRoomId);
                    }
                }, 1300);
            }
        }
    } catch (err) {
        console.error('processCardFlip error:', err);
        room.processing = false;
    }
}

function finishGame(io, room, roomId) {
    const category = room.category;
    const failedFlips = room.failedFlips || 0;
    const maxCombo = room.maxCombo || 0;
    const gridSize = room.gridSize || 6;

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
            checkAndAward(human.id, {
                isBotGame: true, botDifficulty: room.botDifficulty,
                isWinner, category, maxCombo, failedFlips, gridSize,
                myScore: human.score, oppScore: bot.score
            }, io);
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
            checkAndAward(p1.id, { isBotGame: false, isWinner: p1.score > p2.score, category, maxCombo, failedFlips, gridSize, myScore: p1.score, oppScore: p2.score }, io);
            checkAndAward(p2.id, { isBotGame: false, isWinner: p2.score > p1.score, category, maxCombo, failedFlips, gridSize, myScore: p2.score, oppScore: p1.score }, io);
        }
    }

    room.players.forEach(p => {
        if (p.id !== 'bot_cpu') {
            db.run('INSERT INTO leaderboard (username, category, score) VALUES (?, ?, ?)',
                [p.name, category, p.score],
                (err) => { if (err) console.error(err); }
            );
        }
    });

    debouncedInvalidateLeaderboard(io);
    io.to(roomId).emit('gameOver', { players: room.players });
    deleteRoom(roomId);
    broadcastRoomsList(io);
}

function findKnownPairInMemory(botMemory, availableIndexes) {
    const available = new Set(availableIndexes.map(Number));
    const valueCounts = {};
    const valueIndices = {};
    for (const [idx, val] of Object.entries(botMemory)) {
        const i = Number(idx);
        if (!available.has(i)) continue;
        if (!valueCounts[val]) { valueCounts[val] = 0; valueIndices[val] = []; }
        valueCounts[val]++;
        valueIndices[val].push(i);
        if (valueCounts[val] === 2) return valueIndices[val];
    }
    return null;
}

function playBotTurn(io, roomId) {
    const room = getRoom(roomId);
    if (!room || room.status !== 'playing' || !room.players[room.turnIndex]?.isBot) return;

    const botDiff = room.botDifficulty || 'medium';
    const memoryChance = { 'easy': 0.3, 'medium': 0.75, 'hard': 1.0, 'grandmaster': 1.0 }[botDiff] ?? 0.75;
    const availableIndexes = room.deck.map((_, i) => i).filter(i =>
        !room.matchedPairs.includes(room.deck[i]) && !room.openedCards.includes(i)
    );
    if (availableIndexes.length === 0) return;

    let targetIndex = -1;

    if (room.openedCards.length === 1) {
        // Second card: look for a known pair
        const openedValue = room.deck[room.openedCards[0]];
        const knownPairIndex = Object.keys(room.botMemory || {}).find(index =>
            room.botMemory[index] === openedValue &&
            Number(index) !== room.openedCards[0] &&
            availableIndexes.includes(Number(index))
        );
        if (knownPairIndex && Math.random() <= memoryChance) {
            targetIndex = Number(knownPairIndex);
        }
    } else {
        // First card: grandmaster looks for known pairs proactively
        if (botDiff === 'grandmaster' || botDiff === 'hard') {
            const knownPair = findKnownPairInMemory(room.botMemory || {}, availableIndexes);
            if (knownPair && Math.random() <= memoryChance) {
                targetIndex = knownPair[0];
            }
        }
        // Medium: 40% chance to look for known pair
        if (targetIndex === -1 && botDiff === 'medium') {
            const knownPair = findKnownPairInMemory(room.botMemory || {}, availableIndexes);
            if (knownPair && Math.random() <= 0.4) {
                targetIndex = knownPair[0];
            }
        }
        // Grandmaster: if no known pair, pick least-seen card
        if (targetIndex === -1 && botDiff === 'grandmaster') {
            targetIndex = availableIndexes.reduce((best, idx) =>
                room.cardStats[idx] < room.cardStats[best] ? idx : best
            , availableIndexes[0]);
        }
    }

    if (targetIndex === -1) {
        targetIndex = availableIndexes[Math.floor(Math.random() * availableIndexes.length)];
    }

    processCardFlip(io, roomId, 'bot_cpu', targetIndex);
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
        if (now - timestamp > 60000) cardClickThrottle.delete(userId);
    }
}, 60000);

function clearThrottleInterval() {
    clearInterval(throttleCleanupInterval);
}

module.exports = { processCardFlip, playBotTurn, throttleCardClick, clearThrottleInterval };
