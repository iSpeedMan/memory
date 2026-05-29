const db = require('../db');
const { getRoom, deleteRoom, markRoomsDirty, broadcastRoomsList } = require('./roomManager');
const { invalidateLeaderboard } = require('./leaderboardService');
const botTracker = require('./botTracker');
const { addGameResult } = require('./gameHistory');

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

                if (room.matchedPairs.length === 18) {
                    // Сохраняем историю игры
                    if (room.isBotMatch) {
                        const human = room.players.find(p => !p.isBot);
                        const bot = room.players.find(p => p.isBot);
                        if (human) {
                            botTracker.markFinished(human.id);
                            addGameResult({
                                player1Id: human.id, player2Id: null,
                                player1Name: human.name, player2Name: bot.name,
                                player1Score: human.score, player2Score: bot.score,
                                category: room.category, isBotGame: true, botDifficulty: room.botDifficulty
                            });
                        }
                    } else {
                        const p1 = room.players[0], p2 = room.players[1];
                        if (p1 && p2) {
                            addGameResult({
                                player1Id: p1.id, player2Id: p2.id,
                                player1Name: p1.name, player2Name: p2.name,
                                player1Score: p1.score, player2Score: p2.score,
                                category: room.category, isBotGame: false
                            });
                        }
                    }

                    const category = room.category;
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
                } else {
                    if (room.players[room.turnIndex].isBot) {
                        setTimeout(() => playBotTurn(io, roomId), 1500);
                    }
                }
            } else {
                room.players[room.turnIndex].combo = 0;
                room.processing = false;
                setTimeout(() => {
                    const currentRoom = getRoom(roomId);
                    if (!currentRoom) return;
                    io.to(roomId).emit('matchFailed', { indices: [i1, i2] });
                    currentRoom.openedCards = [];
                    currentRoom.turnIndex = (currentRoom.turnIndex + 1) % 2;
                    io.to(roomId).emit('turnChanged', currentRoom.players[currentRoom.turnIndex].id);
                    if (currentRoom.players[currentRoom.turnIndex].isBot) {
                        setTimeout(() => playBotTurn(io, roomId), 1200);
                    }
                }, 1000);
            }
        } else {
            room.processing = false;
            if (room.players[room.turnIndex].isBot) {
                setTimeout(() => playBotTurn(io, roomId), 1000);
            }
        }
    } catch (err) {
        console.error('processCardFlip error:', err);
        room.processing = false;
    }
}

function playBotTurn(io, roomId) {
    const room = getRoom(roomId);
    if (!room || room.status !== 'playing' || !room.players[room.turnIndex].isBot) return;

    const botDiff = room.botDifficulty || 'medium';
    const memoryChance = { 'easy': 0.3, 'medium': 0.75, 'hard': 1.0 }[botDiff];
    const availableIndexes = room.deck.map((_, i) => i).filter(i => !room.matchedPairs.includes(room.deck[i]) && !room.openedCards.includes(i));
    if (availableIndexes.length === 0) return;

    let targetIndex = -1;
    if (room.openedCards.length === 1) {
        const openedValue = room.deck[room.openedCards[0]];
        const knownPairIndex = Object.keys(room.botMemory).find(index =>
            room.botMemory[index] === openedValue &&
            Number(index) !== room.openedCards[0] &&
            availableIndexes.includes(Number(index))
        );
        if (knownPairIndex && Math.random() <= memoryChance) {
            targetIndex = Number(knownPairIndex);
        }
    } else {
        const memoryEntries = Object.entries(room.botMemory).filter(([idx]) => availableIndexes.includes(Number(idx)));
        const valueCounts = {};
        let pairValue = null;
        for (const [idx, val] of memoryEntries) {
            valueCounts[val] = (valueCounts[val] || 0) + 1;
            if (valueCounts[val] === 2) { pairValue = val; break; }
        }
        if (pairValue && Math.random() <= memoryChance) {
            targetIndex = Number(memoryEntries.find(([idx, val]) => val === pairValue)[0]);
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
