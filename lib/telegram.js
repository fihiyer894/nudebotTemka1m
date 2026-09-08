// lib/telegram.js
// Переписано для Node.js (Render) с использованием стандартного fetch API

const BOT_TOKEN = process.env.BOT_TOKEN;

// Кастомная ошибка для совместимости со старым кодом
export class BotApiError extends Error {
  constructor(description) {
    super(description);
    this.name = 'BotApiError';
    this.description = description;
  }
}

// Универсальная функция для отправки любых запросов к Telegram API
async function callApi(method, payload = {}) {
  if (!BOT_TOKEN) {
    throw new Error('BOT_TOKEN не задан в переменных окружения (Environment Variables)!');
  }

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!data.ok) {
    throw new BotApiError(data.description);
  }
  return data.result;
}

const IGNORABLE_EDIT_ERRORS = ['message is not modified', 'message to edit not found'];

export async function safeEditMessageText(chatId, messageId, text, replyMarkup = undefined) {
  try {
    await callApi('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: replyMarkup,
    });
  } catch (error) {
    if (
      error instanceof BotApiError &&
      IGNORABLE_EDIT_ERRORS.some((needle) => (error.description || '').includes(needle))
    ) {
      return;
    }
    throw error;
  }
}

export async function safeDeleteMessage(chatId, messageId) {
  try {
    await callApi('deleteMessage', { chat_id: chatId, message_id: messageId });
  } catch (error) {
    if (error instanceof BotApiError) return;
    throw error;
  }
}

export async function sendMessage(chatId, text, replyMarkup = undefined) {
  return callApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
}

export async function sendPhotoByUrl(chatId, photoUrl, caption, replyMarkup = undefined) {
  return callApi('sendPhoto', {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
  });
}

// В стандартном Telegram API скачивание файла работает в 2 этапа
export async function downloadPhotoAsDataUri(fileId, mimeType = 'image/jpeg') {
  // 1. Получаем путь к файлу на серверах Telegram
  const fileInfo = await callApi('getFile', { file_id: fileId });
  const filePath = fileInfo.file_path;

  // 2. Скачиваем сам файл
  const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
  const response = await fetch(fileUrl);
  
  if (!response.ok) {
    throw new Error(`Не удалось скачать файл: ${response.statusText}`);
  }

  // 3. Конвертируем в base64 с помощью встроенного в Node.js модуля Buffer
  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  
  return `data:${mimeType};base64,${base64}`;
}

// Создаем умный объект `tg`, который заменяет собой старый `api` из sdk.
// Он проксирует любые вызовы (например, tg.answerPreCheckoutQuery) напрямую в callApi.
export const tg = new Proxy({}, {
  get(target, prop) {
    if (prop === 'safeEditMessageText') return safeEditMessageText;
    if (prop === 'safeDeleteMessage') return safeDeleteMessage;
    if (prop === 'sendMessage') return sendMessage;
    if (prop === 'sendPhotoByUrl') return sendPhotoByUrl;
    if (prop === 'downloadPhotoAsDataUri') return downloadPhotoAsDataUri;
    
    // Перехватываем любые другие методы API, которые вызывались в старом коде
    return async (payload) => callApi(prop, payload);
  }
});
