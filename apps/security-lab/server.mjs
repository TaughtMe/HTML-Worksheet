import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
export const policy = n => `default-src 'none'; script-src 'nonce-${n}'; style-src 'nonce-${n}'; img-src data:; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
export function startServer(port = 4173) {
  const requests = [];
  const server = createServer(async (req, res) => {
    requests.push({ at: new Date().toISOString(), method: req.method, url: req.url, referer: req.headers.referer ?? null });
    const n = randomBytes(24).toString('base64');
    res.setHeader('Content-Security-Policy', policy(n));
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), clipboard-read=(), clipboard-write=(), fullscreen=(), payment=(), usb=(), serial=(), bluetooth=(), display-capture=(), web-share=()');
    if (req.url === '/host.js') {
      try { res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); res.end(await readFile(new URL('./dist/host.js', import.meta.url))); }
      catch { res.writeHead(503); res.end('Run npm run build first'); }
    } else if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Worksheet Sicherheitslabor</title><style nonce="${n}">body{font:16px system-ui;max-width:1000px;margin:2rem auto}iframe{width:100%;height:420px}pre{white-space:pre-wrap;overflow-wrap:anywhere}button,input{margin:.3rem}</style></head><body><h1>Worksheet Sicherheitslabor</h1><p>Nur synthetische Daten. RAM-State geht beim Schließen verloren. Keine Sicherheits- oder Produktfreigabe.</p><input id="file" type="file" accept="text/html,.html"><button id="open">Öffnen</button><button id="demo">Synthetische Demo</button><button id="checkpoint">RAM-Snapshot</button><button id="close">Schließen</button><p id="filename"></p><p id="status" role="status">Bereit</p><pre id="state"></pre><div id="runner"></div><script nonce="${n}" src="/host.js"></script></body></html>`);
    } else { res.writeHead(404); res.end('Not found'); }
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve({ server, requests, origin: `http://127.0.0.1:${server.address().port}` })); });
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { origin } = await startServer(Number(process.env.LAB_PORT || 4173)); console.log(origin);
}
