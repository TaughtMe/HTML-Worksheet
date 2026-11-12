import assert from 'node:assert/strict';
import { chromium, firefox } from 'playwright';
import { startServer } from '../server.mjs';
import { launchOptions } from './resource-config.mjs';
import { pause } from './resource-process.mjs';
const engine = process.env.BROWSER_ENGINE;
if (!['chromium', 'firefox'].includes(engine)) throw Error('Baseline engine must be chromium or firefox');
const send = value => { if (process.connected) process.send(value); };
let browserServer, browser, server;
async function stage(name, action) {
  const started = performance.now(); send({ type: 'stage-start', stage: name });
  const detail = await action(); await pause(1000);
  // Keep the phase alive until the independent supervisor has captured RSS/PSS/private bytes.
  const checkpoint = new Promise(resolve => {
    const onMessage = message => { if (message?.type === 'checkpoint-recorded' && message.stage === name) { process.removeListener('message', onMessage); resolve(); } };
    process.on('message', onMessage);
  });
  send({ type: 'stage-complete', stage: name, durationMs: Math.round(performance.now() - started), detail });
  await checkpoint;
}
try {
  let page, origin;
  await stage('browser-start', async () => {
    ({ server, origin } = await startServer(0));
    const type = { chromium, firefox }[engine]; browserServer = await type.launchServer(launchOptions());
    send({ type: 'browser-pid', pid: browserServer.process().pid });
    browser = await type.connect(browserServer.wsEndpoint(), { timeout: 5000 });
    const context = await browser.newContext(); context.setDefaultTimeout(4000); context.setDefaultNavigationTimeout(5000);
    page = await context.newPage(); return { engine, version: browser.version(), url: page.url() };
  });
  await stage('host-loaded', async () => {
    await page.goto(origin); assert.equal(await page.locator('#status').textContent(), 'Bereit'); assert.equal(await page.locator('iframe').count(), 0);
    return { status: 'Bereit', frameCount: 0 };
  });
  await stage('demo-active', async () => {
    await page.locator('#demo').click(); await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('active'));
    await page.frameLocator('iframe').locator('#calculate').click(); assert.equal(await page.frameLocator('iframe').locator('#result').textContent(), 'JS funktioniert');
    await page.frameLocator('iframe').locator('#answer').fill('synthetic baseline');
    await page.waitForFunction(() => document.getElementById('state').textContent.includes('synthetic baseline'));
    assert.equal(await page.locator('iframe').count(), 1); return { fixture: 'built-in demo only', frameCount: 1, syntheticAnswerAccepted: true };
  });
  send({ type: 'healthy-complete' });
} catch (error) { send({ type: 'worker-error', error: String(error).slice(0, 4000) }); }
finally {
  try { await browser?.close(); await browserServer?.close(); } catch (error) { send({ type: 'worker-cleanup-error', error: String(error).slice(0, 1000) }); }
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (process.connected) process.disconnect();
}
