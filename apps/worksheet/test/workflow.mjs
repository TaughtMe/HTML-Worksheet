// Focused new reliability regressions, online; this is NOT the blocked full offline/PDF E2E.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { startAppServer } from '../server.mjs';
const output = 'apps/worksheet/test-results'; await mkdir(output, { recursive: true });
const source = '<h1>Regressionsblatt</h1><input id="answer" type="text"><input id="check" type="checkbox"><button id="toggle" type="button" data-ws-action="toggle-checkbox" data-ws-target="check">Wechseln</button>';
const results = []; let browser, server, origin, page, other, error, browserVersion;
async function stage(name, work) { const start = performance.now(); await work(); results.push({ name, result: 'pass', elapsedMs: performance.now() - start }); console.log('PASS', name); }
async function ready(page) { await page.locator('.storage-card[data-ready="true"]').waitFor({ timeout: 15000 }); await page.getByRole('button', { name: 'Blatt öffnen', exact: true }).waitFor(); }
async function saved(page) { await page.locator('.status-line').filter({ hasText: 'Zuletzt lokal bestätigt:' }).waitFor(); await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Jetzt speichern').disabled); }
async function save(page) { await page.getByRole('button', { name: 'Jetzt speichern', exact: true }).click(); await saved(page); }
async function dbRecords(page) { return page.evaluate(() => new Promise((resolve, reject) => { const r = indexedDB.open('html-worksheet-v1'); r.onsuccess = () => { const db = r.result, tx = db.transaction(['instances', 'revisions', 'templates'], 'readonly'), result = {}; for (const key of ['instances', 'revisions', 'templates']) { const q = tx.objectStore(key).getAll(); q.onsuccess = () => { result[key] = q.result; }; } tx.oncomplete = () => { db.close(); resolve(result); }; tx.onabort = () => reject(tx.error); }; r.onerror = () => reject(r.error); })); }
try {
  const app = await startAppServer(0); server = app.server; origin = app.origin;
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] }); browserVersion = browser.version(); const context = await browser.newContext({ acceptDownloads: true }); context.setDefaultTimeout(7000);
  page = await context.newPage(); await page.goto(origin); await ready(page); await page.getByLabel('HTML-Arbeitsblatt auswählen').setInputFiles({ name: 'Guard.html', mimeType: 'text/html', buffer: Buffer.from(source) }); await saved(page);
  await stage('beforeunload warns during the quiet debounce before a host candidate exists', async () => {
    await page.frameLocator('iframe').locator('#answer').click(); await page.frameLocator('iframe').locator('#answer').fill('Debounce bleibt geschützt');
    const dialog = page.waitForEvent('dialog'); await page.close({ runBeforeUnload: true }); const warning = await dialog; assert.equal(warning.type(), 'beforeunload'); await warning.dismiss(); assert.equal(page.isClosed(), false); await save(page);
  });
  await stage('pending native IDB commit locks editing; abort preserves the last possible input for working copy', async () => {
    await page.evaluate(() => {
      const original = IDBDatabase.prototype.transaction; globalThis.holdCommit = true; globalThis.holdNext = true;
      IDBDatabase.prototype.transaction = function (...args) {
        const tx = Reflect.apply(original, this, args);
        if (globalThis.holdNext && tx.mode === 'readwrite' && tx.objectStoreNames.contains('revisions')) {
          globalThis.holdNext = false; globalThis.heldTransaction = tx; const deadline = performance.now() + 1500;
          const pump = () => { const q = tx.objectStore('meta').get('schema'); q.onsuccess = () => { if (globalThis.holdCommit && performance.now() < deadline) pump(); else if (globalThis.holdCommit) { globalThis.holdExpired = true; tx.abort(); } }; }; pump();
        } return tx;
      };
    });
    await page.frameLocator('iframe').locator('#answer').fill('Letzte mögliche Eingabe'); const child = page.frames().find(f => f.parentFrame() === page.mainFrame()); await child.waitForFunction(() => document.getElementById('answer').disabled);
    await assert.rejects(page.frameLocator('iframe').locator('#answer').fill('darf nicht heimlich verloren gehen', { timeout: 150 }));
    assert.equal(await page.frameLocator('iframe').locator('#answer').inputValue(), 'Letzte mögliche Eingabe');
    await page.evaluate(() => { globalThis.holdCommit = false; globalThis.heldTransaction.abort(); }); await page.locator('.status-line[data-kind="error"]').waitFor();
    assert.equal(await page.evaluate(() => !!globalThis.holdExpired), false);
    await page.getByRole('button', { name: 'Arbeitskopie anlegen', exact: true }).click(); await saved(page); assert.equal(await page.frameLocator('iframe').locator('#answer').inputValue(), 'Letzte mögliche Eingabe');
  });
  await stage('foreign deletion including template GC still permits atomic rescue from bound source and candidate', async () => {
    other = await context.newPage(); await other.goto(origin); await ready(other);
    for (const title of ['Guard', 'Guard Kopie']) {
      const card = other.locator('article.card').filter({ has: other.locator('.card-title', { hasText: new RegExp('^' + title + '$') }) }); other.once('dialog', dialog => dialog.accept()); await card.getByRole('button', { name: 'Löschen', exact: true }).click(); await card.waitFor({ state: 'detached' });
    }
    assert.equal((await dbRecords(other)).templates.length, 0);
    await page.frameLocator('iframe').locator('#answer').fill('Rettung nach Fremdlöschung'); await page.locator('.status-line[data-kind="error"]').waitFor();
    await page.getByRole('button', { name: 'Arbeitskopie anlegen', exact: true }).click(); await saved(page);
    assert.equal(await page.frameLocator('iframe').locator('#answer').inputValue(), 'Rettung nach Fremdlöschung'); const records = await dbRecords(page); assert.equal(records.instances.length, 1); assert.equal(records.templates.length, 1); assert.equal(records.instances[0].headRevision, 0);
    await other.close(); other = null;
  });
  await stage('PDF remains bound to its own confirmed snapshot when a competing transaction commits before any repo reread', async () => {
    await page.frameLocator('iframe').locator('#answer').fill('Snapshot-A'); await save(page);
    const data = await dbRecords(page), instance = data.instances[0], previous = data.revisions.find(r => r.instanceId === instance.id && r.revision === instance.headRevision), nextState = structuredClone(previous.state); nextState.fields[0].value = 'Snapshot-B';
    const hash = await page.evaluate(async state => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(state))))].map(x => x.toString(16).padStart(2, '0')).join(''), nextState);
    await page.evaluate(async ({ instance, previous, nextState, hash }) => {
      const db = await new Promise((resolve, reject) => { const q = indexedDB.open('html-worksheet-v1'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
      const post = MessagePort.prototype.postMessage, requests = new Map();
      MessagePort.prototype.postMessage = function (...args) {
        if (typeof args[0] === 'string') {
          const x = JSON.parse(args[0]); if (x.type === 'REQUEST_STATE') requests.set(x.payload.requestId, x.payload.reason);
          if (x.type === 'SNAPSHOT_ACCEPTED' && requests.get(x.payload.requestId) === 'export') {
            MessagePort.prototype.postMessage = post;
            // A real competing RW transaction is queued before a later repository read could start.
            const tx = db.transaction(['instances', 'revisions'], 'readwrite'), q = tx.objectStore('instances').get(instance.id);
            q.onsuccess = () => {
              const current = q.result; if (current.headRevision !== x.payload.revision) { tx.abort(); return; }
              const at = new Date().toISOString(), next = { ...previous, revision: current.headRevision + 1, state: nextState, stateHash: hash, committedAt: at };
              // Same-length A/B and revision digits preserve exact usage byte accounting.
              if (JSON.stringify(next).length !== JSON.stringify(previous).length) { tx.abort(); return; }
              tx.objectStore('revisions').add(next); tx.objectStore('instances').put({ ...current, headRevision: next.revision, updatedAt: at }); if (current.headRevision > 0) tx.objectStore('revisions').delete([current.id, current.headRevision - 1]);
            };
            tx.oncomplete = () => { globalThis.competingCommitted = true; db.close(); }; tx.onabort = () => { globalThis.competingFailed = true; db.close(); };
          }
        } return Reflect.apply(post, this, args);
      };
    }, { instance, previous, nextState, hash });
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF herunterladen', exact: true }).click()]); const path = output + '/snapshot-bound.pdf'; await download.saveAs(path); await page.waitForFunction(() => globalThis.competingCommitted === true);
    const text = execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' }); assert(text.includes('Snapshot-A')); assert(!text.includes('Snapshot-B')); const final = await dbRecords(page), head = final.instances[0].headRevision; assert.equal(final.revisions.find(r => r.revision === head).state.fields[0].value, 'Snapshot-B');
  });
} catch (caught) { error = String(caught); results.push({ name: 'workflow regression', result: 'fail', error }); console.log('FAIL', error); }
finally { await other?.close(); await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } await writeFile(output + '/workflow.json', JSON.stringify({ at: new Date().toISOString(), browserVersion, nodeVersion: process.version, scope: 'new online reliability regressions only; full offline PDF E2E remains separately blocked', results }, null, 2)); }
if (error) process.exitCode = 1;
