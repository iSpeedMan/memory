const { handleCreateRoom, handleCreateBotRoom, handleJoinRoom, handleSpectateRoom } = require('./handlers/room');
const { handleCardClick, handleUseHint, handleRematch } = require('./handlers/game');
const { handleRejoinRoom, handleLeaveRejoinableRoom, handleDisconnect } = require('./handlers/disconnect');
const { clearCooldownCleanup, getRejoinInfo, clearRejoinTimer } = require('./state/roomState');

module.exports = {
    handleCreateRoom, handleCreateBotRoom, handleJoinRoom, handleSpectateRoom,
    handleCardClick, handleDisconnect,
    handleRejoinRoom, handleLeaveRejoinableRoom, getRejoinInfo, clearRejoinTimer,
    clearCooldownCleanup, handleUseHint, handleRematch,
};
