// lib/helpers.js
// Тексты и inline-клавиатуры главного меню, каталога, покупок и
// админ-статистики. Никакой работы с БД или сетью — только представление.

import { CONFIG } from './config.js';

export function mainMenuText(user) {
  return [
    '🧵 <b>AI Fashion Preview</b>',
    '',
    `🎨 Доступно генераций: <b>${user.generations}</b>`,
    '',
    'Пришлите своё фото — и я покажу, как на вас будет смотреться выбранная модель одежды из каталога.',
  ].join('\n');
}

export function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '✨ Попробовать', callback_data: 'menu:try' }],
      [{ text: '💎 Купить генерации', callback_data: 'menu:buy' }],
    ],
  };
}

export function tryMenuText() {
  return '📸 Пришлите своё фото одним сообщением, а затем выберите коллекцию ниже:';
}

export function collectionsMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '👗 Женская коллекция', callback_data: 'cat:women' }],
      [{ text: '‹ Главное меню', callback_data: 'menu:main' }],
    ],
  };
}

export function categoryText(category) {
  return category === 'women'
    ? '👗 <b>Женская коллекция</b>\n\nВыберите модель, чтобы увидеть, как она будет на вас смотреться:'
    : '👗 <b>Коллекция одежды</b>\n\nВыберите модель:';
}

export function categoryKeyboard(category) {
  const rows = Object.values(CONFIG.products)
    .filter((product) => product.category === category)
    .map((product) => [{ text: product.title, callback_data: `gen:${product.id}` }]);

  rows.push([{ text: '‹ Назад', callback_data: 'menu:collections' }]);
  return { inline_keyboard: rows };
}

export function buyMenuText() {
  return '💎 <b>Пакеты генераций</b>\n\nВыберите пакет — оплата через Telegram Stars.';
}

export function buyMenuKeyboard() {
  const rows = Object.values(CONFIG.packages).map((pkg) => [
    { text: `${pkg.emoji} ${pkg.title} — ${pkg.stars} ⭐`, callback_data: `buy:${pkg.id}` },
  ]);
  rows.push([{ text: '‹ Назад', callback_data: 'menu:main' }]);
  return { inline_keyboard: rows };
}

export function purchasesText(purchases) {
  if (purchases.length === 0) {
    return '🧾 <b>Мои покупки</b>\n\nПокупок пока нет.';
  }

  const lines = purchases.map((purchase) => {
    const date =
      purchase.createdAt instanceof Date ? purchase.createdAt.toLocaleDateString('ru-RU') : '';
    return `• +${purchase.generationsAdded} генераций за ${purchase.starsAmount} ⭐ (${date})`;
  });

  return ['🧾 <b>Мои покупки</b>', '', ...lines].join('\n');
}

export function backToMainKeyboard() {
  return { inline_keyboard: [[{ text: '‹ Главное меню', callback_data: 'menu:main' }]] };
}

// Текст с прогресс-баром для анимации ожидания генерации.
export function progressText(percent) {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round(clamped / 10);
  const bar = '▓'.repeat(filled) + '░'.repeat(10 - filled);
  const label = clamped >= 100 ? 'Готово! ✅' : 'Создаю предпросмотр...';
  return `🪄 ${label}\n${bar}  ${clamped}%`;
}

export function adminStatsText(stats) {
  return [
    '📊 <b>Статистика бота</b>',
    '',
    `👥 Пользователей: <b>${stats.totalUsers}</b>`,
    `🎨 Генераций использовано: <b>${stats.totalGenerationsUsed}</b>`,
    `✅ Успешных генераций: <b>${stats.totalSuccessGenerations}</b>`,
    `⚠️ Неудачных генераций: <b>${stats.totalFailedGenerations}</b>`,
    `💎 Генераций продано: <b>${stats.totalGenerationsSold}</b>`,
    `⭐ Заработано Stars: <b>${stats.totalStarsEarned}</b>`,
  ].join('\n');
}
