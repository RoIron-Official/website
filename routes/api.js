/**
 * RoIron API Routes
 * Прокси-запросы к основному серверу RoIron
 */

const express = require('express');
const router = express.Router();

// ============================================================
//  CONFIG
// ============================================================

const API_BASE = process.env.API_BASE || 'http://51.75.118.79:20031/api/v999';
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'ROIRON-ADMIN-SECRET-2024-SECURE-KEY-999';
const API_TIMEOUT = parseInt(process.env.API_TIMEOUT) || 30000;
const API_RETRY_COUNT = parseInt(process.env.API_RETRY_COUNT) || 3;

// ============================================================
//  HELPERS
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

function requireApiAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  if (apiKey === ADMIN_SECRET_KEY) {
    return next();
  }
  // Проверяем сессию PMA
  if (req.session && req.session.pma_authenticated) {
    return next();
  }
  res.status(401).json({ success: false, error: 'Unauthorized' });
}

// ============================================================
//  API ROUTES
// ============================================================

// Health check
router.get('/health', async (req, res) => {
  try {
    const response = await fetchWithRetry(`${API_BASE}/health`);
    const data = await response.json();
    res.json({
      success: true,
      server: data,
      proxy: 'RoIron Website API Proxy',
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      proxy: 'RoIron Website API Proxy',
      timestamp: Date.now()
    });
  }
});

// ============================================================
//  USER ENDPOINTS
// ============================================================

// Get user profile
router.get('/user/profile', requireApiAuth, async (req, res) => {
  const { userId, secretKey } = req.query;
  
  if (!userId && !secretKey) {
    return res.status(400).json({
      success: false,
      error: 'userId or secretKey required'
    });
  }
  
  try {
    let url = `${API_BASE}/auth/profile`;
    if (secretKey) {
      url += `?secretKey=${encodeURIComponent(secretKey)}`;
    }
    
    const response = await fetchWithRetry(url, {
      headers: {
        'X-Admin-Key': ADMIN_SECRET_KEY
      }
    });
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get user by Roblox ID
router.get('/user/exists', requireApiAuth, async (req, res) => {
  const { robloxId } = req.query;
  
  if (!robloxId) {
    return res.status(400).json({
      success: false,
      error: 'robloxId required'
    });
  }
  
  try {
    const response = await fetchWithRetry(
      `${API_BASE}/user/exists?userId=${robloxId}`,
      {
        headers: {
          'X-Admin-Key': ADMIN_SECRET_KEY,
          'X-User-ID': robloxId
        }
      }
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get user decoration
router.get('/user/decoration', requireApiAuth, async (req, res) => {
  const { userId } = req.query;
  
  if (!userId) {
    return res.status(400).json({
      success: false,
      error: 'userId required'
    });
  }
  
  try {
    const response = await fetchWithRetry(
      `${API_BASE}/user/decoration?userId=${encodeURIComponent(userId)}`,
      {
        headers: {
          'X-Admin-Key': ADMIN_SECRET_KEY
        }
      }
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Set user decoration
router.post('/user/decoration', requireApiAuth, async (req, res) => {
  const { userId, decoration } = req.body;
  
  if (!userId) {
    return res.status(400).json({
      success: false,
      error: 'userId required'
    });
  }
  
  try {
    const response = await fetchWithRetry(
      `${API_BASE}/user/decoration`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_SECRET_KEY
        },
        body: JSON.stringify({ userId, decoration: decoration || 'none' })
      }
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get user activity
router.get('/user/activity', requireApiAuth, async (req, res) => {
  const { userId } = req.query;
  
  if (!userId) {
    return res.status(400).json({
      success: false,
      error: 'userId required'
    });
  }
  
  try {
    const response = await fetchWithRetry(
      `${API_BASE}/user/activity?userId=${encodeURIComponent(userId)}`,
      {
        headers: {
          'X-Admin-Key': ADMIN_SECRET_KEY
        }
      }
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get friends count
router.get('/user/friends', requireApiAuth, async (req, res) => {
  const { userId } = req.query;
  
  if (!userId) {
    return res.status(400).json({
      success: false,
      error: 'userId required'
    });
  }
  
  try {
    const response = await fetchWithRetry(
      `${API_BASE}/user/friends?userId=${encodeURIComponent(userId)}`,
      {
        headers: {
          'X-Admin-Key': ADMIN_SECRET_KEY
        }
      }
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
//  LICENSE ENDPOINTS
// ============================================================

// Check license
router.post('/license/check', requireApiAuth, async (req, res) => {
  const { licenseKey } = req.body;
  
  if (!licenseKey) {
    return res.status(400).json({
      success: false,
      error: 'licenseKey required'
    });
  }
  
  try {
    const response = await fetchWithRetry(
      `${API_BASE}/license/check`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_SECRET_KEY
        },
        body: JSON.stringify({ licenseKey })
      }
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Activate license
router.post('/license/activate', requireApiAuth, async (req, res) => {
  const { licenseKey, robloxId, username, deviceId } = req.body;
  
  if (!licenseKey || !robloxId) {
    return res.status(400).json({
      success: false,
      error: 'licenseKey and robloxId required'
    });
  }
  
  try {
    const response = await fetchWithRetry(
      `${API_BASE}/license/activate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_SECRET_KEY
        },
        body: JSON.stringify({
          licenseKey,
          robloxId,
          username: username || 'User',
          deviceId: deviceId || 'web_pma'
        })
      }
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
//  LEADERBOARD
// ============================================================

router.get('/leaderboard', requireApiAuth, async (req, res) => {
  const { category, limit, offset } = req.query;
  
  try {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (limit) params.append('limit', limit);
    if (offset) params.append('offset', offset);
    
    const url = `${API_BASE}/leaderboard${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetchWithRetry(url, {
      headers: {
        'X-Admin-Key': ADMIN_SECRET_KEY
      }
    });
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
//  XP ENDPOINTS
// ============================================================

// Add XP
router.post('/xp/add', requireApiAuth, async (req, res) => {
  const { secretKey, activity, durationMinutes } = req.body;
  
  if (!secretKey) {
    return res.status(400).json({
      success: false,
      error: 'secretKey required'
    });
  }
  
  try {
    const response = await fetchWithRetry(
      `${API_BASE}/xp/add`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_SECRET_KEY
        },
        body: JSON.stringify({
          secretKey,
          activity: activity || 'online',
          durationMinutes: durationMinutes || 1
        })
      }
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
//  ADMIN ENDPOINTS
// ============================================================

// Admin: Create license
router.post('/admin/create-license', requireApiAuth, async (req, res) => {
  const { userId, duration } = req.body;
  
  try {
    const response = await fetchWithRetry(
      `${API_BASE}/admin/create-license`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_SECRET_KEY
        },
        body: JSON.stringify({
          userId: userId || null,
          duration: duration || '365d'
        })
      }
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Admin: List licenses
router.get('/admin/licenses', requireApiAuth, async (req, res) => {
  try {
    const response = await fetchWithRetry(
      `${API_BASE}/admin/licenses`,
      {
        headers: {
          'X-Admin-Key': ADMIN_SECRET_KEY
        }
      }
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Admin: Revoke license
router.post('/admin/revoke-license', requireApiAuth, async (req, res) => {
  const { licenseKey } = req.body;
  
  if (!licenseKey) {
    return res.status(400).json({
      success: false,
      error: 'licenseKey required'
    });
  }
  
  try {
    const response = await fetchWithRetry(
      `${API_BASE}/admin/revoke-license`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_SECRET_KEY
        },
        body: JSON.stringify({ licenseKey })
      }
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Admin: Delete license
router.delete('/admin/delete-license', requireApiAuth, async (req, res) => {
  const { licenseKey } = req.body;
  
  if (!licenseKey) {
    return res.status(400).json({
      success: false,
      error: 'licenseKey required'
    });
  }
  
  try {
    const response = await fetchWithRetry(
      `${API_BASE}/admin/delete-license`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_SECRET_KEY
        },
        body: JSON.stringify({ licenseKey })
      }
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Admin: List users
router.get('/admin/users', requireApiAuth, async (req, res) => {
  try {
    const response = await fetchWithRetry(
      `${API_BASE}/admin/users`,
      {
        headers: {
          'X-Admin-Key': ADMIN_SECRET_KEY
        }
      }
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Admin: Delete user
router.post('/admin/delete-user', requireApiAuth, async (req, res) => {
  const { userId } = req.body;
  
  if (!userId) {
    return res.status(400).json({
      success: false,
      error: 'userId required'
    });
  }
  
  try {
    const response = await fetchWithRetry(
      `${API_BASE}/admin/delete-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_SECRET_KEY
        },
        body: JSON.stringify({ userId })
      }
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Admin: Recreate user
router.post('/admin/recreate-user', requireApiAuth, async (req, res) => {
  const { userId, username, duration } = req.body;
  
  if (!userId) {
    return res.status(400).json({
      success: false,
      error: 'userId required'
    });
  }
  
  try {
    const response = await fetchWithRetry(
      `${API_BASE}/admin/recreate-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_SECRET_KEY
        },
        body: JSON.stringify({
          userId,
          username: username || 'User',
          duration: duration || '365d'
        })
      }
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Admin: Process activity
router.post('/admin/process-activity', requireApiAuth, async (req, res) => {
  try {
    const response = await fetchWithRetry(
      `${API_BASE}/admin/process-activity`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_SECRET_KEY
        },
        body: JSON.stringify({})
      }
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
//  ACTIVITY ENDPOINTS
// ============================================================

// Ping activity
router.post('/activity/ping', requireApiAuth, async (req, res) => {
  const { userId, secretKey, activity, gameId, gameName } = req.body;
  
  if (!userId || !secretKey) {
    return res.status(400).json({
      success: false,
      error: 'userId and secretKey required'
    });
  }
  
  try {
    const response = await fetchWithRetry(
      `${API_BASE}/activity/ping`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_SECRET_KEY
        },
        body: JSON.stringify({
          userId,
          secretKey,
          activity: activity || 'online',
          gameId: gameId || null,
          gameName: gameName || null
        })
      }
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// End session
router.post('/activity/end', requireApiAuth, async (req, res) => {
  const { userId } = req.body;
  
  if (!userId) {
    return res.status(400).json({
      success: false,
      error: 'userId required'
    });
  }
  
  try {
    const response = await fetchWithRetry(
      `${API_BASE}/activity/end`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_SECRET_KEY
        },
        body: JSON.stringify({ userId })
      }
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get session status
router.get('/activity/status', requireApiAuth, async (req, res) => {
  const { userId } = req.query;
  
  if (!userId) {
    return res.status(400).json({
      success: false,
      error: 'userId required'
    });
  }
  
  try {
    const response = await fetchWithRetry(
      `${API_BASE}/activity/status?userId=${encodeURIComponent(userId)}`,
      {
        headers: {
          'X-Admin-Key': ADMIN_SECRET_KEY
        }
      }
    );
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
