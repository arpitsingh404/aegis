/* =====================================================================
   AEGIS coding agent — renderer (vanilla JS, SSE)
   ===================================================================== */

const api = {
  async get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
    return r.json();
  },
  async send(url, body, method = 'POST') {
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  }
};

/* ------------------------------- helpers ------------------------------- */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const uid = () => Math.random().toString(36).slice(2, 8);

const ICONS = {
  home: '<path d="M3 10.6 12 3l9 7.6"/><path d="M5.6 9.4V21h12.8V9.4"/><path d="M9.8 21v-6.2h4.4V21"/>',
  terminal:
    '<rect x="2.8" y="4" width="18.4" height="16" rx="2.6"/><path d="M6.6 9.2 9.6 12l-3 2.8M11.6 15h5.6"/>',
  folder: '<path d="M3.4 7.4a2 2 0 0 1 2-2h3.4l2 2.4h7.8a2 2 0 0 1 2 2v8.4a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2V7.4Z"/>',
  file: '<path d="M6.4 3.2h7.2L18.8 8v12.8H6.4Z"/><path d="M13.4 3.4V8h5.2"/>',
  users:
    '<circle cx="9" cy="8" r="3.2"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0"/><path d="M16 5.4a3.2 3.2 0 0 1 0 5.2"/><path d="M17.6 14.6A5.6 5.6 0 0 1 21.2 20"/>',
  chart: '<path d="M3.4 20.4h17.2"/><path d="M6.6 20.4v-6.2M11 20.4V8.2M15.4 20.4v-8.6M19.8 20.4V5"/>',
  brain:
    '<path d="M9.6 3.5A2.6 2.6 0 0 0 7 6.1a2.6 2.6 0 0 0-1.4 4.6A2.6 2.6 0 0 0 7 15.3a2.6 2.6 0 0 0 2.6 2.6V3.5Z"/><path d="M14.4 3.5A2.6 2.6 0 0 1 17 6.1a2.6 2.6 0 0 1 1.4 4.6A2.6 2.6 0 0 1 17 15.3a2.6 2.6 0 0 1-2.6 2.6V3.5Z"/><path d="M12 3v18"/>',
  settings:
    '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"/>',
  shield:
    '<path d="M12 3l8 3v6.2c0 5-3.6 8-8 8.8-4.4-.8-8-3.8-8-8.8V6l8-3Z"/><path d="M9 12.2l2.2 2.2 4-4.2"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.6"/><path d="M15.8 15.8 21 21"/>',
  bell: '<path d="M6.2 9.4a5.8 5.8 0 0 1 11.6 0c0 5 2 6.2 2 6.2H4.2s2-1.2 2-6.2Z"/><path d="M10 18.6a2.2 2.2 0 0 0 4 0"/>',
  spark:
    '<path d="M12 2.8l2 5.6 5.6 2-5.6 2-2 5.6-2-5.6-5.6-2 5.6-2 2-5.6Z"/><path d="M18.6 16.4l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4Z"/>',
  send: '<path d="M3.6 11.8 20.6 4l-6.2 16.2-2.6-6.6-8.2-1.8Z"/>',
  stop: '<rect x="6.4" y="6.4" width="11.2" height="11.2" rx="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4.4 6.6h15.2M9.4 6.6V4.4h5.2v2.2"/><path d="M6.4 6.6l.9 13.4h9.4l.9-13.4"/><path d="M10.4 10.6v6M13.6 10.6v6"/>',
  refresh: '<path d="M20.4 12a8.4 8.4 0 1 1-2.5-6"/><path d="M20.6 4.2v5.6H15"/>',
  arrow: '<path d="M4.6 12h14.8M13.6 6l6 6-6 6"/>',
  check: '<rect x="3.2" y="3.2" width="17.6" height="17.6" rx="4"/><path d="M7.8 12.2l2.8 2.8 5.6-6"/>',
  check2: '<path d="M4.6 12.4l4.4 4.4L19.4 6.4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  cpu: '<rect x="6.4" y="6.4" width="11.2" height="11.2" rx="2.4"/><path d="M9.8 9.8h4.4v4.4H9.8z"/><path d="M9.6 3.2v3.2M14.4 3.2v3.2M9.6 17.6v3.2M14.4 17.6v3.2M3.2 9.6h3.2M3.2 14.4h3.2M17.6 9.6h3.2M17.6 14.4h3.2"/>',
  calendar: '<rect x="3.4" y="5" width="17.2" height="15.6" rx="2.6"/><path d="M8 2.8v4M16 2.8v4M3.4 10h17.2"/>',
  eye: '<path d="M2.6 12S6 5.8 12 5.8 21.4 12 21.4 12 18 18.2 12 18.2 2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="3"/>',
  play: '<path d="M7.4 4.8 19 12 7.4 19.2V4.8Z"/>',
  key: '<circle cx="8" cy="16" r="3.6"/><path d="M10.6 13.4 20 4M16.4 7.6l2.2 2.2M14.2 9.8l2.2 2.2"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3.2 2"/>',
  alert: '<path d="M12 3.6 21 20H3L12 3.6Z"/><path d="M12 9.4v4.4M12 17v.2"/>',
  info: '<circle cx="12" cy="12" r="8.4"/><path d="M12 11v5.4M12 7.8v.2"/>',
  code: '<path d="M8.4 7.2 3.6 12l4.8 4.8"/><path d="M15.6 7.2 20.4 12l-4.8 4.8"/>',
  download:
    '<path d="M12 3.8v11.8M7.6 11.4 12 15.8l4.4-4.4"/><path d="M4.4 15.6v3.2a1.8 1.8 0 0 0 1.8 1.8h11.6a1.8 1.8 0 0 0 1.8-1.8v-3.2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  volume: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>',
  copy: '<rect x="8.4" y="8.4" width="11.6" height="11.6" rx="2.4"/><path d="M15.6 8.4V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.6a2 2 0 0 0 2 2h2.4"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2.6"/><path d="M9 4v16"/>'
};

function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
    ICONS[name] || ICONS.spark
  }</svg>`;
}

const fmtNum = (n) => Number(n || 0).toLocaleString('en-IN');
const fmtCost = (usd) => {
  const rate = Number((S && S.settings.usdRate) || 1);
  const cur = (S && S.settings.currency) || '$';
  const val = Number(usd || 0) * rate;
  if (val <= 0) return cur + '0.00';
  if (val < 0.0001) return '<' + cur + '0.0001';
  const digits = val < 0.01 ? 4 : val < 1 ? 3 : 2;
  return cur + val.toFixed(digits);
};
const timeAgo = (ts) => {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
};
const dur = (a, b) => {
  if (!a) return '—';
  const ms = (b || Date.now()) - a;
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return Math.round(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's';
};

function md(text) {
  let html = esc(text || '');
  // fenced code blocks first
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) => {
    const label = lang ? `<span class="code-lang">${esc(lang)}</span>` : '';
    return `<div class="code-block">${label}<button class="copy-code" type="button">Copy</button><pre><code>${code}</code></pre></div>`;
  });
  html = html.replace(/`([^`\n]+)`/g, '<code class="inline">$1</code>');
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  html = html.replace(/\[([^\]\n]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // markdown tables
  html = html.replace(/(?:^\|.*\|\s*$\n?)+/gm, (block) => {
    const rows = block.trim().split('\n').map((r) => r.trim()).filter(Boolean);
    if (rows.length < 2 || !/^\|[\s:|-]+\|$/.test(rows[1])) return block;
    const cells = (r) =>
      r
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim());
    const head = cells(rows[0]);
    const body = rows.slice(2).map(cells);
    return `<table class="md-table"><thead><tr>${head
      .map((h) => `<th>${h}</th>`)
      .join('')}</tr></thead><tbody>${body
      .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
      .join('')}</tbody></table>`;
  });
  html = html.replace(/^### (.*)$/gm, '<div class="md-h3">$1</div>');
  html = html.replace(/^## (.*)$/gm, '<div class="md-h2">$1</div>');
  html = html.replace(/^(\d+)\.\s+(.*)$/gm, '<div class="md-li"><span class="md-num">$1.</span>$2</div>');
  html = html.replace(/^\s*[-*]\s+(.*)$/gm, '<div class="md-li"><span class="md-num">•</span>$1</div>');
  return html;
}

function mdLite(text) {
  return md(text);
}

function toast(message, kind = 'ok') {
  const box = $('#toasts');
  const node = document.createElement('div');
  node.className = 'toast ' + kind;
  node.innerHTML = `${icon(kind === 'err' ? 'info' : kind === 'warn' ? 'alert' : 'check2', 16)}<span>${esc(message)}</span>`;
  box.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity .3s ease, transform .3s ease';
    node.style.opacity = '0';
    node.style.transform = 'translateY(6px)';
    setTimeout(() => node.remove(), 320);
  }, 3800);
}

/* ------------------------------- mascot ------------------------------- */

function mascot(size = 'hero') {
  const g = uid();
  return `
  <svg viewBox="0 0 320 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="AEGIS mascot">
    <defs>
      <radialGradient id="halo-${g}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#e879f9" stop-opacity=".55"/>
        <stop offset="100%" stop-color="#e879f9" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="body-${g}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#c084fc"/>
        <stop offset="55%" stop-color="#a855f7"/>
        <stop offset="100%" stop-color="#7c3aed"/>
      </linearGradient>
      <linearGradient id="head-${g}" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0%" stop-color="#3b1f63"/>
        <stop offset="60%" stop-color="#221238"/>
        <stop offset="100%" stop-color="#150b24"/>
      </linearGradient>
      <linearGradient id="rim-${g}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f5d0fe"/>
        <stop offset="50%" stop-color="#c084fc"/>
        <stop offset="100%" stop-color="#7c3aed"/>
      </linearGradient>
      <filter id="glow-${g}" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>

    <ellipse cx="160" cy="214" rx="78" ry="10" fill="#a855f7" opacity=".22"/>
    <ellipse cx="160" cy="88" rx="128" ry="98" fill="url(#halo-${g})" opacity=".5"/>

    <g filter="url(#glow-${g})">
      <circle cx="58" cy="58" r="15" fill="#1c1030" stroke="#c084fc" stroke-opacity=".55"/>
      <path d="M58 49.5l1.9 5.2 5.2 1.9-5.2 1.9L58 63.7l-1.9-5.2-5.2-1.9 5.2-1.9L58 49.5Z" fill="#e9d5ff"/>
      <circle cx="262" cy="62" r="15" fill="#1c1030" stroke="#fbbf24" stroke-opacity=".5"/>
      <path d="M258 55l-5 9h4l-1 6 6-9h-4l1-6Z" fill="#fcd34d" transform="translate(1 0)"/>
      <circle cx="98" cy="26" r="11" fill="#1c1030" stroke="#67e8f9" stroke-opacity=".45"/>
      <path d="M99.6 19.6 95 27.2h3.2l-1 5.4 4.8-7.6h-3.2l.8-5.4Z" fill="#a5f3fc"/>
      <circle cx="226" cy="26" r="11" fill="#1c1030" stroke="#fb7185" stroke-opacity=".45"/>
      <path d="M226 31s-4-2.6-4-5.2a2.2 2.2 0 0 1 4-1.2 2.2 2.2 0 0 1 4 1.2c0 2.6-4 5.2-4 5.2Z" fill="#fda4af"/>
    </g>

    <ellipse cx="160" cy="44" rx="52" ry="13" fill="none" stroke="url(#rim-${g})" stroke-width="3.4" filter="url(#glow-${g})" opacity=".95"/>
    <ellipse cx="160" cy="44" rx="52" ry="13" fill="none" stroke="#fff" stroke-width="1" opacity=".35"/>

    <circle cx="160" cy="108" r="57" fill="url(#head-${g})" stroke="url(#rim-${g})" stroke-width="2.4"/>
    <ellipse cx="140" cy="86" rx="26" ry="17" fill="#ffffff" opacity=".055"/>

    <g>
      <ellipse cx="141" cy="104" rx="11.5" ry="12.5" fill="#fff"/>
      <ellipse cx="179" cy="104" rx="11.5" ry="12.5" fill="#fff"/>
      <circle cx="143.5" cy="107" r="5.8" fill="#1b1030"/>
      <circle cx="181.5" cy="107" r="5.8" fill="#1b1030"/>
      <circle cx="145.8" cy="103.6" r="2.1" fill="#fff"/>
      <circle cx="183.8" cy="103.6" r="2.1" fill="#fff"/>
    </g>
    <ellipse cx="121" cy="123" rx="7.5" ry="4.6" fill="#f472b6" opacity=".35"/>
    <ellipse cx="199" cy="123" rx="7.5" ry="4.6" fill="#f472b6" opacity=".35"/>
    <path d="M152 125q8 9 16 0" fill="none" stroke="#e9d5ff" stroke-width="2.6" stroke-linecap="round" opacity=".85"/>

    <path d="M101 118a59 59 0 0 1 118 0" fill="none" stroke="#e9d5ff" stroke-opacity=".75" stroke-width="6.5" stroke-linecap="round"/>
    <rect x="89" y="106" width="17" height="38" rx="8.5" fill="url(#body-${g})" stroke="#f5d0fe" stroke-opacity=".45"/>
    <rect x="214" y="106" width="17" height="38" rx="8.5" fill="url(#body-${g})" stroke="#f5d0fe" stroke-opacity=".45"/>

    <rect x="122" y="156" width="76" height="52" rx="26" fill="url(#body-${g})" stroke="#f5d0fe" stroke-opacity=".25"/>
    <path d="M160 178s-11-7-11-14a5.6 5.6 0 0 1 11-2.6 5.6 5.6 0 0 1 11 2.6c0 7-11 14-11 14Z" fill="#fff" opacity=".92"/>
    <rect x="103" y="166" width="18" height="34" rx="9" fill="url(#body-${g})" opacity=".85" transform="rotate(14 112 183)"/>
    <rect x="199" y="166" width="18" height="34" rx="9" fill="url(#body-${g})" opacity=".85" transform="rotate(-14 208 183)"/>
  </svg>`;
}

/* ------------------------------- state ------------------------------- */

let S = null;
let page = 'home';
let currentTaskId = null;
let currentSessionId = null;
let currentSession = null;
let currentSessionLimit = 24000;
let currentSessionTokens = 0;
let attached = [];
let liveConnected = true;
let reconnectDelay = 2000;
const live = {};
let streamEl = null;
let pendingApproval = null;
let filters = { task: 'all' };
let openFile = null;
let fileDir = '.';
let searchIndex = [];

const ACCENTS = {
  violet: ['#a855f7', '#e879f9'],
  pink: ['#ec4899', '#f9a8d4'],
  cyan: ['#06b6d4', '#22d3ee'],
  emerald: ['#10b981', '#34d399'],
  amber: ['#f59e0b', '#fcd34d'],
  blue: ['#3b82f6', '#60a5fa']
};

function applyAccent(name) {
  const pair = ACCENTS[name] || ACCENTS.violet;
  document.documentElement.style.setProperty('--accent', pair[0]);
  document.documentElement.style.setProperty('--accent-2', pair[1]);
}

const aiReady = () => Boolean(S && S.settings.hasKey);
const taskById = (id) => (S ? S.tasks.find((t) => t.id === id) : null);
const runningTask = () => (S ? S.tasks.find((t) => t.status === 'running') : null);

/* ------------------------------- chrome ------------------------------- */

function renderChrome() {
  if (!S) return;
  const running = runningTask();
  const queued = S.tasks.filter((t) => t.status === 'queued').length;
  $('#tbPage').textContent = page.charAt(0).toUpperCase() + page.slice(1);
  $('#tbStatus').textContent = !liveConnected ? 'reconnecting…' : running ? 'agent running' : 'localhost · idle';

  $('#profileName').textContent = 'AEGIS';
  $('#profilePlan').textContent = (function () {
    const m = (S.models || []).find((x) => x.key === S.settings.model);
    return m ? m.label.replace(' · ', ' / ') : S.settings.model;
  })();
  $('#profileAvatar').textContent = 'A';

  const chip = $('#chipAi');
  const ready = aiReady();
  chip.classList.toggle('off', !ready);
  $('#aiChipText').textContent = ready ? 'AI Online' : 'Connect AI';
  chip.title = ready ? 'DeepSeek key saved' : 'Add your DeepSeek API key in Settings';

  $('#approvalText').textContent =
    S.settings.approvalMode === 'auto' ? 'Auto-run' : S.settings.approvalMode === 'readonly' ? 'Read-only' : 'Ask first';
  $('#approvalChip').title = 'Approval mode: ' + S.settings.approvalMode;

  const badge = $('#taskBadge');
  const active = S.tasks.filter((t) => t.status === 'running' || t.status === 'queued').length;
  badge.textContent = active;
  badge.style.display = active ? 'grid' : 'none';

  $$('.nav-item').forEach((n) => n.classList.toggle('is-active', n.dataset.page === page));

  const ws = S.workspace;
  $('#workspaceCard').innerHTML = ws.path
    ? `<div class="ws-name">${icon('folder', 14)}<b title="${esc(ws.path)}">${esc(ws.name || ws.path)}</b></div>
       <div class="ws-meta">${ws.branch ? esc(ws.branch) : 'no git'} · ${ws.dirty} changed · ${fmtNum(ws.files)} files</div>`
    : `<div class="ws-name">${icon('folder', 14)}<b>No folder yet</b></div>
       <div class="ws-meta">Open Settings → workspace</div>`;

  $('#bellBtn').querySelector('.bell-dot').hidden = !(active || pendingApproval);
  applyAccent(S.settings.accent);

  const sel = $('#agentSelect');
  if (sel) {
    const roles = S.roles || {};
    const current = sel.value;
    sel.innerHTML = Object.entries(roles)
      .map(([id, r]) => `<option value="${esc(id)}">${esc(r.label)}</option>`)
      .join('');
    if (current && roles[current]) sel.value = current;
  }
}

/* ------------------------------- home ------------------------------- */

function cardHead(num, title, sub, linkPage, linkLabel) {
  return `<div class="card-head">
    <span class="num">${num}</span>
    <div>
      <div class="card-title">${esc(title)}</div>
      ${sub ? `<div class="card-sub">${esc(sub)}</div>` : ''}
    </div>
    ${linkPage ? `<button class="card-link" data-page="${esc(linkPage)}" title="${esc(linkLabel || 'Open')}">${icon('arrow', 13)}</button>` : ''}
  </div>`;
}

function statusPill(status) {
  const map = {
    running: ['active', 'running'],
    queued: ['idle', 'queued'],
    done: ['active', 'done'],
    failed: ['off', 'failed'],
    cancelled: ['idle', 'cancelled']
  };
  const [cls, label] = map[status] || ['idle', status];
  return `<span class="state ${cls}">${esc(label)}</span>`;
}

function renderHome() {
  const ws = S.workspace;
  const running = runningTask();
  const queued = S.tasks.filter((t) => t.status === 'queued').length;
  const done = S.tasks.filter((t) => t.status === 'done').length;
  const failed = S.tasks.filter((t) => t.status === 'failed').length;
  const today = new Date().toISOString().slice(0, 10);
  const todayUsage = S.usage.byDay[today] || { in: 0, out: 0, cost: 0 };
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const runsToday = S.tasks.filter((t) => t.startedAt >= dayStart.getTime()).length;
  const doneTasks = S.tasks.filter((t) => t.status === 'done').length;
  const recent = S.tasks.slice(0, 5);
  const events = S.events.slice(-8).reverse();

  return `<div class="dash">
    <section class="card hero">
      <div>
        <h1>${running ? 'Working on it' : 'Ready when you are'} <span class="wave">⚡</span></h1>
        <p>${
          ws.path
            ? `Workspace <b>${esc(ws.name)}</b>${ws.branch ? ' on <b>' + esc(ws.branch) + '</b>' : ''} — ${fmtNum(ws.files)} files.`
            : 'Pick a project folder first. The agent reads and edits real files there.'
        }</p>
        <div class="hero-meta">
          <button class="meta-pill" data-action="new-task">${icon('plus', 14)} New task</button>
          ${
            ws.path
              ? `<span class="meta-pill">${icon('folder', 14)} ${esc(ws.path)}</span>`
              : `<button class="meta-pill" style="border-color:rgba(251,191,36,.45);color:#fde68a" data-page="settings">${icon('folder', 14)} Choose workspace</button>`
          }
          <span class="meta-pill">${icon('shield', 14)} ${esc(S.settings.approvalMode)} mode</span>
        </div>
      </div>
      <div class="hero-mascot">${mascot('hero')}</div>
    </section>

    <section class="card" style="grid-column:span 3;animation-delay:.02s">
      ${cardHead(1, 'Workspace', ws.branch ? 'git · ' + ws.branch : 'folder', 'files', 'Browse')}
      ${
        ws.path
          ? `<div class="stat-line"><b>${fmtNum(ws.files)}</b><span>files indexed</span></div>
             <div class="kv"><span>Changed</span><b>${ws.dirty} file${ws.dirty === 1 ? '' : 's'}</b></div>
             <div class="kv"><span>Last scan</span><b>${esc(timeAgo(ws.lastScan))}</b></div>
             <button class="btn btn-sm btn-ghost btn-block" style="margin-top:10px" data-page="files">${icon('code', 13)} Open files</button>`
          : `<div class="empty">No workspace yet.<br />Add a folder path in Settings.</div>
             <button class="btn btn-sm btn-block" data-page="settings">Choose workspace</button>`
      }
    </section>

    <section class="card" style="grid-column:span 3;animation-delay:.05s">
      ${cardHead(2, 'Task queue', `${running ? '1 running' : 'idle'} · ${queued} queued`, 'tasks', 'All tasks')}
      <div class="mini-stats">
        <div><b>${running ? 1 : 0}</b><span>running</span></div>
        <div><b>${queued}</b><span>queued</span></div>
        <div><b>${done}</b><span>done</span></div>
        <div><b>${failed}</b><span>failed</span></div>
      </div>
      <div class="mini-list">
        ${
          recent.length
            ? recent
                .slice(0, 3)
                .map(
                  (t) => `<button class="mini-row" data-action="open-task" data-id="${esc(t.id)}">
                ${icon(t.status === 'failed' ? 'alert' : t.status === 'running' ? 'spark' : 'check', 13)}
                <span class="t">${esc(t.title)}</span>
                ${statusPill(t.status)}
              </button>`
                )
                .join('')
            : '<div class="empty" style="padding:10px 0">No tasks yet.</div>'
        }
      </div>
      <button class="btn btn-sm btn-block" style="margin-top:10px" data-action="new-task">${icon('plus', 13)} New task</button>
    </section>

    <section class="card" style="grid-column:span 3;animation-delay:.08s">
      ${cardHead(3, 'Usage', 'real tokens from DeepSeek', 'usage', 'Report')}
      <div class="stat-line"><b>${fmtCost(todayUsage.cost)}</b><span>today</span></div>
      <div class="kv"><span>Tokens in</span><b>${fmtNum(todayUsage.in)}</b></div>
      <div class="kv"><span>Tokens out</span><b>${fmtNum(todayUsage.out)}</b></div>
      <div class="kv"><span>Runs today</span><b>${runsToday}</b></div>
      <div class="kv"><span>All-time</span><b>${fmtCost(S.usage.cost)}</b></div>
      <div class="kv"><span>Avg / run</span><b>${fmtCost(doneTasks ? S.usage.cost / doneTasks : 0)}</b></div>
      <button class="btn btn-sm btn-ghost btn-block" style="margin-top:10px" data-page="usage">See usage</button>
    </section>

    <section class="card" style="grid-column:span 3;animation-delay:.11s">
      ${cardHead(4, 'Agent team', 'subagents you can dispatch', 'agents', 'Agents')}
      <div class="agent-grid">
        ${Object.entries(S.roles || {})
          .map(([id, r]) => {
            const busy = S.tasks.some((t) => t.agent === id && t.status === 'running');
            return `<button class="agent" data-action="run-agent" data-agent="${esc(id)}">
              <span class="ico">${icon(r.icon, 14)}</span>
              <span style="min-width:0"><b>${esc(r.label)}</b><small>${esc(r.blurb)}</small></span>
              ${busy ? '<span class="dot-live"></span>' : ''}
            </button>`;
          })
          .join('')}
      </div>
    </section>

    <section class="card" style="grid-column:span 5;animation-delay:.14s">
      ${cardHead(5, 'Recent runs', 'what the agent did', 'tasks', 'History')}
      ${
        recent.length
          ? recent
              .map(
                (t) => `<div class="run-row">
            <span class="run-icon">${icon(t.status === 'failed' ? 'alert' : 'terminal', 14)}</span>
            <div class="grow">
              <b class="t">${esc(t.title)}</b>
              <small>${esc((S.roles[t.agent] || {}).label || t.agent)} · ${esc(dur(t.startedAt, t.endedAt))} · ${fmtNum(t.tokensIn + t.tokensOut)} tokens</small>
            </div>
            <span class="cost">${fmtCost(t.cost)}</span>
            ${statusPill(t.status)}
          </div>`
              )
              .join('')
          : '<div class="empty">No runs yet. Start a task from the console.</div>'
      }
    </section>

    <section class="card" style="grid-column:span 4;animation-delay:.17s">
      ${cardHead(6, 'Tool activity', 'live event log', '', '')}
      <div class="event-list">
        ${
          events.length
            ? events
                .map(
                  (e) => `<div class="event ${esc(e.status)}">
              <span class="ico">${icon(e.type === 'tool' ? 'code' : e.type === 'error' ? 'alert' : e.type === 'approval' ? 'shield' : 'check2', 12)}</span>
              <span class="ev-title">${esc(e.title)}</span>
              <span class="ev-detail">${esc(e.detail || '')}</span>
              <time>${esc(timeAgo(e.at))}</time>
            </div>`
                )
                .join('')
            : '<div class="empty">Nothing yet. Tool calls will appear here live.</div>'
        }
      </div>
    </section>

    <section class="card" style="grid-column:span 3;animation-delay:.2s">
      ${cardHead(7, 'Memory', 'project facts injected into prompts', 'memory', 'All')}
      <div class="idea-list">
        ${
          S.memory.length
            ? S.memory
                .slice(0, 4)
                .map(
                  (m) => `<div class="idea" data-page="memory">
              <span class="ico">${icon('brain', 13)}</span>
              <span class="idea-text"><b>${esc(m.text)}</b><small>${esc(timeAgo(m.at))}</small></span>
            </div>`
                )
                .join('')
            : '<div class="empty" style="padding:12px 0">No project memory yet.</div>'
        }
      </div>
      <button class="btn btn-sm btn-ghost btn-block" style="margin-top:10px" data-page="memory">Open memory</button>
    </section>

    <section class="card" style="grid-column:span 7;animation-delay:.23s;overflow:hidden">
      ${cardHead(8, 'Permissions', 'what the agent may touch', 'settings', 'Change')}
      <div class="privacy-grid" style="max-width:520px">
        <button class="privacy-item" data-page="settings">
          <span class="ico">${icon('shield', 16)}</span>
          <span><b>Approval mode</b><small>${esc(S.settings.approvalMode === 'auto' ? 'Auto-run everything' : S.settings.approvalMode === 'readonly' ? 'Read-only' : 'Ask before write/shell')}</small></span>
        </button>
        <button class="privacy-item" data-page="settings">
          <span class="ico">${icon('folder', 16)}</span>
          <span><b>Sandbox</b><small>${S.workspace.path ? 'locked to workspace folder' : 'no folder selected'}</small></span>
        </button>
        <button class="privacy-item" data-page="settings">
          <span class="ico">${icon('terminal', 16)}</span>
          <span><b>Commands</b><small>dangerous patterns blocked</small></span>
        </button>
        <button class="privacy-item" data-page="settings">
          <span class="ico">${icon('key', 16)}</span>
          <span><b>DeepSeek key</b><small>${aiReady() ? 'saved locally' : 'not set'}</small></span>
        </button>
      </div>
      <div class="shield-visual">${icon('shield', 128)}</div>
    </section>

    <section class="card" style="grid-column:span 5;animation-delay:.26s">
      ${cardHead(9, 'Environment', 'runs on this machine', 'settings', 'Details')}
      ${envRow('cpu', 'Computer', S.system.hostname)}
      ${envRow('cpu', 'System', S.system.os)}
      ${envRow('brain', 'Node', S.system.node)}
      ${envRow('folder', 'Agent data', (S.system.dataSize / 1024).toFixed(1) + ' KB')}
    </section>
  </div>`;
}

function envRow(ic, label, value) {
  return `<div class="device">
    <span class="ico">${icon(ic, 15)}</span>
    <span class="device-text"><b>${esc(label)}</b><small>${esc(value || '—')}</small></span>
  </div>`;
}

/* ------------------------------- tasks page ------------------------------- */

function renderTasks() {
  const all = S.tasks;
  const list = filters.task === 'all' ? all : all.filter((t) => t.status === filters.task);
  return `<div class="page">
    <div class="page-head">
      <div><h1>Tasks</h1><p>Every task is a real agent run in your workspace.</p></div>
      <div class="grow"></div>
      <button class="btn btn-ghost btn-sm ${filters.task === 'all' ? 'is-on' : ''}" data-filter="all">All</button>
      <button class="btn btn-ghost btn-sm ${filters.task === 'running' ? 'is-on' : ''}" data-filter="running">Running</button>
      <button class="btn btn-ghost btn-sm ${filters.task === 'queued' ? 'is-on' : ''}" data-filter="queued">Queued</button>
      <button class="btn btn-ghost btn-sm ${filters.task === 'done' ? 'is-on' : ''}" data-filter="done">Done</button>
      <button class="btn btn-ghost btn-sm ${filters.task === 'failed' ? 'is-on' : ''}" data-filter="failed">Failed</button>
      <button class="btn btn-ghost btn-sm" data-action="clear-finished">${icon('trash', 13)} Clear finished</button>
    </div>

    <form class="card panel" id="taskForm">
      <div class="form-grid">
        <div class="full">
          <label class="field-label">New task</label>
          <textarea class="field" name="prompt" rows="3" placeholder="e.g. Add a dark mode toggle to the settings page and make sure the build passes." required></textarea>
        </div>
        <div>
          <label class="field-label">Subagent</label>
          <select class="field" name="agent">
            ${Object.entries(S.roles || {})
              .map(([id, r]) => `<option value="${esc(id)}" ${id === 'coder' ? 'selected' : ''}>${esc(r.label)} — ${esc(r.blurb)}</option>`)
              .join('')}
          </select>
        </div>
        <div style="display:flex;align-items:flex-end">
          <button class="btn" type="submit" style="width:100%">${icon('play', 14)} Queue task</button>
        </div>
      </div>
    </form>

    <div class="card panel">
      ${
        list.length
          ? list
              .map(
                (t) => `<div class="row task-row">
            <span class="ico" style="color:${t.status === 'failed' ? 'var(--red)' : '#c084fc'}">${icon(t.status === 'failed' ? 'alert' : 'terminal', 15)}</span>
            <div class="grow">
              <b class="t">${esc(t.title)}</b>
              <small>${esc((S.roles[t.agent] || {}).label || t.agent)} · started ${esc(timeAgo(t.startedAt))} · ${esc(dur(t.startedAt, t.endedAt))} · ${fmtNum(t.tokensIn)} in / ${fmtNum(t.tokensOut)} out · ${fmtCost(t.cost)}</small>
            </div>
            ${statusPill(t.status)}
            <button class="icon-btn small" data-action="open-task" data-id="${esc(t.id)}" title="Open in console">${icon('eye', 13)}</button>
            ${
              t.status === 'running' || t.status === 'queued'
                ? `<button class="icon-btn small" data-action="cancel-task" data-id="${esc(t.id)}" title="Cancel">${icon('stop', 13)}</button>`
                : `<button class="icon-btn small" data-action="retry-task" data-id="${esc(t.id)}" title="Run again">${icon('refresh', 13)}</button>`
            }
            <button class="icon-btn small" data-action="del-task" data-id="${esc(t.id)}" title="Delete">${icon('trash', 13)}</button>
          </div>`
              )
              .join('')
          : '<div class="empty">No tasks here yet. Write one above.</div>'
      }
    </div>
  </div>`;
}

/* ------------------------------- files page ------------------------------- */

function renderFiles() {
  if (!S.workspace.path) {
    return `<div class="page">
      <div class="page-head"><div><h1>Files</h1><p>Pick a workspace folder to browse real files.</p></div></div>
      <div class="card panel empty">No workspace selected.</div>
      <button class="btn" data-page="settings">${icon('folder', 14)} Choose workspace</button>
    </div>`;
  }
  return `<div class="page">
    <div class="page-head">
      <div><h1>Files</h1><p>${esc(S.workspace.path)}</p></div>
      <div class="grow"></div>
      <button class="btn btn-sm btn-ghost" data-action="file-new">${icon('plus', 13)} New file</button>
      <button class="btn btn-sm btn-ghost" data-action="file-refresh">${icon('refresh', 13)} Refresh</button>
    </div>
    <div class="card panel" style="padding:10px 14px">
      <input class="field" id="fileFilter" placeholder="Filter files in this folder…" autocomplete="off" />
    </div>
    <div class="docs-layout">
      <div class="card panel doc-list" id="fileList"><div class="empty">Loading…</div></div>
      <div class="card panel doc-editor">
        <div class="editor-head">
          <b id="fileName">${esc(openFile || 'Select a file')}</b>
          <div class="grow"></div>
          <button class="btn btn-sm" data-action="file-save" ${openFile ? '' : 'disabled'}>${icon('check2', 13)} Save</button>
        </div>
        <textarea class="field" id="fileBody" aria-label="File contents" spellcheck="false" placeholder="Select a file from the left…" ${openFile ? '' : 'disabled'}></textarea>
        <div class="hint" id="fileHint">${openFile ? '' : 'Edits are written straight to disk inside the workspace.'}</div>
      </div>
    </div>
  </div>`;
}

async function loadFileList() {
  const box = $('#fileList');
  if (!box) return;
  try {
    const data = await api.get('/api/files?path=' + encodeURIComponent(fileDir));
    const parts = fileDir === '.' ? [] : fileDir.split('/').filter((p) => p && p !== '.');
    let crumb = `<button class="doc-item ${fileDir === '.' ? 'active' : ''}" data-dir=".">${icon('folder', 12)} workspace</button>`;
    let acc = '';
    parts.forEach((p) => {
      acc = acc ? acc + '/' + p : p;
      crumb += `<button class="doc-item" data-dir="${esc(acc)}">${esc(p)}</button>`;
    });
    box.innerHTML =
      crumb +
      (fileDir !== '.'
        ? `<button class="doc-item" data-dir="${esc(fileDir.split('/').slice(0, -1).join('/') || '.')}">${icon('arrow', 12)} <span class="name">..</span></button>`
        : '') +
      data.entries
        .map(
          (e) => `<button class="doc-item ${openFile === e.path ? 'active' : ''}" data-${e.dir ? 'dir' : 'file'}="${esc(e.path)}">
        ${icon(e.dir ? 'folder' : 'file', 12)} <span class="name">${esc(e.name)}</span>${e.dir ? '' : `<small>${(e.size / 1024).toFixed(1)} KB</small>`}
      </button>`
        )
        .join('');
  } catch (err) {
    const msg = String(err.message || err);
    box.innerHTML = `<div class="empty">
      Could not read this folder.
      <div style="margin-top:6px;color:#8b7aa8;font-size:10px">${esc(msg)}</div>
      <button class="btn btn-sm btn-ghost" style="margin-top:10px" data-action="file-refresh">${icon('refresh', 12)} Retry</button>
    </div>`;
  }
}

async function openFileAt(path) {
  try {
    const data = await api.get('/api/file?path=' + encodeURIComponent(path));
    openFile = path;
    const area = $('#fileBody');
    const name = $('#fileName');
    if (name) name.textContent = path;
    if (area) {
      area.value = data.content;
      area.disabled = false;
    }
    const hint = $('#fileHint');
    if (hint) hint.textContent = path + ' · ' + data.content.length + ' characters';
    $$('.doc-item').forEach((b) => b.classList.toggle('active', b.dataset.file === path));
  } catch (err) {
    toast(err.message, 'err');
  }
}

/* ------------------------------- memory page ------------------------------- */

function renderMemory() {
  return `<div class="page">
    <div class="page-head">
      <div><h1>Project memory</h1><p>Facts the agent keeps in every prompt for this project.</p></div>
    </div>
    <form class="card panel form-row" id="memoryForm">
      <input class="field" name="text" placeholder="e.g. This repo uses pnpm, tests run with pnpm test" style="grid-column:span 2" required />
      <button class="btn" type="submit" style="grid-column:span 2">${icon('plus', 14)} Save memory</button>
    </form>
    <div class="card panel">
      ${
        S.memory.length
          ? S.memory
              .map(
                (m) => `<div class="row">
            <span class="ico" style="color:#c084fc">${icon('brain', 14)}</span>
            <div class="grow"><b>${esc(m.text)}</b><small>${esc(timeAgo(m.at))}</small></div>
            <button class="icon-btn small" data-action="del-memory" data-id="${esc(m.id)}">${icon('trash', 13)}</button>
          </div>`
              )
              .join('')
          : '<div class="empty">No memory yet. Add build commands, conventions or gotchas.</div>'
      }
    </div>
  </div>`;
}

/* ------------------------------- agents page ------------------------------- */

function renderAgents() {
  return `<div class="page">
    <div class="page-head">
      <div><h1>Agent team</h1><p>Four subagents, one workspace. Every run is real.</p></div>
    </div>
    <div class="grid-2">
      ${Object.entries(S.roles || {})
        .map(([id, r]) => {
          const tasks = S.tasks.filter((t) => t.agent === id);
          const busy = tasks.some((t) => t.status === 'running');
          return `<div class="card panel">
          <div class="card-head" style="margin-bottom:8px">
            <span class="ico" style="width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(145deg,rgba(168,85,247,.3),rgba(236,72,153,.16));color:#e9d5ff">${icon(r.icon, 16)}</span>
            <div><div class="card-title">${esc(r.label)}</div><div class="card-sub">${esc(r.tools.length)} tools</div></div>
            ${busy ? '<span class="spacer"></span><span class="state active">running</span>' : ''}
          </div>
          <p style="margin:0 0 10px;font-size:11.5px;color:var(--muted);min-height:34px">${esc(r.blurb)}</p>
          <div class="tool-tags">${r.tools.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
          <div style="display:flex;gap:6px;margin-top:10px">
            <button class="btn btn-xs" data-action="run-agent" data-agent="${esc(id)}">${icon('play', 12)} Dispatch</button>
            <small style="color:var(--muted);font-size:10px;margin-left:auto;align-self:center">${tasks.length} runs</small>
          </div>
        </div>`;
        })
        .join('')}
    </div>
  </div>`;
}

/* ------------------------------- usage page ------------------------------- */

function renderUsage() {
  const days = Object.keys(S.usage.byDay).sort().slice(-14);
  const max = Math.max(...days.map((d) => S.usage.byDay[d].cost), 0.0001);
  const totalTok = S.usage.in + S.usage.out;
  const priced = S.tasks.filter((t) => t.cost > 0);
  return `<div class="page">
    <div class="page-head">
      <div><h1>Usage</h1><p>Token counts come from DeepSeek; cost uses your rate in Settings.</p></div>
    </div>
    <div class="grid-3">
      <div class="card stat"><small>All-time cost</small><b>${fmtCost(S.usage.cost)}</b><span>${priced.length} billed runs</span></div>
      <div class="card stat"><small>Tokens in</small><b>${fmtNum(S.usage.in)}</b><span>prompt tokens</span></div>
      <div class="card stat"><small>Tokens out</small><b>${fmtNum(S.usage.out)}</b><span>completion tokens</span></div>
    </div>
    <div class="card panel">
      <div class="card-head"><span class="card-title">Cost by day</span><span class="spacer"></span><span class="tag">last ${days.length} day${days.length === 1 ? '' : 's'}</span></div>
      <div class="usage-chart">
        ${
          days.length
            ? days
                .map((d) => {
                  const u = S.usage.byDay[d];
                  const h = Math.max(3, Math.round((u.cost / max) * 100));
                  return `<div class="usage-bar" title="${d}: ${fmtCost(u.cost)} · ${fmtNum(u.in + u.out)} tokens">
                  <i style="height:${h}%"></i><span>${d.slice(5)}</span>
                </div>`;
                })
                .join('')
            : '<div class="empty">No usage recorded yet.</div>'
        }
      </div>
      <div class="money-legend"><span>average ${fmtCost(S.usage.cost / Math.max(1, days.length))}/day</span><span>${fmtNum(totalTok)} tokens total</span></div>
    </div>
    <div class="card panel">
      <div class="card-head"><span class="card-title">Per-task cost</span><span class="spacer"></span><span class="card-sub">${S.tasks.length} tasks</span></div>
      ${
        S.tasks.length
          ? S.tasks
              .slice(0, 25)
              .map(
                (t) => `<div class="row">
            <span class="ico" style="color:#c084fc">${icon('terminal', 14)}</span>
            <div class="grow"><b class="t">${esc(t.title)}</b><small>${fmtNum(t.tokensIn)} in / ${fmtNum(t.tokensOut)} out · ${esc(dur(t.startedAt, t.endedAt))}</small></div>
            <b>${fmtCost(t.cost)}</b>
            ${statusPill(t.status)}
          </div>`
              )
              .join('')
          : '<div class="empty">No tasks yet.</div>'
      }
    </div>
  </div>`;
}

/* ------------------------------- settings page ------------------------------- */

function renderSettings() {
  const s = S.settings;
  return `<div class="page">
    <div class="page-head">
      <div><h1>Settings</h1><p>Workspace, model, permissions and cost rates.</p></div>
      <div class="grow"></div>
      <span class="tag">localhost · ${esc(S.system.node)}</span>
    </div>

    <div class="grid-2">
      <div class="card panel">
        <div class="card-head"><span class="ico" style="color:#c084fc">${icon('folder', 16)}</span><span class="card-title">Workspace</span></div>
        <label class="field-label">Project folder (absolute path)</label>
        <input class="field" id="wsPath" value="${esc(s.workspace)}" placeholder="C:\\Users\\you\\projects\\my-app" />
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn" data-action="save-workspace">${icon('check2', 14)} Load folder</button>
          <button class="btn btn-ghost" data-action="save-workspace" data-sub="files">${icon('folder', 14)} Open files</button>
        </div>
        <div class="hint">The agent can only touch files inside this folder. Git status is read automatically.</div>
        ${
          S.workspace.path
            ? `<div class="kv" style="margin-top:12px"><span>Name</span><b>${esc(S.workspace.name)}</b></div>
               <div class="kv"><span>Branch</span><b>${esc(S.workspace.branch || '—')}</b></div>
               <div class="kv"><span>Files</span><b>${fmtNum(S.workspace.files)}</b></div>
               <div class="kv"><span>Changed</span><b>${S.workspace.dirty}</b></div>`
            : ''
        }
      </div>

      <div class="card panel">
        <div class="card-head"><span class="ico" style="color:#22d3ee">${icon('key', 16)}</span><span class="card-title">Providers</span>
          <span class="spacer"></span>
          <span class="state ${Object.keys(s.providers || {}).length ? 'active' : 'idle'}">${Object.keys(s.providers || {}).length} configured</span>
        </div>
        <label class="field-label">Provider</label>
        <select class="field" id="providerSelect">
          ${Object.entries(S.providers || {})
            .map(([id, p]) => `<option value="${esc(id)}" ${id === (s.provider || 'deepseek') ? 'selected' : ''}>${esc(p.label)}</option>`)
            .join('')}
        </select>
        <label class="field-label" style="margin-top:12px">API key (stored with Windows DPAPI)</label>
        <input class="field" id="apiKeyInput" type="password" placeholder="${s.hasKey ? '•••••••• (saved)' : 'paste key for this provider'}" autocomplete="off" />
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn" data-action="save-provider">${icon('check2', 14)} Save key</button>
          <button class="btn btn-ghost" data-action="test-provider">${icon('spark', 14)} Test</button>
          <button class="btn btn-ghost" data-action="fetch-models">${icon('refresh', 14)} Fetch models</button>
          <button class="btn btn-ghost" data-action="clear-provider">${icon('trash', 14)} Remove key</button>
        </div>
        <div id="remoteModels" class="module-list" style="margin-top:10px"></div>
        <div class="hint" id="testResult">Ollama needs no key. Anthropic / Gemini use their own adapters. One key per provider.</div>
        <div class="kv" style="margin-top:10px"><span>Configured</span><b>${Object.keys(s.providers || {}).join(', ') || 'none'}</b></div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card panel">
        <div class="card-head"><span class="ico" style="color:#c084fc">${icon('shield', 16)}</span><span class="card-title">Permissions</span></div>
        <label class="field-label">Approval mode</label>
        <select class="field" id="approvalMode">
          <option value="ask" ${s.approvalMode === 'ask' ? 'selected' : ''}>Ask before write / command (recommended)</option>
          <option value="auto" ${s.approvalMode === 'auto' ? 'selected' : ''}>Auto-run everything</option>
          <option value="readonly" ${s.approvalMode === 'readonly' ? 'selected' : ''}>Read-only (no writes, no commands)</option>
        </select>
        <label class="field-label" style="margin-top:12px">Max agent steps per message</label>
        <input class="field" id="maxSteps" type="number" min="2" max="60" value="${esc(s.maxSteps)}" />
        <div class="hint">Destructive shell patterns are always blocked, even in auto mode.</div>
        <div class="row" style="margin-top:12px"><div class="grow"><b>Interface sounds</b><small>Short chime when a run completes.</small></div>
          <button class="toggle ${s.sounds ? 'on' : ''}" data-action="toggle-sounds"></button></div>
        <div class="row" style="margin-top:12px"><div class="grow"><b>Plan mode</b><small>Draft a plan first, approve it, then execute (Claude style).</small></div>
          <button class="toggle ${s.planMode ? 'on' : ''}" data-action="toggle-planmode"></button></div>
      </div>

      <div class="card panel">
        <div class="card-head"><span class="ico" style="color:#22d3ee">${icon('spark', 16)}</span><span class="card-title">Chat &amp; context</span></div>
        <div class="form-row">
          <div>
            <label class="field-label">Compact after (tokens)</label>
            <input class="field" id="compactAt" type="number" min="2000" step="1000" value="${esc(s.compactAt)}" />
          </div>
          <div>
            <label class="field-label">Temperature</label>
            <input class="field" id="temperature" type="number" min="0" max="2" step="0.1" value="${esc(s.temperature)}" />
          </div>
        </div>
        <div class="form-row" style="margin-top:10px">
          <div>
            <label class="field-label">Max tokens / message</label>
            <input class="field" id="maxTokensPerTask" type="number" min="5000" step="5000" value="${esc(s.maxTokensPerTask)}" />
          </div>
          <div>
            <label class="field-label">Max cost / message (USD)</label>
            <input class="field" id="maxCostPerTask" type="number" min="0.01" step="0.01" value="${esc(s.maxCostPerTask)}" />
          </div>
        </div>
        <div class="row" style="margin-top:12px"><div class="grow"><b>OpenCode rules</b><small>Read AGENTS.md / CLAUDE.md / opencode.json instructions from the workspace.</small></div>
          <button class="toggle ${s.useAgentsMd ? 'on' : ''}" data-action="toggle-agentsmd"></button></div>
        <button class="btn btn-sm" style="margin-top:12px" data-action="save-chat">${icon('check2', 13)} Save chat settings</button>
        <label class="field-label" style="margin-top:14px">Custom instructions (sent with every message)</label>
        <textarea class="field" id="customInstructions" rows="3" placeholder="e.g. Always answer in short bullets. Use TypeScript strict mode. Never add comments.">${esc(s.customInstructions || '')}</textarea>
        <div class="hint">At the token threshold the agent summarises older messages, keeps the summary, and continues in a new chat if needed. Nothing is silently lost.</div>
      </div>
    </div>

    <div class="card panel" style="margin-top:14px">
      <div class="card-head"><span class="ico" style="color:#fbbf24">${icon('terminal', 16)}</span><span class="card-title">Hooks</span>
        <span class="spacer"></span><span class="card-sub">run shell commands on events</span></div>
      <div class="form-row">
        <div>
          <label class="field-label">On task start</label>
          <input class="field" id="hookStart" placeholder="e.g. echo start %AEGIS_TASK_ID%" value="${esc((s.hooks && s.hooks.onTaskStart) || '')}" />
        </div>
        <div>
          <label class="field-label">On tool call</label>
          <input class="field" id="hookTool" placeholder="e.g. echo %AEGIS_TOOL% >> tools.log" value="${esc((s.hooks && s.hooks.onTool) || '')}" />
        </div>
      </div>
      <div class="form-row" style="margin-top:10px">
        <div>
          <label class="field-label">On task done</label>
          <input class="field" id="hookDone" placeholder="e.g. echo %AEGIS_STATUS% >> done.log" value="${esc((s.hooks && s.hooks.onTaskDone) || '')}" />
        </div>
        <div style="display:flex;align-items:flex-end">
          <button class="btn btn-sm" data-action="save-hooks">${icon('check2', 13)} Save hooks</button>
        </div>
      </div>
      <div class="hint">Env vars: AEGIS_HOOK, AEGIS_TASK_ID, AEGIS_TOOL, AEGIS_DETAIL, AEGIS_STATUS, AEGIS_SUMMARY. Empty = disabled. 30s timeout.</div>
    </div>

    <div class="card panel">
      <div class="card-head"><span class="ico" style="color:#c084fc">${icon('cpu', 16)}</span><span class="card-title">Models</span>
        <span class="spacer"></span><span class="card-sub">${(S.models || []).length} available</span></div>
      <div class="module-list" style="max-height:none">
        ${(S.models || [])
          .map(
            (m) => `<div class="module-row" style="cursor:default">
          <span class="ico">${icon('cpu', 13)}</span>
          <span class="module-name">${esc(m.label)}${
            m.label !== m.model ? ` <span style="color:#8b7aa8">· ${esc(m.model)}</span>` : ''
          }</span>
          ${m.custom ? `<button class="icon-btn small" data-action="del-model" data-id="${esc(m.id)}">${icon('trash', 12)}</button>` : `<span class="mod-badge">${esc(m.note || 'built-in')}</span>`}
        </div>`
          )
          .join('')}
      </div>
      <div class="form-row" style="margin-top:12px">
        <input class="field" id="cmLabel" placeholder="Label (e.g. GPT-4o)" />
        <input class="field" id="cmModel" placeholder="Model id (e.g. gpt-4o)" />
        <input class="field" id="cmBase" placeholder="Base URL (https://api.openai.com/v1)" style="grid-column:span 2" />
        <button class="btn btn-sm" data-action="add-model">${icon('plus', 13)} Add model</button>
      </div>
      <div class="hint">Custom models are OpenAI-compatible endpoints. They use your saved DeepSeek key unless the endpoint accepts it.</div>
    </div>

    <div class="grid-2">
      <div class="card panel">
        <div class="card-head"><span class="ico" style="color:#c084fc">${icon('chart', 16)}</span><span class="card-title">Cost rates</span></div>
        <div class="form-row">
          <div><label class="field-label">USD / 1M input</label><input class="field" id="priceIn" type="number" step="0.01" value="${esc(s.priceIn)}" /></div>
          <div><label class="field-label">USD / 1M output</label><input class="field" id="priceOut" type="number" step="0.01" value="${esc(s.priceOut)}" /></div>
          <div><label class="field-label">Rate (1 = USD)</label><input class="field" id="usdRate" type="number" step="0.1" value="${esc(s.usdRate)}" /></div>
          <div><label class="field-label">Currency</label><input class="field" id="currency" value="${esc(s.currency)}" maxlength="4" /></div>
        </div>
        <button class="btn btn-sm" style="margin-top:12px" data-action="save-rates">${icon('check2', 13)} Save rates</button>
        <div class="hint">Defaults match DeepSeek's public pricing. Change them if your plan differs.</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card panel">
        <div class="card-head"><span class="ico" style="color:#c084fc">${icon('spark', 16)}</span><span class="card-title">Appearance</span></div>
        <label class="field-label">Accent colour</label>
        <div style="display:flex;gap:9px;flex-wrap:wrap">
          ${Object.entries(ACCENTS)
            .map(
              ([name, pair]) => `<button data-action="accent" data-name="${name}" title="${name}"
            style="width:34px;height:34px;border-radius:11px;background:linear-gradient(140deg,${pair[0]},${pair[1]});border:2px solid ${s.accent === name ? '#fff' : 'transparent'};box-shadow:0 0 16px -4px ${pair[0]}"></button>`
            )
            .join('')}
        </div>
      </div>

      <div class="card panel">
        <div class="card-head"><span class="ico" style="color:#c084fc">${icon('info', 16)}</span><span class="card-title">About</span></div>
        <div class="kv"><span>Data folder</span><b style="max-width:62%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(S.system.dataDir)}">${esc(S.system.dataDir)}</b></div>
        <div class="kv"><span>Data size</span><b>${(S.system.dataSize / 1024).toFixed(1)} KB</b></div>
        <div class="kv"><span>Last saved</span><b>${esc(timeAgo(S.system.lastSaved))}</b></div>
        <div class="kv"><span>Server</span><b>127.0.0.1 (localhost)</b></div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <a class="btn btn-sm btn-ghost" href="/api/export" download>${icon('download', 13)} Export data</a>
          <button class="btn btn-sm btn-ghost" data-action="import">${icon('download', 13)} Import</button>
          <input type="file" id="importFile" accept="application/json,.json" hidden />
          <button class="btn btn-sm btn-danger" data-action="reset">${icon('trash', 13)} Reset</button>
        </div>
        <div class="hint">Reset keeps your API key and model. Tasks, runs, memory and usage are cleared.</div>
      </div>
    </div>

    <div class="card panel">
      <div class="card-head"><span class="ico" style="color:#22d3ee">${icon('clock', 16)}</span><span class="card-title">Automations &amp; channels</span>
        <span class="spacer"></span>
        <span class="state ${(S.schedules || []).length ? 'active' : 'idle'}">${(S.schedules || []).length} schedule${(S.schedules || []).length === 1 ? '' : 's'}</span>
      </div>

      <label class="field-label">Webhook (any app can trigger the agent)</label>
      <div class="inline-form">
        <input class="field" id="webhookUrl" readonly value="http://127.0.0.1:${location.port || '7791'}/api/hook/${esc(s.webhookToken || '')}" />
        <button class="btn btn-sm btn-ghost" data-action="copy-webhook">${icon('copy', 13)} Copy</button>
      </div>
      <div class="hint">POST JSON {"prompt":"..."} to that URL — Zapier, GitHub Actions, scripts, anything.</div>

      <form id="scheduleForm" class="form-row" style="margin-top:14px">
        <input class="field" name="prompt" placeholder="Scheduled prompt (e.g. summarise today's commits)" style="grid-column:span 2" required />
        <input class="field" name="everyMinutes" type="number" min="1" placeholder="Every N minutes" />
        <input class="field" name="dailyAt" placeholder="or daily HH:MM" />
        <button class="btn btn-sm" type="submit" style="grid-column:span 2">${icon('plus', 13)} Add schedule</button>
      </form>

      <div class="module-list" style="max-height:none;margin-top:8px">
        ${
          (S.schedules || []).length
            ? S.schedules
                .map(
                  (sch) => `<div class="module-row" style="cursor:default">
              <span class="ico">${icon('clock', 12)}</span>
              <span class="module-name">${esc(sch.prompt)}</span>
              <span class="mod-badge">${sch.everyMinutes ? 'every ' + sch.everyMinutes + 'm' : esc(sch.dailyAt)}</span>
              <button class="icon-btn small" data-action="toggle-schedule" data-id="${esc(sch.id)}" data-enabled="${sch.enabled}">${sch.enabled ? '⏸' : '▶'}</button>
              <button class="icon-btn small" data-action="del-schedule" data-id="${esc(sch.id)}">${icon('trash', 12)}</button>
            </div>`
                )
                .join('')
            : '<div class="empty">No schedules yet.</div>'
        }
      </div>

      <label class="field-label" style="margin-top:14px">Telegram bot token</label>
      <div class="inline-form">
        <input class="field" id="telegramToken" type="password" placeholder="${S.channels && S.channels.telegram.running ? 'running' : '123456:ABC…'}" />
        <button class="btn btn-sm" data-action="save-telegram">${icon('check2', 13)} Start</button>
        <button class="btn btn-sm btn-ghost" data-action="stop-telegram">Stop</button>
      </div>
      <div class="hint">
        ${S.channels && S.channels.telegram.running ? '✅ Telegram bot is polling — message it from any device.' : 'Stopped.'}
        ${S.channels && S.channels.telegram.error ? ' · ' + esc(S.channels.telegram.error) : ''}
        · Create a bot with @BotFather.
      </div>

      <label class="field-label" style="margin-top:14px">Skills</label>
      <div class="module-list" style="max-height:none">
        ${
          (S.skills || []).length
            ? S.skills
                .map(
                  (sk) => `<div class="module-row" style="cursor:default">
              <span class="ico">${icon('spark', 12)}</span>
              <span class="module-name" title="${esc(sk.preview)}">${esc(sk.name)}</span>
              <span class="mod-badge">${esc(sk.dir)}</span>
            </div>`
                )
                .join('')
            : '<div class="empty">Drop .md files in <b>workspace/skills</b> or <b>~/.aegis/skills</b> to add skills.</div>'
        }
      </div>
    </div>
  </div>`;
}

/* ------------------------------- console ------------------------------- */

/* ------------------------------- console ------------------------------- */

function modulesForTask(taskId) {
  const out = new Map();
  const evs = S.events.filter((e) => e.taskId === taskId && e.type === 'tool' && e.status !== 'running');
  for (const e of evs) {
    if (!['read_file', 'write_file', 'edit_file'].includes(e.title)) continue;
    const file = (e.detail || '').trim();
    if (!file) continue;
    const prev = out.get(file) || { file, reads: 0, writes: 0, edits: 0 };
    if (e.title === 'read_file') prev.reads++;
    if (e.title === 'write_file') prev.writes++;
    if (e.title === 'edit_file') prev.edits++;
    out.set(file, prev);
  }
  return Array.from(out.values()).sort((a, b) => b.writes + b.edits - (a.writes + a.edits) || a.file.localeCompare(b.file));
}

function moduleBadges(m) {
  const b = [];
  if (m.writes) b.push(`<span class="mod-badge added">added ×${m.writes}</span>`);
  if (m.edits) b.push(`<span class="mod-badge edited">modified ×${m.edits}</span>`);
  if (m.reads) b.push(`<span class="mod-badge read">read ×${m.reads}</span>`);
  return b.join('');
}

function renderConsolePage() {
  return `<div class="page console-page">
    <div class="page-head">
      <div>
        <h1>Chat</h1>
        <p>Talk to your agent like a colleague. Every model switch applies to the next message.</p>
      </div>
      <div class="grow"></div>
      <div class="session-wrap">
        <button class="btn btn-ghost btn-sm" data-action="toggle-sessions">${icon('brain', 13)} History <span id="sessionCount"></span></button>
        <div class="mini-pop session-pop" id="sessionPop" hidden></div>
      </div>
      <button class="btn btn-ghost btn-sm" data-action="copy-console">${icon('copy', 13)} Copy</button>
      <button class="btn btn-ghost btn-sm" data-action="export-chat">${icon('download', 13)} Export</button>
      <button class="btn btn-sm" data-action="new-task">${icon('plus', 13)} New chat</button>
    </div>

    <div class="console-layout">
      <div class="card panel console-main">
        <header class="chat-head">
          <div class="chat-avatar" id="chatAvatar">${mascot('mini')}</div>
          <div class="chat-id">
            <b id="consoleTitle">New chat</b>
            <small id="consoleStatus"><span class="dot"></span> ready</small>
          </div>
          <span class="spacer"></span>
          <div class="ctx-meter" id="ctxMeter" title="Context usage">
            <i style="width:0%"></i>
            <span id="ctxText">0 / 24k</span>
          </div>
        </header>

        <div class="chat-body console-body" id="transcript"></div>

        <div class="composer" id="composer">
          <div class="attach-row" id="attachRow"></div>
          <form class="chat-input" id="chatForm">
            <select id="modelSelect" class="agent-select model-select" title="Model"></select>
            <select id="agentSelect" class="agent-select" title="Subagent"></select>
            <button type="button" class="icon-btn attach-btn" id="attachBtn" title="Attach a text file">
              ${icon('plus', 16)}
            </button>
            <textarea id="chatInput" aria-label="Message the agent" rows="1" placeholder="Ask anything or describe a task… (Enter to send, Shift+Enter for a new line)"></textarea>
            <button class="send" type="submit" id="sendBtn" title="Send">
              <span class="ico" data-ico="send"></span>
            </button>
          </form>
          <input type="file" id="fileInput" multiple hidden accept=".txt,.md,.js,.ts,.tsx,.jsx,.json,.py,.go,.rs,.java,.c,.cpp,.cs,.html,.css,.sql,.yml,.yaml,.sh,.ps1,.env,.toml,.xml,.csv" />
        </div>
        <div class="estimate" id="estimate"></div>
      </div>

      <div class="card panel console-side">
        <div class="side-section">
          <div class="side-head"><span>Files touched</span><span id="modulesCount">none</span></div>
          <div id="modulesList" class="module-list"></div>
        </div>
        <div class="side-section">
          <div class="side-head"><span>Repo changes</span><span id="repoBranch">git</span></div>
          <div id="repoChanges" class="module-list"><div class="empty">Checking…</div></div>
        </div>
        <div class="side-section">
          <div class="side-head"><span>Context</span><span id="ctxHint">—</span></div>
          <div class="ctx-lines" id="ctxLines"></div>
        </div>
        <div class="side-section">
          <div class="side-head"><span>Plan</span><span id="todoCount">—</span></div>
          <div id="todoList" class="module-list"></div>
        </div>
        <div class="side-section">
          <div class="side-head"><span>Backups</span><span id="backupCount">—</span></div>
          <div id="backupList" class="module-list"></div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ------------------------------ sessions ------------------------------ */

function sessionMeta(id) {
  return (S.sessions || []).find((s) => s.id === id) || null;
}

async function loadSession(id) {
  if (!id) {
    currentSession = null;
    currentSessionId = null;
    paintChat();
    return;
  }
  try {
    const data = await api.get('/api/sessions/' + encodeURIComponent(id));
    currentSession = data.session;
    currentSessionId = id;
    currentSessionLimit = data.limit;
    currentSessionTokens = data.tokens;
    const modelSel = $('#modelSelect');
    if (modelSel && currentSession.model) modelSel.value = currentSession.model;
    paintChat();
  } catch (err) {
    toast(err.message, 'err');
  }
}

async function newSession() {
  const res = await api.send('/api/sessions', { model: currentModel() });
  currentSession = res.session;
  currentSessionId = res.session.id;
  await refreshState();
  paintChat();
  { const i = $('#chatInput'); if (i) i.focus(); }
}

function currentModel() {
  const el = $('#modelSelect');
  if (el && el.value) return el.value;
  return S.settings.model;
}

function renderModelSelect() {
  const el = $('#modelSelect');
  if (!el) return;
  const models = S.models || [];
  const active = currentSession ? currentSession.model : S.settings.model;
  const groups = {};
  for (const m of models) {
    const g = m.providerLabel || m.provider || 'Models';
    if (!groups[g]) groups[g] = [];
    groups[g].push(m);
  }
  el.innerHTML = Object.entries(groups)
    .map(
      ([label, list]) =>
        `<optgroup label="${esc(label)}">${list
          .map((m) => `<option value="${esc(m.key)}" ${m.key === active ? 'selected' : ''}>${esc(m.label)}</option>`)
          .join('')}</optgroup>`
    )
    .join('');
  if (active && models.some((m) => m.key === active)) el.value = active;
}

function paintSessionsPop() {
  const pop = $('#sessionPop');
  if (!pop) return;
  const q = (pop.dataset.q || '').toLowerCase();
  const list = (S.sessions || []).filter((s) => !q || s.title.toLowerCase().includes(q));
  pop.innerHTML =
    `<div class="mini-title">Conversations</div>
     <input class="field session-search" id="sessionSearch" placeholder="Search chats…" value="${esc(pop.dataset.q || '')}" />
     <div class="session-list">
      ${
        list.length
          ? list
              .slice(0, 40)
              .map(
                (s) => `<div class="session-item ${s.id === currentSessionId ? 'on' : ''}" data-session="${esc(s.id)}">
                  <span class="s-icon">${icon('terminal', 12)}</span>
                  <span class="s-main"><b>${esc(s.title)}</b><small>${s.messageCount} msgs · ${esc(timeAgo(s.updatedAt))}</small></span>
                  <button class="icon-btn small s-del" data-del-session="${esc(s.id)}" title="Delete">${icon('x', 11)}</button>
                </div>`
              )
              .join('')
          : '<div class="empty">No conversations yet.</div>'
      }
     </div>`;
}

/* ------------------------------ chat ------------------------------ */

function renderMessage(m) {
  if (m.role === 'user') {
    return `<div class="msg user">${md(m.content)}</div>`;
  }
  return `<div class="msg bot">
    <div class="msg-body">${md(m.content)}</div>
    <div class="msg-foot">${m.model ? esc(m.model) + ' · ' : ''}${esc(timeAgo(m.at))}</div>
  </div>`;
}

function paintChat() {
  const box = $('#transcript');
  if (!box) return;
  renderModelSelect();

  const sel = $('#agentSelect');
  if (sel && !sel.options.length) {
    sel.innerHTML = Object.entries(S.roles || {})
      .map(([id, r]) => `<option value="${esc(id)}" ${id === 'coder' ? 'selected' : ''}>${esc(r.label)}</option>`)
      .join('');
  }

  const count = $('#sessionCount');
  if (count) count.textContent = S.sessions.length ? S.sessions.length : '';

  const title = currentSession ? currentSession.title : 'New chat';
  const tEl = $('#consoleTitle');
  if (tEl) tEl.textContent = title;

  const running = runningTaskForSession();
  const st = $('#consoleStatus');
  if (st) {
    st.innerHTML = running
      ? `<span class="dot"></span> running · ${esc((S.roles[running.agent] || {}).label || running.agent)}`
      : `<span class="dot"></span> ${currentSession ? currentSession.messages.length + ' messages' : 'ready'}`;
  }

  const total = currentSession ? currentSession.messages.reduce((a, m) => a + (m.content || '').length / 4, 0) : 0;
  const limit = currentSessionLimit || S.settings.compactAt || 24000;
  const pct = Math.min(100, Math.round((total / limit) * 100));
  const meter = $('#ctxMeter');
  if (meter) {
    meter.querySelector('i').style.width = Math.max(2, pct) + '%';
    meter.classList.toggle('warn', pct > 75);
    const txt = $('#ctxText');
    if (txt) txt.textContent = `${fmtNum(Math.round(total))} / ${fmtNum(Math.round(limit / 1000))}k`;
  }
  const ctxLines = $('#ctxLines');
  if (ctxLines) {
    ctxLines.innerHTML = currentSession
      ? `<div class="kv"><span>Messages</span><b>${currentSession.messages.length}</b></div>
         <div class="kv"><span>Compactions</span><b>${currentSession.compactions || 0}</b></div>
         <div class="kv"><span>Summary</span><b>${currentSession.summary ? 'carried' : '—'}</b></div>`
      : '';
  }
  const hint = $('#ctxHint');
  if (hint) hint.textContent = pct > 75 ? 'compacting soon' : 'healthy';

  let html = '';
  if (!currentSession || !currentSession.messages.length) {
    html = `<div class="msg bot welcome">${md(
      aiReady()
        ? 'Hi. I am AEGIS — your local coding agent.\n\nAsk me to **read**, **edit** or **run** anything in your workspace. I will show every tool call and ask before writing a file or running a command.'
        : 'Add your API key in **Settings** and pick a workspace folder. Then start chatting.'
    )}</div>`;
  } else {
    html = currentSession.messages.map(renderMessage).join('');
  }

  if (running) {
    html += `<div class="msg bot live" id="liveText">${md(live[running.id] || '')}<span class="typing"><i></i><i></i><i></i></span></div>`;
    const events = S.events.filter((e) => e.taskId === running.id && e.type !== 'done');
    if (events.length) {
      html += `<details class="run-log-wrap" open>
        <summary>${events.length} tool call${events.length === 1 ? '' : 's'}</summary>
        <div class="run-log">${events
          .map(
            (e) => `<div class="event ${esc(e.status)}">
              <span class="ico">${icon(e.type === 'tool' ? 'code' : 'alert', 12)}</span>
              <span class="ev-title">${esc(e.title)}</span>
              <span class="ev-detail">${esc(e.detail)}</span>
            </div>`
          )
          .join('')}</div>
      </details>`;
    }
  }

  const wasNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  box.innerHTML = html;
  streamEl = $('#liveText');
  if (wasNearBottom || running) {
    box.scrollTop = box.scrollHeight;
    requestAnimationFrame(() => (box.scrollTop = box.scrollHeight));
  }

  const btn = $('#sendBtn');
  if (btn) {
    if (running) {
      btn.classList.add('stop');
      btn.innerHTML = icon('stop', 16);
    } else {
      btn.classList.remove('stop');
      btn.innerHTML = icon('send', 16);
    }
  }

  paintModules(running || latestTaskForSession());
  paintBackups();
  paintTodos();
  updateEstimate();
}

function paintTodos() {
  const list = $('#todoList');
  if (!list) return;
  const items = (S.todos && currentSessionId && S.todos[currentSessionId]) || [];
  const count = $('#todoCount');
  if (count) count.textContent = items.length ? `${items.filter((i) => i.done).length}/${items.length}` : '—';
  list.innerHTML = items.length
    ? items
        .map(
          (t) => `<div class="todo-row ${t.done ? 'done' : ''}">
        <span class="todo-dot">${t.done ? '✓' : '○'}</span>
        <span class="module-name">${esc(t.text)}</span>
      </div>`
        )
        .join('')
    : '<div class="empty">No plan yet — the agent adds steps here for multi-step work.</div>';
}

function paintBackups() {
  const list = $('#backupList');
  if (!list) return;
  const items = (S.backups || []).slice(0, 6);
  const count = $('#backupCount');
  if (count) count.textContent = items.length ? `${S.backups.length} saved` : 'none';
  list.innerHTML = items.length
    ? items
        .map(
          (b) => `<div class="module-row backup-row">
        <span class="ico">${icon('refresh', 12)}</span>
        <span class="module-name" title="${esc(b.path)}">${esc(b.path)}</span>
        <span class="mod-badge read">${esc(timeAgo(b.at))}</span>
        <button class="icon-btn small" data-action="revert-backup" data-id="${esc(b.id)}" title="Restore this file">${icon('arrow', 12)}</button>
      </div>`
        )
        .join('')
    : '<div class="empty">No file changes yet — snapshots appear before every write.</div>';
}

function updateEstimate() {
  const el = $('#estimate');
  const input = $('#chatInput');
  if (!el || !input) return;
  const text = (input.value || '').trim();
  if (!text) {
    el.textContent = '';
    return;
  }
  const inTokens = Math.ceil(text.length / 4) + (currentSession ? Math.round(currentSession.messages.reduce((a, m) => a + (m.content || '').length / 4, 0)) : 0);
  const model = (S.models || []).find((m) => m.id === currentModel()) || { priceIn: 0.27 };
  const cost = (inTokens / 1e6) * Number(model.priceIn || 0);
  el.textContent = `≈ ${fmtNum(inTokens)} tokens in · ≈ ${fmtCost(cost)}`;
}

function runningTaskForSession() {
  if (!currentSessionId) return S.tasks.find((t) => t.status === 'running' || t.status === 'queued') || null;
  return (
    S.tasks.find(
      (t) => t.sessionId === currentSessionId && (t.status === 'running' || t.status === 'queued')
    ) || null
  );
}

function latestTaskForSession() {
  if (!currentSessionId) return null;
  return S.tasks.find((t) => t.sessionId === currentSessionId) || null;
}

function appendDelta(taskId, text) {
  live[taskId] = (live[taskId] || '') + text;
  if (!streamEl) return;
  const running = runningTaskForSession();
  if (!running || running.id !== taskId) return;
  streamEl.innerHTML = md(live[taskId]) + '<span class="typing"><i></i><i></i><i></i></span>';
  const box = $('#transcript');
  if (box) box.scrollTop = box.scrollHeight;
}

function paintModules(task) {
  const list = $('#modulesList');
  if (!list) return;
  if (!task) {
    list.innerHTML = '<div class="empty">No task selected. Modules appear after a run.</div>';
    const c = $('#modulesCount');
    if (c) c.textContent = 'no files touched';
    return;
  }
  const mods = modulesForTask(task.id);
  const count = $('#modulesCount');
  if (count) {
    count.textContent = mods.length ? `${mods.length} file${mods.length === 1 ? '' : 's'}` : 'no files touched';
  }
  list.innerHTML = mods.length
    ? mods
        .map(
          (m) => `<button class="module-row" data-action="open-module" data-file="${esc(m.file)}">
        <span class="ico">${icon(m.writes || m.edits ? 'file' : 'code', 13)}</span>
        <span class="module-name">${esc(m.file)}</span>
        <span class="module-badges">${moduleBadges(m)}</span>
      </button>`
        )
        .join('')
    : '<div class="empty">No files touched by this task yet.</div>';
  loadRepoChanges();
}

async function loadRepoChanges() {
  const box = $('#repoChanges');
  if (!box) return;
  try {
    const data = await api.get('/api/git');
    const branch = $('#repoBranch');
    if (branch) branch.textContent = data.isRepo ? (data.branch || 'git') : 'not a git repo';
    box.innerHTML = data.files.length
      ? data.files
          .map(
            (f) => `<button class="module-row" data-action="open-module" data-file="${esc(f.file)}">
          <span class="ico">${icon('file', 13)}</span>
          <span class="module-name">${esc(f.file)}</span>
          <span class="mod-badge ${esc(f.label)}">${esc(f.label)}</span>
        </button>`
          )
          .join('')
      : `<div class="empty">${data.isRepo ? 'Working tree clean — no uncommitted changes.' : 'This folder is not a git repository.'}</div>`;
  } catch (err) {
    box.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
}

function appendDelta(taskId, text) {
  live[taskId] = (live[taskId] || '') + text;
  if (taskId !== currentTaskId || !streamEl) return;
  streamEl.innerHTML = mdLite(live[taskId]);
  const body = $('#transcript');
  if (body) body.scrollTop = body.scrollHeight;
}

function renderQuickChips() {
  const el = $('#chatQuick');
  if (!el) return;
  const prompt = S.settings.workspace ? 'this repo' : 'the project';
  const chips = [
    { icon: 'eye', text: `Explain ${prompt} structure` },
    { icon: 'alert', text: 'Find bugs in the current diff' },
    { icon: 'check', text: 'Run the tests and fix failures' },
    { icon: 'code', text: 'Add a README section' }
  ];
  el.innerHTML = chips
    .map((c) => `<button class="quick-chip" data-action="quick" data-text="${esc(c.text)}">${icon(c.icon, 12)} ${esc(c.text)}</button>`)
    .join('');
}

/* ------------------------------- run ------------------------------- */

async function submitTask(prompt, agent) {
  let text = String(prompt || '').trim();
  if (!text) return;
  if (!aiReady()) {
    toast('Add your DeepSeek API key in Settings first.', 'err');
    page = 'settings';
    renderChrome();
    renderPage();
    return;
  }
  if (!S.workspace.path) {
    toast('Choose a workspace folder first.', 'err');
    page = 'settings';
    renderChrome();
    renderPage();
    return;
  }

  if (attached.length) {
    const files = attached
      .map((f) => `<file name="${f.name}">\n${f.text}\n</file>`)
      .join('\n\n');
    text += `\n\nAttached files:\n${files}`;
  }

  const body = {
    text,
    agent: agent || ($('#agentSelect') ? $('#agentSelect').value : 'coder') || 'coder',
    model: currentModel()
  };
  if (currentSessionId) body.sessionId = currentSessionId;

  try {
    const res = await api.send('/api/chat', body);
    currentSessionId = res.sessionId;
    live[res.taskId] = '';
    attached = [];
    renderAttachments();
    { const i = $('#chatInput'); if (i) { i.value = ''; autoGrow(i); } }
    await refreshState();
    if (page !== 'console') go('console');
    await loadSession(currentSessionId);
  } catch (err) {
    toast(err.message, 'err');
  }
}

/* ------------------------------ attachments ------------------------------ */

function renderAttachments() {
  const row = $('#attachRow');
  if (!row) return;
  row.innerHTML = attached
    .map(
      (f, i) => `<span class="attach-chip">${icon('file', 11)} ${esc(f.name)}
        <button type="button" data-remove-attach="${i}" title="Remove">×</button></span>`
    )
    .join('');
}

function autoGrow(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(160, el.scrollHeight) + 'px';
}

/* ------------------------------- search ------------------------------- */

function buildSearchIndex() {
  searchIndex = [];
  S.tasks.forEach((t) => searchIndex.push({ type: 'Task', label: t.title, page: 'tasks', id: t.id }));
  S.memory.forEach((m) => searchIndex.push({ type: 'Memory', label: m.text, page: 'memory' }));
  S.events
    .filter((e) => e.detail)
    .slice(-60)
    .forEach((e) => searchIndex.push({ type: 'Event', label: e.title + ': ' + e.detail, page: 'home' }));
}

function runSearch(q) {
  const box = $('#searchResults');
  const query = q.trim().toLowerCase();
  if (!query) {
    box.hidden = true;
    return;
  }
  const hits = searchIndex
    .filter((i) => (i.label + ' ' + i.type).toLowerCase().includes(query))
    .slice(0, 8);
  window.__hits = hits;
  box.hidden = false;
  box.innerHTML = hits.length
    ? hits
        .map(
          (h, i) => `<button data-hit="${i}">
        <span class="ico">${icon('search', 13)}</span>
        <span style="min-width:0"><span style="font-size:12px">${esc(h.label.slice(0, 90))}</span><small>${esc(h.type)}</small></span>
      </button>`
        )
        .join('')
    : '<div class="empty" style="padding:12px">No matches.</div>';
}

/* ------------------------------- navigation ------------------------------- */

const PAGES = { home: renderHome, console: renderConsolePage, tasks: renderTasks, files: renderFiles, memory: renderMemory, agents: renderAgents, usage: renderUsage, settings: renderSettings };

function renderPage() {
  const fn = PAGES[page] || renderHome;
  $('#content').innerHTML = fn();
  if (page === 'console') {
    if (currentSessionId) loadSession(currentSessionId);
    else paintChat();
    { const i = $('#chatInput'); if (i) autoGrow(i); }
  }
  if (page === 'files') {
    loadFileList();
    if (openFile) openFileAt(openFile);
  }
}

function go(next) {
  if (!PAGES[next]) next = 'home';
  page = next;
  $('#notifPop').hidden = true;
  renderChrome();
  renderPage();
}

/* ------------------------------- events ------------------------------- */

document.addEventListener('click', async (e) => {
  const nav = e.target.closest('[data-page]');
  const action = e.target.closest('[data-action]');
  const filter = e.target.closest('[data-filter]');

  if (filter) {
    filters.task = filter.dataset.filter;
    renderPage();
    return;
  }
  if (nav) {
    e.preventDefault();
    if (nav.dataset.action === 'open-task') return;
    go(nav.dataset.page);
    return;
  }
  if (!action) {
    if (!e.target.closest('.search-wrap')) $('#searchResults').hidden = true;
    return;
  }

  const id = action.dataset.id;

  switch (action.dataset.action) {
    case 'new-task':
      await newSession();
      go('console');
      { const i = $('#chatInput'); if (i) i.focus(); }
      break;

    case 'toggle-sessions': {
      const pop = $('#sessionPop');
      pop.hidden = !pop.hidden;
      if (!pop.hidden) {
        paintSessionsPop();
        const s = $('#sessionSearch');
        if (s) s.focus();
      }
      break;
    }

    case 'quick':
      submitTask(action.dataset.text, $('#agentSelect') ? $('#agentSelect').value : 'coder');
      break;

    case 'open-task': {
      const t = taskById(id);
      if (t && t.sessionId) {
        currentSessionId = t.sessionId;
        go('console');
        await loadSession(currentSessionId);
      }
      break;
    }

    case 'copy-webhook': {
      const el = $('#webhookUrl');
      if (!el) break;
      try {
        await navigator.clipboard.writeText(el.value);
        toast('Webhook URL copied');
      } catch (_) {
        toast('Copy failed', 'err');
      }
      break;
    }

    case 'toggle-schedule': {
      const sid = action.dataset.id;
      const enabled = action.dataset.enabled !== 'true';
      await api.send(`/api/schedules/${sid}/toggle`, { enabled });
      await refreshState();
      renderPage();
      break;
    }

    case 'del-schedule': {
      const sid = action.dataset.id;
      if (!confirm('Delete this schedule?')) break;
      await api.send('/api/schedules/' + sid, null, 'DELETE');
      await refreshState();
      renderPage();
      toast('Schedule deleted');
      break;
    }

    case 'save-telegram': {
      const token = $('#telegramToken').value.trim();
      if (!token) return toast('Paste your bot token', 'err');
      const res = await api.send('/api/channels/telegram', { token });
      await refreshState();
      renderPage();
      toast(res.running ? 'Telegram bot started' : 'Telegram error: ' + (res.error || 'unknown'), res.running ? 'ok' : 'err');
      break;
    }

    case 'stop-telegram': {
      await api.send('/api/channels/telegram', { token: '' });
      await refreshState();
      renderPage();
      toast('Telegram bot stopped');
      break;
    }

    case 'open-module': {
      const file = action.dataset.file || '';
      if (!file) break;
      openFile = file;
      fileDir = file.includes('/') ? file.split('/').slice(0, -1).join('/') : '.';
      go('files');
      break;
    }

    case 'revert-backup': {
      const bid = action.dataset.id;
      if (!bid) break;
      if (!confirm('Restore this file to the saved version?')) break;
      try {
        await api.send(`/api/backups/${bid}/revert`, {});
        await refreshState();
        renderPage();
        toast('File restored');
      } catch (err) {
        toast(err.message, 'err');
      }
      break;
    }

    case 'import':
      $('#importFile')?.click();
      break;

    case 'export-chat': {
      if (!currentSession || !currentSession.messages.length) return toast('Nothing to export yet', 'warn');
      const header = `# ${currentSession.title}\n\nModel: ${currentSession.model}\nMessages: ${currentSession.messages.length}\n\n---\n\n`;
      const body = currentSession.messages
        .map((m) => `## ${m.role === 'user' ? 'You' : 'AEGIS'}\n\n${m.content}\n`)
        .join('\n');
      const blob = new Blob([header + body], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (currentSession.title || 'aegis-chat').replace(/[^\w-]+/g, '-').slice(0, 40) + '.md';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Chat exported');
      break;
    }

    case 'copy-console': {      const text = currentSession
        ? currentSession.messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')
        : '';
      if (!text) return toast('Nothing to copy yet', 'warn');
      try {
        await navigator.clipboard.writeText(text);
        toast('Conversation copied');
      } catch (_) {
        toast('Clipboard blocked by the browser', 'err');
      }
      break;
    }

    case 'clear-finished': {
      const finished = S.tasks.filter((t) => ['done', 'failed', 'cancelled'].includes(t.status));
      if (!finished.length) return toast('Nothing finished to clear', 'warn');
      if (!confirm(`Delete ${finished.length} finished task${finished.length === 1 ? '' : 's'}?`)) return;
      for (const t of finished) {
        await api.send('/api/tasks/' + t.id, null, 'DELETE').catch(() => {});
      }
      currentTaskId = null;
      await refreshState();
      renderPage();
      toast('Finished tasks cleared');
      break;
    }

    case 'cancel-task':
      await api.send(`/api/tasks/${id}/cancel`, {}).catch((err) => toast(err.message, 'err'));
      await refreshState();
      renderPage();
      toast('Stopping…');
      break;

    case 'retry-task':
      await api.send(`/api/tasks/${id}/retry`, {}).catch((err) => toast(err.message, 'err'));
      await refreshState();
      renderPage();
      break;

    case 'del-task':
      await api.send(`/api/tasks/${id}`, null, 'DELETE').catch((err) => toast(err.message, 'err'));
      if (currentTaskId === id) currentTaskId = null;
      await refreshState();
      renderPage();
      break;

    case 'run-agent':
      go('console');
      { const sel = $('#agentSelect'); if (sel) sel.value = action.dataset.agent; }
      {
        const i = $('#chatInput');
        if (i) {
          i.placeholder = `Describe a task for the ${(S.roles[action.dataset.agent] || {}).label || action.dataset.agent}…`;
          i.focus();
        }
      }
      toast('Subagent selected — write the task');
      break;

    case 'del-memory':
      await api.send('/api/memory/' + id, null, 'DELETE').catch((err) => toast(err.message, 'err'));
      await refreshState();
      renderPage();
      break;

    case 'save-workspace': {
      const p = $('#wsPath').value.trim();
      if (!p) return toast('Enter a folder path', 'err');
      try {
        await api.send('/api/workspace', { path: p });
        await refreshState();
        toast('Workspace loaded');
        go(action.dataset.sub === 'files' ? 'files' : 'settings');
      } catch (err) {
        toast(err.message, 'err');
      }
      break;
    }

    case 'save-provider': {
      const provider = $('#providerSelect').value;
      const key = $('#apiKeyInput').value.trim();
      if (!key) return toast('Paste a key for ' + provider, 'err');
      await api.send('/api/settings', { provider, apiKey: key }).catch((err) => toast(err.message, 'err'));
      await refreshState();
      renderPage();
      toast(provider + ' key saved');
      break;
    }

    case 'clear-provider': {
      const provider = $('#providerSelect').value;
      if (!confirm(`Remove the saved ${provider} key from this PC?`)) break;
      await api.send('/api/settings', { provider, apiKey: '' }).catch((err) => toast(err.message, 'err'));
      await refreshState();
      renderPage();
      toast(provider + ' key removed');
      break;
    }

    case 'test-provider': {
      const provider = $('#providerSelect').value;
      const model = (S.models || []).find((m) => m.provider === provider);
      const out = $('#testResult');
      if (!model) return toast('No model for ' + provider, 'err');
      out.textContent = 'Testing ' + model.label + '…';
      const res = await api.send('/api/test', { modelId: model.key });
      out.textContent = (res.ok ? '✓ ' : '✕ ') + res.message;
      out.style.color = res.ok ? 'var(--green)' : 'var(--red)';
      toast(res.ok ? 'Connection works' : 'Connection failed', res.ok ? 'ok' : 'err');
      break;
    }

    case 'fetch-models': {
      const provider = $('#providerSelect').value;
      const box = $('#remoteModels');
      box.innerHTML = '<div class="empty">Fetching models…</div>';
      const res = await api.send('/api/provider/models', { provider }).catch((err) => ({ ok: false, error: err.message }));
      if (!res.ok) {
        box.innerHTML = `<div class="empty">${esc(res.error || 'Failed')}</div>`;
        break;
      }
      if (!res.models.length) {
        box.innerHTML = '<div class="empty">Provider returned no models.</div>';
        break;
      }
      box.innerHTML =
        `<div class="side-head" style="margin-bottom:4px"><span>${res.models.length} models</span><span>click to add</span></div>` +
        res.models
          .slice(0, 60)
          .map(
            (m) => `<button class="module-row" data-action="add-remote-model" data-model="${esc(m)}" data-provider="${esc(provider)}">
          <span class="ico">${icon('plus', 12)}</span>
          <span class="module-name">${esc(m)}</span>
        </button>`
          )
          .join('');
      break;
    }

    case 'add-remote-model': {
      const provider = action.dataset.provider;
      const model = action.dataset.model;
      const p = (S.providers || {})[provider] || {};
      const list = [
        ...(S.settings.customModels || []),
        {
          id: 'c' + Date.now().toString(36),
          label: model,
          model,
          provider,
          baseUrl: p.baseUrl || '',
          context: 128000,
          priceIn: 0,
          priceOut: 0
        }
      ];
      await api.send('/api/settings', { customModels: list });
      await refreshState();
      renderPage();
      toast('Added ' + model);
      break;
    }

    case 'save-ai': {
      const key = $('#apiKeyInput').value.trim();
      const body = { model: $('#modelSelect').value };
      if (key) body.apiKey = key;
      await api.send('/api/settings', body).catch((err) => toast(err.message, 'err'));
      await refreshState();
      renderPage();
      renderChrome();
      toast(key ? 'DeepSeek key saved' : 'Model saved');
      break;
    }

    case 'test-ai': {
      const out = $('#testResult');
      out.textContent = 'Testing…';
      const res = await api.send('/api/test', {});
      out.textContent = (res.ok ? '✓ ' : '✕ ') + res.message;
      out.style.color = res.ok ? 'var(--green)' : 'var(--red)';
      toast(res.ok ? 'Connection works' : 'Connection failed', res.ok ? 'ok' : 'err');
      break;
    }

    case 'save-rates':
      await api.send('/api/settings', {
        priceIn: Number($('#priceIn').value),
        priceOut: Number($('#priceOut').value),
        usdRate: Number($('#usdRate').value),
        currency: $('#currency').value,
        maxSteps: Number($('#maxSteps').value),
        approvalMode: $('#approvalMode').value
      });
      await refreshState();
      renderPage();
      toast('Settings saved');
      break;

    case 'save-chat':
      await api.send('/api/settings', {
        compactAt: Number($('#compactAt').value),
        temperature: Number($('#temperature').value),
        maxTokensPerTask: Number($('#maxTokensPerTask').value),
        maxCostPerTask: Number($('#maxCostPerTask').value),
        customInstructions: ($('#customInstructions') || {}).value || ''
      });
      await refreshState();
      renderPage();
      { if (currentSessionId) loadSession(currentSessionId); }
      toast('Chat settings saved');
      break;

    case 'toggle-agentsmd':
      await api.send('/api/settings', { useAgentsMd: !S.settings.useAgentsMd });
      await refreshState();
      renderPage();
      break;

    case 'toggle-planmode':
      await api.send('/api/settings', { planMode: !S.settings.planMode });
      await refreshState();
      renderPage();
      toast('Plan mode: ' + (S.settings.planMode ? 'on' : 'off'));
      break;

    case 'save-hooks':
      await api.send('/api/settings', {
        hooks: {
          onTaskStart: ($('#hookStart') || {}).value || '',
          onTool: ($('#hookTool') || {}).value || '',
          onTaskDone: ($('#hookDone') || {}).value || ''
        }
      });
      await refreshState();
      toast('Hooks saved');
      break;

    case 'add-model': {
      const label = $('#cmLabel').value.trim();
      const model = $('#cmModel').value.trim();
      const baseUrl = $('#cmBase').value.trim();
      if (!model || !baseUrl) return toast('Model id and base URL are required', 'err');
      const list = [
        ...(S.settings.customModels || []),
        {
          id: 'c' + Date.now().toString(36),
          label: label || model,
          model,
          baseUrl,
          context: 32000,
          priceIn: 0,
          priceOut: 0
        }
      ];
      await api.send('/api/settings', { customModels: list });
      await refreshState();
      renderPage();
      toast('Model added — pick it in the chat header');
      break;
    }

    case 'del-model': {
      const list = (S.settings.customModels || []).filter((m) => m.id !== action.dataset.id);
      await api.send('/api/settings', { customModels: list });
      await refreshState();
      renderPage();
      toast('Model removed');
      break;
    }

    case 'toggle-sounds':
      await api.send('/api/settings', { sounds: !S.settings.sounds });
      await refreshState();
      renderPage();
      break;

    case 'accent':
      await api.send('/api/settings', { accent: action.dataset.name });
      await refreshState();
      renderPage();
      renderChrome();
      break;

    case 'reset':
      if (confirm('Clear chats, tasks, memory and usage? Your API key stays.')) {
        await api.send('/api/reset', {});
        currentTaskId = null;
        currentSessionId = null;
        currentSession = null;
        await refreshState();
        go('home');
        toast('Workspace data cleared');
      }
      break;

    case 'file-refresh':
      loadFileList();
      break;

    case 'file-save':
      if (!openFile) return;
      try {
        await api.send('/api/file', { path: openFile, content: $('#fileBody').value });
        toast('Saved ' + openFile);
      } catch (err) {
        toast(err.message, 'err');
      }
      break;

    case 'file-new': {
      const name = prompt('New file path (relative to workspace)');
      if (!name) return;
      try {
        await api.send('/api/file', { path: name, content: '' });
        openFile = name;
        if (page === 'files') renderPage();
      } catch (err) {
        toast(err.message, 'err');
      }
      break;
    }
  }
});

/* file list clicks */
document.addEventListener('click', (e) => {
  const dir = e.target.closest('[data-dir]');
  if (dir) {
    fileDir = dir.dataset.dir;
    openFile = null;
    loadFileList();
    return;
  }
  const file = e.target.closest('[data-file]');
  if (file) openFileAt(file.dataset.file);
});

/* search results */
document.addEventListener('click', async (e) => {
  const hit = e.target.closest('[data-hit]');
  if (!hit) return;
  const item = (window.__hits || [])[Number(hit.dataset.hit)];
  if (!item) return;
  $('#searchResults').hidden = true;
  $('#searchInput').value = '';
  if (item.id) {
    const t = taskById(item.id);
    if (t && t.sessionId) {
      currentSessionId = t.sessionId;
      go('console');
      await loadSession(currentSessionId);
    }
  } else {
    go(item.page);
  }
});

/* forms */
document.addEventListener('submit', async (e) => {
  const form = e.target;
  if (form.id === 'chatForm') {
    e.preventDefault();
    if (runningTask()) {
      await api.send(`/api/tasks/${runningTask().id}/cancel`, {}).catch(() => {});
      return;
    }
    const input = $('#chatInput');
    const sel = $('#agentSelect');
    submitTask(input ? input.value : '', sel ? sel.value : 'coder');
    return;
  }
  if (form.id === 'taskForm') {
    e.preventDefault();
    const data = new FormData(form);
    await submitTask(String(data.get('prompt')), String(data.get('agent')));
    if (page === 'tasks') renderPage();
    return;
  }
  if (form.id === 'scheduleForm') {
    e.preventDefault();
    const data = new FormData(form);
    await api.send('/api/schedules', {
      prompt: String(data.get('prompt') || ''),
      everyMinutes: Number(data.get('everyMinutes')) || 0,
      dailyAt: String(data.get('dailyAt') || '')
    }).catch((err) => toast(err.message, 'err'));
    await refreshState();
    renderPage();
    toast('Schedule added');
    return;
  }
  if (form.id === 'memoryForm') {
    e.preventDefault();
    const text = new FormData(form).get('text');
    await api.send('/api/memory', { text }).catch((err) => toast(err.message, 'err'));
    await refreshState();
    renderPage();
    toast('Memory saved');
    return;
  }
});

/* chat send button is a submit button: the form handler above covers it */

/* approvals */
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-approve]');
  if (!btn || !pendingApproval) return;
  const decision = btn.dataset.approve;
  await api.send('/api/approve', { id: pendingApproval.id, decision }).catch((err) => toast(err.message, 'err'));
  pendingApproval = null;
  $('#approvalWrap').hidden = true;
  if (decision === 'always') toast('Auto-run enabled for this session');
});

/* sidebar + approval popover + file filter */
$('#stopAll').addEventListener('click', async () => {
  try {
    const r = await api.send('/api/stop', {});
    toast(`Stopped ${r.stopped || 0} run(s)`);
    await refreshState();
    if (page === 'console') loadSession(currentSessionId);
  } catch (err) {
    toast(err.message, 'err');
  }
});

$('#ttsToggle').addEventListener('click', async () => {
  const next = !S.settings.tts;
  await api.send('/api/settings', { tts: next }).catch(() => {});
  S.settings.tts = next;
  $('#ttsToggle').classList.toggle('is-on', next);
  toast(next ? 'Replies will be read aloud' : 'Voice off');
  if (next) speak('Voice on');
});

$('#themeToggle').addEventListener('click', () => {
  const light = document.documentElement.dataset.theme !== 'light';
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  localStorage.setItem('aegis.theme', light ? 'light' : 'dark');
  toast(light ? 'Light theme' : 'Dark theme');
});

function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    const clean = String(text || '').replace(/```[\s\S]*?```/g, ' code block ').slice(0, 600);
    if (!clean) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 1.02;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  } catch (_) {}
}

$('#sidebarToggle').addEventListener('click', () => {
  const shell = $('.shell');
  shell.classList.toggle('sidebar-hidden');
  localStorage.setItem('aegis.sidebar', shell.classList.contains('sidebar-hidden') ? 'hidden' : 'shown');
  toast(shell.classList.contains('sidebar-hidden') ? 'Sidebar hidden — Ctrl+B to bring it back' : 'Sidebar shown');
});

$('#approvalChip').addEventListener('click', (e) => {
  e.stopPropagation();
  const pop = $('#approvalPop');
  pop.hidden = !pop.hidden;
  if (!pop.hidden) {
    $$('#approvalPop .mini-opt').forEach((b) => b.classList.toggle('on', b.dataset.mode === S.settings.approvalMode));
  }
});

document.addEventListener('click', (e) => {
  const opt = e.target.closest('#approvalPop [data-mode]');
  if (opt) {
    const mode = opt.dataset.mode;
    api
      .send('/api/settings', { approvalMode: mode })
      .then(async () => {
        await refreshState();
        renderChrome();
        $('#approvalPop').hidden = true;
        toast('Approval mode: ' + (mode === 'auto' ? 'Auto-run' : mode === 'readonly' ? 'Read-only' : 'Ask first'));
      })
      .catch((err) => toast(err.message, 'err'));
    return;
  }
  if (!e.target.closest('.approval-wrap-chip')) $('#approvalPop').hidden = true;
});

document.addEventListener('input', (e) => {
  if (e.target.id !== 'fileFilter') return;
  const q = e.target.value.trim().toLowerCase();
  $$('#fileList .doc-item').forEach((el) => {
    const name = (el.querySelector('.name') || el).textContent.toLowerCase();
    el.style.display = !q || name.includes(q) ? '' : 'none';
  });
});

/* chat extras: sessions, model, attachments, code copy */
document.addEventListener('click', async (e) => {
  const delBtn = e.target.closest('[data-del-session]');
  if (delBtn) {
    e.stopPropagation();
    const sid = delBtn.dataset.delSession;
    if (!confirm('Delete this conversation?')) return;
    await api.send('/api/sessions/' + sid, null, 'DELETE').catch((err) => toast(err.message, 'err'));
    if (currentSessionId === sid) {
      currentSessionId = null;
      currentSession = null;
    }
    await refreshState();
    paintChat();
    paintSessionsPop();
    return;
  }

  const item = e.target.closest('[data-session]');
  if (item) {
    currentSessionId = item.dataset.session;
    $('#sessionPop').hidden = true;
    if (page !== 'console') go('console');
    await loadSession(currentSessionId);
    return;
  }

  const rem = e.target.closest('[data-remove-attach]');
  if (rem) {
    attached.splice(Number(rem.dataset.removeAttach), 1);
    renderAttachments();
    return;
  }

  const copy = e.target.closest('.copy-code');
  if (copy) {
    const pre = copy.parentElement.querySelector('code');
    if (pre) {
      try {
        await navigator.clipboard.writeText(pre.textContent);
        copy.textContent = 'Copied';
        setTimeout(() => (copy.textContent = 'Copy'), 1200);
      } catch (_) {
        toast('Clipboard blocked', 'err');
      }
    }
  }
});

document.addEventListener('change', async (e) => {
  if (e.target.id === 'modelSelect') {
    const model = e.target.value;
    await api.send('/api/settings', { model }).catch((err) => toast(err.message, 'err'));
    if (S) S.settings.model = model;
    if (currentSession) currentSession.model = model;
    toast('Model: ' + ((S.models || []).find((m) => m.id === model) || {}).label);
  }
  if (e.target.id === 'importFile') {
    const file = (e.target.files || [])[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!confirm(`Import backup?\n\n${(data.sessions || []).length} chats, ${(data.tasks || []).length} tasks.\n\nCurrent data is backed up first.`)) { e.target.value=''; return; }
      const res = await api.send('/api/import', { data });
      await refreshState();
      currentSessionId = null;
      currentSession = null;
      go('home');
      toast(`Imported ${res.sessions} chats, ${res.tasks} tasks`);
    } catch (err) {
      toast('Import failed: ' + err.message, 'err');
    }
    e.target.value = '';
  }
  if (e.target.id === 'fileInput') {    const files = Array.from(e.target.files || []).slice(0, 5);
    for (const f of files) {
      if (f.size > 60 * 1024) {
        toast(`${f.name} is too big (max 60 KB)`, 'err');
        continue;
      }
      const text = await f.text();
      attached.push({ name: f.name, text: text.slice(0, 60000) });
    }
    e.target.value = '';
    renderAttachments();
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'chatInput') {
    autoGrow(e.target);
    updateEstimate();
  }
  if (e.target.id === 'sessionSearch') {
    const pop = $('#sessionPop');
    pop.dataset.q = e.target.value;
    const pos = e.target.selectionStart;
    paintSessionsPop();
    const s = $('#sessionSearch');
    if (s) {
      s.focus();
      s.setSelectionRange(pos, pos);
    }
  }
});

document.addEventListener('click', (e) => {
  if (e.target.closest('#attachBtn')) $('#fileInput')?.click();
});

/* keyboard */
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    $('#searchInput').focus();
    $('#searchInput').select();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
    e.preventDefault();
    $('#sidebarToggle').click();
  }
  if (e.key === 'Escape') {
    $('#searchResults').hidden = true;
    $('#notifPop').hidden = true;
    const sess = $('#sessionPop');
    if (sess) sess.hidden = true;
    const approval = $('#approvalWrap');
    if (approval && !approval.hidden) {
      approval.hidden = true;
      if (pendingApproval) {
        api.send('/api/approve', { id: pendingApproval.id, decision: 'deny' }).catch(() => {});
        pendingApproval = null;
        toast('Request denied', 'warn');
      }
    }
  }
  if (e.key === 'Enter' && !e.shiftKey && e.target && e.target.id === 'chatInput') {
    e.preventDefault();
    const form = $('#chatForm');
    if (form) form.requestSubmit();
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'searchInput') runSearch(e.target.value);
});

/* bell */
$('#bellBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const pop = $('#notifPop');
  if (!pop.hidden) {
    pop.hidden = true;
    return;
  }
  renderNotif();
  pop.hidden = false;
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.notif-wrap')) $('#notifPop').hidden = true;
});

function renderNotif() {
  const pop = $('#notifPop');
  const active = S.tasks.filter((t) => t.status === 'running' || t.status === 'queued').slice(0, 4);
  pop.innerHTML =
    `<div class="notif-title">Agent activity</div>` +
    (pendingApproval
      ? `<button class="notif-item" data-approve="allow" style="border:1px solid rgba(251,191,36,.4)">
          <span class="ico">${icon('shield', 14)}</span>
          <span><b>Approval waiting</b><small>${esc(pendingApproval.detail || '').slice(0, 60)}</small></span>
        </button>`
      : '') +
    (active.length
      ? active
          .map(
            (t) => `<button class="notif-item" data-action="open-task" data-id="${esc(t.id)}">
          <span class="ico">${icon('terminal', 14)}</span>
          <span><b>${esc(t.title)}</b><small>${esc(t.status)} · ${esc((S.roles[t.agent] || {}).label || t.agent)}</small></span>
        </button>`
          )
          .join('')
      : '<div class="empty" style="padding:14px">No running tasks.</div>');
}

/* ------------------------------- SSE ------------------------------- */

function connectStream() {
  const es = new EventSource('/api/stream');

  es.onopen = () => {
    reconnectDelay = 2000;
    liveConnected = true;
    renderChrome();
    refreshState().then(restoreApproval).catch(() => {});
  };

  es.onmessage = (msg) => {
    let data;
    try {
      data = JSON.parse(msg.data);
    } catch (_) {
      return;
    }
    switch (data.type) {
      case 'delta':
        appendDelta(data.taskId, data.text);
        break;
      case 'task':
        if (S && data.task) {
          const i = S.tasks.findIndex((t) => t.id === data.task.id);
          if (i >= 0) S.tasks[i] = data.task;
          else S.tasks.unshift(data.task);
          renderChrome();
          if (page === 'tasks') renderPage();
          if (page === 'console' && data.task.sessionId === currentSessionId) {
            if (data.task.status === 'done' || data.task.status === 'failed' || data.task.status === 'cancelled') {
              loadSession(currentSessionId).then(() => {
                if (data.task.status === 'done' && S.settings.tts) {
                  const msgs = (currentSession && currentSession.messages) || [];
                  const last = [...msgs].reverse().find((m) => m.role === 'assistant');
                  if (last) speak(last.content);
                }
              });
            } else {
              paintChat();
            }
          }
        }
        break;
      case 'event':
        if (S) {
          S.events.push(data.event);
          if (S.events.length > 300) S.events = S.events.slice(-300);
          if (page === 'console' && currentSessionId && data.event.sessionId === currentSessionId) paintChat();
          if (page === 'home') renderPage();
        }
        break;
      case 'message':
        if (page === 'console' && data.sessionId === currentSessionId) {
          if (!currentSession) loadSession(currentSessionId);
          else {
            currentSession.messages.push(data.message);
            paintChat();
          }
        }
        break;
      case 'session-created':
        refreshState().then(() => {
          if (data.carry) {
            currentSessionId = data.session.id;
            go('console');
            loadSession(currentSessionId);
            toast('Context limit reached — continued in a new chat');
          } else if (page === 'console') {
            paintChat();
          }
        });
        break;
      case 'session-deleted':
        if (data.sessionId === currentSessionId) {
          currentSessionId = null;
          currentSession = null;
          paintChat();
        }
        refreshState();
        break;
      case 'compacting':
        if (data.sessionId === currentSessionId) toast('Context getting full — summarising older messages…', 'warn');
        break;
      case 'compacted':
        toast('Context compacted — summary carried forward');
        if (data.sessionId === currentSessionId) loadSession(currentSessionId);
        break;
      case 'approval':
        pendingApproval = data.request;
        showApproval(data.request);
        renderChrome();
        break;
      case 'approval-resolved':
        if (pendingApproval && pendingApproval.id === data.id) {
          pendingApproval = null;
          $('#approvalWrap').hidden = true;
        }
        break;
      case 'workspace':
        if (S) {
          S.workspace = data.workspace;
          renderChrome();
          if (page === 'home' || page === 'settings') renderPage();
        }
        break;
      case 'refresh':
        refreshState();
        break;
    }
  };

  es.onerror = () => {
    es.close();
    liveConnected = false;
    renderChrome();
    const delay = reconnectDelay;
    reconnectDelay = Math.min(30000, reconnectDelay * 2);
    setTimeout(connectStream, delay);
  };
}

function showApproval(req) {
  $('#approvalTitle').textContent = req.title || 'Permission needed';
  $('#approvalKind').textContent = req.kind === 'shell' ? 'shell command' : req.kind === 'write' ? 'write file' : 'edit file';
  $('#approvalDetail').textContent = req.detail || '';
  $('#approvalIcon').innerHTML = icon(req.kind === 'shell' ? 'terminal' : 'file', 20);
  $('#approvalWrap').hidden = false;
  if (S.settings.sounds) blip();
}

/* A page reload must not lose an approval that is still waiting. */
function restoreApproval() {
  if (pendingApproval) return;
  const list = (S && S.pendingApprovals) || [];
  if (!list.length) return;
  pendingApproval = list[0];
  showApproval(pendingApproval);
  renderChrome();
}

/* ------------------------------- boot ------------------------------- */

async function refreshState() {
  const state = await api.get('/api/state');
  S = state;
  buildSearchIndex();
  renderChrome();
}

let blipCtx = null;
function blip() {
  try {
    blipCtx = blipCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = blipCtx.createOscillator();
    const g = blipCtx.createGain();
    o.type = 'sine';
    o.frequency.value = 720;
    g.gain.value = 0.03;
    o.connect(g).connect(blipCtx.destination);
    o.start();
    o.stop(blipCtx.currentTime + 0.09);
  } catch (_) {}
}

(async function boot() {
  S = await api.get('/api/state');
  if (localStorage.getItem('aegis.sidebar') === 'hidden') $('.shell').classList.add('sidebar-hidden');
  if (localStorage.getItem('aegis.theme') === 'light') document.documentElement.dataset.theme = 'light';
  $('#ttsToggle').classList.toggle('is-on', Boolean(S.settings.tts));
  $$('[data-ico]').forEach((n) => (n.innerHTML = icon(n.dataset.ico, 17)));
  $('#brandAvatar').innerHTML = mascot('mini');

  const active = S.tasks.find((t) => t.status === 'running');
  if (active && active.sessionId) currentSessionId = active.sessionId;
  else {
    const withMessages = (S.sessions || []).filter((s) => s.messageCount > 0);
    currentSessionId = (withMessages[0] || S.sessions[0] || {}).id || null;
  }

  buildSearchIndex();
  renderChrome();
  renderPage();
  if (currentSessionId) await loadSession(currentSessionId);
  restoreApproval();
  connectStream();

  setInterval(() => {
    if (page === 'home') renderPage();
  }, 30000);

  if (!S.settings.hasKey) setTimeout(() => toast('Add your DeepSeek key in Settings to start.', 'warn'), 800);
  if (!S.settings.workspace) setTimeout(() => toast('Pick a workspace folder — the agent needs a project.', 'warn'), 1600);
})();
