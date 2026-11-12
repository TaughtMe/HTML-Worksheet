// Separately labelled offline DATA flow. It does not replace the blocked full offline-PDF test.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startAppServer } from '../server.mjs';
const output = 'apps/worksheet/test-results'; await mkdir(output, { recursive: true }); const profile = await mkdtemp(join(tmpdir(), 'worksheet-offline-state-'));
const expected = { text: 'Gespeicherte Antwort', area: 'Mehrzeilig\nvor Neustart', check: true, group: 'r2', one: 'b', many: ['a', 'b'] };
const launch = () => chromium.launchPersistentContext(profile, { executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'], acceptDownloads: true });
let context, host, error; const evidence = { scope: 'offline state only; full offline PDF export remains blocked separately', at: null, browserVersion: null, serverStopped: false, directHttpFailure: null, responses: [], routedRequests: [], restored: null, continued: null };
const ready = page => page.locator('.storage-card[data-ready="true"]').waitFor({ timeout: 15000 });
async function save(page) { await page.getByRole('button', { name: 'Jetzt speichern', exact: true }).click(); await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Jetzt speichern').disabled); }
try {
  host = await startAppServer(0); context = await launch(); evidence.browserVersion = context.browser().version(); context.setDefaultTimeout(7000); let page = context.pages()[0]; await page.goto(host.origin); await ready(page); const nonce = await page.locator('script[nonce]').evaluate(x => x.nonce);
  await page.getByLabel('HTML-Arbeitsblatt auswählen').setInputFiles({ name: 'Offline Felder.html', mimeType: 'text/html', buffer: await readFile('tests/fixtures/demo-strict-fields.html') }); await page.locator('.status-line').filter({ hasText: 'Revision 0' }).waitFor(); let f = page.frameLocator('iframe');
  await f.locator('#text').fill(expected.text); await f.locator('#area').fill(expected.area); await f.locator('#r2').check(); await f.locator('#one').selectOption(expected.one); await f.locator('#many').selectOption(expected.many); await f.locator('#toggle').click(); await save(page);
  await context.close(); context = null; host.server.closeAllConnections(); await new Promise(resolve => host.server.close(resolve)); evidence.serverStopped = true;
  try { await fetch(host.origin, { signal: AbortSignal.timeout(1500) }); throw Error('Stopped server answered'); } catch (caught) { if (String(caught).includes('Stopped server answered')) throw caught; evidence.directHttpFailure = String(caught.cause?.code ?? caught.name); }
  context = await launch(); context.setDefaultTimeout(7000); await context.route(/^https?:\/\//, async route => { evidence.routedRequests.push(route.request().url()); await route.abort('internetdisconnected'); }); context.on('response', response => evidence.responses.push({ url: response.url(), status: response.status(), fromServiceWorker: response.fromServiceWorker() }));
  page = context.pages()[0]; const response = await page.goto(host.origin); assert(response.fromServiceWorker()); await ready(page); assert.notEqual(await page.locator('script[nonce]').evaluate(x => x.nonce), nonce);
  await page.locator('article.card').filter({ has: page.locator('.card-title', { hasText: /^Offline Felder$/ }) }).getByRole('button', { name: 'Öffnen', exact: true }).click(); await page.locator('.status-line').filter({ hasText: 'Zuletzt lokal bestätigt:' }).waitFor(); f = page.frameLocator('iframe');
  const restored = { text: await f.locator('#text').inputValue(), area: await f.locator('#area').inputValue(), check: await f.locator('#check').isChecked(), group: await f.locator('#r2').isChecked() ? 'r2' : null, one: await f.locator('#one').inputValue(), many: await f.locator('#many').evaluate(x => [...x.selectedOptions].map(o => o.value)) }; assert.deepEqual(restored, expected); evidence.restored = restored;
  await f.locator('#text').fill('Offline weiterbearbeitet'); await save(page);
  evidence.continued = await page.evaluate(() => new Promise(resolve => { const r = indexedDB.open('html-worksheet-v1'); r.onsuccess = () => { const db = r.result, tx = db.transaction(['instances', 'revisions'], 'readonly'); const q = tx.objectStore('instances').getAll(); let result; q.onsuccess = () => { const instance = q.result[0], head = tx.objectStore('revisions').get([instance.id, instance.headRevision]); head.onsuccess = () => { result = { headRevision: instance.headRevision, state: head.result.state }; }; }; tx.oncomplete = () => { db.close(); resolve(result); }; }; }));
  assert(evidence.continued.headRevision >= 2); assert.equal(evidence.continued.state.fields.find(x => x.id === 'text').value, 'Offline weiterbearbeitet'); assert(evidence.responses.every(x => x.fromServiceWorker)); assert(evidence.responses.some(x => x.url.endsWith('/app.js'))); evidence.result = 'pass'; console.log('PASS offline state restart/restore/continued commit (no PDF claim)');
} catch (caught) { error = String(caught); evidence.result = 'fail'; evidence.error = error; console.log('FAIL', error); }
finally { await context?.close(); if (host && !evidence.serverStopped) { host.server.closeAllConnections(); await new Promise(resolve => host.server.close(resolve)); } evidence.at = new Date().toISOString(); await writeFile(output + '/offline-state.json', JSON.stringify(evidence, null, 2)); if (!error) await rm(profile, { recursive: true, force: true }); }
if (error) process.exitCode = 1;
