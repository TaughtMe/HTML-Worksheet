// Focused regression for the CI import race; real pending IDB work, no product test API or download path.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { startAppServer } from '../server.mjs';
import { captureApp, importWorksheet } from './functional-ui.mjs';
let browser, server, result;
try {
  const app = await startAppServer(0); server = app.server;
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] }); const page = await browser.newPage(); page.setDefaultTimeout(7000); await page.goto(app.origin);
  await page.getByRole('button', { name: 'Blatt öffnen', exact: true }).waitFor();
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = Reflect.apply(original, this, args);
      if (tx.mode === 'readwrite' && tx.objectStoreNames.contains('containers')) {
        const deadline = performance.now() + 400; globalThis.delayedContainer = true;
        const pump = () => { const q = tx.objectStore('meta').get('schema'); q.onsuccess = () => { if (performance.now() < deadline) pump(); }; }; pump();
      } return tx;
    };
  });
  page.once('dialog', dialog => dialog.accept('Busy Heft')); await page.getByRole('button', { name: 'Arbeitsheft hinzufügen', exact: true }).click();
  await page.waitForFunction(() => globalThis.delayedContainer === true);
  assert.equal(await page.getByRole('button', { name: 'Blatt öffnen', exact: true }).isDisabled(), true);
  const source = '<input id="check" type="checkbox"><button id="toggle" type="button" data-ws-action="toggle-checkbox" data-ws-target="check">Toggle</button>';
  await importWorksheet(page, { name: 'busy-import.html', mimeType: 'text/html', buffer: Buffer.from(source) });
  await page.locator('.status-line').filter({ hasText: 'Revision 0' }).waitFor(); assert.equal(await page.locator('iframe').count(), 1);
  const screenshots = await captureApp(page, 'apps/worksheet/test-results');
  result = { screenshots, result: 'pass', browserVersion: browser.version(), delayedNativeTransactionMs: 400, importedAfterEnabledButton: true }; console.log('PASS file chooser waits for real pending container transaction');
} catch (error) { result = { result: 'environment-or-test-failure', error: String(error) }; console.log('FAIL', String(error)); process.exitCode = 1; }
finally { await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } await mkdir('apps/worksheet/test-results', { recursive: true }); await writeFile('apps/worksheet/test-results/import-busy.json', JSON.stringify(result, null, 2)); }
