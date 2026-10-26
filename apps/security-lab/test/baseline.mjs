import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { ProcessTree } from './resource-process.mjs';
import { CALIBRATION_RSS_CAP, RESERVE_FLOOR, ADMISSION_HEADROOM, reserveSnapshot, assessReserve, treeMemory } from './baseline-memory.mjs';
const stages = ['browser-start', 'host-loaded', 'demo-active'], runs = [];
let interrupted = null, stopActive;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { interrupted = signal; void stopActive?.('interrupted'); });
async function measure(engine, repetition, admission) {
  const started = performance.now(), events = [], samples = []; let stageIndex = -1, reason = null, healthyComplete = false, cleanupPromise, stageTimer, closeTimer, cleanupTimer;
  const child = fork(new URL('./baseline-worker.mjs', import.meta.url), [], { detached: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env: { ...process.env, BROWSER_ENGINE: engine }, execArgv: ['--max-old-space-size=128'] });
  const tree = new ProcessTree(child.pid); let stderr = '', resolveExit;
  const exited = new Promise(resolve => { resolveExit = resolve; });
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8192); });
  const elapsed = () => Math.round(performance.now() - started);
  async function cleanup() {
    try { return await tree.cleanup(); }
    catch (error) {
      try { tree.signal(tree.known.get(tree.root), 'SIGKILL'); } catch { /* report unknown cleanup */ }
      return { remainingActive: [{ unknown: true, error: String(error) }], remainingZombies: [] };
    }
  }
  function stop(why) {
    reason ??= why;
    cleanupPromise ??= cleanup().then(result => { resolveExit({ synthetic: true, code: child.exitCode, signal: child.signalCode }); return result; });
    return cleanupPromise;
  }
  stopActive = stop;
  function sample(checkpoint = null) {
    try {
      const reserve = reserveSnapshot(), approval = assessReserve(reserve, RESERVE_FLOOR), memory = treeMemory(tree);
      samples.push({ elapsedMs: elapsed(), stage: stages[stageIndex] ?? 'worker-startup', checkpoint, reserve, ...memory });
      if (!approval.ok) { void stop(approval.reason); return null; }
      if (reserve.groups.some(group => { const before = admission.groups.find(g => g.path === group.path); return !before || group.oom > before.oom || group.oomKill > before.oomKill; })) { void stop('memory-pressure-event'); return null; }
      if (memory.rssBytes > CALIBRATION_RSS_CAP) { void stop('calibration-rss-cap'); return null; }
      if (checkpoint && (!memory.processes.length || memory.skippedPids.length)) { void stop('checkpoint-memory-unavailable'); return null; }
      return memory;
    } catch (error) { events.push({ type: 'measurement-error', elapsedMs: elapsed(), error: String(error) }); void stop('measurement-unknown'); }
  }
  const armStage = () => { clearTimeout(stageTimer); stageTimer = setTimeout(() => { void stop('stage-timeout'); }, 10000); };
  armStage(); // Includes initial worker/module startup; first stage-start cannot extend this deadline.
  child.on('message', message => {
    if (!message || typeof message !== 'object' || events.length >= 100) return;
    events.push({ ...message, elapsedMs: elapsed() });
    if (message.type === 'browser-pid') { try { tree.browser(message.pid); } catch { void stop('browser-ownership-unknown'); } }
    if (message.type === 'stage-start') {
      if (message.stage !== stages[stageIndex + 1] || (stageIndex >= 0 && !events.some(e => e.type === 'stage-complete' && e.stage === stages[stageIndex]))) { void stop('stage-protocol-error'); return; }
      stageIndex++; if (stageIndex > 0) armStage();
    }
    if (message.type === 'stage-complete') {
      if (message.stage !== stages[stageIndex] || message.durationMs > 10000) { void stop('stage-protocol-error'); return; }
      if (!sample(message.stage)) return; // No acknowledgement for an incomplete memory checkpoint.
      if (child.connected) child.send({ type: 'checkpoint-recorded', stage: message.stage }, error => { if (error) void stop('checkpoint-channel-error'); });
      if (stageIndex === 2) { clearTimeout(stageTimer); cleanupTimer = setTimeout(() => { void stop('worker-cleanup-timeout'); }, 2000); }
    }
    if (message.type === 'healthy-complete') healthyComplete = stageIndex === 2;
    if (['worker-error', 'worker-cleanup-error'].includes(message.type)) void stop(message.type);
  });
  child.once('exit', (code, signal) => { closeTimer = setTimeout(() => { void stop('worker-pipes-open'); resolveExit({ code, signal, synthetic: true }); }, 250); });
  child.once('close', (code, signal) => resolveExit({ code, signal, synthetic: false }));
  child.once('error', error => { events.push({ type: 'spawn-error', error: String(error), elapsedMs: elapsed() }); void stop('spawn-error'); });
  sample(); const sampler = setInterval(() => sample(), 250);
  let exit, finalCleanup;
  try { exit = await exited; }
  finally {
    clearInterval(sampler); clearTimeout(stageTimer); clearTimeout(closeTimer); clearTimeout(cleanupTimer);
    finalCleanup = await (cleanupPromise ?? cleanup()); clearTimeout(closeTimer);
    if (child.connected) { try { child.disconnect(); } catch { /* already closed */ } } child.stderr.destroy(); child.unref(); stopActive = null;
  }
  const checkpoints = stages.map(stage => samples.find(s => s.checkpoint === stage));
  const complete = !reason && healthyComplete && exit.code === 0 && checkpoints.every(Boolean) && finalCleanup.remainingActive.length === 0;
  const result = { engine, repetition, verdict: complete ? 'measured' : 'inconclusive', reason: reason ?? (!complete ? 'incomplete-run' : null), elapsedMs: elapsed(), admission, exit, events, samples, cleanup: finalCleanup, peakRssBytes: Math.max(0, ...samples.map(s => s.rssBytes)), peakPssBytes: Math.max(0, ...samples.map(s => s.pssBytes)), peakPrivateBytes: Math.max(0, ...samples.map(s => s.privateBytes)), stderr };
  console.log(`${engine} baseline ${repetition}: ${result.verdict}${result.reason ? ' (' + result.reason + ')' : ''}`); return result;
}
let refusal = null, bundleHash = null;
try {
  const initialReserve = reserveSnapshot(), initialDecision = assessReserve(initialReserve);
  if (!initialDecision.ok) {
    refusal = { ...initialDecision, reserve: initialReserve }; console.log(`Baseline refused: ${initialDecision.reason}`);
  } else {
  bundleHash = createHash('sha256').update(await readFile('apps/security-lab/dist/host.js')).digest('hex');
  outer: for (const engine of ['chromium', 'firefox']) for (let repetition = 1; repetition <= 3; repetition++) {
    if (interrupted) break outer;
    const admission = reserveSnapshot(), decision = assessReserve(admission);
    if (!decision.ok) { refusal = { engine, repetition, ...decision, reserve: admission }; console.log(`Baseline refused: ${decision.reason}`); break outer; }
    const result = await measure(engine, repetition, admission); runs.push(result);
    if (result.verdict !== 'measured') break outer;
  }
  }
} catch (error) { refusal = { reason: 'setup-error', error: String(error) }; }
finally {
  await mkdir('apps/security-lab/test-results', { recursive: true });
  await writeFile('apps/security-lab/test-results/baseline.json', JSON.stringify({ at: new Date().toISOString(), kind: 'healthy-baseline-only', nodeVersion: process.version, bundleHash, noAttackFixtures: true, stages, repetitionsPerEngine: 3, limits: { calibrationRssCapBytes: CALIBRATION_RSS_CAP, admissionHeadroomBytes: ADMISSION_HEADROOM, runtimeReserveFloorBytes: RESERVE_FLOOR, stageMs: 10000, holdMs: 1000 }, interrupted, refusal, runs, automaticProtectionBudget: null }, null, 2));
}
process.exitCode = interrupted ? 130 : refusal || runs.length !== 6 || runs.some(r => r.verdict !== 'measured') ? 1 : 0;
