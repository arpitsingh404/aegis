'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

/* Windows DPAPI (per-user) so the key is not plain text on disk. */
function dpapiProtect(text) {
  if (process.platform !== 'win32') return '';
  try {
    const script =
      "Add-Type -AssemblyName System.Security | Out-Null;" +
      "$b=[Console]::In.ReadToEnd();" +
      "[Console]::In.Close();" +
      "$bytes=[Text.Encoding]::UTF8.GetBytes($b);" +
      "$enc=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);" +
      "[Console]::Out.Write([Convert]::ToBase64String($enc))";
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      input: String(text),
      timeout: 10000,
      windowsHide: true
    });
    return String(out).trim();
  } catch (_) {
    return '';
  }
}

function dpapiUnprotect(b64) {
  if (process.platform !== 'win32') return '';
  try {
    const script =
      "Add-Type -AssemblyName System.Security | Out-Null;" +
      "$b=[Console]::In.ReadToEnd();" +
      "[Console]::In.Close();" +
      "$bytes=[Convert]::FromBase64String($b);" +
      "$plain=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);" +
      "[Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))";
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      input: String(b64),
      timeout: 10000,
      windowsHide: true
    });
    return String(out);
  } catch (_) {
    return '';
  }
}

/**
 * AEGIS local store (coding-agent edition).
 * One JSON file. Tasks, run events, project memory, usage counters.
 */
class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'aegis.json');
    this.data = null;
    this.saveTimer = null;
    this.ensureDir();
    this.load();
  }

  ensureDir() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
    } catch (_) {}
  }

  defaults() {
    return {
      version: 4,
      settings: {
        model: 'deepseek-chat',
        apiKeyEnc: '',
        approvalMode: 'ask', // ask | auto | readonly
        maxSteps: 20,
        temperature: 0.3,
        compactAt: 90000,
        maxTokensPerTask: 60000,
        maxCostPerTask: 0.06,
        useAgentsMd: true,
        planMode: false,
        hooks: { onTaskStart: '', onTool: '', onTaskDone: '' },
        customModels: [],
        providerKeys: {},
        autoFallback: true,
        tts: false,
        customInstructions: '',
        webhookToken: '',
        telegramTokenEnc: '',
        currency: '$',
        usdRate: 1,
        priceIn: 0.27,
        priceOut: 1.1,
        accent: 'violet',
        workspace: '',
        sounds: true
      },
      workspace: { path: '', name: '', branch: '', dirty: 0, files: 0, lastScan: 0 },
      sessions: [],
      backups: [],
      todos: {},
      audit: [],
      schedules: [],
      tasks: [],
      events: [],
      memory: [],
      usage: { in: 0, out: 0, cost: 0, byDay: {} },
      meta: { lastSaved: 0 }
    };
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = this.migrate(parsed);
    } catch (_) {
      this.data = this.defaults();
      this.persist();
    }
  }

  migrate(parsed) {
    const base = this.defaults();
    const data = Object.assign({}, base, parsed);
    data.settings = Object.assign({}, base.settings, parsed.settings || {});
    data.workspace = Object.assign({}, base.workspace, parsed.workspace || {});
    data.usage = Object.assign({}, base.usage, parsed.usage || {});
    for (const key of ['tasks', 'events', 'memory', 'sessions', 'backups', 'schedules']) {
      if (!Array.isArray(data[key])) data[key] = [];
    }
    if (!data.settings.webhookToken) data.settings.webhookToken = crypto.randomBytes(16).toString('hex');
    if (!Array.isArray(data.settings.customModels)) data.settings.customModels = [];
    if (typeof data.settings.planMode !== 'boolean') data.settings.planMode = false;
    if (!data.settings.hooks || typeof data.settings.hooks !== 'object') data.settings.hooks = {};
    for (const hk of ['onTaskStart', 'onTool', 'onTaskDone']) {
      if (typeof data.settings.hooks[hk] !== 'string') data.settings.hooks[hk] = '';
    }
    if (!data.settings.providerKeys || typeof data.settings.providerKeys !== 'object') {
      data.settings.providerKeys = {};
    }
    if (!data.todos || typeof data.todos !== 'object') data.todos = {};
    if (!Array.isArray(data.audit)) data.audit = [];
    // Bring the old single key into the provider map.
    if (data.settings.apiKeyEnc && !data.settings.providerKeys.deepseek) {
      data.settings.providerKeys.deepseek = data.settings.apiKeyEnc;
    }
    // Old flat model id → provider:model key.
    if (data.settings.model && !data.settings.model.includes(':')) {
      data.settings.model = 'deepseek:' + data.settings.model;
    }
    if (typeof data.settings.autoFallback !== 'boolean') data.settings.autoFallback = true;
    for (const s of data.sessions) {
      if (s.model && !String(s.model).includes(':')) s.model = 'deepseek:' + s.model;
    }
    for (const t of data.tasks) {
      if (t.model && !String(t.model).includes(':')) t.model = 'deepseek:' + t.model;
    }
    if (typeof data.settings.compactAt !== 'number' || data.settings.compactAt === 24000) data.settings.compactAt = 90000;
    if (typeof data.settings.maxTokensPerTask !== 'number') data.settings.maxTokensPerTask = 60000;
    if (typeof data.settings.maxCostPerTask !== 'number') data.settings.maxCostPerTask = 0.06;
    if (typeof data.settings.temperature !== 'number') data.settings.temperature = 0.3;
    if (typeof data.settings.useAgentsMd !== 'boolean') data.settings.useAgentsMd = true;
    // Old alias names → current DeepSeek model ids.
    if (data.settings.model === 'deepseek-chat') data.settings.model = 'deepseek-flash';
    if (data.settings.model === 'deepseek-reasoner') data.settings.model = 'deepseek-v4-pro';
    if (!data.usage.byDay || typeof data.usage.byDay !== 'object') data.usage.byDay = {};
    return data;
  }

  get() {
    return this.data;
  }

  snapshot() {
    const d = this.data;
    const configured = {};
    for (const id of Object.keys(d.settings.providerKeys || {})) configured[id] = true;
    if (d.settings.apiKeyEnc) configured.deepseek = true;
    return {
      settings: Object.assign({}, d.settings, {
        apiKeyEnc: undefined,
        providerKeys: undefined,
        providers: configured,
        hasKey: Object.keys(configured).length > 0
      }),
      workspace: d.workspace,
      sessions: d.sessions.map((s) => ({
        id: s.id,
        title: s.title,
        model: s.model,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messageCount: s.messages.length,
        compactions: s.compactions || 0,
        tokens: s.tokens || 0
      })),
      tasks: d.tasks,
      backups: (d.backups || []).slice(0, 20),
      schedules: d.schedules || [],
      todos: d.todos || {},
      audit: (d.audit || []).slice(0, 60),
      events: d.events.slice(-200),
      memory: d.memory,
      usage: d.usage,
      meta: d.meta
    };
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persist(), 150);
  }

  persist() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      this.data.meta = Object.assign({}, this.data.meta, { lastSaved: Date.now() });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('AEGIS: could not save data', err);
    }
  }

  id(prefix) {
    return prefix + '-' + crypto.randomBytes(4).toString('hex');
  }

  /* ------------------------------ API key ------------------------------ */

  setApiKey(key) {
    this.setProviderKey('deepseek', key);
  }

  setProviderKey(provider, key) {
    const s = this.data.settings;
    if (!s.providerKeys || typeof s.providerKeys !== 'object') s.providerKeys = {};
    this.keyCache = this.keyCache || {};
    const providerId = String(provider || 'deepseek');
    if (!key) {
      delete s.providerKeys[providerId];
      delete this.keyCache[providerId];
      if (providerId === 'deepseek') s.apiKeyEnc = '';
      this.save();
      return;
    }
    const clean = String(key).trim();
    const sealed = dpapiProtect(clean);
    s.providerKeys[providerId] = sealed ? 'dpapi:' + sealed : 'raw:' + Buffer.from(clean, 'utf8').toString('base64');
    this.keyCache[providerId] = clean;
    if (providerId === 'deepseek') s.apiKeyEnc = s.providerKeys[providerId];
    this.save();
  }

  getProviderKey(provider) {
    const providerId = String(provider || 'deepseek');
    this.keyCache = this.keyCache || {};
    if (this.keyCache[providerId]) return this.keyCache[providerId];

    const s = this.data.settings;
    let enc = (s.providerKeys && s.providerKeys[providerId]) || '';
    if (!enc && providerId === 'deepseek') enc = s.apiKeyEnc || '';

    if (enc.startsWith('dpapi:')) {
      const key = dpapiUnprotect(enc.slice(6));
      if (key) this.keyCache[providerId] = key;
      return key;
    }
    if (enc.startsWith('raw:')) {
      try {
        const key = Buffer.from(enc.slice(4), 'base64').toString('utf8');
        this.keyCache[providerId] = key;
        return key;
      } catch (_) {
        return '';
      }
    }
    return '';
  }

  getProviderKeys() {
    const s = this.data.settings;
    const out = {};
    const ids = new Set(Object.keys(s.providerKeys || {}));
    ids.add('deepseek');
    for (const id of ids) {
      const key = this.getProviderKey(id);
      if (key) out[id] = key;
    }
    return out;
  }

  setTodos(sessionId, list) {
    if (!sessionId) return;
    this.data.todos[sessionId] = (list || []).slice(0, 30).map((t) => ({
      text: String(t.text || t || '').slice(0, 200),
      done: Boolean(t.done)
    }));
    this.save();
  }

  addAudit(entry) {
    const rec = Object.assign({ at: Date.now() }, entry);
    this.data.audit.unshift(rec);
    if (this.data.audit.length > 500) this.data.audit = this.data.audit.slice(0, 500);
    this.save();
    return rec;
  }

  getApiKey() {
    return this.getProviderKey('deepseek');
  }

  /* ------------------------------ mutations ------------------------------ */

  /* ------------------------------ sessions ------------------------------ */

  createSession(payload = {}) {
    const s = {
      id: this.id('s'),
      title: String(payload.title || 'New chat').slice(0, 80),
      model: payload.model || this.data.settings.model,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      summary: '',
      messages: [],
      tokens: 0,
      compactions: 0
    };
    this.data.sessions.unshift(s);
    this.save();
    return s;
  }

  getSession(id) {
    return this.data.sessions.find((s) => s.id === id);
  }

  deleteSession(id) {
    this.data.sessions = this.data.sessions.filter((s) => s.id !== id);
    this.data.tasks = this.data.tasks.filter((t) => t.sessionId !== id);
    this.data.events = this.data.events.filter((e) => e.sessionId !== id);
    this.save();
  }

  renameSession(id, title) {
    const s = this.getSession(id);
    if (!s) return null;
    s.title = String(title || s.title).slice(0, 80);
    s.updatedAt = Date.now();
    this.save();
    return s;
  }

  addMessage(sessionId, role, content, extra = {}) {
    const s = this.getSession(sessionId);
    if (!s) return null;
    const msg = {
      id: this.id('msg'),
      role,
      content: String(content || ''),
      at: Date.now(),
      ...extra
    };
    s.messages.push(msg);
    s.updatedAt = Date.now();
    if (s.messages.length === 1 && role === 'user') {
      s.title = msg.content.replace(/\s+/g, ' ').trim().slice(0, 60) || 'New chat';
    }
    this.save();
    return msg;
  }

  trimSession(sessionId, keepLast = 6) {
    const s = this.getSession(sessionId);
    if (!s) return;
    const tail = s.messages.slice(-keepLast);
    s.messages = tail;
    s.compactions = (s.compactions || 0) + 1;
    s.tokens = 0;
    s.updatedAt = Date.now();
    this.save();
  }

  /* ------------------------------ tasks ------------------------------ */

  addTask(payload) {
    const task = {
      id: this.id('t'),
      sessionId: payload.sessionId || '',
      title: String(payload.title || payload.prompt || 'Untitled task').slice(0, 160),
      prompt: String(payload.prompt || '').slice(0, 8000),
      agent: String(payload.agent || 'coder'),
      model: String(payload.model || ''),
      status: 'queued',
      createdAt: Date.now(),
      startedAt: 0,
      endedAt: 0,
      tokensIn: 0,
      tokensOut: 0,
      cost: 0,
      steps: 0,
      summary: '',
      error: ''
    };
    this.data.tasks.unshift(task);
    this.save();
    return task;
  }

  getTask(id) {
    return this.data.tasks.find((t) => t.id === id);
  }

  updateTask(id, patch) {
    const t = this.getTask(id);
    if (!t) return null;
    Object.assign(t, patch);
    this.save();
    return t;
  }

  deleteTask(id) {
    this.data.tasks = this.data.tasks.filter((t) => t.id !== id);
    this.data.events = this.data.events.filter((e) => e.taskId !== id);
    this.save();
  }

  addEvent(ev) {
    const event = Object.assign(
      {
        id: this.id('e'),
        at: Date.now(),
        type: 'info',
        status: 'ok',
        title: '',
        detail: '',
        taskId: ''
      },
      ev
    );
    this.data.events.push(event);
    if (this.data.events.length > 600) this.data.events = this.data.events.slice(-600);
    this.save();
    return event;
  }

  updateEvent(id, patch) {
    const e = this.data.events.find((x) => x.id === id);
    if (!e) return null;
    Object.assign(e, patch);
    this.save();
    return e;
  }

  addMemory(text) {    const m = { id: this.id('m'), text: String(text || '').slice(0, 2000), at: Date.now() };
    this.data.memory.unshift(m);
    if (this.data.memory.length > 200) this.data.memory = this.data.memory.slice(0, 200);
    this.save();
    return m;
  }

  deleteMemory(id) {
    this.data.memory = this.data.memory.filter((m) => m.id !== id);
    this.save();
  }

  addSchedule(payload) {
    const s = {
      id: this.id('sch'),
      prompt: String(payload.prompt || '').slice(0, 2000),
      agent: String(payload.agent || 'coder'),
      everyMinutes: Number(payload.everyMinutes) || 0,
      dailyAt: String(payload.dailyAt || ''),
      enabled: payload.enabled !== false,
      lastRun: 0,
      createdAt: Date.now()
    };
    this.data.schedules.push(s);
    this.save();
    return s;
  }

  deleteSchedule(id) {
    this.data.schedules = this.data.schedules.filter((s) => s.id !== id);
    this.save();
  }

  toggleSchedule(id, enabled) {
    const s = this.data.schedules.find((x) => x.id === id);
    if (s) s.enabled = Boolean(enabled);
    this.save();
    return s;
  }

  setChannelKey(name, key) {
    const field = name + 'TokenEnc';
    if (!key) {
      this.data.settings[field] = '';
    } else {
      const sealed = dpapiProtect(String(key).trim());
      this.data.settings[field] = sealed ? 'dpapi:' + sealed : 'raw:' + Buffer.from(String(key).trim()).toString('base64');
    }
    this.save();
  }

  getChannelKey(name) {
    const enc = this.data.settings[name + 'TokenEnc'] || '';
    if (enc.startsWith('dpapi:')) return dpapiUnprotect(enc.slice(6));
    if (enc.startsWith('raw:')) return Buffer.from(enc.slice(4), 'base64').toString('utf8');
    return '';
  }

  addUsage(tokensIn, tokensOut, priceIn, priceOut) {
    const s = this.data.settings;
    const pin = Number.isFinite(Number(priceIn)) ? Number(priceIn) : Number(s.priceIn || 0);
    const pout = Number.isFinite(Number(priceOut)) ? Number(priceOut) : Number(s.priceOut || 0);
    const cost = (tokensIn / 1e6) * pin + (tokensOut / 1e6) * pout;
    const u = this.data.usage;
    u.in += tokensIn;
    u.out += tokensOut;
    u.cost = Math.round((u.cost + cost) * 1e6) / 1e6;
    const day = new Date().toISOString().slice(0, 10);
    const bucket = u.byDay[day] || { in: 0, out: 0, cost: 0 };
    bucket.in += tokensIn;
    bucket.out += tokensOut;
    bucket.cost = Math.round((bucket.cost + cost) * 1e6) / 1e6;
    u.byDay[day] = bucket;
    // keep the chart light
    const days = Object.keys(u.byDay).sort();
    while (days.length > 60) delete u.byDay[days.shift()];
    this.save();
    return cost;
  }

  saveSettings(patch) {
    const s = this.data.settings;
    for (const k of ['model', 'currency', 'accent', 'approvalMode', 'workspace']) {
      if (typeof patch[k] === 'string' && patch[k].trim()) s[k] = patch[k].trim();
    }
    if (typeof patch.customInstructions === 'string') s.customInstructions = patch.customInstructions.slice(0, 4000);
    for (const k of ['usdRate', 'priceIn', 'priceOut', 'maxSteps', 'temperature', 'compactAt', 'maxTokensPerTask', 'maxCostPerTask']) {
      if (Number.isFinite(Number(patch[k]))) s[k] = Number(patch[k]);
    }
    if (typeof patch.sounds === 'boolean') s.sounds = patch.sounds;
    if (typeof patch.tts === 'boolean') s.tts = patch.tts;
    if (typeof patch.autoFallback === 'boolean') s.autoFallback = patch.autoFallback;
    if (typeof patch.useAgentsMd === 'boolean') s.useAgentsMd = patch.useAgentsMd;
    if (typeof patch.planMode === 'boolean') s.planMode = patch.planMode;
    if (patch.hooks && typeof patch.hooks === 'object') {
      s.hooks = s.hooks || { onTaskStart: '', onTool: '', onTaskDone: '' };
      for (const hk of ['onTaskStart', 'onTool', 'onTaskDone']) {
        if (typeof patch.hooks[hk] === 'string') s.hooks[hk] = patch.hooks[hk].slice(0, 2000);
      }
    }
    if (Array.isArray(patch.customModels)) {
      s.customModels = patch.customModels.slice(0, 10).map((m, i) => ({
        id: 'custom-' + (m.id || i),
        label: String(m.label || m.model || 'Custom').slice(0, 40),
        model: String(m.model || '').slice(0, 80),
        baseUrl: String(m.baseUrl || '').slice(0, 300),
        context: Number(m.context) || 32000,
        priceIn: Number(m.priceIn) || 0,
        priceOut: Number(m.priceOut) || 0
      }));
    }
    this.save();
    return s;
  }

  setWorkspace(info) {
    this.data.workspace = Object.assign({}, this.data.workspace, info);
    if (info.path) this.data.settings.workspace = info.path;
    this.save();
  }

  reset() {
    const settings = Object.assign({}, this.data.settings);
    this.data = this.defaults();
    this.data.settings = Object.assign(this.data.settings, {
      model: settings.model,
      accent: settings.accent,
      currency: settings.currency,
      apiKeyEnc: settings.apiKeyEnc,
      workspace: ''
    });
    this.persist();
  }
}

module.exports = { Store };
