const translations = {
    ru: {
        title_login: "вход", title_reg: "регистрация", ph_login: "Логин", ph_pass: "Пароль", ph_pass_conf: "Подтвердите пароль",
        ph_email: "Email (необязательно)", btn_login: "Войти", btn_reg: "Зарегистрироваться", btn_create_acc: "Создать аккаунт",
        btn_has_acc: "Уже есть аккаунт?", btn_forgot_pass: "Забыли пароль?", title_forgot: "восстановление",
        text_forgot_desc: "Введите email. Ссылка для восстановления будет сгенерирована.", btn_send: "Отправить",
        title_new_pass: "новый пароль", title_lobby: "лобби", btn_logout: "Выход", subtitle_new_game: "новая игра",
        ph_room_name: "Название комнаты", btn_create_room: "Создать", subtitle_leaders: "лидеры", subtitle_rooms: "комнаты",
        ph_search: "Поиск...", title_wait: "ожидание", text_wait: "Ждем второго игрока...", btn_cancel: "Отмена",
        turn: "ХОД", btn_exit_lobby: "Выйти в лобби", title_profile: "профиль", lbl_email: "Email:", ph_email_prof: "Укажите email",
        lbl_avatar: "Аватар (эмодзи):", lbl_pass: "Сменить пароль:", ph_new_pass: "Новый пароль", btn_save: "Сохранить",
        subtitle_fav_cards: "любимые карты", btn_close: "Закрыть", title_cats: "категории", title_users: "пользователи",
        subtitle_add_new: "добавить", ph_cat_key: "Ключ (напр. 'flags')", ph_cat_name: "Название (напр. 'Флаги')", ph_cat_emojis: "Вставьте ровно 18 эмодзи через запятую...",
        btn_add: "Добавить", title_game_over: "игра окончена", btn_back_lobby: "Вернуться в лобби", delete_category: "Удалить категорию",
        playing: "ИГРА ИДЕТ", waiting: "ОЖИДАНИЕ", spectate_btn: "смотреть 👀", join_btn: "войти 🎮",
        empty_rooms: "Комнаты не найдены", empty_leader: "Пока пусто", opponent_left: "Оппонент покинул игру",
        win: "победил", draw: "боевая ничья! 🤝", alert_title: "внимание", profile_theme: "Тема оформления:",
        theme_dark: "Тёмная (Metro Black)", theme_light: "Светлая (Metro White)", profile_lang: "Язык (Language):",
        lang_auto: "Автоматически", random_cat: "🎲 Случайная", all_cats: "💫 Все категории", wait_msg: "Ожидание...", btn_create_room_with_bot: "Играть с 🤖",
        boot_complexity: "Сложность", boot_complexity_easy: "🟢 Легкий", boot_complexity_medium: "🟡 Средний", boot_complexity_hard: "🔴 Сложный",
        set_admin: "Администратор", no_mail: "Нет email", new_password: "Новый пароль (оставьте пустым, если не меняете)",
        delete_user_permanently: "Удалить пользователя навсегда", login_and_password_are_required: "Логин и пароль обязательны", edit: "редактировать",
        not_authorized: "Не авторизован", no_rights: "Нет прав", hello: "Здравствуйте", requested_password_reset: "Вы запросили сброс пароля.",
        To_create_new_password: "Для создания нового пароля перейдите по ссылке:", reset_password: "Сбросить пароль",
        not_request_reset: "Если вы не запрашивали сброс, проигнорируйте это письмо.", error_sending_email: "Ошибка отправки письма",
        letter_has_been_sent: "Письмо отправлено", token_expired: "Токен недействителен или просрочен", saving_error: "Ошибка сохранения",
        exactly_18_emojis: "Должно быть ровно 18 эмодзи", key_exists: "Ключ существует", database_error: "Ошибка БД", error_deleting :"Ошибка удаления", 
        fill_in_your_login_and_password: "Заполните логин и пароль", login_is_busy: "Логин занят", server_error: "Ошибка сервера", login_busy_or_database_error: "Логин занят или ошибка БД",
        you_cant_delete_yourself: "Нельзя удалить себя", user_not_found: "Пользователь не найден", please_fill_in_the_required_fields: "Заполните обязательные поля", 
        login_error: "Ошибка входа", game_with_bot: "Игра с ИИ", bot: "Бот", room: "Комната", password_recovery: "Восстановление пароля",
        mail_subject: "Восстановление пароля", mail_hello: "Здравствуйте", mail_desc: "Вы запросили сброс пароля в игре Memory.", mail_link_text: "Для создания нового пароля перейдите по ссылке (действительна 1 час):",
        mail_btn: "Сбросить пароль", mail_ignore: "Если вы не запрашивали сброс, проигнорируйте это письмо.", waiting_second_player: "Ждем второго игрока...", lbl_grid_size: "Размер поля:",
        showing: "Показано", of: "из", prev: "Назад", next: "Вперёд", private_room: "🔒 Приватная комната"
    },
    en: {
        title_login: "login", title_reg: "register", ph_login: "Username", ph_pass: "Password", ph_pass_conf: "Confirm password",
        ph_email: "Email (optional)", btn_login: "Sign In", btn_reg: "Sign Up", btn_create_acc: "Create Account",
        btn_has_acc: "Already have an account?", btn_forgot_pass: "Forgot password?", title_forgot: "recovery",
        text_forgot_desc: "Enter email. A recovery link will be generated.", btn_send: "Send",
        title_new_pass: "new password", title_lobby: "lobby", btn_logout: "Logout", subtitle_new_game: "new game",
        ph_room_name: "Room name", btn_create_room: "Create", subtitle_leaders: "leaderboard", subtitle_rooms: "rooms",
        ph_search: "Search...", title_wait: "waiting", text_wait: "Waiting for second player...", btn_cancel: "Cancel",
        turn: "TURN", btn_exit_lobby: "Back to Lobby", title_profile: "profile", lbl_email: "Email:", ph_email_prof: "Enter email",
        lbl_avatar: "Avatar (emoji):", lbl_pass: "Change password:", ph_new_pass: "New password", btn_save: "Save",
        subtitle_fav_cards: "favorite cards", btn_close: "Close", title_cats: "categories", title_users: "users",
        subtitle_add_new: "add", ph_cat_key: "Key (e.g. 'flags')", ph_cat_name: "Name (e.g. 'Flags')", ph_cat_emojis: "Paste exactly 18 emojis separated by commas...",
        btn_add: "Add", title_game_over: "game over", btn_back_lobby: "Back to Lobby", delete_category: "Delete category",
        playing: "PLAYING", waiting: "WAITING", spectate_btn: "spectate 👀", join_btn: "join 🎮",
        empty_rooms: "No rooms found", empty_leader: "Empty", opponent_left: "Opponent left the game",
        win: "won", draw: "it's a draw! 🤝", alert_title: "attention", profile_theme: "Theme:",
        theme_dark: "Dark (Metro Black)", theme_light: "Light (Metro White)", profile_lang: "Language:",
        lang_auto: "Auto", random_cat: "🎲 Random", all_cats: "💫 All categories", wait_msg: "Waiting...", btn_create_room_with_bot: "Play 🤖",
        boot_complexity: "Complexity", boot_complexity_easy: "🟢 Easy", boot_complexity_medium: "🟡 Medium", boot_complexity_hard: "🔴 Hard",
        set_admin: "Administrator", no_mail: "No mail", new_password: "New password (leave blank if you don't change it)",
        delete_user_permanently: "Delete user permanently", login_and_password_are_required: "Login and password are required", edit: "edit",
        not_authorized: "Not authorized", no_rights: "No rights", hello: "Hello", requested_password_reset: "Password reset requested.",
        To_create_new_password: "Follow the link to create a new password:", reset_password: "Reset password",
        not_request_reset: "If you did not request a reset, please ignore this email.", error_sending_email: "Error sending email",
        letter_has_been_sent: "letter has been sent", token_expired: "Token is invalid or expired", saving_error: "Saving error",
        exactly_18_emojis: "There must be exactly 18 emojis", key_exists: "The key exists", database_error: "Database error", error_deleting :"Error deleting",
        fill_in_your_login_and_password: "Fill in your login and password", login_is_busy: "Login is busy", server_error: "Server error", login_busy_or_database_error: "Login busy or database error",
        you_cant_delete_yourself: "You can't delete yourself", user_not_found: "User not found", please_fill_in_the_required_fields: "Please fill in the required fields",
        login_error: "Login error", game_with_bot: "Game with bot", bot: "Bot", room: "Room", password_recovery: "Password recovery",
        mail_subject: "Password Recovery", mail_hello: "Hello", mail_desc: "You requested a password reset in Memory Game.", mail_link_text: "For creating a new password, follow the link (valid for 1 hour):",
        mail_btn: "Reset Password", mail_ignore: "If you did not request a reset, please ignore this email.", waiting_second_player: "We are waiting for the second player...", lbl_grid_size: "Grid Size:",
        showing: "Showing", of: "of", prev: "Prev", next: "Next", private_room: "🔒 Private room"
    }
};
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        translations,
        t: (key, lang = 'en') => translations[lang]?.[key] || translations['en'][key] || key
    };
} else {
    window.translations = translations;
    window.currentLang = 'en';

    window.t = function(key) {
        return window.translations[window.currentLang]?.[key] || window.translations['en'][key] || key;
    };

    window.applySettings = function(theme = 'dark', langPref = 'auto') {
        localStorage.setItem('appTheme', theme);

        // Язык
        if (langPref === 'auto' || !langPref) {
            window.currentLang = navigator.language.startsWith('ru') ? 'ru' : 'en';
        } else {
            window.currentLang = langPref;
        }

        // Тема
        const isLight = theme === 'light';
        document.body.classList.toggle('theme-light', isLight);
        if (isLight) {
            document.documentElement.classList.add('theme-light');
        } else {
            document.documentElement.classList.remove('theme-light');
        }

        // Переводы
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const trans = window.t(key);
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = trans;
            } else {
                el.textContent = trans;
            }
        });

        // Динамика
        if (typeof renderRooms === 'function') renderRooms();
        if (typeof updateLeaderboard === 'function') updateLeaderboard();
        if (typeof loadCategories === 'function') loadCategories();
    };

    // Запуск сразу после загрузки DOM
    document.addEventListener('DOMContentLoaded', () => {
        const langSelect = document.getElementById('profLang');
        if (langSelect) {
            const langNames = { ru: 'Русский', en: 'English' };
            langSelect.innerHTML = `<option value="auto" data-i18n="lang_auto">Auto</option>`;
            Object.keys(window.translations).forEach(lang => {
                langSelect.insertAdjacentHTML('beforeend', `<option value="${lang}">${langNames[lang] || lang}</option>`);
            });
        }

        // Применяем настройки сразу
        window.applySettings('dark', 'auto');
    });
}