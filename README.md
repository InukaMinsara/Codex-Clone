# Codex Clone

A small Codex-style coding chat project with two targets:

- **VS Code extension** — a chat UI powered by xKiro.
- **Web app** — the same simple chat experience in a browser, using a local server as the secure xKiro proxy.

The current model is `openai/gpt-5.3-codex-spark` through xKiro.

## VS Code extension

```bash
npm install
npm run compile
```

Open this repository in VS Code and press **F5** to launch the Extension Development Host. Then run `Codex Clone: Open Chat` from the Command Palette.

Do not run `node out/extension.js` directly. VS Code extensions must run inside the VS Code Extension Host because the `vscode` API is provided by VS Code.

## Web app

1. Copy `.env.example` to `.env`.
2. Put your xKiro key in `.env` as `XKIRO_API_KEY`.
3. Start the local server:

```bash
npm run web
```

4. Open `http://localhost:8787`.

The browser never receives the xKiro API key. The local server sends requests to xKiro's OpenAI-compatible `/v1/chat/completions` endpoint.

## Package the extension

```bash
npm run package
```

This creates a `.vsix` file in the repository root.

## Clone on another laptop

```bash
git clone https://github.com/InukaMinsara/Codex-Clone.git
cd Codex-Clone
npm install
npm run compile
```

For the website, create a local `.env` from `.env.example`, then run `npm run web`.
