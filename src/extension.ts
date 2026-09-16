import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('codexClone.openChat', () => {
    const panel = vscode.window.createWebviewPanel(
      'codexCloneChat',
      'Codex Clone',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    panel.webview.html = getWebviewContent(panel.webview);

    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type !== 'sendMessage') return;

      const text = String(message.text ?? '').trim();
      if (!text) return;

      panel.webview.postMessage({
        type: 'agentReply',
        text: `Got it. Your request was:\n\n${text}\n\nCodex integration will be connected here next.`,
      });
    });
  });

  context.subscriptions.push(disposable);
}

function getWebviewContent(webview: vscode.Webview) {
  const nonce = getNonce();
  const csp = [
    `default-src 'none'`,
    `style-src 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Codex Clone</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0d0f12;
      --panel: #111418;
      --panel-2: #171a20;
      --border: #272c34;
      --text: #eef1f5;
      --muted: #8d96a3;
      --accent: #ffffff;
      --accent-text: #111318;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      display: flex;
    }
    .app { display: grid; grid-template-columns: 240px 1fr; width: 100%; min-height: 100vh; }
    .sidebar { border-right: 1px solid var(--border); background: var(--panel); padding: 18px 14px; display: flex; flex-direction: column; }
    .brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px 22px; font-weight: 700; font-size: 15px; }
    .logo { width: 28px; height: 28px; border-radius: 9px; background: var(--accent); color: var(--accent-text); display: grid; place-items: center; font-weight: 900; }
    .section { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; padding: 0 8px 8px; }
    .item { padding: 9px 10px; border-radius: 8px; color: #cbd1da; font-size: 13px; }
    .item.active { background: var(--panel-2); color: #fff; }
    .status { margin-top: auto; border-top: 1px solid var(--border); padding: 14px 8px 2px; color: var(--muted); font-size: 12px; }
    .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #7ee787; margin-right: 7px; }
    .main { display: grid; grid-template-rows: auto 1fr auto; min-width: 0; }
    .topbar { height: 58px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; }
    .model { color: var(--muted); font-size: 12px; }
    .model strong { color: var(--text); font-weight: 600; }
    .content { max-width: 880px; width: 100%; margin: 0 auto; padding: 48px 24px; overflow: auto; }
    .welcome { text-align: center; margin: 10vh 0 42px; }
    .welcome h1 { margin: 0 0 10px; font-size: 28px; letter-spacing: -0.02em; }
    .welcome p { margin: 0; color: var(--muted); font-size: 14px; }
    .messages { display: flex; flex-direction: column; gap: 18px; }
    .message { max-width: 78%; padding: 13px 15px; border-radius: 12px; white-space: pre-wrap; line-height: 1.5; font-size: 14px; }
    .user { align-self: flex-end; background: #20242b; }
    .assistant { align-self: flex-start; background: var(--panel-2); border: 1px solid var(--border); }
    .composer-wrap { padding: 16px 20px 20px; }
    .composer { max-width: 880px; margin: 0 auto; display: flex; gap: 10px; align-items: flex-end; border: 1px solid var(--border); background: var(--panel); border-radius: 14px; padding: 10px; }
    textarea { flex: 1; resize: none; min-height: 46px; max-height: 180px; background: transparent; border: 0; outline: 0; color: var(--text); font: inherit; padding: 8px 6px; }
    textarea::placeholder { color: #69727f; }
    button { border: 0; border-radius: 10px; background: #fff; color: #111; font-weight: 700; padding: 10px 15px; cursor: pointer; }
    button:disabled { opacity: .45; cursor: default; }
    .hint { max-width: 880px; margin: 8px auto 0; color: #636b77; font-size: 11px; text-align: center; }
    @media (max-width: 700px) {
      .app { grid-template-columns: 1fr; }
      .sidebar { display: none; }
      .content { padding: 28px 14px; }
    }
  </style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand"><div class="logo">C</div><span>Codex Clone</span></div>
      <div class="section">Workspace</div>
      <div class="item active">New chat</div>
      <div class="item">Current project</div>
      <div class="item">Files</div>
      <div class="section" style="margin-top:22px;">Agent</div>
      <div class="item">Activity</div>
      <div class="item">Settings</div>
      <div class="status"><span class="dot"></span>Ready</div>
    </aside>

    <main class="main">
      <header class="topbar">
        <strong>Chat</strong>
        <div class="model">Model: <strong>Codex</strong></div>
      </header>

      <section class="content" id="content">
        <div class="welcome" id="welcome">
          <h1>What are we building?</h1>
          <p>Ask your coding agent to understand, create, or change your project.</p>
        </div>
        <div class="messages" id="messages"></div>
      </section>

      <div class="composer-wrap">
        <form class="composer" id="form">
          <textarea id="input" rows="1" placeholder="Ask Codex to build something..."></textarea>
          <button id="send" type="submit">Send</button>
        </form>
        <div class="hint">Codex Clone • VS Code extension • Press Enter to send</div>
      </div>
    </main>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const form = document.getElementById('form');
    const input = document.getElementById('input');
    const send = document.getElementById('send');
    const messages = document.getElementById('messages');
    const welcome = document.getElementById('welcome');

    function addMessage(text, role) {
      welcome.style.display = 'none';
      const el = document.createElement('div');
      el.className = 'message ' + role;
      el.textContent = text;
      messages.appendChild(el);
      el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      addMessage(text, 'user');
      input.value = '';
      input.style.height = 'auto';
      send.disabled = true;
      vscode.postMessage({ type: 'sendMessage', text });
    });

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 180) + 'px';
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });

    window.addEventListener('message', (event) => {
      if (event.data?.type === 'agentReply') {
        addMessage(event.data.text, 'assistant');
        send.disabled = false;
        input.focus();
      }
    });

    input.focus();
  </script>
</body>
</html>`;
}

function getNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < 32; i++) value += chars.charAt(Math.floor(Math.random() * chars.length));
  return value;
}

export function deactivate() {}
