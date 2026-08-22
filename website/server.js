const express = require('express');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'roiron-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const API_BASE = 'http://51.75.118.79:20031/api/v999';

// ============================================================
//  MIDDLEWARE
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
//  API — AUTH
// ============================================================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { secretKey } = req.body;
    if (!secretKey) {
      return res.status(400).json({ success: false, error: 'Secret key required' });
    }

    const response = await fetch(`${API_BASE}/auth/profile?secretKey=${encodeURIComponent(secretKey)}`);
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
      error: 'Server error. Please try again.'
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
//  API — DB STATS
// ============================================================

app.get('/api/db/stats', async (req, res) => {
  try {
    const [usersRes, licensesRes, sessionsRes] = await Promise.all([
      fetch(`${API_BASE}/admin/users`, {
        headers: { 
          'X-Admin-Key': 'ROIRON-ADMIN-SECRET-2024-SECURE-KEY-999'
        }
      }).catch(() => ({ ok: false })),
      fetch(`${API_BASE}/admin/licenses`, {
        headers: { 
          'X-Admin-Key': 'ROIRON-ADMIN-SECRET-2024-SECURE-KEY-999'
        }
      }).catch(() => ({ ok: false })),
      fetch(`${API_BASE}/admin/sessions`, {
        headers: { 
          'X-Admin-Key': 'ROIRON-ADMIN-SECRET-2024-SECURE-KEY-999'
        }
      }).catch(() => ({ ok: false }))
    ]);

    let users = [], licenses = [], sessions = [];

    if (usersRes.ok) {
      const data = await usersRes.json();
      users = data.users || [];
    }

    if (licensesRes.ok) {
      const data = await licensesRes.json();
      licenses = data.licenses || [];
    }

    if (sessionsRes.ok) {
      const data = await sessionsRes.json();
      sessions = data.sessions || [];
    }

    const now = Math.floor(Date.now() / 1000);
    const weekAgo = now - 7 * 24 * 60 * 60;
    const activeUsers = users.filter(u => (u.last_active || 0) > weekAgo);
    const activeLicenses = licenses.filter(l => l.is_active === 1);
    const totalXp = users.reduce((sum, u) => sum + (u.xp || 0), 0);
    const totalLevels = users.reduce((sum, u) => sum + (u.level || 1), 0);
    const avgLevel = users.length > 0 ? Math.round(totalLevels / users.length) : 0;
    const totalPlaytime = users.reduce((sum, u) => sum + Math.floor((u.playtime_minutes || 0) / 60), 0);

    return res.json({
      success: true,
      users: users.length,
      active_users: activeUsers.length,
      licenses: activeLicenses.length,
      active_sessions: sessions.filter(s => s.is_active === 1).length,
      total_xp: totalXp,
      avg_level: avgLevel,
      total_playtime: totalPlaytime,
      updated_at: Date.now()
    });

  } catch (error) {
    console.error('[DB Stats] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
//  PAGES
// ============================================================

app.get('/', (req, res) => {
  res.render('index', {
    title: 'RoIron - Roblox Optimizer',
    version: '1.3.9',
    year: new Date().getFullYear(),
    user: req.session || null
  });
});

app.get('/features', (req, res) => {
  res.render('features', {
    title: 'Features - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear(),
    user: req.session || null
  });
});

app.get('/download', (req, res) => {
  res.render('download', {
    title: 'Download - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear(),
    user: req.session || null
  });
});

app.get('/docs', (req, res) => {
  res.render('docs', {
    title: 'Documentation - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear(),
    user: req.session || null
  });
});

app.get('/license', (req, res) => {
  res.render('license', {
    title: 'License - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear(),
    user: req.session || null
  });
});

app.get('/login', redirectIfAuth, (req, res) => {
  res.render('login', {
    title: 'Login - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear(),
    user: req.session || null,
    error: null
  });
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.render('dashboard', {
    title: 'Dashboard - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear(),
    user: req.session
  });
});

app.get('/stats', (req, res) => {
  res.render('stats', {
    title: 'Database Stats - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear(),
    user: req.session || null
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.3.9' });
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    res.redirect('/login');
  });
});

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`✅ RoIron Website running on http://localhost:${PORT}`);
  });
}
