const { wsRateLimit } = require('../../middleware/wsRateLimit');
const { getRoom, getAllRooms, markRoomsDirty, broadcastRoomsList } = require('../../services/roomManager');
const { finishGame } = require('../../services/gameLogic');
const { invalidateChatState } = require('../chatHandlers');
const friendNotifier = require('../../services/friendNotifier');
const botTracker = require('../../services/botTracker');
const hintSettings = require('../../services/hintSettings');
const { cleanRoomData } = require('../../utils/helpers');
const {
    REJOIN_TIMEOUT, MAX_ROOM_ID_LEN,
    rejoinableRooms, clearRejoinTimer, getRejoinInfo, closeRoom,
} = require('../state/roomState');

function handleRejoinRoom(io, socket) {
    socket.on('rejoinRoom', (roomId) => {
        if (typeof roomId !== 'string' || roomId.length > MAX_ROOM_ID_LEN) return;
        const session = socket.request.session;
        const userId = session?.userId;
        if (!userId) return;
        if (!wsRateLimit(userId, 'rejoinRoom', 3, 30000)) return;
        const info = getRejoinInfo(userId);
        if (!info || info.roomId !== roomId) return;
        const room = getRoom(roomId);
        if (!room || room.status !== 'playing') { clearRejoinTimer(userId); return; }
        clearRejoinTimer(userId);
        const player = room.players[info.playerIdx];
        if (!player) return;
        player.socketId = socket.id;
        player.disconnected = false;
        socket.join(roomId);
        socket.leave('lobby');
        socket.emit('gameStart', { room: cleanRoomData(room), turn: room.players[room.turnIndex].id, hintSettings: hintSettings.get() });
        socket.emit('gameReconnect', {
            matchedCards: room.matchedCards,
            openedCards: room.openedCards.map(idx => ({ index: idx, value: room.deck[idx] })),
            cardStats: room.cardStats
        });
        io.to(roomId).emit('opponentReconnected');
        markRoomsDirty();
        broadcastRoomsList(io);
    });
}

function handleLeaveRejoinableRoom(io, socket) {
    socket.on('leaveRejoinableRoom', (roomId) => {
        if (typeof roomId !== 'string' || roomId.length > MAX_ROOM_ID_LEN) return;
        const session = socket.request.session;
        const userId = session?.userId;
        if (!userId) return;
        if (!wsRateLimit(userId, 'leaveRejoinableRoom', 3, 30000)) return;
        const info = getRejoinInfo(userId);
        if (!info || info.roomId !== roomId) return;
        clearRejoinTimer(userId);
        closeRoom(io, roomId);
    });
}

function handleDisconnect(io, socket, connectedSockets) {
    socket.on('disconnect', () => {
        connectedSockets.delete(socket.id);
        const session = socket.request.session;
        const userId = session?.userId;
        const currentRooms = getAllRooms();
        for (const [id, room] of Object.entries(currentRooms)) {
            const playerIdx = room.players.findIndex(p => p.socketId === socket.id);
            if (playerIdx === -1) continue;
            if (room.status === 'playing' && !room.isBotMatch && userId) {
                room.players[playerIdx].disconnected = true;
                const existing = rejoinableRooms.get(userId);
                if (existing && existing.timer) clearTimeout(existing.timer);
                io.to(id).emit('opponentDisconnected');
                invalidateChatState(userId);
                const timer = setTimeout(() => {
                    rejoinableRooms.delete(userId);
                    const r = getRoom(id);
                    if (r && r.players[playerIdx]?.disconnected) {
                        closeRoom(io, id);
                    }
                }, REJOIN_TIMEOUT);
                rejoinableRooms.set(userId, { roomId: id, playerIdx, timer, addedAt: Date.now() });
                markRoomsDirty();
                broadcastRoomsList(io);
            } else {
                if (room.isBotMatch) {
                    const human = room.players.find(p => !p.isBot);
                    if (human && room.matchedPairs && room.matchedPairs.length > 0) {
                        if (userId) invalidateChatState(userId);
                        finishGame(io, room, id);
                        friendNotifier.setUserInGame(human.id, false);
                        break;
                    }
                    if (human) botTracker.markFinished(human.id);
                }
                if (userId) invalidateChatState(userId);
                closeRoom(io, id);
            }
            break;
        }
        if (userId) invalidateChatState(userId);
    });
}

module.exports = { handleRejoinRoom, handleLeaveRejoinableRoom, handleDisconnect };
