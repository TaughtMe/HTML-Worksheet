import { mkdir, writeFile } from 'node:fs/promises';
import { supervise } from './resource-supervisor.mjs';
import { engine, RSS_BUDGET } from './resource-config.mjs';
import { clockTicksPerSecond } from './resource-process.mjs';
import { summarizeTabRecovery, TAB_BUDGETS } from './tab-recovery-result.mjs';

let interrupted = null;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { interrupted = signal; });
const run = await supervise('loop', { workerUrl: new URL('./tab-recovery-worker.mjs', import.meta.url), wallMs: TAB_BUDGETS.wallMs });
const summary = summarizeTabRecovery(run);
await mkdir('apps/security-lab/test-results', { recursive: true });
await writeFile(`apps/security-lab/test-results/tab-recovery-${engine}.json`, JSON.stringify({
  at: new Date().toISOString(), engine, securityGate: 'not-evaluated',
  mechanism: 'Playwright page.close and newPage; not manual browser UI, iPad, or a product mechanism',
  profile: 'one live BrowserContext in one BrowserServer; not persistent-profile browser-restart recovery',
  budgets: { ...TAB_BUDGETS, rssBytes: RSS_BUDGET }, clockTicksPerSecond, interrupted, summary, run,
}, null, 2));
console.log(`tab-recovery: ${summary.verdict} (${summary.classification})`);
process.exitCode = interrupted ? 130 : ['fail', 'inconclusive'].includes(summary.verdict) ? 1 : summary.verdict === 'observed-risk' ? 2 : 0;
