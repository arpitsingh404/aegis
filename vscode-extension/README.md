# AEGIS for VS Code

Thin client for the local **AEGIS** coding-agent server. Gives you:

- **Status bar** — live queue / running / idle + today's cost (updates every 10s)
- **AEGIS: New Task** — type a task, it runs on your machine with the full agent
- **AEGIS: Open Panel** — the complete AEGIS UI inside a VS Code tab
- **AEGIS: Show Status** — one-line queue/usage summary

## Requirements

The AEGIS desktop app (or `npm run web`) must be running on `http://127.0.0.1:7791`.

## Install

```powershell
cd vscode-extension
npx @vscode/vsce package          # builds aegis-2.0.0.vsix
code --install-extension aegis-2.0.0.vsix
```

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `aegis.url` | `http://127.0.0.1:7791` | AEGIS server base URL |

No data leaves your machine — the extension only talks to localhost.
