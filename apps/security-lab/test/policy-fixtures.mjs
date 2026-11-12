import { normalizeStrict } from '../src/strict-import.ts';
export const policyCases = Object.freeze(['admission', 'final-policy', 'loaders', 'resources']);
export const policySource = '<input id="answer" type="text"><input id="check" type="checkbox"><button id="toggle" type="button" data-ws-action="toggle-checkbox" data-ws-target="check">Toggle</button>';
export const inlineKinds = Object.freeze(['classic-no-nonce', 'classic-wrong-nonce', 'module-no-nonce', 'module-wrong-nonce', 'inline-handler', 'eval', 'function']);
export const loaderKinds = Object.freeze(['external-classic', 'external-module', 'blob-script', 'data-script', 'import-http', 'import-blob', 'import-data', 'worker-blob']);
export const resourceKinds = Object.freeze(['srcset', 'data-image', 'poster', 'font-style']);
export const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
export const admissions = Object.freeze([
  ['inline-module', '<script type="module">globalThis.unexpected=1</script>'],
  ['module-url', '<script type="module" src="https://example.invalid/module.js"></script>'],
  ['blob-script', '<script src="blob:https://example.invalid/synthetic"></script>'],
  ['data-script', '<script src="data:text/javascript,globalThis.unexpected=1"></script>'],
  ['worker-source', '<script>new Worker("data:text/javascript,postMessage(1)")</script>'],
  ['weaker-meta', '<meta http-equiv="Content-Security-Policy" content="script-src * \'unsafe-inline\' \'unsafe-eval\'">'],
  ['srcset', '<img srcset="https://example.invalid/image.png 1x">'],
  ['font', '<style>@font-face{font-family:x;src:url(https://example.invalid/font.woff2)}</style>'],
  ['poster', '<video poster="https://example.invalid/poster.png"></video>'],
  ['anchor-ping', '<a href="#" ping="https://example.invalid/ping">ping</a>'],
  ['prefetch', '<link rel="prefetch" href="https://example.invalid/prefetch">'],
  ['preload', '<link rel="preload" as="script" href="https://example.invalid/preload.js">'],
  ['modulepreload', '<link rel="modulepreload" href="https://example.invalid/module.js">'],
  ['source-nonce', '<p nonce="attacker">nonce</p>']
].map(([id, extra]) => ({ id, source: policySource + extra })));
normalizeStrict(policySource); // The shared source itself must be admitted.

// Installed as an actual nonce-bearing script. Sinks execute from later normal timer tasks, never debugger eval.
export function installPolicyController(config) {
  const e = globalThis.policy01 = { attempts: [], markers: [], errors: [], violations: [], urls: [], workers: [], installed: true };
  const mark = kind => e.markers.push(kind);
  const payload = kind => `globalThis.policy01.markers.push(${JSON.stringify(kind)})`;
  const asset = kind => `${config.receiver}/asset?kind=${kind}&phase=${config.phase}`;
  const url = (code, mime = 'text/javascript') => { const value = URL.createObjectURL(new Blob([code], { type: mime })); e.urls.push(value); return value; };
  const script = (kind, code, src) => {
    const element = document.createElement('script');
    if (kind.includes('module')) element.type = 'module';
    if (config.positive || !kind.endsWith('no-nonce') && !kind.endsWith('wrong-nonce')) element.nonce = config.nonce;
    else if (kind.endsWith('wrong-nonce')) element.nonce = 'policy01-wrong-nonce';
    element.onerror = () => e.errors.push({ kind, error: 'script-error' });
    if (src) element.src = src; else element.textContent = code;
    document.head.append(element);
  };
  addEventListener('securitypolicyviolation', event => e.violations.push({ kind: e.current, at: performance.now(), effectiveDirective: event.effectiveDirective,
    blockedURI: event.blockedURI, originalPolicy: event.originalPolicy, disposition: event.disposition }));
  addEventListener('policy01-start', event => setTimeout(() => {
    const kind = event.detail; e.current = kind; e.attempts.push({ kind, at: performance.now() });
    try {
      if (/^(classic|module)-(no|wrong)-nonce$/.test(kind)) script(kind, payload(kind));
      else if (kind === 'inline-handler') { const element = document.createElement('p'); element.dataset.policyHandler = ''; element.textContent = 'Synthetic handler'; element.setAttribute('onclick', payload(kind)); document.body.append(element); }
      else if (kind === 'eval') { eval(payload(kind)); }
      else if (kind === 'function') { Function(payload(kind))(); }
      else if (kind === 'external-classic' || kind === 'external-module') script(kind, null, asset(kind));
      else if (kind === 'blob-script') script(kind, null, url(payload(kind)));
      else if (kind === 'data-script') script(kind, null, 'data:text/javascript,' + encodeURIComponent(payload(kind)));
      else if (kind.startsWith('import-')) {
        const code = `export default ${JSON.stringify(kind)}`;
        const target = kind === 'import-http' ? asset(kind) : kind === 'import-blob' ? url(code) : 'data:text/javascript,' + encodeURIComponent(code);
        import(target).then(module => { if (module.default !== kind) throw Error('Wrong module marker'); mark(kind); }, error => e.errors.push({ kind, error: error.name }));
      } else if (kind === 'worker-blob') { const worker = new Worker(url(`postMessage(${JSON.stringify(kind)})`)); e.workers.push(worker); worker.onmessage = event => { if (event.data === kind) mark(kind); }; worker.onerror = () => e.errors.push({ kind, error: 'worker-error' }); }
      else if (kind === 'srcset' || kind === 'data-image') { const element = new Image(); element.onload = () => mark(kind); element.onerror = () => e.errors.push({ kind, error: 'image-error' }); if (kind === 'srcset') element.srcset = asset(kind) + ' 1x'; else element.src = 'data:image/png;base64,' + config.png; document.body.append(element); }
      else if (kind === 'poster') { const element = document.createElement('video'); element.poster = asset(kind); document.body.append(element); }
      else if (kind === 'font-style') {
        const element = document.createElement('style'); element.nonce = config.nonce;
        element.textContent = `@font-face{font-family:Policy01;src:url("${asset(kind)}") format("woff2")}span[data-policy-font]{font-family:Policy01;--policy01-font-marker:applied}`;
        document.head.append(element); const text = document.createElement('span'); text.dataset.policyFont = ''; text.textContent = 'synthetic'; document.body.append(text);
        document.fonts.load('16px Policy01', 'synthetic').catch(error => e.errors.push({ kind, error: error.name }));
      } else throw Error('Unknown policy sink');
    } catch (error) { e.errors.push({ kind, error: error.name }); }
  }, 0));
  e.cleanup = () => { for (const worker of e.workers) worker.terminate(); for (const value of e.urls) URL.revokeObjectURL(value); };
}
