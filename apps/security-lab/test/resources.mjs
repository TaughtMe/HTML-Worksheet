import { mkdir, writeFile } from 'node:fs/promises';
import { clockTicksPerSecond } from './resource-process.mjs';
import { CASES, RSS_BUDGET, ALLOCATION_BYTES, engine } from './resource-config.mjs';
if (process.platform !== 'linux') throw Error('S10 process-tree instrumentation requires Linux /proc');
import { supervise } from './resource-supervisor.mjs';
const runs = []; let interrupted = null;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { interrupted = signal; });

try {
  for (const caseId of ['flood', 'refill', 'lifecycle', 'loop', 'allocation']) {
    if (interrupted) break;
    const run = await supervise(caseId); runs.push(run);
    if (run.cleanup.remainingActive.length) break; // Do not pile another browser onto a failed cleanup.
    if (interrupted) break;
    const recovery = await supervise('recovery'); recovery.afterCase = caseId; runs.push(recovery);
    if (recovery.verdict !== 'pass') break;
  }
} finally {
  await mkdir('apps/security-lab/test-results', { recursive: true });
  await writeFile(`apps/security-lab/test-results/resources-${engine}.json`, JSON.stringify({ at: new Date().toISOString(), engine, securityGate: 'not-evaluated', budgets: { wallMs: CASES, rssBytes: RSS_BUDGET, allocationBytes: ALLOCATION_BYTES }, clockTicksPerSecond, rssMeaning: 'sum of resident pages; shared pages can be counted repeatedly; no OS memory quota', interrupted, runs }, null, 2));
}
process.exitCode = interrupted ? 130 : runs.some(r => ['fail', 'inconclusive'].includes(r.verdict)) ? 1 : runs.some(r => r.verdict === 'observed-risk') ? 2 : 0;
