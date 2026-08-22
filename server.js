const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ============================================================
//  API — DB STATS
// ============================================================

app.get('/api/db/stats', async (req, res) => {
  try {
    const [
      usersRes,
      licensesRes,
      sessionsRes,
      statsRes
    ] = await Promise.all([
      fetch('https://ri.servegame.net/api/v999/admin/users', {
        headers: { 'X-User-ID': '499004729' }
      }).catch(() => ({ ok: false })),
      fetch('https://ri.servegame.net/api/v999/admin/licenses', {
        headers: { 'X-User-ID': '499004729' }
      }).catch(() => ({ ok: false })),
      fetch('https://ri.servegame.net/api/v999/admin/sessions', {
        headers: { 'X-User-ID': '499004729' }
      }).catch(() => ({ ok: false })),
      fetch('https://ri.servegame.net/api/v999/admin/stats', {
        headers: { 'X-User-ID': '499004729' }
      }).catch(() => ({ ok: false }))
    ]);

    let users = [], licenses = [], sessions = [], stats = {};

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

    if (statsRes.ok) {
      stats = await statsRes.json();
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
      db_type: process.env.DB_TYPE || 'MySQL',
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
//  API — LOGIN
// ============================================================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { secretKey } = req.body;
    if (!secretKey) {
      return res.status(400).json({ success: false, error: 'Secret key required' });
    }

    const response = await fetch('https://ri.servegame.net/api/v999/auth/profile?secretKey=' + encodeURIComponent(secretKey));
    const data = await response.json();

    if (data.success && data.profile) {
      return res.json({
        success: true,
        userId: data.profile.id,
        username: data.profile.username || 'User',
        xp: data.profile.xp || 0,
        level: data.profile.level || 1,
        playtime_minutes: data.profile.playtime_minutes || 0,
        decoration: data.profile.decoration || 'none'
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

// Download route
app.get('/download/roiron.crx', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'downloads', 'roiron.crx');
  res.download(filePath, 'roiron.crx', (err) => {
    if (err) {
      res.status(404).send('File not found. Please check back later.');
    }
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.3.9' });
});

// For Vercel
if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`✅ RoIron Website running on http://localhost:${PORT}`);
  });
}
