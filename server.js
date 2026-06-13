import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const PORT = Number(process.env.PORT || 3000);
const XIAOJI_BASE_URL = 'https://xiaoji.baziapi.site/v1';
const RETRY_DELAYS = [1800, 3600, 7200];

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function requireApiKey() {
  const apiKey = process.env.XIAOJI_API_KEY;
  if (!apiKey) {
    const error = new Error('缺少 XIAOJI_API_KEY，请先在 .env 中配置你的 sk-jp- 开头密钥。');
    error.status = 500;
    throw error;
  }
  return apiKey;
}

function normalizeImageResponse(payload) {
  const data = Array.isArray(payload?.data) ? payload.data : [];
  return {
    created: payload?.created ?? Math.floor(Date.now() / 1000),
    model: payload?.model ?? null,
    data: data.map((item) => ({
      url: item?.url || null,
      b64_json: item?.b64_json || null
    }))
  };
}

async function parseUpstreamError(response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text);
    return json?.error?.message || json?.message || text;
  } catch {
    return text || `上游接口返回 ${response.status}`;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableUpstreamError(status, message = '') {
  const normalized = message.toLowerCase();
  return [403, 429, 502, 503].includes(status)
    || message.includes('当前请求较多')
    || message.includes('请求过多')
    || normalized.includes('rate')
    || normalized.includes('busy')
    || normalized.includes('overload');
}

async function readUpstreamResponse(response) {
  const text = await response.text();
  let payload = null;
  let message = text;

  try {
    payload = JSON.parse(text);
    message = payload?.error?.message || payload?.message || text;
  } catch {
    message = text || `上游接口返回 ${response.status}`;
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
    message
  };
}

async function fetchWithRetry(url, options, label) {
  let lastResult = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(125000)
    });
    const result = await readUpstreamResponse(response);

    if (result.ok || !isRetryableUpstreamError(result.status, result.message) || attempt === RETRY_DELAYS.length) {
      return result;
    }

    lastResult = result;
    console.log(`${label} upstream busy, retrying in ${RETRY_DELAYS[attempt]}ms`);
    await wait(RETRY_DELAYS[attempt]);
  }

  return lastResult;
}

app.post('/api/images/generations', async (req, res, next) => {
  try {
    const apiKey = requireApiKey();
    const { model, prompt, n, size, quality, style, response_format, reference_images } = req.body;

    if (!model || !prompt) {
      return res.status(400).json({ error: 'model 和 prompt 为必填项。' });
    }

    const body = {
      model,
      prompt,
      n: Number(n || 1),
      size,
      quality,
      response_format: response_format || 'url'
    };

    if (style) body.style = style;
    if (Array.isArray(reference_images)) {
      body.reference_images = reference_images.filter(Boolean).slice(0, 4);
    }

    const result = await fetchWithRetry(`${XIAOJI_BASE_URL}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }, 'images/generations');

    if (!result.ok) {
      return res.status(result.status).json({
        error: isRetryableUpstreamError(result.status, result.message)
          ? '平台当前请求较多，我已经自动重试了几次。请等 30 秒后再点生成，或者先把张数调成 1。'
          : result.message
      });
    }

    res.json(normalizeImageResponse(result.payload));
  } catch (error) {
    next(error);
  }
});

app.post('/api/images/edits', upload.single('image'), async (req, res, next) => {
  try {
    const apiKey = requireApiKey();
    const { model, prompt, n, size, quality, response_format } = req.body;

    if (!model || !prompt || !req.file) {
      return res.status(400).json({ error: 'model、prompt 和 image 文件为必填项。' });
    }

    const form = new FormData();
    form.set('model', model);
    form.set('prompt', prompt);
    form.set('n', String(Number(n || 1)));
    if (size) form.set('size', size);
    if (quality) form.set('quality', quality);
    form.set('response_format', response_format || 'url');
    form.set('image', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname);

    const result = await fetchWithRetry(`${XIAOJI_BASE_URL}/images/edits`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: form
    }, 'images/edits');

    if (!result.ok) {
      return res.status(result.status).json({
        error: isRetryableUpstreamError(result.status, result.message)
          ? '平台当前请求较多，我已经自动重试了几次。请等 30 秒后再点生成，或者先把张数调成 1。'
          : result.message
      });
    }

    res.json(normalizeImageResponse(result.payload));
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  const message = error.name === 'TimeoutError'
    ? '生成超时，请稍后重试，或把请求数量调小。'
    : error.message || '服务器发生未知错误。';

  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`AI image studio running at http://localhost:${PORT}`);
});
