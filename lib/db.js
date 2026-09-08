// lib/db.js
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('./bot.db');

// Создание таблиц при запуске
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    pending_photo_file_id TEXT,
    generations INTEGER DEFAULT 1,
    total_used INTEGER DEFAULT 0,
    total_purchased INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    charge_id TEXT UNIQUE,
    telegram_id INTEGER,
    package_id TEXT,
    stars_amount INTEGER,
    generations_added INTEGER,
    status TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER,
    product_id TEXT,
    product_name TEXT,
    status TEXT,
    result_url TEXT,
    prediction_id TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    completed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS generation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER,
    product_id TEXT,
    status TEXT,
    error TEXT,
    prediction_id TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );
`);

function mapUserRow(row) {
  if (!row) return null;
  return {
    telegramId: row.telegram_id,
    username: row.username,
    firstName: row.first_name,
    pendingPhotoFileId: row.pending_photo_file_id,
    generations: row.generations,
    totalUsed: row.total_used,
    totalPurchased: row.total_purchased,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getOrCreateUser(from) {
  const telegramId = from.id;
  const username = from.username || null;
  const firstName = from.first_name || null;

  const stmt = db.prepare(`
    INSERT INTO users (telegram_id, username, first_name, updated_at)
    VALUES (?, ?, ?, unixepoch())
    ON CONFLICT(telegram_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name,
      updated_at = unixepoch()
  `);
  stmt.run(telegramId, username, firstName);

  return getUserByTelegramId(telegramId);
}

export async function getUserByTelegramId(telegramId) {
  const stmt = db.prepare('SELECT * FROM users WHERE telegram_id = ?');
  const row = stmt.get(telegramId);
  return mapUserRow(row);
}

export async function setPendingPhoto(telegramId, fileId) {
  const stmt = db.prepare(`
    UPDATE users 
    SET pending_photo_file_id = ?, updated_at = unixepoch() 
    WHERE telegram_id = ?
  `);
  stmt.run(fileId, telegramId);
}

export async function getPendingPhoto(telegramId) {
  const stmt = db.prepare('SELECT pending_photo_file_id FROM users WHERE telegram_id = ?');
  const row = stmt.get(telegramId);
  return row ? row.pending_photo_file_id : null;
}

export async function clearPendingPhoto(telegramId) {
  const stmt = db.prepare(`
    UPDATE users 
    SET pending_photo_file_id = NULL, updated_at = unixepoch() 
    WHERE telegram_id = ?
  `);
  stmt.run(telegramId);
}

export async function reserveGeneration(telegramId) {
  const stmt = db.prepare(`
    UPDATE users
    SET generations = generations - 1,
        total_used = total_used + 1,
        updated_at = unixepoch()
    WHERE telegram_id = ? AND generations > 0
  `);
  const res = stmt.run(telegramId);
  return res.changes > 0;
}

export async function refundGeneration(telegramId) {
  const stmt = db.prepare(`
    UPDATE users
    SET generations = generations + 1,
        total_used = total_used - 1,
        updated_at = unixepoch()
    WHERE telegram_id = ?
  `);
  stmt.run(telegramId);
}

export async function creditPayment({ telegramId, chargeId, packageId, starsAmount, generationsAdded }) {
  const checkStmt = db.prepare('SELECT id FROM payments WHERE charge_id = ?');
  const existing = checkStmt.get(chargeId);

  if (existing) {
    return false;
  }

  try {
    const insertStmt = db.prepare(`
      INSERT INTO payments (charge_id, telegram_id, package_id, stars_amount, generations_added, status)
      VALUES (?, ?, ?, ?, ?, 'completed')
    `);
    insertStmt.run(chargeId, telegramId, packageId, starsAmount, generationsAdded);
  } catch (error) {
    return false;
  }

  const updateStmt = db.prepare(`
    UPDATE users
    SET generations = generations + ?,
        total_purchased = total_purchased + ?,
        updated_at = unixepoch()
    WHERE telegram_id = ?
  `);
  updateStmt.run(generationsAdded, generationsAdded, telegramId);

  return true;
}

export async function getRecentPurchases(telegramId, limit = 5) {
  const stmt = db.prepare(`
    SELECT 
      id, 
      charge_id as chargeId, 
      telegram_id as telegramId, 
      package_id as packageId, 
      stars_amount as starsAmount, 
      generations_added as generationsAdded, 
      status, 
      created_at as createdAt 
    FROM payments 
    WHERE telegram_id = ? 
    ORDER BY created_at DESC 
    LIMIT ?
  `);
  return stmt.all(telegramId, limit);
}

export async function createGenerationRecord(telegramId, productId, productName) {
  const stmt = db.prepare(`
    INSERT INTO generations (telegram_id, product_id, product_name, status)
    VALUES (?, ?, ?, 'processing')
  `);
  const res = stmt.run(telegramId, productId, productName);

  const selectStmt = db.prepare(`
    SELECT 
      id, 
      telegram_id as telegramId, 
      product_id as productId, 
      product_name as productName, 
      status, 
      result_url as resultUrl, 
      prediction_id as predictionId, 
      created_at as createdAt 
    FROM generations 
    WHERE id = ?
  `);
  return selectStmt.get(res.lastInsertRowid);
}

export async function completeGenerationRecord(id, status, resultUrl, predictionId) {
  const stmt = db.prepare(`
    UPDATE generations
    SET status = ?, result_url = ?, prediction_id = ?, completed_at = unixepoch()
    WHERE id = ?
  `);
  stmt.run(status, resultUrl, predictionId, id);
}

export async function logGenerationEvent(telegramId, productId, status, error = null, predictionId = null) {
  const stmt = db.prepare(`
    INSERT INTO generation_logs (telegram_id, product_id, status, error, prediction_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(telegramId, productId, status, error, predictionId);
}

export async function getAdminStats() {
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const totalSuccess = db.prepare("SELECT COUNT(*) as count FROM generations WHERE status = 'success'").get().count;
  const totalFailed = db.prepare("SELECT COUNT(*) as count FROM generations WHERE status = 'failed'").get().count;

  const usedRow = db.prepare('SELECT COALESCE(SUM(total_used), 0) AS value FROM users').get();
  const soldRow = db.prepare("SELECT COALESCE(SUM(generations_added), 0) AS value FROM payments WHERE status = 'completed'").get();
  const starsRow = db.prepare("SELECT COALESCE(SUM(stars_amount), 0) AS value FROM payments WHERE status = 'completed'").get();

  return {
    totalUsers,
    totalGenerationsUsed: usedRow.value,
    totalGenerationsSold: soldRow.value,
    totalStarsEarned: starsRow.value,
    totalSuccessGenerations: totalSuccess,
    totalFailedGenerations: totalFailed,
  };
}
