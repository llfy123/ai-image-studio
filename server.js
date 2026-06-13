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

    const response = await fetch(`${XIAOJI_BASE_URL}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(125000)
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: await parseUpstreamError(response) });
    }

    res.json(normalizeImageResponse(await response.json()));
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

    const response = await fetch(`${XIAOJI_BASE_URL}/images/edits`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: form,
      signal: AbortSignal.timeout(125000)
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: await parseUpstreamError(response) });
    }

    res.json(normalizeImageResponse(await response.json()));
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
