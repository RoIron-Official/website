#!/usr/bin/env node

/**
 * RoIron API Server v1.3.9
 * Поддерживает SQLite (тесты) и MySQL (продакшен)
 * С переменными окружения из .env
 */

require('dotenv').config();
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ============================================================
//  КОНФИГУРАЦИЯ ИЗ .ENV
// ============================================================

const CONFIG = {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development',
    dbType: process.env.DB_TYPE || 'sqlite',
    apiPrefix: process.env.API_PREFIX || '/api/v999',
    version: process.env.API_VERSION || '1.3.9',
    adminUserId: process.env.ADMIN_USER_ID || '499004729',
    cacheTtl: parseInt(process.env.CACHE_TTL) || 300000,
    maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
    maxUsersPerRequest: parseInt(process.env.MAX_USERS_PER_REQUEST) || 20,
    corsOrigin: process.env.CORS_ORIGIN || '*',
    logLevel: process.env.LOG_LEVEL || 'info',
    // GitHub
    githubToken: process.env.GITHUB_TOKEN,
    githubOwner: process.env.GITHUB_OWNER || 'RoIron-Official',
    githubRepo: process.env.GITHUB_REPO || 'roiron',
    githubBranch: process.env.GITHUB_BRANCH || 'main',
    // Discord
    discordWebhook: process.env.DISCORD_WEBHOOK_URL,
    // MySQL
    mysql: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'roiron',
        connectionLimit: 5,
        waitForConnections: true,
        queueLimit: 0,
        connectTimeout: 5000,
        acquireTimeout: 5000
    },
    // SQLite
    sqlite: {
        path: process.env.DB_PATH || './data/roiron.db'
    }
};

// ============================================================
//  БАЗА ДАННЫХ
// ============================================================

let pool = null;
let db = null;

async function initDatabase() {
    if (CONFIG.dbType === 'sqlite') {
        return initSQLite();
    } else {
        return initMySQL();
    }
}

async function initSQLite() {
    try {
        const sqlite3 = require('sqlite3').verbose();
        const dir = path.dirname(CONFIG.sqlite.path);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        db = new sqlite3.Database(CONFIG.sqlite.path);
        db.run('PRAGMA journal_mode = WAL');
        db.run('PRAGMA foreign_keys = ON');

        const queries = [
            `CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                roblox_id TEXT UNIQUE,
                username TEXT,
                secret_key TEXT UNIQUE,
                xp INTEGER DEFAULT 0,
                level INTEGER DEFAULT 1,
                playtime_minutes INTEGER DEFAULT 0,
                device_id TEXT,
                discord_id TEXT UNIQUE,
                discord_username TEXT,
                created_at INTEGER,
                last_active INTEGER,
                decoration TEXT DEFAULT 'none'
            )`,
            `CREATE TABLE IF NOT EXISTS licenses (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                created_at INTEGER,
                expires_at INTEGER,
                last_used INTEGER,
                device_id TEXT,
                is_active INTEGER DEFAULT 1
            )`,
            `CREATE TABLE IF NOT EXISTS active_sessions (
                user_id TEXT PRIMARY KEY,
                secret_key TEXT,
                activity_type TEXT DEFAULT 'online',
                game_id TEXT,
                game_name TEXT,
                last_ping INTEGER,
                session_start INTEGER,
                total_minutes INTEGER DEFAULT 0,
                xp_earned INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1
            )`,
            `CREATE TABLE IF NOT EXISTS user_activities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                activity_type TEXT,
                duration_minutes INTEGER,
                xp_earned INTEGER,
                created_at INTEGER
            )`,
            `CREATE TABLE IF NOT EXISTS custom_gamepasses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                pass_id TEXT NOT NULL,
                pass_name TEXT NOT NULL DEFAULT 'Gamepass',
                pass_description TEXT DEFAULT '',
                pass_price INTEGER DEFAULT 0,
                pass_icon_url TEXT DEFAULT '',
                created_at INTEGER NOT NULL
            )`
        ];

        for (const query of queries) {
            await new Promise((resolve, reject) => {
                db.run(query, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

        console.log('[SQLite] Инициализирован:', CONFIG.sqlite.path);
        return true;
    } catch (error) {
        console.error('[SQLite] Ошибка:', error.message);
        return false;
    }
}

async function initMySQL() {
    try {
        const mysql = require('mysql2/promise');
        pool = mysql.createPool({
            host: CONFIG.mysql.host,
            port: CONFIG.mysql.port,
            user: CONFIG.mysql.user,
            password: CONFIG.mysql.password,
            database: CONFIG.mysql.database,
            charset: 'utf8mb4',
            connectionLimit: CONFIG.mysql.connectionLimit,
            waitForConnections: CONFIG.mysql.waitForConnections,
            queueLimit: CONFIG.mysql.queueLimit,
            connectTimeout: CONFIG.mysql.connectTimeout,
            acquireTimeout: CONFIG.mysql.acquireTimeout
        });

        const conn = await pool.getConnection();
        console.log('[MySQL] Подключено к', CONFIG.mysql.host);
        conn.release();

        const queries = [
            `CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                roblox_id VARCHAR(255) UNIQUE,
                username VARCHAR(255),
                secret_key VARCHAR(255) UNIQUE,
                xp INT DEFAULT 0,
                level INT DEFAULT 1,
                playtime_minutes INT DEFAULT 0,
                device_id VARCHAR(255),
                discord_id VARCHAR(255) UNIQUE,
                discord_username VARCHAR(255),
                created_at INT,
                last_active INT,
                decoration VARCHAR(50) DEFAULT 'none'
            )`,
            `CREATE TABLE IF NOT EXISTS licenses (
                id VARCHAR(255) PRIMARY KEY,
                user_id VARCHAR(255),
                created_at INT,
                expires_at INT,
                last_used INT,
                device_id VARCHAR(255),
                is_active INT DEFAULT 1
            )`,
            `CREATE TABLE IF NOT EXISTS active_sessions (
                user_id VARCHAR(255) PRIMARY KEY,
                secret_key VARCHAR(255),
                activity_type VARCHAR(50) DEFAULT 'online',
                game_id VARCHAR(255),
                game_name VARCHAR(255),
                last_ping INT,
                session_start INT,
                total_minutes INT DEFAULT 0,
                xp_earned INT DEFAULT 0,
                is_active INT DEFAULT 1
            )`,
            `CREATE TABLE IF NOT EXISTS user_activities (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255),
                activity_type VARCHAR(50),
                duration_minutes INT,
                xp_earned INT,
                created_at INT
            )`,
            `CREATE TABLE IF NOT EXISTS custom_gamepasses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                pass_id VARCHAR(255) NOT NULL,
                pass_name VARCHAR(255) NOT NULL DEFAULT 'Gamepass',
                pass_description VARCHAR(500) DEFAULT '',
                pass_price INT DEFAULT 0,
                pass_icon_url VARCHAR(500) DEFAULT '',
                created_at INT NOT NULL,
                INDEX idx_user_id (user_id),
                UNIQUE KEY unique_user_pass (user_id, pass_id)
            )`
        ];

        for (const query of queries) {
            try {
                await pool.query(query);
            } catch (err) {
                console.error('[MySQL] Query error:', err.message);
            }
        }

        console.log('[MySQL] Таблицы созданы');
        return true;
    } catch (error) {
        console.error('[MySQL] Ошибка:', error.message);
        return false;
    }
}

// ============================================================
//  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

async function query(sql, params = []) {
    if (CONFIG.dbType === 'sqlite') {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    } else {
        const conn = await pool.getConnection();
        try {
            const [rows] = await conn.query(sql, params);
            return rows;
        } finally {
            conn.release();
        }
    }
}

async function queryOne(sql, params = []) {
    if (CONFIG.dbType === 'sqlite') {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    } else {
        const conn = await pool.getConnection();
        try {
            const [rows] = await conn.query(sql, params);
            return rows[0] || null;
        } finally {
            conn.release();
        }
    }
}

async function runQuery(sql, params = []) {
    if (CONFIG.dbType === 'sqlite') {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    } else {
        const conn = await pool.getConnection();
        try {
            const [result] = await conn.query(sql, params);
            return result;
        } finally {
            conn.release();
        }
    }
}

function isAdmin(userId) {
    return userId === CONFIG.adminUserId || userId === 'user_' + CONFIG.adminUserId;
}

function generateSecretKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = 'ROIRON-SECRET-';
    for (let i = 0; i < 32; i++) {
        key += chars[Math.floor(Math.random() * chars.length)];
        if (i === 7 || i === 15 || i === 23) key += '-';
    }
    return key;
}

function generateLicenseKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = 'ROIRON-';
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            key += chars[Math.floor(Math.random() * chars.length)];
        }
        if (i < 3) key += '-';
    }
    return key;
}

function getXpForLevel(level) {
    return Math.floor(100 * Math.pow(level, 1.5));
}

function calculateLevel(xp) {
    let level = 1;
    let requiredXp = getXpForLevel(level);
    while (xp >= requiredXp) {
        xp -= requiredXp;
        level++;
        requiredXp = getXpForLevel(level);
    }
    return { level, xpInLevel: xp, xpToNext: requiredXp };
}

function getXpForActivity(activityType, durationMinutes) {
    const rates = { 'playing': 2, 'studio': 3, 'idle': 0.5, 'online': 1 };
    return Math.floor((rates[activityType] || 1) * durationMinutes);
}

function parseDuration(input) {
    if (!input) return null;
    input = input.trim().toLowerCase();
    if (input === 'inf' || input === 'infinite' || input === '∞') return null;
    const match = input.match(/^(\d+)([dhms])$/);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2];
    switch (unit) {
        case 'd': return value * 86400;
        case 'h': return value * 3600;
        case 'm': return value * 60;
        case 's': return value;
        default: return null;
    }
}

function formatDuration(seconds) {
    if (!seconds) return 'infinite';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return days + 'd';
    if (hours > 0) return hours + 'h';
    if (minutes > 0) return minutes + 'm';
    return seconds + 's';
}

async function findUserByIdentifier(identifier) {
    if (!identifier) return null;
    let user = await queryOne('SELECT * FROM users WHERE id = ?', [identifier]);
    if (user) return user;
    user = await queryOne('SELECT * FROM users WHERE roblox_id = ?', [identifier]);
    if (user) return user;
    const cleanId = identifier.replace(/^user_/, '');
    user = await queryOne('SELECT * FROM users WHERE id = ?', ['user_' + cleanId]);
    if (user) return user;
    user = await queryOne('SELECT * FROM users WHERE roblox_id = ?', [cleanId]);
    if (user) return user;
    return null;
}

function jsonResponse(data, status = 200) {
    return {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': CONFIG.corsOrigin,
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-User-ID, Authorization'
        },
        body: JSON.stringify(data)
    };
}

// ============================================================
//  API ОБРАБОТЧИКИ
// ============================================================

async function handleUserExists(params) {
    try {
        const { robloxId } = params;
        if (!robloxId) return jsonResponse({ exists: false, error: 'robloxId is required' }, 400);
        const user = await findUserByIdentifier(robloxId);
        if (user) {
            return jsonResponse({
                exists: true,
                user: {
                    id: user.id,
                    robloxId: user.roblox_id,
                    username: user.username,
                    xp: user.xp || 0,
                    level: user.level || 1,
                    playtime_minutes: user.playtime_minutes || 0,
                    decoration: user.decoration || 'none'
                }
            });
        }
        return jsonResponse({ exists: false });
    } catch (error) {
        console.error('[handleUserExists] Error:', error.message);
        return jsonResponse({ exists: false, error: error.message }, 500);
    }
}

async function handleLicenseCheckByKey(body) {
    try {
        const { licenseKey } = body;
        if (!licenseKey) return jsonResponse({ valid: false, error: 'License key required' }, 400);
        const now = Math.floor(Date.now() / 1000);
        const rows = await query(
            'SELECT * FROM licenses WHERE id = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > ?)',
            [licenseKey, now]
        );
        if (rows.length > 0) {
            await runQuery('UPDATE licenses SET last_used = ? WHERE id = ?', [now, licenseKey]);
        }
        return jsonResponse({
            valid: rows.length > 0,
            userId: rows[0]?.user_id || null,
            expires_at: rows[0]?.expires_at || null
        });
    } catch (error) {
        console.error('[handleLicenseCheckByKey] Error:', error.message);
        return jsonResponse({ error: error.message }, 500);
    }
}

async function handleLicenseCheckByUserId(params) {
    try {
        const { userId } = params;
        if (!userId) return jsonResponse({ error: 'userId is required' }, 400);
        const now = Math.floor(Date.now() / 1000);
        const user = await findUserByIdentifier(userId);
        if (!user) return jsonResponse({ valid: false });
        const rows = await query(
            'SELECT expires_at, user_id FROM licenses WHERE user_id = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > ?)',
            [user.id, now]
        );
        return jsonResponse({
            valid: rows.length > 0,
            expires_at: rows[0]?.expires_at || null,
            userId: rows[0]?.user_id || null
        });
    } catch (error) {
        console.error('[handleLicenseCheckByUserId] Error:', error.message);
        return jsonResponse({ error: error.message }, 500);
    }
}

async function handleLicenseActivate(body) {
    try {
        const { licenseKey, deviceId, robloxId, username } = body;
        const now = Math.floor(Date.now() / 1000);
        const license = await queryOne(
            'SELECT * FROM licenses WHERE id = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > ?)',
            [licenseKey, now]
        );
        if (!license) {
            return jsonResponse({ success: false, error: 'Invalid or expired license' }, 400);
        }
        const userId = 'user_' + robloxId;
        const existingUser = await findUserByIdentifier(userId);
        if (!existingUser) {
            const secretKey = generateSecretKey();
            await runQuery(
                'INSERT INTO users (id, roblox_id, username, secret_key, xp, level, playtime_minutes, created_at, last_active, decoration) VALUES (?, ?, ?, ?, 0, 1, 0, ?, ?, ?)',
                [userId, robloxId, username, secretKey, now, now, 'none']
            );
        } else {
            await runQuery('UPDATE users SET username = ?, last_active = ? WHERE id = ?', [username, now, existingUser.id]);
        }
        await runQuery('UPDATE licenses SET user_id = ?, last_used = ?, device_id = ? WHERE id = ?', [userId, now, deviceId || null, licenseKey]);
        const user = await findUserByIdentifier(userId);
        return jsonResponse({
            success: true,
            secretKey: user?.secret_key || generateSecretKey(),
            expires_at: license.expires_at || null,
            xp: user?.xp || 0,
            level: user?.level || 1,
            playtime_minutes: user?.playtime_minutes || 0,
            decoration: user?.decoration || 'none'
        });
    } catch (error) {
        console.error('[handleLicenseActivate] Error:', error.message);
        return jsonResponse({ error: error.message }, 500);
    }
}

async function handleLoginWithKey(body) {
    try {
        const { secretKey, deviceId } = body;
        if (!secretKey) return jsonResponse({ error: 'secretKey is required' }, 400);
        const user = await queryOne(
            'SELECT id, roblox_id, username, xp, level, playtime_minutes, decoration FROM users WHERE secret_key = ?',
            [secretKey]
        );
        if (!user) return jsonResponse({ error: 'Invalid secret key' }, 404);
        const now = Math.floor(Date.now() / 1000);
        await runQuery('UPDATE users SET last_active = ?, device_id = ? WHERE id = ?', [now, deviceId || null, user.id]);
        return jsonResponse({
            success: true,
            userId: user.id,
            robloxId: user.roblox_id,
            username: user.username,
            xp: user.xp || 0,
            level: user.level || 1,
            playtime_minutes: user.playtime_minutes || 0,
            decoration: user.decoration || 'none'
        });
    } catch (error) {
        console.error('[handleLoginWithKey] Error:', error.message);
        return jsonResponse({ error: error.message }, 500);
    }
}

async function handleGetProfile(params) {
    try {
        const { secretKey } = params;
        if (!secretKey) return jsonResponse({ error: 'secretKey is required' }, 400);
        const user = await queryOne(
            'SELECT id, roblox_id, username, xp, level, playtime_minutes, created_at, last_active, decoration FROM users WHERE secret_key = ?',
            [secretKey]
        );
        if (!user) return jsonResponse({ error: 'Invalid secret key' }, 404);
        const { xpInLevel, xpToNext } = calculateLevel(user.xp || 0);
        return jsonResponse({
            success: true,
            profile: {
                ...user,
                xp_in_level: xpInLevel,
                xp_to_next: xpToNext,
                xp_progress: Math.round((xpInLevel / xpToNext) * 100)
            }
        });
    } catch (error) {
        console.error('[handleGetProfile] Error:', error.message);
        return jsonResponse({ error: error.message }, 500);
    }
}

async function handleAddXp(body) {
    try {
        const { secretKey, activity, durationMinutes } = body;
        if (!secretKey) return jsonResponse({ error: 'secretKey is required' }, 400);
        const user = await queryOne(
            'SELECT id, roblox_id, username, xp, level, playtime_minutes, decoration FROM users WHERE secret_key = ?',
            [secretKey]
        );
        if (!user) return jsonResponse({ error: 'User not found' }, 404);
        const xpGained = getXpForActivity(activity || 'online', durationMinutes || 1);
        const newXp = (user.xp || 0) + xpGained;
        const newPlaytime = (user.playtime_minutes || 0) + (durationMinutes || 1);
        const { level: newLevel, xpInLevel, xpToNext } = calculateLevel(newXp);
        const levelUp = newLevel > (user.level || 1);
        await runQuery(
            'UPDATE users SET xp = ?, level = ?, playtime_minutes = ?, last_active = ? WHERE secret_key = ?',
            [newXp, newLevel, newPlaytime, Math.floor(Date.now() / 1000), secretKey]
        );
        return jsonResponse({
            success: true,
            xp_gained: xpGained,
            total_xp: newXp,
            level: newLevel,
            xp_in_level: xpInLevel,
            xp_to_next: xpToNext,
            level_up: levelUp,
            playtime_minutes: newPlaytime
        });
    } catch (error) {
        console.error('[handleAddXp] Error:', error.message);
        return jsonResponse({ error: error.message }, 500);
    }
}

async function handleGetLeaderboard(params) {
    try {
        const category = params.category || 'xp';
        const limit = parseInt(params.limit) || 20;
        const offset = parseInt(params.offset) || 0;
        let orderBy = 'xp DESC';
        if (category === 'level') orderBy = 'level DESC, xp DESC';
        if (category === 'playtime') orderBy = 'playtime_minutes DESC';
        const rows = await query(
            `SELECT id, roblox_id, username, xp, level, playtime_minutes, decoration FROM users ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
            [limit, offset]
        );
        const count = await queryOne('SELECT COUNT(*) as total FROM users');
        return jsonResponse({
            success: true,
            category,
            total: count?.total || 0,
            limit,
            offset,
            users: rows
        });
    } catch (error) {
        console.error('[handleGetLeaderboard] Error:', error.message);
        return jsonResponse({ error: error.message }, 500);
    }
}

async function handlePingActivity(body) {
    try {
        const { userId, secretKey, activity, gameId, gameName } = body;
        if (!userId || !secretKey) return jsonResponse({ error: 'userId and secretKey required' }, 400);
        const now = Math.floor(Date.now() / 1000);
        const user = await findUserByIdentifier(userId);
        if (!user) return jsonResponse({ error: 'User not found' }, 404);
        const existingSession = await queryOne('SELECT * FROM active_sessions WHERE user_id = ?', [user.id]);
        let totalMinutes = 0;
        let xpEarned = 0;
        if (existingSession) {
            const minutesSinceLastPing = (now - existingSession.last_ping) / 60;
            if (minutesSinceLastPing > 1 && existingSession.is_active === 1) {
                const activityType = activity || existingSession.activity_type || 'online';
                const duration = Math.min(minutesSinceLastPing, 10);
                xpEarned = getXpForActivity(activityType, duration);
                totalMinutes = Math.floor(duration);
                if (xpEarned > 0) {
                    const newXp = (user.xp || 0) + xpEarned;
                    const { level: newLevel } = calculateLevel(newXp);
                    await runQuery(
                        'UPDATE users SET xp = ?, level = ?, playtime_minutes = playtime_minutes + ?, last_active = ? WHERE id = ?',
                        [newXp, newLevel, totalMinutes, now, user.id]
                    );
                    await runQuery(
                        'INSERT INTO user_activities (user_id, activity_type, duration_minutes, xp_earned, created_at) VALUES (?, ?, ?, ?, ?)',
                        [user.id, activityType, totalMinutes, xpEarned, now]
                    );
                }
            }
            await runQuery(
                `UPDATE active_sessions SET 
                    activity_type = ?, game_id = ?, game_name = ?, last_ping = ?, 
                    total_minutes = total_minutes + ?, xp_earned = xp_earned + ?, is_active = 1 
                WHERE user_id = ?`,
                [
                    activity || existingSession.activity_type || 'online',
                    gameId || existingSession.game_id,
                    gameName || existingSession.game_name,
                    now,
                    totalMinutes || 0,
                    xpEarned || 0,
                    user.id
                ]
            );
        } else {
            await runQuery(
                'INSERT INTO active_sessions (user_id, secret_key, activity_type, game_id, game_name, last_ping, session_start, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
                [user.id, secretKey, activity || 'online', gameId || null, gameName || null, now, now]
            );
        }
        const updatedUser = await findUserByIdentifier(user.id);
        return jsonResponse({
            success: true,
            xp_earned: xpEarned,
            total_xp: updatedUser?.xp || 0,
            level: updatedUser?.level || 1,
            playtime_minutes: updatedUser?.playtime_minutes || 0,
            decoration: updatedUser?.decoration || 'none',
            session_active: true
        });
    } catch (error) {
        console.error('[handlePingActivity] Error:', error.message);
        return jsonResponse({ error: error.message }, 500);
    }
}

async function handleEndSession(body) {
    try {
        const { userId } = body;
        if (!userId) return jsonResponse({ error: 'userId required' }, 400);
        const user = await findUserByIdentifier(userId);
        if (!user) return jsonResponse({ error: 'User not found' }, 404);
        const session = await queryOne('SELECT * FROM active_sessions WHERE user_id = ?', [user.id]);
        if (session && session.is_active === 1) {
            const now = Math.floor(Date.now() / 1000);
            const minutesSinceLastPing = (now - session.last_ping) / 60;
            if (minutesSinceLastPing > 1) {
                const duration = Math.min(minutesSinceLastPing, 10);
                const xpEarned = getXpForActivity(session.activity_type || 'online', duration);
                if (xpEarned > 0) {
                    const newXp = (user.xp || 0) + xpEarned;
                    const { level: newLevel } = calculateLevel(newXp);
                    await runQuery(
                        'UPDATE users SET xp = ?, level = ?, playtime_minutes = playtime_minutes + ?, last_active = ? WHERE id = ?',
                        [newXp, newLevel, Math.floor(duration), now, user.id]
                    );
                }
            }
        }
        await runQuery('UPDATE active_sessions SET is_active = 0 WHERE user_id = ?', [user.id]);
        return jsonResponse({ success: true, message: 'Session ended' });
    } catch (error) {
        console.error('[handleEndSession] Error:', error.message);
        return jsonResponse({ error: error.message }, 500);
    }
}

async function handleGetSessionStatus(params) {
    try {
        const { userId } = params;
        if (!userId) return jsonResponse({ error: 'userId required' }, 400);
        const user = await findUserByIdentifier(userId);
        if (!user) {
            return jsonResponse({ success: true, is_active: false, message: 'User not found' });
        }
        const session = await queryOne('SELECT * FROM active_sessions WHERE user_id = ?', [user.id]);
        if (!session) {
            return jsonResponse({ success: true, is_active: false, message: 'No active session' });
        }
        const now = Math.floor(Date.now() / 1000);
        return jsonResponse({
            success: true,
            is_active: session.is_active === 1,
            activity_type: session.activity_type,
            game_id: session.game_id,
            game_name: session.game_name,
            total_minutes: session.total_minutes || 0,
            xp_earned: session.xp_earned || 0,
            last_ping_seconds_ago: Math.floor(now - session.last_ping)
        });
    } catch (error) {
        console.error('[handleGetSessionStatus] Error:', error.message);
        return jsonResponse({ error: error.message }, 500);
    }
}

async function handleGetUserDecoration(params) {
    try {
        const { userId } = params;
        if (!userId) return jsonResponse({ error: 'userId is required' }, 400);
        const user = await findUserByIdentifier(userId);
        if (!user) {
            return jsonResponse({ success: true, decoration: 'none', exists: false });
        }
        return jsonResponse({ success: true, decoration: user.decoration || 'none', exists: true });
    } catch (error) {
        console.error('[handleGetUserDecoration] Error:', error.message);
        return jsonResponse({ error: error.message }, 500);
    }
}

async function handleSetUserDecoration(body) {
    try {
        const { userId, decoration } = body;
        if (!userId || !decoration) return jsonResponse({ error: 'userId and decoration are required' }, 400);
        const validDecorations = ['none', 'glow', 'fire', 'rainbow', 'galaxy', 'diamond'];
        if (!validDecorations.includes(decoration)) {
            return jsonResponse({ error: 'Invalid decoration' }, 400);
        }
        const user = await findUserByIdentifier(userId);
        if (!user) return jsonResponse({ error: 'User not found' }, 404);
        await runQuery('UPDATE users SET decoration = ? WHERE id = ?', [decoration, user.id]);
        return jsonResponse({ success: true, decoration: decoration, message: 'Decoration updated successfully' });
    } catch (error) {
        console.error('[handleSetUserDecoration] Error:', error.message);
        return jsonResponse({ error: error.message }, 500);
    }
}

async function handleGetFriendsCount(params) {
    try {
        const { userId } = params;
        if (!userId) return jsonResponse({ error: 'userId is required' }, 400);
        try {
            const response = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
            if (response.ok) {
                const data = await response.json();
                return jsonResponse({ success: true, count: data.count || 0 });
            }
        } catch (apiError) {
            console.warn('[Friends] API error:', apiError.message);
        }
        return jsonResponse({ success: true, count: 0 });
    } catch (error) {
        console.error('[handleGetFriendsCount] Error:', error.message);
        return jsonResponse({ error: error.message }, 500);
    }
}

// ============================================================
//  АДМИНСКИЕ ЭНДПОИНТЫ
// ============================================================

async function handleCreateLicense(body, headers) {
    try {
        const adminId = headers['x-user-id'] || 'free';
        if (!isAdmin(adminId)) return jsonResponse({ error: 'Unauthorized' }, 403);
        const { userId, duration } = body;
        const now = Math.floor(Date.now() / 1000);
        const seconds = parseDuration(duration || '365d');
        const expiresAt = seconds ? now + seconds : null;
        const licenseKey = generateLicenseKey();
        let targetUserId = userId;
        if (userId) {
            const user = await findUserByIdentifier(userId);
            if (!user) {
                const cleanRobloxId = userId.replace('user_', '');
                const secretKey = generateSecretKey();
                const newUserId = 'user_' + cleanRobloxId;
                await runQuery(
                    'INSERT INTO users (id, roblox_id, username, secret_key, xp, level, playtime_minutes, created_at, last_active, decoration) VALUES (?, ?, ?, ?, 0, 1, 0, ?, ?, ?)',
                    [newUserId, cleanRobloxId, 'User', secretKey, now, now, 'none']
                );
                targetUserId = newUserId;
            } else {
                targetUserId = user.id;
            }
        }
        await runQuery(
            'INSERT INTO licenses (id, user_id, created_at, expires_at, is_active) VALUES (?, ?, ?, ?, 1)',
            [licenseKey, targetUserId || null, now, expiresAt]
        );
        return jsonResponse({
            success: true,
            licenseKey,
            expires_at: expiresAt,
            duration: seconds ? formatDuration(seconds) : 'infinite',
            userId: targetUserId || null
        });
    } catch (error) {
        console.error('[handleCreateLicense] Error:', error.message);
        return jsonResponse({ error: error.message }, 500);
    }
}

async function handleListLicenses(headers) {
    try {
        const adminId = headers['x-user-id'] || 'free';
        if (!isAdmin(adminId)) return jsonResponse({ error: 'Unauthorized' }, 403);
        const rows = await query('SELECT * FROM licenses ORDER BY created_at DESC');
        return jsonResponse({ success: true, licenses: rows });
    } catch (error) {
        console.error('[handleListLicenses] Error:', error.message);
        return jsonResponse({ error: error.message }, 500);
    }
}

async function handleRevokeLicense(body, headers) {
    try {
        const adminId = headers['x-user-id'] || 'free';
        if (!isAdmin(adminId)) return jsonResponse({ error: 'Unauthorized' }, 403);
        const { licenseKey } = body;
        if (!licenseKey) return jsonResponse({ error: 'licenseKey is required' }, 400);
        await runQuery('UPDATE licenses SET is_active = 0 WHERE id = ?', [licenseKey]);
        return jsonResponse({ success: true, message: 'License revoked' });
    } catch (error) {
        console.error('[handleRevokeLicense] Error:', error.message);
        return jsonResponse({ error: error.message }, 500);
    }
}

async function handleDeleteLicense(body, headers) {
    try {
        const adminId = headers['x-user-id'] || 'free';
        if (!isAdmin(adminId)) return jsonResponse({ error: 'Unauthorized' }, 403);
        const { licenseKey } = body;
        if (!licenseKey) return jsonResponse({ error: 'licenseKey is required' }, 400);
        await runQuery('DELETE FROM licenses WHERE id = ?', [licenseKey]);
        return jsonResponse({ success: true, message: 'License deleted permanently' });
    } catch (error) {
        console.error('[handleDeleteLicense] Error:', error.message);
        return jsonResponse({ error: error.message }, 500);
    }
}

async function handleListUsers(headers) {
    try {
        const adminId = headers['x-user-id'] || 'free';
        if (!isAdmin(adminId)) return jsonResponse({ error: 'Unauthorized' }, 403);
        const rows = await query(
            'SELECT id, roblox_id, username, xp, level, playtime_minutes, created_at, last_active, decoration FROM users ORDER BY created_at DESC'
        );
        return jsonResponse({ success: true, users: rows });
    } catch (error) {
        console.error('[handleListUsers] Error:', error.message);
        return jsonResponse({ error: error.message }, 500);
    }
}

async function handleDeleteUser(body, headers) {
    try {
        const adminId = headers['x-user-id'] || 'free';
        if (!isAdmin(adminId)) return jsonResponse({ error: 'Unauthorized' }, 403);
        const { userId } = body;
        if (!userId) return jsonResponse({ error: 'userId is required' }, 400);
        const user = await findUserByIdentifier(userId);
        if (!user) return jsonResponse({ error: 'User not found' }, 404);
        await runQuery('DELETE FROM licenses WHERE user_id = ?', [user.id]);
        await runQuery('DELETE FROM active_sessions WHERE user_id = ?', [user.id]);
        await runQuery('DELETE FROM user_activities WHERE user_id = ?', [user.id]);
        await runQuery('DELETE FROM custom_gamepasses WHERE user_id = ?', [user.id]);
        await runQuery('DELETE FROM users WHERE id = ?', [user.id]);
        return jsonResponse({ success: true, message: 'User deleted permanently', userId: user.id });
    } catch (error) {
        console.error('[handleDeleteUser] Error:', error.message);
        return jsonResponse({ error: error.message }, 500);
    }
}

async function handleRecreateUser(body, headers) {
    try {
        const adminId = headers['x-user-id'] || 'free';
        if (!isAdmin(adminId)) return jsonResponse({ error: 'Unauthorized' }, 403);
        const { userId, username, duration } = body;
        if (!userId) return jsonResponse({ error: 'userId is required' }, 400);
        const now = Math.floor(Date.now() / 1000);
        const user = await findUserByIdentifier(userId);
        if (user) {
            await runQuery('DELETE FROM licenses WHERE user_id = ?', [user.id]);
            await runQuery('DELETE FROM active_sessions WHERE user_id = ?', [user.id]);
            await runQuery('DELETE FROM user_activities WHERE user_id = ?', [user.id]);
            await runQuery('DELETE FROM custom_gamepasses WHERE user_id = ?', [user.id]);
            await runQuery('DELETE FROM users WHERE id = ?', [user.id]);
        }
        const cleanRobloxId = userId.replace('user_', '');
        const secretKey = generateSecretKey();
        const displayName = username || 'User';
        const newUserId = 'user_' + cleanRobloxId;
        await runQuery(
            'INSERT INTO users (id, roblox_id, username, secret_key, xp, level, playtime_minutes, created_at, last_active, decoration) VALUES (?, ?, ?, ?, 0, 1, 0, ?, ?, ?)',
            [newUserId, cleanRobloxId, displayName, secretKey, now, now, 'none']
        );
        const licenseKey = generateLicenseKey();
        const seconds = parseDuration(duration || '365d');
        const expiresAt = seconds ? now + seconds : null;
        await runQuery(
            'INSERT INTO licenses (id, user_id, created_at, expires_at, is_active) VALUES (?, ?, ?, ?, 1)',
            [licenseKey, newUserId, now, expiresAt]
        );
        return jsonResponse({
            success: true,
            message: 'User recreated successfully',
            userId: newUserId,
            username: displayName,
            licenseKey,
            secretKey,
            expires_at: expiresAt,
            duration: seconds ? formatDuration(seconds) : 'infinite'
        });
    } catch (error) {
        console.error('[handleRecreateUser] Error:', error.message);
        return jsonResponse({ error: error.message }, 500);
    }
}

// ============================================================
//  GITHUB / DISCORD ИНТЕГРАЦИЯ
// ============================================================

async function checkForNewVersion() {
    if (!CONFIG.githubToken) {
        console.log('[GitHub] Токен не настроен, пропускаем проверку');
        return null;
    }
    try {
        const response = await fetch(
            `https://api.github.com/repos/${CONFIG.githubOwner}/${CONFIG.githubRepo}/releases/latest`,
            {
                headers: {
                    'Authorization': `Bearer ${CONFIG.githubToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
        if (!response.ok) {
            console.warn('[GitHub] Ошибка получения релиза:', response.status);
            return null;
        }
        const data = await response.json();
        return {
            version: data.tag_name,
            name: data.name,
            body: data.body,
            published_at: data.published_at,
            url: data.html_url,
            assets: data.assets
        };
    } catch (error) {
        console.error('[GitHub] Ошибка:', error.message);
        return null;
    }
}

async function sendDiscordNotification(message) {
    if (!CONFIG.discordWebhook) {
        console.log('[Discord] Webhook не настроен');
        return;
    }
    try {
        const response = await fetch(CONFIG.discordWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: message,
                username: 'RoIron Bot',
                avatar_url: 'https://avatars.githubusercontent.com/u/roiron'
            })
        });
        if (response.ok) {
            console.log('[Discord] Уведомление отправлено');
        } else {
            console.warn('[Discord] Ошибка:', response.status);
        }
    } catch (error) {
        console.error('[Discord] Ошибка:', error.message);
    }
}

// ============================================================
//  ГЛАВНЫЙ РОУТЕР
// ============================================================

const API_PREFIX = CONFIG.apiPrefix;

async function handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    const method = req.method;

    res.setHeader('Access-Control-Allow-Origin', CONFIG.corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-ID, Authorization');

    if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (!path.startsWith(API_PREFIX)) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not Found', path }));
        return;
    }

    const routePath = path.slice(API_PREFIX.length);

    let body = {};
    if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
        try {
            const chunks = [];
            for await (const chunk of req) {
                chunks.push(chunk);
            }
            const data = Buffer.concat(chunks).toString();
            if (data) body = JSON.parse(data);
        } catch (e) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
            return;
        }
    }

    const params = {};
    for (const [key, value] of url.searchParams) {
        params[key] = value;
    }

    try {
        let result;

        // USER EXISTS
        if (routePath === '/user/exists' && method === 'GET') {
            result = await handleUserExists(params);
        }

        // LICENSE
        else if (routePath === '/license/check' && method === 'POST') {
            result = await handleLicenseCheckByKey(body);
        }
        else if (routePath === '/license/check' && method === 'GET') {
            result = await handleLicenseCheckByUserId(params);
        }
        else if (routePath === '/license/activate' && method === 'POST') {
            result = await handleLicenseActivate(body);
        }

        // USER
        else if (routePath === '/auth/login-key' && method === 'POST') {
            result = await handleLoginWithKey(body);
        }
        else if (routePath === '/auth/profile' && method === 'GET') {
            result = await handleGetProfile(params);
        }

        // XP
        else if (routePath === '/xp/add' && method === 'POST') {
            result = await handleAddXp(body);
        }
        else if (routePath === '/leaderboard' && method === 'GET') {
            result = await handleGetLeaderboard(params);
        }

        // ACTIVITY
        else if (routePath === '/activity/ping' && method === 'POST') {
            result = await handlePingActivity(body);
        }
        else if (routePath === '/activity/end' && method === 'POST') {
            result = await handleEndSession(body);
        }
        else if (routePath === '/activity/status' && method === 'GET') {
            result = await handleGetSessionStatus(params);
        }

        // DECORATIONS
        else if (routePath === '/user/decoration' && method === 'GET') {
            result = await handleGetUserDecoration(params);
        }
        else if (routePath === '/user/decoration' && method === 'POST') {
            result = await handleSetUserDecoration(body);
        }

        // FRIENDS
        else if (routePath === '/user/friends' && method === 'GET') {
            result = await handleGetFriendsCount(params);
        }

        // ADMIN
        else if (routePath === '/admin/create-license' && method === 'POST') {
            result = await handleCreateLicense(body, req.headers);
        }
        else if (routePath === '/admin/licenses' && method === 'GET') {
            result = await handleListLicenses(req.headers);
        }
        else if (routePath === '/admin/revoke-license' && method === 'POST') {
            result = await handleRevokeLicense(body, req.headers);
        }
        else if (routePath === '/admin/delete-license' && method === 'DELETE') {
            result = await handleDeleteLicense(body, req.headers);
        }
        else if (routePath === '/admin/users' && method === 'GET') {
            result = await handleListUsers(req.headers);
        }
        else if (routePath === '/admin/delete-user' && method === 'POST') {
            result = await handleDeleteUser(body, req.headers);
        }
        else if (routePath === '/admin/recreate-user' && method === 'POST') {
            result = await handleRecreateUser(body, req.headers);
        }

        // HEALTH
        else if (routePath === '/health' && method === 'GET') {
            result = jsonResponse({
                status: 'ok',
                service: 'RoIron API',
                version: CONFIG.version,
                env: CONFIG.env,
                host: CONFIG.host,
                port: CONFIG.port,
                db: CONFIG.dbType,
                github: !!CONFIG.githubToken,
                discord: !!CONFIG.discordWebhook
            });
        }

        // CHECK VERSION
        else if (routePath === '/version/check' && method === 'GET') {
            const release = await checkForNewVersion();
            if (release) {
                result = jsonResponse({
                    success: true,
                    current: CONFIG.version,
                    latest: release.version,
                    has_update: release.version !== CONFIG.version,
                    release: release
                });
            } else {
                result = jsonResponse({ success: false, error: 'Failed to check version' });
            }
        }

        // NOTIFY DISCORD
        else if (routePath === '/notify/discord' && method === 'POST') {
            const { message } = body;
            if (!message) {
                result = jsonResponse({ error: 'message is required' }, 400);
            } else {
                await sendDiscordNotification(message);
                result = jsonResponse({ success: true, message: 'Notification sent' });
            }
        }

        else {
            result = jsonResponse({ error: 'Not Found', path: routePath }, 404);
        }

        res.writeHead(result.status, result.headers);
        res.end(result.body);
    } catch (error) {
        console.error('[RoIron API] Error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
    }
}

// ============================================================
//  ЗАПУСК СЕРВЕРА
// ============================================================

async function main() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║         RoIron API v' + CONFIG.version.padEnd(34) + '║');
    console.log('║         Node.js + ' + (CONFIG.dbType === 'sqlite' ? 'SQLite (тест)' : 'MySQL (продакшен)').padEnd(20) + '║');
    console.log('║         Prefix: ' + API_PREFIX.padEnd(41) + '║');
    console.log('║         GitHub: ' + (CONFIG.githubToken ? '✅' : '❌').padEnd(42) + '║');
    console.log('║         Discord: ' + (CONFIG.discordWebhook ? '✅' : '❌').padEnd(41) + '║');
    console.log('╚══════════════════════════════════════════════════════════╝');

    const initialized = await initDatabase();
    if (!initialized) {
        console.error('[RoIron] Failed to initialize database');
        process.exit(1);
    }

    // Проверяем новую версию при старте
    if (CONFIG.githubToken) {
        const release = await checkForNewVersion();
        if (release && release.version !== CONFIG.version) {
            console.log(`\n📢 Новая версия доступна: ${release.version}`);
            console.log(`   ${release.url}`);
        }
    }

    const server = http.createServer(handleRequest);

    server.listen(CONFIG.port, CONFIG.host, () => {
        console.log(`\n✅ RoIron API запущен на http://${CONFIG.host}:${CONFIG.port}`);
        console.log(`📡 Префикс: ${API_PREFIX}`);
        console.log(`🗄️  База данных: ${CONFIG.dbType}`);
        console.log(`🌍 Окружение: ${CONFIG.env}`);
        console.log(`📦 Версия: ${CONFIG.version}`);
        console.log('\n📡 Основные эндпоинты:');
        console.log(`   GET  ${API_PREFIX}/health               - Health check`);
        console.log(`   GET  ${API_PREFIX}/user/exists          - Проверка пользователя`);
        console.log(`   GET  ${API_PREFIX}/user/friends         - Количество друзей`);
        console.log(`   POST ${API_PREFIX}/license/check        - Проверка лицензии`);
        console.log(`   POST ${API_PREFIX}/license/activate     - Активация лицензии`);
        console.log(`   POST ${API_PREFIX}/auth/login-key       - Вход по secretKey`);
        console.log(`   GET  ${API_PREFIX}/auth/profile         - Профиль пользователя`);
        console.log(`   POST ${API_PREFIX}/activity/ping        - Пинг активности`);
        console.log(`   GET  ${API_PREFIX}/version/check        - Проверка новой версии\n`);
        console.log('   🔒 Админские эндпоинты (X-User-ID: ' + CONFIG.adminUserId + ')');
        console.log(`   POST ${API_PREFIX}/admin/create-license - Создать лицензию`);
        console.log(`   GET  ${API_PREFIX}/admin/licenses       - Список лицензий`);
        console.log(`   POST ${API_PREFIX}/admin/delete-user    - Удалить пользователя\n`);
    });

    process.on('SIGINT', async () => {
        console.log('\n🛑 Остановка...');
        if (CONFIG.dbType === 'sqlite') {
            if (db) db.close();
        } else {
            if (pool) await pool.end();
        }
        server.close(() => process.exit(0));
    });
}

module.exports = { main };

if (require.main === module) {
    main().catch(console.error);
}
