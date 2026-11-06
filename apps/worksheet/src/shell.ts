export function appPolicy(nonce: string): string {
  return `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src data:; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
}
export function shellHeaders(nonce: string): Record<string, string> {
  return { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': appPolicy(nonce), 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), clipboard-read=(), clipboard-write=(), fullscreen=(), payment=(), usb=(), serial=(), bluetooth=(), display-capture=(), web-share=(self)' };
}
export function shellResponse(template: string): Response {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))));
  return new Response(template.replaceAll('__APP_NONCE__', nonce), { headers: shellHeaders(nonce) });
}
