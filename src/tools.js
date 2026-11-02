'use strict';

const fs = require('fs');
const path = require('path');
const { exec, execFile } = require('child_process');

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.cache',
  '__pycache__',
  'venv',
  '.venv',
  'target',
  'bin',
  'obj',
  '.idea',
  '.vscode'
]);

const MAX_READ = 120000;
const MAX_OUTPUT = 12000;
const MAX_SEARCH_FILES = 4000;

const DANGEROUS = [
  /\brm\s+-rf\s+[\/~]/i,
  /\bdel\s+\/[fsq]\b/i,
  /\bformat\s+[a-z]:/i,
  /\bdiskpart\b/i,
  /\bshutdown\b/i,
  /\brestart-computer\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bbcdedit\b/i,
  /\breg\s+delete\b/i,
  /\btaskkill\b.*\/f/i,
  /\bnet\s+user\b/i,
  /\btakeown\b/i,
  /\bicacls\b.*\/grant/i,
  /\bcurl\b[^\n]*\|\s*(ba)?sh/i,
  /\bwget\b[^\n]*\|\s*(ba)?sh/i,
  /\bpowershell\b[^\n]*-enc(odedcommand)?\b/i,
  /\bchmod\s+-R\s+777\s+\//i,
  /:\(\)\s*\{\s*:\|:&\s*\};:/,
  /\bgit\s+push\b.*--force/i,
  // Windows-specific destructive patterns
  /\brd\s+\/s\b/i,
  /\brmdir\s+\/s\b/i,
  /\bremove-item\b[^\n]*-recurse/i,
  /\bremove-item\b[^\n]*-force/i,
  /\bgit\s+clean\s+-[a-z]*[fdx]/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+checkout\s+--?\s*\.\s*$/i,
  /\brobocopy\b[^\n]*\/mir\b/i,
  /\bcurl\b[^\n]*\|\s*iex\b/i,
  /\bwget\b[^\n]*\|\s*iex\b/i,
  /\binvoke-expression\b/i,
  /\bstart-process\b/i,
  /\bschtasks\b/i,
  /\bwmic\b/i,
  /\breg\s+add\b/i,
  /\bcipher\s+\/w\b/i,
  /\bvssadmin\b/i,
  /\bbcdedit\b/i,
  /\bnet\s+user\b[^\n]*\/add/i
];

const READ_ONLY = ['list_dir', 'read_file', 'search', 'git_status', 'git_diff', 'web_search', 'fetch_page', 'list_windows'];
const WRITE_TOOLS = new Set(['write_file', 'edit_file']);
const SHELL_TOOLS = new Set(['run_command']);

/* ------------------------------ schemas ------------------------------ */

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List files and folders in a directory inside the workspace.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Relative path, defaults to .' } }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a text file. Returns numbered lines.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          start: { type: 'integer', description: '1-based first line' },
          end: { type: 'integer', description: 'Last line (inclusive)' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file with full contents.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace one exact text block in a file (surgical edit).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          oldString: { type: 'string', description: 'Exact text to replace (must be unique)' },
          newString: { type: 'string' }
        },
        required: ['path', 'oldString', 'newString']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search',
      description: 'Search file contents with a plain string or regex. Returns path:line: text.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          glob: { type: 'string', description: 'Optional extension filter like .ts or .py' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a shell command in the workspace root and return stdout/stderr.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          cwd: { type: 'string', description: 'Relative working directory' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Show git branch and changed files.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Show the current uncommitted diff (optionally for one file).',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'remember',
      description: 'Save a durable project fact or preference to project memory.',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'load_skill',
      description: 'Load a named skill (markdown instructions) before performing a specialised task.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Skill name from the available skills list' } },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'todo',
      description: 'Create or update the visible task checklist for this run.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: { text: { type: 'string' }, done: { type: 'boolean' } },
              required: ['text']
            }
          }
        },
        required: ['items']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web (DuckDuckGo) and return titles, links and snippets.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_page',
      description: 'Download a web page and return its readable text (no images, no JS rendering).',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'screenshot',
      description: 'Capture the current screen to a PNG in the data folder. Ask before using it on private screens.',
      parameters: { type: 'object', properties: { label: { type: 'string' } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_windows',
      description: 'List visible top-level windows (title + process).',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mouse_click',
      description: 'Move the mouse and click at screen coordinates.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'integer' },
          y: { type: 'integer' },
          button: { type: 'string', enum: ['left', 'right'] }
        },
        required: ['x', 'y']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'type_text',
      description: 'Type text into the currently focused window.',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'key_press',
      description: 'Press a key combination in the focused window, e.g. "ctrl+s" or "enter".',
      parameters: {
        type: 'object',
        properties: { keys: { type: 'string' } },
        required: ['keys']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description: 'Call when the task is complete. Provide a short summary of what changed.',
      parameters: {
        type: 'object',
        properties: { summary: { type: 'string' } },
        required: ['summary']
      }
    }
  }
];

/* ------------------------------ helpers ------------------------------ */

function inside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function resolve(root, p) {
  const target = path.resolve(root, p || '.');
  if (!inside(root, target)) {
    const err = new Error('Path escapes the workspace: ' + p);
    err.code = 'ESCAPE';
    throw err;
  }
  return target;
}

function truncate(s, n = MAX_OUTPUT) {
  const str = String(s == null ? '' : s);
  return str.length > n ? str.slice(0, n) + `\n… (${str.length - n} more characters)` : str;
}

function run(cmd, cwd, timeout = 120000) {
  return new Promise((resolvePromise) => {
    exec(cmd, { cwd, timeout, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      resolvePromise({
        code: err && typeof err.code === 'number' ? err.code : err ? 1 : 0,
        stdout: truncate(stdout),
        stderr: truncate(stderr)
      });
    });
  });
}

/* No shell: safe for values that come from the model. */
function runArgs(bin, args, cwd, timeout = 30000) {
  return new Promise((resolvePromise) => {
    execFile(bin, args, { cwd, timeout, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      resolvePromise({
        code: err && typeof err.code === 'number' ? err.code : err ? 1 : 0,
        stdout: truncate(stdout),
        stderr: truncate(stderr)
      });
    });
  });
}

function walk(dir, out, limit) {
  if (out.length >= limit) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const entry of entries) {
    if (out.length >= limit) return;
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out, limit);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
}

/* ------------------------------ windows helpers ------------------------------ */

function ps(script, timeout = 30000) {
  return new Promise((resolvePromise) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolvePromise({ ok: !err, out: String(stdout || '').trim(), err: String(stderr || '').trim() });
      }
    );
  });
}

function sendKeysFor(keys) {
  const map = {
    enter: '{ENTER}',
    tab: '{TAB}',
    esc: '{ESC}',
    escape: '{ESC}',
    space: ' ',
    backspace: '{BACKSPACE}',
    delete: '{DELETE}',
    up: '{UP}',
    down: '{DOWN}',
    left: '{LEFT}',
    right: '{RIGHT}',
    home: '{HOME}',
    end: '{END}',
    pageup: '{PGUP}',
    pagedown: '{PGDN}',
    f1: '{F1}',
    f2: '{F2}',
    f3: '{F3}',
    f4: '{F4}',
    f5: '{F5}',
    f6: '{F6}',
    f7: '{F7}',
    f8: '{F8}',
    f9: '{F9}',
    f10: '{F10}',
    f11: '{F11}',
    f12: '{F12}'
  };
  return String(keys || '')
    .toLowerCase()
    .split('+')
    .map((k) => {
      const key = k.trim();
      if (key === 'ctrl' || key === 'control') return '^';
      if (key === 'shift') return '+';
      if (key === 'alt') return '%';
      return map[key] || key;
    })
    .join('');
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ------------------------------ executor ------------------------------ */

async function executeTool(name, args, ctx) {
  const root = ctx.root;
  if (!root) return { ok: false, error: 'No workspace selected. Set one in Settings.' };
  if (!READ_ONLY.includes(name)) {
    if (ctx.settings.approvalMode === 'readonly') {
      return { ok: false, error: 'Read-only mode is on. Writes and commands are blocked.' };
    }
  }

  switch (name) {
    case 'list_dir': {
      const dir = resolve(root, args.path || '.');
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const items = entries
        .slice(0, 200)
        .map((e) => (e.isDirectory() ? e.name + '/' : e.name))
        .sort();
      return { ok: true, path: path.relative(root, dir) || '.', entries: items };
    }

    case 'read_file': {
      const file = resolve(root, args.path);
      const stat = fs.statSync(file);
      if (!stat.isFile()) return { ok: false, error: 'Not a file: ' + args.path };
      if (stat.size > MAX_READ) return { ok: false, error: `File too large (${stat.size} bytes).` };
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      const start = Math.max(1, Number(args.start) || 1);
      const end = Math.min(lines.length, Number(args.end) || lines.length);
      const slice = lines.slice(start - 1, end);
      return {
        ok: true,
        path: path.relative(root, file),
        totalLines: lines.length,
        content: slice.map((l, i) => `${start + i}\t${l}`).join('\n')
      };
    }

    case 'write_file': {
      const file = resolve(root, args.path);
      const content = String(args.content == null ? '' : args.content);
      const approved = await ctx.ask({
        kind: 'write',
        title: 'Write file',
        detail: `${path.relative(root, file)} (${content.length} chars)`
      });
      if (!approved) return { ok: false, error: 'User denied this write.' };
      if (ctx.snapshot) ctx.snapshot(path.relative(root, file));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content, 'utf8');
      return { ok: true, path: path.relative(root, file), bytes: Buffer.byteLength(content) };
    }

    case 'edit_file': {
      const file = resolve(root, args.path);
      const oldString = String(args.oldString || '');
      const newString = String(args.newString || '');
      if (!oldString) return { ok: false, error: 'oldString is required.' };
      const before = fs.readFileSync(file, 'utf8');
      const first = before.indexOf(oldString);
      if (first === -1) return { ok: false, error: 'oldString not found in ' + args.path };
      const second = before.indexOf(oldString, first + 1);
      if (second !== -1) return { ok: false, error: 'oldString is not unique; include more context.' };
      const approved = await ctx.ask({
        kind: 'edit',
        title: 'Edit file',
        detail: path.relative(root, file)
      });
      if (!approved) return { ok: false, error: 'User denied this edit.' };
      if (ctx.snapshot) ctx.snapshot(path.relative(root, file));
      const after = before.slice(0, first) + newString + before.slice(first + oldString.length);
      fs.writeFileSync(file, after, 'utf8');
      return { ok: true, path: path.relative(root, file), replaced: oldString.length };
    }

    case 'search': {
      const query = String(args.query || '');
      if (!query) return { ok: false, error: 'query is required.' };
      let re;
      try {
        re = new RegExp(query, 'i');
      } catch (_) {
        re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      }
      const ext = args.glob ? String(args.glob).trim() : '';
      const files = [];
      walk(root, files, MAX_SEARCH_FILES);
      const hits = [];
      for (const file of files) {
        if (ext && !file.toLowerCase().endsWith(ext.toLowerCase())) continue;
        let stat;
        try {
          stat = fs.statSync(file);
        } catch (_) {
          continue;
        }
        if (stat.size > 400000) continue;
        let text;
        try {
          text = fs.readFileSync(file, 'utf8');
        } catch (_) {
          continue;
        }
        if (text.indexOf('\u0000') !== -1) continue;
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            hits.push(`${path.relative(root, file)}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
            if (hits.length >= 60) break;
          }
        }
        if (hits.length >= 60) break;
      }
      return { ok: true, query, matches: hits.length, results: hits };
    }

    case 'run_command': {
      const command = String(args.command || '').trim();
      if (!command) return { ok: false, error: 'command is required.' };
      const banned = DANGEROUS.find((re) => re.test(command));
      if (banned) return { ok: false, error: 'Command blocked for safety: ' + command };
      const cwd = args.cwd ? resolve(root, args.cwd) : root;
      const approved = await ctx.ask({ kind: 'shell', title: 'Run command', detail: command });
      if (!approved) return { ok: false, error: 'User denied this command.' };
      const res = await run(command, cwd);
      return { ok: res.code === 0, command, ...res };
    }

    case 'git_status': {
      const branch = await runArgs('git', ['rev-parse', '--abbrev-ref', 'HEAD'], root, 15000);
      const status = await runArgs('git', ['status', '--short'], root, 15000);
      return {
        ok: branch.code === 0,
        branch: branch.stdout.trim() || 'not a git repo',
        changes: status.stdout.trim().split('\n').filter(Boolean)
      };
    }

    case 'git_diff': {
      const argv = ['diff'];
      if (args.path) argv.push('--', String(args.path));
      const res = await runArgs('git', argv, root, 20000);
      return { ok: res.code === 0, diff: res.stdout || '(no uncommitted changes)' };
    }

    case 'load_skill': {
      const { loadSkill } = require('./skills');
      return loadSkill(root, args.name);
    }

    case 'remember': {
      const text = String(args.text || '').trim();
      if (!text) return { ok: false, error: 'text is required.' };
      ctx.addMemory(text);
      return { ok: true, saved: text };
    }

    case 'todo': {
      const items = Array.isArray(args.items) ? args.items : [];
      if (ctx.todos) ctx.todos(items);
      return { ok: true, count: items.length, items: items.map((i) => `${i.done ? '✓' : '○'} ${i.text}`) };
    }

    case 'web_search': {
      const q = String(args.query || '').trim();
      if (!q) return { ok: false, error: 'query is required.' };
      const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
          Accept: 'text/html'
        }
      });
      if (!res.ok) return { ok: false, error: `Search failed (HTTP ${res.status}). Network may be blocked.` };
      const html = await res.text();
      const results = [];
      const re = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,400}?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = re.exec(html)) && results.length < 8) {
        let link = m[1];
        try {
          const u = new URL(link, 'https://duckduckgo.com');
          const uddg = u.searchParams.get('uddg');
          link = uddg ? decodeURIComponent(uddg) : link;
        } catch (_) {}
        results.push({
          title: stripHtml(m[2]).slice(0, 160),
          url: link,
          snippet: stripHtml(m[3]).slice(0, 300)
        });
      }
      if (!results.length) {
        // lite fallback
        const lite = await fetch('https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(q), {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        }).catch(() => null);
        if (lite && lite.ok) {
          const lh = await lite.text();
          const lre = /<a[^>]+href="([^"]+)"[^>]*class="result-link"[^>]*>([\s\S]*?)<\/a>/gi;
          let lm;
          while ((lm = lre.exec(lh)) && results.length < 8) {
            results.push({ title: stripHtml(lm[2]).slice(0, 160), url: lm[1], snippet: '' });
          }
        }
      }
      return { ok: results.length > 0, query: q, results, note: results.length ? undefined : 'No results — the search page may be blocked.' };
    }

    case 'fetch_page': {
      const target = String(args.url || '').trim();
      if (!/^https?:\/\//i.test(target)) return { ok: false, error: 'A full http(s) URL is required.' };
      const res = await fetch(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml'
        },
        redirect: 'follow'
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const ctype = res.headers.get('content-type') || '';
      if (!/text\/html|text\/plain|application\/(json|xml)/i.test(ctype)) {
        return { ok: false, error: 'Unsupported content type: ' + ctype };
      }
      const raw = await res.text();
      const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const text = /html/i.test(ctype) ? stripHtml(raw) : raw;
      return {
        ok: true,
        url: target,
        title: titleMatch ? stripHtml(titleMatch[1]).slice(0, 200) : target,
        text: text.slice(0, 20000)
      };
    }

    case 'screenshot': {
      const approved = await ctx.ask({ kind: 'screen', title: 'Capture screen', detail: args.label || 'Full screen' });
      if (!approved) return { ok: false, error: 'User denied the screenshot.' };
      const dir = path.join(require('os').homedir(), '.aegis', 'screens');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, 'shot-' + Date.now() + '.png');
      const script = [
        'Add-Type -AssemblyName System.Windows.Forms,System.Drawing',
        '$b=[System.Windows.Forms.SystemInformation]::VirtualScreen',
        '$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height',
        '$g=[System.Drawing.Graphics]::FromImage($bmp)',
        '$g.CopyFromScreen($b.Left,$b.Top,0,0,$bmp.Size)',
        "$bmp.Save('" + file.replace(/'/g, "''") + "',[System.Drawing.Imaging.ImageFormat]::Png)",
        '$bmp.Dispose(); $g.Dispose()'
      ].join('; ');
      const r = await ps(script, 20000);
      if (!r.ok) return { ok: false, error: r.err || 'Screenshot failed' };
      const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
      return { ok: true, file, bytes: size, note: 'Saved locally. This model cannot see images.' };
    }

    case 'list_windows': {
      const script =
        'Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 25 Id,ProcessName,MainWindowTitle | ConvertTo-Json -Compress';
      const r = await ps(script, 15000);
      if (!r.ok) return { ok: false, error: r.err || 'Failed' };
      let list = [];
      try {
        list = JSON.parse(r.out || '[]');
      } catch (_) {}
      if (!Array.isArray(list)) list = [list];
      return { ok: true, windows: list.map((w) => ({ id: w.Id, process: w.ProcessName, title: w.MainWindowTitle })) };
    }

    case 'mouse_click': {
      const x = Math.round(Number(args.x));
      const y = Math.round(Number(args.y));
      if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, error: 'x and y are required.' };
      const approved = await ctx.ask({ kind: 'input', title: 'Mouse click', detail: `Left click at ${x}, ${y}` });
      if (!approved) return { ok: false, error: 'User denied the click.' };
      const right = args.button === 'right';
      const down = right ? '0x0008' : '0x0002';
      const up = right ? '0x0010' : '0x0004';
      const script =
        "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class M{[DllImport(\"user32.dll\")]public static extern bool SetCursorPos(int x,int y);[DllImport(\"user32.dll\")]public static extern void mouse_event(uint f,uint dx,uint dy,uint d,IntPtr e);}'; " +
        `[M]::SetCursorPos(${x},${y}) | Out-Null; Start-Sleep -Milliseconds 120; ` +
        `[M]::mouse_event(${down},0,0,0,[IntPtr]::Zero); [M]::mouse_event(${up},0,0,0,[IntPtr]::Zero)`;
      const r = await ps(script, 15000);
      return { ok: r.ok, clicked: { x, y, button: right ? 'right' : 'left' }, error: r.ok ? undefined : r.err };
    }

    case 'type_text': {
      const text = String(args.text || '');
      if (!text) return { ok: false, error: 'text is required.' };
      const approved = await ctx.ask({ kind: 'input', title: 'Type text', detail: text.slice(0, 120) });
      if (!approved) return { ok: false, error: 'User denied typing.' };
      const b64 = Buffer.from(text, 'utf8').toString('base64');
      const script = [
        'Add-Type -AssemblyName System.Windows.Forms',
        `$t=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}'))`,
        'Set-Clipboard -Value $t',
        'Start-Sleep -Milliseconds 150',
        "[System.Windows.Forms.SendKeys]::SendWait('^v')"
      ].join('; ');
      const r = await ps(script, 20000);
      return { ok: r.ok, typed: text.slice(0, 80), error: r.ok ? undefined : r.err };
    }

    case 'key_press': {
      const keys = String(args.keys || '').trim();
      if (!keys) return { ok: false, error: 'keys are required.' };
      const approved = await ctx.ask({ kind: 'input', title: 'Key press', detail: keys });
      if (!approved) return { ok: false, error: 'User denied the key press.' };
      const seq = sendKeysFor(keys);
      const script = [
        'Add-Type -AssemblyName System.Windows.Forms',
        `[System.Windows.Forms.SendKeys]::SendWait('${seq.replace(/'/g, "''")}')`
      ].join('; ');
      const r = await ps(script, 15000);
      return { ok: r.ok, keys, error: r.ok ? undefined : r.err };
    }

    case 'finish':
      return { ok: true, summary: String(args.summary || 'Task complete.').slice(0, 2000) };

    default:
      return { ok: false, error: 'Unknown tool ' + name };
  }
}

module.exports = { TOOLS, executeTool, READ_ONLY, DANGEROUS, run };
