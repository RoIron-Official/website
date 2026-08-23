const express = require('express');
const path = require('path');
const session = require('express-session');
require('dotenv').config();

// ============================================================
//  CONFIG — Все переменные из .env
// ============================================================

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

const API_BASE = process.env.API_BASE || 'http://51.75.118.79:20031/api/v999';
const API_TIMEOUT = parseInt(process.env.API_TIMEOUT) || 30000;
const API_RETRY_COUNT = parseInt(process.env.API_RETRY_COUNT) || 3;

const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'ROIRON-ADMIN-SECRET-2024-SECURE-KEY-999';

const SESSION_SECRET = process.env.SESSION_SECRET || 'roiron-session-secret-2026';
const SESSION_MAX_AGE = process.env.SESSION_MAX_AGE || '30d';
const SESSION_RESAVE = process.env.SESSION_RESAVE === 'true';
const SESSION_SAVE_UNINITIALIZED = process.env.SESSION_SAVE_UNINITIALIZED === 'true';
const SESSION_COOKIE_SECURE = process.env.SESSION_COOKIE_SECURE === 'true';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const CACHE_TTL = parseInt(process.env.CACHE_TTL) || 300000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const ADMIN_USER_ID = process.env.ADMIN_USER_ID || '499004729';

// PMA config
const PMA_ENABLED = process.env.PMA_ENABLED !== 'false';

console.log('[Config] Environment loaded:');
console.log(`  NODE_ENV: ${NODE_ENV}`);
console.log(`  PORT: ${PORT}`);
console.log(`  API_BASE: ${API_BASE}`);
console.log(`  ADMIN_USER_ID: ${ADMIN_USER_ID}`);
console.log(`  PMA_ENABLED: ${PMA_ENABLED}`);

// ============================================================
//  APP
// ============================================================

const app = express();

// ============================================================
//  MIDDLEWARE
// ============================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: SESSION_SECRET,
  resave: SESSION_RESAVE,
  saveUninitialized: SESSION_SAVE_UNINITIALIZED,
  cookie: {
    secure: SESSION_COOKIE_SECURE,
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ============================================================
//  API ROUTES
// ============================================================

const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);
console.log('[API] Routes registered at /api');

// ============================================================
//  PMA ROUTES
// ============================================================

if (PMA_ENABLED) {
  const pmaRoutes = require('./routes/pma');
  app.use('/pma', pmaRoutes);
  console.log('[PMA] Routes registered at /pma');
} else {
  console.log('[PMA] Disabled (PMA_ENABLED=false)');
}

// ============================================================
//  MIDDLEWARE — AUTH
// ============================================================

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/login');
}

function redirectIfAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  next();
}

// ============================================================
//  API HELPERS
// ============================================================

async function fetchWithRetry(url, options, retries = API_RETRY_COUNT) {
  let lastError = null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError || new Error('All retries failed');
}

// ============================================================
//  API — DB STATS (использует /api/admin/users)
// ============================================================

app.get('/api/db/stats', async (req, res) => {
  try {
    console.log('[Stats] Fetching from API...');

    const [usersRes, licensesRes] = await Promise.all([
      fetchWithRetry(`${API_BASE}/admin/users`, {
        headers: { 'X-Admin-Key': ADMIN_SECRET_KEY }
      }).catch(() => ({ ok: false })),
      fetchWithRetry(`${API_BASE}/admin/licenses`, {
        headers: { 'X-Admin-Key': ADMIN_SECRET_KEY }
      }).catch(() => ({ ok: false }))
    ]);

    let users = [];
    let licenses = [];

    if (usersRes.ok) {
      const data = await usersRes.json();
      users = data.users || [];
      console.log('[Stats] Users loaded:', users.length);
    } else {
      console.log('[Stats] Users API failed, using fallback');
      users = [
        { id: 'user_499004729', username: 'Tima', xp: 1500, level: 15, playtime_minutes: 320, last_active: Math.floor(Date.now() / 1000) }
      ];
    }

    if (licensesRes.ok) {
      const data = await licensesRes.json();
      licenses = data.licenses || [];
      console.log('[Stats] Licenses loaded:', licenses.length);
    } else {
      console.log('[Stats] Licenses API failed, using fallback');
      licenses = [
        { id: 'ROIRON-A7K9-M3P5-X2R8', user_id: 'user_499004729', is_active: 1, expires_at: null, last_used: Math.floor(Date.now() / 1000) }
      ];
    }

    const now = Math.floor(Date.now() / 1000);
    const weekAgo = now - 7 * 24 * 60 * 60;
    const activeUsers = users.filter(u => (u.last_active || 0) > weekAgo);
    const activeLicenses = licenses.filter(l => l.is_active === 1);
    const totalXp = users.reduce((sum, u) => sum + (u.xp || 0), 0);
    const totalLevels = users.reduce((sum, u) => sum + (u.level || 1), 0);
    const avgLevel = users.length > 0 ? Math.round(totalLevels / users.length) : 0;
    const totalPlaytime = users.reduce((sum, u) => sum + Math.floor((u.playtime_minutes || 0) / 60), 0);

    const stats = {
      success: true,
      users: users.length,
      active_users: activeUsers.length,
      licenses: activeLicenses.length,
      total_xp: totalXp,
      avg_level: avgLevel,
      total_playtime: totalPlaytime,
      updated_at: Date.now(),
      raw_users: users.slice(0, 20),
      raw_licenses: licenses.slice(0, 20)
    };

    console.log('[Stats] Response:', stats.users, 'users,', stats.licenses, 'licenses');
    res.json(stats);

  } catch (error) {
    console.error('[Stats] Error:', error.message);
    res.json({
      success: true,
      users: 1,
      active_users: 1,
      licenses: 1,
      total_xp: 1500,
      avg_level: 15,
      total_playtime: 5,
      updated_at: Date.now(),
      raw_users: [
        { id: 'user_499004729', username: 'Tima', xp: 1500, level: 15, playtime_minutes: 320, last_active: Math.floor(Date.now() / 1000) }
      ],
      raw_licenses: [
        { id: 'ROIRON-A7K9-M3P5-X2R8', user_id: 'user_499004729', is_active: 1, expires_at: null, last_used: Math.floor(Date.now() / 1000) }
      ]
    });
  }
});

// ============================================================
//  API — LOGIN
// ============================================================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { secretKey } = req.body;

    if (!secretKey) {
      return res.status(400).json({
        success: false,
        error: 'Secret key required'
      });
    }

    console.log('[Login] Checking secret key...');

    const response = await fetchWithRetry(
      `${API_BASE}/auth/profile?secretKey=${encodeURIComponent(secretKey)}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_SECRET_KEY
        }
      }
    );

    const data = await response.json();

    if (data.success && data.profile) {
      req.session.userId = data.profile.id;
      req.session.robloxId = data.profile.roblox_id;
      req.session.username = data.profile.username || 'User';
      req.session.xp = data.profile.xp || 0;
      req.session.level = data.profile.level || 1;
      req.session.playtime = data.profile.playtime_minutes || 0;
      req.session.decoration = data.profile.decoration || 'none';
      req.session.secretKey = secretKey;

      return res.json({
        success: true,
        userId: data.profile.id,
        username: data.profile.username || 'User',
        xp: data.profile.xp || 0,
        level: data.profile.level || 1,
        playtime_minutes: data.profile.playtime_minutes || 0
      });
    } else {
      return res.status(401).json({
        success: false,
        error: data.error || 'Invalid secret key'
      });
    }
  } catch (error) {
    console.error('[Login] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message
    });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

app.get('/api/auth/session', (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({
      authenticated: true,
      userId: req.session.userId,
      username: req.session.username,
      xp: req.session.xp,
      level: req.session.level,
      playtime_minutes: req.session.playtime
    });
  }
  res.json({ authenticated: false });
});

// ============================================================
//  API — HEALTH
// ============================================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.3.9',
    api: API_BASE,
    node_env: NODE_ENV,
    timestamp: Date.now(),
    pma_enabled: PMA_ENABLED,
    api_routes: [
      '/api/health',
      '/api/user/profile',
      '/api/user/exists',
      '/api/user/decoration',
      '/api/user/activity',
      '/api/user/friends',
      '/api/license/check',
      '/api/license/activate',
      '/api/leaderboard',
      '/api/xp/add',
      '/api/admin/users',
      '/api/admin/licenses',
      '/api/admin/create-license',
      '/api/admin/revoke-license',
      '/api/admin/delete-license',
      '/api/admin/delete-user',
      '/api/admin/recreate-user',
      '/api/admin/process-activity',
      '/api/activity/ping',
      '/api/activity/end',
      '/api/activity/status',
      '/api/db/stats'
    ]
  });
});

// ============================================================
//  PAGES
// ============================================================

app.get('/', (req, res) => {
  res.render('index', {
    title: 'RoIron - Roblox Optimizer',
    version: '1.3.9',
    year: new Date().getFullYear(),
    user: req.session || null,
    api_url: API_BASE,
    pma_url: PMA_ENABLED ? '/pma' : null
  });
});

app.get('/features', (req, res) => {
  res.render('features', {
    title: 'Features - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear(),
    user: req.session || null,
    api_url: API_BASE
  });
});

app.get('/download', (req, res) => {
  res.render('download', {
    title: 'Download - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear(),
    user: req.session || null,
    api_url: API_BASE
  });
});

app.get('/docs', (req, res) => {
  res.render('docs', {
    title: 'Documentation - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear(),
    user: req.session || null,
    api_url: API_BASE
  });
});

app.get('/license', (req, res) => {
  res.render('license', {
    title: 'License - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear(),
    user: req.session || null,
    api_url: API_BASE
  });
});

app.get('/login', redirectIfAuth, (req, res) => {
  res.render('login', {
    title: 'Login - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear(),
    user: req.session || null,
    error: null,
    api_url: API_BASE
  });
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.render('dashboard', {
    title: 'Dashboard - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear(),
    user: req.session,
    api_url: API_BASE
  });
});

app.get('/stats', (req, res) => {
  res.render('stats', {
    title: 'Database Stats - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear(),
    user: req.session || null,
    api_url: API_BASE
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    res.redirect('/login');
  });
});

// ============================================================
//  START
// ============================================================

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, HOST, () => {
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  RoIron Website — ${NODE_ENV.toUpperCase()}             ║`);
    console.log(`║  http://${HOST}:${PORT}                    ║`);
    console.log(`║  API: ${API_BASE}                           ║`);
    console.log(`║  API Proxy: /api/*                         ║`);
    console.log(`║  PMA: /pma (${PMA_ENABLED ? 'enabled' : 'disabled'}) ║`);
    console.log(`║  Status: /api/health                       ║`);
    console.log(`║  Admin ID: ${ADMIN_USER_ID}                 ║`);
    console.log(`╚══════════════════════════════════════════════╝\n`);
  });
}
