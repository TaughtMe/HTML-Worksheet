// Focused STRICT02 runner; the integrated browser suite invokes these same cases.
import { chromium, firefox, webkit } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { startServer } from '../server.mjs';
import { strictLifecycleCases, checkStrictLifecycle } from './strict-lifecycle-harness.mjs';
const engine = process.env.BROWSER_ENGINE ?? 'chromium', types = { chromium, firefox, webkit };
if (!Object.hasOwn(types, engine)) throw Error('Unknown BROWSER_ENGINE');
const launch = { headless: true };
if (engine === 'chromium') {
  launch.args = ['--no-sandbox'];
  if (process.env.CHROMIUM_PATH !== undefined) {
    if (!process.env.CHROMIUM_PATH) throw Error('CHROMIUM_PATH must be nonempty');
    launch.executablePath = process.env.CHROMIUM_PATH;
  } else if (existsSync('/usr/bin/chromium')) launch.executablePath = '/usr/bin/chromium';
}
let browser, server;
const results = [];
try {
  const host = await startServer(0); server = host.server;
  browser = await types[engine].launch(launch);
  const context = await browser.newContext(); context.setDefaultTimeout(4000);
  for (const caseId of strictLifecycleCases) {
    try { const detail = await checkStrictLifecycle(context, host.origin, caseId); results.push({ caseId, result: 'pass', detail }); console.log('PASS', caseId); }
    catch (error) { results.push({ caseId, result: 'fail', error: String(error), detail: error.detail }); console.log('FAIL', caseId, String(error)); }
  }
} catch (error) { results.push({ caseId: 'startup/runtime', result: 'fail', error: String(error) }); }
finally {
  const browserVersion = browser?.version() ?? 'unavailable';
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await mkdir('apps/security-lab/test-results', { recursive: true });
  await writeFile(`apps/security-lab/test-results/strict02-${engine}.json`, JSON.stringify({ at: new Date().toISOString(), engine, nodeVersion: process.version, browserVersion, results }, null, 2));
}
if (results.some(x => x.result === 'fail')) process.exitCode = 1;
