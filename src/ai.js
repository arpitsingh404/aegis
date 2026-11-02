'use strict';

const { TOOLS, READ_ONLY, executeTool } = require('./tools');
const { allModels, resolveModel, streamChat, testProvider, providerOf } = require('./providers');
const { skillsPrompt } = require('./skills');

const ROLES = {
  planner: {
    label: 'Planner',
    icon: 'calendar',
    blurb: 'Reads the repo, writes a step-by-step plan. No edits.',
    tools: READ_ONLY,
    prompt:
      'You are the Planner subagent. Inspect the repository with read-only tools and produce a concrete, ordered plan (max 8 steps). Name the exact files you would change. Do not edit anything.'
  },
  coder: {
    label: 'Coder',
    icon: 'cpu',
    blurb: 'Implements the task with file and shell tools.',
    tools: TOOLS.map((t) => t.function.name),
    prompt:
      'You are the Coder subagent. Implement the task end to end. Read files before you edit them, keep changes minimal, and run a quick check when it is cheap.'
  },
  reviewer: {
    label: 'Reviewer',
    icon: 'eye',
    blurb: 'Reviews the diff for bugs and risks. No edits.',
    tools: [...READ_ONLY, 'remember'],
    prompt:
      'You are the Reviewer subagent. Review the current diff and touched files with read-only tools. Report real bugs first, then nits. Be specific about file and line.'
  },
  tester: {
    label: 'Tester',
    icon: 'check',
    blurb: 'Runs the test/build commands and reports failures.',
    tools: ['list_dir', 'read_file', 'search', 'run_command', 'git_status', 'finish'],
    prompt:
      'You are the Tester subagent. Find the project test/build commands, run the most relevant ones, and report exactly what passed or failed.'
  },
  researcher: {
    label: 'Researcher',
    icon: 'search',
    blurb: 'Searches the web and summarises sources with links.',
    tools: ['web_search', 'fetch_page', 'read_file', 'write_file', 'finish', 'remember'],
    prompt:
      'You are the Researcher subagent. Search the web, open the most relevant pages, and write a short brief with links. Never invent a source. If the network is unavailable, say so.'
  },
  computer: {
    label: 'Computer',
    icon: 'laptop',
    blurb: 'Screenshots, mouse and keyboard control (with approval).',
    tools: ['screenshot', 'mouse_click', 'type_text', 'key_press', 'list_windows', 'run_command', 'finish'],
    prompt:
      'You are the Computer subagent. You can take screenshots and control the mouse/keyboard. Always take a screenshot before and after acting. Never type passwords or click destructive dialogs without explicit instruction.'
  }
};

const PERSONA = `You are AEGIS, a local AI agent running on the user's Windows machine inside their selected folder.
You work like a terminal pair-programmer plus a desktop operator: you inspect real files, make real edits, run real commands, and (when allowed) control the screen through tools.

Rules:
- Always write your replies in English, even if the user writes in Hindi or Hinglish.
- Always read a file before editing it. Never guess a file's contents.
- Prefer small, surgical edits over rewriting whole files.
- Match the existing code style, naming and structure.
- Explain briefly what you are doing, then do it with a tool call. No long essays.
- If a tool fails, read the error and adapt; do not repeat the same failing call.
- Never run destructive commands (delete, format, force push). If something is risky, ask.
- Use the todo tool to keep a visible checklist for multi-step work.
- When the task is finished, call the finish tool with a short summary of what changed and how to verify it.`;

function normalizeTools(names) {
  // Skills are read-only instructions: always available to every role.
  const withSkills = names.includes('load_skill') ? names : [...names, 'load_skill'];
  return TOOLS.filter((t) => withSkills.includes(t.function.name)).map((t) => t.function);
}

function estimateTokens(text) {
  return Math.max(1, Math.round(String(text || '').length / 4));
}

function modelKeysFor(store, model) {
  const keys = store.getProviderKeys();
  if (model.provider === 'custom') return keys.custom || keys[model.provider] || keys.deepseek || '';
  return keys[model.provider] || '';
}

/** Pick the next configured model when the current one fails. */
function fallbackModels(settings, current) {
  const all = allModels(settings);
  return all.filter((m) => m.key !== current.key && (m.keyless || m.provider === current.provider || true));
}

async function callModel({ store, settings, model, messages, tools, onDelta, signal, allowFallback = true }) {
  const key = modelKeysFor(store, model);
  try {
    const res = await streamChat({ model, key, messages, tools, onDelta, signal });
    return { res, model };
  } catch (err) {
    const fatal = signal && signal.aborted;
    if (fatal) throw err;
    if (!allowFallback || settings.autoFallback === false) throw err;

    const candidates = fallbackModels(settings, model).filter((m) => {
      if (m.keyless) return false;
      return Boolean(store.getProviderKeys()[m.provider]);
    });
    const next = candidates.find((m) => m.provider !== 'ollama') || null;
    if (!next) throw err;
    console.warn(`AEGIS: ${model.key} failed (${err.message}); falling back to ${next.key}`);
    const res = await streamChat({
      model: next,
      key: modelKeysFor(store, next),
      messages,
      tools,
      onDelta,
      signal
    });
    return { res, model: next, fellBack: true };
  }
}

async function runAgent({
  store,
  settings,
  task,
  role,
  history = [],
  projectRules = '',
  sessionSummary = '',
  modelId,
  onDelta,
  onEvent,
  onAsk,
  onSnapshot,
  signal
}) {
  const d = store.get();
  const agent = ROLES[role] || ROLES.coder;
  const ws = d.workspace;
  let model = resolveModel(settings, modelId || task.model || settings.model) || allModels(settings)[0];

  const context = [
    `Workspace: ${ws.path || '(none selected)'}`,
    skillsPrompt(ws.path),
    ws.branch ? `Git branch: ${ws.branch}` : '',
    ws.dirty ? `Uncommitted files: ${ws.dirty}` : '',
    d.memory.length ? `Project memory:\n- ${d.memory.slice(0, 12).map((m) => m.text).join('\n- ')}` : '',
    settings.customInstructions ? `User instructions (follow these):\n${String(settings.customInstructions).slice(0, 2000)}` : '',
    projectRules ? `Project rules (from AGENTS.md / opencode.json):\n${projectRules}` : '',
    sessionSummary ? `Summary of earlier conversation:\n${sessionSummary}` : ''
  ]
    .filter(Boolean)
    .join('\n');

  const past = (history || [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
    .slice(-8)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 3000) }));

  const messages = [
    { role: 'system', content: `${PERSONA}\n\nSUBAGENT: ${agent.label}\n${agent.prompt}\n\n----- WORKSPACE -----\n${context}` },
    ...past,
    { role: 'user', content: task.prompt || task.title }
  ];

  const toolDefs = normalizeTools(agent.tools);
  let tokensIn = 0;
  let tokensOut = 0;
  let steps = 0;
  let summary = '';
  let assistantText = '';
  let budgetHit = false;

  const maxTokens = Number(settings.maxTokensPerTask) || 60000;
  const maxCost = Number(settings.maxCostPerTask) || 0.06;

  for (let step = 0; step < (Number(settings.maxSteps) || 20); step++) {
    if (signal && signal.aborted) throw Object.assign(new Error('Cancelled'), { aborted: true });

    if (tokensIn > maxTokens) {
      budgetHit = true;
      summary = `Stopped at the token budget (${tokensIn.toLocaleString('en-US')} prompt tokens, limit ${maxTokens.toLocaleString('en-US')}).`;
      break;
    }
    const spent = (tokensIn / 1e6) * model.priceIn + (tokensOut / 1e6) * model.priceOut;
    if (spent > maxCost) {
      budgetHit = true;
      summary = `Stopped at the cost budget ($${spent.toFixed(3)}, limit $${maxCost}).`;
      break;
    }

    const call = await callModel({
      store,
      settings,
      model,
      messages,
      tools: toolDefs,
      onDelta,
      signal
    });
    const res = call.res;
    if (call.fellBack) {
      model = call.model;
      if (onEvent) onEvent({ type: 'fallback', title: 'Model fallback', detail: 'Switched to ' + model.label, status: 'warn' });
    }

    steps++;
    if (res.usage) {
      tokensIn += res.usage.in || 0;
      tokensOut += res.usage.out || 0;
    } else {
      tokensIn += estimateTokens(messages.map((m) => m.content || '').join('\n'));
      tokensOut += estimateTokens(res.content);
    }
    if (res.content) assistantText += res.content;

    if (!res.toolCalls.length) {
      summary = (res.content || '').trim();
      break;
    }

    messages.push({
      role: 'assistant',
      content: res.content || null,
      tool_calls: res.toolCalls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: c.arguments }
      }))
    });

    let finished = false;
    for (const call2 of res.toolCalls) {
      let args = {};
      try {
        args = JSON.parse(call2.arguments || '{}');
      } catch (_) {
        args = {};
      }

      if (onEvent) onEvent({ type: 'tool', title: call2.name, detail: describeCall(call2.name, args), status: 'running' });

      let output;
      try {
        output = await executeTool(call2.name, args, {
          root: d.workspace.path,
          settings: d.settings,
          ask: onAsk,
          snapshot: onSnapshot,
          todos: (list) => store.setTodos(task.sessionId, list),
          addMemory: (text) => store.addMemory(text)
        });
      } catch (err) {
        output = { ok: false, error: String((err && err.message) || err) };
      }

      if (onEvent) {
        onEvent({
          type: 'tool',
          title: call2.name,
          detail: describeCall(call2.name, args),
          status: output.ok === false ? 'error' : 'ok',
          result: resultSummary(call2.name, output)
        });
      }

      if (call2.name === 'finish') {
        summary = output.summary || summary;
        finished = true;
      }

      messages.push({
        role: 'tool',
        tool_call_id: call2.id,
        tool_name: call2.name,
        content: JSON.stringify(output).slice(0, 3000)
      });
    }

    if (finished) break;
  }

  return {
    summary: summary || assistantText.trim() || 'Done.',
    tokensIn,
    tokensOut,
    steps,
    priceIn: model.priceIn,
    priceOut: model.priceOut,
    model: model.key,
    modelLabel: model.label,
    budgetHit
  };
}

function describeCall(name, args) {
  switch (name) {
    case 'run_command':
      return args.command || '';
    case 'read_file':
    case 'write_file':
    case 'edit_file':
      return args.path || '';
    case 'list_dir':
      return args.path || '.';
    case 'search':
      return `${args.query || ''}${args.glob ? ' in ' + args.glob : ''}`;
    case 'web_search':
      return args.query || '';
    case 'fetch_page':
      return args.url || '';
    case 'screenshot':
      return args.label || 'screen';
    case 'type_text':
      return String(args.text || '').slice(0, 40);
    case 'mouse_click':
      return `${args.x},${args.y}`;
    case 'key_press':
      return args.keys || '';
    case 'remember':
      return args.text || '';
    case 'todo':
      return `${(args.items || []).length} items`;
    case 'finish':
      return args.summary || '';
    default:
      return '';
  }
}

function resultSummary(name, out) {
  if (!out || out.ok === false) return out && out.error ? out.error : 'failed';
  switch (name) {
    case 'list_dir':
      return `${(out.entries || []).length} entries`;
    case 'read_file':
      return `${out.path} (${out.totalLines} lines)`;
    case 'write_file':
      return `${out.path} · ${out.bytes} bytes`;
    case 'edit_file':
      return `${out.path} · replaced ${out.replaced} chars`;
    case 'search':
      return `${out.matches} matches`;
    case 'web_search':
      return `${(out.results || []).length} results`;
    case 'fetch_page':
      return `${out.title || out.url} · ${(out.text || '').length} chars`;
    case 'screenshot':
      return out.file || 'captured';
    case 'run_command':
      return `exit ${out.code}${out.stdout ? ' · ' + out.stdout.split('\n')[0].slice(0, 120) : ''}`;
    case 'git_status':
      return `${out.branch} · ${(out.changes || []).length} changes`;
    case 'git_diff':
      return `${String(out.diff || '').split('\n').length} diff lines`;
    case 'remember':
      return 'saved to memory';
    case 'load_skill':
      return out.name ? `skill: ${out.name}` : 'skill load failed';
    case 'finish':
      return out.summary;
    default:
      return 'ok';
  }
}

async function summarizeSession({ settings, modelId, key, messages, maxChars = 6000 }) {
  const model = resolveModel(settings, modelId) || allModels(settings)[0];
  const transcript = (messages || [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => `${m.role.toUpperCase()}: ${String(m.content).slice(0, 2000)}`)
    .join('\n\n')
    .slice(0, maxChars);

  const out = await streamChat({
    model,
    key: key || '',
    messages: [
      {
        role: 'system',
        content:
          'You compress coding conversations. Keep every fact needed to continue: goals, decisions, files and paths, commands, errors and fixes. Use compact bullets.'
      },
      { role: 'user', content: transcript }
    ],
    tools: [],
    onDelta: () => {}
  });
  return (out.content || '').trim();
}

function estimateMessagesTokens(messages) {
  return (messages || []).reduce((sum, m) => sum + estimateTokens(m.content), 0) + 200;
}

async function testConnection({ settings, modelId, model, store }) {
  const target = model || resolveModel(settings, modelId) || allModels(settings)[0];
  const key = store ? store.getProviderKey(target.provider) : '';
  return testProvider({ model: target, key });
}

module.exports = {
  ROLES,
  TOOLS,
  runAgent,
  testConnection,
  summarizeSession,
  estimateMessagesTokens,
  allModels,
  resolveModel,
  providerOf
};
