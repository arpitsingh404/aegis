'use strict';

/**
 * AEGIS coding agent — localhost server.
 * Node only, no dependencies. UI is served from /renderer.
 *
 *   node server.js            → http://127.0.0.1:7777
 *   AEGIS_PORT=8080 node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');
const { exec, execFile } = require('child_process');

const { Store } = require('./src/store');
const { runAgent, testConnection, ROLES, summarizeSession, estimateMessagesTokens, allModels, resolveModel } = require('./src/ai');
const { PROVIDERS, listRemoteModels } = require('./src/providers');

const PORT = Number(process.env.AEGIS_PORT || 7777);
const DATA_DIR = process.env.AEGIS_DATA || path.join(os.homedir(), '.aegis');
const ROOT = __dirname;
const RENDERER = path.join(ROOT, 'renderer');

const store = new Store(DATA_DIR);

// Drop abandoned empty chats (opened but never used).
try {
  const cutoff = Date.now() - 5 * 60 * 1000;
  const before = store.get().sessions.length;
  store.get().sessions = store.get().sessions.filter(
    (s) => s.messages.length > 0 || (s.createdAt || 0) > cutoff
  );
  if (store.get().sessions.length !== before) store.persist();
} catch (_) {}

// Recover tasks that were running when the app stopped.
try {
  const stale = store.get().tasks.filter((t) => t.status === 'running' || t.status === 'queued');
  for (const t of stale) {
    t.status = 'failed';
    t.error = 'Interrupted: the app restarted while this task was running.';
    t.endedAt = Date.now();
    if (t.sessionId) {
      store.addMessage(t.sessionId, 'assistant', 'Run interrupted — the app was closed while this task was working.', {
        taskId: t.id,
        error: true
      });
    }
  }
  if (stale.length) {
    store.addEvent({
      type: 'error',
      title: 'Interrupted on restart',
      detail: `${stale.length} task${stale.length === 1 ? '' : 's'} marked as failed.`,
      status: 'error'
    });
    store.persist();
  }
} catch (_) {}

// Start the Telegram channel if a token is already saved.
setTimeout(() => {
  try {
    const tgToken = store.getChannelKey('telegram');
    if (tgToken) startTelegram(tgToken);
  } catch (_) {}
}, 1500);

/* ------------------------------ plumbing ------------------------------ */

const clients = new Set();

function broadcast(payload) {
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try {
      res.write(line);
    } catch (_) {
      clients.delete(res);
    }
  }
}

function sendJson(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store'
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5e6) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (_) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const u = new URL(origin);
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost';
  } catch (_) {
    return false;
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(RENDERER, rel));
  if (!file.startsWith(RENDERER)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}

/* ------------------------------ workspace ------------------------------ */

function sh(cmd, cwd, timeout = 10000) {
  return new Promise((resolve) => {
    execFile('git', cmd, { cwd, timeout, windowsHide: true }, (err, stdout) => {
      resolve(err ? '' : String(stdout).trim());
    });
  });
}

function countFiles(dir, limit = 20000) {
  let count = 0;
  const skip = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '__pycache__', 'venv', 'target']);
  const walk = (d) => {
    if (count >= limit) return;
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const e of entries) {
      if (count >= limit) return;
      if (e.name.startsWith('.')) continue;
      if (e.isDirectory()) {
        if (skip.has(e.name)) continue;
        walk(path.join(d, e.name));
      } else count++;
    }
  };
  walk(dir);
  return count;
}

async function scanWorkspace(dir) {
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) throw new Error('Not a directory');
  const branch = await sh(['rev-parse', '--abbrev-ref', 'HEAD'], dir);
  const status = await sh(['status', '--short'], dir);
  return {
    path: path.resolve(dir),
    name: path.basename(path.resolve(dir)),
    branch: branch || '',
    dirty: status ? status.split('\n').filter(Boolean).length : 0,
    files: countFiles(dir),
    lastScan: Date.now()
  };
}

/* ------------------------------ approvals ------------------------------ */

const pending = new Map();

function pendingApprovals() {
  const out = [];
  for (const [id, entry] of pending.entries()) {
    if (entry && entry.request) out.push(Object.assign({ id }, entry.request));
  }
  return out;
}

function askApproval(task, request) {
  const settings = store.get().settings;
  if (settings.approvalMode === 'auto') return Promise.resolve(true);
  if (settings.approvalMode === 'readonly') return Promise.resolve(false);

  const id = 'ap-' + Math.random().toString(36).slice(2, 10);
  const payload = {
    id,
    taskId: task ? task.id : '',
    kind: request.kind,
    title: request.title,
    detail: request.detail,
    at: Date.now()
  };
  broadcast({ type: 'approval', request: payload });
  store.addAudit({ type: 'approval', taskId: payload.taskId, detail: `${request.title}: ${request.detail}` });
  if (task) {
    store.addEvent({
      taskId: task.id,
      type: 'approval',
      status: 'pending',
      title: request.title,
      detail: request.detail
    });
  }
  return new Promise((resolve) => {
    pending.set(id, { resolve, request: payload });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        broadcast({ type: 'approval-resolved', id, decision: 'timeout' });
        resolve(false);
      }
    }, 600000);
  });
}

/* --------------------------- user hooks (OpenCode style) --------------------------- */
/* settings.hooks: { onTaskStart, onTool, onTaskDone } — any shell command.
   Env: AEGIS_HOOK, AEGIS_TASK_ID, AEGIS_TOOL / AEGIS_DETAIL / AEGIS_STATUS / AEGIS_SUMMARY */
function runHook(name, env) {
  try {
    const cmd = store.get().settings.hooks && store.get().settings.hooks[name];
    if (!cmd) return;
    // exec (string) so user commands with quoted paths reach cmd.exe intact;
    // execFile's argv escaping mangles inner quotes for cmd.
    const child = exec(String(cmd), {
      env: Object.assign({}, process.env, { AEGIS_HOOK: name }, env || {}),
      timeout: 30000,
      windowsHide: true,
      maxBuffer: 64 * 1024
    });
    let out = '';
    if (child.stdout) child.stdout.on('data', (d) => { out += d; });
    child.on('error', (err) => console.warn(`AEGIS hook ${name}: ${err.message}`));
    child.on('close', (code) => {
      if (code !== 0) console.warn(`AEGIS hook ${name}: exit ${code}`);
      const first = out.trim().split('\n')[0];
      if (first) console.log(`AEGIS hook ${name}: ${first.slice(0, 200)}`);
    });
  } catch (err) {
    console.warn(`AEGIS hook ${name}: ${err.message}`);
  }
}

/* ------------------------------ task runner ------------------------------ */

const queue = [];
let running = null;
const controllers = new Map();

function enqueue(task) {
  queue.push(task.id);
  kick();
}

function kick() {
  if (running) return;
  const id = queue.shift();
  if (!id) return;
  const task = store.getTask(id);
  if (!task || task.status !== 'queued') {
    kick();
    return;
  }
  runTask(task).finally(() => {
    running = null;
    kick();
  });
}

async function runTask(task) {
  running = task.id;
  const settings = store.get().settings;
  const apiKey = store.getProviderKeys()[resolveModel(settings, task.model || settings.model)?.provider || 'deepseek'] || store.getApiKey();

  task.status = 'running';
  task.startedAt = Date.now();
  store.save();
  broadcast({ type: 'task', task: store.snapshot().tasks.find((t) => t.id === task.id) });

  if (!settings.workspace) {
    task.status = 'failed';
    task.error = 'No workspace selected. Open Settings and pick a project folder.';
    task.endedAt = Date.now();
    store.save();
    broadcast({ type: 'task', task });
    return;
  }

  if (!apiKey) {
    task.status = 'failed';
    task.error = 'No DeepSeek API key saved.';
    task.endedAt = Date.now();
    store.save();
    broadcast({ type: 'task', task });
    return;
  }

  const ctrl = new AbortController();
  controllers.set(task.id, ctrl);
  const toolEvents = new Map();
  const session = task.sessionId ? store.getSession(task.sessionId) : null;
  const history = session ? session.messages.filter((m) => m.id !== task.userMessageId) : [];

  runHook('onTaskStart', { AEGIS_TASK_ID: task.id, AEGIS_TASK_TITLE: String(task.title || '').slice(0, 500) });

  /* Plan mode (Claude/OpenCode style): draft plan → user approves → execute. */
  let execPrompt = task.prompt || task.title;
  let planIn = 0;
  let planOut = 0;
  if (settings.planMode && task.agent !== 'planner') {
    const planEv = store.addEvent({
      taskId: task.id,
      sessionId: task.sessionId,
      type: 'plan',
      title: 'Plan mode',
      detail: 'Drafting a plan first (read-only)…',
      status: 'running'
    });
    broadcast({ type: 'event', event: planEv });
    try {
      const planRes = await runAgent({
        store,
        settings,
        task: Object.assign({}, task, {
          prompt: `${execPrompt}\n\nProduce a concise step-by-step plan. Read files if needed, but do NOT modify anything.`
        }),
        role: 'planner',
        history,
        sessionSummary: session ? session.summary : '',
        projectRules: settings.useAgentsMd ? loadProjectRules(settings.workspace) : '',
        modelId: task.model || (session && session.model),
        signal: ctrl.signal,
        onDelta: (text) => broadcast({ type: 'delta', taskId: task.id, sessionId: task.sessionId, text }),
        onEvent: (ev) => {
          const saved = store.addEvent(Object.assign({ taskId: task.id, sessionId: task.sessionId }, ev));
          broadcast({ type: 'event', event: saved });
        },
        onAsk: () => Promise.resolve(false)
      });
      planIn = planRes.tokensIn;
      planOut = planRes.tokensOut;
      const ok =
        settings.approvalMode === 'readonly' ? true : await askApproval(task, { kind: 'plan', title: 'Approve plan', detail: planRes.summary });
      if (!ok) {
        task.status = 'done';
        task.endedAt = Date.now();
        task.summary = 'Plan rejected by the user. Nothing was changed.';
        task.steps = planRes.steps;
        task.tokensIn = planIn;
        task.tokensOut = planOut;
        task.cost = store.addUsage(planIn, planOut, planRes.priceIn, planRes.priceOut);
        store.addEvent({
          taskId: task.id,
          sessionId: task.sessionId,
          type: 'plan',
          title: 'Plan rejected',
          detail: planRes.summary,
          status: 'warn'
        });
        if (session) {
          store.addMessage(session.id, 'assistant', task.summary, { taskId: task.id, model: planRes.model });
          session.tokens = estimateMessagesTokens(session.messages);
        }
        store.save();
        broadcast({ type: 'task', task });
        if (session) broadcast({ type: 'message', sessionId: session.id, message: session.messages[session.messages.length - 1] });
        runHook('onTaskDone', { AEGIS_TASK_ID: task.id, AEGIS_STATUS: 'plan-rejected', AEGIS_SUMMARY: task.summary });
        controllers.delete(task.id);
        return;
      }
      execPrompt = `${execPrompt}\n\n----- APPROVED PLAN -----\n${planRes.summary}\n\nFollow this plan. Adjust only where reality differs.`;
      store.updateEvent(planEv.id, { status: 'ok', detail: 'Plan approved — executing.' });
      broadcast({ type: 'event', event: store.get().events.find((e) => e.id === planEv.id) });
    } catch (err) {
      if (err && (err.aborted || err.name === 'AbortError')) throw err;
      // Planning failed (e.g. model hiccup): fall through and execute directly.
      store.updateEvent(planEv.id, { status: 'warn', detail: 'Planning skipped: ' + String(err.message || err) });
      broadcast({ type: 'event', event: store.get().events.find((e) => e.id === planEv.id) });
      planIn = 0;
      planOut = 0;
    }
  }

  try {
    const result = await runAgent({
      store,
      settings,
      task: Object.assign({}, task, { prompt: execPrompt }),
      role: task.agent,
      history,
      sessionSummary: session ? session.summary : '',
      projectRules: settings.useAgentsMd ? loadProjectRules(settings.workspace) : '',
      modelId: task.model || (session && session.model),
      onSnapshot: (rel) => snapshotFile(settings.workspace, rel, task.id),
      signal: ctrl.signal,
      onDelta: (text) => {
        broadcast({ type: 'delta', taskId: task.id, sessionId: task.sessionId, text });
      },
      onEvent: (ev) => {
        const key = `${ev.type}|${ev.title}|${ev.detail}`;
        if (ev.status === 'running') {
          const saved = store.addEvent(Object.assign({ taskId: task.id, sessionId: task.sessionId }, ev));
          toolEvents.set(key, saved.id);
          broadcast({ type: 'event', event: saved });
          runHook('onTool', {
            AEGIS_TASK_ID: task.id,
            AEGIS_TOOL: String(ev.title || ''),
            AEGIS_DETAIL: String(ev.detail || '').slice(0, 2000)
          });
        } else if (toolEvents.has(key)) {
          const saved = store.updateEvent(toolEvents.get(key), {
            status: ev.status,
            result: ev.result || ''
          });
          toolEvents.delete(key);
          if (saved) broadcast({ type: 'event', event: saved });
        } else {
          const saved = store.addEvent(Object.assign({ taskId: task.id, sessionId: task.sessionId }, ev));
          broadcast({ type: 'event', event: saved });
          if (['run_command', 'write_file', 'edit_file', 'web_search', 'fetch_page', 'screenshot', 'type_text', 'mouse_click', 'key_press'].includes(ev.title)) {
            store.addAudit({ type: 'tool', taskId: task.id, detail: `${ev.title}: ${ev.detail} [${ev.status}]` });
          }
        }
      },
      onAsk: (req) => askApproval(task, req)
    });

    task.status = 'done';
    task.endedAt = Date.now();
    task.summary = result.summary;
    task.steps = result.steps;
    task.tokensIn = result.tokensIn + planIn;
    task.tokensOut = result.tokensOut + planOut;
    task.cost = store.addUsage(
      result.tokensIn + planIn,
      result.tokensOut + planOut,
      result.priceIn,
      result.priceOut
    );
    runHook('onTaskDone', { AEGIS_TASK_ID: task.id, AEGIS_STATUS: 'done', AEGIS_SUMMARY: String(result.summary || '').slice(0, 2000) });
    store.addEvent({
      taskId: task.id,
      sessionId: task.sessionId,
      type: 'done',
      title: 'Task complete',
      detail: result.summary,
      status: 'ok'
    });

    if (session) {
      store.addMessage(session.id, 'assistant', result.summary, { taskId: task.id, model: result.model });
      session.tokens = estimateMessagesTokens(session.messages);
      store.save();
      await maybeCompact(session, settings, apiKey, broadcast);
    }

    if (result.budgetHit) {
      store.addEvent({
        taskId: task.id,
        sessionId: task.sessionId,
        type: 'budget',
        title: 'Stopped at budget',
        detail: result.summary,
        status: 'warn'
      });
    }

    pruneData();

    if (settings.workspace) {
      try {
        const info = await scanWorkspace(settings.workspace);
        store.setWorkspace(info);
        broadcast({ type: 'workspace', workspace: info });
      } catch (_) {}
    }
  } catch (err) {
    const aborted = err && (err.aborted || err.name === 'AbortError');
    task.status = aborted ? 'cancelled' : 'failed';
    task.error = aborted ? 'Cancelled by user.' : String((err && err.message) || err);
    task.endedAt = Date.now();
    store.addEvent({
      taskId: task.id,
      sessionId: task.sessionId,
      type: 'error',
      title: aborted ? 'Cancelled' : 'Failed',
      detail: task.error,
      status: 'error'
    });
    if (session) {
      store.addMessage(session.id, 'assistant', aborted ? 'Stopped.' : `Error: ${task.error}`, {
        taskId: task.id,
        error: true
      });
    }
    runHook('onTaskDone', {
      AEGIS_TASK_ID: task.id,
      AEGIS_STATUS: aborted ? 'cancelled' : 'failed',
      AEGIS_SUMMARY: String(task.error || '').slice(0, 2000)
    });
  } finally {
    controllers.delete(task.id);
    store.save();
    store.persist();
    const fresh = store.snapshot().tasks.find((t) => t.id === task.id);
    broadcast({ type: 'task', task: fresh });
    broadcast({ type: 'session', sessionId: task.sessionId });
    broadcast({ type: 'refresh' });
  }
}

/* ---------------- file snapshots (undo) ---------------- */

const BACKUP_DIR = path.join(DATA_DIR, 'backups');

function snapshotFile(root, rel, taskId) {
  try {
    if (!root || !rel) return null;
    const base = path.resolve(root);
    const abs = path.resolve(base, rel);
    if (!abs.startsWith(base)) return null;

    const id = 'b-' + Math.random().toString(36).slice(2, 10);
    let existed = false;
    let size = 0;
    if (fs.existsSync(abs)) {
      existed = true;
      size = fs.statSync(abs).size;
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      fs.copyFileSync(abs, path.join(BACKUP_DIR, id + '.bak'));
    }
    const rec = {
      id,
      path: String(rel).replace(/\\/g, '/'),
      at: Date.now(),
      taskId: taskId || '',
      existed,
      size
    };
    const d = store.get();
    d.backups.unshift(rec);
    if (d.backups.length > 100) d.backups = d.backups.slice(0, 100);
    store.save();
    broadcast({ type: 'backup', backup: rec });
    return rec;
  } catch (_) {
    return null;
  }
}

/* Keep the local file bounded. */
function pruneData() {  const d = store.get();
  if (d.tasks.length > 300) d.tasks = d.tasks.slice(0, 300);
  if (d.sessions.length > 50) {
    const keep = d.sessions.slice(0, 50);
    const dropped = new Set(d.sessions.slice(50).map((s) => s.id));
    d.sessions = keep;
    d.tasks = d.tasks.filter((t) => !dropped.has(t.sessionId));
    d.events = d.events.filter((e) => !dropped.has(e.sessionId));
  }
  store.save();
}

/* Read AGENTS.md / CLAUDE.md / opencode.json instructions once per run. */
function loadProjectRules(root) {
  if (!root) return '';
  const read = (p) => {
    try {
      return fs.readFileSync(path.join(root, p), 'utf8');
    } catch (_) {
      return '';
    }
  };
  const parts = [];
  for (const name of ['AGENTS.md', 'CLAUDE.md', '.aegis-rules.md']) {
    const txt = read(name);
    if (txt) parts.push(`# ${name}\n${txt}`);
  }
  try {
    const cfg = JSON.parse(read('opencode.json') || '{}');
    const instructions = Array.isArray(cfg.instructions) ? cfg.instructions.join('\n') : cfg.instructions;
    if (instructions) parts.push(`# opencode.json instructions\n${instructions}`);
    if (cfg.model) parts.push(`# opencode.json model\n${cfg.model}`);
  } catch (_) {}
  return parts.join('\n\n').slice(0, 5000);
}

/* Summarise and trim when the conversation nears the context window. */
async function maybeCompact(session, settings, apiKey, broadcastFn) {
  const limit = Number(settings.compactAt) || 24000;
  const est = estimateMessagesTokens(session.messages);
  if (est < limit || session.messages.length < 6) {
    session.tokens = est;
    store.save();
    return;
  }
  broadcastFn({ type: 'compacting', sessionId: session.id });
  try {
    const summary = await summarizeSession({
      settings,
      key: apiKey,
      messages: session.messages,
      modelId: session.model
    });
    session.summary = [session.summary, summary].filter(Boolean).join('\n\n').slice(-4000);
    store.trimSession(session.id, 4);
    store.save();
    store.addEvent({
      sessionId: session.id,
      type: 'compaction',
      title: 'Context compacted',
      detail: `Older messages summarised at ~${est} tokens.`,
      status: 'ok'
    });
    broadcastFn({
      type: 'compacted',
      sessionId: session.id,
      summary: session.summary.slice(0, 240),
      compactions: session.compactions
    });

    if (session.compactions >= 3) {
      const fresh = store.createSession({
        title: session.title + ' (continued)',
        model: session.model
      });
      fresh.summary = session.summary;
      store.addMessage(fresh.id, 'assistant', `Continuing from the previous session.\n\n${session.summary}`);
      store.persist();
      broadcastFn({ type: 'session-created', session: fresh, carry: true });
    }
  } catch (err) {
    store.addEvent({
      sessionId: session.id,
      type: 'compaction',
      title: 'Compaction failed',
      detail: String((err && err.message) || err),
      status: 'error'
    });
  }
}

/* Create a chat turn from any source (UI, webhook, schedule, Telegram). */
function runPrompt({ text, agent = 'coder', model = '', sessionId = '', title = '' }) {
  const settings = store.get().settings;
  let session = sessionId ? store.getSession(sessionId) : null;
  if (!session) {
    session = store.createSession({ title: title || text.slice(0, 60), model: model || settings.model });
  }
  if (model && model !== session.model) {
    session.model = model;
    store.save();
  }
  const userMsg = store.addMessage(session.id, 'user', text);
  const task = store.addTask({
    sessionId: session.id,
    title: title || text,
    prompt: text,
    agent,
    model: session.model
  });
  task.userMessageId = userMsg.id;
  store.save();
  broadcast({ type: 'message', sessionId: session.id, message: userMsg });
  broadcast({ type: 'task', task });
  enqueue(task);
  return { session, task };
}

/* GitHub webhook payload → agent task. Returns null for ignored events. */
function githubPrompt(event, payload) {
  const repo = (payload && payload.repository && payload.repository.full_name) || 'unknown/repo';
  const sender = (payload && payload.sender && payload.sender.login) || 'someone';
  if (event === 'push') {
    const ref = String(payload.ref || '').replace('refs/heads/', '');
    const commits = Array.isArray(payload.commits) ? payload.commits.slice(-3) : [];
    const list = commits
      .map((c) => `- ${String(c.message || '').split('\n')[0]} (${(c.author && c.author.name) || '?'})`)
      .join('\n');
    const forced = payload.forced ? ' WARNING: the push was forced (history rewritten).' : '';
    return {
      title: `push ${repo}@${ref} by ${sender}`.slice(0, 80),
      prompt:
        `GitHub push received on ${repo} (branch ${ref}) by ${sender}.${forced}\n` +
        `Latest commits:\n${list || '(no commit details)'}\n\n` +
        `If this workspace is that repository, run git pull, then review the incoming changes for bugs and security issues. ` +
        `Report findings ranked by severity. Do not push anything.`
    };
  }
  if (event === 'workflow_run') {
    const wr = payload.workflow_run || {};
    if (payload.action !== 'completed' || wr.conclusion === 'success') return null;
    return {
      title: `CI failed: ${wr.name || 'workflow'} #${wr.run_number || ''} (${repo})`.slice(0, 80),
      prompt:
        `GitHub Actions run FAILED on ${repo}: workflow "${wr.name || 'unknown'}" run #${wr.run_number || '?'} ` +
        `(branch ${wr.head_branch || '?'}). Logs: ${wr.html_url || 'n/a'}\n` +
        `Identify the root cause and propose the smallest fix. Do not push anything.`
    };
  }
  if (event === 'issues' && payload.action === 'opened') {
    const issue = payload.issue || {};
    return {
      title: `issue #${issue.number || '?'}: ${String(issue.title || '').slice(0, 60)}`,
      prompt:
        `New GitHub issue on ${repo} #${issue.number}: ${issue.title}\n${String(issue.body || '').slice(0, 1500)}\n\n` +
        `Triage it: is it a real bug, which file is likely involved, and what is the smallest fix? Do not push anything.`
    };
  }
  return null;
}

/* ------------------------------ scheduler ------------------------------ */

function scheduleDue(s, now) {
  if (s.everyMinutes > 0) return now - (s.lastRun || 0) >= s.everyMinutes * 60000;
  if (s.dailyAt && /^\d{1,2}:\d{2}$/.test(s.dailyAt)) {
    const [h, m] = s.dailyAt.split(':').map(Number);
    const t = new Date();
    t.setHours(h, m, 0, 0);
    const target = t.getTime();
    return now >= target && (s.lastRun || 0) < target;
  }
  return false;
}

setInterval(() => {
  try {
    const settings = store.get().settings;
    if (!settings.workspace) return;
    if (!Object.keys(store.getProviderKeys()).length) return;
    const now = Date.now();
    for (const s of store.get().schedules || []) {
      if (!s.enabled || !scheduleDue(s, now)) continue;
      s.lastRun = now;
      store.save();
      const { task } = runPrompt({ text: s.prompt, agent: s.agent, title: '⏰ ' + s.prompt.slice(0, 50) });
      store.addAudit({ type: 'schedule', taskId: task.id, detail: s.prompt.slice(0, 80) });
      broadcast({ type: 'refresh' });
    }
  } catch (err) {
    console.error('scheduler', err.message);
  }
}, 30000);

/* ------------------------------ channels ------------------------------ */

const channels = { telegram: { running: false, timer: null, offset: 0, error: '' } };

async function tgCall(token, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  return res.json();
}

async function telegramReply(token, chatId, text) {
  for (let i = 0; i < text.length; i += 3800) {
    await tgCall(token, 'sendMessage', { chat_id: chatId, text: text.slice(i, i + 3800) }).catch(() => {});
  }
}

async function handleTelegram(token, msg) {
  const chatId = msg.chat && msg.chat.id;
  const text = String(msg.text || '').trim();
  if (!chatId || !text) return;
  if (text === '/start') {
    return telegramReply(token, chatId, 'AEGIS ready. Send me a task and I will work in the configured workspace.');
  }
  if (!store.get().settings.workspace) {
    return telegramReply(token, chatId, 'No workspace configured on the PC yet.');
  }
  try {
    await tgCall(token, 'sendChatAction', { chat_id: chatId, action: 'typing' });
    const { task } = runPrompt({ text, agent: 'coder', title: 'TG: ' + text.slice(0, 50) });
    const deadline = Date.now() + 4 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2500));
      const t = store.getTask(task.id);
      if (!t) break;
      if (t.status === 'done' || t.status === 'failed' || t.status === 'cancelled') {
        const out = t.status === 'done' ? t.summary : `⚠️ ${t.error || t.status}`;
        return telegramReply(token, chatId, out || 'Done.');
      }
      await tgCall(token, 'sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
    }
    return telegramReply(token, chatId, 'Still working — check the app for progress.');
  } catch (err) {
    return telegramReply(token, chatId, 'Error: ' + String(err.message || err));
  }
}

function startTelegram(token) {
  stopTelegram();
  if (!token) return { running: false };
  channels.telegram.running = true;
  channels.telegram.error = '';
  const loop = async () => {
    if (!channels.telegram.running) return;
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?timeout=25&offset=${channels.telegram.offset}`
      );
      const j = await res.json();
      if (!j.ok) {
        channels.telegram.error = j.description || 'Telegram error';
      } else {
        for (const u of j.result || []) {
          channels.telegram.offset = u.update_id + 1;
          if (u.message) handleTelegram(token, u.message);
        }
      }
    } catch (err) {
      channels.telegram.error = String(err.message || err);
    }
    if (channels.telegram.running) channels.telegram.timer = setTimeout(loop, 900);
  };
  loop();
  return { running: true };
}

function stopTelegram() {
  channels.telegram.running = false;
  if (channels.telegram.timer) clearTimeout(channels.telegram.timer);
  channels.telegram.timer = null;
}

/* ------------------------------ skills ------------------------------ */

function listSkills() {
  const ws = store.get().settings.workspace;
  const dirs = [ws ? path.join(ws, 'skills') : '', path.join(DATA_DIR, 'skills')].filter(Boolean);
  const out = [];
  for (const dir of dirs) {
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!/\.md$/i.test(f)) continue;
        const full = path.join(dir, f);
        const text = fs.readFileSync(full, 'utf8');
        out.push({
          name: f.replace(/\.md$/i, ''),
          dir: path.dirname(dir) === ws ? 'workspace' : 'local',
          chars: text.length,
          preview: text.slice(0, 140)
        });
      }
    } catch (_) {}
  }
  return out;
}

/* ------------------------------ API ------------------------------ */

async function api(req, res, url) {
  const p = url.pathname;
  const method = req.method;

  if (!sameOrigin(req)) {
    return sendJson(res, 403, { error: 'Cross-origin request blocked' });
  }

  if (p === '/api/state' && method === 'GET') {
    return sendJson(res, 200, {
      ...store.snapshot(),
      roles: ROLES,
      models: allModels(store.get().settings),
      providers: PROVIDERS,
      pendingApprovals: pendingApprovals(),
      channels: { telegram: { running: channels.telegram.running, error: channels.telegram.error } },
      skills: listSkills(),
      system: {
        hostname: os.hostname(),
        os: `${os.type()} ${os.release()}`,
        cpu: (os.cpus()[0] || {}).model || '',
        arch: os.arch(),
        node: process.version,
        dataDir: DATA_DIR,
        dataSize: (() => {
          try {
            return fs.statSync(store.file).size;
          } catch (_) {
            return 0;
          }
        })(),
        lastSaved: store.get().meta.lastSaved || 0
      }
    });
  }

  if (p === '/api/stream' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write(': connected\n\n');
    clients.add(res);
    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch (_) {}
    }, 25000);
    req.on('close', () => {
      clearInterval(ping);
      clients.delete(res);
    });
    return;
  }

  if (p === '/api/settings' && method === 'POST') {
    const body = await readBody(req);
    if (typeof body.apiKey === 'string') {
      const provider = String(body.provider || 'deepseek');
      store.setProviderKey(provider, body.apiKey);
      store.addAudit({ type: 'key', detail: provider + ' key ' + (body.apiKey ? 'updated' : 'cleared') });
      delete body.apiKey;
      delete body.provider;
    }
    store.saveSettings(body);
    store.persist();
    broadcast({ type: 'refresh' });
    return sendJson(res, 200, store.snapshot());
  }

  if (p === '/api/provider/models' && method === 'POST') {
    const body = await readBody(req);
    const provider = String(body.provider || '');
    try {
      const key = store.getProviderKey(provider);
      const models = await listRemoteModels(provider, key);
      store.addAudit({ type: 'models', detail: `${provider}: ${models.length} models` });
      return sendJson(res, 200, { ok: true, provider, models: models.slice(0, 200) });
    } catch (err) {
      return sendJson(res, 200, { ok: false, error: String(err.message || err) });
    }
  }

  if (p === '/api/test' && method === 'POST') {    const body = await readBody(req);
    const s = store.get().settings;
    const result = await testConnection({ settings: s, modelId: body.modelId, store });
    store.addAudit({ type: 'test', detail: `${body.modelId || s.model}: ${result.message}` });
    return sendJson(res, 200, result);
  }

  /* Emergency stop: abort every running task and clear the queue. */
  if (p === '/api/stop' && method === 'POST') {
    let stopped = 0;
    for (const [id, ctrl] of controllers.entries()) {
      try {
        ctrl.abort();
        stopped++;
      } catch (_) {}
      void id;
    }
    queue.length = 0;
    for (const t of store.get().tasks) {
      if (t.status === 'queued') {
        t.status = 'cancelled';
        t.endedAt = Date.now();
        t.error = 'Stopped by user.';
      }
    }
    store.save();
    store.addAudit({ type: 'stop', detail: `${stopped} run(s) stopped` });
    broadcast({ type: 'refresh' });
    return sendJson(res, 200, { ok: true, stopped });
  }

  /* ------------------------------ sessions ------------------------------ */

  if (p === '/api/sessions' && method === 'GET') {
    return sendJson(res, 200, { sessions: store.snapshot().sessions });
  }

  if (p === '/api/sessions' && method === 'POST') {
    const body = await readBody(req);
    // Reuse the empty chat instead of stacking empty sessions.
    const empty = store.get().sessions.find((s) => s.messages.length === 0);
    if (empty && !body.title) {
      empty.model = body.model || empty.model;
      store.save();
      broadcast({ type: 'refresh' });
      return sendJson(res, 200, { session: empty, reused: true });
    }
    const session = store.createSession({
      title: body.title,
      model: body.model || store.get().settings.model
    });
    broadcast({ type: 'session-created', session });
    return sendJson(res, 200, { session });
  }

  const sessMatch = p.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessMatch) {
    const id = decodeURIComponent(sessMatch[1]);
    const session = store.getSession(id);
    if (!session) return sendJson(res, 404, { error: 'Session not found' });

    if (method === 'GET') {
      return sendJson(res, 200, {
        session,
        tokens: estimateMessagesTokens(session.messages),
        limit: Number(store.get().settings.compactAt) || 24000
      });
    }
    if (method === 'PATCH') {
      const body = await readBody(req);
      store.renameSession(id, body.title);
      broadcast({ type: 'refresh' });
      return sendJson(res, 200, { ok: true });
    }
    if (method === 'DELETE') {
      const ctrl = controllers.get(id);
      if (ctrl) ctrl.abort();
      store.deleteSession(id);
      broadcast({ type: 'session-deleted', sessionId: id });
      broadcast({ type: 'refresh' });
      return sendJson(res, 200, { ok: true });
    }
  }

  if (p === '/api/chat' && method === 'POST') {
    const body = await readBody(req);
    const text = String(body.text || '').trim();
    if (!text) return sendJson(res, 400, { error: 'Message required' });
    const { session, task } = runPrompt({
      text,
      agent: body.agent || 'coder',
      model: body.model || '',
      sessionId: body.sessionId || ''
    });
    return sendJson(res, 200, { sessionId: session.id, taskId: task.id, messageId: task.userMessageId });
  }

  if (p === '/api/workspace' && method === 'POST') {
    const body = await readBody(req);
    const dir = String(body.path || '').trim();
    if (!dir) return sendJson(res, 400, { error: 'Path required' });
    try {
      const info = await scanWorkspace(dir);
      store.setWorkspace(info);
      store.persist();
      broadcast({ type: 'workspace', workspace: info });
      return sendJson(res, 200, info);
    } catch (err) {
      return sendJson(res, 400, { error: String(err.message || err) });
    }
  }

  if (p === '/api/files' && method === 'GET') {
    const root = store.get().settings.workspace;
    if (!root) return sendJson(res, 400, { error: 'No workspace' });
    const rel = url.searchParams.get('path') || '.';
    const target = path.resolve(root, rel);
    if (!target.startsWith(path.resolve(root))) return sendJson(res, 403, { error: 'Outside workspace' });
    try {
      const entries = fs
        .readdirSync(target, { withFileTypes: true })
        .filter((e) => !['node_modules', '.git', 'dist', 'build', 'out', '.next'].includes(e.name))
        .map((e) => {
          let size = 0;
          try {
            size = e.isFile() ? fs.statSync(path.join(target, e.name)).size : 0;
          } catch (_) {}
          return {
            name: e.name,
            dir: e.isDirectory(),
            size,
            path: path.relative(root, path.join(target, e.name)).replace(/\\/g, '/')
          };
        })
        .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
      return sendJson(res, 200, { path: path.relative(root, target) || '.', entries });
    } catch (err) {
      return sendJson(res, 400, { error: String(err.message || err) });
    }
  }

  if (p === '/api/file') {
    const root = store.get().settings.workspace;
    if (!root) return sendJson(res, 400, { error: 'No workspace' });
    if (method === 'GET') {
      const rel = url.searchParams.get('path') || '';
      const target = path.resolve(root, rel);
      if (!target.startsWith(path.resolve(root))) return sendJson(res, 403, { error: 'Outside workspace' });
      try {
        const stat = fs.statSync(target);
        if (stat.size > 2 * 1024 * 1024) return sendJson(res, 400, { error: 'File too large' });
        return sendJson(res, 200, { path: rel, content: fs.readFileSync(target, 'utf8') });
      } catch (err) {
        return sendJson(res, 400, { error: String(err.message || err) });
      }
    }
    if (method === 'POST') {
      const body = await readBody(req);
      const rel = String(body.path || '');
      const target = path.resolve(root, rel);
      if (!target.startsWith(path.resolve(root))) return sendJson(res, 403, { error: 'Outside workspace' });
      try {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, String(body.content || ''), 'utf8');
        broadcast({ type: 'refresh' });
        return sendJson(res, 200, { ok: true, path: rel });
      } catch (err) {
        return sendJson(res, 400, { error: String(err.message || err) });
      }
    }
  }

  if (p === '/api/git' && method === 'GET') {
    const root = store.get().settings.workspace;
    if (!root) return sendJson(res, 400, { error: 'No workspace' });
    const branch = await sh(['rev-parse', '--abbrev-ref', 'HEAD'], root);
    const porcelain = await sh(['status', '--porcelain'], root);
    const label = { M: 'modified', A: 'added', '??': 'added', D: 'deleted', R: 'renamed', C: 'copied', U: 'updated' };
    const files = porcelain
      ? porcelain
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const code = line.slice(0, 2).trim();
            const file = line.slice(3).trim().replace(/^"|"$/g, '');
            return { file, code, label: label[code] || label[code[0]] || 'changed' };
          })
      : [];
    return sendJson(res, 200, { branch, files, isRepo: Boolean(branch) });
  }

  if (p === '/api/tasks' && method === 'POST') {
    const body = await readBody(req);
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return sendJson(res, 400, { error: 'Prompt required' });
    const title = String(body.title || prompt.split('\n')[0]).slice(0, 160);
    const task = store.addTask({ title, prompt, agent: body.agent || 'coder' });
    broadcast({ type: 'task', task });
    enqueue(task);
    return sendJson(res, 200, { task });
  }

  const taskMatch = p.match(/^\/api\/tasks\/([^/]+)(\/cancel|\/retry)?$/);
  if (taskMatch) {
    const id = decodeURIComponent(taskMatch[1]);
    const task = store.getTask(id);
    if (!task) return sendJson(res, 404, { error: 'Task not found' });

    if (method === 'DELETE') {
      const ctrl = controllers.get(id);
      if (ctrl) ctrl.abort();
      store.deleteTask(id);
      broadcast({ type: 'refresh' });
      return sendJson(res, 200, { ok: true });
    }
    if (method === 'POST' && taskMatch[2] === '/cancel') {
      const ctrl = controllers.get(id);
      if (ctrl) ctrl.abort();
      else if (task.status === 'queued') {
        store.updateTask(id, { status: 'cancelled', endedAt: Date.now() });
        broadcast({ type: 'refresh' });
      }
      return sendJson(res, 200, { ok: true });
    }
    if (method === 'POST' && taskMatch[2] === '/retry') {
      const fresh = store.addTask({ title: task.title, prompt: task.prompt, agent: task.agent });
      enqueue(fresh);
      broadcast({ type: 'refresh' });
      return sendJson(res, 200, { task: fresh });
    }
  }

  if (p === '/api/approve' && method === 'POST') {
    const body = await readBody(req);
    const entry = pending.get(body.id);
    if (!entry) return sendJson(res, 404, { error: 'Approval expired' });
    pending.delete(body.id);
    const allow = body.decision === 'allow';
    entry.resolve(allow);
    store.addAudit({ type: 'approval-decision', detail: body.decision, taskId: entry.request && entry.request.taskId });
    broadcast({ type: 'approval-resolved', id: body.id, decision: allow ? 'allow' : 'deny' });
    if (body.decision === 'always') {
      store.saveSettings({ approvalMode: 'auto' });
      broadcast({ type: 'refresh' });
    }
    return sendJson(res, 200, { ok: true });
  }

  if (p === '/api/memory' && method === 'POST') {
    const body = await readBody(req);
    const text = String(body.text || '').trim();
    if (!text) return sendJson(res, 400, { error: 'Text required' });
    const m = store.addMemory(text);
    broadcast({ type: 'refresh' });
    return sendJson(res, 200, { memory: m });
  }

  const memMatch = p.match(/^\/api\/memory\/([^/]+)$/);
  if (memMatch && method === 'DELETE') {
    store.deleteMemory(decodeURIComponent(memMatch[1]));
    broadcast({ type: 'refresh' });
    return sendJson(res, 200, { ok: true });
  }

  if (p === '/api/reset' && method === 'POST') {
    store.reset();
    broadcast({ type: 'refresh' });
    return sendJson(res, 200, store.snapshot());
  }

  const backupMatch = p.match(/^\/api\/backups\/([^/]+)\/revert$/);
  if (backupMatch && method === 'POST') {
    const id = decodeURIComponent(backupMatch[1]);
    const rec = (store.get().backups || []).find((b) => b.id === id);
    if (!rec) return sendJson(res, 404, { error: 'Backup not found' });
    const root = store.get().settings.workspace;
    if (!root) return sendJson(res, 400, { error: 'No workspace' });
    const base = path.resolve(root);
    const abs = path.resolve(base, rec.path);
    if (!abs.startsWith(base)) return sendJson(res, 403, { error: 'Outside workspace' });
    try {
      if (rec.existed) {
        const src = path.join(BACKUP_DIR, rec.id + '.bak');
        if (!fs.existsSync(src)) return sendJson(res, 410, { error: 'Backup file missing' });
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.copyFileSync(src, abs);
      } else if (fs.existsSync(abs)) {
        fs.unlinkSync(abs);
      }
      store.addEvent({
        type: 'revert',
        title: 'File reverted',
        detail: rec.path,
        status: 'ok'
      });
      broadcast({ type: 'refresh' });
      return sendJson(res, 200, { ok: true, path: rec.path });
    } catch (err) {
      return sendJson(res, 400, { error: String(err.message || err) });
    }
  }

  /* -------- automations: webhook, schedules, channels, skills -------- */

  const hookMatch = p.match(/^\/api\/hook\/([a-f0-9]{16,64})$/);
  if (hookMatch && method === 'POST') {
    if (hookMatch[1] !== store.get().settings.webhookToken) {
      return sendJson(res, 403, { error: 'Invalid webhook token' });
    }
    const body = await readBody(req);

    /* GitHub bot: requests with X-GitHub-Event become agent tasks. */
    const ghEvent = String(req.headers['x-github-event'] || '');
    if (ghEvent) {
      if (ghEvent === 'ping') return sendJson(res, 200, { ok: true, pong: true });
      const gh = githubPrompt(ghEvent, body);
      if (!gh) return sendJson(res, 200, { ok: true, ignored: ghEvent });
      const { session, task } = runPrompt({ text: gh.prompt, agent: 'coder', title: gh.title });
      store.addAudit({ type: 'webhook', taskId: task.id, detail: `github ${ghEvent}: ${gh.title}`.slice(0, 120) });
      return sendJson(res, 200, { ok: true, sessionId: session.id, taskId: task.id, event: ghEvent });
    }

    const text = String(body.prompt || body.text || '').trim();
    if (!text) return sendJson(res, 400, { error: 'prompt required' });
    const { session, task } = runPrompt({ text, agent: body.agent || 'coder', model: body.model || '' });
    store.addAudit({ type: 'webhook', taskId: task.id, detail: text.slice(0, 100) });
    return sendJson(res, 200, { ok: true, sessionId: session.id, taskId: task.id });
  }

  if (p === '/api/automations' && method === 'GET') {
    return sendJson(res, 200, {
      webhookToken: store.get().settings.webhookToken,
      schedules: store.get().schedules || [],
      telegram: { running: channels.telegram.running, error: channels.telegram.error },
      skills: listSkills()
    });
  }

  if (p === '/api/schedules' && method === 'POST') {
    const body = await readBody(req);
    const text = String(body.prompt || '').trim();
    if (!text) return sendJson(res, 400, { error: 'prompt required' });
    if (!Number(body.everyMinutes) && !body.dailyAt) {
      return sendJson(res, 400, { error: 'Set everyMinutes or dailyAt (HH:MM)' });
    }
    const sch = store.addSchedule({
      prompt: text,
      agent: body.agent,
      everyMinutes: Number(body.everyMinutes) || 0,
      dailyAt: body.dailyAt
    });
    store.addAudit({ type: 'schedule-add', detail: text.slice(0, 80) });
    broadcast({ type: 'refresh' });
    return sendJson(res, 200, { schedule: sch });
  }

  const schMatch = p.match(/^\/api\/schedules\/([^/]+)(\/toggle)?$/);
  if (schMatch) {
    const id = decodeURIComponent(schMatch[1]);
    if (method === 'DELETE') {
      store.deleteSchedule(id);
      broadcast({ type: 'refresh' });
      return sendJson(res, 200, { ok: true });
    }
    if (method === 'POST' && schMatch[2] === '/toggle') {
      const body = await readBody(req);
      const s = store.toggleSchedule(id, body.enabled);
      broadcast({ type: 'refresh' });
      return sendJson(res, 200, { schedule: s });
    }
  }

  if (p === '/api/channels/telegram' && method === 'POST') {
    const body = await readBody(req);
    const token = String(body.token || '').trim();
    store.setChannelKey('telegram', token);
    if (token) startTelegram(token);
    else stopTelegram();
    store.addAudit({ type: 'channel', detail: 'telegram ' + (token ? 'started' : 'stopped') });
    broadcast({ type: 'refresh' });
    return sendJson(res, 200, { running: channels.telegram.running, error: channels.telegram.error });
  }

  if (p === '/api/skills' && method === 'GET') {
    return sendJson(res, 200, { skills: listSkills() });
  }

  if (p === '/api/import' && method === 'POST') {
    const body = await readBody(req);
    const data = body && body.data;
    if (!data || typeof data !== 'object') return sendJson(res, 400, { error: 'Invalid backup file' });
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const keep = path.join(DATA_DIR, 'pre-import-' + Date.now() + '.json');
      fs.copyFileSync(store.file, keep);
      const d = store.get();
      if (Array.isArray(data.sessions)) d.sessions = data.sessions;
      if (Array.isArray(data.tasks)) d.tasks = data.tasks;
      if (Array.isArray(data.events)) d.events = data.events;
      if (Array.isArray(data.memory)) d.memory = data.memory;
      if (data.usage && typeof data.usage === 'object') d.usage = data.usage;
      if (Array.isArray(data.backups)) d.backups = data.backups;
      store.persist();
      broadcast({ type: 'refresh' });
      return sendJson(res, 200, {
        ok: true,
        sessions: d.sessions.length,
        tasks: d.tasks.length,
        snapshot: keep
      });
    } catch (err) {
      return sendJson(res, 400, { error: String(err.message || err) });
    }
  }

  if (p === '/api/export' && method === 'GET') {
    const data = JSON.parse(JSON.stringify(store.get()));
    delete data.settings.apiKeyEnc;
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="aegis-backup.json"'
    });
    return res.end(JSON.stringify(data, null, 2));
  }

  return sendJson(res, 404, { error: 'Not found' });
}

/* ------------------------------ server ------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: String((err && err.message) || err) });
    else res.end();
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const s = store.get().settings;
  console.log('');
  console.log('  AEGIS coding agent');
  console.log('  ─────────────────────────────────────────────');
  console.log(`  URL        http://127.0.0.1:${PORT}`);
  console.log(`  Data       ${DATA_DIR}`);
  console.log(`  Model      ${s.model}  (${s.apiKeyEnc ? 'key saved' : 'no API key yet'})`);
  console.log(`  Workspace  ${s.workspace || 'not selected'}`);
  console.log('');
});

process.on('SIGINT', () => {
  store.persist();
  process.exit(0);
});
