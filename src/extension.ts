import * as vscode from 'vscode';

const SECRET_KEY = 'codexClone.xkiroApiKey';
const DEFAULT_MODEL = 'openai/gpt-5.3-codex-spark';
const XKIRO_URL = 'https://api.xkiro.com/v1/chat/completions';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type XkiroResponse = {
  choices?: Array<{
    message?: { role?: string; content?: string | null };
  }>;
  error?: { message?: string; code?: string; type?: string };
};

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codexClone.setApiKey', async () => {
      const value = await vscode.window.showInputBox({
        prompt: 'Enter your xKiro API key',
        password: true,
        ignoreFocusOut: true,
        placeHolder: 'sk-xt-...',
      });

      if (!value?.trim()) return;
      await context.secrets.store(SECRET_KEY, value.trim());
      vscode.window.showInformationMessage('Codex Clone: xKiro API key saved securely in VS Code.');
    }),

    vscode.commands.registerCommand('codexClone.clearApiKey', async () => {
      await context.secrets.delete(SECRET_KEY);
      vscode.window.showInformationMessage('Codex Clone: xKiro API key cleared.');
    }),

    vscode.commands.registerCommand('codexClone.openChat', () => openChat(context)),
  );
}

async function openChat(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel(
    'codexCloneChat',
    'Codex Clone',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );

  panel.webview.html = getWebviewContent(panel.webview);

  let history: ChatMessage[] = [];
  let busy = false;

  panel.webview.onDidReceiveMessage(async (message) => {
    if (message?.type === 'setApiKey') {
      await vscode.commands.executeCommand('codexClone.setApiKey');
      return;
    }

    if (message?.type === 'clearChat') {
      history = [];
      panel.webview.postMessage({ type: 'clearChat' });
      return;
    }

    if (message?.type !== 'sendMessage' || busy) return;

    const text = String(message.text ?? '').trim();
    if (!text) return;

    const apiKey = await context.secrets.get(SECRET_KEY);
    if (!apiKey) {
      panel.webview.postMessage({
        type: 'agentError',
        text: 'xKiro API key is not set. Run “Codex Clone: Set xKiro API Key” from the Command Palette.',
      });
      return;
    }

    busy = true;
    panel.webview.postMessage({ type: 'agentState', state: 'working' });

    const workspace = vscode.workspace.workspaceFolders?.[0];
    const workspaceName = workspace?.name ?? 'No workspace open';
    panel.webview.postMessage({ type: 'workspace', name: workspaceName });
    panel.webview.postMessage({
      type: 'agentActivity',
      items: ['Request received', `Workspace: ${workspaceName}`, 'Sending to xKiro'],
    });

    try {
      const reply = await callXkiro(apiKey, text, history, workspaceName);
      history.push(
        { role: 'user', content: text },
        { role: 'assistant', content: reply },
      );

      panel.webview.postMessage({
        type: 'agentActivity',
        items: ['Request received', `Workspace: ${workspaceName}`, 'xKiro response received'],
      });
      panel.webview.postMessage({ type: 'agentReply', text: reply });
    } catch (error) {
      panel.webview.postMessage({
        type: 'agentError',
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      busy = false;
      panel.webview.postMessage({ type: 'agentState', state: 'ready' });
    }
  }, undefined, context.subscriptions);
}

async function callXkiro(
  apiKey: string,
  prompt: string,
  history: ChatMessage[],
  workspaceName: string,
): Promise<string> {
  const config = vscode.workspace.getConfiguration('codexClone');
  const model = config.get<string>('model', DEFAULT_MODEL);
  const reasoningEffort = config.get<string>('reasoningEffort', 'medium');

  const messages = [
    {
      role: 'system',
      content:
        `You are Codex Clone, a helpful coding assistant running inside VS Code. ` +
        `The current workspace is "${workspaceName}". ` +
        `You are currently in chat mode. Do not claim to have edited files or run commands ` +
        `unless the application actually provides those tools.`,
    },
    ...history.slice(-12),
    { role: 'user', content: prompt },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(XKIRO_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        reasoning_effort: reasoningEffort,
        stream: false,
      }),
      signal: controller.signal,
    });

    const raw = await response.text();
    let body: XkiroResponse;

    try {
      body = JSON.parse(raw) as XkiroResponse;
    } catch {
      throw new Error(`xKiro returned an invalid response (${response.status}).`);
    }

    if (!response.ok) {
      const detail = body.error?.message || raw.slice(0, 500);
      throw new Error(`xKiro API error (${response.status}): ${detail}`);
    }

    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('xKiro returned no assistant message.');
    }

    return content;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('xKiro request timed out. Try again with a shorter prompt.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getWebviewContent(webview: vscode.Webview): string {
  const nonce = getNonce();
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Codex Clone</title>
<style>
:root{color-scheme:dark;--bg:#08090b;--panel:#101216;--panel2:#15181d;--border:#252a31;--text:#f3f5f7;--muted:#89919d;--user:#1d2229;--ok:#7ee787}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}.app{height:100vh;display:grid;grid-template-columns:225px minmax(0,1fr)}.side{border-right:1px solid var(--border);background:#0c0e11;display:flex;flex-direction:column}.brand{height:58px;display:flex;align-items:center;gap:10px;padding:0 16px;border-bottom:1px solid var(--border);font-weight:700}.logo{width:28px;height:28px;border-radius:9px;background:#f4f5f6;color:#111;display:grid;place-items:center;font-weight:900}.sidein{padding:14px 10px}.new{width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:9px;background:#12151a;color:#ddd;cursor:pointer;text-align:left}.label{margin:19px 8px 8px;color:#626a76;font-size:10px;text-transform:uppercase;letter-spacing:.08em}.nav{width:100%;padding:8px 10px;border:0;background:transparent;color:#bfc5cd;border-radius:8px;text-align:left;cursor:pointer}.nav:hover,.nav.active{background:var(--panel2);color:#fff}.sidebottom{margin-top:auto;border-top:1px solid var(--border);padding:12px}.ws{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--muted);font-size:11px}.ready{margin-top:7px;color:var(--muted);font-size:11px}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--ok);margin-right:7px}.main{display:grid;grid-template-rows:58px minmax(0,1fr) auto;min-width:0}.top{border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 18px}.pill{border:1px solid var(--border);padding:4px 8px;border-radius:999px;color:var(--muted);font-size:10px;margin-left:8px}.model{border:1px solid var(--border);border-radius:8px;padding:6px 9px;color:#cfd4db}.content{overflow:auto;min-height:0;padding:0 22px}.inner{max-width:860px;margin:auto;padding:52px 0 35px}.welcome{text-align:center;margin:6vh 0 38px}.mark{width:44px;height:44px;display:inline-grid;place-items:center;background:#f4f5f6;color:#111;border-radius:13px;font-weight:900;margin-bottom:15px}.welcome h1{margin:0 0 7px;font-size:25px;letter-spacing:-.025em}.welcome p{margin:0;color:var(--muted)}.messages{display:flex;flex-direction:column;gap:18px}.row{display:flex;gap:10px;align-items:flex-start}.row.user{justify-content:flex-end}.avatar{width:26px;height:26px;flex:0 0 26px;border-radius:8px;background:#181b20;display:grid;place-items:center;font-size:10px;font-weight:800}.user .avatar{order:2;background:#eceef0;color:#111}.bubble{max-width:min(80%,720px);padding:11px 13px;border:1px solid var(--border);border-radius:12px;background:var(--panel);white-space:pre-wrap;line-height:1.55}.user .bubble{background:var(--user)}.activity{margin:0 36px;border:1px solid var(--border);background:#0c0f13;border-radius:11px;padding:9px 11px}.activity-title{font-size:11px;color:#cbd1d8;margin-bottom:5px}.line{font-size:11px;color:var(--muted);padding:2px 0}.error{border-color:#5c2b2b;color:#ffb4b4}.suggest{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;max-width:650px;margin:auto}.sbtn{padding:11px;text-align:left;background:#0d1014;border:1px solid var(--border);border-radius:10px;color:#c0c6ce;cursor:pointer}.sbtn:hover{background:var(--panel2)}.sbtn b{display:block;color:#e8eaed;font-size:11px;margin-bottom:4px}.sbtn span{font-size:10px;color:#626a76}.composer-wrap{padding:12px 20px 17px}.composer{max-width:860px;margin:auto}.box{display:flex;gap:8px;align-items:flex-end;border:1px solid #30353d;background:var(--panel);border-radius:14px;padding:8px}textarea{flex:1;min-height:45px;max-height:180px;resize:none;border:0;outline:0;background:transparent;color:var(--text);padding:8px;line-height:1.45}.send{width:39px;height:39px;border:0;border-radius:10px;background:#f4f5f6;color:#111;cursor:pointer;font-weight:900}.send:disabled{opacity:.45}.meta{text-align:center;color:#555e69;font-size:10px;padding-top:7px}@media(max-width:760px){.app{grid-template-columns:1fr}.side{display:none}.content{padding:0 14px}.suggest{grid-template-columns:1fr}.bubble{max-width:88%}}
</style>
</head>
<body>
<div class="app">
<aside class="side"><div class="brand"><div class="logo">C</div>Codex Clone</div><div class="sidein"><button class="new" id="new">＋ New chat</button><div class="label">Workspace</div><button class="nav active">⌂ Current project</button><button class="nav">◫ Files</button><button class="nav">◌ Activity</button><div class="label">Tools</div><button class="nav" id="key">⚿ Set API key</button></div><div class="sidebottom"><div class="ws" id="ws">Detecting workspace…</div><div class="ready"><span class="dot"></span><span id="state">Ready</span></div></div></aside>
<main class="main"><header class="top"><div><strong>Chat</strong><span class="pill">Agent</span></div><div class="model">GPT-5.3-Codex-Spark · xKiro</div></header><section class="content"><div class="inner"><div class="welcome" id="welcome"><div class="mark">C</div><h1>What are we building?</h1><p>Ask Codex to help you understand or build your project.</p></div><div class="messages" id="messages"></div><div class="suggest" id="suggest"><button class="sbtn" data-p="Explain this project and its main files."><b>Understand my project</b><span>Analyze the current workspace</span></button><button class="sbtn" data-p="Find the likely cause of the biggest bug in this project."><b>Find a bug</b><span>Reason about likely failures</span></button><button class="sbtn" data-p="Suggest one useful feature I could build next."><b>Plan a feature</b><span>Get a coding plan</span></button></div></div></section><div class="composer-wrap"><form class="composer" id="form"><div class="box"><textarea id="input" rows="1" placeholder="Ask Codex to build something..."></textarea><button class="send" id="send" type="submit">↑</button></div><div class="meta">Codex Clone · xKiro · Enter to send · Shift+Enter for a new line</div></form></div></main></div>
<script nonce="${nonce}">
const vscode=acquireVsCodeApi();const form=document.getElementById('form');const input=document.getElementById('input');const send=document.getElementById('send');const messages=document.getElementById('messages');const suggest=document.getElementById('suggest');const welcome=document.getElementById('welcome');const state=document.getElementById('state');const ws=document.getElementById('ws');
function add(text,role){welcome.style.display='none';suggest.style.display='none';const row=document.createElement('div');row.className='row '+role;const av=document.createElement('div');av.className='avatar';av.textContent=role==='user'?'You':'C';const b=document.createElement('div');b.className='bubble';b.textContent=text;row.append(av,b);messages.append(row);row.scrollIntoView({behavior:'smooth',block:'end'});}
function activity(items,error=false){const box=document.createElement('div');box.className='activity'+(error?' error':'');const title=document.createElement('div');title.className='activity-title';title.textContent=error?'Error':'Agent activity';box.append(title);items.forEach(x=>{const line=document.createElement('div');line.className='line';line.textContent='• '+x;box.append(line)});messages.append(box);box.scrollIntoView({behavior:'smooth',block:'end'});}
form.addEventListener('submit',e=>{e.preventDefault();const text=input.value.trim();if(!text||send.disabled)return;add(text,'user');input.value='';input.style.height='auto';send.disabled=true;state.textContent='Working…';vscode.postMessage({type:'sendMessage',text});});
input.addEventListener('input',()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight,180)+'px'});input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit()}});document.getElementById('new').onclick=()=>vscode.postMessage({type:'clearChat'});document.getElementById('key').onclick=()=>vscode.postMessage({type:'setApiKey'});document.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{input.value=b.dataset.p;input.focus()});
window.addEventListener('message',e=>{const d=e.data||{};if(d.type==='agentState'){state.textContent=d.state==='working'?'Working…':'Ready';send.disabled=d.state==='working'}if(d.type==='workspace')ws.textContent=d.name;if(d.type==='agentActivity')activity(d.items||[]);if(d.type==='agentReply'){add(d.text,'assistant');send.disabled=false;input.focus()}if(d.type==='agentError'){activity([d.text],true);send.disabled=false;state.textContent='Ready';input.focus()}if(d.type==='clearChat'){messages.innerHTML='';welcome.style.display='block';suggest.style.display='grid';state.textContent='Ready';send.disabled=false;input.focus()}});input.focus();
</script></body></html>`;
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < 32; i++) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}

export function deactivate() {}
