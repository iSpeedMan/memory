# Redis в Metro Memory

## Зачем Redis?

Без Redis приложение полностью работоспособно — все данные хранятся в SQLite и памяти процесса. Redis — это **необязательный слой оптимизации**, который включается автоматически при наличии переменной `REDIS_URL`.

| Что улучшает | Без Redis | С Redis |
|---|---|---|
| **Сессии пользователей** | SQLite (медленно, блокировки) | Redis Hash: ~0.1 мс, TTL-очистка автоматически |
| **API-кэш** | In-memory L1 (только текущий инстанс) | L1 память + L2 Redis (общий между инстансами) |
| **Таблица лидеров** | In-memory Map (теряется при рестарте) | Redis: шарится между инстансами, persist |
| **История чата** | In-memory Map (теряется при рестарте) | Redis: переживает рестарты, TTL 24ч/1ч |
| **Бот-трекер** | In-memory (не работает на N инстансах) | Redis Hash: точный счётчик на всех нодах, TTL 5 мин |
| **Список пользователей** | Запрос к БД на каждый запрос | Redis: кэш 30 сек |
| **ServerInfo / Announcements** | Загружаются из БД при каждом старте | Redis: быстрый холодный старт, синхронно между нодами |
| **Rate limiting** | In-memory (не работает на N инстансах) | Redis: точный счётчик на всех нодах |
| **Socket.IO** | In-memory adapter (только 1 инстанс) | Redis adapter: горизонтальное масштабирование |

---

## Отказоустойчивость (Graceful Degradation)

Если Redis **недоступен** (не запущен, упал, сетевая ошибка) — приложение автоматически переходит в режим fallback:

```
Redis недоступен
    ↓
[Сессии]            → connect-sqlite3 (SQLite-файл)
[API-кэш]           → только L1 in-memory (текущий инстанс)
[Leaderboard]       → in-memory Map (кэш 30 сек)
[История чата]      → in-memory Map (до рестарта)
[Бот-трекер]        → in-memory Map
[Список юзеров]     → прямой запрос к БД
[Rate limit]        → express-rate-limit (in-memory)
[Socket.IO]         → default in-memory adapter (1 инстанс)
```

Когда Redis **восстанавливается** — клиент автоматически переподключается (экспоненциальный backoff, до 30 сек между попытками). Новые операции снова пойдут через Redis.

**Ни одна ошибка Redis не крашит приложение.** Все операции обёрнуты в try/catch с логированием и fallback-логикой.

---

## Пространство имён ключей

```
metro:sess:{sessionId}         — сессии пользователей          (TTL 86400 сек)
metro:lb:{category}            — кэш leaderboard               (TTL 30 сек)
metro:chat:{roomId}            — история чата лобби            (TTL 86400 сек)
metro:chat:{roomId}            — история чата игровой комнаты  (TTL 3600 сек)
metro:api:{route}:{params}     — двухуровневый API-кэш         (TTL зависит от маршрута)
metro:bot:{userId}             — состояние бот-трекера         (TTL 300 сек, авто)
metro:users:list               — список пользователей лобби    (TTL 30 сек)
metro:server:info              — serverInfo (объявления)        (без TTL, обновляется при изменении)
metro:server:announcements     — текст объявлений              (без TTL, обновляется при изменении)
metro:rl:auth:{ip}             — rate limit (вход)
metro:rl:reg:{ip}              — rate limit (регистрация)
metro:rl:suggest:{ip}          — rate limit (предложения)
```

Все ключи с префиксом `metro:` — можно безопасно запустить `FLUSHDB` без риска сломать другие приложения на том же Redis-сервере (при использовании отдельной БД, см. ниже).

---

## Архитектура кэширования

### Двухуровневый API-кэш (middleware/apiCache.js)

```
Запрос /api/leaderboard
    ↓
[L1] In-memory Map — попадание? → ответ за 0 мс
    ↓ промах
[L2] Redis GET metro:api:... — попадание? → ответ, заполняем L1
    ↓ промах
[DB] SQLite / MySQL — результат → заполняем L2 → заполняем L1 → ответ
```

При обновлении данных сбрасываются оба уровня (`invalidateApiCache`).

### Бот-трекер (services/botTracker.js)

Использует Redis Hash (`HSET / HGET / HEXPIRE`) для хранения:
- `unfinished` — количество незавершённых партий с ботом
- `blockedUntil` — timestamp блокировки (если превышен лимит)

TTL 5 минут автоматически очищает записи неактивных пользователей.

---

## Установка Redis

### Вариант 1 — системный пакет (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install redis-server

# Проверка
redis-cli ping
# → PONG

# Статус
systemctl status redis-server
```

Конфиг: `/etc/redis/redis.conf`

### Вариант 2 — Docker (быстрый старт)

```bash
docker run -d \
  --name metro-redis \
  --restart unless-stopped \
  -p 127.0.0.1:6379:6379 \
  -v redis-data:/data \
  redis:7-alpine \
  redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
```

Проверка:
```bash
docker exec metro-redis redis-cli ping
# → PONG
```

### Вариант 3 — Docker Compose (рекомендуется)

Добавьте Redis в `docker-compose.yml` вашего проекта:

```yaml
services:
  app:
    build: .
    environment:
      - PORT=5000
      - REDIS_URL=redis://redis:6379/0
      - SESSION_SECRET=your-very-long-secret-here
    depends_on:
      redis:
        condition: service_healthy
    ports:
      - "5000:5000"
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: >
      redis-server
      --appendonly yes
      --maxmemory 256mb
      --maxmemory-policy allkeys-lru
      --save 60 1
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
    restart: unless-stopped

volumes:
  redis-data:
```

---

## Подключение к приложению

### Минимальная конфигурация

Установите переменную окружения `REDIS_URL`:

```env
# Локальный Redis без пароля, БД 0
REDIS_URL=redis://127.0.0.1:6379/0

# Redis с паролем
REDIS_URL=redis://:your-password@127.0.0.1:6379/0

# Redis через Unix-сокет (быстрее на одном хосте)
REDIS_URL=redis+unix:///var/run/redis/redis.sock?db=0

# Redis Sentinel
REDIS_URL=redis-sentinel://:password@sentinel1:26379,sentinel2:26379/mymaster/0

# Redis Cluster
REDIS_URL=redis://127.0.0.1:7000?type=cluster
```

### Рекомендуется: отдельная БД

Redis поддерживает до 16 баз данных (0–15). Используйте отдельную, чтобы не смешивать данные:

```env
REDIS_URL=redis://127.0.0.1:6379/1   # БД 1 для Metro Memory
```

### Полный пример `.env`

```env
PORT=5000
SESSION_SECRET=замените-на-64+-случайных-символа
REDIS_URL=redis://127.0.0.1:6379/0
MEMORY_DB_TYPE=sqlite
SQLITE_FILENAME=database.sqlite
FIRST_ADMIN_USERNAME=admin
FIRST_ADMIN_PASSWORD=admin123
BCRYPT_ROUNDS=12
MAIL_TLS_REJECT_UNAUTHORIZED=true
```

---

## Конфигурация Redis (`redis.conf`)

Рекомендуемые настройки для продакшн:

```conf
# /etc/redis/redis.conf

# Привязать только к localhost (не открывать наружу без необходимости)
bind 127.0.0.1 ::1

# Порт (стандарт)
port 6379

# Пароль (рекомендуется)
requirepass your-strong-password-here

# Максимальная память (настройте под сервер)
maxmemory 256mb

# Политика вытеснения: удалять наименее используемые ключи
# Подходит, т.к. все наши ключи нечувствительны к потере
maxmemory-policy allkeys-lru

# Персистентность: AOF (надёжнее RDB для наших данных)
appendonly yes
appendfsync everysec

# Ограничение подключений
maxclients 100

# Таймаут idle-подключений (сек, 0 = выкл)
timeout 300

# Отключить опасные команды (необязательно, но рекомендуется)
rename-command FLUSHALL ""
rename-command FLUSHDB  ""
rename-command CONFIG   ""
rename-command DEBUG    ""
```

После изменения конфига:
```bash
sudo systemctl restart redis-server
```

---

## Проверка работы

### 1. Убедитесь, что Redis запущен

```bash
redis-cli ping
# → PONG

redis-cli info server | grep redis_version
# → redis_version:7.x.x
```

### 2. Запустите приложение

```bash
REDIS_URL=redis://127.0.0.1:6379/0 node server.js
```

В логах должно появиться:
```
[Redis] Connected
[Redis] Using Redis session store
[Static] Serving optimised build from dist/
Metro Memory running on port 5000
```

Если Redis недоступен:
```
[Redis] Initial connection failed — fallback mode active: ...
[Session] Using SQLite session store
Metro Memory running on port 5000
```

### 3. Проверьте health endpoint

```bash
curl http://localhost:5000/health
# → {"status":"ok","uptime":5,"redis":"disabled"}
```

### 4. Откройте Swagger UI

```
http://localhost:5000/api/docs
```

### 5. Просмотр ключей в Redis

```bash
# Все ключи Metro Memory
redis-cli KEYS "metro:*"

# Количество активных сессий
redis-cli KEYS "metro:sess:*" | wc -l

# Посмотреть кэш leaderboard
redis-cli GET "metro:lb:all"

# Состояние бот-трекера конкретного пользователя
redis-cli HGETALL "metro:bot:42"

# Кэшированный список пользователей
redis-cli GET "metro:users:list"

# ServerInfo / Announcements
redis-cli GET "metro:server:info"
redis-cli GET "metro:server:announcements"

# Мониторинг команд в реальном времени
redis-cli MONITOR
```

---

## Мониторинг

### Встроенная статистика Redis

```bash
# Общая информация
redis-cli INFO

# Только статистика памяти
redis-cli INFO memory

# Количество команд в секунду (ops/sec)
redis-cli INFO stats | grep instantaneous_ops_per_sec

# Keyspace (список БД с количеством ключей)
redis-cli INFO keyspace
```

### Полезные метрики

| Метрика | Команда | Норма |
|---|---|---|
| Память | `INFO memory` → `used_memory_human` | < `maxmemory` |
| Hit rate кэша | `INFO stats` → `keyspace_hits / (hits + misses)` | > 80% |
| Подключений | `INFO clients` → `connected_clients` | < `maxclients` |
| Эвикшен ключей | `INFO stats` → `evicted_keys` | 0 в норме |

---

## Горизонтальное масштабирование

Когда Redis активен, Socket.IO автоматически использует Redis adapter. Это позволяет запустить несколько инстансов приложения за балансировщиком нагрузки:

```
           nginx (балансировщик)
          /                    \
   Node.js #1              Node.js #2
      |                        |
      +----------Redis----------+
       (сессии, API-кэш, чат, leaderboard, бот-трекер, Socket.IO events)
```

**Важно для Nginx**: при использовании Socket.IO с несколькими инстансами нужна sticky-сессия или конфигурация для WebSocket upstreams:

```nginx
upstream metro_memory {
    ip_hash;   # Sticky sessions по IP
    server 127.0.0.1:5000;
    server 127.0.0.1:5001;
    keepalive 32;
}
```

---

## Troubleshooting

### Redis не подключается

```bash
# Проверить статус
systemctl status redis-server

# Проверить порт
ss -tlnp | grep 6379

# Проверить брандмауэр (если Redis на другом хосте)
telnet redis-host 6379
```

### Ошибка `WRONGTYPE Operation against a key holding the wrong kind of value`

Старые ключи с другим типом. Очистите их:
```bash
redis-cli DEL "metro:chat:lobby"
# или полная очистка пространства имён:
redis-cli --scan --pattern "metro:*" | xargs redis-cli DEL
```

### Память Redis быстро растёт

Убедитесь, что установлен `maxmemory` и `maxmemory-policy allkeys-lru` в конфиге.

### Сессии теряются при рестарте

Если используется Redis с `appendonly no` (только RDB), данные могут теряться. Включите AOF:
```conf
appendonly yes
appendfsync everysec
```

### Перейти обратно на SQLite сессии

Удалите или очистите `REDIS_URL`:
```bash
unset REDIS_URL
node server.js
# → [Session] Using SQLite session store
```

### API-кэш отдаёт устаревшие данные

L1-кэш сбрасывается автоматически при обновлении данных. Если нужно сбросить вручную:
```bash
# Сбросить весь API-кэш в Redis
redis-cli --scan --pattern "metro:api:*" | xargs redis-cli DEL
```
