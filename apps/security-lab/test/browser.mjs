import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium, firefox, webkit } from 'playwright';
import { startServer } from '../server.mjs';
import { checkNonemptyRestore } from './restore-harness.mjs';
const browserTypes = Object.freeze({ chromium, firefox, webkit });
const engine = process.env.BROWSER_ENGINE ?? 'chromium';
if (!Object.hasOwn(browserTypes, engine)) throw Error('BROWSER_ENGINE must be chromium, firefox or webkit');
const launchOptions = { headless: true };
if (engine === 'chromium') {
  launchOptions.args = ['--no-sandbox'];
  if (process.env.CHROMIUM_PATH !== undefined) {
    if (!process.env.CHROMIUM_PATH) throw Error('CHROMIUM_PATH must be a nonempty executable path');
    launchOptions.executablePath = process.env.CHROMIUM_PATH;
  } else if (existsSync('/usr/bin/chromium')) launchOptions.executablePath = '/usr/bin/chromium';
}
const results = [], hits = [], fixtures = [], browserEvents = [], violations = [];
const runId = randomUUID();
await mkdir('apps/security-lab/test-results', { recursive: true });
const receiverLog = `apps/security-lab/test-results/receiver-${engine}-${runId}.jsonl`;
await writeFile(receiverLog, '');
let receiver, server, origin, receiverOrigin, browser;
let requests = [];
const wait = ms => new Promise(r => setTimeout(r, ms));
async function record(name, fn) {
  try { const detail = await fn(); results.push({ name, result: 'pass', detail }); console.log('PASS', name); }
  catch (error) { results.push({ name, result: 'fail', error: String(error) }); console.log('FAIL', name, String(error)); }
}
try {
  receiver = fork(new URL('./receiver.mjs', import.meta.url), [receiverLog], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  receiver.on('message', m => { if (m.type === 'hit') hits.push(m.hit); });
  receiverOrigin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Receiver startup timeout')), 3000);
    receiver.on('message', m => { if (m.type === 'ready') { clearTimeout(timer); resolve(m.origin); } });
  });
  ({ server, origin, requests } = await startServer(0));

  browser = await browserTypes[engine].launch(launchOptions);
  const context = await browser.newContext({ acceptDownloads: true });
  context.setDefaultTimeout(4000);
  const page = await context.newPage();
  page.on('request', r => browserEvents.push({ type: 'request', url: r.url(), method: r.method() }));
  page.on('framenavigated', f => browserEvents.push({ type: 'navigation', url: f.url() }));
  page.on('console', m => { if (m.type() === 'error') violations.push(m.text()); });
  async function load(html, filename = 'synthetic.html') {
    fixtures.push({ filename, sha256: createHash('sha256').update(html).digest('hex') });
    await page.goto(origin);
    await page.locator('#file').setInputFiles({ name: filename, mimeType: 'text/html', buffer: Buffer.isBuffer(html) ? html : Buffer.from(html) });
    await page.locator('#open').click();
  }
  async function control(caseId) {
    const before = hits.length, path = `/control?run=${runId}&case=${caseId}&control=${randomUUID()}`;
    const p = await context.newPage();
    try {
      await p.evaluate(async url => { const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) throw Error('HTTP control failed'); await response.text(); }, receiverOrigin + path);
    } finally { await p.close(); }
    await wait(40); assert(hits.slice(before).some(h => h.url === path), 'Receiver positive control missing');
    return path;
  }
  async function websocketControl(caseId) {
    const before = hits.length, path = `/ws-control?run=${runId}&case=${caseId}&control=${randomUUID()}`;
    const p = await context.newPage();
    await p.evaluate(url => new Promise((resolve, reject) => {
      const ws = new WebSocket(url), timer = setTimeout(() => { ws.close(); reject(Error('WS control timeout')); }, 2000);
      ws.onopen = () => { clearTimeout(timer); ws.close(); resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(Error('WS control error')); };
    }), receiverOrigin.replace('http:', 'ws:') + path);
    await p.close(); await wait(40);
    assert(hits.slice(before).some(h => h.url === path && h.kind === 'websocket-upgrade'), 'WS receiver positive control missing');
    return path;
  }
  async function active() { await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('active'), null, { timeout: 4000 }); }
  await record('independent receiver positive control', async () => {
    await control('suite-before'); return { receiverOrigin };
  });
  await record('host CSP header fresh nonce and strict sources', async () => {
    const a = await page.goto(origin); const ca = a.headers()['content-security-policy']; const b = await page.goto(origin); const cb = b.headers()['content-security-policy'];
    assert.notEqual(ca, cb); assert(ca.includes("frame-src 'none'")); assert(!ca.includes('unsafe-inline')); return ca;
  });
  await record('allowed JS and five standard field kinds capture and checkpoint', async () => {
    await load('<input id="text"><textarea id="area"></textarea><input id="check" type="checkbox"><fieldset id="group" data-ws-radio-group><input id="r1" name="group" type="radio"><input id="r2" name="group" type="radio"></fieldset><select id="one"><option value="a">A</option><option value="b">B</option></select><select id="many" multiple><option value="a">A</option><option value="b">B</option></select><button id="go">JS</button><output id="result"></output><script>document.getElementById("go").addEventListener("click",()=>document.getElementById("result").textContent="positive-script")</script>');
    await active(); const f = page.frameLocator('iframe');
    assert.equal(await f.locator('#one').evaluate(e => e.selectedIndex), -1);
    await f.locator('#go').click(); assert.equal(await f.locator('#result').textContent(), 'positive-script');
    await f.locator('#text').fill('<b>Antwort</b>'); await f.locator('#area').fill('synthetic'); await f.locator('#check').check(); await f.locator('#r2').check(); await f.locator('#one').selectOption('b'); await f.locator('#many').selectOption(['a', 'b']);
    await page.waitForFunction(() => document.getElementById('state').textContent.includes('Antwort'));
    await page.locator('#checkpoint').click(); await page.waitForFunction(() => document.getElementById('status').textContent.includes('Snapshot bestätigt'));
    const state = JSON.parse(await page.locator('#state').textContent());
    assert.equal(state.durability, 'memory'); assert.equal(state.state.fields.find(f => f.id === 'text').value, '<b>Antwort</b>');
    assert.equal(state.state.fields.find(f => f.id === 'area').value, 'synthetic');
    assert.equal(state.state.fields.find(f => f.id === 'check').value, true);
    assert.equal(state.state.fields.find(f => f.id === 'group').value, 'r2');
    assert.equal(state.state.fields.find(f => f.id === 'one').value, 'b');
    assert.deepEqual(state.state.fields.find(f => f.id === 'many').value, ['a', 'b']);
    assert.equal(await page.locator('#state b').count(), 0); return state;
  });
  await record('nonempty restore sets every standard field without synthetic events', () => checkNonemptyRestore(context, origin));
  await record('native form reset updates RAM after acknowledged input', async () => {
    await load('<form><input id="x"><button id="reset" type="reset">Reset</button></form>'); await active();
    await page.frameLocator('iframe').locator('#x').fill('synthetic before reset');
    await page.waitForFunction(() => document.getElementById('state').textContent.includes('synthetic before reset'));
    await page.frameLocator('iframe').locator('#reset').click();
    await page.waitForFunction(() => JSON.parse(document.getElementById('state').textContent).state.fields[0].value === '');
  });
  await record('dynamic split radio form ownership becomes incompatible', async () => {
    await load('<form id="f1"></form><form id="f2"></form><fieldset id="g" data-ws-radio-group><input id="r1" name="g" type="radio"><input id="r2" name="g" type="radio"></fieldset><button id="mutate">Mutate</button><script>document.getElementById("mutate").addEventListener("click",()=>{document.getElementById("r1").setAttribute("form","f1");document.getElementById("r2").setAttribute("form","f2");document.getElementById("r1").dispatchEvent(new Event("change",{bubbles:true}))})</script>'); await active();
    await page.frameLocator('iframe').locator('#mutate').click();
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('ADAPTER_ERROR'));
  });
  await record('import size and invalid UTF8 reject in browser', async () => {
    await load(Buffer.alloc(2097153, 65)); await page.waitForFunction(() => document.getElementById('status').textContent === 'IMPORT_REJECTED');
    await load(Buffer.from([0xc3, 0x28])); await page.waitForFunction(() => document.getElementById('status').textContent === 'IMPORT_REJECTED');
  });
  await record('host filename XSS remains text', async () => {
    await load('<input id="x">', '<img src=x onerror=globalThis.hostXss=1>.html'); await active();
    assert.equal(await page.evaluate(() => globalThis.hostXss), undefined); assert.equal(await page.locator('#filename img').count(), 0);
  });
  await record('malformed HTML cannot displace fixed policy bootstrap', async () => {
    await load('</head></body><input id="x"><script>document.getElementById("x").value="positive-malformed"</script>'); await active();
    const frame = page.frames()[1]; const prefix = await frame.evaluate(() => [...document.head.children].slice(0, 3).map(e => e.tagName));
    assert.deepEqual(prefix, ['META', 'META', 'SCRIPT']);
  });
  await record('opaque parent DOM and storage isolation; privileged host control', async () => {
    await load('<output id="result"></output><script>let a=[];for(const f of [()=>parent.document.body,()=>localStorage.setItem("probe","1"),()=>indexedDB.open("probe")]){try{f();a.push("allowed")}catch(e){a.push(e.name)}}document.getElementById("result").textContent=a.join(",")</script>'); await active();
    const value = await page.frameLocator('iframe').locator('#result').textContent(); assert.equal(value, 'SecurityError,SecurityError,SecurityError');
    assert.equal(await page.evaluate(() => { localStorage.setItem('positive-host-control', '1'); return localStorage.getItem('positive-host-control'); }), '1'); return value;
  });
  await record('window message spoof cannot change state', async () => {
    await load('<input id="x"><script>parent.postMessage({v:1,type:"READY",sessionId:"00000000000000000000000000000000"},"*")</script>'); await active();
    assert.equal(JSON.parse(await page.locator('#state').textContent()).revision, 0);
  });
  for (const attack of ['wrong-version', 'wrong-session', 'oversized', 'object', 'replay']) await record(`port rejects ${attack}`, async () => {
    const mutation = attack === 'wrong-version' ? 'v:2' : attack === 'wrong-session' ? 'sessionId:"0".repeat(32)' : attack === 'replay' ? 'seq:1' : 'v:1';
    const data = attack === 'oversized' ? '"x".repeat(393217)' : attack === 'object' ? '{}' : `JSON.stringify({v:1,sessionId:e.data.sessionId,seq:3,type:"READY",payload:{adapterId:"standard-fields",adapterVersion:1},${mutation}})`;
    await load(`<input id="x"><script>addEventListener("message",e=>{if(e.data.type==="INIT")setTimeout(()=>e.ports[0].postMessage(${data}),100)})</script>`);
    await page.waitForFunction(() => document.getElementById('status').textContent.includes('PROTOCOL'), null, { timeout: 4000 }); assert.equal(await page.locator('iframe').count(), 0);
  });
  await record('dynamic network sinks produce no receiver request with positive script control', async () => {
    await control('network-before'); await websocketControl('network-before'); const start = hits.length;
    const target = `${receiverOrigin}/blocked?run=${runId}`;
    await load(`<output id="result"></output><script>const u=${JSON.stringify(target)};document.getElementById("result").textContent="network-script-ran";fetch(u).catch(()=>{});try{const x=new XMLHttpRequest();x.open("GET",u+"?xhr");x.send()}catch{};navigator.sendBeacon(u+"?beacon","synthetic");new Image().src=u+"?image";for(const [tag,attr] of [["script","src"],["iframe","src"],["object","data"],["video","src"],["audio","src"],["link","href"]]){const e=document.createElement(tag);if(tag==="link")e.rel="prefetch";e[attr]=u+"?"+tag;if(tag==="script")e.nonce=document.querySelector("script[nonce]").nonce;document.body.append(e)}const s=document.createElement("style");s.nonce=document.querySelector("script[nonce]").nonce;s.textContent="@import url('"+u+"?css');body{background-image:url('"+u+"?background')}";document.head.append(s);try{new WebSocket(u.replace("http:","ws:"))}catch{};try{new EventSource(u+"?eventsource")}catch{};</script>`);
    await active(); assert.equal(await page.frameLocator('iframe').locator('#result').textContent(), 'network-script-ran'); await wait(3000);
    const afterHttp = await control('network-after'), afterWs = await websocketControl('network-after');
    const observed = hits.slice(start).filter(h => ![afterHttp, afterWs].includes(h.url));
    assert.deepEqual(observed, []); return { cspErrors: violations.length };
  });
  await record('eval and inline handlers remain denied with allowed classic script', async () => {
    await load('<output id="result"></output><button id="handler">handler</button><script>let blocked=false;try{eval("globalThis.evalEscaped=1")}catch{blocked=true}document.getElementById("handler").setAttribute("onclick","globalThis.handlerEscaped=1");document.getElementById("result").textContent=blocked?"eval-blocked":"eval-ran"</script>'); await active();
    await page.frameLocator('iframe').locator('#handler').click();
    const f = page.frames()[1]; assert.equal(await f.locator('#result').textContent(), 'eval-blocked');
    assert.deepEqual(await f.evaluate(() => [globalThis.evalEscaped ?? null, globalThis.handlerEscaped ?? null]), [null, null]);
  });
  await record('trusted popup and blob download instrumentation controls', async () => {
    const p = await context.newPage();
    try {
      await p.setContent('<button id="popup">Popup</button><button id="download">Download</button>');
      await p.evaluate(() => {
        document.getElementById('popup').onclick = () => window.open('about:blank');
        document.getElementById('download').onclick = () => {
          const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['synthetic control'])); a.download = 'synthetic-control.txt'; a.click();
        };
      });
      const popup = p.waitForEvent('popup'); await p.locator('#popup').click(); await (await popup).close();
      const download = p.waitForEvent('download'); await p.locator('#download').click(); await (await download).delete();
    } finally { await p.close(); }
  });
  const sandboxActions = {
    popup: 'window.open(u)',
    'external-download-link': 'const a=document.createElement("a");a.href=u;a.download="synthetic.txt";a.click()',
    'blob-download': 'const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["synthetic"]));a.download="synthetic.txt";a.click()',
    form: 'const f=document.createElement("form");f.action=u;document.body.append(f);f.submit()',
    top: 'try{top.location=u}catch{}',
  };
  for (const [action, code] of Object.entries(sandboxActions)) await record(`sandbox ${action} blocks network popup and download effects with click`, async () => {
    await control(`sandbox-${action}-before`); const start = hits.length;
    const target = `${receiverOrigin}/sandbox?run=${runId}&action=${action}`;
    // Each action has its own runner. A denied navigation may replace that runner with an error document.
    await load(`<button id="act">${action}</button><output id="result"></output><script>const u=${JSON.stringify(target)};document.getElementById("result").textContent="sandbox-script-ran";document.getElementById("act").addEventListener("click",()=>{${code}})</script>`); await active();
    let downloads = 0, popups = 0;
    const onDownload = () => downloads++, onPopup = () => popups++;
    page.on('download', onDownload); page.on('popup', onPopup);
    try {
      const f = page.frameLocator('iframe'); assert.equal(await f.locator('#result').textContent(), 'sandbox-script-ran');
      await f.locator('#act').click(); await wait(3000);
      const after = await control(`sandbox-${action}-after`);
      const observed = hits.slice(start).filter(h => h.url !== after);
      assert.deepEqual(observed, []); assert.equal(downloads, 0); assert.equal(popups, 0); assert.equal(page.url(), origin + '/');
      return { action, receiverHits: observed, downloads, popups, status: await page.locator('#status').textContent(), frameUrls: page.frames().slice(1).map(f => f.url()) };
    } finally { page.off('download', onDownload); page.off('popup', onPopup); }
  });
  for (const targetKind of ['receiver', 'host']) await record(`self navigation blocked before request to ${targetKind}`, async () => {
    const target = targetKind === 'receiver' ? `${receiverOrigin}/self-navigation?synthetic=1` : `${origin}/self-navigation?synthetic=1`;
    await control(`navigation-${targetKind}-before`);
    const startHits = hits.length, startHost = requests.length;
    await load(`<output id="result"></output><script>document.getElementById("result").textContent="navigation-script-ran";setTimeout(()=>{location.href=${JSON.stringify(target)}},200)</script>`);
    await active(); assert.equal(await page.frameLocator('iframe').locator('#result').textContent(), 'navigation-script-ran'); await wait(10000);
    const after = await control(`navigation-${targetKind}-after`);
    const receiverHits = hits.slice(startHits).filter(h => h.url !== after), hostHits = requests.slice(startHost).filter(x => x.url.startsWith('/self-navigation'));
    assert.deepEqual({ receiverHits, hostHits }, { receiverHits: [], hostHits: [] }); return { receiverHits, hostHits };
  });
  await record('receiver positive control after attacks', async () => {
    await control('suite-after');
  });
  await record('new session cannot inherit prior RAM state', async () => {
    await load('<input id="x">'); await active(); await page.frameLocator('iframe').locator('#x').fill('old synthetic');
    await page.waitForFunction(() => document.getElementById('state').textContent.includes('old synthetic'));
    await page.locator('#close').click(); await page.locator('#demo').click(); await active();
    assert(!(await page.locator('#state').textContent()).includes('old synthetic'));
  });
  await context.close();
} catch (error) {
  results.push({ name: 'harness startup/runtime', result: 'fail', error: String(error) });
} finally {
  const browserVersion = browser ? browser.version() : 'unavailable';
  const cleanup = [
    () => browser?.close(),
    () => server && new Promise((resolve, reject) => {
      server.closeAllConnections(); server.close(error => error ? reject(error) : resolve());
    }),
    () => receiver && new Promise(resolve => {
      if (receiver.exitCode !== null || receiver.signalCode !== null) { resolve(); return; }
      const terminate = setTimeout(() => receiver.kill('SIGTERM'), 1000);
      const kill = setTimeout(() => receiver.kill('SIGKILL'), 2000);
      receiver.once('close', () => { clearTimeout(terminate); clearTimeout(kill); resolve(); });
      if (receiver.connected) receiver.send('close', error => { if (error) receiver.kill('SIGTERM'); });
      else receiver.kill('SIGTERM');
    }),
  ];
  for (const close of cleanup) {
    try { await close(); } catch (error) { results.push({ name: 'harness cleanup', result: 'fail', error: String(error) }); }
  }
  // Receiver writes synchronously before responding. Read its independent log after process exit.
  const receiverFileHits = (await readFile(receiverLog, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line));
  if (JSON.stringify(receiverFileHits) !== JSON.stringify(hits)) results.push({ name: 'receiver file and IPC evidence agree', result: 'fail' });
  await mkdir('apps/security-lab/test-results', { recursive: true });
  await writeFile(`apps/security-lab/test-results/${engine}.json`, JSON.stringify({ at: new Date().toISOString(), engine, browserVersion, policy: 'ADR0001-srcdoc', receiverLog, runId, fixtures, browserEvents, violations, results, hits, receiverFileHits, hostRequests: requests }, null, 2));
}
if (results.some(r => r.result === 'fail')) process.exitCode = 1;
