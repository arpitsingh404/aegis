#!/usr/bin/env node
'use strict';

/**
 * AEGIS TUI — OpenCode-style terminal client for the local AEGIS server.
 * Zero dependencies: node tui.js   (or: npm run tui)
 *
 * Commands:
 *   /help              show help
 *   /new               start a fresh session
 *   /status            queue, usage, plan mode, approval mode
 *   /models            list available models
 *   /model <id>        switch model (e.g. /model deepseek:deepseek-v4-pro)
 *   /agent <name>      coder | planner | reviewer | tester | researcher | computer
 *   /ask | /auto       approval mode
 *   /plan [on|off]     plan mode (plan → approve → execute)
 *   /approve | /deny   answer the pending approval
 *   /stop              abort running tasks
 *   /exit              quit
 */

const http = require('http');

const BASE = process.env.AEGIS_URL || 'http://127.0.0.1:7791';
const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m'
};

let sessionId = null;
let agent = 'coder';
let model = '';
let pendingApproval = null;
let streaming = false;
let buffer = '';

function say(text = '') {
  process.stdout.write(text + '\n');
}

function api(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      BASE + p,
      {
        method,
        headers: { 'Content-Type': 'application/json', 'Content-Length': data ? Buffer.byteLength(data) : 0 }
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
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function endStream() {
  if (streaming) {
    process.stdout.write(C.reset + '\n');
    streaming = false;
    buffer = '';
  }
}

function handleEvent(ev) {
  switch (ev.type) {
    case 'delta':
      if (!streaming) {
        streaming = true;
        buffer = '';
        process.stdout.write(`\n${C.cyan}${C.bold}▸ ${model || 'model'}${C.reset} `);
      }
      buffer += ev.text;
      process.stdout.write(ev.text);
      break;
    case 'task': {
      endStream();
      const t = ev.task || {};
      if (t.status === 'running') say(`${C.yellow}… running${C.reset} ${C.dim}${String(t.title || '').slice(0, 80)}${C.reset}`);
      else if (t.status === 'done') say(`${C.green}✓ done${C.reset} ${C.dim}$${Number(t.cost || 0).toFixed(4)} · ${t.tokensIn || 0} in / ${t.tokensOut || 0} out${C.reset}`);
      else if (t.status === 'failed') say(`${C.red}✗ failed${C.reset} ${C.dim}${t.error || ''}${C.reset}`);
      else if (t.status === 'cancelled') say(`${C.dim}⊘ cancelled${C.reset}`);
      break;
    }
    case 'event': {
      const e = ev.event || {};
      if (e.type === 'approval') break;
      const mark = e.status === 'error' ? `${C.red}✗${C.reset}` : e.status === 'warn' ? `${C.yellow}!${C.reset}` : `${C.blue}·${C.reset}`;
      if (e.type === 'tool' || e.type === 'plan' || e.type === 'done' || e.type === 'budget' || e.type === 'error') {
        endStream();
        say(`  ${mark} ${C.bold}${e.title}${C.reset}${e.detail ? ` ${C.dim}${String(e.detail).slice(0, 140)}${C.reset}` : ''}`);
      }
      break;
    }
    case 'approval': {
      endStream();
      pendingApproval = ev.request;
      say(
        `\n${C.magenta}${C.bold}APPROVAL${C.reset} ${ev.request.title}\n` +
          `${C.dim}${String(ev.request.detail || '').slice(0, 600)}${C.reset}\n` +
          `${C.yellow}Type /approve or /deny${C.reset}`
      );
      break;
    }
    case 'approval-resolved':
      if (pendingApproval && pendingApproval.id === ev.id) pendingApproval = null;
      break;
    case 'message':
      break;
    case 'refresh':
      break;
    default:
      break;
  }
}

function openStream() {
  const req = http.get(BASE + '/api/stream', (res) => {
    let lineBuf = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      lineBuf += chunk;
      const lines = lineBuf.split('\n');
      lineBuf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        try {
          handleEvent(JSON.parse(line.slice(5).trim()));
        } catch (_) {}
      }
    });
    res.on('end', () => {
      setTimeout(openStream, 3000);
    });
    res.on('error', () => setTimeout(openStream, 3000));
  });
  req.on('error', () => setTimeout(openStream, 5000));
  return req;
}

async function refreshState() {
  try {
    const s = await api('GET', '/api/state');
    sessionId = sessionId || (s.sessions && s.sessions[0] && s.sessions[0].id) || null;
    model = s.settings.model || model;
    return s;
  } catch (_) {
    return null;
  }
}

async function send(text) {
  try {
    const r = await api('POST', '/api/chat', { text, agent, model: model || undefined, sessionId: sessionId || undefined });
    if (r.sessionId) sessionId = r.sessionId;
    if (r.error) say(`${C.red}${r.error}${C.reset}`);
  } catch (err) {
    say(`${C.red}server unreachable: ${err.message}${C.reset} — is AEGIS running?`);
  }
}

async function command(line) {
  const [cmd, ...rest] = line.slice(1).split(/\s+/);
  const arg = rest.join(' ');
  switch (cmd.toLowerCase()) {
    case 'help':
      say(`${C.bold}commands${C.reset}  /new /status /models /model <id> /agent <name> /ask /auto /plan [on|off] /approve /deny /stop /exit`);
      break;
    case 'new':
      sessionId = null;
      say(`${C.green}new session${C.reset}`);
      break;
    case 'status': {
      const s = await refreshState();
      if (!s) return say(`${C.red}server down${C.reset}`);
      const q = (s.tasks || []).filter((t) => t.status === 'queued').length;
      const run = (s.tasks || []).filter((t) => t.status === 'running').length;
      say(
        `${C.bold}status${C.reset} ${C.dim}model=${s.settings.model} approval=${s.settings.approvalMode} plan=${s.settings.planMode ? 'on' : 'off'}${C.reset}`
      );
      say(
        `${C.dim}queue=${q} running=${run} done=${(s.tasks || []).filter((t) => t.status === 'done').length} · today $${Number(
          (s.usage || {}).cost || 0
        ).toFixed(4)} · workspace=${(s.workspace || {}).path || 'none'}${C.reset}`
      );
      break;
    }
    case 'models': {
      const s = await refreshState();
      if (!s) return;
      for (const m of s.models || []) say(`  ${C.cyan}${m.key || m.id}${C.reset} ${C.dim}${m.label || ''} (${m.context})${C.reset}`);
      break;
    }
    case 'model':
      if (!arg) return say(`${C.yellow}usage: /model <provider:model>${C.reset}`);
      model = arg;
      await api('POST', '/api/settings', { model: arg }).catch(() => {});
      say(`${C.green}model → ${arg}${C.reset}`);
      break;
    case 'agent':
      if (!arg) return say(`${C.yellow}usage: /agent <coder|planner|reviewer|tester|researcher|computer>${C.reset}`);
      agent = arg;
      say(`${C.green}agent → ${arg}${C.reset}`);
      break;
    case 'ask':
    case 'auto': {
      const mode = cmd === 'ask' ? 'ask' : 'auto';
      await api('POST', '/api/settings', { approvalMode: mode });
      say(`${C.green}approval → ${mode}${C.reset}`);
      break;
    }
    case 'plan': {
      const s = await refreshState();
      let on = !(s && s.settings.planMode);
      if (arg === 'on') on = true;
      if (arg === 'off') on = false;
      await api('POST', '/api/settings', { planMode: on });
      say(`${C.green}plan mode → ${on ? 'on' : 'off'}${C.reset}`);
      break;
    }
    case 'approve':
    case 'allow': {
      if (!pendingApproval) return say(`${C.yellow}nothing pending${C.reset}`);
      await api('POST', '/api/approve', { id: pendingApproval.id, decision: 'allow' });
      say(`${C.green}approved${C.reset}`);
      pendingApproval = null;
      break;
    }
    case 'deny':
      if (!pendingApproval) return say(`${C.yellow}nothing pending${C.reset}`);
      await api('POST', '/api/approve', { id: pendingApproval.id, decision: 'deny' });
      say(`${C.yellow}denied${C.reset}`);
      pendingApproval = null;
      break;
    case 'stop':
      await api('POST', '/api/stop', {});
      say(`${C.yellow}stopped${C.reset}`);
      break;
    case 'exit':
    case 'quit':
      say('bye');
      process.exit(0);
      break;
    default:
      say(`${C.red}unknown command /${cmd} — try /help${C.reset}`);
  }
}

async function main() {
  const readline = require('readline');
  say(`${C.bold}${C.magenta}AEGIS TUI${C.reset} ${C.dim}· ${BASE}${C.reset}`);
  const s = await refreshState();
  if (s) {
    say(`${C.dim}model=${s.settings.model} · approval=${s.settings.approvalMode} · plan=${s.settings.planMode ? 'on' : 'off'} · workspace=${(s.workspace || {}).path || 'none'}${C.reset}`);
    say(`${C.dim}type a message to talk, /help for commands${C.reset}`);
  } else {
    say(`${C.red}server not reachable${C.reset} — start AEGIS first.`);
  }
  openStream();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: `${C.green}you › ${C.reset}` });
  rl.prompt();
  rl.on('line', async (line) => {
    const text = line.trim();
    if (!text) return rl.prompt();
    if (text.startsWith('/')) await command(text);
    else await send(text);
    rl.prompt();
  });
  rl.on('close', () => {
    say('bye');
    process.exit(0);
  });
}

main();
