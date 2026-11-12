import { shellResponse } from './src/shell.ts';

// Pages Advanced Mode. Only the built classroom app is reachable on this origin.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    const document = url.pathname === '/' || url.pathname === '/index.html';
    const template = document || url.pathname === '/shell-template';
    const worker = url.pathname === '/sw.js';
    if (!template && !worker && url.pathname !== '/app.js') return new Response(null, { status: 404 });
    const asset = await env.ASSETS.fetch(new URL(template ? '/shell-template.txt' : url.pathname, url.origin));
    if (asset.status !== 200) return new Response('App-Datei fehlt.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    let response;
    if (document) {
      response = shellResponse(await asset.text());
    } else {
      const headers = {
        'Content-Type': template ? 'text/plain; charset=utf-8' : 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff'
      };
      if (worker) {
        headers['Service-Worker-Allowed'] = '/';
        headers['Content-Security-Policy'] = "default-src 'none'; script-src 'self'; connect-src 'self'; worker-src 'none'";
      }
      response = new Response(asset.body, { headers });
    }
    return request.method === 'HEAD' ? new Response(null, { headers: response.headers }) : response;
  }
};
