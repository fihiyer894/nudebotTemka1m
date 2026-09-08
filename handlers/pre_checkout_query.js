// handlers/pre_checkout_query.js
// Подтверждение предварительного чека Telegram Stars. Здесь ничего не
// зачисляется — только проверка, что выбранный пакет всё ещё существует.
// Фактическое начисление генераций происходит в handlers/message.js,
// в обработчике successful_payment, после реального списания Stars.

import { tg } from '../lib/telegram.js';
import { CONFIG } from '../lib/config.js';

export default async function (preCheckoutQuery) {
  const packageId = preCheckoutQuery.invoice_payload;
  const pkg = CONFIG.packages[packageId];

  if (pkg) {
    await api.answerPreCheckoutQuery({
      pre_checkout_query_id: preCheckoutQuery.id,
      ok: true,
    });
  } else {
    await api.answerPreCheckoutQuery({
      pre_checkout_query_id: preCheckoutQuery.id,
      ok: false,
      error_message: 'Этот пакет больше недоступен. Откройте меню бота заново и выберите пакет ещё раз.',
    });
  }
}
