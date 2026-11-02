# AEGIS 2.0 — local AI coding agent (Windows)

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![version](https://img.shields.io/badge/version-2.0.0-purple)](https://github.com/arpitsingh404/aegis)
[![models](https://img.shields.io/badge/models-23%20%2F%2010%20providers-brightgreen)](#models)

A premium, **local-first** AI coding agent for Windows: chat with a real agent that
reads your files, edits them, runs commands, controls the screen, and keeps full
conversation history — with sessions, automatic context compaction, approvals,
budget guards, and a desktop EXE.

Everything runs on your machine. The only network calls go to the model provider
you choose (DeepSeek, OpenAI, Claude, Gemini, Groq, Ollama, …).

```
Desktop app (Electron)  ─┐
localhost:7791 web UI   ─┼─►  server.js  ─►  agent loop  ─►  tools (files/shell/git/web/screen)
AEGIS TUI (terminal)    ─┤        │
VS Code extension       ─┘        └─►  provider API (OpenAI / Anthropic / Gemini protocols)
```

## Features

- **23 models / 10+ providers** — DeepSeek, OpenAI, Anthropic Claude, Google Gemini, Groq,
  OpenRouter, Ollama (local), xAI, Mistral, Together, Cerebras, Perplexity, Moonshot, Zhipu,
  DeepInfra + custom OpenAI-compatible endpoints. Automatic fallback between providers.
- **Agent roles** — Planner, Coder, Reviewer, Tester, Researcher, Computer (mouse/keyboard).
- **Approvals** — ask / auto / read-only modes; every write and shell command can require
  a click. Destructive Windows commands are always blocked (belt & suspenders).
- **Plan mode** — the agent drafts a plan first; you approve it before anything is touched.
- **Skills** (Claude-style) — drop markdown files in `skills/` (or `<workspace>/skills/`),
  the agent loads them on demand with `load_skill`.
- **Hooks** — run your own shell commands on `onTaskStart` / `onTool` / `onTaskDone`
  with `AEGIS_TASK_ID`, `AEGIS_STATUS`, … env vars.
- **TUI** — `npm run tui`: a full terminal client (streaming, approvals, `/model`, `/plan`).
- **VS Code extension** — status bar, one-shot tasks, full panel inside VS Code
  (`vscode-extension/aegis-2.0.0.vsix`).
- **Automations** — generic webhook (`/api/hook/<token>`), **GitHub bot** (push / CI-fail /
  issue events become tasks), cron-style schedules, Telegram channel.
- **Budget guards** — per-task token and cost limits with automatic stop + summary.
- **Crash recovery** — tasks interrupted by a restart are marked failed, never stuck `running`.
- **Sessions** — history, auto-compaction at a token threshold, memory, project rules
  (AGENTS.md / CLAUDE.md / opencode.json).
- **Usage dashboard** — real token counts and USD cost per task and per day.
- **Security** — API keys encrypted with Windows DPAPI, localhost-only server,
  CSP-locked renderer, SSH-style command allow/deny hygiene.
- **Auto-update** — packaged builds check GitHub Releases and install on restart.

## Install

**Desktop (recommended)**

```powershell
# from the latest GitHub Release, or build yourself:
npm install
npm run build            # dist\AEGIS-Portable-2.0.0.exe  (single file, no install)
npm run build:installer  # dist\AEGIS-Setup-2.0.0.exe
```

**Development**

```powershell
npm start                # Electron window on http://127.0.0.1:7791
npm run web              # headless server only (UI on http://127.0.0.1:7777)
npm run tui              # terminal client
node --test              # test suite
```

**VS Code extension**

```powershell
cd vscode-extension
npx @vscode/vsce package
code --install-extension aegis-2.0.0.vsix
```

## Setup

1. Open **Settings** in the app and paste your provider key (e.g. DeepSeek).
   Keys are stored encrypted with Windows DPAPI — never as plain text.
2. Pick a **workspace folder** — the agent can only touch files inside it.
3. Choose an approval mode: `ask` (recommended), `auto`, or `read-only`.

## GitHub bot

1. Settings → Automations shows your webhook URL:
   `http://127.0.0.1:7791/api/hook/<token>`
2. In your GitHub repo: **Settings → Webhooks → Add webhook**,
   paste the URL, content type `application/json`, and subscribe to
   **pushes, workflow runs and issues**.
3. Pushes review the incoming commits, failed CI runs propose a fix,
   new issues get triaged — each as an agent task you can watch live.

> The endpoint is token-protected and binds to localhost. To receive GitHub
> events you need a tunnel (e.g. `ngrok http 7791`) or a self-hosted relay.

## Models

| Provider | Models |
|---|---|
| DeepSeek | deepseek-flash, deepseek-v4-pro |
| OpenAI | gpt-4o-mini, gpt-4o, o4-mini |
| Anthropic | claude-sonnet-4-5, claude-haiku-4-5 |
| Google | gemini-2.5-flash, gemini-2.5-pro |
| Groq / Together / Cerebras / DeepInfra | llama-3.3-70b variants |
| Ollama (local, no key) | qwen2.5-coder:7b, llama3.2:3b |
| + xAI, Mistral, OpenRouter, Perplexity, Moonshot, Zhipu, custom endpoints | |

## Project layout

```
server.js            HTTP API + SSE + task queue + webhook/schedules
electron-main.js     desktop shell, crash log, auto-updater
tui.js               terminal client (npm run tui)
src/ai.js            agent loop, roles, budgets, fallback
src/providers.js     10+ provider adapters (OpenAI / Anthropic / Gemini)
src/tools.js         file/shell/git/web/screen tools + dangerous-command blocklist
src/skills.js        Claude-style skill loader
src/store.js         JSON store, DPAPI key encryption, settings
renderer/            web UI (vanilla JS, CSP-locked)
skills/              built-in skills (code-review, security-audit)
vscode-extension/    VS Code thin client (packaged .vsix)
test/                node --test suite
```

## Tests

```powershell
node --test
```

Covers workspace sandboxing, edit round-trips, non-unique match refusal,
destructive-command blocking, dangerous-pattern coverage, safe commands and
read-only mode.

## License

[MIT](LICENSE) © Arpit Singh
