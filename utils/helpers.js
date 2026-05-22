function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Очищает приватные поля комнаты перед отправкой клиенту
function cleanRoomData(room) {
    if (!room) return null;
    return {
        id: room.id,
        name: room.name,
        creatorName: room.creatorName,
        creatorAvatar: room.creatorAvatar,
        category: room.category,
        status: room.status,
        isPrivate: room.isPrivate || false,
        players: room.players.map(p => ({ name: p.name, avatar: p.avatar, id: p.id, score: p.score }))
    };
}

module.exports = { escHtml, cleanRoomData };