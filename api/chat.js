// api/chat.js — Vercel Serverless Function, тот же паттерн, что уже проверен в бою у FreeX
// (Искусственный интеллект/Архив/freex/freex/api/chat.js) — статика + одна serverless-функция как прокси.
// Ключ — только из переменной окружения Vercel (DEEPSEEK_API_KEY) или из браузера пользователя,
// никогда не хранится в этом файле и не возвращается клиенту.

const ALLOWED_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Только POST', status: 405 });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const model = ALLOWED_MODELS.has(body?.model) ? body.model : 'deepseek-v4-flash';
    const clientKey = body?.apiKey && String(body.apiKey).trim();
    const apiKey = clientKey || process.env.DEEPSEEK_API_KEY || '';
    const keySource = clientKey ? 'ваш ключ (эта вкладка)' : process.env.DEEPSEEK_API_KEY ? 'сервер (переменная окружения Vercel)' : 'нет ключа';

    if (!apiKey) {
      return res.status(200).json({ error: 'Нет ключа — ни в этой вкладке, ни на сервере', status: 401, keySource });
    }

    const messages = [
      { role: 'system', content: 'Ты дружелюбный ассистент FreexOfficial DeepSeek Chat. Отвечай кратко и по делу.' },
      ...(body?.history || []),
      { role: 'user', content: body?.message },
    ];

    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ model, messages }),
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      const msg = data?.error?.message || `HTTP ${r.status}`;
      return res.status(200).json({ error: msg, status: r.status, keySource });
    }
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) return res.status(200).json({ error: 'Пустой ответ DeepSeek', status: 502, keySource });

    return res.status(200).json({ reply, model, keySource });
  } catch (e) {
    return res.status(200).json({ error: e.message || String(e), status: 500 });
  }
}
