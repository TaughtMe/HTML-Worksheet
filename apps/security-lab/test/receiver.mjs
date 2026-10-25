// Independent process: renderer or test assertion failures cannot manufacture server hits.
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { createServer } from 'node:http';
function log(req, kind) {
  const hit = { kind, at: new Date().toISOString(), method: req.method, url: req.url, referer: req.headers.referer ?? null };
  appendFileSync(process.argv[2], JSON.stringify(hit) + '\n');
  process.send?.({ type: 'hit', hit });
}
const sockets = new Set();
const server = createServer((req, res) => {
  log(req, 'http');
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Access-Control-Allow-Origin', '*'); res.end('receiver positive');
});
server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
server.on('upgrade', (req, socket) => {
  log(req, 'websocket-upgrade');
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.on('data', () => socket.end(Buffer.from([0x88, 0])));
  socket.on('error', () => socket.destroy());
});
server.listen(0, '127.0.0.1', () => process.send?.({ type: 'ready', origin: `http://127.0.0.1:${server.address().port}` }));
function shutdown() { for (const socket of sockets) socket.destroy(); server.closeAllConnections(); server.close(() => process.exit(0)); }
process.on('message', m => { if (m === 'close') shutdown(); });
process.on('disconnect', shutdown);
process.on('SIGTERM', shutdown);
