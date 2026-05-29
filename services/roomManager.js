const { cleanRoomData } = require('../utils/helpers');

const rooms = {};
let roomsListCache = { data: null, dirty: true };

function markRoomsDirty() {
    roomsListCache.dirty = true;
}

/**
 * Рассылает список комнат только пользователям в лобби.
 * Пользователи в активной игре не получают обновления (экономия трафика).
 */
function broadcastRoomsList(io) {
    if (roomsListCache.dirty) {
        roomsListCache.data = Object.values(rooms).map(r => cleanRoomData(r));
        roomsListCache.dirty = false;
    }
    io.to('lobby').emit('roomsList', roomsListCache.data);
}

function getRoom(roomId) {
    return rooms[roomId];
}

function createRoom(roomId, roomData) {
    rooms[roomId] = roomData;
    markRoomsDirty();
    return rooms[roomId];
}

function deleteRoom(roomId) {
    if (rooms[roomId]) {
        delete rooms[roomId];
        markRoomsDirty();
        return true;
    }
    return false;
}

function getAllRooms() {
    return rooms;
}

// Периодическая очистка старых комнат (вызывается из таймера)
function cleanupOldRooms(io) {
    const now = Date.now();
    let roomsChanged = false;
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (room.status === 'waiting' && (now - room.createdAt > 15 * 60 * 1000)) {
            delete rooms[roomId];
            roomsChanged = true;
        } else if (room.status === 'playing' && (now - room.createdAt > 2 * 60 * 60 * 1000)) {
            io.to(roomId).emit('roomClosed', 'opponent_left');
            delete rooms[roomId];
            roomsChanged = true;
        }
    }
    if (roomsChanged) {
        markRoomsDirty();
        broadcastRoomsList(io);
    }
}

module.exports = {
    rooms,
    roomsListCache,
    markRoomsDirty,
    broadcastRoomsList,
    getRoom,
    createRoom,
    deleteRoom,
    getAllRooms,
    cleanupOldRooms
};
