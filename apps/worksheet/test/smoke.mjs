// Two remaining scoped integrations: actual backup file UI and the changed runner's lab-memory default.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { startAppServer } from '../server.mjs';
import { startServer } from '../../security-lab/server.mjs';
import { checkNonemptyRestore } from '../../security-lab/test/restore-harness.mjs';
import { importWorksheet } from './functional-ui.mjs';
const output = 'apps/worksheet/test-results'; await mkdir(output, { recursive: true }); const results = [];
let browser, app, lab, error;
try {
  app = await startAppServer(0); lab = await startServer(0); browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] }); const context = await browser.newContext({ acceptDownloads: true }); context.setDefaultTimeout(7000);
  const page = await context.newPage(); await page.goto(app.origin); await page.locator('.storage-card[data-ready="true"]').waitFor({ timeout: 15000 });
  const source = '<h2>Backupprüfung</h2><input id="answer" type="text"><input id="check" type="checkbox"><button id="toggle" type="button" data-ws-action="toggle-checkbox" data-ws-target="check">Wechseln</button>';
  await page.getByLabel('HTML-Arbeitsblatt auswählen').setInputFiles({ name: 'Sicherung.html', mimeType: 'text/html', buffer: Buffer.from(source) }); await page.locator('.status-line').filter({ hasText: 'Revision 0' }).waitFor(); await page.frameLocator('iframe').locator('#answer').fill('Bestätigte Sicherungsantwort'); await page.frameLocator('iframe').locator('#toggle').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Sicherung exportieren', exact: true }).click()]); const path = output + '/ui-backup.json'; await download.saveAs(path); const backup = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(backup.format, 'html-worksheet-backup'); assert.equal(backup.instances.length, 1); assert.deepEqual(backup.revisions[0].state.fields.map(x => x.value), ['Bestätigte Sicherungsantwort', true]);
  await importWorksheet(page, path, 'Sicherung importieren'); await page.waitForFunction(() => document.querySelectorAll('article.card').length === 2);
  const stored = await page.evaluate(() => new Promise(resolve => { const q = indexedDB.open('html-worksheet-v1'); q.onsuccess = () => { const db = q.result, tx = db.transaction(['instances', 'revisions'], 'readonly'), data = {}; for (const key of ['instances', 'revisions']) { const r = tx.objectStore(key).getAll(); r.onsuccess = () => { data[key] = r.result; }; } tx.oncomplete = () => { db.close(); resolve(data); }; }; }));
  assert.equal(stored.instances.length, 2); assert.equal(new Set(stored.instances.map(x => x.id)).size, 2); assert(stored.instances.some(x => x.id === backup.instances[0].id));
  const copied = stored.instances.find(x => x.id !== backup.instances[0].id); assert.equal(copied.headRevision, 0); assert.deepEqual(stored.revisions.find(x => x.instanceId === copied.id).state, backup.revisions[0].state);
  results.push({ name: 'actual UI backup download and merge preserve confirmed answers as fresh identities', result: 'pass' }); console.log('PASS UI backup download/merge');
  const legacy = await checkNonemptyRestore(context, lab.origin); results.push({ name: 'shared runner retains legacy memory-default nonempty restore and checkpoint', result: 'pass', detail: legacy }); console.log('PASS legacy memory default');
} catch (caught) { error = String(caught); results.push({ name: 'smoke integration', result: 'fail', error }); console.log('FAIL', error); }
finally { const version = browser?.version(); await browser?.close(); for (const host of [app, lab]) if (host) { host.server.closeAllConnections(); await new Promise(resolve => host.server.close(resolve)); } await writeFile(output + '/smoke.json', JSON.stringify({ at: new Date().toISOString(), browserVersion: version, nodeVersion: process.version, results }, null, 2)); }
if (error) process.exitCode = 1;
