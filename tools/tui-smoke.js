'use strict';
/* Spawns tui.js, feeds commands, prints captured output. */
const { spawn } = require('child_process');
const path = require('path');

const child = spawn(process.execPath, [path.join(__dirname, '..', 'tui.js')], {
  cwd: path.join(__dirname, '..'),
  env: Object.assign({}, process.env, { AEGIS_URL: 'http://127.0.0.1:7791' })
});

let out = '';
child.stdout.on('data', (d) => (out += d));
child.stderr.on('data', (d) => (out += d));

const feed = (text, ms) =>
  new Promise((r) =>
    setTimeout(() => {
      child.stdin.write(text + '\n');
      r();
    }, ms)
  );

(async () => {
  await feed('/status', 2500);
  await feed('/models', 1500);
  await feed('/plan on', 1200);
  await feed('/help', 800);
  await feed('/exit', 1000);
})();

child.on('close', (code) => {
  console.log('--- TUI OUTPUT (exit ' + code + ') ---');
  console.log(out.replace(/\x1b\[[0-9;]*m/g, ''));
  const pass =
    out.includes('status') && out.includes('deepseek') && out.includes('plan mode') && out.includes('commands');
  console.log('TUI TEST: ' + (pass ? 'PASS' : 'FAIL'));
  process.exit(pass ? 0 : 1);
});

setTimeout(() => {
  child.kill();
  console.log('TUI TEST: TIMEOUT');
  console.log(out.replace(/\x1b\[[0-9;]*m/g, ''));
  process.exit(1);
}, 15000);
