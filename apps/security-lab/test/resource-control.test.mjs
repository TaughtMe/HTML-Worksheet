import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { supervise } from './resource-supervisor.mjs';
import { ProcessTree, signalProcess } from './resource-process.mjs';
import { classifyRun } from './resource-classify.mjs';
import { ALLOCATION_BYTES } from './resource-config.mjs';
if (['loop', 'flood'].includes(process.argv[2])) {
  const pipes = process.env.S10_CONTROLLER_FIXTURE_MODE === 'pipes';
  const separateGroup = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true, stdio: ['ignore', 'ignore', pipes ? 'inherit' : 'ignore'] });
  process.send({ type: 'browser-pid', pid: separateGroup.pid });
  process.send({ type: 'attack-started', kind: 'cleanup-fixture-only' });
  if (pipes) process.on('message', m => { if (m.type === 'browser-pid-registered') { process.disconnect(); process.exit(0); } });
  setInterval(() => {}, 1000);
} else {
  const report = await supervise('loop', { workerUrl: new URL(import.meta.url), wallMs: 600 });
  assert.equal(report.reason, 'external-timeout'); assert.equal(report.verdict, 'observed-risk'); assert.equal(report.cleanup.remainingActive.length, 0);
  assert(report.cleanup.trackedPids.includes(report.cleanup.browserPid));
  assert(report.samples.some(sample => sample.processes.some(p => p.pid === report.cleanup.browserPid && p.group === p.pid && p.session === p.pid)));
  process.env.S10_CONTROLLER_FIXTURE_MODE = 'pipes';
  const start = performance.now();
  const pipes = await supervise('flood', { workerUrl: new URL(import.meta.url), wallMs: 3000 });
  delete process.env.S10_CONTROLLER_FIXTURE_MODE;
  assert.equal(pipes.reason, 'stdio-close-timeout'); assert.equal(pipes.verdict, 'inconclusive'); assert.equal(pipes.cleanup.remainingActive.length, 0); assert(performance.now() - start < 2500);

  const original = { pid: 810000, ppid: 1, group: 810000, session: 810000, start: '10', state: 'S', cpuTicks: 0, rssBytes: 0 };
  let table = [original]; const signals = [];
  const dependencies = { table: () => table, read: pid => table.find(p => p.pid === pid) ?? null, kill: (pid, signal) => signals.push({ pid, signal }) };
  const tree = new ProcessTree(original.pid, dependencies);
  table = [{ ...original, start: '999' }, { ...original, pid: 810001, ppid: original.pid, start: '1000' }];
  assert.equal(tree.scan().owned.length, 0); assert.equal(tree.known.has(810001), false); assert.equal(tree.sessions.size, 0);
  assert.equal(signalProcess(original, 'SIGKILL', dependencies).sent, false); assert.equal(signals.length, 0);
  await tree.cleanup(); assert.equal(signals.length, 0);
  // Recheck immediately before the signal, rather than trusting the scan-time identity.
  const alive = { ...original, start: '10' }; table = [alive];
  const afterScan = { ...alive }; table = [{ ...alive, start: '11' }];
  assert.equal(signalProcess(afterScan, 'SIGSTOP', dependencies).reason, 'identity-changed'); assert.equal(signals.length, 0);

  const base = { cleanup: { remainingActive: [] }, reason: null, result: null, exit: { code: 0, signal: null }, events: [{ type: 'attack-started' }] };
  assert.equal(classifyRun({ ...base, caseId: 'flood' }).verdict, 'fail');
  assert.equal(classifyRun({ ...base, caseId: 'flood', exit: { code: null, signal: 'SIGSEGV' } }).verdict, 'fail');
  assert.equal(classifyRun({ ...base, caseId: 'flood', result: { verdict: 'observed-risk' } }).verdict, 'fail');
  for (const reason of ['external-timeout', null]) {
    const incomplete = classifyRun({ ...base, caseId: 'allocation', reason, exit: { code: null, signal: 'SIGSEGV' } });
    assert.equal(incomplete.verdict, 'inconclusive'); assert.equal(incomplete.allocationComplete, false); assert.equal(incomplete.riskEvidence.crash, true);
  }
  assert.equal(classifyRun({ ...base, caseId: 'allocation', reason: 'external-timeout', events: [...base.events, { type: 'allocation-done', bytes: ALLOCATION_BYTES - 1 }] }).verdict, 'inconclusive');
  assert.equal(classifyRun({ ...base, caseId: 'allocation', reason: 'external-timeout', events: [...base.events, { type: 'allocation-done', bytes: ALLOCATION_BYTES }] }).verdict, 'observed-risk');
  console.log('S10 controller regressions passed: separate group cleanup, inherited-pipe deadline, PID/SID reuse refused, functional/crash/allocation classifications');
}
