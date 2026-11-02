'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { allModels, resolveModel } = require('../src/providers');

test('registry exposes every provider with prefixed keys', () => {
  const models = allModels({});
  assert.ok(models.length >= 10);
  const keys = models.map((m) => m.key);
  assert.ok(keys.includes('deepseek:deepseek-flash'));
  assert.ok(keys.includes('openai:gpt-4o-mini'));
  assert.ok(keys.includes('anthropic:claude-sonnet-4-5'));
  assert.ok(keys.includes('gemini:gemini-2.5-flash'));
  assert.ok(keys.includes('ollama:qwen2.5-coder:7b'));
});

test('resolveModel maps a provider:model key to its provider and price', () => {
  const m = resolveModel({ model: 'deepseek:deepseek-flash' }, 'deepseek:deepseek-flash');
  assert.equal(m.provider, 'deepseek');
  assert.equal(m.model, 'deepseek-flash');
  assert.ok(m.priceIn > 0);
  assert.equal(m.priceOut, 1.1);
});

test('custom models are addressable through the registry', () => {
  const settings = {
    customModels: [{ id: 'c1', label: 'My Local', model: 'llama3', baseUrl: 'http://127.0.0.1:11434/v1' }]
  };
  const m = resolveModel(settings, 'custom:c1');
  assert.ok(m, 'custom model resolves');
  assert.equal(m.model, 'llama3');
  assert.equal(m.provider, 'custom');
});

test('unknown model returns null instead of throwing', () => {
  assert.equal(resolveModel({}, 'nope:model'), null);
});
