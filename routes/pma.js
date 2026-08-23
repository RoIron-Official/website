/**
 * RoIron PMA (phpMyAdmin) Proxy
 * Database management interface with authentication
 * Supports MySQL + SQLite fallback
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// ============================================================
//  CONFIG — from .env
// ============================================================

const PMA_USERNAME = process.env.PMA_USERNAME || 'admin';
const PMA_PASSWORD = process.env.PMA_PASSWORD || 'roiron2026';
const PMA_SESSION_KEY = 'pma_authenticated';

const DB_TYPE = process.env.DB_TYPE || 'sqlite';
const DB_PATH = process.env.DB_PATH || './data/roiron.db';
const DB_HOST = process.env.DB_HOST || '91.99.159.222';
const DB_PORT = parseInt(process.env.DB_PORT) || 3306;
const DB_USER = process.env.DB_USER || 'u39133_Yf7KoVs04q';
const DB_PASSWORD = process.env.DB_PASSWORD || 'q1blE.Pj@y@2JDexzPO9QV.p';
const DB_NAME = process.env.DB_NAME || 's39133_roiron';

console.log('[PMA] Config:', { DB_TYPE, DB_HOST, DB_NAME });

// ============================================================
//  AUTH MIDDLEWARE
// ============================================================

function requirePmaAuth(req, res, next) {
  // Проверяем сессию
  if (req.session && req.session[PMA_SESSION_KEY] === true) {
    return next();
  }
  
  // Если запрос API — возвращаем 401
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ 
      success: false, 
      error: 'Unauthorized. Please login at /pma/login' 
    });
  }
  
  // Иначе редирект на логин
  res.redirect('/pma/login');
}

function redirectIfPmaAuth(req, res, next) {
  if (req.session && req.session[PMA_SESSION_KEY] === true) {
    return res.redirect('/pma');
  }
  next();
}

// ============================================================
//  DATABASE QUERY HELPERS
// ============================================================

async function getMySQLConnection() {
  try {
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      connectTimeout: 5000,
      timeout: 10000,
      enableKeepAlive: false
    });
    await conn.ping();
    console.log('[PMA] MySQL connected successfully');
    return conn;
  } catch (error) {
    console.error('[PMA] MySQL connection failed:', error.message);
    throw new Error(`MySQL connection failed: ${error.message}`);
  }
}

function getSQLiteConnection() {
  try {
    const sqlite3 = require('sqlite3').verbose();
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    console.log('[PMA] SQLite connected at:', DB_PATH);
    return new sqlite3.Database(DB_PATH);
  } catch (error) {
    console.error('[PMA] SQLite connection failed:', error.message);
    throw new Error(`SQLite connection failed: ${error.message}`);
  }
}

async function queryDatabase(sql, params = []) {
  let conn = null;
  
  try {
    // Try MySQL first
    console.log('[PMA] Query (MySQL):', sql.substring(0, 100));
    conn = await getMySQLConnection();
    const [rows] = await conn.execute(sql, params);
    await conn.end();
    console.log('[PMA] MySQL query success, rows:', rows.length);
    return { success: true, data: rows, db: 'mysql' };
  } catch (mysqlError) {
    // If MySQL fails, try SQLite
    console.log('[PMA] MySQL failed, falling back to SQLite:', mysqlError.message);
    try {
      const sqlite = getSQLiteConnection();
      return new Promise((resolve, reject) => {
        sqlite.all(sql, params, (err, rows) => {
          sqlite.close();
          if (err) {
            console.error('[PMA] SQLite query error:', err.message);
            reject(err);
          } else {
            console.log('[PMA] SQLite query success, rows:', rows.length);
            resolve({ success: true, data: rows, db: 'sqlite' });
          }
        });
      });
    } catch (sqliteError) {
      console.error('[PMA] SQLite failed:', sqliteError.message);
      return { 
        success: false, 
        error: `Both MySQL and SQLite failed. MySQL: ${mysqlError.message}, SQLite: ${sqliteError.message}` 
      };
    }
  }
}

async function getTableInfo() {
  try {
    let sql = 'SHOW TABLES';
    let result = await queryDatabase(sql);
    
    if (!result.success) {
      console.log('[PMA] MySQL SHOW TABLES failed, trying SQLite');
      result = await queryDatabase("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    }
    
    if (!result.success) {
      console.error('[PMA] getTableInfo failed:', result.error);
      return { success: false, error: result.error };
    }
    
    const tables = result.data.map(row => {
      if (result.db === 'mysql') {
        return Object.values(row)[0];
      } else {
        return row.name;
      }
    });
    
    console.log('[PMA] Found tables:', tables);
    
    const tableInfo = [];
    for (const table of tables) {
      try {
        const countResult = await queryDatabase(`SELECT COUNT(*) as count FROM ${table}`);
        const count = countResult.success ? countResult.data[0].count : 0;
        tableInfo.push({ name: table, rows: count });
      } catch (e) {
        console.error('[PMA] Failed to get count for table:', table, e.message);
        tableInfo.push({ name: table, rows: 0 });
      }
    }
    
    return { success: true, tables: tableInfo, db: result.db };
  } catch (error) {
    console.error('[PMA] getTableInfo error:', error);
    return { success: false, error: error.message };
  }
}

async function getTableData(table, limit = 100, offset = 0) {
  try {
    console.log('[PMA] getTableData:', table, 'limit:', limit, 'offset:', offset);
    
    const countResult = await queryDatabase(`SELECT COUNT(*) as count FROM ${table}`);
    const total = countResult.success ? countResult.data[0].count : 0;
    console.log('[PMA] Total rows in', table, ':', total);
    
    const dataResult = await queryDatabase(
      `SELECT * FROM ${table} LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    
    if (!dataResult.success) {
      console.error('[PMA] getTableData query failed:', dataResult.error);
      return { success: false, error: dataResult.error };
    }
    
    let columns = [];
    if (dataResult.data.length > 0) {
      columns = Object.keys(dataResult.data[0]);
    }
    
    console.log('[PMA] getTableData success, columns:', columns.length, 'rows:', dataResult.data.length);
    
    return {
      success: true,
      columns: columns,
      data: dataResult.data,
      total: total,
      limit: limit,
      offset: offset,
      db: dataResult.db
    };
  } catch (error) {
    console.error('[PMA] getTableData error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
//  ROUTES
// ============================================================

// PMA Login page
router.get('/login', redirectIfPmaAuth, (req, res) => {
  res.render('pma/login', {
    title: 'PMA Login - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear(),
    error: null
  });
});

// PMA Login POST
router.post('/login', redirectIfPmaAuth, (req, res) => {
  const { username, password } = req.body;
  
  console.log('[PMA] Login attempt:', username);
  
  if (username === PMA_USERNAME && password === PMA_PASSWORD) {
    req.session[PMA_SESSION_KEY] = true;
    req.session.pma_username = username;
    console.log('[PMA] Login successful for:', username);
    return res.redirect('/pma');
  }
  
  console.log('[PMA] Login failed for:', username);
  res.render('pma/login', {
    title: 'PMA Login - RoIron',
    version: '1.3.9',
    year: new Date().getFullYear(),
    error: 'Invalid username or password'
  });
});

// PMA Logout
router.get('/logout', requirePmaAuth, (req, res) => {
  req.session[PMA_SESSION_KEY] = false;
  delete req.session.pma_username;
  res.redirect('/pma/login');
});

// PMA Dashboard (main page)
router.get('/', requirePmaAuth, async (req, res) => {
  try {
    const tableInfo = await getTableInfo();
    
    res.render('pma/index', {
      title: 'PMA Database - RoIron',
      version: '1.3.9',
      year: new Date().getFullYear(),
      user: req.session || null,
      db_type: tableInfo.db || DB_TYPE,
      tables: tableInfo.success ? tableInfo.tables : [],
      error: tableInfo.success ? null : tableInfo.error,
      api_url: process.env.API_BASE || 'http://51.75.118.79:20031/api/v999'
    });
  } catch (error) {
    console.error('[PMA] Dashboard error:', error);
    res.render('pma/index', {
      title: 'PMA Database - RoIron',
      version: '1.3.9',
      year: new Date().getFullYear(),
      user: req.session || null,
      db_type: DB_TYPE,
      tables: [],
      error: error.message,
      api_url: process.env.API_BASE || 'http://51.75.118.79:20031/api/v999'
    });
  }
});

// PMA Table view
router.get('/table/:tableName', requirePmaAuth, async (req, res) => {
  const { tableName } = req.params;
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  
  try {
    const result = await getTableData(tableName, limit, offset);
    
    if (!result.success) {
      return res.render('pma/table', {
        title: `Table: ${tableName} - RoIron`,
        version: '1.3.9',
        year: new Date().getFullYear(),
        tableName: tableName,
        columns: [],
        data: [],
        total: 0,
        limit: limit,
        offset: offset,
        error: result.error,
        db_type: DB_TYPE
      });
    }
    
    res.render('pma/table', {
      title: `Table: ${tableName} - RoIron`,
      version: '1.3.9',
      year: new Date().getFullYear(),
      tableName: tableName,
      columns: result.columns,
      data: result.data,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      error: null,
      db_type: result.db || DB_TYPE
    });
  } catch (error) {
    console.error('[PMA] Table view error:', error);
    res.render('pma/table', {
      title: `Table: ${tableName} - RoIron`,
      version: '1.3.9',
      year: new Date().getFullYear(),
      tableName: tableName,
      columns: [],
      data: [],
      total: 0,
      limit: limit,
      offset: offset,
      error: error.message,
      db_type: DB_TYPE
    });
  }
});

// PMA API — Execute custom SQL
router.post('/api/query', requirePmaAuth, async (req, res) => {
  const { sql } = req.body;
  
  console.log('[PMA] API Query received:', sql);
  
  if (!sql) {
    return res.status(400).json({
      success: false,
      error: 'SQL query required'
    });
  }
  
  const lowerSql = sql.toLowerCase().trim();
  
  // Block dangerous operations
  const dangerous = ['drop database', 'drop table', 'truncate', 'alter table'];
  for (const op of dangerous) {
    if (lowerSql.includes(op)) {
      return res.status(400).json({
        success: false,
        error: `Blocked: ${op} operations are not allowed`
      });
    }
  }
  
  try {
    const result = await queryDatabase(sql);
    res.json(result);
  } catch (error) {
    console.error('[PMA] API Query error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PMA API — Get table info
router.get('/api/tables', requirePmaAuth, async (req, res) => {
  const result = await getTableInfo();
  res.json(result);
});

// PMA API — Get table data
router.get('/api/table/:tableName', requirePmaAuth, async (req, res) => {
  const { tableName } = req.params;
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  
  const result = await getTableData(tableName, limit, offset);
  res.json(result);
});

module.exports = router;
