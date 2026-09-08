import http from 'http';
import handleMessage from './handlers/message.js';
import handleCallback from './handlers/callback_query.js';
import handlePreCheckoutQuery from './handlers/pre_checkout_query.js';

// 1. Минимальный HTTP-сервер, чтобы Render не закрывал процесс по таймауту портов
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running!');
}).listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// 2. Точка входа для обработки обновлений от Telegram (Webhook или Polling)
export async function processUpdate(update) {
  if (update.message) {
    await handleMessage(update);
  } else if (update.callback_query) {
    await handleCallback(update);
  } else if (update.pre_checkout_query) {
    await handlePreCheckoutQuery(update);
  }
}
