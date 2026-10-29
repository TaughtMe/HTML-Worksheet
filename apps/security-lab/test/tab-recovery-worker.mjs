import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { chromium, firefox, webkit } from 'playwright';
import { startServer } from '../server.mjs';
import { engine, launchOptions } from './resource-config.mjs';
import { pause } from './resource-process.mjs';
import { observeStage, TAB_BUDGETS } from './tab-recovery-result.mjs';

if (process.argv[2] !== 'loop' || !process.send) throw Error('Run through tab-recovery.mjs supervisor');
const send = event => { if (process.connected) process.send(event, () => {}); };
const profileKey = 's10-tab-recovery-synthetic', profileValue = randomUUID();
const marker = `TAB_RECOVERY_STARTED:${randomUUID()}`;
let browserServer, browser, server, context, page, attackStarted = false, closing = false;
let initialBrowserPid, result = { kind: 'tab-recovery', verdict: 'inconclusive', classification: 'setup-not-completed' };
try {
  const host = await startServer(0); server = host.server;
  browserServer = await { chromium, firefox, webkit }[engine].launchServer(launchOptions());
  initialBrowserPid = browserServer.process().pid;
  send({ type: 'browser-pid', pid: initialBrowserPid });
  browser = await { chromium, firefox, webkit }[engine].connect(browserServer.wsEndpoint(), { timeout: 5000 });
  send({ type: 'browser-ready', engine, version: browser.version() });
  browser.on('disconnected', () => { if (!closing) send({ type: 'browser-disconnected' }); });
  // Exactly one live storage partition: no fresh BrowserContext, browser restart or replacement profile.
  context = await browser.newContext(); context.setDefaultTimeout(2000); context.setDefaultNavigationTimeout(3000);
  page = await context.newPage();
  page.on('crash', () => { if (!closing) send({ type: 'page-crash' }); });
  page.on('close', () => send({ type: 'attacked-page-closed', phase: closing ? 'cleanup' : 'measurement' }));
  page.on('console', message => { if (message.text() === marker) { attackStarted = true; send({ type: 'attack-started', kind: 'loop' }); } });
  await page.goto(host.origin);
  await page.evaluate(({ key, value }) => { localStorage.setItem(key, value); if (localStorage.getItem(key) !== value) throw Error('Profile marker write failed'); }, { key: profileKey, value: profileValue });
  const source = `<input id="x"><button id="attack">Synthetic loop</button><script>document.getElementById('attack').addEventListener('click',()=>setTimeout(()=>{console.log(${JSON.stringify(marker)});while(true){}},100))</script>`;
  send({ type: 'fixture', sha256: createHash('sha256').update(source).digest('hex') });
  await page.locator('#file').setInputFiles({ name: 's10-tab-recovery-synthetic.html', mimeType: 'text/html', buffer: Buffer.from(source) });
  await page.locator('#open').click();
  await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('active'), null, { timeout: 4000 });
  await page.frameLocator('iframe').locator('#attack').click();
  const markerDeadline = performance.now() + 2000;
  while (!attackStarted && performance.now() < markerDeadline) await pause(25);
  assert(attackStarted, 'Loop execution marker missing');

  const hostClose = await observeStage('actual-host-close', async () => {
    await page.locator('#close').click({ timeout: TAB_BUDGETS.hostCloseMs });
    const frameCount = await page.locator('iframe').count(), hostStatus = await page.locator('#status').textContent();
    assert.equal(frameCount, 0); assert.equal(hostStatus, 'closed · USER_CLOSE');
    return { frameCount, hostStatus };
  }, TAB_BUDGETS.hostCloseMs, send);

  // This is Playwright's browser protocol, not manual browser chrome or an app capability.
  const apiTabClose = await observeStage('playwright-page-close', async () => {
    await page.close({ runBeforeUnload: false });
    assert(page.isClosed());
    return { apiAcknowledged: true, pageClosed: page.isClosed(), manualBrowserUI: false };
  }, TAB_BUDGETS.apiCloseMs, send);

  // Attempt even if page.close timed out. A functional new tab alone does not prove the old tab stopped.
  const reopen = await observeStage('same-context-new-tab', async () => {
    const next = await context.newPage();
    next.on('crash', () => { if (!closing) send({ type: 'page-crash' }); });
    await next.goto(host.origin);
    const markerMatches = await next.evaluate(({ key, value }) => localStorage.getItem(key) === value, { key: profileKey, value: profileValue });
    assert(markerMatches); assert.equal(next.context(), context);
    await next.locator('#demo').click();
    await next.waitForFunction(() => document.getElementById('status').textContent.startsWith('active'));
    await next.frameLocator('iframe').locator('#calculate').click();
    assert.equal(await next.frameLocator('iframe').locator('#result').textContent(), 'JS funktioniert');
    await next.frameLocator('iframe').locator('#answer').fill('synthetic same-profile recovery');
    await next.waitForFunction(() => document.getElementById('state').textContent.includes('synthetic same-profile recovery'));
    const sameBrowserPid = browserServer.process().pid === initialBrowserPid, browserConnected = browser.isConnected();
    assert(sameBrowserPid && browserConnected);
    return { sameContext: true, markerMatches, sameBrowserPid, browserConnected, browserPid: initialBrowserPid, profileKind: 'same-live-browser-context', manualBrowserUI: false };
  }, TAB_BUDGETS.reopenMs, send);

  const healthy = [hostClose, apiTabClose, reopen].every(stage => stage.outcome === 'completed');
  result = { kind: 'tab-recovery', verdict: healthy ? 'observation' : 'observed-risk', classification: healthy ? 'three-stages-completed' : 'one-or-more-stages-unconfirmed', attackStarted, initialBrowserPid, profileKind: 'same-live-browser-context', hostClose, apiTabClose, reopen };
} catch (error) {
  result = { ...result, kind: 'tab-recovery', verdict: attackStarted ? 'observed-risk' : 'inconclusive', classification: attackStarted ? 'measurement-error-after-loop-start' : 'setup-or-execution-marker-failed', attackStarted, error: String(error).slice(0, 2000) };
} finally {
  // Preserve partial evidence before browser cleanup, which can itself block on the attacked renderer.
  send({ type: 'measurement', result }); closing = true;
  const cleanup = await observeStage('browser-cleanup', async () => {
    await browser?.close(); await browserServer?.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }, TAB_BUDGETS.cleanupMs, send);
  if (cleanup.outcome !== 'completed') send({ type: 'cleanup-escalation-required', cleanup });
  result = { ...result, cleanup };
  await new Promise(resolve => { if (process.connected) process.send({ type: 'result', result }, resolve); else resolve(); });
  // The existing supervisor owns final process cleanup; this never relaunches a browser to claim recovery.
  process.disconnect?.(); process.exit(0);
}
