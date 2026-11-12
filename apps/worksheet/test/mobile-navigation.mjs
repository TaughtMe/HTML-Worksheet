// New UI regression only: visible 390px quick navigation, real notebook/chapter and distinct worksheet cards.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { startAppServer } from '../server.mjs';
import { captureApp, importWorksheet } from './functional-ui.mjs';
const output = 'apps/worksheet/test-results'; await mkdir(output, { recursive: true });
const notebook = 'Navigation Heft', chapter = 'Navigation Kapitel';
const source = '<h2>Mobiles Navigationsblatt</h2><input id="answer" type="text"><input id="check" type="checkbox"><button id="toggle" type="button" data-ws-action="toggle-checkbox" data-ws-target="check">Toggle</button>';
let browser, server, result; const visits = [];
async function prompt(page, label, value) { page.once('dialog', dialog => dialog.accept(value)); await page.getByRole('button', { name: label, exact: true }).click(); }
async function addSheet(page, title) {
  await importWorksheet(page, { name: title + '.html', mimeType: 'text/html', buffer: Buffer.from(source) });
  await page.locator('.status-line').filter({ hasText: 'Revision 0' }).waitFor();
  await page.getByRole('button', { name: 'Blatt schließen', exact: true }).click(); await page.locator('iframe').waitFor({ state: 'detached' });
}
async function visit(page, buttonName, expectedTitle, expectedCards) {
  const quick = page.getByRole('navigation', { name: 'Schnellnavigation', exact: true }); await quick.waitFor({ state: 'visible' });
  const button = quick.getByRole('button', { name: buttonName, exact: true });
  // Normal Playwright click may scroll the horizontal navigation strip; never force or invoke callbacks directly.
  await button.click(); await page.getByRole('heading', { name: expectedTitle, level: 1, exact: true }).waitFor();
  assert((await button.getAttribute('class')).split(/\s+/).includes('selected'));
  const cards = (await page.locator('.card-title').allTextContents()).sort(); assert.deepEqual(cards, [...expectedCards].sort());
  visits.push({ clicked: buttonName, title: expectedTitle, cards, selected: true, horizontalNavScroll: await quick.evaluate(node => node.scrollLeft) });
}
try {
  const app = await startAppServer(0); server = app.server;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); context.setDefaultTimeout(7000);
  const page = await context.newPage(); await page.goto(app.origin);
  await prompt(page, 'Arbeitsheft hinzufügen', notebook); await page.getByRole('heading', { name: notebook, level: 1, exact: true }).waitFor();
  await addSheet(page, 'Heftblatt');
  await prompt(page, 'Kapitel hinzufügen', chapter); await page.getByRole('heading', { name: chapter, level: 1, exact: true }).waitFor();
  await addSheet(page, 'Kapitelblatt');
  await visit(page, 'Alle Arbeitsblätter', 'Alle Arbeitsblätter', [notebook]);
  await visit(page, notebook, notebook, [chapter, 'Heftblatt']);
  await visit(page, chapter, chapter, ['Kapitelblatt']);
  await page.screenshot({ path: output + '/mobile-navigation-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Öffnen', exact: true }).click();
  await page.locator('.status-line').filter({ hasText: 'Revision 0' }).waitFor();
  const screenshots = await captureApp(page, output);
  result = { result: 'pass', browserVersion: browser.version(), viewport: { width: 390, height: 844 }, visits, screenshot: output + '/mobile-navigation-390.png', screenshots, scope: 'New mobile navigation and rendered worksheet captures only; no physical device claim' };
  console.log('PASS visible mobile navigation: All -> notebook -> chapter with distinct cards');
} catch (error) { result = { result: 'fail', error: String(error), visits }; process.exitCode = 1; console.log('FAIL', String(error)); }
finally { await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } await writeFile(output + '/mobile-navigation.json', JSON.stringify(result, null, 2)); }
