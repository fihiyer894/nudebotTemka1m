# AGENTS.md — AI Fashion Preview Bot

Этот файл — ориентир для любого, кто (человек или AI-агент) будет дальше
дорабатывать этот проект. Здесь собраны платформенные ограничения и
внутренние соглашения, которые не всегда очевидны из самого кода.

## Платформа: Telegram Serverless (tgcloud)

- Код выполняется в изолированной среде Telegram, без Node.js, без файловой
  системы, без сети кроме `fetch` из SDK. **Никаких `npm install`** — весь
  доступный функционал ограничен модулем `sdk` (и `sdk/db` для работы с БД).
- Импорт модулей — **по короткому имени, без относительных путей и без
  расширения `.js`**: `import { CONFIG } from 'lib/config'`,
  `import { users } from 'schema'`, а не `'./lib/config.js'`.
- Каждый тип входящего Telegram-апдейта обрабатывается своим файлом-хендлером
  в `handlers/` с `export default async function (payload) { ... }`.
  В этом проекте задействованы:
  - `handlers/message.js` — текстовые сообщения, фото, `successful_payment`.
  - `handlers/callback_query.js` — нажатия на inline-кнопки.
  - `handlers/pre_checkout_query.js` — предподтверждение оплаты Stars.
  Если понадобится реагировать на другие типы апдейтов (например,
  `edited_message`), нужно добавить соответствующий файл в `handlers/`.
- Все обращения к `db` — **асинхронные** (`await db.select()...run()/.get()/.all()`),
  даже если под капотом SQLite.
- В базе данных **нет внешних ключей** — связи `telegram_id` между таблицами
  `users`, `payments`, `generations`, `generation_logs` обеспечиваются только
  в коде (`lib/db.js`), а не PRAGMA/constraint-ами БД.
- Секретов/переменных окружения для сторонних API на платформе нет — токен
  Replicate хранится прямо в `lib/config.js`. Держите репозиторий приватным.

## Деплой

```bash
npx tgcloud push      # выкладывает код бота
npx tgcloud migrate   # применяет схему schema.js к встроенной SQLite БД
```

`migrate` нужно запускать при **каждом** изменении `schema.js` (новая
таблица/колонка/индекс). `push` — при каждом изменении логики (`handlers/`,
`lib/`, `lib/config.js`).

## Ключевая бизнес-логика (не ломать при рефакторинге)

1. **Баланс генераций резервируется ДО вызова Replicate**
   (`reserveGeneration` в `lib/db.js`, вызывается из
   `handlers/callback_query.js → handleGenerate`). Если Replicate вернул
   ошибку/таймаут — баланс обязательно возвращается через
   `refundGeneration`, а причина фиксируется в `generation_logs`
   (`logGenerationEvent`). Любой новый путь генерации должен сохранять этот
   паттерн «резерв → успех/возврат».

2. **Идемпотентность оплаты Stars** держится на UNIQUE-колонке
   `payments.telegram_payment_charge_id`. Зачисление генераций происходит
   **только** в `handlers/message.js → handleSuccessfulPayment`, **только**
   после реального `successful_payment`, и **только** если
   `creditPayment()` вернул `true` (то есть платёж с этим charge_id ещё не
   был обработан). `pre_checkout_query` НИКОГДА не должен начислять баланс —
   это лишь подтверждение чека до списания Stars.

3. **Каталог одежды осознанно ограничен обычной верхней одеждой**
   (платья, пальто, куртки, деловые костюмы, стритвир) в `lib/config.js →
   products`. Не добавляйте в каталог нижнее бельё/купальники или другие
   интимные предметы одежды: бот редактирует реальные фотографии людей,
   присланные любым пользователем Telegram, без проверки, что на фото — сам
   отправитель и что он давал согласие на такую обработку. Каталог,
   ограниченный повседневной/деловой одеждой, снижает риск использования
   бота для создания компрометирующих изображений реальных людей без их
   согласия. Если расширяете каталог — придерживайтесь того же принципа.

4. **Промпт для Replicate** (`lib/replicate.js → buildPrompt`,
   шаблон в `CONFIG.replicate.basePromptTemplate`) явно требует сохранять
   лицо, позу и фон человека без изменений и менять только предмет одежды —
   не убирайте эти инструкции при правке промпта.

## Структура проекта

```
project/
├── package.json
├── schema.js                  # таблицы users / payments / generations / generation_logs
├── handlers/
│   ├── message.js              # /start, /admin, фото, successful_payment
│   ├── callback_query.js       # меню, счёт на оплату, запуск генерации
│   └── pre_checkout_query.js   # подтверждение чека Stars
├── lib/
│   ├── config.js               # админы, пакеты Stars, каталог одежды, настройки Replicate
│   ├── db.js                   # весь доступ к БД (баланс, платежи, история, статистика)
│   ├── telegram.js             # обёртки над sdk `api` (edit/send/скачивание фото)
│   ├── replicate.js            # создание/опрос predictions в Replicate
│   └── helpers.js               # тексты и inline-клавиатуры (чистое представление)
└── AGENTS.md
```

## Перед первым запуском

1. В `lib/config.js` заполните:
   - `adminIds` — ваш Telegram `user_id` (узнать можно у @userinfobot).
   - `replicate.apiToken` — токен из https://replicate.com/account/api-tokens.
   - При необходимости — `replicate.version`, если модель требует конкретный
     version hash вместо запуска «последней версии по умолчанию».
   - Суммы Stars в `packages` — под вашу монетизацию.
2. В BotFather включите приём платежей Stars для бота (Bot Settings →
   Payments), это не требует отдельного платёжного провайдера — валюта
   `XTR` работает «из коробки».
3. `npx tgcloud migrate`, затем `npx tgcloud push`.
