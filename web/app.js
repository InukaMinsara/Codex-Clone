const messagesEl = document.getElementById('messages');
const suggestionsEl = document.getElementById('suggestions');
const welcomeEl = document.getElementById('welcome');
const form = document.getElementById('form');
const input = document.getElementById('input');
const send = document.getElementById('send');
const connection = document.getElementById('connection');
const newChat = document.getElementById('newChat');

const history = [];
let busy = false;

function addMessage(text, role) {
  welcomeEl.style.display = 'none';
  suggestionsEl.style.display = 'none';

  const row = document.createElement('div');
  row.className = `row ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? 'YOU' : 'C';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;

  row.append(avatar, bubble);
  messagesEl.appendChild(row);
  row.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function addActivity(lines, error = false) {
  const box = document.createElement('div');
  box.className = `activity ${error ? 'error' : ''}`;

  const title = document.createElement('div');
  title.className = 'activity-title';
  title.textContent = error ? 'Error' : 'Agent activity';
  box.appendChild(title);

  for (const lineText of lines) {
    const line = document.createElement('div');
    line.className = 'activity-line';
    line.textContent = `• ${lineText}`;
    box.appendChild(line);
  }

  messagesEl.appendChild(box);
  box.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function setBusy(value) {
  busy = value;
  send.disabled = value;
  input.disabled = value;
  connection.innerHTML = `<span class="dot"></span>${value ? 'Working…' : 'Ready'}`;
}

function resetComposer() {
  input.value = '';
  input.style.height = 'auto';
  input.focus();
}

async function sendMessage(rawText) {
  const text = String(rawText || '').trim();
  if (!text || busy) return;

  addMessage(text, 'user');
  history.push({ role: 'user', content: text });
  resetComposer();
  setBusy(true);
  addActivity(['Preparing request', `Model: openai/gpt-5.3-codex-spark`, 'Sending to xKiro']);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || `Request failed (${response.status})`);
    }

    const reply = String(payload.reply || '').trim();
    if (!reply) throw new Error('The model returned an empty response.');

    history.push({ role: 'assistant', content: reply });
    addActivity(['xKiro response received']);
    addMessage(reply, 'assistant');
  } catch (error) {
    history.pop();
    addActivity([error instanceof Error ? error.message : String(error)], true);
  } finally {
    setBusy(false);
    input.focus();
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  sendMessage(input.value);
});

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
});

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll('[data-prompt]').forEach((button) => {
  button.addEventListener('click', () => {
    input.value = button.dataset.prompt || '';
    input.focus();
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
  });
});

newChat.addEventListener('click', () => {
  history.length = 0;
  messagesEl.replaceChildren();
  welcomeEl.style.display = '';
  suggestionsEl.style.display = 'grid';
  setBusy(false);
  input.focus();
});

input.focus();
