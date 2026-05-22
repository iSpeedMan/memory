const db = require('../db');
const { getRoom, deleteRoom, markRoomsDirty, broadcastRoomsList } = require('./roomManager');
const { invalidateLeaderboard } = require('./leaderboardService');

// Переменная throttle (оставляем глобальной для всего приложения)
const cardClickThrottle = new Map();

function updateCardStats(db, userId, category, cardValue) {
    // Сначала пытаемся обновить существующую запись
    db.run(
        `UPDATE user_card_stats SET matches = matches + 1
         WHERE user_id = ? AND category = ? AND card_value = ?`,
        [userId, category, cardValue],
        function(err) {
            if (err) {
                console.error('Update stats error:', err);
                return;
            }
            // Если ничего не обновлено (changes === 0), вставляем новую
            if (this.changes === 0) {
                db.run(
                    `INSERT INTO user_card_stats (user_id, category, card_value, matches)
                     VALUES (?, ?, ?, 1)`,
                    [userId, category, cardValue],
                    (err) => { if (err) console.error('Insert stats error:', err); }
                );
            }
        }
    );
}

function processCardFlip(io, roomId, playerId, cardIndex) {
    const room = getRoom(roomId);
    if (!room || room.status !== 'playing' || room.players[room.turnIndex].id !== playerId) return;
    if (room.openedCards.includes(cardIndex) || room.openedCards.length >= 2 || room.matchedPairs.includes(room.deck[cardIndex])) return;

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
                updateCardStats(db, playerId, room.category, matchedValue);
            }

            room.matchedCards[i1] = { value: matchedValue, color: matchColor };
            room.matchedCards[i2] = { value: matchedValue, color: matchColor };

            io.to(roomId).emit('matchFound', {
                indices: [i1, i2],
                players: room.players.map(p => ({ id: p.id, score: p.score })),
                matchColor: matchColor
            });

            if (room.matchedPairs.length === 18) {
                const category = room.category;
                room.players.forEach(p => {
                    if (p.id !== 'bot_cpu') {
                        db.run('INSERT INTO leaderboard (username, category, score) VALUES (?, ?, ?)', [p.name, category, p.score], (err) => {
                            if (err) console.error(err);
                        });
                    }
                });
                setTimeout(() => invalidateLeaderboard(io), 100);
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
        if (room.players[room.turnIndex].isBot) {
            setTimeout(() => playBotTurn(io, roomId), 1000);
        }
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
        const memoryEntries = Object.entries(room.botMemory).filter(([idx, _]) => availableIndexes.includes(Number(idx)));
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

// Очистка throttle раз в минуту
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of cardClickThrottle) {
        if (now - timestamp > 60000) cardClickThrottle.delete(userId);
    }
}, 60000);

module.exports = { processCardFlip, playBotTurn, throttleCardClick };