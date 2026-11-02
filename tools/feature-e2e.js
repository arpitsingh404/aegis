'use strict';
/* E2E smoke test for AEGIS new features: skills, plan mode, hooks.
   Run: node tools/feature-e2e.js  (AEGIS must be running on 127.0.0.1:7791) */

const http = require('http');
const fs = require('fs');
const path = require('path');
const BASE = 'http://127.0.0.1:7791';
const WS = 'C:\\Users\\arpit\\aegis';

function api(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      BASE + p,
      { method, headers: { 'Content-Type': 'application/json', 'Content-Length': data ? Buffer.byteLength(data) : 0 } },
      (res) => {
        let buf = '';
        res.on('data', (d) => (buf += d));
        res.on('end', () => {
          try { resolve(JSON.parse(buf || '{}')); } catch (_) { resolve({ raw: buf }); }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForTask(id, seconds) {
  const dl = Date.now() + seconds * 1000;
  while (Date.now() < dl) {
    const s = await api('GET', '/api/state');
    const t = (s.tasks || []).find((x) => x.id === id);
    if (t && ['done', 'failed', 'cancelled'].includes(t.status)) return t;
    await sleep(3000);
  }
  return null;
}

/* SSE capture for approvals */
let sseBuf = '';
const sseReq = http.get(BASE + '/api/stream', (res) => {
  res.setEncoding('utf8');
  res.on('data', (c) => (sseBuf += c));
});
sseReq.on('error', () => {});

async function nextApproval(known, seconds) {
  const dl = Date.now() + seconds * 1000;
  while (Date.now() < dl) {
    const ids = [...sseBuf.matchAll(/"id":"(ap-[^"]+)"/g)].map((m) => m[1]);
    const fresh = ids.filter((i) => !known.includes(i));
    if (fresh.length) return fresh[fresh.length - 1];
    await sleep(2000);
  }
  return null;
}

(async () => {
  const results = [];
  const known = [];

  // --- 0) setup: plan mode ON, approval ask, hooks on ---
  await api('POST', '/api/settings', {
    planMode: true,
    approvalMode: 'ask',
    hooks: {
      onTaskStart: `echo start %AEGIS_TASK_ID% >> "${WS}\\hook-test.log"`,
      onTool: '',
      onTaskDone: `echo done %AEGIS_STATUS% >> "${WS}\\hook-test.log"`
    }
  });
  fs.rmSync(path.join(WS, 'hook-test.log'), { force: true });
  console.log('setup: planMode=on approval=ask hooks=on');

  // --- 1) SKILLS: ask the agent to load a skill ---
  let r = await api('POST', '/api/chat', {
    text: 'Call the load_skill tool with name "security-audit", then reply with exactly: SKILL=<the skill name> and nothing else. Do not run any other tool.',
    agent: 'coder'
  });
  let known2 = [];
  let ap = await nextApproval(known, 60);
  if (ap) { known.push(ap); known2.push(ap); await api('POST', '/api/approve', { id: ap, decision: 'allow' }); }
  let t = await waitForTask(r.taskId, 120);
  const skillOk = t && t.status === 'done' && /SKILL=security-audit/i.test(t.summary || '');
  results.push(['SKILLS load_skill', skillOk ? 'PASS' : 'FAIL', t ? `${t.status} · ${t.summary.slice(0, 120)}` : 'timeout']);
  console.log('skills:', skillOk ? 'PASS' : 'FAIL', '→', t && t.summary.slice(0, 140));

  // --- 2) PLAN MODE: plan approval appears, approve, executes ---
  r = await api('POST', '/api/chat', {
    text: 'Create a file named plan-test.txt containing exactly: PLAN-OK. Touch only that file.',
    agent: 'coder'
  });
  ap = await nextApproval(known, 90);
  const planSeen = !!ap;
  if (ap) {
    known.push(ap);
    const st = await api('GET', '/api/state');
    const pend = (st.pendingApprovals || []).find((x) => x.id === ap);
    console.log('plan approval:', ap, '| kind:', pend && pend.kind, '|', pend && String(pend.title).slice(0, 60));
    await api('POST', '/api/approve', { id: ap, decision: 'allow' });
  }
  // may ask again for the write itself
  ap = await nextApproval(known, 90);
  if (ap) { known.push(ap); await api('POST', '/api/approve', { id: ap, decision: 'allow' }); }
  t = await waitForTask(r.taskId, 150);
  const planFile = fs.existsSync(path.join(WS, 'plan-test.txt'));
  const planOk = planSeen && t && t.status === 'done' && planFile;
  results.push(['PLAN mode (plan→approve→exec)', planOk ? 'PASS' : 'FAIL', planSeen ? (t ? t.status : 'timeout') : 'no plan approval']);
  console.log('plan:', planOk ? 'PASS' : 'FAIL', '| approval seen:', planSeen, '| file:', planFile);

  // --- 3) HOOKS: log file got start + done lines ---
  await sleep(1500);
  let hookLog = '';
  try { hookLog = fs.readFileSync(path.join(WS, 'hook-test.log'), 'utf8'); } catch (_) {}
  const hookOk = /start t-/.test(hookLog) && /done done/.test(hookLog);
  results.push(['HOOKS onTaskStart/onTaskDone', hookOk ? 'PASS' : 'FAIL', JSON.stringify(hookLog.trim()).slice(0, 120)]);
  console.log('hooks:', hookOk ? 'PASS' : 'FAIL', '|', hookLog.trim().replace(/\n/g, ' · '));

  // --- restore settings ---
  await api('POST', '/api/settings', {
    planMode: false,
    approvalMode: 'auto',
    hooks: { onTaskStart: '', onTool: '', onTaskDone: '' }
  });
  fs.rmSync(path.join(WS, 'hook-test.log'), { force: true });
  fs.rmSync(path.join(WS, 'plan-test.txt'), { force: true });
  console.log('\n=== RESULTS ===');
  for (const [name, verdict, detail] of results) console.log(`${verdict === 'PASS' ? '✓' : '✗'} ${name}: ${verdict} — ${detail}`);
  process.exit(results.every((r2) => r2[1] === 'PASS') ? 0 : 1);
})().catch((e) => {
  console.error('E2E error:', e);
  process.exit(1);
});
