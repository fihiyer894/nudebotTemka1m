// lib/telegram.js
// Тонкая обёртка над `api` из платформенного SDK: безопасное редактирование
// сообщений (для анимации прогресса), отправка сообщений/фото и скачивание
// присланного пользователем фото в виде base64 data URI (без обращения к
// файловому URL и токену бота — этого не требует SDK, см. AGENTS.md).

import { api, BotApiError } from 'sdk';

const IGNORABLE_EDIT_ERRORS = ['message is not modified', 'message to edit not found'];

// Редактирование текста сообщения, игнорирующее безобидную ошибку
// "message is not modified" (например, если прогресс не изменился между
// двумя опросами Replicate).
export async function safeEditMessageText(chatId, messageId, text, replyMarkup = undefined) {
  try {
    await api.editMessageText({
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
    await api.deleteMessage({ chat_id: chatId, message_id: messageId });
  } catch (error) {
    if (error instanceof BotApiError) return;
    throw error;
  }
}

export async function sendMessage(chatId, text, replyMarkup = undefined) {
  return api.sendMessage({
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
}

export async function sendPhotoByUrl(chatId, photoUrl, caption, replyMarkup = undefined) {
  return api.sendPhoto({
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
  });
}

// Скачивает фото пользователя по file_id и кодирует его в base64 data URI —
// такой формат Replicate принимает напрямую в поле `input.image`.
export async function downloadPhotoAsDataUri(fileId, mimeType = 'image/jpeg') {
  const bytes = await api.getFileContent(fileId);
  return `data:${mimeType};base64,${encodeBase64(bytes)}`;
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Ручная реализация base64-кодирования Uint8Array без зависимости от
// глобальных btoa/Buffer, которых может не быть в изолированной V8-среде.
function encodeBase64(bytes) {
  let result = '';
  const len = bytes.length;

  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;

    result += BASE64_ALPHABET[b0 >> 2];
    result += BASE64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    result += i + 1 < len ? BASE64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? BASE64_ALPHABET[b2 & 0x3f] : '=';
  }

  return result;
}
