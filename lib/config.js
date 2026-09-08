// lib/config.js
// Единая точка настройки бота: администраторы, тарифные пакеты (Telegram Stars),
// каталог одежды и параметры обращения к Replicate.
//
// ⚠️ Безопасность токена Replicate.
// В среде Telegram Serverless нет отдельного хранилища секретов/переменных
// окружения для сторонних API — модуль видит только SDK (`sdk`, `sdk/db`) и
// файлы вашего проекта (см. AGENTS.md). Поэтому токен Replicate хранится
// прямо здесь, в приватном коде вашего бота, который вы сами деплоите
// командой `npx tgcloud push`. Никогда не публикуйте этот файл с заполненным
// токеном в открытый репозиторий — держите его в приватном git-репозитории
// или .gitignore-нутом файле, если версионируете отдельно.

export const CONFIG = {
  // Telegram user_id администраторов, которым доступна команда /admin.
  adminIds: [6185261292],

  replicate: {
    apiToken: 'REPLICATE_API_TOKEN',

    // Модель Replicate (owner/name). Если модели требуется конкретная
    // версия (version hash) — заполните `version`, и бот пойдёт через
    // универсальный эндпоинт /v1/predictions вместо /v1/models/.../predictions.
    model: 'prunaai/p-image-edit',
    version: '',

    // Общий бюджет времени на одну генерацию (создание + опрос статуса).
    timeoutMs: 90000,
    // Интервал между опросами статуса предсказания.
    pollIntervalMs: 3000,
    // Проценты прогресса, которые показываются пользователю по очереди
    // при каждом опросе (плавная имитация прогресса).
    progressSteps: [10, 30, 45, 65, 85, 92],

    // {ITEM_DESCRIPTION} подставляется описанием выбранного товара.
    basePromptTemplate: [
      'Edit the provided photograph as a professional fashion catalog preview.',
      "Preserve the person's identity, face, hairstyle, body proportions, pose,",
      'camera angle, background and lighting exactly as in the original photo.',
      'Replace only the visible outer clothing of the person with the following item:',
      '{ITEM_DESCRIPTION}.',
      'The garment must look realistic and naturally fitted: accurate fabric texture,',
      'stitching, folds, shadows and lighting consistent with the scene.',
      'The result must be photorealistic and suitable for a commercial fashion catalog.',
      "Do not alter the person's face, body shape or identity.",
      'Do not change the background unless strictly necessary for realism.',
    ].join(' '),
  },

  // Тарифные пакеты генераций, оплачиваемые Telegram Stars (валюта XTR).
  // amount в prices указывается в Stars (целое число), без десятичных долей.
  packages: {
    pkg_1: { id: 'pkg_1', title: '1 генерация', emoji: '✨', stars: 15, generations: 1 },
    pkg_5: { id: 'pkg_5', title: '5 генераций', emoji: '🔥', stars: 65, generations: 5 },
    pkg_10: { id: 'pkg_10', title: '10 генераций', emoji: '🚀', stars: 120, generations: 10 },
    pkg_25: { id: 'pkg_25', title: '25 генераций', emoji: '💎', stars: 270, generations: 25 },
    pkg_50: { id: 'pkg_50', title: '50 генераций', emoji: '👑', stars: 0, generations: 50 },
  },

  // Каталог товаров: обычная верхняя одежда (платья, пальто, куртки,
  // деловые костюмы, стритвир) — женская и мужская коллекции.
  // description — на английском: так модели генерации изображений обычно
  // точнее следуют промпту; title — на русском, для интерфейса бота.
  products: {
    w_evening_dress: {
      id: 'w_evening_dress',
      title: 'Максимально Открытый',
      category: 'women',
      description:
        'a ultra-minimalist commercial fashion underwear set with thin straps, micro coverage, sheer lace details',
    },
    w_trench_coat: {
      id: 'w_trench_coat',
      title: 'Средне открытый',
      category: 'women',
      description:
        'a modern stylish beige lingerie set with medium coverage, seamless edges and elegant classic cut',
    },
    w_denim_jacket: {
      id: 'w_denim_jacket',
      title: 'Максимально закрытый',
      category: 'women',
      description:
        'a premium high-waist cotton underwear set with maximum full coverage, modern comfortable design',
    },
    w_linen_set: {
      id: 'w_linen_set',
      title: 'БДСМ',
      category: 'women',
      description:
        'a black leather harness and strap-detailed fashion lingerie set, provocative latex and leather style',
    },
  },
};
