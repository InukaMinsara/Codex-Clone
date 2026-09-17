const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 8787);
const MODEL = process.env.XKIRO_MODEL || 'openai/gpt-5.3-codex-spark';
const XKIRO_URL = 'https://api.xkiro.com/v1/chat/completions';
const ROOT = __dirname;
const WEB_DIR = path.join(ROOT, 'web');

loadDotEnv(path.join(ROOT, '.env'));

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function safeStaticPath(urlPath) {
  const normalized = urlPath === '/' ? '/index.html' : urlPath;
  const decoded = decodeURIComponent(normalized);
  const candidate = path.resolve(WEB_DIR, `.${decoded}`);
  return candidate.startsWith(path.resolve(WEB_DIR)) ? candidate : null;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  })[ext] || 'application/octet-stream';
}

async function readBody(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

class XkiroError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function callXkiro(messages) {
  const apiKey = process.env.XKIRO_API_KEY;
  if (!apiKey) throw new XkiroError(500, 'XKIRO_API_KEY is not configured. Add it to .env before starting the site.');

  const payload = {
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: 'You are Codex Clone, a helpful coding assistant. Give clear, practical answers. This web app is currently chat-only, so never claim you edited files or ran commands.'
      },
      ...messages.slice(-24),
    ],
    max_tokens: 4096,
    stream: false,
  };

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(XKIRO_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const raw = await response.text();
      let body;
      try { body = JSON.parse(raw); } catch { body = {}; }

      if (!response.ok) {
        const message = body?.error?.message || raw.slice(0, 500) || `HTTP ${response.status}`;
        throw new XkiroError(response.status, `xKiro API error (${response.status}): ${message}`);
      }

      const reply = body?.choices?.[0]?.message?.content;
      if (!reply) throw new XkiroError(502, 'xKiro returned no assistant message.');
      return String(reply);
    } catch (error) {
      lastError = error;
      const retryable = error instanceof XkiroError && [429, 500, 502, 503].includes(error.status);
      if (!retryable || attempt === 3) break;
      await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
    } finally {
      clearTimeout(timeout);
    }
  }

  if (lastError instanceof Error && lastError.name === 'AbortError') {
    throw new XkiroError(504, 'xKiro request timed out.');
  }
  throw lastError instanceof Error ? lastError : new XkiroError(502, 'xKiro request failed.');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/api/health' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, model: MODEL, keyConfigured: Boolean(process.env.XKIRO_API_KEY) });
    }

    if (url.pathname === '/api/chat' && req.method === 'POST') {
      const raw = await readBody(req);
      let parsed;
      try { parsed = JSON.parse(raw); } catch { return sendJson(res, 400, { error: 'Invalid JSON body.' }); }

      if (!Array.isArray(parsed.messages)) return sendJson(res, 400, { error: 'messages must be an array.' });
      const messages = parsed.messages
        .filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
        .slice(-24);
      if (!messages.length) return sendJson(res, 400, { error: 'No valid messages were provided.' });

      const reply = await callXkiro(messages);
      return sendJson(res, 200, { reply, model: MODEL });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { error: 'Method not allowed.' });
    }

    const filePath = safeStaticPath(url.pathname);
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return sendJson(res, 404, { error: 'Not found.' });
    }

    res.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    const status = error instanceof XkiroError ? error.status : 500;
    sendJson(res, status, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, () => {
  console.log(`Codex Clone web app: http://localhost:${PORT}`);
  console.log(`Model: ${MODEL}`);
  console.log(`xKiro key configured: ${Boolean(process.env.XKIRO_API_KEY)}`);
});
