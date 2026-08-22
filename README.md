# RoIron API Server

Полноценный бэкенд для RoIron с поддержкой MySQL, SQLite, GitHub интеграцией и Discord уведомлениями.

## Быстрый старт

```bash
# Установка зависимостей
npm install

# Копируем .env
cp .env.example .env

# Запуск (SQLite по умолчанию)
npm start

# Запуск с MySQL
DB_TYPE=mysql npm start
```

## Переменные окружения (.env)

| Переменная ↕▾ | Описание ↕▾ | По умолчанию ↕▾ |
|---|---|---|
| −`PORT` | Порт сервера | 3000 |
| −`DB_TYPE` | Тип БД (sqlite/mysql) | sqlite |
| −`DB_HOST` | Хост MySQL | localhost |
| −`DB_USER` | Пользователь MySQL | root |
| −`DB_PASSWORD` | Пароль MySQL | - |
| −`DB_NAME` | Имя БД | roiron |
| −`GITHUB_TOKEN` | GitHub токен для проверки релизов | - |
| −`DISCORD_WEBHOOK_URL` | Discord webhook для уведомлений | - |
| −`ADMIN_USER_ID` | ID администратора | 499004729 |
⚙

## Эндпоинты API

### Публичные

- `GET /api/v999/health` — Проверка статуса
- `GET /api/v999/user/exists?robloxId=123` — Проверка существования пользователя
- `POST /api/v999/license/check` — Проверка лицензии
- `POST /api/v999/license/activate` — Активация лицензии
- `POST /api/v999/auth/login-key` — Вход по secretKey
- `GET /api/v999/auth/profile` — Профиль пользователя
- `POST /api/v999/activity/ping` — Пинг активности
- `GET /api/v999/leaderboard` — Таблица лидеров

### Админские (X-User-ID: ADMIN_USER_ID)

- `POST /api/v999/admin/create-license` — Создать лицензию
- `GET /api/v999/admin/licenses` — Список лицензий
- `POST /api/v999/admin/delete-user` — Удалить пользователя
- `POST /api/v999/admin/recreate-user` — Пересоздать пользователя

### Интеграция

- `GET /api/v999/version/check` — Проверка новой версии на GitHub
- `POST /api/v999/notify/discord` — Отправить уведомление в Discord

## Docker

```
# Сборка и запуск
docker-compose up -d

# Остановка
docker-compose down
```

## Структура БД

### users

- id, roblox_id, username, secret_key
- xp, level, playtime_minutes
- created_at, last_active, decoration

### licenses

- id, user_id, created_at, expires_at
- last_used, device_id, is_active

### active_sessions

- user_id, secret_key, activity_type
- game_id, game_name, last_ping
- total_minutes, xp_earned, is_active

