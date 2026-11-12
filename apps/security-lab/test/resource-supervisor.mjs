import { fork } from 'node:child_process';
import { ProcessTree } from './resource-process.mjs';
import { classifyRun } from './resource-classify.mjs';
import { CASES, RSS_BUDGET } from './resource-config.mjs';
export async function supervise(caseId, { workerUrl = new URL('./resource-worker.mjs', import.meta.url), wallMs = CASES[caseId] } = {}) {
  const start = performance.now(), events = []; let result, reason = null, stderr = '', stopping = null;
  const child = fork(workerUrl, [caseId], { detached: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: ['--max-old-space-size=128'] });
  const tree = new ProcessTree(child.pid);
  let pipeDeadline;
  let resolveExit; const exited = new Promise(resolve => { resolveExit = resolve; });
  child.once('exit', (code, signal) => { pipeDeadline = setTimeout(() => { reason ??= 'stdio-close-timeout'; resolveExit({ code, signal, synthetic: true }); }, 250); });
  child.once('close', (code, signal) => { resolveExit({ code, signal }); });
  child.once('error', error => { reason ??= 'worker-error'; events.push({ type: 'worker-error', error: String(error) }); resolveExit({ code: null, signal: null }); });
  child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-16384); });
  child.on('message', message => {
    if (events.length >= 2000 || !message || typeof message !== 'object') return;
    events.push({ elapsedMs: Math.round(performance.now() - start), ...message });
    if (message.type === 'browser-pid') { try { tree.browser(message.pid); if (child.connected) child.send({ type: 'browser-pid-registered' }, () => {}); } catch (error) { void stop('instrumentation-error', String(error)); } }
    if (message.type === 'result') result = message.result;
  });
  async function stop(why, error) {
    if (stopping) return stopping;
    reason ??= why; if (error) events.push({ type: 'instrumentation-error', error });
    stopping = safeCleanup().then(cleanup => { resolveExit({ code: child.exitCode, signal: child.signalCode, synthetic: true }); return cleanup; }); return stopping;
  }
  async function safeCleanup() {
    try { return await tree.cleanup(); }
    catch (error) {
      const message = String(error); events.push({ type: 'cleanup-error', error: message });
      // An instrumentation failure is visible and aborts the suite; it must never become a clean result.
      try { tree.signal(tree.known.get(tree.root), 'SIGKILL'); } catch { /* original failure remains in report */ }
      resolveExit({ code: null, signal: 'cleanup-error' });
      return { browserPid: tree.browserPid ?? null, trackedPids: [...tree.known.keys()], remainingActive: [{ unknown: true, error: message }], remainingZombies: [] };
    }
  }
  process.once('SIGTERM', onStop); process.once('SIGINT', onStop);
  function onStop() { void stop('interrupted'); }
  const sample = () => {
    try { tree.scan(); if (tree.samples.at(-1).rssBytes > RSS_BUDGET) void stop('rss-budget-stop'); }
    catch (error) { void stop('instrumentation-error', String(error)); }
  };
  sample(); const sampler = setInterval(sample, 100);
  const deadline = setTimeout(() => { void stop('external-timeout'); }, wallMs);
  let exit, cleanup;
  try {
    exit = await exited;
  } finally {
    clearInterval(sampler); clearTimeout(deadline); clearTimeout(pipeDeadline);
    cleanup = await (stopping ?? safeCleanup()); clearTimeout(pipeDeadline); process.removeListener('SIGTERM', onStop); process.removeListener('SIGINT', onStop);
    if (child.connected) { try { child.disconnect(); } catch { /* already disconnected */ } }
    child.stderr.destroy(); child.unref();
  }
  const { verdict, classification, attackStarted, allocationComplete, riskEvidence } = classifyRun({ caseId, cleanup, reason, result, exit, events });
  const report = { caseId, verdict, classification, reason, attackStarted, allocationComplete, riskEvidence, elapsedMs: Math.round(performance.now() - start), exit, result: result ?? null, cleanup, peakSummedRssBytes: Math.max(0, ...tree.samples.map(s => s.rssBytes)), samples: tree.samples, events, stderr };
  console.log(`${caseId}: ${verdict} (${classification})`); return report;
}
