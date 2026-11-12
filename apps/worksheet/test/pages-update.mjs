import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium, webkit } from 'playwright';
import pages from '../pages.mjs';

async function buildRelease() {
  execFileSync(process.execPath, ['apps/worksheet/build.mjs']);
  const assets = new Map();
  for (const path of ['/sw.js', '/app.js', '/shell-template.txt']) {
    assets.set(path, await readFile('apps/worksheet/dist/pages' + path));
  }
  return { fetch: async url => new Response(assets.get(url.pathname), { status: assets.has(url.pathname) ? 200 : 404 }) };
}

let assets = await buildRelease();
const server = createServer(async (req, res) => {
  const result = await pages.fetch(new Request(new URL(req.url, origin), { method: req.method }), { ASSETS: assets });
  res.writeHead(result.status, Object.fromEntries(result.headers));
  res.end(Buffer.from(await result.arrayBuffer()));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
  const engine = process.env.BROWSER_ENGINE === 'webkit' ? webkit : chromium;
  browser = await engine.launch({ executablePath: process.env.BROWSER_EXECUTABLE || undefined });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const first = await page.goto(origin);
  assert.match(first.headers()['content-security-policy'], /script-src 'nonce-/);
  await page.locator('.storage-card[data-ready="true"]').waitFor();
  const version = () => page.locator('html').getAttribute('data-app-version');
  const oldVersion = await version();
  await page.getByLabel('HTML-Arbeitsblatt auswählen').setInputFiles('tests/fixtures/demo-strict-fields.html');
  await page.locator('.status-line').filter({ hasText: 'Revision 0' }).waitFor();
  await page.frameLocator('iframe').locator('#text').fill('Vor dem Update');
  assets = await buildRelease();
  await page.getByRole('button', { name: 'Nach Updates suchen' }).click();
  const reload = page.getByRole('button', { name: 'Neue Version öffnen' });
  await reload.waitFor();
  assert(await reload.isDisabled());
  assert.equal(await version(), oldVersion);
  await page.getByRole('button', { name: 'Blatt schließen' }).click();
  await reload.click();
  await page.waitForFunction(old => document.documentElement.dataset.appVersion !== old, oldVersion);
  const newVersion = await version();
  assert(newVersion > oldVersion);
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await assert.rejects(fetch(origin));
  const offline = await page.goto(origin);
  assert(offline.fromServiceWorker());
  assert.equal(await version(), newVersion);
  await page.getByRole('button', { name: 'Öffnen', exact: true }).click();
  await page.locator('.status-line').filter({ hasText: 'Zuletzt lokal bestätigt:' }).waitFor();
  assert.equal(await page.frameLocator('iframe').locator('#text').inputValue(), 'Vor dem Update');
  console.log('PASS Pages UI, update with open worksheet, offline reload and saved answer', oldVersion, newVersion);
} finally {
  await browser?.close();
  server.closeAllConnections();
  if (server.listening) await new Promise(resolve => server.close(resolve));
}
