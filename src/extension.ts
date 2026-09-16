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
      switch (message?.type) {
        case 'sendMessage': {
          const text = String(message.text ?? '').trim();
          if (!text) return;

          panel.webview.postMessage({ type: 'agentState', state: 'working' });

          const workspace = vscode.workspace.workspaceFolders?.[0];
          const workspaceName = workspace?.name ?? 'No workspace open';

          // UI-first implementation. Real Codex calls will be added in the agent layer.
          setTimeout(() => {
            panel.webview.postMessage({
              type: 'agentReply',
              text: `I received your request.\n\nWorkspace: ${workspaceName}\n\n“${text}”\n\nThe Codex agent connection is the next layer. The interface is ready for streaming responses, tool activity, and file edits.`,
            });
            panel.webview.postMessage({
              type: 'agentActivity',
              activity: [
                { icon: '✓', text: 'Request received' },
                { icon: '✓', text: `Workspace: ${workspaceName}` },
                { icon: '•', text: 'Waiting for Codex agent connection' },
              ],
            });
            panel.webview.postMessage({ type: 'agentState', state: 'ready' });
          }, 350);
          break;
        }

        case 'newChat':
          panel.webview.postMessage({ type: 'clearChat' });
          break;

        case 'openSettings':
          vscode.window.showInformationMessage('Codex Clone settings will be available here.');
          break;

        case 'openWorkspace':
          await vscode.commands.executeCommand('workbench.action.files.openLocalFile');
          break;
      }
    }, undefined, context.subscriptions);
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
      --bg: #090a0c;
      --sidebar: #0d0f12;
      --panel: #111418;
      --panel-hover: #171a20;
      --border: #252a31;
      --text: #f2f4f7;
      --muted: #89919d;
      --subtle: #626b77;
      --green: #78e08f;
      --blue: #7ab7ff;
      --user: #1c2027;
    }

    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
      font-size: 13px;
      overflow: hidden;
    }

    button, textarea { font: inherit; }
    button { color: inherit; }

    .app {
      height: 100vh;
      display: grid;
      grid-template-columns: 228px minmax(0, 1fr);
      background: var(--bg);
    }

    .sidebar {
      background: var(--sidebar);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .brand {
      height: 58px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 16px;
      border-bottom: 1px solid var(--border);
      font-weight: 700;
    }

    .logo {
      width: 28px;
      height: 28px;
      display: grid;
      place-items: center;
      border-radius: 9px;
      background: #f4f5f6;
      color: #111317;
      font-weight: 900;
      font-size: 13px;
    }

    .sidebar-scroll { padding: 14px 10px; overflow: auto; }

    .new-chat {
      width: 100%;
      border: 1px solid var(--border);
      background: #12151a;
      border-radius: 9px;
      padding: 9px 11px;
      cursor: pointer;
      text-align: left;
      transition: background .15s ease, border-color .15s ease;
    }

    .new-chat:hover { background: var(--panel-hover); border-color: #343a43; }
    .new-chat .plus { margin-right: 8px; color: #fff; }

    .label {
      color: var(--subtle);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .09em;
      margin: 20px 8px 8px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 9px;
      width: 100%;
      padding: 8px 10px;
      border: 0;
      background: transparent;
      color: #c7cdd5;
      border-radius: 8px;
      cursor: pointer;
      text-align: left;
      margin-bottom: 2px;
    }

    .nav-item:hover, .nav-item.active { background: var(--panel-hover); color: #fff; }
    .nav-icon { width: 16px; color: var(--muted); text-align: center; }

    .workspace-card {
      border-top: 1px solid var(--border);
      margin-top: auto;
      padding: 12px 12px 14px;
    }

    .workspace-title { color: #cfd5dd; font-size: 11px; margin-bottom: 6px; }
    .workspace-name { color: var(--muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .status { margin-top: 8px; color: var(--muted); font-size: 11px; }
    .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--green); margin-right: 7px; }

    .main {
      min-width: 0;
      min-height: 0;
      display: grid;
      grid-template-rows: 58px minmax(0, 1fr) auto;
    }

    .topbar {
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 18px;
    }

    .top-left { display: flex; align-items: center; gap: 10px; }
    .top-title { font-weight: 650; }
    .pill {
      border: 1px solid var(--border);
      color: var(--muted);
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 10px;
    }

    .model-button {
      border: 1px solid var(--border);
      background: transparent;
      border-radius: 8px;
      padding: 6px 9px;
      color: #c9ced6;
      cursor: pointer;
    }

    .content {
      min-height: 0;
      overflow: auto;
      padding: 0 24px;
    }

    .inner { max-width: 860px; margin: 0 auto; padding: 52px 0 40px; }

    .welcome { text-align: center; margin-bottom: 40px; }
    .welcome-mark {
      width: 44px;
      height: 44px;
      border-radius: 13px;
      display: inline-grid;
      place-items: center;
      background: #f4f5f6;
      color: #111317;
      font-weight: 900;
      margin-bottom: 16px;
    }
    .welcome h1 { margin: 0 0 8px; font-size: 25px; letter-spacing: -.025em; }
    .welcome p { margin: 0; color: var(--muted); }

    .messages { display: flex; flex-direction: column; gap: 20px; }

    .message-row { display: flex; gap: 11px; align-items: flex-start; }
    .message-row.user { justify-content: flex-end; }
    .avatar {
      width: 26px;
      height: 26px;
      flex: 0 0 26px;
      display: grid;
      place-items: center;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 800;
      background: #191c21;
      color: #cdd2d9;
    }
    .user .avatar { order: 2; background: #e9eaec; color: #17191d; }

    .message-bubble {
      max-width: min(78%, 720px);
      border: 1px solid var(--border);
      background: var(--panel);
      border-radius: 12px;
      padding: 11px 13px;
      line-height: 1.55;
      white-space: pre-wrap;
    }
    .user .message-bubble { background: var(--user); border-color: #2c3139; }

    .activity {
      margin: 0 37px;
      border: 1px solid var(--border);
      background: #0c0f13;
      border-radius: 11px;
      padding: 10px 12px;
    }
    .activity-head { color: #c4cad2; font-size: 11px; margin-bottom: 8px; }
    .activity-line { color: var(--muted); font-size: 11px; padding: 3px 0; }
    .activity-line .ok { color: var(--green); margin-right: 7px; }
    .activity-line .wait { color: var(--blue); margin-right: 7px; }

    .empty-hint {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 9px;
      margin: 0 auto;
      max-width: 650px;
    }
    .suggestion {
      padding: 11px;
      text-align: left;
      border: 1px solid var(--border);
      background: #0e1115;
      border-radius: 10px;
      color: #b8bec7;
      cursor: pointer;
    }
    .suggestion:hover { background: var(--panel-hover); }
    .suggestion strong { display: block; color: #e4e6ea; font-size: 11px; margin-bottom: 4px; }
    .suggestion span { color: var(--subtle); font-size: 10px; }

    .composer-wrap { padding: 12px 20px 17px; }
    .composer { max-width: 860px; margin: 0 auto; }
    .composer-box {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      border: 1px solid #30353d;
      background: var(--panel);
      border-radius: 14px;
      padding: 8px;
      box-shadow: 0 8px 35px rgba(0,0,0,.16);
    }
    textarea {
      min-height: 46px;
      max-height: 180px;
      flex: 1;
      resize: none;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--text);
      padding: 9px 8px;
      line-height: 1.45;
    }
    textarea::placeholder { color: #626a75; }
    .send {
      width: 39px;
      height: 39px;
      border: 0;
      border-radius: 10px;
      background: #f2f3f4;
      color: #121418;
      cursor: pointer;
      font-weight: 900;
    }
    .send:hover { background: #fff; }
    .send:disabled { opacity: .45; cursor: default; }
    .composer-meta { color: #555d68; text-align: center; font-size: 10px; padding-top: 7px; }

    .working .dot { animation: pulse 1s infinite; }
    @keyframes pulse { 50% { opacity: .35; } }

    @media (max-width: 760px) {
      .app { grid-template-columns: 1fr; }
      .sidebar { display: none; }
      .content { padding: 0 14px; }
      .inner { padding-top: 35px; }
      .empty-hint { grid-template-columns: 1fr; }
      .message-bubble { max-width: 88%; }
      .composer-wrap { padding-left: 12px; padding-right: 12px; }
    }
  </style>
</head>
<body>
  <div class="app" id="app">
    <aside class="sidebar">
      <div class="brand"><div class="logo">C</div><span>Codex Clone</span></div>
      <div class="sidebar-scroll">
        <button class="new-chat" id="newChat"><span class="plus">＋</span>New chat</button>
        <div class="label">Workspace</div>
        <button class="nav-item active"><span class="nav-icon">⌂</span>Current project</button>
        <button class="nav-item"><span class="nav-icon">◫</span>Files</button>
        <button class="nav-item"><span class="nav-icon">⌘</span>Activity</button>
        <div class="label">Tools</div>
        <button class="nav-item" id="settings"><span class="nav-icon">⚙</span>Settings</button>
      </div>
      <div class="workspace-card">
        <div class="workspace-title">Workspace</div>
        <div class="workspace-name" id="workspaceName">Detecting workspace…</div>
        <div class="status"><span class="dot"></span><span id="statusText">Ready</span></div>
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div class="top-left"><span class="top-title">Chat</span><span class="pill">Agent</span></div>
        <button class="model-button">Codex ▾</button>
      </header>

      <section class="content" id="content">
        <div class="inner">
          <div class="welcome" id="welcome">
            <div class="welcome-mark">C</div>
            <h1>What are we building?</h1>
            <p>Ask your coding agent to understand, create, or change your project.</p>
          </div>

          <div class="messages" id="messages"></div>

          <div class="empty-hint" id="suggestions">
            <button class="suggestion" data-prompt="Explain this project and its main files."><strong>Understand my project</strong><span>Analyze the workspace structure</span></button>
            <button class="suggestion" data-prompt="Build a clean landing page for this project."><strong>Build a feature</strong><span>Plan and implement a change</span></button>
            <button class="suggestion" data-prompt="Find the most important bug in this project."><strong>Find a bug</strong><span>Inspect code and suggest a fix</span></button>
          </div>
        </div>
      </section>

      <div class="composer-wrap">
        <form class="composer" id="form">
          <div class="composer-box">
            <textarea id="input" rows="1" placeholder="Ask Codex to build something..."></textarea>
            <button class="send" id="send" type="submit" aria-label="Send">↑</button>
          </div>
          <div class="composer-meta">Enter to send • Shift + Enter for a new line</div>
        </form>
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
    const suggestions = document.getElementById('suggestions');
    const statusText = document.getElementById('statusText');
    const workspaceName = document.getElementById('workspaceName');
    const app = document.getElementById('app');

    function addMessage(text, role) {
      welcome.style.display = 'none';
      suggestions.style.display = 'none';
      const row = document.createElement('div');
      row.className = 'message-row ' + role;
      const avatar = document.createElement('div');
      avatar.className = 'avatar';
      avatar.textContent = role === 'user' ? 'YOU' : 'C';
      const bubble = document.createElement('div');
      bubble.className = 'message-bubble';
      bubble.textContent = text;
      row.appendChild(avatar);
      row.appendChild(bubble);
      messages.appendChild(row);
      requestAnimationFrame(() => row.scrollIntoView({ behavior: 'smooth', block: 'end' }));
    }

    function renderActivity(items) {
      const box = document.createElement('div');
      box.className = 'activity';
      const head = document.createElement('div');
      head.className = 'activity-head';
      head.textContent = 'Agent activity';
      box.appendChild(head);
      for (const item of items || []) {
        const line = document.createElement('div');
        line.className = 'activity-line';
        const icon = document.createElement('span');
        icon.className = item.icon === '✓' ? 'ok' : 'wait';
        icon.textContent = item.icon;
        line.appendChild(icon);
        line.appendChild(document.createTextNode(item.text));
        box.appendChild(line);
      }
      messages.appendChild(box);
    }

    function setWorking(working) {
      send.disabled = working;
      input.disabled = working;
      statusText.textContent = working ? 'Working…' : 'Ready';
      app.classList.toggle('working', working);
    }

    function submitPrompt(value) {
      const text = String(value || '').trim();
      if (!text || send.disabled) return;
      addMessage(text, 'user');
      input.value = '';
      input.style.height = 'auto';
      setWorking(true);
      vscode.postMessage({ type: 'sendMessage', text });
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitPrompt(input.value);
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

    document.querySelectorAll('.suggestion').forEach((button) => {
      button.addEventListener('click', () => submitPrompt(button.dataset.prompt));
    });

    document.getElementById('newChat').addEventListener('click', () => vscode.postMessage({ type: 'newChat' }));
    document.getElementById('settings').addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));

    window.addEventListener('message', (event) => {
      const data = event.data || {};
      if (data.type === 'agentState') setWorking(data.state === 'working');
      if (data.type === 'agentReply') addMessage(data.text, 'assistant');
      if (data.type === 'agentActivity') renderActivity(data.activity);
      if (data.type === 'clearChat') {
        messages.replaceChildren();
        welcome.style.display = '';
        suggestions.style.display = 'grid';
        setWorking(false);
        input.focus();
      }
    });

    workspaceName.textContent = 'Current VS Code workspace';
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
