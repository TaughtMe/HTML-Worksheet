// Separate receiver process: every actual request is synchronously logged before its response.
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { png } from './policy-fixtures.mjs';
const pageHTML = '<!doctype html><html><head><link rel="icon" href="data:,"></head><body>Trusted POLICY01 control</body></html>';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sockets = new Set(), server = createServer((req, res) => {
    const hit = { at: new Date().toISOString(), method: req.method, url: req.url, referer: req.headers.referer ?? null };
    appendFileSync(process.argv[2], JSON.stringify(hit) + '\n'); process.send?.({ type: 'hit', hit });
    const parsed = new URL(req.url, 'http://receiver.invalid'), kind = parsed.searchParams.get('kind');
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Cache-Control', 'no-store');
    if (parsed.pathname === '/page') { res.setHeader('Content-Type', 'text/html'); res.end(pageHTML); }
    else if (parsed.pathname === '/control') { res.setHeader('Content-Type', 'text/plain'); res.end('control'); process.send?.({ type: 'control', path: req.url }); }
    else if (parsed.pathname === '/asset' && ['external-classic', 'external-module', 'import-http'].includes(kind)) {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(kind === 'import-http' ? 'export default "import-http"' : `globalThis.policy01.markers.push(${JSON.stringify(kind)});` + (kind === 'external-module' ? 'export default "external-module";' : ''));
    } else if (parsed.pathname === '/asset' && ['srcset', 'poster'].includes(kind)) { res.setHeader('Content-Type', 'image/png'); res.end(Buffer.from(png, 'base64')); }
    else if (parsed.pathname === '/asset' && kind === 'font-style') { res.setHeader('Content-Type', 'font/woff2'); res.end('wOF2 synthetic request probe; not a valid rendering font'); }
    else { res.writeHead(404); res.end('unknown test asset'); }
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.listen(0, '127.0.0.1', () => process.send?.({ type: 'ready', origin: `http://127.0.0.1:${server.address().port}` }));
  const close = () => { for (const socket of sockets) socket.destroy(); server.closeAllConnections(); server.close(() => process.exit(0)); };
  process.on('message', message => { if (message === 'close') close(); }); process.on('disconnect', close); process.on('SIGTERM', close);
}
export async function startPolicyReceiver(context) {
  await mkdir('apps/security-lab/test-results', { recursive: true });
  const logPath = `apps/security-lab/test-results/policy01-receiver-${randomUUID()}.jsonl`; await writeFile(logPath, '');
  const child = fork(new URL('./policy-receiver.mjs', import.meta.url), [logPath], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  const hits = [], controls = new Set(); let origin, waiter;
  child.on('message', message => {
    if (message.type === 'hit') hits.push(message.hit);
    if (message.type === 'control') { controls.add(message.path); waiter?.(); }
  });
  const exit = new Promise(resolve => child.once('close', resolve));
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
      try { if (child.connected) child.send('close', error => { if (error) child.kill('SIGTERM'); }); else child.kill('SIGTERM'); await exit; }
      finally { clearTimeout(timer); }
    }
    const fileHits = (await readFile(logPath, 'utf8')).split('\n').filter(Boolean).map(JSON.parse);
    assert.deepEqual(hits, fileHits, 'Independent receiver file/IPC mismatch'); return { origin, logPath, fileHits, ipcHits: hits };
  };
  let page;
  try {
    origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('POLICY01 receiver startup timeout')), 3000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.on('message', message => { if (message.type === 'ready') { clearTimeout(timer); resolve(message.origin); } });
    });
    page = await context.newPage(); await page.goto(origin + '/page');
    const control = async () => {
      const path = '/control?id=' + randomUUID();
      await page.evaluate(async url => { const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) throw Error('HTTP control failed'); await response.text(); }, origin + path);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiter = null; reject(Error('POLICY01 IPC control timeout')); }, 3000);
        waiter = () => { if (controls.has(path)) { clearTimeout(timer); waiter = null; resolve(); } }; waiter();
      });
      assert(hits.some(hit => hit.url === path)); return path;
    };
    const waitHit = path => new Promise((resolve, reject) => {
      const found = hits.find(hit => hit.url === path); if (found) { resolve(found); return; }
      const listener = message => { if (message.type === 'hit' && message.hit.url === path) { clearTimeout(timer); child.off('message', listener); resolve(message.hit); } };
      const timer = setTimeout(() => { child.off('message', listener); reject(Error('POLICY01 positive asset request missing: ' + path)); }, 4000);
      child.on('message', listener);
    });
    return { origin, hits, page, control, waitHit, close: async () => { await page.close(); return stop(); } };
  } catch (error) { await page?.close(); await stop(); throw error; }
}
