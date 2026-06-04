const { getRoom } = require('./roomManager');

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

function playBotTurn(io, roomId, processCardFlip) {
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
        if (botDiff === 'grandmaster' || botDiff === 'hard') {
            const knownPair = findKnownPairInMemory(room.botMemory || {}, availableIndexes);
            if (knownPair && Math.random() <= memoryChance) {
                targetIndex = knownPair[0];
            }
        }
        if (targetIndex === -1 && botDiff === 'medium') {
            const knownPair = findKnownPairInMemory(room.botMemory || {}, availableIndexes);
            if (knownPair && Math.random() <= 0.4) {
                targetIndex = knownPair[0];
            }
        }
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

module.exports = { findKnownPairInMemory, playBotTurn };
