import { chromium } from 'playwright';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
const bundle = await build({ entryPoints: ['apps/worksheet/test/repository-browser.ts'], bundle: true, format: 'iife', write: false, target: 'es2022' });
const server = createServer((req, res) => { if (req.url === '/repo.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); } else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><script src="/repo.js"></script>'); } });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser, result;
try { browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] }); const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForFunction(() => globalThis.repositoryTestResult, null, { timeout: 60000 }); result = { browserVersion: browser.version(), nodeVersion: process.version, results: await page.evaluate(() => globalThis.repositoryTestResult) }; }
catch (error) { result = { results: [{ name: 'harness', result: 'fail', error: String(error) }] }; }
finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await mkdir('apps/worksheet/test-results', { recursive: true }); await writeFile('apps/worksheet/test-results/repository.json', JSON.stringify(result, null, 2)); }
for (const item of result.results) console.log(item.result, item.name, item.error ?? ''); if (result.results.some(x => x.result !== 'pass')) process.exitCode = 1;
