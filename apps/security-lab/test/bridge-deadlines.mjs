// Focused TIME01 runner; the integrated browser suite invokes these same cases.
import { chromium, firefox, webkit } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { startServer } from '../server.mjs';
import { deadlineCases, checkBridgeDeadline } from './bridge-deadlines-harness.mjs';
const engine = process.env.BROWSER_ENGINE ?? 'chromium', types = { chromium, firefox, webkit };
if (!Object.hasOwn(types, engine)) throw Error('Unknown BROWSER_ENGINE');
const launch = { headless: true }, selection = { source: 'playwright-default', configuredExecutablePath: null, publicRegistryExecutablePath: types[engine].executablePath() };
if (engine === 'chromium') {
  launch.args = ['--no-sandbox'];
  if (process.env.CHROMIUM_PATH !== undefined) {
    if (!process.env.CHROMIUM_PATH) throw Error('CHROMIUM_PATH must be nonempty');
    launch.executablePath = process.env.CHROMIUM_PATH; selection.source = 'CHROMIUM_PATH';
  } else if (existsSync('/usr/bin/chromium')) { launch.executablePath = '/usr/bin/chromium'; selection.source = 'system-chromium'; }
  selection.configuredExecutablePath = launch.executablePath ?? null;
}
let browser, server;
const results = [];
try {
  const host = await startServer(0); server = host.server;
  browser = await types[engine].launch(launch);
  const context = await browser.newContext(); context.setDefaultTimeout(4000);
  for (const type of deadlineCases) {
    try { const detail = await checkBridgeDeadline(context, host.origin, type); results.push({ type, result: 'pass', detail }); console.log('PASS', type); }
    catch (error) { results.push({ type, result: 'fail', error: String(error), detail: error.detail }); console.log('FAIL', type, String(error)); }
  }
} catch (error) { results.push({ type: 'startup/runtime', result: 'fail', error: String(error) }); }
finally {
  const browserVersion = browser?.version() ?? 'unavailable';
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await mkdir('apps/security-lab/test-results', { recursive: true });
  await writeFile(`apps/security-lab/test-results/time01-${engine}.json`, JSON.stringify({ at: new Date().toISOString(), engine, nodeVersion: process.version, browserVersion, selection, results }, null, 2));
}
if (results.some(item => item.result === 'fail')) process.exitCode = 1;
