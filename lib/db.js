// lib/db.js
// Слой доступа к данным: пользователи, резервирование/возврат генераций,
// идемпотентное зачисление платежей Stars, история и админ-статистика.
//
// Все обращения к `db` асинхронные — это требование платформы (см. AGENTS.md).

import { db } from 'sdk';
import { eq, and, gt, desc, sql } from 'sdk/db';
import { users, payments, generations, generationLogs } from 'schema';

// Возвращает пользователя, создавая запись при первом обращении.
// Обновляет username/first_name на случай, если пользователь их изменил.
export async function getOrCreateUser(from) {
  const telegramId = from.id;
  const username = from.username || null;
  const firstName = from.first_name || null;

  await db
    .insert(users)
    .values({ telegramId, username, firstName })
    .onConflictDoUpdate({
      target: users.telegramId,
      set: { username, firstName, updatedAt: sql`(unixepoch())` },
    })
    .run();

  return db.select().from(users).where(eq(users.telegramId, telegramId)).get();
}

export async function getUserByTelegramId(telegramId) {
  return db.select().from(users).where(eq(users.telegramId, telegramId)).get();
}

export async function setPendingPhoto(telegramId, fileId) {
  await db
    .update(users)
    .set({ pendingPhotoFileId: fileId, updatedAt: sql`(unixepoch())` })
    .where(eq(users.telegramId, telegramId))
    .run();
}

export async function getPendingPhoto(telegramId) {
  const row = await db
    .select({ pendingPhotoFileId: users.pendingPhotoFileId })
    .from(users)
    .where(eq(users.telegramId, telegramId))
    .get();
  return row ? row.pendingPhotoFileId : null;
}

export async function clearPendingPhoto(telegramId) {
  await db
    .update(users)
    .set({ pendingPhotoFileId: null, updatedAt: sql`(unixepoch())` })
    .where(eq(users.telegramId, telegramId))
    .run();
}

// Резервирование одной генерации перед запуском задачи в Replicate.
// Атомарно: списание проходит, только если баланс > 0 на момент UPDATE,
// поэтому гонка между параллельными апдейтами не уводит баланс в минус.
// Возвращает true, если генерация успешно зарезервирована.
export async function reserveGeneration(telegramId) {
  const result = await db
    .update(users)
    .set({
      generations: sql`${users.generations} - 1`,
      totalUsed: sql`${users.totalUsed} + 1`,
      updatedAt: sql`(unixepoch())`,
    })
    .where(and(eq(users.telegramId, telegramId), gt(users.generations, 0)))
    .run();

  return result.rowsAffected > 0;
}

// Возврат генерации на баланс при ошибке/таймауте на стороне Replicate.
export async function refundGeneration(telegramId) {
  await db
    .update(users)
    .set({
      generations: sql`${users.generations} + 1`,
      totalUsed: sql`${users.totalUsed} - 1`,
      updatedAt: sql`(unixepoch())`,
    })
    .where(eq(users.telegramId, telegramId))
    .run();
}

// Идемпотентное зачисление платежа Stars.
// Ключ идемпотентности — telegram_payment_charge_id (UNIQUE в схеме):
// если платёж с таким charge_id уже записан, зачисление не повторяется —
// это защищает от двойного начисления при повторной доставке апдейта
// successful_payment. Возвращает true, если зачисление произошло впервые.
export async function creditPayment({ telegramId, chargeId, packageId, starsAmount, generationsAdded }) {
  const existing = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.chargeId, chargeId))
    .get();

  if (existing) {
    return false;
  }

  try {
    await db
      .insert(payments)
      .values({
        chargeId,
        telegramId,
        packageId,
        starsAmount,
        generationsAdded,
        status: 'completed',
      })
      .run();
  } catch (error) {
    // Уникальный индекс на chargeId перехватит гонку при одновременной
    // повторной доставке того же апдейта — считаем это уже обработанным.
    return false;
  }

  await db
    .update(users)
    .set({
      generations: sql`${users.generations} + ${generationsAdded}`,
      totalPurchased: sql`${users.totalPurchased} + ${generationsAdded}`,
      updatedAt: sql`(unixepoch())`,
    })
    .where(eq(users.telegramId, telegramId))
    .run();

  return true;
}

export async function getRecentPurchases(telegramId, limit = 5) {
  return db
    .select()
    .from(payments)
    .where(eq(payments.telegramId, telegramId))
    .orderBy(desc(payments.createdAt))
    .limit(limit)
    .all();
}

export async function createGenerationRecord(telegramId, productId, productName) {
  const result = await db
    .insert(generations)
    .values({ telegramId, productId, productName, status: 'processing' })
    .returning()
    .run();
  return result.rows[0];
}

export async function completeGenerationRecord(id, status, resultUrl, predictionId) {
  await db
    .update(generations)
    .set({ status, resultUrl, predictionId, completedAt: sql`(unixepoch())` })
    .where(eq(generations.id, id))
    .run();
}

export async function logGenerationEvent(telegramId, productId, status, error = null, predictionId = null) {
  await db
    .insert(generationLogs)
    .values({ telegramId, productId, status, error, predictionId })
    .run();
}

// Статистика для команды /admin.
export async function getAdminStats() {
  const totalUsers = await db.$count(users);
  const totalSuccessGenerations = await db.$count(generations, eq(generations.status, 'success'));
  const totalFailedGenerations = await db.$count(generations, eq(generations.status, 'failed'));

  const usedRow = await db.get(sql`SELECT COALESCE(SUM(total_used), 0) AS value FROM users`);
  const soldRow = await db.get(
    sql`SELECT COALESCE(SUM(generations_added), 0) AS value FROM payments WHERE status = 'completed'`
  );
  const starsRow = await db.get(
    sql`SELECT COALESCE(SUM(stars_amount), 0) AS value FROM payments WHERE status = 'completed'`
  );

  return {
    totalUsers,
    totalGenerationsUsed: usedRow.value,
    totalGenerationsSold: soldRow.value,
    totalStarsEarned: starsRow.value,
    totalSuccessGenerations,
    totalFailedGenerations,
  };
}
