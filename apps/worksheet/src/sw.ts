/// <reference lib="webworker" />
import { shellResponse } from './shell.ts';
declare const __APP_VERSION__: string, __SHELL_INTEGRITY__: string, __JS_INTEGRITY__: string;
const worker = globalThis as unknown as ServiceWorkerGlobalScope;
const cacheName = 'worksheet-shell-' + __APP_VERSION__;
worker.addEventListener('install', event => { event.waitUntil((async () => {
  const cache = await caches.open(cacheName);
  await cache.addAll([
    new Request(new URL('/shell-template', worker.location.origin), { cache: 'reload', integrity: __SHELL_INTEGRITY__ }),
    new Request(new URL('/app.js', worker.location.origin), { cache: 'reload', integrity: __JS_INTEGRITY__ })
  ]);
  await worker.skipWaiting();
})()); });
worker.addEventListener('activate', event => { event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith('worksheet-shell-') && name !== cacheName) await caches.delete(name);
  await worker.clients.claim();
})()); });
worker.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_STATUS' || event.ports.length !== 1) return;
  event.waitUntil((async () => { const cache = await caches.open(cacheName), ready = !!await cache.match('/shell-template') && !!await cache.match('/app.js'); event.ports[0].postMessage({ ready, version: __APP_VERSION__ }); event.ports[0].close(); })());
});
worker.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== worker.location.origin) return;
  if (event.request.mode === 'navigate' && ['/', '/index.html'].includes(url.pathname)) event.respondWith((async () => {
    const response = await (await caches.open(cacheName)).match('/shell-template'); if (!response) return new Response('Offline-Shell fehlt. Bitte einmal online öffnen.', { status: 503 });
    return shellResponse(await response.text());
  })());
  else if (url.pathname === '/app.js') event.respondWith((async () => (await (await caches.open(cacheName)).match('/app.js')) ?? new Response('App-Bundle fehlt.', { status: 503 }))());
});
