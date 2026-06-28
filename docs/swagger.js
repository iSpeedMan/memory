const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.3',
        info: {
            title: 'Metro Memory API',
            version: '1.0.0',
            description: 'REST API многопользовательской карточной игры Metro Memory. ' +
                'Аутентификация — cookie-сессия. Большинство защищённых эндпоинтов требуют активной сессии (залогиненного пользователя). ' +
                'CSRF-токен передаётся в заголовке `X-CSRF-Token` для всех POST/PUT/DELETE запросов.',
            contact: { name: 'Metro Memory', url: 'https://github.com/metro-memory' },
            license: { name: 'MIT' },
        },
        servers: [{ url: '/api', description: 'API сервер' }],
        components: {
            securitySchemes: {
                cookieSession: {
                    type: 'apiKey',
                    in: 'cookie',
                    name: 'connect.sid',
                    description: 'Express session cookie, устанавливается при логине',
                },
            },
            schemas: {
                Error: {
                    type: 'object',
                    properties: { error: { type: 'string', example: 'Not authorized' } },
                },
                Success: {
                    type: 'object',
                    properties: { success: { type: 'boolean', example: true } },
                },
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 1 },
                        username: { type: 'string', example: 'player1' },
                        avatar: { type: 'string', example: '😎' },
                        email: { type: 'string', format: 'email', nullable: true },
                        is_admin: { type: 'integer', enum: [0, 1], example: 0 },
                        coins: { type: 'integer', example: 150 },
                        theme: { type: 'string', enum: ['dark', 'light'], example: 'dark' },
                        language: { type: 'string', enum: ['ru', 'en', 'auto'], example: 'auto' },
                    },
                },
                Category: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 1 },
                        key_name: { type: 'string', example: 'animals' },
                        display_name: { type: 'string', example: 'Животные' },
                        emojis: { type: 'string', example: '🐶,🐱,🐭,🦊,🐻,🦁' },
                        repr_emoji: { type: 'string', example: '🐾', nullable: true },
                    },
                },
                LeaderboardEntry: {
                    type: 'object',
                    properties: {
                        rank: { type: 'integer', example: 1 },
                        username: { type: 'string', example: 'champion' },
                        score: { type: 'integer', example: 42 },
                        category: { type: 'string', example: 'animals' },
                    },
                },
                Achievement: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', example: 'first_win' },
                        title: { type: 'string', example: 'Первая победа' },
                        description: { type: 'string', example: 'Выиграй свою первую партию' },
                        unlocked: { type: 'boolean', example: true },
                        unlockedAt: { type: 'string', format: 'date-time', nullable: true },
                    },
                },
                Friend: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 5 },
                        username: { type: 'string', example: 'buddy' },
                        avatar: { type: 'string', example: '🦊' },
                        online: { type: 'boolean', example: true },
                        inGame: { type: 'boolean', example: false },
                    },
                },
                Announcement: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 1 },
                        text: { type: 'string', example: 'Сервер обновлён до v2.0' },
                        created_at: { type: 'string', format: 'date-time' },
                    },
                },
                GameHistoryEntry: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 101 },
                        played_at: { type: 'string', format: 'date-time' },
                        category: { type: 'string', example: 'animals' },
                        is_bot_game: { type: 'integer', enum: [0, 1] },
                        my_score: { type: 'integer', example: 8 },
                        opp_score: { type: 'integer', example: 5 },
                        opponent_name: { type: 'string', example: 'Bot 🤖' },
                        winner_id: { type: 'integer', nullable: true },
                    },
                },
            },
            ShopItem: {
                type: 'object',
                properties: {
                    item_key:     { type: 'string', example: 'card_purple' },
                    category:     { type: 'string', enum: ['card_skin','board_bg','match_color','avatar_frame','title'] },
                    name:         { type: 'string', example: 'Фиолетовая рубашка' },
                    price_mc:     { type: 'integer', example: 150 },
                    rarity:       { type: 'string', enum: ['common','rare','epic','legendary'] },
                    is_active:    { type: 'integer', enum: [0, 1] },
                    preview_data: { type: 'object', example: { css_class: 'card-purple', preview_bg: '#6a0dad' } },
                    owned:        { type: 'boolean', example: false },
                    equipped:     { type: 'boolean', example: false },
                },
            },
            ShopItemCreate: {
                type: 'object',
                required: ['item_key', 'category', 'name'],
                properties: {
                    item_key:     { type: 'string', example: 'card_fire' },
                    category:     { type: 'string', enum: ['card_skin','board_bg','match_color','avatar_frame','title'] },
                    name:         { type: 'string', example: 'Огненная рубашка' },
                    price_mc:     { type: 'integer', example: 300 },
                    rarity:       { type: 'string', enum: ['common','rare','epic','legendary'] },
                    is_active:    { type: 'integer', enum: [0, 1], default: 1 },
                    preview_data: { type: 'object' },
                },
            },
            ShopItemUpdate: {
                type: 'object',
                properties: {
                    name:         { type: 'string' },
                    price_mc:     { type: 'integer' },
                    rarity:       { type: 'string', enum: ['common','rare','epic','legendary'] },
                    is_active:    { type: 'integer', enum: [0, 1] },
                    preview_data: { type: 'object' },
                },
            },
            UserCosmetics: {
                type: 'object',
                description: 'Активная косметика пользователя по категориям',
                properties: {
                    card_skin:    { type: 'object', nullable: true, properties: { item_key: { type: 'string' }, css_class: { type: 'string' }, name: { type: 'string' } } },
                    board_bg:     { type: 'object', nullable: true, properties: { item_key: { type: 'string' }, css_class: { type: 'string' }, image_url: { type: 'string', nullable: true }, name: { type: 'string' } } },
                    match_color:  { type: 'object', nullable: true, properties: { item_key: { type: 'string' }, color: { type: 'string' }, name: { type: 'string' } } },
                    avatar_frame: { type: 'object', nullable: true, properties: { item_key: { type: 'string' }, css_class: { type: 'string' }, name: { type: 'string' } } },
                    title:        { type: 'object', nullable: true, properties: { item_key: { type: 'string' }, css_class: { type: 'string' }, label: { type: 'string' }, color: { type: 'string' }, name: { type: 'string' } } },
                },
            },
        },
        security: [{ cookieSession: [] }],
        tags: [
            { name: 'Auth', description: 'Аутентификация и управление профилем' },
            { name: 'Categories', description: 'Категории карточек' },
            { name: 'Leaderboard', description: 'Таблица лидеров' },
            { name: 'Friends', description: 'Система друзей' },
            { name: 'Profile', description: 'Публичные профили игроков' },
            { name: 'Announcements', description: 'Объявления сервера' },
            { name: 'Shop', description: 'Магазин косметики — товары, покупки, экипировка' },
            { name: 'Admin', description: 'Административные эндпоинты (требуют is_admin=1)' },
            { name: 'System', description: 'Системные эндпоинты' },
        ],
        paths: {
            '/health': {
                get: {
                    tags: ['System'],
                    summary: 'Проверка состояния сервера',
                    security: [],
                    responses: {
                        200: {
                            description: 'Сервер работает',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            status: { type: 'string', example: 'ok' },
                                            uptime: { type: 'integer', example: 3600 },
                                            redis: { type: 'string', example: 'disabled' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },

            '/login': {
                post: {
                    tags: ['Auth'],
                    summary: 'Вход в систему',
                    security: [],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['username', 'password'],
                                    properties: {
                                        username: { type: 'string', example: 'player1' },
                                        password: { type: 'string', format: 'password', example: 'secret123' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: {
                            description: 'Успешный вход',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            success: { type: 'boolean' },
                                            username: { type: 'string' },
                                            avatar: { type: 'string' },
                                            isAdmin: { type: 'boolean' },
                                            userId: { type: 'integer' },
                                            csrfToken: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                        400: { description: 'Неверные данные', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        401: { description: 'Неверный логин или пароль', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
            },

            '/register': {
                post: {
                    tags: ['Auth'],
                    summary: 'Регистрация нового пользователя',
                    security: [],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['username', 'password'],
                                    properties: {
                                        username: { type: 'string', minLength: 3, maxLength: 32, example: 'newplayer' },
                                        password: { type: 'string', minLength: 8, example: 'mypassword' },
                                        email: { type: 'string', format: 'email', nullable: true },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Пользователь создан и автоматически залогинен', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, username: { type: 'string' }, avatar: { type: 'string' }, isAdmin: { type: 'boolean' }, userId: { type: 'integer' } } } } } },
                        400: { description: 'Логин занят или данные невалидны', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
            },

            '/logout': {
                post: {
                    tags: ['Auth'],
                    summary: 'Выход из системы',
                    responses: {
                        200: { description: 'Сессия уничтожена', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    },
                },
            },

            '/session': {
                get: {
                    tags: ['Auth'],
                    summary: 'Получить данные текущей сессии',
                    responses: {
                        200: {
                            description: 'Данные сессии',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            loggedIn: { type: 'boolean' },
                                            username: { type: 'string', nullable: true },
                                            avatar: { type: 'string', nullable: true },
                                            isAdmin: { type: 'boolean' },
                                            userId: { type: 'integer', nullable: true },
                                            csrfToken: { type: 'string', nullable: true },
                                            theme: { type: 'string' },
                                            language: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },

            '/profile': {
                post: {
                    tags: ['Auth'],
                    summary: 'Обновить профиль текущего пользователя',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        email: { type: 'string', format: 'email', nullable: true },
                                        newPassword: { type: 'string', minLength: 8, nullable: true },
                                        avatar: { type: 'string', example: '😎' },
                                        theme: { type: 'string', enum: ['dark', 'light'] },
                                        language: { type: 'string', enum: ['ru', 'en', 'auto'] },
                                        chatDisabled: { type: 'boolean' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Профиль обновлён', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, avatar: { type: 'string' }, theme: { type: 'string' }, language: { type: 'string' } } } } } },
                        400: { description: 'Невалидные данные', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        401: { description: 'Не авторизован', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
            },

            '/forgot-password': {
                post: {
                    tags: ['Auth'],
                    summary: 'Запрос ссылки на сброс пароля',
                    security: [],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } } } },
                    },
                    responses: {
                        200: { description: 'Письмо отправлено (если email найден)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    },
                },
            },

            '/reset-password': {
                post: {
                    tags: ['Auth'],
                    summary: 'Сброс пароля по токену из письма',
                    security: [],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', required: ['token', 'newPassword'], properties: { token: { type: 'string' }, newPassword: { type: 'string', minLength: 8 } } } } },
                    },
                    responses: {
                        200: { description: 'Пароль сброшен', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                        400: { description: 'Токен истёк или неверен', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
            },

            '/profile/stats': {
                get: {
                    tags: ['Auth'],
                    summary: 'Статистика текущего пользователя (PvP + бот)',
                    responses: {
                        200: { description: 'Статистика', content: { 'application/json': { schema: { type: 'object', properties: { pvp: { type: 'object', properties: { total: { type: 'integer' }, wins: { type: 'integer' }, draws: { type: 'integer' }, losses: { type: 'integer' } } }, bot: { type: 'array', items: { type: 'object' } } } } } } },
                        401: { description: 'Не авторизован', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
            },

            '/profile/achievements': {
                get: {
                    tags: ['Auth'],
                    summary: 'Достижения текущего пользователя',
                    responses: {
                        200: { description: 'Список достижений', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Achievement' } } } } },
                        401: { description: 'Не авторизован', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
            },

            '/achievements': {
                get: {
                    tags: ['Auth'],
                    summary: 'Все достижения с флагом разблокировки',
                    responses: {
                        200: { description: 'Достижения со статусом', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Achievement' } } } } },
                    },
                },
            },

            '/categories': {
                get: {
                    tags: ['Categories'],
                    summary: 'Список всех категорий карточек',
                    security: [],
                    responses: {
                        200: { description: 'Список категорий (включая виртуальную unicode)', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Category' } } } } },
                    },
                },
            },

            '/categories/suggest': {
                post: {
                    tags: ['Categories'],
                    summary: 'Предложить пользовательскую категорию с изображениями',
                    requestBody: {
                        required: true,
                        content: {
                            'multipart/form-data': {
                                schema: {
                                    type: 'object',
                                    required: ['key_name', 'display_name'],
                                    properties: {
                                        key_name: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,30}$' },
                                        display_name: { type: 'string', maxLength: 64 },
                                        repr_emoji: { type: 'string' },
                                        images: { type: 'array', items: { type: 'string', format: 'binary' }, description: 'PNG/JPG/GIF, макс. 2 МБ каждый, 18–32 файла' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: { description: 'Категория отправлена на модерацию', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                        400: { description: 'Невалидные данные', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
            },

            '/leaderboard': {
                get: {
                    tags: ['Leaderboard'],
                    summary: 'Глобальная таблица лидеров',
                    security: [],
                    parameters: [
                        { name: 'category', in: 'query', schema: { type: 'string' }, description: 'Фильтр по категории (пусто = все)' },
                    ],
                    responses: {
                        200: { description: 'Топ записей', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/LeaderboardEntry' } } } } },
                    },
                },
            },

            '/friends': {
                get: {
                    tags: ['Friends'],
                    summary: 'Список друзей текущего пользователя',
                    responses: {
                        200: { description: 'Список друзей', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Friend' } } } } },
                        401: { description: 'Не авторизован', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
            },

            '/friends/requests': {
                get: {
                    tags: ['Friends'],
                    summary: 'Входящие запросы в друзья',
                    responses: {
                        200: { description: 'Список запросов', content: { 'application/json': { schema: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, from_username: { type: 'string' }, from_avatar: { type: 'string' } } } } } } },
                    },
                },
            },

            '/friends/request/{userId}': {
                post: {
                    tags: ['Friends'],
                    summary: 'Отправить запрос в друзья',
                    parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'integer' } }],
                    responses: {
                        200: { description: 'Запрос отправлен', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                        400: { description: 'Ошибка', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
            },

            '/friends/accept/{userId}': {
                post: {
                    tags: ['Friends'],
                    summary: 'Принять запрос в друзья',
                    parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'integer' } }],
                    responses: {
                        200: { description: 'Дружба подтверждена', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    },
                },
            },

            '/friends/remove/{userId}': {
                delete: {
                    tags: ['Friends'],
                    summary: 'Удалить друга или отклонить запрос',
                    parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'integer' } }],
                    responses: {
                        200: { description: 'Удалено', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    },
                },
            },

            '/user/{username}/profile': {
                get: {
                    tags: ['Profile'],
                    summary: 'Публичный профиль игрока по username',
                    security: [],
                    parameters: [{ name: 'username', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: {
                        200: {
                            description: 'Профиль игрока',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            username: { type: 'string' },
                                            avatar: { type: 'string' },
                                            pvp: { type: 'object' },
                                            bot: { type: 'array', items: { type: 'object' } },
                                            achievements: { type: 'array', items: { $ref: '#/components/schemas/Achievement' } },
                                            history: { type: 'array', items: { $ref: '#/components/schemas/GameHistoryEntry' } },
                                            topCards: { type: 'array', items: { type: 'object' } },
                                        },
                                    },
                                },
                            },
                        },
                        404: { description: 'Пользователь не найден', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
            },

            '/announcements': {
                get: {
                    tags: ['Announcements'],
                    summary: 'Список активных объявлений',
                    security: [],
                    responses: {
                        200: { description: 'Объявления', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Announcement' } } } } },
                    },
                },
            },

            '/announcements/{id}/claim': {
                post: {
                    tags: ['Announcements'],
                    summary: 'Получить монеты за объявление',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    responses: {
                        200: { description: 'Монеты начислены или уже получены', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, coins: { type: 'integer' }, already_claimed: { type: 'boolean' } } } } } },
                        401: { description: 'Не авторизован', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
            },

            '/admin/users': {
                get: {
                    tags: ['Admin'],
                    summary: 'Список пользователей',
                    responses: {
                        200: { description: 'Список', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/User' } } } } },
                        403: { description: 'Нет прав', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
                post: {
                    tags: ['Admin'],
                    summary: 'Создать пользователя',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', required: ['username', 'password'], properties: { username: { type: 'string' }, password: { type: 'string' }, email: { type: 'string', nullable: true }, is_admin: { type: 'boolean' } } } } },
                    },
                    responses: {
                        200: { description: 'Создан', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    },
                },
            },

            '/admin/users/{id}': {
                put: {
                    tags: ['Admin'],
                    summary: 'Обновить пользователя',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', properties: { username: { type: 'string' }, password: { type: 'string', nullable: true }, email: { type: 'string', nullable: true }, is_admin: { type: 'boolean' } } } } },
                    },
                    responses: {
                        200: { description: 'Обновлён', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    },
                },
                delete: {
                    tags: ['Admin'],
                    summary: 'Удалить пользователя',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    responses: {
                        200: { description: 'Удалён', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    },
                },
            },

            '/admin/categories': {
                get: {
                    tags: ['Admin'],
                    summary: 'Список всех категорий (admin)',
                    responses: {
                        200: { description: 'Список', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Category' } } } } },
                    },
                },
                post: {
                    tags: ['Admin'],
                    summary: 'Создать категорию',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', required: ['key_name', 'display_name', 'emojis'], properties: { key_name: { type: 'string' }, display_name: { type: 'string' }, emojis: { type: 'string', description: 'Список эмодзи через запятую (18–32 штук)' } } } } },
                    },
                    responses: {
                        200: { description: 'Создана', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                        400: { description: 'Ключ занят или невалидные данные', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
            },

            '/admin/categories/{id}': {
                put: {
                    tags: ['Admin'],
                    summary: 'Обновить категорию',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { display_name: { type: 'string' }, emojis: { type: 'string' }, repr_emoji: { type: 'string' }, images: { type: 'array', items: { type: 'string', format: 'binary' } } } } } } },
                    responses: { 200: { description: 'Обновлена', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } } },
                },
                delete: {
                    tags: ['Admin'],
                    summary: 'Удалить категорию',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    responses: { 200: { description: 'Удалена', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } } },
                },
            },

            '/admin/custom-categories': {
                get: {
                    tags: ['Admin'],
                    summary: 'Предложенные пользователями категории на модерацию',
                    responses: {
                        200: { description: 'Список', content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } } },
                    },
                },
            },

            '/admin/custom-categories/{id}/approve': {
                post: {
                    tags: ['Admin'],
                    summary: 'Одобрить предложенную категорию',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    responses: { 200: { description: 'Одобрена', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } } },
                },
            },

            '/admin/custom-categories/{id}/reject': {
                post: {
                    tags: ['Admin'],
                    summary: 'Отклонить предложенную категорию',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                    responses: { 200: { description: 'Отклонена', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } } },
                },
            },

            '/admin/stats': {
                get: {
                    tags: ['Admin'],
                    summary: 'Статистика сервера (пользователи, игры, монеты)',
                    responses: {
                        200: {
                            description: 'Статистика',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            users: { type: 'integer' },
                                            games: { type: 'integer' },
                                            online: { type: 'integer' },
                                            total_coins: { type: 'integer' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },

            '/admin/coins/{userId}': {
                post: {
                    tags: ['Admin'],
                    summary: 'Выдать или списать монеты пользователю',
                    parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'integer' } }],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', required: ['amount'], properties: { amount: { type: 'integer', description: 'Положительное — начислить, отрицательное — списать' } } } } },
                    },
                    responses: {
                        200: { description: 'Баланс изменён', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, newBalance: { type: 'integer' } } } } } },
                    },
                },
            },

            '/admin/server-info': {
                post: {
                    tags: ['Admin'],
                    summary: 'Обновить информационное сообщение сервера',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', properties: { info: { type: 'string', nullable: true } } } } },
                    },
                    responses: { 200: { description: 'Обновлено', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } } },
                },
            },

            '/admin/announcements': {
                post: {
                    tags: ['Admin'],
                    summary: 'Создать объявление с монетами',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, coins_reward: { type: 'integer', default: 0 } } } } },
                    },
                    responses: { 200: { description: 'Создано', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } } },
                },
            },

            '/shop/items': {
                get: {
                    tags: ['Shop'],
                    summary: 'Список товаров магазина для текущего пользователя',
                    description: 'Возвращает все активные товары с флагами `owned` и `equipped` для авторизованного пользователя.',
                    responses: {
                        200: { description: 'Список товаров', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ShopItem' } } } } },
                        401: { description: 'Не авторизован', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
            },
            '/shop/my': {
                get: {
                    tags: ['Shop'],
                    summary: 'Активная косметика текущего пользователя',
                    description: 'Возвращает экипированные предметы по категориям: card_skin, board_bg, match_color, avatar_frame, title.',
                    responses: {
                        200: { description: 'Активная косметика', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserCosmetics' } } } },
                        401: { description: 'Не авторизован', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
            },
            '/shop/buy': {
                post: {
                    tags: ['Shop'],
                    summary: 'Купить товар',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', required: ['item_key'], properties: { item_key: { type: 'string', example: 'card_purple' } } } } },
                    },
                    responses: {
                        200: { description: 'Куплено', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, newBalance: { type: 'integer', example: 250 } } } } } },
                        400: { description: 'Ошибка (not_enough_coins, already_owned, item_free, item_not_found)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        401: { description: 'Не авторизован', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
            },
            '/shop/equip': {
                post: {
                    tags: ['Shop'],
                    summary: 'Надеть/экипировать предмет',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', required: ['item_key'], properties: { item_key: { type: 'string', example: 'frame_gold' } } } } },
                    },
                    responses: {
                        200: { description: 'Экипировано', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } },
                        400: { description: 'Ошибка (not_owned, item_not_found)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        401: { description: 'Не авторизован', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
            },
            '/admin/shop/items': {
                get: {
                    tags: ['Admin', 'Shop'],
                    summary: 'Все товары магазина (admin)',
                    responses: {
                        200: { description: 'Список всех товаров', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ShopItem' } } } } },
                        403: { description: 'Нет прав', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
                post: {
                    tags: ['Admin', 'Shop'],
                    summary: 'Создать товар (admin)',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/ShopItemCreate' } } },
                    },
                    responses: {
                        200: { description: 'Создан', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, id: { type: 'integer' } } } } } },
                        400: { description: 'Ошибка валидации', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
            },
            '/admin/shop/items/{key}': {
                put: {
                    tags: ['Admin', 'Shop'],
                    summary: 'Обновить товар (admin)',
                    parameters: [{ in: 'path', name: 'key', required: true, schema: { type: 'string' }, description: 'item_key товара' }],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/ShopItemUpdate' } } },
                    },
                    responses: {
                        200: { description: 'Обновлён', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                        500: { description: 'Ошибка БД', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
                delete: {
                    tags: ['Admin', 'Shop'],
                    summary: 'Удалить товар (admin)',
                    parameters: [{ in: 'path', name: 'key', required: true, schema: { type: 'string' }, description: 'item_key товара' }],
                    responses: {
                        200: { description: 'Удалён', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
                    },
                },
            },
            '/admin/upload-bg': {
                post: {
                    tags: ['Admin', 'Shop'],
                    summary: 'Загрузить изображение фона доски (admin)',
                    description: 'Принимает multipart/form-data с полем `image` (PNG/JPG/WebP ≤2MB). Возвращает URL для использования в preview_data.image_url.',
                    requestBody: {
                        required: true,
                        content: { 'multipart/form-data': { schema: { type: 'object', properties: { image: { type: 'string', format: 'binary' } } } } },
                    },
                    responses: {
                        200: { description: 'Загружено', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, url: { type: 'string', example: '/uploads/shop-bg/bg_1234567890.jpg' } } } } } },
                        400: { description: 'Нет файла или неверный тип', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                        403: { description: 'Нет прав', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                    },
                },
            },

            '/admin/hint-settings': {
                get: {
                    tags: ['Admin'],
                    summary: 'Получить настройки системы подсказок',
                    responses: { 200: { description: 'Настройки', content: { 'application/json': { schema: { type: 'object' } } } } },
                },
                post: {
                    tags: ['Admin'],
                    summary: 'Обновить настройки системы подсказок',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', properties: { hint_limit: { type: 'integer' }, hint_cost_reveal_one: { type: 'integer' }, hint_cost_reveal_pair: { type: 'integer' }, hint_cost_extra_turn: { type: 'integer' } } } } },
                    },
                    responses: { 200: { description: 'Обновлено', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } } },
                },
            },
        },
    },
    apis: [],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
