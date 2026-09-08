// lib/replicate.js
// Интеграция с Replicate API через глобальный fetch в Node.js — без сторонних
// npm-пакетов. Создаёт predictions для модели prunaai/p-image-edit, опрашивает
// статус и на каждом тике вызывает onProgress(percent) для плавной анимации
// сообщения в Telegram.

import { CONFIG } from './config.js';

const REPLICATE_API = 'https://api.replicate.com/v1';

export class GenerationError extends Error {
  constructor(message, predictionId = null) {
    super(message);
    this.name = 'GenerationError';
    this.predictionId = predictionId;
  }
}

function authHeaders() {
  return {
    Authorization: `Bearer ${CONFIG.replicate.apiToken}`,
    'Content-Type': 'application/json',
  };
}

function buildPrompt(product) {
  return CONFIG.replicate.basePromptTemplate.replace('{ITEM_DESCRIPTION}', product.description);
}

async function parseJsonSafely(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

// Создаёт предсказание. Если в конфиге указан `version` — используется
// универсальный эндпоинт /v1/predictions (нужен для моделей, требующих
// конкретный version hash). Иначе используется удобный эндпоинт
// /v1/models/{owner}/{name}/predictions, который сам берёт последнюю версию
// официальной модели.
async function createPrediction(imageDataUri, prompt) {
  const { model, version } = CONFIG.replicate;

  const url = version
    ? `${REPLICATE_API}/predictions`
    : `${REPLICATE_API}/models/${model}/predictions`;

  const body = version
    ? { version, input: { image: imageDataUri, prompt } }
    : { input: { image: imageDataUri, prompt } };

  const response = await fetch(url, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  const data = await parseJsonSafely(response);

  if (!response.ok) {
    const detail = data && (data.detail || data.error);
    throw new GenerationError(detail || `Replicate вернул ошибку ${response.status}`);
  }

  return data;
}

async function getPrediction(predictionId) {
  const response = await fetch(`${REPLICATE_API}/predictions/${predictionId}`, {
    method: 'GET',
    headers: authHeaders(),
  });

  const data = await parseJsonSafely(response);

  if (!response.ok) {
    const detail = data && (data.detail || data.error);
    throw new GenerationError(detail || `Replicate вернул ошибку ${response.status}`, predictionId);
  }

  return data;
}

async function cancelPrediction(predictionId) {
  try {
    await fetch(`${REPLICATE_API}/predictions/${predictionId}/cancel`, {
      method: 'POST',
      headers: authHeaders(),
    });
  } catch (error) {
    // Best-effort: если отмена не удалась, генерация всё равно будет
    // считаться таймаутом на нашей стороне и вернёт баланс пользователю.
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Полный цикл генерации: создание предсказания -> опрос статуса с плавной
 * анимацией прогресса -> результат.
 *
 * @param {string} imageDataUri  base64 data URI исходного фото пользователя
 * @param {object} product        товар из CONFIG.products
 * @param {(percent: number) => Promise<void>} onProgress  вызывается на каждом тике опроса
 * @returns {Promise<{ outputUrl: string, predictionId: string }>}
 */
export async function generateFashionPreview(imageDataUri, product, onProgress) {
  const prompt = buildPrompt(product);
  const prediction = await createPrediction(imageDataUri, prompt);
  const predictionId = prediction.id;

  const deadline = Date.now() + CONFIG.replicate.timeoutMs;
  const steps = CONFIG.replicate.progressSteps;
  let stepIndex = 0;
  let current = prediction;

  while (current.status === 'starting' || current.status === 'processing') {
    if (Date.now() > deadline) {
      await cancelPrediction(predictionId);
      throw new GenerationError('Превышено время ожидания ответа от AI-сервиса', predictionId);
    }

    const percent = steps[Math.min(stepIndex, steps.length - 1)];
    await onProgress(percent);
    stepIndex += 1;

    await sleep(CONFIG.replicate.pollIntervalMs);
    current = await getPrediction(predictionId);
  }

  if (current.status === 'succeeded') {
    const output = Array.isArray(current.output)
      ? current.output[current.output.length - 1]
      : current.output;

    if (!output) {
      throw new GenerationError('AI-сервис не вернул изображение', predictionId);
    }

    await onProgress(100);
    return { outputUrl: output, predictionId };
  }

  if (current.status === 'canceled') {
    throw new GenerationError('Генерация была отменена', predictionId);
  }

  const errorMessage = typeof current.error === 'string' && current.error
    ? current.error
    : 'Генерация не удалась на стороне AI-сервиса';
  throw new GenerationError(errorMessage, predictionId);
}
