const wsRateBuckets = new Map();

function wsRateLimit(userId, event, max, windowMs = 1000) {
    const key = `${userId}:${event}`;
    const now = Date.now();
    const bucket = wsRateBuckets.get(key);
    if (!bucket || now - bucket.windowStart >= windowMs) {
        wsRateBuckets.set(key, { count: 1, windowStart: now });
        return true;
    }
    if (bucket.count >= max) return false;
    bucket.count++;
    return true;
}

const _cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of wsRateBuckets) {
        if (now - bucket.windowStart > 120000) wsRateBuckets.delete(key);
    }
}, 60000);

function clearWsRateLimitTimer() {
    clearInterval(_cleanupTimer);
}

module.exports = { wsRateLimit, clearWsRateLimitTimer };
