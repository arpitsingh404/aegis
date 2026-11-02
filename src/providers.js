'use strict';

/**
 * Provider layer.
 * - OpenAI-compatible (OpenAI, DeepSeek, Groq, OpenRouter, Ollama, LM Studio, custom)
 * - Anthropic Messages API
 * - Google Gemini generateContent
 * All streaming, all normalised to { content, toolCalls, usage }.
 */

const PROVIDERS = {
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    protocol: 'openai',
    models: [
      { id: 'deepseek-flash', label: 'deepseek-flash', context: 128000, priceIn: 0.27, priceOut: 1.1 },
      { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro', context: 128000, priceIn: 0.55, priceOut: 2.19 }
    ]
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    protocol: 'openai',
    models: [
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini', context: 128000, priceIn: 0.15, priceOut: 0.6 },
      { id: 'gpt-4o', label: 'gpt-4o', context: 128000, priceIn: 2.5, priceOut: 10 },
      { id: 'o4-mini', label: 'o4-mini', context: 200000, priceIn: 1.1, priceOut: 4.4 }
    ]
  },
  anthropic: {
    label: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    protocol: 'anthropic',
    models: [
      { id: 'claude-sonnet-4-5', label: 'claude-sonnet-4-5', context: 200000, priceIn: 3, priceOut: 15 },
      { id: 'claude-haiku-4-5', label: 'claude-haiku-4-5', context: 200000, priceIn: 1, priceOut: 5 }
    ]
  },
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    protocol: 'gemini',
    models: [
      { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash', context: 1000000, priceIn: 0.3, priceOut: 2.5 },
      { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro', context: 1000000, priceIn: 1.25, priceOut: 10 }
    ]
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    protocol: 'openai',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b', context: 128000, priceIn: 0.59, priceOut: 0.79 }
    ]
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    protocol: 'openai',
    models: [{ id: 'openai/gpt-4o-mini', label: 'gpt-4o-mini (OR)', context: 128000, priceIn: 0.15, priceOut: 0.6 }]
  },
  ollama: {
    label: 'Ollama (local)',
    baseUrl: 'http://127.0.0.1:11434/v1',
    protocol: 'openai',
    keyless: true,
    models: [
      { id: 'qwen2.5-coder:7b', label: 'qwen2.5-coder:7b', context: 32000, priceIn: 0, priceOut: 0 },
      { id: 'llama3.2:3b', label: 'llama3.2:3b', context: 32000, priceIn: 0, priceOut: 0 }
    ]
  },
  xai: {
    label: 'xAI Grok',
    baseUrl: 'https://api.x.ai/v1',
    protocol: 'openai',
    models: [
      { id: 'grok-3-mini', label: 'grok-3-mini', context: 131000, priceIn: 0.3, priceOut: 0.5 },
      { id: 'grok-3', label: 'grok-3', context: 131000, priceIn: 3, priceOut: 15 }
    ]
  },
  mistral: {
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    protocol: 'openai',
    models: [
      { id: 'mistral-large-latest', label: 'mistral-large', context: 128000, priceIn: 2, priceOut: 6 },
      { id: 'codestral-latest', label: 'codestral', context: 256000, priceIn: 0.3, priceOut: 0.9 }
    ]
  },
  together: {
    label: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    protocol: 'openai',
    models: [
      {
        id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        label: 'llama-3.3-70b',
        context: 128000,
        priceIn: 0.88,
        priceOut: 0.88
      }
    ]
  },
  cerebras: {
    label: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    protocol: 'openai',
    models: [{ id: 'llama-3.3-70b', label: 'llama-3.3-70b', context: 128000, priceIn: 0.85, priceOut: 1.2 }]
  },
  perplexity: {
    label: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    protocol: 'openai',
    models: [
      { id: 'sonar', label: 'sonar', context: 128000, priceIn: 1, priceOut: 1 },
      { id: 'sonar-pro', label: 'sonar-pro', context: 200000, priceIn: 3, priceOut: 15 }
    ]
  },
  moonshot: {
    label: 'Moonshot / Kimi',
    baseUrl: 'https://api.moonshot.ai/v1',
    protocol: 'openai',
    models: [{ id: 'moonshot-v1-8k', label: 'moonshot-v1-8k', context: 8000, priceIn: 0.2, priceOut: 2 }]
  },
  zhipu: {
    label: 'Zhipu GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    protocol: 'openai',
    models: [{ id: 'glm-4-plus', label: 'glm-4-plus', context: 128000, priceIn: 0.7, priceOut: 0.7 }]
  },
  deepinfra: {
    label: 'DeepInfra',
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    protocol: 'openai',
    models: [
      {
        id: 'meta-llama/Llama-3.3-70B-Instruct',
        label: 'llama-3.3-70b',
        context: 128000,
        priceIn: 0.23,
        priceOut: 0.4
      }
    ]
  }
};

function allModels(settings) {
  const out = [];
  for (const [pid, p] of Object.entries(PROVIDERS)) {
    for (const m of p.models) {
      out.push({
        key: pid + ':' + m.id,
        id: m.id,
        label: p.label + ' · ' + m.label,
        provider: pid,
        providerLabel: p.label,
        model: m.id,
        context: m.context,
        priceIn: m.priceIn,
        priceOut: m.priceOut,
        keyless: Boolean(p.keyless)
      });
    }
  }
  for (const cm of (settings && settings.customModels) || []) {
    const pid = cm.provider || 'custom';
    const base = PROVIDERS[pid];
    out.push({
      key: 'custom:' + cm.id,
      id: cm.id,
      label: (cm.label || cm.model) + (base ? ' · ' + base.label : ' · custom'),
      provider: pid,
      providerLabel: base ? base.label : 'Custom',
      model: cm.model,
      baseUrl: cm.baseUrl || (base && base.baseUrl),
      context: Number(cm.context) || 32000,
      priceIn: Number(cm.priceIn) || 0,
      priceOut: Number(cm.priceOut) || 0,
      custom: true
    });
  }
  return out;
}

function resolveModel(settings, key) {
  const list = allModels(settings);
  const found = list.find((m) => m.key === key) || list.find((m) => m.id === key);
  if (found && found.provider === 'custom') {
    const cm = (settings.customModels || []).find((c) => c.id === found.custom?.id || c.id === found.id);
    return Object.assign({}, found, {
      baseUrl: (cm && cm.baseUrl) || found.baseUrl,
      protocol: 'openai'
    });
  }
  return found || null;
}

function providerOf(model) {
  return PROVIDERS[model.provider] || { protocol: 'openai', baseUrl: model.baseUrl, label: 'Custom' };
}

function keyFor(providerId, keys) {
  if (!keys) return '';
  return keys[providerId] || '';
}

function endpoint(model) {
  const p = providerOf(model);
  let base = String(model.baseUrl || p.baseUrl || '').replace(/\/+$/, '');
  if (p.protocol === 'anthropic') return base + '/messages';
  if (p.protocol === 'gemini') return base + '/models/' + encodeURIComponent(model.model) + ':streamGenerateContent?alt=sse';
  if (!/\/v1$/.test(base)) base += '/v1';
  return base + '/chat/completions';
}

function limitMessages(messages, chars) {
  return messages.map((m) => {
    const copy = Object.assign({}, m);
    if (typeof copy.content === 'string') copy.content = copy.content.slice(0, chars);
    return copy;
  });
}

/* ------------------------------ OpenAI ------------------------------ */

function toOpenAITools(tools) {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters }
  }));
}

async function openaiStream({ model, key, messages, tools, onDelta, signal }) {
  const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
  if (key) headers.Authorization = 'Bearer ' + key;

  const body = {
    model: model.model,
    messages: limitMessages(messages, 12000),
    stream: true,
    stream_options: { include_usage: true }
  };
  if (tools && tools.length) {
    body.tools = toOpenAITools(tools);
    body.tool_choice = 'auto';
  }

  const res = await fetch(endpoint(model), { method: 'POST', headers, body: JSON.stringify(body), signal });
  if (!res.ok) throw await httpError('Provider', res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let usage = null;
  const acc = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let json;
      try {
        json = JSON.parse(payload);
      } catch (_) {
        continue;
      }
      if (json.usage) usage = json.usage;
      const choice = json.choices && json.choices[0];
      if (!choice) continue;
      const delta = choice.delta || {};
      if (delta.content) {
        content += delta.content;
        onDelta && onDelta(delta.content);
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const part of delta.tool_calls) {
          const i = typeof part.index === 'number' ? part.index : 0;
          if (!acc[i]) acc[i] = { id: '', name: '', arguments: '' };
          if (part.id) acc[i].id = part.id;
          if (part.function && part.function.name) acc[i].name += part.function.name;
          if (part.function && part.function.arguments) acc[i].arguments += part.function.arguments;
        }
      }
    }
  }

  return {
    content,
    toolCalls: acc
      .filter((c) => c && c.name)
      .map((c, i) => ({ id: c.id || 'call_' + i, name: c.name, arguments: c.arguments || '{}' })),
    usage: usage ? { in: usage.prompt_tokens || 0, out: usage.completion_tokens || 0 } : null
  };
}

/* ------------------------------ Anthropic ------------------------------ */

function toAnthropicTools(tools) {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
}

function toAnthropicMessages(messages) {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const out = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'user') out.push({ role: 'user', content: String(m.content || '') });
    else if (m.role === 'assistant') {
      const blocks = [];
      if (m.content) blocks.push({ type: 'text', text: String(m.content) });
      for (const tc of m.tool_calls || []) {
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: safeJson(tc.arguments) });
      }
      out.push({ role: 'assistant', content: blocks.length ? blocks : [{ type: 'text', text: '.' }] });
    } else if (m.role === 'tool') {
      out.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: String(m.content || '').slice(0, 12000) }]
      });
    }
  }
  return { system, messages: out };
}

function safeJson(s) {
  try {
    return JSON.parse(s || '{}');
  } catch (_) {
    return {};
  }
}

async function anthropicStream({ model, key, messages, tools, onDelta, signal }) {
  const { system, messages: msgs } = toAnthropicMessages(messages);
  const body = {
    model: model.model,
    max_tokens: 4096,
    stream: true,
    system,
    messages: msgs
  };
  if (tools && tools.length) body.tools = toAnthropicTools(tools);

  const res = await fetch(endpoint(model), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      Accept: 'text/event-stream'
    },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) throw await httpError('Anthropic', res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let tool = null;
  const calls = [];
  let usage = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      let ev;
      try {
        ev = JSON.parse(payload);
      } catch (_) {
        continue;
      }
      if (ev.type === 'message_start' && ev.message && ev.message.usage) {
        usage = { in: ev.message.usage.input_tokens || 0, out: 0 };
      }
      if (ev.type === 'content_block_start' && ev.content_block && ev.content_block.type === 'tool_use') {
        tool = { id: ev.content_block.id, name: ev.content_block.name, arguments: '' };
      }
      if (ev.type === 'content_block_delta') {
        if (ev.delta.type === 'text_delta') {
          content += ev.delta.text;
          onDelta && onDelta(ev.delta.text);
        }
        if (ev.delta.type === 'input_json_delta' && tool) tool.arguments += ev.delta.partial_json || '';
      }
      if (ev.type === 'content_block_stop' && tool) {
        calls.push({ id: tool.id, name: tool.name, arguments: tool.arguments || '{}' });
        tool = null;
      }
      if (ev.type === 'message_delta' && ev.usage) {
        usage = { in: (usage && usage.in) || 0, out: ev.usage.output_tokens || 0 };
      }
    }
  }
  return { content, toolCalls: calls, usage };
}

/* ------------------------------ Gemini ------------------------------ */

function toGeminiContents(messages) {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const contents = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'user') contents.push({ role: 'user', parts: [{ text: String(m.content || '') }] });
    else if (m.role === 'assistant') {
      const parts = [];
      if (m.content) parts.push({ text: String(m.content) });
      for (const tc of m.tool_calls || []) {
        parts.push({ functionCall: { name: tc.name, args: safeJson(tc.arguments) } });
      }
      if (parts.length) contents.push({ role: 'model', parts });
    } else if (m.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: m.tool_name || 'tool', response: { result: String(m.content || '').slice(0, 8000) } } }]
      });
    }
  }
  return { system, contents };
}

async function geminiStream({ model, key, messages, tools, onDelta, signal }) {
  const { system, contents } = toGeminiContents(messages);
  const body = { contents };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (tools && tools.length) {
    body.tools = [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }))
      }
    ];
  }

  const url = endpoint(model) + '&key=' + encodeURIComponent(key);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) throw await httpError('Gemini', res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  const calls = [];
  let usage = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      let ev;
      try {
        ev = JSON.parse(payload);
      } catch (_) {
        continue;
      }
      if (ev.usageMetadata) {
        usage = {
          in: ev.usageMetadata.promptTokenCount || 0,
          out: ev.usageMetadata.candidatesTokenCount || 0
        };
      }
      const cand = ev.candidates && ev.candidates[0];
      if (!cand) continue;
      for (const part of (cand.content && cand.content.parts) || []) {
        if (part.text) {
          content += part.text;
          onDelta && onDelta(part.text);
        }
        if (part.functionCall) {
          calls.push({
            id: 'call_' + calls.length,
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {})
          });
        }
      }
    }
  }
  return { content, toolCalls: calls, usage };
}

/* ------------------------------ shared ------------------------------ */

async function httpError(name, res) {
  const text = await res.text().catch(() => '');
  let msg = text.slice(0, 400);
  try {
    const j = JSON.parse(text);
    msg = (j.error && (j.error.message || j.error.type)) || j.message || msg;
  } catch (_) {}
  const err = new Error(`${name} ${res.status}: ${msg || res.statusText}`);
  err.status = res.status;
  return err;
}

async function streamChat({ model, key, messages, tools, onDelta, signal }) {
  const p = providerOf(model);
  if (p.protocol === 'anthropic') {
    if (!key) throw new Error('Anthropic key missing — add it in Settings → Providers.');
    return anthropicStream({ model, key, messages, tools, onDelta, signal });
  }
  if (p.protocol === 'gemini') {
    if (!key) throw new Error('Gemini key missing — add it in Settings → Providers.');
    return geminiStream({ model, key, messages, tools, onDelta, signal });
  }
  if (!key && !p.keyless) throw new Error(`${p.label || 'Provider'} key missing — add it in Settings → Providers.`);
  return openaiStream({ model, key, messages, tools, onDelta, signal });
}

async function testProvider({ model, key, timeoutMs = 20000 }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await streamChat({
      model,
      key,
      messages: [{ role: 'user', content: 'ping' }],
      tools: [],
      signal: ctrl.signal,
      onDelta: () => {}
    });
    return { ok: true, message: `Connected · ${model.label}`, model: model.key };
  } catch (err) {
    return { ok: false, message: err.name === 'AbortError' ? 'Timed out' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function listRemoteModels(providerId, key) {
  const p = PROVIDERS[providerId];
  if (!p) throw new Error('Unknown provider: ' + providerId);
  if (!key && !p.keyless) throw new Error(p.label + ' key missing.');

  if (p.protocol === 'anthropic') {
    const res = await fetch(p.baseUrl + '/models?limit=100', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
    });
    if (!res.ok) throw new Error('Anthropic HTTP ' + res.status);
    const j = await res.json();
    return (j.data || []).map((m) => m.id);
  }

  if (p.protocol === 'gemini') {
    const res = await fetch(p.baseUrl + '/models?key=' + encodeURIComponent(key));
    if (!res.ok) throw new Error('Gemini HTTP ' + res.status);
    const j = await res.json();
    return (j.models || []).map((m) => String(m.name || '').replace(/^models\//, '')).filter(Boolean);
  }

  const base = String(p.baseUrl).replace(/\/+$/, '');
  const headers = {};
  if (key) headers.Authorization = 'Bearer ' + key;
  const res = await fetch((/\/v\d+$/.test(base) ? base : base + '/v1') + '/models', { headers });
  if (!res.ok) throw new Error(p.label + ' HTTP ' + res.status);
  const j = await res.json();
  return (j.data || j.models || []).map((m) => m.id || m.name).filter(Boolean);
}

module.exports = { PROVIDERS, allModels, resolveModel, streamChat, testProvider, keyFor, providerOf, listRemoteModels };
