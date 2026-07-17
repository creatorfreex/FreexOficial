// FreexOfficial DeepSeek Chat — минимальный отдельный модуль.
// Ключ никогда не пишется в localStorage/sessionStorage — только в JS-переменную в памяти вкладки (inMemoryKey),
// исчезает при перезагрузке страницы. Реальный вызов DeepSeek делает локальный сервер (server.js), не браузер напрямую.

let inMemoryKey = '';
let history = [];

function el(id) { return document.getElementById(id); }

function renderChat() {
  const log = el('chatLog');
  log.innerHTML = '';
  if (history.length === 0) {
    log.innerHTML = '<div class="empty">Чат пуст. Напишите что-нибудь ниже.</div>';
    return;
  }
  history.forEach((m) => {
    const row = document.createElement('div');
    row.className = 'msg ' + (m.role === 'user' ? 'me' : 'agent') + (m.isError ? ' err' : '');
    row.innerHTML = `<div class="bubble">${escapeHtml(m.content)}</div>` + (m.meta ? `<div class="meta">${escapeHtml(m.meta)}</div>` : '');
    log.appendChild(row);
  });
  log.scrollTop = log.scrollHeight;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function addMessage(role, content, meta, isError) {
  history.push({ role, content, meta, isError });
  renderChat();
}

function errorMessageFor(status, rawMessage) {
  const map = {
    401: 'Неверный API-ключ DeepSeek (401). Проверьте ключ в ⚙ Настройках.',
    402: 'Недостаточно средств на балансе DeepSeek (402). Пополните баланс аккаунта.',
    429: 'Превышен лимит запросов к DeepSeek (429). Попробуйте через некоторое время.',
    500: 'Временная ошибка сервера DeepSeek (500). Попробуйте ещё раз.',
    503: 'Сервис DeepSeek временно недоступен (503). Попробуйте ещё раз.',
  };
  return map[status] || `Ошибка DeepSeek (HTTP ${status}): ${rawMessage || ''}`;
}

async function checkStatus() {
  const pill = el('statusPill');
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.ok) {
      pill.textContent = data.hasServerKey ? '● сервер готов · ключ в SECRETS/' : '● сервер готов · ключа нет, введите свой';
      pill.className = 'status-pill ok';
    } else {
      throw new Error('not ok');
    }
  } catch {
    pill.textContent = '● сервер недоступен (ERR_CONNECTION_REFUSED?)';
    pill.className = 'status-pill err';
  }
}

async function sendMessage(e) {
  e.preventDefault();
  const input = el('composerInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addMessage('user', text);

  const thinkingIdx = history.length;
  addMessage('assistant', '…думает…');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: el('modelSelect').value,
        apiKey: inMemoryKey || undefined,
        history: history.slice(0, thinkingIdx - 1).filter((m) => !m.isError).map((m) => ({ role: m.role, content: m.content })),
        message: text,
      }),
    });
    const data = await res.json();
    history.splice(thinkingIdx, 1);
    if (data.error) {
      addMessage('assistant', errorMessageFor(data.status, data.error), 'источник ключа: ' + (data.keySource || '—'), true);
    } else {
      addMessage('assistant', data.reply, `${data.model} · ключ: ${data.keySource}`);
    }
  } catch (err) {
    history.splice(thinkingIdx, 1);
    addMessage('assistant', 'Сеть/сервер недоступны: ' + err.message, null, true);
  }
}

function newChat() {
  history = [];
  renderChat();
}

document.addEventListener('DOMContentLoaded', () => {
  renderChat();
  checkStatus();

  el('composer').addEventListener('submit', sendMessage);
  el('composerInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e); }
  });
  el('newChatBtn').onclick = newChat;

  el('openSettings').onclick = () => { el('settingsDrawer').classList.add('open'); el('settingsOverlay').classList.add('open'); };
  el('closeSettings').onclick = () => { el('settingsDrawer').classList.remove('open'); el('settingsOverlay').classList.remove('open'); };
  el('settingsOverlay').onclick = () => { el('settingsDrawer').classList.remove('open'); el('settingsOverlay').classList.remove('open'); };

  el('useKeyBtn').onclick = () => {
    inMemoryKey = el('apiKeyInput').value.trim();
    el('keySourceNote').textContent = inMemoryKey ? 'Ключ используется только в этой вкладке до перезагрузки.' : 'Поле пустое — используется ключ из SECRETS/, если есть.';
    checkStatus();
  };
  el('forgetKeyBtn').onclick = () => {
    inMemoryKey = '';
    el('apiKeyInput').value = '';
    el('keySourceNote').textContent = 'Ключ забыт из памяти вкладки.';
  };

  if (new URLSearchParams(location.search).get('settings') === '1') {
    el('settingsDrawer').classList.add('open', 'no-anim');
    el('settingsOverlay').classList.add('open');
  }
});
