import * as vscode from 'vscode';

const XKIRO_ENDPOINT = 'https://api.xkiro.com/v1/chat/completions';
const SECRET_KEY = 'codexClone.xkiroApiKey';
const DEFAULT_MODEL = 'openai/gpt-5.3-codex-spark';
type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codexClone.openChat', () => openChat(context)),
    vscode.commands.registerCommand('codexClone.setApiKey', () => setApiKey(context)),
    vscode.commands.registerCommand('codexClone.clearApiKey', () => clearApiKey(context)),
  );
}

async function setApiKey(context: vscode.ExtensionContext) {
  const key = await vscode.window.showInputBox({
    prompt: 'Enter your xKiro API key',
    password: true,
    ignoreFocusOut: true,
    placeHolder: 'sk-xt-…',
  });
  if (!key?.trim()) return;
  await context.secrets.store(SECRET_KEY, key.trim());
  vscode.window.showInformationMessage('Codex Clone: xKiro API key saved securely.');
}

async function clearApiKey(context: vscode.ExtensionContext) {
  await context.secrets.delete(SECRET_KEY);
  vscode.window.showInformationMessage('Codex Clone: xKiro API key cleared.');
}

async function openChat(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel(
    'codexCloneChat',
    'Codex Clone',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true },
  );
  panel.webview.html = getWebviewContent(panel.webview);

  const history: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are Codex Clone, a coding assistant inside VS Code. Be practical and concise. You are currently chat-only: do not claim to edit files or run commands because tool access has not been enabled yet.',
    },
  ];
  let busy = false;

  panel.webview.onDidReceiveMessage(async (message) => {
    if (message?.type === 'setApiKey') {
      await setApiKey(context);
      return;
    }
    if (message?.type === 'clearChat') {
      history.splice(1);
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
        text: 'xKiro API key is not set. Use Command Palette → Codex Clone: Set xKiro API Key.',
      });
      return;
    }

    busy = true;
    panel.webview.postMessage({ type: 'agentState', state: 'working' });
    const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name ?? 'No workspace open';
    panel.webview.postMessage({
      type: 'workspace',
      name: workspaceName,
    });
    panel.webview.postMessage({
      type: 'agentActivity',
      items: ['Request received', 'Connecting to xKiro', 'Generating with GPT-5.3-Codex-Spark…'],
    });

    history.push({ role: 'user', content: text });

    try {
      const reply = await callXKiro(apiKey, history, workspaceName);
      history.push({ role: 'assistant', content: reply });
      panel.webview.postMessage({ type: 'agentActivity', items: ['xKiro request completed'] });
      panel.webview.postMessage({ type: 'agentReply', text: reply });
    } catch (error) {
      history.pop();
      panel.webview.postMessage({ type: 'agentError', text: formatError(error) });
    } finally {
      busy = false;
      panel.webview.postMessage({ type: 'agentState', state: 'ready' });
    }
  }, undefined, context.subscriptions);
}

async function callXKiro(apiKey: string, history: ChatMessage[], workspaceName: string): Promise<string> {
  const config = vscode.workspace.getConfiguration('codexClone');
  const model = config.get<string>('model', DEFAULT_MODEL) || DEFAULT_MODEL;
  const reasoningEffort = config.get<string>('reasoningEffort', 'medium') || 'medium';
  const messages = [
    history[0],
    {
      role: 'system' as const,
      content: `Current VS Code workspace: ${workspaceName}`,
    },
    ...history.slice(1).slice(-12),
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(XKIRO_ENDPOINT, {
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
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`xKiro returned an invalid response (HTTP ${response.status}).`);
    }

    if (!response.ok) {
      throw new Error(data?.error?.message || `xKiro request failed (HTTP ${response.status}).`);
    }

    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('xKiro returned an empty response.');
    }
    return content.trim();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('xKiro request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong while contacting xKiro.';
}

function getWebviewContent(webview: vscode.Webview) {
  const nonce = getNonce();
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'`;
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Codex Clone</title><style>
:root{color-scheme:dark;--bg:#080a0d;--side:#0d1014;--panel:#11151a;--border:#252b33;--text:#eef1f5;--muted:#8b95a3;--user:#1c222a;--green:#7ee787}*{box-sizing:border-box}html,body{height:100%}body{margin:0;background:var(--bg);color:var(--text);font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}.app{height:100vh;display:grid;grid-template-columns:225px minmax(0,1fr)}.side{background:var(--side);border-right:1px solid var(--border);display:flex;flex-direction:column}.brand{height:58px;display:flex;align-items:center;gap:10px;padding:0 16px;border-bottom:1px solid var(--border);font-weight:700}.logo{width:28px;height:28px;border-radius:9px;background:#f3f4f5;color:#111;display:grid;place-items:center;font-weight:900}.sidein{padding:14px 10px}.new,.nav{width:100%;padding:9px 10px;border-radius:9px;text-align:left;cursor:pointer}.new{background:#12161b;border:1px solid var(--border);color:#ddd}.nav{background:transparent;border:1px solid transparent;color:#c4cad2}.nav:hover,.nav.active{background:#171b21;border-color:var(--border);color:#fff}.label{margin:19px 8px 8px;color:#626b77;font-size:10px;text-transform:uppercase;letter-spacing:.08em}.bottom{margin-top:auto;border-top:1px solid var(--border);padding:12px}.ws{color:var(--muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.status{margin-top:7px;color:var(--muted);font-size:11px}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--green);margin-right:7px}.main{display:grid;grid-template-rows:58px minmax(0,1fr) auto;min-width:0}.top{border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 18px}.pill{border:1px solid var(--border);border-radius:999px;padding:4px 8px;color:var(--muted);font-size:10px;margin-left:8px}.model{border:1px solid var(--border);border-radius:8px;padding:6px 9px;color:#cbd1d9;font-size:11px}.content{overflow:auto;min-height:0;padding:0 22px}.inner{max-width:860px;margin:auto;padding:52px 0 35px}.welcome{text-align:center;margin:7vh 0 40px}.mark{width:44px;height:44px;display:grid;place-items:center;margin:0 auto 15px;background:#f3f4f5;color:#111;border-radius:13px;font-weight:900}.welcome h1{margin:0 0 8px;font-size:25px;letter-spacing:-.025em}.welcome p{margin:0;color:var(--muted)}.messages{display:flex;flex-direction:column;gap:18px}.row{display:flex;gap:10px;align-items:flex-start}.row.user{justify-content:flex-end}.avatar{width:26px;height:26px;flex:0 0 26px;display:grid;place-items:center;border-radius:8px;background:#181c22;font-size:9px;font-weight:800}.user .avatar{order:2;background:#eceef0;color:#111}.bubble{max-width:min(80%,720px);padding:11px 13px;background:var(--panel);border:1px solid var(--border);border-radius:12px;line-height:1.55;white-space:pre-wrap}.user .bubble{background:var(--user)}.activity{margin:0 36px;padding:9px 11px;border:1px solid var(--border);background:#0c1014;border-radius:11px}.activity-title{font-size:11px;color:#cbd1d8;margin-bottom:5px}.line{font-size:11px;color:var(--muted);padding:2px 0}.error{border-color:#5c3030;color:#ffb5b5}.suggest{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;max-width:650px;margin:auto}.sbtn{padding:11px;text-align:left;background:#0d1116;border:1px solid var(--border);border-radius:10px;color:#c0c7d0;cursor:pointer}.sbtn:hover{background:#171b21}.sbtn b{display:block;color:#e7e9ec;font-size:11px;margin-bottom:4px}.sbtn span{font-size:10px;color:#626b77}.composer-wrap{padding:12px 20px 17px}.composer{max-width:860px;margin:auto}.box{display:flex;gap:8px;align-items:flex-end;background:var(--panel);border:1px solid #303640;border-radius:14px;padding:8px}textarea{flex:1;min-height:45px;max-height:180px;resize:none;border:0;outline:0;background:transparent;color:var(--text);padding:8px}.send{width:39px;height:39px;border:0;border-radius:10px;background:#f3f4f5;color:#111;cursor:pointer;font-weight:900}.send:disabled{opacity:.45}.meta{text-align:center;color:#555e69;font-size:10px;padding-top:7px}@media(max-width:760px){.app{grid-template-columns:1fr}.side{display:none}.content{padding:0 14px}.suggest{grid-template-columns:1fr}.bubble{max-width:88%}.composer-wrap{padding-left:12px;padding-right:12px}}
</style></head><body><div class="app"><aside class="side"><div class="brand"><div class="logo">C</div>Codex Clone</div><div class="sidein"><button class="new" id="new">＋ New chat</button><div class="label">Workspace</div><button class="nav active">⌂ Current project</button><button class="nav">◫ Files</button><button class="nav">◌ Activity</button><div class="label">Settings</div><button class="nav" id="key">⚿ xKiro API key</button></div><div class="bottom"><div class="ws" id="ws">Current workspace</div><div class="status"><span class="dot"></span><span id="state">Ready</span></div></div></aside><main class="main"><header class="top"><div><strong>Chat</strong><span class="pill">Agent</span></div><div class="model">GPT-5.3-Codex-Spark</div></header><section class="content"><div class="inner"><div class="welcome" id="welcome"><div class="mark">C</div><h1>What are we building?</h1><p>Ask Codex to help you understand or build your project.</p></div><div class="messages" id="messages"></div><div class="suggest" id="suggest"><button class="sbtn" data-p="Explain this project and its main files."><b>Understand my project</b><span>Analyze the workspace</span></button><button class="sbtn" data-p="Help me find a likely bug in this project."><b>Find a bug</b><span>Reason about the code</span></button><button class="sbtn" data-p="Suggest a useful feature I can build next."><b>Plan a feature</b><span>Get an implementation idea</span></button></div></div></section><div class="composer-wrap"><form class="composer" id="form"><div class="box"><textarea id="input" rows="1" placeholder="Ask Codex to build something…"></textarea><button class="send" id="send" type="submit">↑</button></div><div class="meta">xKiro · openai/gpt-5.3-codex-spark · Enter to send</div></form></div></main></div><script nonce="${nonce}">
const v=acquireVsCodeApi(),f=document.getElementById('form'),i=document.getElementById('input'),s=document.getElementById('send'),m=document.getElementById('messages'),w=document.getElementById('welcome'),g=document.getElementById('suggest'),st=document.getElementById('state'),ws=document.getElementById('ws');function add(t,r,e=false){w.style.display='none';g.style.display='none';const q=document.createElement('div');q.className='row '+r;const a=document.createElement('div');a.className='avatar';a.textContent=r==='user'?'You':'C';const b=document.createElement('div');b.className='bubble'+(e?' error':'');b.textContent=t;q.append(a,b);m.append(q);q.scrollIntoView({behavior:'smooth',block:'end'})}function act(xs,e=false){const q=document.createElement('div');q.className='activity'+(e?' error':'');const h=document.createElement('div');h.className='activity-title';h.textContent=e?'Error':'Agent activity';q.append(h);xs.forEach(x=>{const l=document.createElement('div');l.className='line';l.textContent='• '+x;q.append(l)});m.append(q);q.scrollIntoView({behavior:'smooth',block:'end'})}function send(t){t=String(t||'').trim();if(!t||s.disabled)return;add(t,'user');i.value='';i.style.height='auto';s.disabled=true;st.textContent='Working…';v.postMessage({type:'sendMessage',text:t})}f.onsubmit=e=>{e.preventDefault();send(i.value)};i.oninput=()=>{i.style.height='auto';i.style.height=Math.min(i.scrollHeight,180)+'px'};i.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();f.requestSubmit()}};document.getElementById('new').onclick=()=>v.postMessage({type:'clearChat'});document.getElementById('key').onclick=()=>v.postMessage({type:'setApiKey'});document.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>send(b.dataset.p));window.onmessage=e=>{const d=e.data||{};if(d.type==='agentState'){st.textContent=d.state==='working'?'Working…':'Ready';s.disabled=d.state==='working'}if(d.type==='workspace')ws.textContent=d.name;if(d.type==='agentActivity')act(d.items||[]);if(d.type==='agentReply'){add(d.text,'assistant');s.disabled=false;i.focus()}if(d.type==='agentError'){act([d.text],true);s.disabled=false;st.textContent='Ready';i.focus()}if(d.type==='clearChat'){m.replaceChildren();w.style.display='block';g.style.display='grid';st.textContent='Ready';s.disabled=false;i.focus()}};i.focus();
</script></body></html>`;
}

function getNonce() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < 32; i++) value += chars.charAt(Math.floor(Math.random() * chars.length));
  return value;
}

export function deactivate() {}
