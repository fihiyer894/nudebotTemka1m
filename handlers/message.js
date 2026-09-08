// handlers/message.js
// Обрабатывает: /start, /admin, входящее фото, а также сообщение
// successful_payment (Telegram Stars) — зачисление происходит здесь,
// СТРОГО после подтверждённой оплаты и через идемпотентный creditPayment().

import { tg } from '../lib/telegram.js';
import { getUser, setPendingPhoto, processPayment } from '../lib/db.js';
import { getMainMenu, getAdminStats } from '../lib/helpers.js';
import { CONFIG } from '../lib/config.js';

export default async function (message) {
  const user = await getOrCreateUser(message.from);

  if (message.successful_payment) {
    await handleSuccessfulPayment(message, user);
    return;
  }

  if (message.text) {
    await handleText(message, user);
    return;
  }

  if (message.photo && message.photo.length > 0) {
    await handlePhoto(message, user);
    return;
  }
}

async function handleText(message, user) {
  const chatId = message.chat.id;
  const text = message.text.trim();

  if (text === '/start' || text === '/menu') {
    await sendMessage(chatId, mainMenuText(user), mainMenuKeyboard());
    return;
  }

  if (text === '/admin') {
    if (!CONFIG.adminIds.includes(message.from.id)) {
      await sendMessage(chatId, '⛔️ Команда доступна только администраторам.');
      return;
    }
    const stats = await getAdminStats();
    await sendMessage(chatId, adminStatsText(stats));
    return;
  }

  await sendMessage(
    chatId,
    'Пришлите фото, чтобы начать, или откройте меню командой /start.',
    mainMenuKeyboard()
  );
}

async function handlePhoto(message, user) {
  const chatId = message.chat.id;
  // Берём самое большое по разрешению фото (последнее в массиве превью).
  const bestPhoto = message.photo[message.photo.length - 1];
  await setPendingPhoto(message.from.id, bestPhoto.file_id);

  await sendMessage(
    chatId,
    [
      '📸 <b>Фото получено!</b>',
      '',
      `🎨 Доступно генераций: <b>${user.generations}</b>`,
      '',
      'Теперь выберите модель одежды из коллекции:',
    ].join('\n'),
    {
      inline_keyboard: [
        [{ text: '👗 Женская коллекция', callback_data: 'cat:women' }],
        [{ text: '‹ Главное меню', callback_data: 'menu:main' }],
      ],
    }
  );
}

async function handleSuccessfulPayment(message, user) {
  const chatId = message.chat.id;
  const payment = message.successful_payment;
  const packageId = payment.invoice_payload;
  const pkg = CONFIG.packages[packageId];

  if (!pkg) {
    await sendMessage(chatId, '⚠️ Не удалось определить купленный пакет. Обратитесь в поддержку.');
    return;
  }

  const credited = await creditPayment({
    telegramId: message.from.id,
    chargeId: payment.telegram_payment_charge_id,
    packageId,
    starsAmount: payment.total_amount,
    generationsAdded: pkg.generations,
  });

  if (!credited) {
    // Платёж с таким telegram_payment_charge_id уже был зачислен ранее —
    // это повторная доставка апдейта, повторно ничего не начисляем.
    return;
  }

  const newBalance = user.generations + pkg.generations;
  await sendMessage(
    chatId,
    [
      '✅ <b>Оплата прошла успешно!</b>',
      '',
      `💎 Куплено: ${pkg.generations} генераций`,
      `🔥 Текущий баланс: <b>${newBalance}</b> генераций`,
    ].join('\n'),
    backToMainKeyboard()
  );
}
