require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const conf = require('./conf');
const db = require('./db');
const redis = require('./services/redis');
const { createFirstAdmin } = require('./services/adminService');
const logger = require('./utils/logger');

async function startServer() {
    await redis.init(conf.redis.url);

    const { app, sessionMiddleware } = require('./app');

    const server = http.createServer(app);
    const io = new Server(server, {
        maxHttpBufferSize: 1e4,
        cors: { origin: '*', methods: ['GET', 'POST'] }
    });

    let _ioSubClient = null;
    if (redis.isAvailable) {
        try {
            const { createAdapter } = require('@socket.io/redis-adapter');
            _ioSubClient = redis.client.duplicate();
            await _ioSubClient.connect();
            io.adapter(createAdapter(redis.client, _ioSubClient));
            logger.info('[Redis] Socket.IO Redis adapter enabled (horizontal scaling ready)');
        } catch (err) {
            logger.warn({ err }, '[Redis] Socket.IO adapter setup failed, using default in-memory adapter');
            if (_ioSubClient) { try { _ioSubClient.destroy(); } catch (_) {} }
            _ioSubClient = null;
        }
    }

    io.engine.use(sessionMiddleware);

    const initWebSocket = require('./websocket');
    initWebSocket(io);

    createFirstAdmin(db, conf).catch(err => logger.error({ err }, 'Admin creation error'));

    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            uptime: Math.floor(process.uptime()),
            redis: redis.isAvailable
                ? 'connected'
                : (redis.isEnabled ? 'degraded (fallback active)' : 'disabled')
        });
    });

    let shuttingDown = false;
    async function gracefulShutdown() {
        if (shuttingDown) return;
        shuttingDown = true;
        logger.info('Received shutdown signal, closing server...');

        const forceExitTimer = setTimeout(() => {
            console.error('Forced shutdown due to timeout');
            process.exit(1);
        }, 10000);
        forceExitTimer.unref();

        try {
            await new Promise(resolve => io.close(resolve));
            await new Promise(resolve => server.close(resolve));
            if (db && typeof db.end === 'function') await db.end();
            if (_ioSubClient) { try { await _ioSubClient.quit(); } catch (_) {} }
            await redis.quit();
            clearTimeout(forceExitTimer);
            process.exit(0);
        } catch (err) {
            logger.error({ err }, 'Shutdown error');
            clearTimeout(forceExitTimer);
            process.exit(1);
        }
    }

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    const PORT = conf.port || 5000;
    server.listen(PORT, '0.0.0.0', () => {
        logger.info({ port: PORT }, 'Metro Memory running');
    });
}

startServer().catch(err => {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
});
