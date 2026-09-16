# Codex Clone

A clean VS Code extension interface for a Codex-powered coding agent.

## Current status

The repository currently contains the VS Code extension base, a polished chat interface, workspace-aware UI, agent activity panel, suggestions, and a ready-to-use Extension Development Host launch configuration.

The Codex model/agent layer is intentionally separate and will be connected next.

## Run locally

```bash
npm install
npm run compile
```

Open this folder in VS Code and press **F5**. The included `.vscode/launch.json` launches the Extension Development Host automatically.

Then open the Command Palette and run:

`Codex Clone: Open Chat`

Do not run `node out/extension.js` directly. VS Code extensions must run inside the VS Code Extension Host because the `vscode` API is provided by VS Code.

## Package as VSIX

```bash
npm run package
```

This creates a `.vsix` file in the project root.

## Clone on another laptop

```bash
git clone https://github.com/InukaMinsara/Codex-Clone.git
cd Codex-Clone
npm install
npm run compile
```

Then open the folder in VS Code and press **F5**.
