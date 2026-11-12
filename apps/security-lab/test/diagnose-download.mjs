// DIAG-DOWNLOAD01: one A/B comparison, no retries or changes to the product or its policies.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { trustedControlMarkup, installTrustedControlHandlers } from './trusted-controls.mjs';
const reportPath = 'apps/security-lab/test-results/download-comparison-chromium.json';
const report = { at: new Date().toISOString(), nodeVersion: process.version, launchSelection: { source: 'playwright-default', configuredExecutablePath: null, publicRegistryExecutablePath: chromium.executablePath() }, timeout: 4000, requests: [], variants: [], cleanup: [] };
const persist = async () => { await mkdir('apps/security-lab/test-results', { recursive: true }); await writeFile(reportPath, JSON.stringify(report, null, 2)); };
const server = createServer((req, res) => {
  const status = req.method === 'GET' && req.url === '/trusted-download-control' ? 200 : 404;
  report.requests.push({ method: req.method, url: req.url, status });
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(status === 200 ? '<!doctype html>' + trustedControlMarkup : 'Not found');
});
function installMarkers() {
  const markers = globalThis.controlMarkers = [], pending = [];
  const snapshot = () => ({ href: location.href, origin: location.origin, baseURI: document.baseURI, focus: document.hasFocus(), secureContext: isSecureContext,
    activation: { active: navigator.userActivation.isActive, ever: navigator.userActivation.hasBeenActive } });
  document.addEventListener('click', event => {
    if (['popup', 'download'].includes(event.target.id)) markers.push({ kind: 'click-before-handler', id: event.target.id, trusted: event.isTrusted, ...snapshot() });
  }, true);
  const create = URL.createObjectURL, click = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = function (blob) {
    const url = Reflect.apply(create, this, [blob]), marker = { kind: 'blob-created', url, size: blob.size, type: blob.type, ...snapshot() };
    markers.push(marker); pending.push(blob.text().then(text => { marker.text = text; })); return url;
  };
  HTMLAnchorElement.prototype.click = function (...args) {
    markers.push({ kind: 'anchor-click', anchorHref: this.href, filename: this.download, ...snapshot() }); return Reflect.apply(click, this, args);
  };
  globalThis.controlSnapshot = async () => { await Promise.all(pending); return { document: snapshot(), markers }; };
}
function observe(page, evidence) {
  const push = item => {
    if (evidence.events.length >= 64) evidence.overflow = true;
    else evidence.events.push(item);
  };
  page.on('console', message => push({ kind: 'console', level: message.type(), text: message.text() }));
  page.on('pageerror', error => push({ kind: 'pageerror', text: String(error) }));
  page.on('requestfailed', request => push({ kind: 'requestfailed', url: request.url(), error: request.failure() }));
  page.on('framenavigated', frame => push({ kind: 'navigation', url: frame.url() }));
  page.on('popup', popup => push({ kind: 'popup', url: popup.url() }));
  page.on('download', download => push({ kind: 'download', filename: download.suggestedFilename(), url: download.url() }));
}
async function eventAndClick(page, type, id, evidence) {
  // Both outcomes are handled immediately and retained independently, including a pending-click failure.
  const [event, click] = await Promise.allSettled([page.waitForEvent(type), page.locator(id).click()]);
  evidence.actions.push({ type, event: event.status, eventError: event.status === 'rejected' ? String(event.reason) : null,
    click: click.status, clickError: click.status === 'rejected' ? String(click.reason) : null });
  if (event.status === 'rejected' || click.status === 'rejected') throw Error(`${type} event or click failed`);
  return event.value;
}
let browser, listening = false;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); listening = true;
  const url = `http://127.0.0.1:${server.address().port}/trusted-download-control`;
  const launch = { headless: true, args: ['--no-sandbox'] };
  if (process.env.CHROMIUM_PATH !== undefined) {
    if (!process.env.CHROMIUM_PATH) throw Error('CHROMIUM_PATH must be a nonempty executable path');
    launch.executablePath = process.env.CHROMIUM_PATH; report.launchSelection.source = 'CHROMIUM_PATH';
  } else if (existsSync('/usr/bin/chromium')) {
    launch.executablePath = '/usr/bin/chromium'; report.launchSelection.source = 'system-chromium';
  }
  report.launchSelection.configuredExecutablePath = launch.executablePath ?? null;
  browser = await chromium.launch(launch);
  report.browserVersion = browser.version();
  const context = await browser.newContext({ acceptDownloads: true }); context.setDefaultTimeout(report.timeout);
  for (const variant of ['about:blank', 'loopback-http']) {
    const evidence = { variant, events: [], actions: [], overflow: false, result: 'inconclusive' }; report.variants.push(evidence);
    const page = await context.newPage(); observe(page, evidence);
    try {
      if (variant === 'loopback-http') {
        const response = await page.goto(url);
        evidence.response = { status: response.status(), url: response.url(), finalUrl: page.url(), headers: response.headers() };
        assert.equal(evidence.response.status, 200); assert.equal(evidence.response.finalUrl, url);
        assert(!Object.hasOwn(evidence.response.headers, 'content-security-policy')); assert(!Object.hasOwn(evidence.response.headers, 'content-disposition'));
      }
      await page.setContent(trustedControlMarkup); await page.evaluate(installTrustedControlHandlers); await page.evaluate(installMarkers);
      evidence.before = await page.evaluate(() => globalThis.controlSnapshot());
      const popup = await eventAndClick(page, 'popup', '#popup', evidence); await popup.close();
      evidence.afterPopup = await page.evaluate(() => globalThis.controlSnapshot());
      const download = await eventAndClick(page, 'download', '#download', evidence);
      evidence.download = { filename: download.suggestedFilename(), failure: await download.failure() };
      try { evidence.download.bytes = [...await readFile(await download.path())]; }
      finally { await download.delete(); }
      assert.equal(evidence.download.filename, 'synthetic-control.txt'); assert.equal(evidence.download.failure, null);
      assert.deepEqual(evidence.download.bytes, [...Buffer.from('synthetic control')]);
      assert.equal(evidence.events.filter(x => x.kind === 'download').length, 1);
      const snapshot = await page.evaluate(() => globalThis.controlSnapshot());
      assert(snapshot.markers.some(x => x.kind === 'click-before-handler' && x.id === 'download' && x.trusted));
      assert(snapshot.markers.some(x => x.kind === 'blob-created' && x.text === 'synthetic control'));
      assert(snapshot.markers.some(x => x.kind === 'anchor-click' && x.filename === 'synthetic-control.txt'));
      assert.equal(evidence.overflow, false); evidence.result = 'pass';
    } catch (error) { evidence.error = String(error); evidence.result = 'fail'; }
    finally {
      evidence.after = await page.evaluate(() => globalThis.controlSnapshot?.()).catch(error => ({ error: String(error) }));
      await persist(); // Preserve timeout/console/origin diagnostics before closing either page or server.
      await page.close().catch(error => { evidence.cleanupError = String(error); evidence.result = 'fail'; report.cleanup.push(`${variant}: ${error}`); }); await persist();
    }
    console.log(variant, evidence.result);
  }
} catch (error) { report.runtimeError = String(error); }
finally {
  await persist();
  try { await browser?.close(); } catch (error) { report.cleanup.push(String(error)); }
  if (listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await persist();
}
if (report.runtimeError || report.cleanup.length || report.variants.length !== 2 || report.variants.some(x => x.result !== 'pass')) process.exitCode = 1;
