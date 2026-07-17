// Локальный сервер-прокси для FreexOfficial DeepSeek Chat.
// Единственная роль: держать реальный вызов DeepSeek на сервере, чтобы ключ никогда не попадал в браузер/HTML/JS.
// Для публичной версии (GitHub Pages) этот файл не годится как есть — GitHub Pages не исполняет серверный код,
// нужен отдельный хостинг с серверным рантаймом (см. README.md, раздел "Публикация").
const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = process.env.DS_CHAT_PORT || 8768;
const ROOT = __dirname;
const SECRETS_DIR = path.join(__dirname, '..', '..', 'SECRETS');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
};

function readServerKey() {
  try {
    const v = fs.readFileSync(path.join(SECRETS_DIR, 'deepseek.key'), 'utf8').trim();
    return v || null;
  } catch {
    return null;
  }
}

function postJson(url, headers, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length, ...headers },
      timeout: 30000,
    }, (res) => {
      let chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json;
        try { json = JSON.parse(text); } catch { json = null; }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.write(data);
    req.end();
  });
}

const ALLOWED_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);

async function handleChat(payload) {
  const model = ALLOWED_MODELS.has(payload.model) ? payload.model : 'deepseek-v4-flash';
  const clientKey = payload.apiKey && String(payload.apiKey).trim();
  const serverKey = readServerKey();
  const apiKey = clientKey || serverKey;
  const keySource = clientKey ? 'ваш ключ (эта вкладка)' : serverKey ? 'SECRETS/deepseek.key' : 'нет ключа';

  if (!apiKey) {
    return { error: 'Нет ключа — ни в этой вкладке, ни в SECRETS/deepseek.key', status: 401, keySource };
  }

  const messages = [
    { role: 'system', content: 'Ты дружелюбный ассистент FreexOfficial DeepSeek Chat. Отвечай кратко и по делу.' },
    ...(payload.history || []),
    { role: 'user', content: payload.message },
  ];

  const r = await postJson('https://api.deepseek.com/chat/completions', { Authorization: `Bearer ${apiKey}` }, {
    model,
    messages,
  });

  if (r.status < 200 || r.status >= 300) {
    const msg = r.json?.error?.message || r.text.slice(0, 300);
    return { error: msg, status: r.status, keySource };
  }
  const reply = r.json?.choices?.[0]?.message?.content;
  if (!reply) return { error: 'Пустой ответ DeepSeek: ' + r.text.slice(0, 300), status: 502, keySource };
  return { reply, model, keySource };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, hasServerKey: !!readServerKey() }));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    readBody(req).then(async (raw) => {
      let payload;
      try { payload = JSON.parse(raw); } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Некорректный JSON', status: 400 }));
        return;
      }
      try {
        const result = await handleChat(payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message || String(e), status: 500 }));
      }
    });
    return;
  }

  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(ROOT, reqPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found: ' + reqPath); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`FreexOfficial DeepSeek Chat -> http://127.0.0.1:${PORT}/`);
});
