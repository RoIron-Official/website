const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const API_BASE = 'https://ri.servegame.net/api/v999';

// ============================================================
//  API — DB STATS
// ============================================================

app.get('/api/db/stats', async (req, res) => {
  try {
    const [usersRes, licensesRes, sessionsRes] = await Promise.all([
      fetch(`${API_BASE}/admin/users`, {
        headers: { 'X-User-ID': '499004729' }
      }).catch(() => ({ ok: false })),
      fetch(`${API_BASE}/admin/licenses`, {
        headers: { 'X-User-ID': '499004729' }
      }).catch(() => ({ ok: false })),
      fetch(`${API_BASE}/admin/sessions`, {
        headers: { 'X-User-ID': '499004729' }
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
    year: new Date().getFullYear()
  });
});

app.get('/features', (req, res) => {
  res.render('features', {
    title: 'Features - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear()
  });
});

app.get('/download', (req, res) => {
  res.render('download', {
    title: 'Download - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear()
  });
});

app.get('/docs', (req, res) => {
  res.render('docs', {
    title: 'Documentation - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear()
  });
});

app.get('/license', (req, res) => {
  res.render('license', {
    title: 'License - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear()
  });
});

app.get('/login', (req, res) => {
  res.render('login', {
    title: 'Login - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear()
  });
});

app.get('/dashboard', (req, res) => {
  res.render('dashboard', {
    title: 'Dashboard - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear()
  });
});

app.get('/stats', (req, res) => {
  res.render('stats', {
    title: 'Database Stats - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear()
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.3.9' });
});

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`✅ RoIron Website running on http://localhost:${PORT}`);
  });
}
