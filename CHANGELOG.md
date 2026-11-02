# Changelog

All notable changes to AEGIS. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [2.0.0] — 2026-11-02

### Added

**OpenCode / Claude-style features (all E2E-tested live):**

- **Skills (Claude-style)** — markdown skills with YAML frontmatter in `skills/` or `<workspace>/skills/`;
  loaded on demand via the `load_skill` tool and auto-listed in the system prompt (`src/skills.js`).
  Built-in: `code-review`, `security-audit`.
- **Plan mode** — the agent drafts a read-only plan first; execution starts only after you approve
  it. Rejecting changes nothing. Plan tokens are counted in task usage. Toggle in Settings.
- **Hooks (OpenCode-style)** — `onTaskStart` / `onTool` / `onTaskDone` shell commands with env vars
  (`AEGIS_HOOK`, `AEGIS_TASK_ID`, `AEGIS_TOOL`, `AEGIS_DETAIL`, `AEGIS_STATUS`, `AEGIS_SUMMARY`),
  30s timeout. Configurable in Settings → Hooks.
- **TUI** — `npm run tui`: full terminal client with streaming output, approval prompts, and
  `/status /models /model /agent /ask /auto /plan /approve /deny /stop /exit` commands.
- **Settings UI** — Plan-mode toggle and Hooks card in the web renderer.
- **GitHub bot** — the existing token-protected webhook now understands `X-GitHub-Event`:
  pushes are reviewed, failed workflow runs get a proposed fix, new issues are triaged,
  pings answered. (`githubPrompt()` in `server.js`)
- **Auto-update** — packaged builds check GitHub Releases on start via `electron-updater`,
  download in background, and prompt once before installing (`setupAutoUpdates()`).
- **VS Code extension** — `vscode-extension/` with status bar (queue/cost), `AEGIS: New Task`,
  `AEGIS: Open Panel` (full UI webview), `aegis.url` setting. Packaged as `aegis-2.0.0.vsix`.

### Fixed

- **Hooks with quoted paths** — `execFile('cmd.exe', …)` mangled inner quotes, so hooks writing
  to paths like `"C:\…\hook-test.log"` silently failed. Now runs through `exec(String(cmd))`;
  verified live (`start t-…` / `done done` lines in the log).
- **Plan-reject controller leak** — rejecting a plan now deletes the task's AbortController
  from the registry (previously left a dangling entry).
- **Failed/cancelled tasks skipped hooks** — `onTaskDone` now fires with
  `AEGIS_STATUS=failed|cancelled` too, not only on success.
- **Auto-update never ran on real installs** — electron-builder only writes
  `app-update.yml` for the **NSIS** target, so the portable-only build always failed
  with `ENOENT … app-update.yml`. The build now produces both `AEGIS-Setup` (NSIS,
  self-updating) and `AEGIS-Portable`, and the updater skips itself gracefully on
  portable builds (they extract to `%TEMP%` and cannot self-replace).

### Verified (test evidence, 2026-11-02)

- `node --test` — **11/11 PASS** (sandbox, edit round-trips, dangerous-command blocklist,
  read-only mode).
- Feature E2E (`tools/feature-e2e.js`) — **3/3 PASS**:
  - Skills: agent called `load_skill` → `SKILL=security-audit`.
  - Plan mode: `kind: plan` approval captured → approved → target file created.
  - Hooks: `start t-ceb68c8a` + `done done` written for both lifecycle events.
- TUI smoke (`tools/tui-smoke.js`) — PASS (23 models listed live, plan toggle works).
- Settings UI — rendered in browser, 0 console errors.
- Build — `npm run build` → `dist\AEGIS-Portable-2.0.0.exe` (unsigned: no code-signing cert).

### Security

- Repository secret scan clean (no API keys, tokens, or private keys in tracked files).
- `.gitignore` hardened: `node_modules/`, `dist/`, `*.vsix`, `*.log`, `.env*`, `*.key`, `*.pem`,
  `.aegis/`.
- API keys remain DPAPI-encrypted at rest; server binds to localhost only.

### Removed

- `legacy/` (dead v1 Electron shell) and `login/` (abandoned login demo) — stale files deleted.
