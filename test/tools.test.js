'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { executeTool, DANGEROUS } = require('../src/tools');

const ctx = (root) => ({
  root,
  settings: { approvalMode: 'auto' },
  ask: async () => true
});

test('workspace sandbox blocks path escapes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-test-'));
  await assert.rejects(() => executeTool('read_file', { path: '../../windows/win.ini' }, ctx(root)));
  await assert.rejects(() => executeTool('write_file', { path: '../escape.txt', content: 'x' }, ctx(root)));
});

test('read/write/edit round trip inside the workspace', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-test-'));
  const w = await executeTool('write_file', { path: 'src/a.js', content: 'hello world' }, ctx(root));
  assert.equal(w.ok, true);
  assert.equal(fs.readFileSync(path.join(root, 'src/a.js'), 'utf8'), 'hello world');

  const e = await executeTool('edit_file', { path: 'src/a.js', oldString: 'world', newString: 'aegis' }, ctx(root));
  assert.equal(e.ok, true);
  assert.equal(fs.readFileSync(path.join(root, 'src/a.js'), 'utf8'), 'hello aegis');

  const r = await executeTool('read_file', { path: 'src/a.js' }, ctx(root));
  assert.match(r.content, /hello aegis/);
});

test('edit_file refuses non-unique matches', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-test-'));
  await executeTool('write_file', { path: 'dup.txt', content: 'aaaa' }, ctx(root));
  const e = await executeTool('edit_file', { path: 'dup.txt', oldString: 'aa', newString: 'bb' }, ctx(root));
  assert.equal(e.ok, false);
  assert.match(e.error, /not unique/);
});

test('destructive Windows commands are blocked', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-test-'));
  for (const cmd of [
    'rd /s /q C:\\temp',
    'Remove-Item -Recurse -Force C:\\temp',
    'robocopy a b /MIR',
    'git clean -fdx',
    'Invoke-Expression "echo hi"',
    'del /f /q file.txt'
  ]) {
    const res = await executeTool('run_command', { command: cmd }, ctx(root));
    assert.equal(res.ok, false, cmd + ' should be blocked');
    assert.match(res.error, /blocked/i);
  }
});

test('dangerous pattern list covers the main shell tools', () => {
  const sample = 'rd /s /q C:\\x';
  assert.ok(DANGEROUS.some((re) => re.test(sample)));
});

test('safe commands still run', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-test-'));
  const res = await executeTool('run_command', { command: 'echo ok' }, ctx(root));
  assert.equal(res.ok, true);
  assert.match(res.stdout, /ok/);
});

test('read-only mode blocks writes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-test-'));
  const ro = { root, settings: { approvalMode: 'readonly' }, ask: async () => true };
  const res = await executeTool('write_file', { path: 'x.txt', content: 'x' }, ro);
  assert.equal(res.ok, false);
  assert.match(res.error, /Read-only/);
});
