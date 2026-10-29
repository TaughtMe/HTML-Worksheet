import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium, firefox, webkit } from 'playwright';
import { startServer } from '../server.mjs';
import { CASES, ALLOCATION_BYTES, engine, launchOptions } from './resource-config.mjs';
import { pause } from './resource-process.mjs';
const caseId = process.argv[2];
if (!Object.hasOwn(CASES, caseId)) throw Error('Unknown S10 worker case');
const send = value => { if (process.connected) process.send(value); };
let browserServer, browser, server, result, closing = false, crashed = false, attackStarted = false, allocationDone = false;
const observations = [];
async function probe(label, action, timeout = 1500) {
  const start = performance.now(); let timer;
  try { await Promise.race([action(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('UI probe deadline')), timeout); })]);
    const item = { label, responsive: true, elapsedMs: Math.round(performance.now() - start) }; observations.push(item); send({ type: 'ui-probe', ...item }); return item;
  } catch (error) { const item = { label, responsive: false, elapsedMs: Math.round(performance.now() - start), error: String(error).slice(0, 1000) }; observations.push(item); send({ type: 'ui-probe', ...item }); return item;
  } finally { clearTimeout(timer); }
}
function portTemplate(capture = false) {
  // The worksheet shares the adapter realm and can replace its port handler: this is intentional attack code.
  return `<input id="x"><script>
  addEventListener('message',e=>{if(e.data?.type!=='INIT')return;const port=e.ports[0],sid=e.data.sessionId;let seq=2,change=0,rev=0,pending;
    const state=value=>({schemaVersion:1,fields:[{id:'x',kind:'text',value}]});
    const sendChange=(value,base)=>port.postMessage(JSON.stringify({v:1,sessionId:sid,seq:++seq,type:'STATE_CHANGED',payload:{changeId:++change,baseRevision:base,state:state(value)}}));
    port.onmessage=m=>{const x=JSON.parse(m.data);
      if(x.type==='RESTORE_STATE'){port.postMessage(JSON.stringify({v:1,sessionId:sid,seq:2,type:'RESTORED',payload:{requestId:1,revision:x.payload.revision}}));
        ${capture ? "parent.postMessage({type:'S10_PORT_CAPTURE',sid},'*',[port]);" : "console.log('S10:'+JSON.stringify({type:'fixture-ready'}));"}
      }else if(x.type==='STATE_ACCEPTED'){rev=x.payload.revision;console.log('S10:'+JSON.stringify({type:'ack',revision:rev}));pending?.();pending=null;}
    };
    globalThis.s10One=value=>new Promise(resolve=>{pending=resolve;sendChange(value,rev)});
    globalThis.s10Flood=()=>{console.log('S10:'+JSON.stringify({type:'attack-started',kind:'flood'}));for(let i=0;i<1000;i++)sendChange('flood-'+i,i);console.log('S10:'+JSON.stringify({type:'flood-sent',count:1000}));};
  });</script>`;
}
try {
  ({ server, origin: globalThis.s10Origin } = await startServer(0));
  const type = { chromium, firefox, webkit }[engine];
  browserServer = await type.launchServer(launchOptions());
  send({ type: 'browser-pid', pid: browserServer.process().pid });
  browser = await type.connect(browserServer.wsEndpoint(), { timeout: 5000 });
  send({ type: 'browser-ready', engine, version: browser.version() });
  browser.on('disconnected', () => { if (!closing) { crashed = true; send({ type: 'browser-disconnected' }); } });
  const context = await browser.newContext(); context.setDefaultTimeout(2000); context.setDefaultNavigationTimeout(3000);
  const page = await context.newPage();
  page.on('crash', () => { crashed = true; send({ type: 'page-crash' }); });
  page.on('console', message => {
    const text = message.text(); if (!text.startsWith('S10:') || text.length > 2048) return;
    try { const event = JSON.parse(text.slice(4)); if (event.type === 'attack-started') attackStarted = true; if (event.type === 'allocation-done' && event.bytes === ALLOCATION_BYTES) allocationDone = true; send(event); } catch { /* non-protocol console text */ }
  });
  await page.goto(globalThis.s10Origin);
  const hostState = () => page.locator('#state').textContent().then(text => JSON.parse(text));
  async function active() { await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('active'), null, { timeout: 4000 }); }
  async function open(html) {
    send({ type: 'fixture', sha256: createHash('sha256').update(html).digest('hex') });
    await page.locator('#file').setInputFiles({ name: 's10-synthetic.html', mimeType: 'text/html', buffer: Buffer.from(html) });
    const start = performance.now(); await page.locator('#open').click(); await active(); return Math.round(performance.now() - start);
  }
  async function recovery() {
    await page.locator('#demo').click(); await active();
    await page.frameLocator('iframe').locator('#calculate').click(); assert.equal(await page.frameLocator('iframe').locator('#result').textContent(), 'JS funktioniert');
    await page.frameLocator('iframe').locator('#answer').fill('synthetic recovery');
    await page.waitForFunction(() => document.getElementById('state').textContent.includes('synthetic recovery'));
    const close = await probe('user close', () => page.locator('#close').click()); assert(close.responsive);
    assert.equal(await page.locator('iframe').count(), 0);
    await page.locator('#demo').click(); await active();
    assert.equal((await hostState()).revision, 0); assert.equal(await page.frameLocator('iframe').locator('#answer').inputValue(), '');
  }
  if (caseId === 'recovery') {
    await recovery(); result = { verdict: 'pass', classification: 'fresh-browser-and-reopen-confirmed' };
  } else if (caseId === 'flood') {
    // Retain the real runner endpoint in the test host, so its sender survives the expected frame revocation.
    // Queueing in the host event loop also lets the complete 1,000-message batch finish before H handles it.
    await page.evaluate(() => {
      globalThis.s10FloodEndpoint = null; globalThis.s10FloodAcks = 0;
      addEventListener('message', e => {
        if (e.data?.type !== 'S10_PORT_CAPTURE' || e.source !== document.querySelector('iframe')?.contentWindow || e.ports.length !== 1) return;
        const port = e.ports[0]; globalThis.s10FloodEndpoint = { port, sid: e.data.sid };
        port.onmessage = message => { const x = JSON.parse(message.data); if (x.type === 'STATE_ACCEPTED') s10FloodAcks++; }; port.start();
      });
    });
    await open(portTemplate(true)); await page.waitForFunction(() => !!globalThis.s10FloodEndpoint); await pause(300);
    const started = performance.now();
    const sent = await page.evaluate(() => {
      const { port, sid } = s10FloodEndpoint; let count = 0;
      for (let i = 0; i < 1000; i++) {
        port.postMessage(JSON.stringify({ v: 1, sessionId: sid, seq: i + 3, type: 'STATE_CHANGED', payload: { changeId: i + 1, baseRevision: i, state: { schemaVersion: 1, fields: [{ id: 'x', kind: 'text', value: `flood-${i}` }] } } })); count++;
      }
      return count;
    });
    assert.equal(sent, 1000); attackStarted = true;
    send({ type: 'attack-started', kind: 'flood', sender: 'retained-real-runner-endpoint' }); send({ type: 'flood-sent', count: sent });
    await page.waitForFunction(() => document.getElementById('status').textContent === 'closed · PROTOCOL');
    const closeMs = Math.round(performance.now() - started), frameCount = await page.locator('iframe').count(); assert.equal(frameCount, 0);
    await page.waitForFunction(() => s10FloodAcks > 0);
    const acknowledged = await page.evaluate(() => s10FloodAcks); assert(acknowledged < sent);
    const revocation = { status: await page.locator('#status').textContent(), frameCount };
    send({ type: 'flood-revocation', sent, acknowledged, ...revocation });
    await page.evaluate(() => { s10FloodEndpoint.port.close(); s10FloodEndpoint = null; });
    const ui = await probe('host demo after flood', async () => { await page.locator('#demo').click(); await active(); }); assert(ui.responsive);
    result = { verdict: 'pass', classification: 'valid-message-flood-revoked', sent, acknowledged, revocation, closeMs, sender: 'test host retaining the actual runner endpoint', protocolNote: 'Fixed PROTOCOL UI code does not distinguish input/output rate failure; complete posting, accepted-message ACKs and host revocation are separate requirements.' };
  } else if (caseId === 'refill') {
    await open(portTemplate()); await pause(300);
    for (let i = 0; i < 30; i++) { await page.frames()[1].evaluate(value => s10One(value), `paced-${i}`); await pause(150); }
    const state = await hostState(); assert.equal(state.revision, 30); assert.equal(state.state.fields[0].value, 'paced-29'); await active();
    result = { verdict: 'pass', classification: '30-acknowledged-changes-with-refill', pacingMs: 150 };
  } else if (caseId === 'lifecycle') {
    // Test-only instrumentation retains the transferred old endpoint after its opaque frame is removed.
    await page.evaluate(() => {
      globalThis.s10Ports = [];
      addEventListener('message', e => {
        if (e.data?.type !== 'S10_PORT_CAPTURE' || e.source !== document.querySelector('iframe')?.contentWindow || e.ports.length !== 1) return;
        const holder = { sid: e.data.sid, port: e.ports[0], seq: 2, change: 0, revision: 0 };
        holder.port.onmessage = message => { const x = JSON.parse(message.data); if (x.type === 'STATE_ACCEPTED') holder.revision = x.payload.revision; };
        globalThis.s10Ports.push(holder);
      });
      globalThis.s10Change = (index, value, sid) => { const h = globalThis.s10Ports[index]; h.port.postMessage(JSON.stringify({ v: 1, sessionId: sid ?? h.sid, seq: ++h.seq, type: 'STATE_CHANGED', payload: { changeId: ++h.change, baseRevision: h.revision, state: { schemaVersion: 1, fields: [{ id: 'x', kind: 'text', value }] } } })); };
    });
    const cycles = [];
    for (let i = 0; i < 12; i++) {
      const openMs = await open(portTemplate(true)); await page.waitForFunction(count => s10Ports.length === count, i + 1);
      assert.equal((await hostState()).revision, 0); assert.equal((await hostState()).state.fields[0].value, ''); assert.equal(await page.locator('iframe').count(), 1);
      if (i) { await page.evaluate(index => s10Change(index, 'stale endpoint synthetic'), i - 1); await pause(120); await active(); assert.equal((await hostState()).revision, 0); }
      await page.evaluate(index => s10Change(index, `cycle-${index}`), i);
      await page.waitForFunction(value => document.getElementById('state').textContent.includes(value), `cycle-${i}`);
      let closeMs = null;
      if (i % 2 === 0) { const start = performance.now(); await page.locator('#close').click(); closeMs = Math.round(performance.now() - start); assert.equal(await page.locator('iframe').count(), 0); assert.equal(await page.locator('#state').textContent(), ''); }
      cycles.push({ openMs, closeMs, replacement: i > 0 && i % 2 === 0 });
    }
    const ids = await page.evaluate(() => s10Ports.map(p => p.sid)); assert.equal(new Set(ids).size, 12);
    await page.evaluate(() => s10Change(11, 'wrong old session', s10Ports[0].sid));
    await page.waitForFunction(() => document.getElementById('status').textContent === 'closed · PROTOCOL'); assert.equal(await page.locator('iframe').count(), 0);
    await page.evaluate(() => { for (const h of s10Ports) h.port.close(); s10Ports = []; });
    result = { verdict: 'pass', classification: '12-unique-sessions-old-ports-inert-stale-id-revoked', cycles, uniqueSessions: ids.length };
  } else {
    const allocation = caseId === 'allocation';
    const code = allocation ? `globalThis.s10Alloc=[];let n=0;const timer=setInterval(()=>{const chunk=new Uint8Array(1024*1024);chunk.fill(90);s10Alloc.push(chunk);if(++n===64){clearInterval(timer);console.log('S10:'+JSON.stringify({type:'allocation-done',bytes:${ALLOCATION_BYTES}}))}},25);` : 'while(true){}';
    await open(`<input id="x"><button id="attack">Synthetic load</button><script>document.getElementById('attack').addEventListener('click',()=>setTimeout(()=>{console.log('S10:'+JSON.stringify({type:'attack-started',kind:'${caseId}'}));${code}},100))</script>`);
    await page.frameLocator('iframe').locator('#attack').click();
    const markerDeadline = performance.now() + (allocation ? 6000 : 1500);
    while (performance.now() < markerDeadline && !(allocation ? allocationDone : attackStarted)) await pause(50);
    if (!attackStarted) throw Error('Attack execution marker missing');
    const heartbeat = await probe('host JavaScript roundtrip during load', () => page.evaluate(() => document.getElementById('status').textContent));
    const close = await probe('actual host close click during load', () => page.locator('#close').click());
    let sameBrowserReopen = false;
    if (close.responsive) { const reopen = await probe('same-browser reopen', async () => { await page.locator('#demo').click(); await active(); }, 3000); sameBrowserReopen = reopen.responsive; }
    result = { verdict: heartbeat.responsive && close.responsive && sameBrowserReopen ? 'observation' : 'observed-risk', classification: heartbeat.responsive && close.responsive && sameBrowserReopen ? 'ui-responsive-reopened-under-tested-load' : 'ui-unresponsive-under-tested-load', sameBrowserReopen, allocationComplete: allocation ? allocationDone : null, allocationBudgetBytes: allocation ? ALLOCATION_BYTES : 0 };
    if (allocation && !allocationDone) { result.verdict = 'inconclusive'; result.classification = 'allocation-did-not-reach-bounded-target'; }
  }
} catch (error) {
  result = { verdict: ['loop', 'allocation'].includes(caseId) && attackStarted && crashed ? 'observed-risk' : 'fail', classification: crashed ? 'browser-crash' : 'worker-assertion-or-setup-failure', error: String(error).slice(0, 4000) };
  if (caseId === 'allocation' && attackStarted && !allocationDone) { result.risk = crashed ? 'browser-crash' : null; result.verdict = 'inconclusive'; result.classification = 'allocation-did-not-reach-bounded-target'; }
} finally {
  send({ type: 'measurement', result, observations }); closing = true;
  try { await browser?.close(); await browserServer?.close(); } catch (error) { send({ type: 'cleanup-error', error: String(error).slice(0, 1000) }); }
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await new Promise(resolve => { if (process.connected) process.send({ type: 'result', result: { ...result, observations } }, resolve); else resolve(); });
  process.disconnect?.();
}
