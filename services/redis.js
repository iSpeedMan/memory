const { createClient } = require('redis');

const MAX_RETRY_DELAY_MS = 30000;
const CONNECT_TIMEOUT_MS = 5000;
const LOG_PREFIX = '[Redis]';

class RedisManager {
    constructor() {
        this._client = null;
        this._available = false;
        this._enabled = false;
    }

    async init(redisUrl) {
        if (!redisUrl) {
            console.log(`${LOG_PREFIX} REDIS_URL not set — Redis disabled, using in-memory fallbacks`);
            return;
        }

        this._enabled = true;

        this._client = createClient({
            url: redisUrl,
            socket: {
                connectTimeout: CONNECT_TIMEOUT_MS,
                reconnectStrategy: (retries) => {
                    const delay = Math.min(200 * Math.pow(2, retries), MAX_RETRY_DELAY_MS);
                    if (retries > 0 && retries % 10 === 0) {
                        console.warn(`${LOG_PREFIX} Reconnect attempt #${retries}, next in ${delay}ms`);
                    }
                    return delay;
                }
            }
        });

        this._client.on('ready', () => {
            if (!this._available) console.log(`${LOG_PREFIX} Connected`);
            this._available = true;
        });

        this._client.on('error', (err) => {
            if (this._available) {
                console.warn(`${LOG_PREFIX} Lost connection — switching to fallback mode: ${err.message}`);
                this._available = false;
            }
        });

        this._client.on('reconnecting', () => {
            console.log(`${LOG_PREFIX} Reconnecting...`);
        });

        this._client.on('end', () => {
            this._available = false;
        });

        const connectRace = Promise.race([
            this._client.connect(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`connection timeout (${CONNECT_TIMEOUT_MS}ms)`)), CONNECT_TIMEOUT_MS + 500)
            )
        ]);

        try {
            await connectRace;
        } catch (err) {
            this._available = false;
            console.warn(`${LOG_PREFIX} Initial connection failed — fallback mode active: ${err.message}`);
        }
    }

    get isEnabled() { return this._enabled; }
    get isAvailable() { return this._available && this._client !== null; }
    get client() { return this._client; }

    async _exec(fn) {
        if (!this.isAvailable) return null;
        try {
            return await fn(this._client);
        } catch (err) {
            this._available = false;
            console.warn(`${LOG_PREFIX} Operation failed — entering fallback mode: ${err.message}`);
            return null;
        }
    }

    // ── String operations ─────────────────────────────────────────────────────

    async get(key) {
        return this._exec(c => c.get(key));
    }

    async set(key, value, options) {
        return this._exec(c => options ? c.set(key, value, options) : c.set(key, value));
    }

    async setEx(key, seconds, value) {
        return this._exec(c => c.setEx(key, seconds, value));
    }

    async del(key) {
        return this._exec(c => c.del(key));
    }

    async expire(key, seconds) {
        return this._exec(c => c.expire(key, seconds));
    }

    async exists(key) {
        return this._exec(c => c.exists(key));
    }

    async incr(key) {
        return this._exec(c => c.incr(key));
    }

    async incrBy(key, increment) {
        return this._exec(c => c.incrBy(key, increment));
    }

    // ── Hash operations ───────────────────────────────────────────────────────

    async hGet(key, field) {
        return this._exec(c => c.hGet(key, field));
    }

    async hSet(key, ...args) {
        return this._exec(c => c.hSet(key, ...args));
    }

    async hGetAll(key) {
        return this._exec(c => c.hGetAll(key));
    }

    async hDel(key, ...fields) {
        return this._exec(c => c.hDel(key, ...fields));
    }

    async hIncrBy(key, field, increment) {
        return this._exec(c => c.hIncrBy(key, field, increment));
    }

    // ── List operations ───────────────────────────────────────────────────────

    async lPush(key, ...elements) {
        return this._exec(c => c.lPush(key, ...elements));
    }

    async lRange(key, start, stop) {
        return this._exec(c => c.lRange(key, start, stop));
    }

    async lTrim(key, start, stop) {
        return this._exec(c => c.lTrim(key, start, stop));
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    async quit() {
        if (this._client) {
            this._available = false;
            try {
                await this._client.quit();
                console.log(`${LOG_PREFIX} Connection closed`);
            } catch (e) {
                try { this._client.destroy(); } catch (_) {}
            }
        }
    }
}

const redis = new RedisManager();
module.exports = redis;
