// handlers/callback_query.js
// Навигация по inline-меню, выставление счёта Stars и полный цикл
// генерации: резервирование баланса -> запрос к Replicate с анимацией
// прогресса -> отправка результата или возврат генерации при ошибке.

import { CONFIG } from '../lib/config.js';
import {
  getOrCreateUser,
  getPendingPhoto,
  reserveGeneration,
  refundGeneration,
  createGenerationRecord,
  completeGenerationRecord,
  logGenerationEvent,
  getRecentPurchases,
} from '../lib/db.js';
import { safeEditMessageText, downloadPhotoAsDataUri, sendPhotoByUrl } from '../lib/telegram.js';
import {
  mainMenuText,
  mainMenuKeyboard,
  tryMenuText,
  collectionsMenuKeyboard,
  categoryText,
  categoryKeyboard,
  buyMenuText,
  buyMenuKeyboard,
  purchasesText,
  backToMainKeyboard,
  progressText,
} from '../lib/helpers.js';
import { generateFashionPreview, GenerationError } from '../lib/replicate.js';
export default async function (callbackQuery) {
  const data = callbackQuery.data || '';
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const user = await getOrCreateUser(callbackQuery.from);

  try {
    if (data === 'menu:main') {
      await safeEditMessageText(chatId, messageId, mainMenuText(user), mainMenuKeyboard());
      await ack(callbackQuery.id);
      return;
    }

    if (data === 'menu:try' || data === 'menu:collections') {
      await safeEditMessageText(chatId, messageId, tryMenuText(), collectionsMenuKeyboard());
      await ack(callbackQuery.id);
      return;
    }

    if (data === 'menu:buy') {
      await safeEditMessageText(chatId, messageId, buyMenuText(), buyMenuKeyboard());
      await ack(callbackQuery.id);
      return;
    }

    if (data === 'menu:purchases') {
      const purchases = await getRecentPurchases(user.telegramId);
      await safeEditMessageText(chatId, messageId, purchasesText(purchases), backToMainKeyboard());
      await ack(callbackQuery.id);
      return;
    }

    if (data === 'cat:women' || data === 'cat:men') {
      const category = data.split(':')[1];
      await safeEditMessageText(chatId, messageId, categoryText(category), categoryKeyboard(category));
      await ack(callbackQuery.id);
      return;
    }

    if (data.startsWith('buy:')) {
      await handleBuy(callbackQuery, data.slice('buy:'.length));
      return;
    }

    if (data.startsWith('gen:')) {
      await handleGenerate(callbackQuery, user, data.slice('gen:'.length));
      return;
    }

    await ack(callbackQuery.id);
  } catch (error) {
    console.error(error);
    await ack(callbackQuery.id, 'Произошла ошибка. Попробуйте ещё раз.', true);
  }
}

async function ack(callbackQueryId, text, showAlert = false) {
  try {
    await api.answerCallbackQuery({ callback_query_id: callbackQueryId, text, show_alert: showAlert });
  } catch (error) {
    if (!(error instanceof BotApiError)) throw error;
  }
}

async function handleBuy(callbackQuery, packageId) {
  const pkg = CONFIG.packages[packageId];
  const chatId = callbackQuery.message.chat.id;

  if (!pkg) {
    await ack(callbackQuery.id, 'Пакет не найден', true);
    return;
  }

  await api.sendInvoice({
    chat_id: chatId,
    title: pkg.title,
    description: `Пакет из ${pkg.generations} генераций для AI Fashion Preview.`,
    payload: pkg.id,
    currency: 'XTR',
    prices: [{ label: pkg.title, amount: pkg.stars }],
  });

  await ack(callbackQuery.id);
}

async function handleGenerate(callbackQuery, user, productId) {
  const product = CONFIG.products[productId];
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;

  if (!product) {
    await ack(callbackQuery.id, 'Модель не найдена', true);
    return;
  }

  const photoFileId = await getPendingPhoto(user.telegramId);
  if (!photoFileId) {
    await ack(callbackQuery.id, 'Сначала пришлите своё фото 📸', true);
    return;
  }

  // Резервируем (списываем) генерацию ДО обращения к Replicate. Если запрос
  // упадёт по ошибке или таймауту — генерация будет возвращена в catch-блоке.
  const reserved = await reserveGeneration(user.telegramId);
  if (!reserved) {
    await ack(callbackQuery.id, 'Недостаточно генераций', true);
    await safeEditMessageText(
      chatId,
      messageId,
      '😔 У вас закончились генерации.\n\n💎 Пополните баланс, чтобы продолжить:',
      buyMenuKeyboard()
    );
    return;
  }

  await ack(callbackQuery.id);
  await safeEditMessageText(chatId, messageId, progressText(5));

  const record = await createGenerationRecord(user.telegramId, product.id, product.title);
  await logGenerationEvent(user.telegramId, product.id, 'started');

  try {
    const imageDataUri = await downloadPhotoAsDataUri(photoFileId);

    const { outputUrl, predictionId } = await generateFashionPreview(imageDataUri, product, async (percent) => {
      await safeEditMessageText(chatId, messageId, progressText(percent));
    });

    await completeGenerationRecord(record.id, 'success', outputUrl, predictionId);
    await logGenerationEvent(user.telegramId, product.id, 'succeeded', null, predictionId);

    await safeEditMessageText(chatId, messageId, progressText(100));
    await sendPhotoByUrl(
      chatId,
      outputUrl,
      `✨ Готово! Модель: <b>${product.title}</b>`,
      backToMainKeyboard()
    );
  } catch (error) {
    // Любая ошибка на этапе скачивания фото или обращения к Replicate —
    // генерация возвращается на баланс, ошибка пишется в generation_logs.
    await refundGeneration(user.telegramId);

    const predictionId = error instanceof GenerationError ? error.predictionId : null;
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';

    await completeGenerationRecord(record.id, 'failed', null, predictionId);
    await logGenerationEvent(user.telegramId, product.id, 'failed', errorMessage, predictionId);

    await safeEditMessageText(
      chatId,
      messageId,
      [
        '😕 Не получилось создать предпросмотр.',
        '',
        `Причина: ${errorMessage}`,
        '',
        '<i>Генерация возвращена на ваш баланс.</i>',
      ].join('\n'),
      backToMainKeyboard()
    );
  }
}
