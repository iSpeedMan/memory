const http = require('http');
const { Server } = require('socket.io');
const { app, sessionMiddleware } = require('./app');
const initWebSocket = require('./websocket');
const conf = require('./conf');
const db = require('./db');
const { createFirstAdmin } = require('./services/adminService'); // создание первого админа

const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e4 // 10KB — предотвращает флуд большими payload'ами
});
let shuttingDown = false;

// Привязываем сессию к Socket.IO
io.engine.use(sessionMiddleware);

// Инициализируем все WebSocket обработчики
initWebSocket(io);

// Создаём первого администратора (асинхронно, не блокируем старт)
createFirstAdmin(db, conf).catch(err => console.error('Admin creation error:', err));

async function gracefulShutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('Получен сигнал завершения, закрытие сервера...');

    const forceExitTimer = setTimeout(() => {
        console.error('Forced shutdown due to timeout');
        process.exit(1);
    }, 10000);
    forceExitTimer.unref();

    try {
        await new Promise(resolve => io.close(resolve));
        await new Promise(resolve => server.close(resolve));
        if (db && typeof db.end === 'function') await db.end();
        clearTimeout(forceExitTimer);
        process.exit(0);
    } catch (err) {
        console.error('Shutdown error:', err);
        clearTimeout(forceExitTimer);
        process.exit(1);
    }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: Math.floor(process.uptime()) });
});

const PORT = conf.port || 3000;
server.listen(PORT, () => {
    console.log(`Metro Memory running on port ${PORT}`);
});
