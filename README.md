# RoIron Website

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment variables
cp .env.example .env

# 3. Edit .env with your values (API URL, secret keys, etc.)

# 4. Start the server
npm start
```

## Environment Variables

All configuration is stored in `.env`. See `.env.example` for all available options.

| Variable ↕▾ | Description ↕▾ | Default ↕▾ |
|---|---|---|
| −`PORT` | Server port | `3000` |
| −`HOST` | Server host | `0.0.0.0` |
| −`NODE_ENV` | Environment | `development` |
| −`API_BASE` | RoIron API URL | `http://51.75.118.79:20031/api/v999` |
| −`ADMIN_SECRET_KEY` | Admin secret key | `ROIRON-ADMIN-SECRET-2024-SECURE-KEY-999` |
| −`SESSION_SECRET` | Session encryption key | *required* |
| −`ADMIN_USER_ID` | Admin Roblox ID | `499004729` |
| −`PMA_ENABLED` | Enable PMA interface | `true` |
| −`PMA_USERNAME` | PMA login username | `admin` |
| −`PMA_PASSWORD` | PMA login password | `roiron2026` |
⚙

## Features

- ✅ Centralized `.env` configuration
- ✅ Session-based authentication
- ✅ Dashboard with live stats
- ✅ Database statistics via API
- ✅ **PMA (phpMyAdmin-like) interface** at `/pma`
- ✅ View and manage database tables
- ✅ Custom SQL queries
- ✅ Dark theme
- ✅ Mobile responsive

## PMA (Database Manager)

Access the database management interface at `http://localhost:3000/pma`

- Login: `admin` / `roiron2026` (configurable via `.env`)
- View all tables with row counts
- Browse table data with pagination
- Run custom SQL queries (safe queries only)
- Supports both MySQL and SQLite

## Deployment

### Vercel

```
vercel
```

### Docker

```
docker build -t roiron-website .
docker run -p 3000:3000 roiron-website
```

## License

MIT

