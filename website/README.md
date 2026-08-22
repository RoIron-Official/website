# RoIron Website

Official website for RoIron — Roblox Optimizer.

## Features

- No emojis — all icons are SVG
- Login with secret key
- 30-day session persistence
- Dashboard showing user stats
- Automatic redirect after login

## Setup

```bash
npm install
npm start
```

## Deploy

Works with Vercel, Netlify, or any Node.js host.

```
vercel
```

## Environment

- Node.js 24.x required
- Uses express-session for authentication
- Session stored in memory (for production, use Redis or database)

```

