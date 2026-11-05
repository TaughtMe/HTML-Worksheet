// Real product UI, native persistent profile/IndexedDB/Service Worker and downloadable PDFs.
import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';
import { existsSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startAppServer } from '../server.mjs';
import { functionalStages } from './functional-ci.mjs';
const output = 'apps/worksheet/test-results'; await mkdir(output, { recursive: true });
const engine = process.env.BROWSER_ENGINE ?? 'chromium', engines = { chromium, firefox, webkit };
if (!Object.hasOwn(engines, engine)) throw Error('Unknown BROWSER_ENGINE');
const launchOptions = { headless: true, acceptDownloads: true };
if (engine === 'chromium') { launchOptions.args = ['--no-sandbox']; if (process.env.CHROMIUM_PATH !== undefined) { if (!process.env.CHROMIUM_PATH) throw Error('Empty CHROMIUM_PATH'); launchOptions.executablePath = process.env.CHROMIUM_PATH; } else if (existsSync('/usr/bin/chromium')) launchOptions.executablePath = '/usr/bin/chromium'; }
const profile = await mkdtemp(join(tmpdir(), 'worksheet-functional-')), results = [];
const source = '<h1>Übung: Antworten erhalten</h1><p>Frage: Was wurde bearbeitet?</p><label>Text <input id="text" type="text"></label><label>Notizen <textarea id="area"></textarea></label><label>Auswahl <input id="check" type="checkbox"></label><fieldset id="group" data-ws-radio-group><legend>Radioauswahl</legend><label>A<input id="r1" name="group" type="radio"></label><label>B<input id="r2" name="group" type="radio"></label></fieldset><select id="one"><option value="a">Option A</option><option value="b">Option B</option></select><select id="many" multiple><option value="a">Option A</option><option value="b">Option B</option></select><button id="toggle" type="button" data-ws-action="toggle-checkbox" data-ws-target="check">Checkbox wechseln</button>';
const sourceB = '<h2>Zweites Arbeitsblatt</h2><label>Antwort<input id="answer" type="text"></label><input id="check" type="checkbox"><button id="toggle" type="button" data-ws-action="toggle-checkbox" data-ws-target="check">Wechseln</button>';
const notes = Array.from({ length: 180 }, (_, i) => `Antwortzeile ${i}: vollständig gespeichert.`).join('\n');
let context, server, origin, initialNonce, browserVersion, initialState, firstId, lastPdf, failure, serverStopped = false, profileRestarted = false;
const offlineProof = { directServerRequestFailed: false, serverFailure: null, routedHttpRequestsAborted: [], responses: [] };
const screenshots = [], observations = {};
const selection = { source: engine === 'chromium' ? launchOptions.executablePath ? 'explicit-executable' : 'playwright-managed-default' : 'playwright-managed-default', executablePath: launchOptions.executablePath ?? null };
const launch = offline => engines[engine].launchPersistentContext(profile, { ...launchOptions, offline });
async function ready(page) { await page.locator('.storage-card[data-ready="true"]').waitFor({ timeout: 15000 }); await page.getByRole('button', { name: 'Blatt öffnen', exact: true }).waitFor(); }
async function prompt(page, name, value) { page.once('dialog', dialog => dialog.accept(value)); await page.getByRole('button', { name, exact: true }).click(); }
async function library(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const opened = indexedDB.open('html-worksheet-v1'); opened.onerror = () => reject(opened.error); opened.onsuccess = () => {
      const db = opened.result, tx = db.transaction(['instances', 'revisions', 'containers'], 'readonly'), data = {};
      for (const name of ['instances', 'revisions', 'containers']) { const r = tx.objectStore(name).getAll(); r.onsuccess = () => { data[name] = r.result; }; }
      tx.oncomplete = () => { db.close(); resolve(data); }; tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }));
}
async function openCard(page, title) { const card = page.locator('article.card').filter({ has: page.locator('.card-title', { hasText: new RegExp('^' + title + '$') }) }); await card.getByRole('button', { name: 'Öffnen', exact: true }).click(); await page.locator('.status-line').filter({ hasText: 'Zuletzt lokal bestätigt:' }).waitFor(); }
async function save(page) { await page.getByRole('button', { name: 'Jetzt speichern', exact: true }).click(); await page.getByRole('button', { name: 'Jetzt speichern', exact: true }).waitFor({ state: 'visible' }); await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Jetzt speichern').disabled); }
async function close(page) { await page.getByRole('button', { name: 'Blatt schließen', exact: true }).click(); await page.locator('iframe').waitFor({ state: 'detached' }); }
async function pdf(page, name, expected) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF herunterladen', exact: true }).click()]);
  const path = join(output, name); await download.saveAs(path); const data = await readFile(path); assert.equal(data.subarray(0, 5).toString(), '%PDF-');
  const parsed = await PDFDocument.load(data), text = execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' });
  assert(parsed.getPageCount() >= 3); for (const value of expected) assert(text.includes(value), `PDF missing ${value}`);
  await writeFile(path + '.txt', text); return { path, bytes: data.length, pages: parsed.getPageCount(), sha256: createHash('sha256').update(data).digest('hex') };
}
async function captureApp(page) {
  const original = page.viewportSize();
  try { for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['tablet-width', { width: 820, height: 1180 }]]) {
    await page.setViewportSize(viewport); const path = join(output, `app-${name}.png`); const data = await page.screenshot({ path, fullPage: true });
    screenshots.push({ path, viewport, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), note: 'Viewport only; no physical device emulation claim' });
  } } finally { if (original) await page.setViewportSize(original); }
}
async function stage(name, work) { const start = performance.now(); await work(); results.push({ name, result: 'pass', elapsedMs: performance.now() - start }); console.log('PASS', name); }
try {
  const app = await startAppServer(0); server = app.server; origin = app.origin;
  context = await launch(false); browserVersion = context.browser().version(); context.setDefaultTimeout(7000);
  // Observe actual transaction completion and native host ACKs; no simulated storage result or product test API.
  await context.addInitScript(() => {
    if (parent !== self) return; globalThis.commitTrace = { transactions: [], messages: [] };
    const transact = IDBDatabase.prototype.transaction, add = IDBObjectStore.prototype.add, post = MessagePort.prototype.postMessage;
    const tracked = new WeakMap();
    IDBDatabase.prototype.transaction = function (...args) { const tx = Reflect.apply(transact, this, args), entry = { at: performance.now(), mode: tx.mode, writes: [], complete: null, aborted: false }; tracked.set(tx, entry); globalThis.commitTrace.transactions.push(entry); tx.addEventListener('complete', () => { entry.complete = performance.now(); }); tx.addEventListener('abort', () => { entry.aborted = true; }); return tx; };
    IDBObjectStore.prototype.add = function (...args) { if (this.name === 'revisions') tracked.get(this.transaction)?.writes.push({ instanceId: args[0].instanceId, revision: args[0].revision }); return Reflect.apply(add, this, args); };
    MessagePort.prototype.postMessage = function (...args) { if (typeof args[0] === 'string') { const x = JSON.parse(args[0]); if (x.type?.endsWith('_ACCEPTED')) globalThis.commitTrace.messages.push({ at: performance.now(), ...x }); } return Reflect.apply(post, this, args); };
  });
  let page = context.pages()[0]; await page.goto(origin); await ready(page); initialNonce = await page.locator('script[nonce]').evaluate(x => x.nonce);
  await stage(functionalStages[0], async () => {
    await prompt(page, 'Arbeitsheft hinzufügen', 'Mein Heft'); await prompt(page, 'Kapitel hinzufügen', 'Kapitel 1');
    await page.getByLabel('HTML-Arbeitsblatt auswählen').setInputFiles({ name: 'Fixture A.html', mimeType: 'text/html', buffer: Buffer.from(source) });
    await page.locator('.status-line').filter({ hasText: 'Revision 0' }).waitFor(); const frame = page.frameLocator('iframe');
    await frame.locator('#text').fill('Antwort fürs PDF <b>keine Ausführung</b>'); await frame.locator('#area').fill(notes); await frame.locator('#r2').check(); await frame.locator('#one').selectOption('b'); await frame.locator('#many').selectOption(['a', 'b']); await frame.locator('#toggle').click();
    await captureApp(page);
    lastPdf = await pdf(page, 'online-answers.pdf', ['Übung: Antworten erhalten', 'Frage: Was wurde bearbeitet?', 'Antwort fürs PDF', 'Antwortzeile 179:', 'Ja (true)', 'r2', 'a, b']);
    const data = await library(page), sheet = data.instances.find(x => x.title === 'Fixture A'); firstId = sheet.id; initialState = data.revisions.find(x => x.instanceId === firstId && x.revision === sheet.headRevision).state;
    assert.deepEqual(initialState.fields.map(x => x.value), [notes, true, 'r2', ['a', 'b'], 'b', 'Antwort fürs PDF <b>keine Ausführung</b>']);
    assert.equal(data.containers.find(x => x.title === 'Kapitel 1').parentId, data.containers.find(x => x.title === 'Mein Heft').id);
    const trace = await page.evaluate(() => globalThis.commitTrace); const ack = trace.messages.find(x => x.type === 'SNAPSHOT_ACCEPTED' && x.payload.revision === sheet.headRevision);
    assert(ack && trace.transactions.some(tx => tx.complete !== null && tx.complete <= ack.at && tx.writes.some(w => w.instanceId === firstId && w.revision === sheet.headRevision)));
    observations.online = { instanceId: firstId, revision: sheet.headRevision, state: initialState, ack, committedTransactions: trace.transactions.filter(tx => tx.complete !== null && tx.writes.some(w => w.instanceId === firstId)), pdf: lastPdf };
    await close(page);
    await page.getByLabel('HTML-Arbeitsblatt auswählen').setInputFiles({ name: 'Fixture B.html', mimeType: 'text/html', buffer: Buffer.from(sourceB) }); await page.locator('.status-line').filter({ hasText: 'Revision 0' }).waitFor();
    await page.frameLocator('iframe').locator('#answer').fill('Zweites Blatt'); await page.frameLocator('iframe').locator('#toggle').click(); await save(page); await close(page);
    assert.equal((await library(page)).instances.length, 2);
  });
  await context.close(); context = null; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); server = null;
  serverStopped = true;
  try { await fetch(origin, { signal: AbortSignal.timeout(1500) }); throw Error('Stopped server unexpectedly answered'); }
  catch (error) { if (String(error).includes('unexpectedly answered')) throw error; offlineProof.directServerRequestFailed = true; offlineProof.serverFailure = String(error.cause?.code ?? error.name); }
  await stage(functionalStages[1], async () => {
    // CDP offline:true crashes system Chromium on every blob download, including plain text controls.
    // The server is really stopped; routing is supplementary because SW-originated requests can bypass it.
    context = await launch(false); context.setDefaultTimeout(7000);
    profileRestarted = true;
    await context.route(/^https?:\/\//, async route => { offlineProof.routedHttpRequestsAborted.push(route.request().url()); await route.abort('internetdisconnected'); });
    context.on('response', response => offlineProof.responses.push({ url: response.url(), fromServiceWorker: response.fromServiceWorker(), status: response.status() }));
    page = context.pages()[0]; const response = await page.goto(origin); if (engine === 'chromium') assert(response.fromServiceWorker()); await ready(page);
    if (engine === 'chromium') assert(offlineProof.responses.some(item => item.url === origin + '/app.js' && item.fromServiceWorker));
    assert.notEqual(await page.locator('script[nonce]').evaluate(x => x.nonce), initialNonce);
    await page.getByRole('button', { name: 'Kapitel 1', exact: true }).first().click(); await openCard(page, 'Fixture A');
    const frame = page.frameLocator('iframe'); assert.equal(await frame.locator('#text').inputValue(), initialState.fields.at(-1).value); assert.equal(await frame.locator('#area').inputValue(), notes); assert(await frame.locator('#check').isChecked()); assert(await frame.locator('#r2').isChecked()); assert.equal(await frame.locator('#one').inputValue(), 'b'); assert.deepEqual(await frame.locator('#many').evaluate(x => [...x.selectedOptions].map(o => o.value)), ['a', 'b']);
    await frame.locator('#text').fill('Nach Neustart offline'); lastPdf = await pdf(page, 'offline-answers.pdf', ['Nach Neustart offline', 'Antwortzeile 179:', 'Frage: Was wurde bearbeitet?']);
    const data = await library(page), head = data.instances.find(x => x.id === firstId).headRevision; assert(head >= 2); assert(data.revisions.some(x => x.instanceId === firstId && x.revision === head - 1));
    observations.offline = { instanceId: firstId, revision: head, state: data.revisions.find(x => x.instanceId === firstId && x.revision === head).state, pdf: lastPdf };
    if (engine === 'chromium') assert(offlineProof.responses.every(item => item.fromServiceWorker), 'Unexpected network response while the server is stopped');
  });
  await stage(functionalStages[2], async () => {
    const other = await context.newPage(); await other.goto(origin); await ready(other); await other.getByRole('button', { name: 'Kapitel 1', exact: true }).first().click(); await openCard(other, 'Fixture A');
    await page.frameLocator('iframe').locator('#text').fill('Gewinner im ersten Tab'); await save(page);
    await other.frameLocator('iframe').locator('#text').fill('Ungesicherter zweiter Tab'); await other.locator('.status-line[data-kind="error"]').waitFor(); await other.locator('iframe').waitFor({ state: 'detached' });
    const before = await library(page), original = before.instances.find(x => x.id === firstId); assert.equal(before.revisions.find(x => x.instanceId === firstId && x.revision === original.headRevision).state.fields.at(-1).value, 'Gewinner im ersten Tab');
    const card = other.locator('article.card').filter({ has: other.locator('.card-title', { hasText: /^Fixture A$/ }) }); await card.getByRole('button', { name: 'Kopie erstellen', exact: true }).click();
    await other.locator('.status-line').filter({ hasText: 'Revision 0' }).waitFor(); assert.equal(await other.frameLocator('iframe').locator('#text').inputValue(), 'Ungesicherter zweiter Tab');
    await close(other); await other.close();
  });
  await stage(functionalStages[3], async () => {
    const before = await library(page), original = before.instances.find(x => x.id === firstId);
    await page.evaluate(() => { const add = IDBObjectStore.prototype.add; IDBObjectStore.prototype.add = function (...args) { if (this.name === 'revisions') { IDBObjectStore.prototype.add = add; throw new DOMException('Synthetic quota', 'QuotaExceededError'); } return Reflect.apply(add, this, args); }; });
    await page.frameLocator('iframe').locator('#text').fill('Quota-Kandidat bleibt erhalten'); await page.locator('.status-line[data-kind="error"]').waitFor(); assert.equal((await library(page)).instances.find(x => x.id === firstId).headRevision, original.headRevision);
    const card = page.locator('article.card').filter({ has: page.locator('.card-title', { hasText: /^Fixture A$/ }) }); await card.getByRole('button', { name: 'Kopie erstellen', exact: true }).click(); await page.locator('.status-line').filter({ hasText: 'Revision 0' }).waitFor(); assert.equal(await page.frameLocator('iframe').locator('#text').inputValue(), 'Quota-Kandidat bleibt erhalten');
  });
  await stage(functionalStages[4], async () => {
    const [backup] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Sicherung exportieren', exact: true }).click()]); const path = join(output, 'backup.json'); await backup.saveAs(path);
    const data = JSON.parse(await readFile(path, 'utf8')); assert.equal(data.format, 'html-worksheet-backup'); const previous = await library(page);
    await page.getByLabel('Sicherungsdatei auswählen').setInputFiles(path); await page.waitForFunction(count => document.querySelectorAll('nav.tree button').length >= count, previous.containers.length * 2 + 1);
    const after = await library(page); assert.equal(after.instances.length, previous.instances.length * 2); assert.equal(after.containers.length, previous.containers.length * 2); assert(previous.instances.every(x => after.instances.some(y => y.id === x.id && y.headRevision === x.headRevision)));
  });
} catch (error) { failure = String(error); results.push({ name: 'functional flow', result: 'fail', error: failure }); console.log('FAIL', failure); if (context) { const p = context.pages()[0]; if (p) { await p.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {}); await writeFile(join(output, 'failure-dom.html'), await p.content().catch(() => 'unavailable')); } } }
finally { await context?.close(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } await writeFile(join(output, `functional-${engine}.json`), JSON.stringify({ at: new Date().toISOString(), engine, browserVersion, selection, nodeVersion: process.version, origin, profile: failure ? profile : 'removed after success', persistentProfileRestarted: profileRestarted, serverStoppedBeforeOfflineRestart: serverStopped, offlineMethod: 'server physically stopped; direct HTTP failure; SW-served app; supplementary browser HTTP routing abort (not OS flight mode)', offlineProof, screenshots, observations, results, pdf: lastPdf }, null, 2)); if (!failure) await rm(profile, { recursive: true, force: true }); }
if (failure) process.exitCode = 1;
