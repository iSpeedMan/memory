function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function cleanRoomData(room) {
    if (!room) return null;
    const data = {
        id: room.id,
        name: room.name,
        creatorName: room.creatorName,
        creatorAvatar: room.creatorAvatar,
        category: room.category,
        status: room.status,
        isPrivate: room.isPrivate || false,
        gridSize: room.gridSize || 6,
        totalPairs: room.totalPairs || 18,
        players: room.players.map(p => ({ name: p.name, avatar: p.avatar, id: p.id, score: p.score }))
    };
    if (room.categoryEmojis) data.categoryEmojis = room.categoryEmojis;
    return data;
}

module.exports = { escHtml, cleanRoomData };
