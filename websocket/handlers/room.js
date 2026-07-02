const { getLang } = require('../../middleware/auth');
const i18n = require('../../public/js/i18n.js');
const { cleanRoomData } = require('../../utils/helpers');
const { createRoom, markRoomsDirty, broadcastRoomsList } = require('../../services/roomManager');
const botTracker = require('../../services/botTracker');
const { areFriends } = require('../../services/friendsService');
const friendNotifier = require('../../services/friendNotifier');
const coinsService = require('../../services/coinsService');
const hintSettings = require('../../services/hintSettings');
const { getPlayerGameCosmetics } = require('../../services/shopService');
const {
    VALID_GRID_SIZES, VALID_DIFFICULTIES, MAX_ROOMS,
    CREATE_ROOM_COOLDOWN_MS, JOIN_COOLDOWN_MS, SPECTATE_COOLDOWN_MS,
    MAX_COOLDOWN_MAP_SIZE,
    createRoomCooldowns, joinRoomCooldowns, spectateRoomCooldowns, botRoomCreating,
    pruneCooldownMap, generateDeck, pickUnicodeEmojis, generateRoomId,
    validateCategory, getPlayerStats, isUserInAnyRoom,
} = require('../state/roomState');

function handleCreateRoom(io, socket) {
    socket.on('createRoom', (data) => {
        if (!data || typeof data !== 'object') return;
        const session = socket.request.session;
        const userId = session.userId;
        const { getAllRooms } = require('../../services/roomManager');
        if (Object.keys(getAllRooms()).length >= MAX_ROOMS) return;
        const now = Date.now();
        if (now - (createRoomCooldowns.get(userId) || 0) < CREATE_ROOM_COOLDOWN_MS) return;
        if (isUserInAnyRoom(userId)) return;
        pruneCooldownMap(createRoomCooldowns, MAX_COOLDOWN_MAP_SIZE);
        createRoomCooldowns.set(userId, now);

        const lang = getLang(socket.request);
        const safeName = (data.name || '').toString().substring(0, 50).trim();
        const safeCategory = (data.category || 'animals').toString().substring(0, 30).trim();
        const isPrivate = !!data.isPrivate;
        const gridSize = VALID_GRID_SIZES.includes(Number(data.gridSize)) ? Number(data.gridSize) : 6;
        const totalPairs = (gridSize * gridSize) / 2;

        validateCategory(safeCategory, (valid, imageEmojis) => {
            if (!valid) return;
            const roomId = generateRoomId('room');
            const categoryEmojis = safeCategory === 'unicode' ? pickUnicodeEmojis(totalPairs) : (imageEmojis || undefined);
            const newRoom = {
                id: roomId, name: safeName || `${i18n.t('room', lang)} - ${session.username}`,
                creatorId: userId, creatorName: session.username, creatorAvatar: session.avatar || '😶',
                category: safeCategory, status: 'waiting', createdAt: now,
                isPrivate, gridSize, totalPairs,
                players: [{ id: userId, name: session.username, avatar: session.avatar || '😶', socketId: socket.id, score: 0 }],
                deck: [], openedCards: [], matchedPairs: [],
                turnIndex: 0, cardStats: Array(gridSize * gridSize).fill(0), matchedCards: {}, hintsState: {}
            };
            if (categoryEmojis) newRoom.categoryEmojis = categoryEmojis;
            createRoom(roomId, newRoom);
            socket.join(roomId);
            socket.emit('roomCreated', cleanRoomData(newRoom));
            broadcastRoomsList(io);

            const invitedFriendId = data.invitedFriendId ? parseInt(data.invitedFriendId, 10) : null;
            if (invitedFriendId && !isNaN(invitedFriendId) && invitedFriendId !== userId) {
                areFriends(userId, invitedFriendId, (ok) => {
                    if (ok) {
                        io.to(`user_${invitedFriendId}`).emit('friendGameInvite', {
                            roomId, fromName: session.username, fromAvatar: session.avatar || '😶'
                        });
                    }
                });
            }
        });
    });
}

function handleCreateBotRoom(io, socket) {
    socket.on('createBotRoom', async (data) => {
        if (!data || typeof data !== 'object') return;
        const session = socket.request.session;
        const userId = session.userId;
        if (botRoomCreating.has(userId)) return;
        botRoomCreating.add(userId);

        let released = false;
        function releaseLock() {
            if (!released) { released = true; botRoomCreating.delete(userId); }
        }

        try {
            const check = await botTracker.checkCanCreate(userId);
            if (!check.allowed) {
                socket.emit('botRoomThrottle', { remainingSeconds: check.remainingSeconds });
                return releaseLock();
            }
            if (isUserInAnyRoom(userId)) return releaseLock();

            const difficulty = VALID_DIFFICULTIES.includes(data.difficulty) ? data.difficulty : 'medium';
            const safeCategory = (data.category || 'animals').toString().substring(0, 30).trim();
            const gridSize = VALID_GRID_SIZES.includes(Number(data.gridSize)) ? Number(data.gridSize) : 6;
            const totalPairs = (gridSize * gridSize) / 2;
            const lang = getLang(socket.request);

            validateCategory(safeCategory, (valid, imageEmojis) => {
                if (!valid) return releaseLock();
                const roomId = generateRoomId('botRoom');
                const deck = generateDeck(totalPairs);
                const categoryEmojis = safeCategory === 'unicode' ? pickUnicodeEmojis(totalPairs) : (imageEmojis || undefined);
                const BOT_AVATARS = { easy: '🐥', medium: '🤖', hard: '🧠', grandmaster: '💀' };
                const newRoom = {
                    id: roomId, name: i18n.t('game_with_bot', lang),
                    category: safeCategory, status: 'playing', createdAt: Date.now(),
                    isBotMatch: true, botDifficulty: difficulty, botMemory: {},
                    isPrivate: !!data.isPrivate, gridSize, totalPairs,
                    players: [
                        { id: userId, name: session.username, avatar: session.avatar || '😶', socketId: socket.id, score: 0 },
                        { id: 'bot_cpu', name: `${i18n.t('bot_' + difficulty, lang)} ${BOT_AVATARS[difficulty]}`, avatar: BOT_AVATARS[difficulty], isBot: true, score: 0 }
                    ],
                    deck, openedCards: [], matchedPairs: [],
                    turnIndex: 0, cardStats: Array(gridSize * gridSize).fill(0), matchedCards: {}, hintsState: {}
                };
                if (categoryEmojis) newRoom.categoryEmojis = categoryEmojis;
                botTracker.markCreated(userId);
                friendNotifier.setUserInGame(userId, true);
                createRoom(roomId, newRoom);
                socket.join(roomId);
                socket.leave('lobby');
                broadcastRoomsList(io);
                releaseLock();
                getPlayerGameCosmetics(userId, (_, cosm) => {
                    const humanColor = cosm?.matchColor || '#1ba1e2';
                    const botFallback = humanColor === '#f09609' ? '#9b59b6' : '#f09609';
                    newRoom.players[0].matchColor = humanColor;
                    newRoom.players[0].frameClass = cosm?.frameClass || null;
                    newRoom.players[0].titleLabel = cosm?.titleLabel || null;
                    newRoom.players[0].titleColor = cosm?.titleColor || null;
                    newRoom.players[1].matchColor = botFallback;
                    getPlayerStats(userId, (humanStats) => {
                        socket.emit('gameStart', {
                            room: cleanRoomData(newRoom),
                            turn: userId,
                            playerStats: { [userId]: humanStats, bot_cpu: { total: 0, wins: 0, winRate: 0 } },
                            hintSettings: hintSettings.get()
                        });
                        coinsService.checkAndAwardDailyBonus(userId, io);
                    });
                });
            });
        } catch (_err) {
            releaseLock();
        }
    });
}

function handleJoinRoom(io, socket) {
    socket.on('joinRoom', (roomId) => {
        if (typeof roomId !== 'string' || roomId.length > 60) return;
        const session = socket.request.session;
        const userId = session.userId;
        const now = Date.now();
        if (now - (joinRoomCooldowns.get(userId) || 0) < JOIN_COOLDOWN_MS) return;
        pruneCooldownMap(joinRoomCooldowns, MAX_COOLDOWN_MAP_SIZE);
        joinRoomCooldowns.set(userId, now);
        const { getRoom } = require('../../services/roomManager');
        const room = getRoom(roomId);
        if (isUserInAnyRoom(userId)) return;
        if (room && room.status === 'waiting' && room.creatorId !== userId) {
            room.players.push({ id: userId, name: session.username, avatar: session.avatar || '😶', socketId: socket.id, score: 0 });
            room.status = 'playing';
            room.deck = generateDeck(room.totalPairs || 18);
            socket.join(roomId);
            socket.leave('lobby');
            const creatorSocket = io.sockets.sockets.get(room.players[0].socketId);
            if (creatorSocket) creatorSocket.leave('lobby');
            const p1Id = room.players[0].id;
            const p2Id = room.players[1].id;
            friendNotifier.setUserInGame(p1Id, true);
            friendNotifier.setUserInGame(p2Id, true);
            getPlayerGameCosmetics(p1Id, (_, p1Cosm) => {
                getPlayerGameCosmetics(p2Id, (_, p2Cosm) => {
                    room.players[0].matchColor  = p1Cosm?.matchColor  || '#1ba1e2';
                    room.players[0].frameClass  = p1Cosm?.frameClass  || null;
                    room.players[0].titleLabel  = p1Cosm?.titleLabel  || null;
                    room.players[0].titleColor  = p1Cosm?.titleColor  || null;
                    room.players[1].matchColor  = p2Cosm?.matchColor  || '#f09609';
                    room.players[1].frameClass  = p2Cosm?.frameClass  || null;
                    room.players[1].titleLabel  = p2Cosm?.titleLabel  || null;
                    room.players[1].titleColor  = p2Cosm?.titleColor  || null;
                    if (room.players[0].matchColor === room.players[1].matchColor) {
                        room.players[1].matchColor = '#f09609';
                    }
                    getPlayerStats(p1Id, (p1Stats) => {
                        getPlayerStats(p2Id, (p2Stats) => {
                            io.to(roomId).emit('gameStart', {
                                room: cleanRoomData(room),
                                turn: p1Id,
                                playerStats: { [p1Id]: p1Stats, [p2Id]: p2Stats },
                                hintSettings: hintSettings.get()
                            });
                            coinsService.checkAndAwardDailyBonus(p1Id, io);
                            coinsService.checkAndAwardDailyBonus(p2Id, io);
                        });
                    });
                });
            });
            markRoomsDirty();
            broadcastRoomsList(io);
        }
    });
}

function handleSpectateRoom(io, socket) {
    socket.on('spectateRoom', (roomId) => {
        if (typeof roomId !== 'string' || roomId.length > 60) return;
        const session = socket.request.session;
        const userId = session?.userId;
        if (userId) {
            const now = Date.now();
            if (now - (spectateRoomCooldowns.get(userId) || 0) < SPECTATE_COOLDOWN_MS) return;
            pruneCooldownMap(spectateRoomCooldowns, MAX_COOLDOWN_MAP_SIZE);
            spectateRoomCooldowns.set(userId, now);
        }
        const { getRoom } = require('../../services/roomManager');
        const room = getRoom(roomId);
        if (room && room.status === 'playing' && !room.isPrivate) {
            socket.join(roomId);
            socket.leave('lobby');
            socket.emit('spectateStart', {
                room: cleanRoomData(room),
                turn: room.players[room.turnIndex].id,
                matchedCards: room.matchedCards,
                cardStats: room.cardStats,
                openedCards: room.openedCards.map(idx => ({ index: idx, value: room.deck[idx], stats: room.cardStats[idx] }))
            });
        }
    });
}

module.exports = { handleCreateRoom, handleCreateBotRoom, handleJoinRoom, handleSpectateRoom };
