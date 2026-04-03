const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const session = require('express-session');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const db = require('./db');
const i18n = require('./public/i18n.js');
const conf = require('./conf'); // Подключаем конфиг

// Утилита экранирования HTML для email
function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
}

const getLang = (req) => {
    if (req && req.session && req.session.language && req.session.language !== 'auto') {
        return req.session.language;
    }
    const acceptLang = req.headers && req.headers['accept-language'];
    if (acceptLang && acceptLang.startsWith('ru')) return 'ru';
    return 'en';
};

// Используем почтовые настройки из conf.js
const transporter = nodemailer.createTransport(conf.mail);

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rooms = {};
const roomsListCache = { data: null, dirty: true };
const cardClickThrottle = new Map(); // Rate limiting для cardClick
const connectedSockets = new Map(); // Для heartbeat tracking
let leaderboardCache = { data: null, lastUpdate: 0 }; // Кэш leaderboard
const LEADERBOARD_CACHE_TTL = 5000; // 5 секунд
// ====================== АВТОМАТИЧЕСКОЕ СОЗДАНИЕ ПЕРВОГО АДМИНА ======================
async function createFirstAdmin() {
    try {
        // Проверяем, есть ли уже пользователи
        db.get("SELECT COUNT(*) as count FROM users", async (err, row) => {
            if (err) {console.error("Ошибка проверки пользователей:", err); return;}
            if (row && row.count > 0) return; 
            const admin = conf.firstAdmin;
            if (!admin || !admin.username || !admin.password) {console.warn("⚠️  Данные первого администратора не указаны в conf.js");return;}
            const hash = await bcrypt.hash(admin.password, 10);
            db.run('INSERT INTO users (username, password, email, is_admin, avatar) VALUES (?, ?, ?, 1, "😶")',
                [admin.username, hash, admin.email || null],
                function(err) {if (err) {console.error("❌ Ошибка создания первого администратора:", err);} else {console.log(`✅ Первый администратор успешно создан!`);}}
            );
        });
    } catch (e) {console.error("Ошибка при создании первого администратора:", e);}
}

// Запускаем создание первого админа при старте сервера
createFirstAdmin();

setInterval(() => {
    const now = Date.now();
    let roomsChanged = false;
    for (const roomId in rooms) {
        const room = rooms[roomId];
        // Удаляем ожидающие комнаты старше 15 минут
        if (room.status === 'waiting' && (now - room.createdAt > 15 * 60 * 1000)) {
            delete rooms[roomId];
            roomsChanged = true;
        }
        // Удаляем зависшие игровые комнаты старше 2 часов
        if (room.status === 'playing' && (now - room.createdAt > 2 * 60 * 60 * 1000)) {
            io.to(roomId).emit('roomClosed', 'opponent_left');
            delete rooms[roomId];
            roomsChanged = true;
        }
    }
    if (roomsChanged) {
        markRoomsDirty();
        broadcastRoomsList();
    }
    // Очистка throttle map от старых записей
    for (const [userId, timestamp] of cardClickThrottle) {
        if (now - timestamp > 60000) cardClickThrottle.delete(userId);
    }
}, 5 * 60 * 1000);

// ====================== HEARTBEAT CHECK INTERVAL ======================
const HEARTBEAT_TIMEOUT = 30000; // 30 секунд без ping = disconnect
setInterval(() => {
    const now = Date.now();
    for (const [socketId, info] of connectedSockets) {
        if (now - info.lastPing > HEARTBEAT_TIMEOUT) {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
                console.log(`Heartbeat timeout for socket ${socketId}, disconnecting...`);
                socket.disconnect(true);
            }
            connectedSockets.delete(socketId);
        }
    }
}, 10000); // Проверяем каждые 10 секунд

// Секретный ключ берем из конфига
const sessionMiddleware = session({
    secret: conf.sessionSecret,
    resave: false, saveUninitialized: false, cookie: { secure: false }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

const isAdmin = (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ error: i18n.t('not_authorized', getLang(req)) });
    db.get('SELECT is_admin FROM users WHERE id = ?', [req.session.userId], (err, user) => {
        if (!user || user.is_admin !== 1) return res.status(403).json({ error: i18n.t('no_rights', getLang(req)) });  
        next();
    });
};

app.post('/api/forgot-password', (req, res) => {
    const { email } = req.body;
    db.get('SELECT id, username, language FROM users WHERE email = ?', [email], (err, user) => {
        if (!user) return res.json({ success: true }); 
        
        const token = crypto.randomBytes(20).toString('hex');
        const expires = Date.now() + 3600000; 
        
        db.run('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?', [token, expires, user.id], (err) => {
            if (!err) {
                const protocol = req.headers['x-forwarded-proto'] || 'http';
                const resetLink = `${protocol}://${req.headers.host}/?reset=${token}`;
                const userLang = user.language && user.language !== 'auto' ? user.language : getLang(req);

                const mailOptions = {
                    from: conf.mail.from,
                    to: email,
                    subject: i18n.t('mail_subject', userLang),
                    html: `
                        <div style="font-family: 'Segoe UI', sans-serif; background: #000; color: #fff; padding: 20px;">
                            <h2 style="color: #1ba1e2;">${i18n.t('mail_hello', userLang)}, ${escHtml(user.username)}!</h2>
                            <p>${i18n.t('mail_desc', userLang)}</p>
                            <p>${i18n.t('mail_link_text', userLang)}</p>
                            <div style="margin: 20px 0;">
                                <a href="${resetLink}" style="padding: 12px 24px; background: #1ba1e2; color: #ffffff; text-decoration: none; display: inline-block; font-weight: bold;">
                                    ${i18n.t('mail_btn', userLang)}
                                </a>
                            </div>
                            <p style="color: #999; font-size: 0.9em;">${i18n.t('mail_ignore', userLang)}</p>
                        </div>
                    `
                };

                transporter.sendMail(mailOptions, (error) => {
                    if (error) console.error('Email error:', error);
                });
            }
            res.json({ success: true });
        });
    });
});

app.post('/api/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    db.get('SELECT id FROM users WHERE reset_token = ? AND reset_expires > ?', [token, Date.now()], async (err, user) => {
        if (!user) return res.status(400).json({ error: i18n.t('token_expired', getLang(req)) }); 
        
        const hash = await bcrypt.hash(newPassword, 10);
        db.run('UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?', [hash, user.id], (err) => {
            res.json(err ? { error: i18n.t('saving_error', getLang(req)) } : { success: true }); 
        });
    });
});

app.get('/api/categories', (req, res) => {
    db.all("SELECT * FROM categories", (err, rows) => res.json(err ? [] : rows));
});

app.post('/api/admin/categories', isAdmin, (req, res) => {
    const { key_name, display_name, emojis } = req.body;
    const emojiArray = emojis.split(',').map(e => e.trim());
    if (emojiArray.length !== 18) return res.status(400).json({ error: i18n.t('exactly_18_emojis', getLang(req)) }); 
    db.run('INSERT INTO categories (key_name, display_name, emojis) VALUES (?, ?, ?)', 
        [key_name, display_name, emojiArray.join(',')], 
        (err) => res.json(err ? { error: i18n.t('key_exists', getLang(req)) } : { success: true }) 
    );
});

app.put('/api/admin/categories/:id', isAdmin, (req, res) => {
    const { display_name, emojis } = req.body;
    const emojiArray = emojis.split(',').map(e => e.trim());
    if (emojiArray.length !== 18) return res.status(400).json({ error: i18n.t('exactly_18_emojis', getLang(req)) });
    db.run('UPDATE categories SET display_name = ?, emojis = ? WHERE id = ?', [display_name, emojiArray.join(','), req.params.id], 
        (err) => res.json(err ? { error: i18n.t('database_error', getLang(req)) } : { success: true }) 
    );
});

app.delete('/api/admin/categories/:id', isAdmin, (req, res) => {
    db.run('DELETE FROM categories WHERE id = ?', [req.params.id], (err) => res.json(err ? { error: i18n.t('error_deleting', getLang(req)) } : { success: true })); 
});

app.get('/api/admin/users', isAdmin, (req, res) => {
    db.all("SELECT id, username, email, is_admin FROM users", (err, rows) => res.json(err ? [] : rows));
});

app.post('/api/admin/users', isAdmin, async (req, res) => {
    const { username, email, password, is_admin } = req.body;
    if (!username || !password) return res.status(400).json({ error: i18n.t('fill_in_your_login_and_password', getLang(req)) }); 
    try {
        const hash = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (username, password, email, is_admin, avatar) VALUES (?, ?, ?, ?, ?)', 
            [username, hash, email || null, is_admin ? 1 : 0, '😶'], 
            (err) => res.json(err ? { error: i18n.t('login_is_busy', getLang(req)) } : { success: true })
        );
    } catch(e) { res.status(500).json({ error: i18n.t('server_error', getLang(req)) }); } 
});

app.put('/api/admin/users/:id', isAdmin, async (req, res) => {
    const { username, email, password, is_admin } = req.body;
    let query = 'UPDATE users SET username = ?, email = ?, is_admin = ?';
    let params = [username, email || null, is_admin ? 1 : 0];
    
    if (password) { query += ', password = ?'; params.push(await bcrypt.hash(password, 10)); }
    query += ' WHERE id = ?'; params.push(req.params.id);
    
    db.run(query, params, (err) => res.json(err ? { error: i18n.t('login_busy_or_database_error', getLang(req)) } : { success: true })); 
});

app.delete('/api/admin/users/:id', isAdmin, (req, res) => {
    if (req.session.userId == req.params.id) return res.status(400).json({ error: i18n.t('you_cant_delete_yourself', getLang(req)) }); 
    
    db.get('SELECT username FROM users WHERE id = ?', [req.params.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: i18n.t('user_not_found', getLang(req)) }); 
        
        db.run('DELETE FROM leaderboard WHERE username = ?', [user.username], (err) => {
            db.run('DELETE FROM user_card_stats WHERE user_id = ?', [req.params.id], (err) => {
                db.run('DELETE FROM users WHERE id = ?', [req.params.id], (err) => {
                    res.json(err ? { error: i18n.t('error_deleting', getLang(req)) } : { success: true }); 
                });
            });
        });
    });
});

app.get('/api/leaderboard', (req, res) => {
    const category = req.query.category;
    let query = "SELECT username, SUM(score) as totalScore FROM leaderboard ";
    let params = [];
    if (category && category !== 'all') { query += "WHERE category = ? "; params.push(category); }
    query += "GROUP BY username ORDER BY totalScore DESC LIMIT 10";
    db.all(query, params, (err, rows) => res.json(err ? [] : rows));
});

app.get('/api/profile', (req, res) => {
    if (!req.session.userId) return res.status(401).json({error: i18n.t('not_authorized', getLang(req))}); 
    db.get('SELECT email, avatar, theme, language FROM users WHERE id = ?', [req.session.userId], (err, user) => {
        db.all(`SELECT category, card_value, MAX(matches) as max_matches FROM user_card_stats WHERE user_id = ? GROUP BY category`, 
            [req.session.userId], (err, stats) => {
            res.json({ email: user?.email || '', avatar: user?.avatar || '😶', theme: user?.theme || 'dark', language: user?.language || 'auto', topCards: stats || [] });
        });
    });
});

app.post('/api/profile', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({error: i18n.t('not_authorized', getLang(req))});
    const { email, newPassword, avatar, theme, language } = req.body;
    let query = 'UPDATE users SET email = ?, avatar = ?, theme = ?, language = ?'; 
    let params = [email, avatar || '😶', theme || 'dark', language || 'auto'];
    if (newPassword) { query += ', password = ?'; params.push(await bcrypt.hash(newPassword, 10)); }
    query += ' WHERE id = ?'; params.push(req.session.userId);
    
    db.run(query, params, (err) => {
        if (!err) { req.session.avatar = avatar || '😶'; req.session.theme = theme || 'dark'; req.session.language = language || 'auto'; }
        res.json(err ? {error: i18n.t('saving_error', getLang(req))} : {success: true, avatar: req.session.avatar, theme: req.session.theme, language: req.session.language});
    });
});

app.post('/api/register', async (req, res) => {
    const { username, password, email } = req.body;
    if (!username || !password) return res.status(400).json({ error: i18n.t('please_fill_in_the_required_fields', getLang(req)) }); 
    
    db.get("SELECT COUNT(*) as count FROM users", async (err, row) => {
        // Логика первого пользователя - админа работает для обеих БД!
        const isAdminVal = (row && row.count === 0) ? 1 : 0; 
        try {
            const hash = await bcrypt.hash(password, 10);
            db.run('INSERT INTO users (username, password, email, is_admin, avatar) VALUES (?, ?, ?, ?, ?)', 
                [username, hash, email || null, isAdminVal, '😶'], function(err) {
                if (err) return res.status(400).json({ error: i18n.t('login_is_busy', getLang(req)) });
                req.session.userId = this.lastID; req.session.username = username; req.session.avatar = '😶';
                res.json({ success: true, username, avatar: '😶', isAdmin: isAdminVal === 1 });
            });
        } catch (e) { res.status(500).json({ error: i18n.t('server_error', getLang(req)) }); } 
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, row) => {
        if (!row || !(await bcrypt.compare(password, row.password))) return res.status(400).json({ error: i18n.t('login_error', getLang(req)) });
        req.session.userId = row.id; req.session.username = row.username; req.session.avatar = row.avatar || '😶';
        res.json({ success: true, username: row.username, avatar: req.session.avatar, isAdmin: row.is_admin === 1 });
    });
});

app.get('/api/session', (req, res) => {
    if (!req.session.userId) return res.json({ loggedIn: false });
    db.get('SELECT is_admin, avatar FROM users WHERE id = ?', [req.session.userId], (err, row) => {
        res.json({ loggedIn: true, username: req.session.username, avatar: req.session.avatar || '😶', isAdmin: row?.is_admin === 1 });
    });
});
app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

function cleanRoomData(room) {
    if (!room) return null;
    return { 
        id: room.id, name: room.name, creatorName: room.creatorName, creatorAvatar: room.creatorAvatar, 
        category: room.category, status: room.status, isPrivate: room.isPrivate || false,
        players: room.players.map(p => ({ name: p.name, avatar: p.avatar, id: p.id, score: p.score })) 
    };
}


// Оптимизация: кэшированная рассылка списка комнат
function broadcastRoomsList() {
    if (roomsListCache.dirty) {
        roomsListCache.data = Object.values(rooms).map(r => cleanRoomData(r));
        roomsListCache.dirty = false;
    }
    io.emit('roomsList', roomsListCache.data);
}

function markRoomsDirty() {
    roomsListCache.dirty = true;
}


// ====================== LEADERBOARD ЧЕРЕЗ WEBSOCKET ======================
function getLeaderboard(category, callback) {
    const cacheKey = category || 'all';
    const now = Date.now();
    
    // Используем кэш если данные свежие
    if (leaderboardCache.data && leaderboardCache.category === cacheKey && (now - leaderboardCache.lastUpdate) < LEADERBOARD_CACHE_TTL) {
        return callback(leaderboardCache.data);
    }
    
    let query = "SELECT username, SUM(score) as totalScore FROM leaderboard ";
    let params = [];
    if (category && category !== 'all') { query += "WHERE category = ? "; params.push(category); }
    query += "GROUP BY username ORDER BY totalScore DESC LIMIT 10";
    db.all(query, params, (err, rows) => {
        const result = err ? [] : rows;
        leaderboardCache = { data: result, category: cacheKey, lastUpdate: now };
        callback(result);
    });
}

function broadcastLeaderboard(category = 'all') {
    getLeaderboard(category, (data) => {
        io.emit('leaderboardUpdate', { category, data });
    });
}

function invalidateLeaderboard() {
    leaderboardCache = { data: null, lastUpdate: 0 };
    broadcastLeaderboard('all');
}

io.on('connection', (socket) => {
    const session = socket.request.session;
    if (!session || !session.userId) return;

    // ====================== HEARTBEAT ======================
    connectedSockets.set(socket.id, { userId: session.userId, lastPing: Date.now() });
    
    socket.on('hb', () => {
        const info = connectedSockets.get(socket.id);
        if (info) info.lastPing = Date.now();
        socket.emit('hb_ack');
    });

    // ====================== LEADERBOARD SUBSCRIPTION ======================
    socket.on('subscribeLeaderboard', (category) => {
        const cat = (category || 'all').toString().substring(0, 30);
        socket.join(`leaderboard_${cat}`);
        // Отправляем текущие данные сразу
        getLeaderboard(cat, (data) => {
            socket.emit('leaderboardUpdate', { category: cat, data });
        });
    });
    
    socket.on('unsubscribeLeaderboard', (category) => {
        const cat = (category || 'all').toString().substring(0, 30);
        socket.leave(`leaderboard_${cat}`);
    });

    socket.emit('roomsList', roomsListCache.dirty ? Object.values(rooms).map(r => cleanRoomData(r)) : (roomsListCache.data || []));

   socket.on('createRoom', (data) => {
        if (!data || typeof data !== 'object') return;
        const roomId = 'room_' + Date.now();
        const userLang = getLang(socket.request);
        const safeName = (data.name || '').toString().substring(0, 50).trim();
        const safeCategory = (data.category || 'animals').toString().substring(0, 30);
        const isPrivate = !!data.isPrivate; // Приватная комната
        rooms[roomId] = {
            id: roomId, name: safeName || `${i18n.t('room', userLang)} - ${session.username}`,
            creatorId: session.userId, creatorName: session.username, creatorAvatar: session.avatar || '😶',
            category: safeCategory, status: 'waiting', createdAt: Date.now(), 
            isPrivate: isPrivate,
            players: [{ id: session.userId, name: session.username, avatar: session.avatar || '😶', socketId: socket.id, score: 0 }],
            deck: [], openedCards: [], matchedPairs: [], turnIndex: 0, cardStats: Array(36).fill(0), matchedCards: {}
        };
        socket.join(roomId);
        socket.emit('roomCreated', cleanRoomData(rooms[roomId]));
        markRoomsDirty();
        broadcastRoomsList();
    });

function processCardFlip(roomId, playerId, cardIndex) {
    const room = rooms[roomId];
    if (!room || room.status !== 'playing' || room.players[room.turnIndex].id !== playerId) return;
    if (room.openedCards.includes(cardIndex) || room.openedCards.length >= 2 || room.matchedPairs.includes(room.deck[cardIndex])) return;

    room.openedCards.push(cardIndex);
    room.cardStats[cardIndex]++;

    if (room.isBotMatch) {
        if (!room.botMemory) room.botMemory = {};
        room.botMemory[cardIndex] = room.deck[cardIndex];
    }

    io.to(roomId).emit('cardOpened', { index: cardIndex, value: room.deck[cardIndex], stats: room.cardStats[cardIndex] });

    if (room.openedCards.length === 2) {
        const [i1, i2] = room.openedCards;
        const isMatch = room.deck[i1] === room.deck[i2];

        if (isMatch) {
            const currentPlayer = room.players[room.turnIndex];
            currentPlayer.combo = (currentPlayer.combo || 0) + 1;
            
            const comboCount = currentPlayer.combo;
            const multiplier = comboCount >= 2 ? Math.min(1 + (comboCount - 1) * 0.5, 3) : 1;

            const points = Math.round(1 * multiplier);
            currentPlayer.score += points;

            room.matchedPairs.push(room.deck[i1]);
            room.openedCards = [];

            const matchColor = room.turnIndex === 0 ? '#1ba1e2' : '#f09609';
            const matchedValue = room.deck[i1];

            if (playerId !== 'bot_cpu') {
                let statQuery = `INSERT INTO user_card_stats (user_id, category, card_value) VALUES (?, ?, ?) ON CONFLICT(user_id, category, card_value) DO UPDATE SET matches = matches + 1`;
                if (db.type === 'mysql') {
                    statQuery = `INSERT INTO user_card_stats (user_id, category, card_value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE matches = matches + 1`;
                }
                db.run(statQuery, [playerId, room.category, matchedValue], (err) => { if(err) console.error(err); });
            }

            room.matchedCards[i1] = { value: matchedValue, color: matchColor };
            room.matchedCards[i2] = { value: matchedValue, color: matchColor };

            io.to(roomId).emit('matchFound', { 
                indices: [i1, i2], 
                players: room.players.map(p => ({ id: p.id, score: p.score })),
                matchColor: matchColor
            });
            
            if (room.matchedPairs.length === 18) {
                const category = room.category;
                room.players.forEach(p => {
                    if (p.id !== 'bot_cpu') {
                        db.run('INSERT INTO leaderboard (username, category, score) VALUES (?, ?, ?)', [p.name, category, p.score], (err) => {
                            if (err) console.error(err);
                        });
                    }
                });
                // Инвалидируем leaderboard после записи результатов
                setTimeout(() => invalidateLeaderboard(), 100);
                io.to(roomId).emit('gameOver', { players: room.players });
                delete rooms[roomId];
                // Обновляем список комнат после удаления
                markRoomsDirty();
                broadcastRoomsList();
            } else {
                if (room.players[room.turnIndex].isBot) {
                    setTimeout(() => playBotTurn(roomId), 1500);
                }
            }
        } else {
            // Промах — сбрасываем комбо
            room.players[room.turnIndex].combo = 0;

            setTimeout(() => {
                if (!rooms[roomId]) return;
                io.to(roomId).emit('matchFailed', { indices: [i1, i2] });
                rooms[roomId].openedCards = [];
                rooms[roomId].turnIndex = (rooms[roomId].turnIndex + 1) % 2;
                io.to(roomId).emit('turnChanged', rooms[roomId].players[rooms[roomId].turnIndex].id);
                
                if (rooms[roomId].players[rooms[roomId].turnIndex].isBot) {
                    setTimeout(() => playBotTurn(roomId), 1200);
                }
            }, 1000);
        }
    } else {
        if (room.players[room.turnIndex].isBot) {
            setTimeout(() => playBotTurn(roomId), 1000);
        }
    }
}

    function playBotTurn(roomId) {
        const room = rooms[roomId];
        if (!room || room.status !== 'playing' || !room.players[room.turnIndex].isBot) return;

        const botDiff = room.botDifficulty || 'medium';
        const memoryChance = { 'easy': 0.3, 'medium': 0.75, 'hard': 1.0 }[botDiff];
        
        const availableIndexes = room.deck.map((_, i) => i).filter(i => !room.matchedPairs.includes(room.deck[i]) && !room.openedCards.includes(i));
        if (availableIndexes.length === 0) return;

        let targetIndex = -1;

        if (room.openedCards.length === 1) {
            const openedValue = room.deck[room.openedCards[0]];
            const knownPairIndex = Object.keys(room.botMemory).find(index => 
                room.botMemory[index] === openedValue && 
                Number(index) !== room.openedCards[0] && 
                availableIndexes.includes(Number(index))
            );

            if (knownPairIndex && Math.random() <= memoryChance) {
                targetIndex = Number(knownPairIndex);
            }
        } 
        else {
            const memoryEntries = Object.entries(room.botMemory).filter(([idx, _]) => availableIndexes.includes(Number(idx)));
            const valueCounts = {};
            let pairValue = null;
            
            for (const [idx, val] of memoryEntries) {
                valueCounts[val] = (valueCounts[val] || 0) + 1;
                if (valueCounts[val] === 2) { pairValue = val; break; }
            }

            if (pairValue && Math.random() <= memoryChance) {
                targetIndex = Number(memoryEntries.find(([idx, val]) => val === pairValue)[0]);
            }
        }

        if (targetIndex === -1) {
            targetIndex = availableIndexes[Math.floor(Math.random() * availableIndexes.length)];
        }

        processCardFlip(roomId, 'bot_cpu', targetIndex);
    }

    socket.on('createBotRoom', (data) => {
        if (!data || typeof data !== 'object') return;
        const validDifficulties = ['easy', 'medium', 'hard'];
        const difficulty = validDifficulties.includes(data.difficulty) ? data.difficulty : 'medium';
        const safeCategory = (data.category || 'animals').toString().substring(0, 30);
        const roomId = 'botRoom_' + Date.now();
        const deck = Array.from({length: 18}, (_, i) => [i+1, i+1]).flat().sort(() => Math.random() - 0.5);
        const userLang = getLang(socket.request);
        rooms[roomId] = {
            id: roomId, name: i18n.t('game_with_bot', userLang), 
            category: safeCategory, status: 'playing', createdAt: Date.now(),
            isBotMatch: true, botDifficulty: difficulty, botMemory: {},
            isPrivate: true, 
            players: [
                { id: session.userId, name: session.username, avatar: session.avatar || '😶', socketId: socket.id, score: 0 },
                { id: 'bot_cpu', name: `${i18n.t('bot', userLang)} 🤖`, avatar: '🤖', isBot: true, score: 0 }
            ],
            deck: deck, openedCards: [], matchedPairs: [], turnIndex: 0, cardStats: Array(36).fill(0), matchedCards: {}
        };
        
        socket.join(roomId);
        markRoomsDirty();
        broadcastRoomsList();
        socket.emit('gameStart', { room: cleanRoomData(rooms[roomId]), turn: session.userId });
    });

    socket.on('joinRoom', (roomId) => {
        if (typeof roomId !== 'string' || !rooms[roomId]) return;
        const room = rooms[roomId];
        if (room && room.status === 'waiting' && room.creatorId !== session.userId) {
            room.players.push({ id: session.userId, name: session.username, avatar: session.avatar || '😶', socketId: socket.id, score: 0 });
            room.status = 'playing';
            room.deck = Array.from({length: 18}, (_, i) => [i+1, i+1]).flat().sort(() => Math.random() - 0.5);
            socket.join(roomId);
            io.to(roomId).emit('gameStart', { room: cleanRoomData(room), turn: room.players[0].id });
            markRoomsDirty();
            broadcastRoomsList();
        }
    });

    socket.on('spectateRoom', (roomId) => {
        if (typeof roomId !== 'string' || !rooms[roomId]) return;
        const room = rooms[roomId];
        if (room && room.status === 'playing' && !room.isPrivate) {
            socket.join(roomId);
            socket.emit('spectateStart', { room: cleanRoomData(room), turn: room.players[room.turnIndex].id, matchedCards: room.matchedCards, cardStats: room.cardStats, openedCards: room.openedCards.map(idx => ({ index: idx, value: room.deck[idx], stats: room.cardStats[idx] })) });
        }
    });

    socket.on('cardClick', (cardIndex) => {
        if (typeof cardIndex !== 'number' || cardIndex < 0 || cardIndex > 35 || !Number.isInteger(cardIndex)) return;

        // Rate limiting: max 3 clicks per second per user
        const now = Date.now();
        const lastClick = cardClickThrottle.get(session.userId) || 0;
        if (now - lastClick < 300) return; // 300ms throttle
        cardClickThrottle.set(session.userId, now);

        const roomId = Array.from(socket.rooms).find(r => r.startsWith('room_') || r.startsWith('botRoom_'));
        if (!roomId) return;
        processCardFlip(roomId, session.userId, cardIndex);
    });

    socket.on('disconnect', () => {
        // Очищаем heartbeat tracking
        connectedSockets.delete(socket.id);
        for (const [id, room] of Object.entries(rooms)) {
            if (room.players.some(p => p.socketId === socket.id)) {
                io.to(id).emit('roomClosed', 'opponent_left');
                delete rooms[id];
                markRoomsDirty();
                broadcastRoomsList();
            }
        }
    });
});

// Запуск сервера с использованием порта из конфига
const PORT = conf.port || 3000;
server.listen(PORT, () => {
    console.log(`Metro Memory running on port ${PORT}`);
});