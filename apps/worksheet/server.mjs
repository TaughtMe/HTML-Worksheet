import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { shellResponse } from './src/shell.ts';
export async function startAppServer(port = 4174) {
  const paths = new Map([['/app.js', 'app.js'], ['/sw.js', 'sw.js'], ['/shell-template', 'shell-template']]);
  const files = new Map(); for (const [path, name] of paths) files.set(path, await readFile(new URL('./dist/' + name, import.meta.url)));
  const requests = [], server = createServer(async (req, res) => {
    requests.push({ method: req.method, url: req.url }); const path = new URL(req.url, 'http://app.invalid').pathname;
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Cache-Control', 'no-store');
    if (path === '/' || path === '/index.html') { const response = shellResponse(files.get('/shell-template').toString('utf8')); for (const [key, value] of response.headers) res.setHeader(key, value); res.end(await response.text()); }
    else if (files.has(path)) { res.setHeader('Content-Type', path === '/shell-template' ? 'text/plain; charset=utf-8' : 'text/javascript; charset=utf-8'); if (path === '/sw.js') { res.setHeader('Service-Worker-Allowed', '/'); res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'; worker-src 'none'"); } res.end(files.get(path)); }
    else { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); return { server, requests, origin: `http://127.0.0.1:${server.address().port}` };
}
if (process.argv[1] === new URL(import.meta.url).pathname) { const { origin } = await startAppServer(Number(process.env.APP_PORT || 4174)); console.log(origin); }
