const pending = new Map();

function createRematch(key, data) {
    const existing = pending.get(key);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => pending.delete(key), 30000);
    pending.set(key, { ...data, accepted: new Set(), timer });
}

function requestRematch(key, userId, onBothAccepted) {
    const req = pending.get(key);
    if (!req) return { status: 'expired' };
    if (req.accepted.has(userId)) return { status: 'already' };
    req.accepted.add(userId);
    if (req.accepted.size === 2) {
        clearTimeout(req.timer);
        pending.delete(key);
        onBothAccepted(req);
        return { status: 'start' };
    }
    const otherUserId = userId === req.p1Id ? req.p2Id : req.p1Id;
    return { status: 'waiting', otherUserId };
}

function cancel(key) {
    const req = pending.get(key);
    if (req) { clearTimeout(req.timer); pending.delete(key); }
}

module.exports = { createRematch, requestRematch, cancel };
