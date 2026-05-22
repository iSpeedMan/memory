const http = require('http');
const { Server } = require('socket.io');
const { app, sessionMiddleware } = require('./app');
const initWebSocket = require('./websocket');
const conf = require('./conf');
const db = require('./db');
const { createFirstAdmin } = require('./services/adminService'); // создание первого админа

const server = http.createServer(app);
const io = new Server(server);

// Привязываем сессию к Socket.IO
io.engine.use(sessionMiddleware);

// Инициализируем все WebSocket обработчики
initWebSocket(io);

// Создаём первого администратора (асинхронно, не блокируем старт)
createFirstAdmin(db, conf).catch(err => console.error('Admin creation error:', err));

function gracefulShutdown() {
    console.log('Received shutdown signal, closing server...');
    server.close(() => {
        console.log('HTTP server closed.');
        // Закрываем соединение с БД
        if (db && typeof db.close === 'function') {
            db.close((err) => {
                if (err) console.error('Error closing database:', err);
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    });

    // Принудительное завершение через 10 секунд, если что-то зависло
    setTimeout(() => {
        console.error('Forced shutdown due to timeout');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

const PORT = conf.port || 3000;
server.listen(PORT, () => {
    console.log(`Metro Memory running on port ${PORT}`);
});

async function gracefulShutdown() {
    console.log('Получен сигнал завершения, закрытие сервера...');
    // 1. Закрываем Socket.IO, чтобы разорвать все соединения корректно
    io.close(() => console.log('Socket.IO сервер закрыт.'));
    // 2. Закрываем HTTP сервер
    server.close(() => console.log('HTTP сервер закрыт.'));
    // 3. Закрываем соединение с БД
    if (db && typeof db.end === 'function') await db.end();
    process.exit(0);
}