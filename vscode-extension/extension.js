'use strict';
/**
 * AEGIS VS Code extension — a thin client for the local AEGIS server.
 * Status bar (queue/running/offline), one-shot tasks, full panel (webview).
 */
const vscode = require('vscode');
const http = require('http');

let statusItem;
let pollTimer;

function baseUrl() {
  const cfg = vscode.workspace.getConfiguration('aegis');
  return String(cfg.get('url') || 'http://127.0.0.1:7791').replace(/\/$/, '');
}

function api(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(baseUrl() + p);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: { 'Content-Type': 'application/json', 'Content-Length': data ? Buffer.byteLength(data) : 0 },
        timeout: 8000
      },
      (res) => {
        let buf = '';
        res.on('data', (d) => (buf += d));
        res.on('end', () => {
          try {
            resolve(JSON.parse(buf || '{}'));
          } catch (_) {
            resolve({ raw: buf });
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function refreshStatus() {
  try {
    const s = await api('GET', '/api/state');
    const running = (s.tasks || []).filter((t) => t.status === 'running').length;
    const queued = (s.tasks || []).filter((t) => t.status === 'queued').length;
    const cost = Number(((s.usage || {}).cost) || 0).toFixed(3);
    if (running) {
      statusItem.text = `$(sync~spin) AEGIS · ${running} running`;
      statusItem.backgroundColor = undefined;
    } else if (queued) {
      statusItem.text = `$(clock) AEGIS · ${queued} queued`;
      statusItem.backgroundColor = undefined;
    } else {
      statusItem.text = `$(hubot) AEGIS · idle · $${cost}`;
      statusItem.backgroundColor = undefined;
    }
    statusItem.tooltip = `AEGIS online — workspace ${(s.workspace || {}).path || 'none'} · model ${(s.settings || {}).model || ''}`;
  } catch (_) {
    statusItem.text = '$(debug-disconnect) AEGIS offline';
    statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    statusItem.tooltip = 'AEGIS server not reachable — start the AEGIS app.';
  }
}

function openPanel(context) {
  const panel = vscode.window.createWebviewPanel('aegisPanel', 'AEGIS', vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true
  });
  panel.webview.html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src http://127.0.0.1:* data:; script-src 'none'; style-src 'unsafe-inline'">
<style>html,body{margin:0;height:100%;background:#070510}iframe{border:0;width:100%;height:100%}</style>
</head><body><iframe src="${baseUrl()}/" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
</body></html>`;
}

async function newTask() {
  const text = await vscode.window.showInputBox({
    prompt: 'AEGIS task — describe what to build or fix',
    placeHolder: 'e.g. Fix the failing test in src/tools.test.js'
  });
  if (!text) return;
  try {
    const r = await api('POST', '/api/chat', { text, agent: 'coder' });
    const pick = await vscode.window.showInformationMessage(
      `AEGIS task started (${r.taskId || 'ok'})`,
      'Open panel'
    );
    if (pick === 'Open panel') vscode.commands.executeCommand('aegis.openPanel');
    refreshStatus();
  } catch (err) {
    vscode.window.showErrorMessage('AEGIS unreachable: ' + err.message + ' — is the AEGIS app running?');
  }
}

async function showStatus() {
  try {
    const s = await api('GET', '/api/state');
    const counts = ['running', 'queued', 'done', 'failed']
      .map((k) => `${k}: ${(s.tasks || []).filter((t) => t.status === k).length}`)
      .join('  ·  ');
    vscode.window.showInformationMessage(
      `AEGIS — ${counts} · $${Number(((s.usage || {}).cost) || 0).toFixed(4)} today · model ${(s.settings || {}).model}`
    );
  } catch (err) {
    vscode.window.showErrorMessage('AEGIS unreachable: ' + err.message);
  }
}

function activate(context) {
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  statusItem.command = 'aegis.status';
  statusItem.text = '$(hubot) AEGIS';
  statusItem.show();
  context.subscriptions.push(statusItem);

  context.subscriptions.push(vscode.commands.registerCommand('aegis.openPanel', () => openPanel(context)));
  context.subscriptions.push(vscode.commands.registerCommand('aegis.newTask', newTask));
  context.subscriptions.push(vscode.commands.registerCommand('aegis.status', showStatus));

  refreshStatus();
  pollTimer = setInterval(refreshStatus, 10000);
  context.subscriptions.push({ dispose: () => clearInterval(pollTimer) });
}

function deactivate() {
  if (pollTimer) clearInterval(pollTimer);
}

module.exports = { activate, deactivate };
