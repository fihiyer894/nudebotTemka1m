// schema.js
// Описание таблиц базы данных Telegram Serverless (SQLite).
// ВАЖНО: платформа работает без внешних ключей (PRAGMA foreign_keys = OFF),
// поэтому все связи между таблицами — это обычные INTEGER-колонки
// (telegram_id), а целостность данных обеспечивается в коде приложения
// (lib/db.js), а не на уровне БД.

import { table, integer, text, index, sql } from 'sdk/db';

// Пользователи бота: баланс генераций, состояние "ожидающего" фото и
// агрегированная статистика по каждому пользователю.
export const users = table(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    telegramId: integer('telegram_id').notNull().unique(),
    username: text('username'),
    firstName: text('first_name'),

    // Текущий баланс доступных генераций.
    generations: integer('generations').notNull().default(0),

    // Агрегаты — удобны для админ-статистики без пересчёта по всей таблице payments.
    totalPurchased: integer('total_purchased').notNull().default(0),
    totalUsed: integer('total_used').notNull().default(0),

    // file_id последнего присланного пользователем фото, ожидающего выбора модели одежды.
    pendingPhotoFileId: text('pending_photo_file_id'),

    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  },
  (t) => ({
    telegramIdx: index('idx_users_telegram_id').on(t.telegramId),
  })
);

// Платежи Telegram Stars. telegram_payment_charge_id уникален — это ключ
// идемпотентности, защищающий от повторного зачисления генераций при
// повторной доставке апдейта successful_payment.
export const payments = table(
  'payments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    chargeId: text('telegram_payment_charge_id').notNull().unique(),
    telegramId: integer('telegram_id').notNull(),
    packageId: text('package_id').notNull(),
    starsAmount: integer('stars_amount').notNull(),
    generationsAdded: integer('generations_added').notNull(),
    status: text('status').notNull().default('completed'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  },
  (t) => ({
    telegramIdx: index('idx_payments_telegram_id').on(t.telegramId),
  })
);

// История генераций (для показа пользователю и для админ-статистики).
export const generations = table(
  'generations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    telegramId: integer('telegram_id').notNull(),
    productId: text('product_id').notNull(),
    productName: text('product_name').notNull(),
    // 'processing' | 'success' | 'failed'
    status: text('status').notNull().default('processing'),
    resultUrl: text('result_url'),
    predictionId: text('prediction_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
  },
  (t) => ({
    telegramIdx: index('idx_generations_telegram_id').on(t.telegramId),
  })
);

// Технический лог для диагностики ошибок Replicate/таймаутов.
export const generationLogs = table(
  'generation_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    telegramId: integer('telegram_id').notNull(),
    predictionId: text('prediction_id'),
    productId: text('product_id'),
    // 'started' | 'succeeded' | 'failed' | 'timeout' | 'refunded'
    status: text('status').notNull(),
    error: text('error'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  },
  (t) => ({
    telegramIdx: index('idx_generation_logs_telegram_id').on(t.telegramId),
  })
);
