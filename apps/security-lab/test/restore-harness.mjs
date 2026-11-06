// Trusted test host only. It exercises the real runner bundle with a nonempty synthetic restore.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { build } from 'esbuild';
import { normalize } from '../src/import.ts';
import { normalizeStrict } from '../src/strict-import.ts';
import { childPolicy, strictChildPolicy } from '../src/runner-policy.ts';
import { readFile } from 'node:fs/promises';
import { policy } from '../server.mjs';
const literal = value => JSON.stringify(value).replace(/</g, '\\u003c');
export const initSourceCases = Object.freeze(['same-origin-sibling', 'opaque-sibling']);
function observeForeignInit() {
  addEventListener('message', event => {
    if (event.data?.type !== 'INIT' || event.source === parent || event.ports.length !== 1) return;
    // The real bootstrap listener ran first. Same-port FIFO makes this a fence for its synchronous READY.
    event.ports[0].postMessage(JSON.stringify({ probe: 'SRC01_DELIVERED', init: event.data, origin: event.origin,
      fromParent: event.source === parent, fromSibling: event.source === parent.frames[1], ports: event.ports.length }));
  });
}
function sendForeignInit() {
  addEventListener('message', event => {
    if (event.source !== parent || event.data?.type !== 'SRC01_SEND' || event.ports.length !== 1) return;
    parent.postMessage({ probe: 'SRC01_PREPARED', init: event.data.init, ports: event.ports.length }, '*');
    parent.frames[0].postMessage(event.data.init, '*', [event.ports[0]]);
    parent.postMessage({ probe: 'SRC01_SENT' }, '*');
  });
}
export async function checkInitSource(context, origin, sourceCase) {
  assert(initSourceCases.includes(sourceCase));
  return checkNonemptyRestore(context, origin, sourceCase);
}
export async function checkStrictRestore(context, origin) { return checkNonemptyRestore(context, origin, null, true); }
export async function checkNonemptyRestore(context, origin, sourceCase = null, strict = false) {
  assert(sourceCase === null || initSourceCases.includes(sourceCase));
  assert(!strict || sourceCase === null);
  const nonce = randomBytes(24).toString('base64');
  const source = strict ? await readFile('tests/fixtures/demo-strict-fields.html', 'utf8') : '<input id="text"><textarea id="area"></textarea><input id="check" type="checkbox"><fieldset id="group" data-ws-radio-group><input id="r1" name="group" type="radio"><input id="r2" name="group" type="radio"></fieldset><select id="one"><option value="a">A</option><option value="b">B</option></select><select id="many" multiple><option value="a">A</option><option value="b">B</option></select><script>globalThis.restoreEvents=0;document.addEventListener("input",()=>restoreEvents++);document.addEventListener("change",()=>restoreEvents++)</script>'
    + (sourceCase ? `<script>(${observeForeignInit.toString()})()<\/script>` : '');
  const template = strict ? normalizeStrict(source) : normalize(source, nonce);
  const values = { area: 'restored textarea', check: true, group: 'r2', many: ['b'], one: 'b', text: '<b>synthetic restore</b>' };
  const state = { schemaVersion: 1, fields: template.manifest.map(m => ({ id: m.id, kind: m.kind, value: values[m.id] })) };
  const runner = await build({ entryPoints: ['apps/security-lab/src/runner.ts'], bundle: true, format: 'iife', platform: 'browser', target: 'es2022', write: false });
  const runnerSource = runner.outputFiles[0].text;
  assert(!/<\/script/i.test(runnerSource));
  const strictConfig = strict ? { mode: template.mode, action: template.action } : {};
  const extraPolicy = strict ? `<meta http-equiv="Content-Security-Policy" content="${strictChildPolicy(nonce)}">` : '';
  const child = `<!doctype html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${childPolicy}">${extraPolicy}<script nonce="${nonce}">(()=>{const __LAB_CONFIG__=${literal({ origin, manifest: template.manifest, ...strictConfig })};${runnerSource}\n})();<\/script></head><body>${template.content}</body>`;
  const sender = `<!doctype html><script nonce="${nonce}">(${sendForeignInit.toString()})()<\/script>`;
  const hostScript = `
    const frame=document.createElement('iframe');frame.id='restore-runner';frame.setAttribute('sandbox','allow-scripts');
    frame.srcdoc=${literal(child)};
    const sessionId='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';const state=${literal(state)};
    frame.onload=()=>{const channel=new MessageChannel();let seq=0;
      const send=(type,payload)=>{const x={v:1,sessionId,seq:++seq,type,payload};(globalThis.sentMessages??=[]).push(x);channel.port1.postMessage(JSON.stringify(x));};
      globalThis.strictCheckpoint=()=>send('REQUEST_STATE',{requestId:3,reason:'checkpoint'});
      channel.port1.onmessage=e=>{const x=JSON.parse(e.data);
        (globalThis.legitimateMessages??=[]).push(x);
        if(x.type==='READY')send('RESTORE_STATE',{requestId:1,revision:7,adapterId:'standard-fields',adapterVersion:1,state});
        else if(x.type==='RESTORED'){globalThis.restored=x;send('REQUEST_STATE',{requestId:2,reason:'checkpoint'});}
        else if(x.type==='STATE_SNAPSHOT'){globalThis.snapshot=x;send('SNAPSHOT_ACCEPTED',{requestId:x.payload.requestId,revision:x.payload.requestId===3?8:7,durability:'memory'});}
        else if(${strict}&&x.type==='STATE_CHANGED'){(globalThis.strictChanges??=[]).push(x);send('STATE_ACCEPTED',{changeId:1,revision:8,durability:'memory'});}
        else globalThis.unexpected=x;
      };channel.port1.start();
      const init={v:1,type:'INIT',sessionId};
      const initialize=()=>frame.contentWindow.postMessage(init,'*',[channel.port2]);
      if(${literal(sourceCase)}===null){initialize();return;}
      const evidence=globalThis.sourceEvidence={senderEvents:[],portMessages:[],overflow:false,legitimateInit:init};
      const sibling=document.createElement('iframe');sibling.id='source-sender';
      // A is privileged laboratory instrumentation to isolate source while preserving H origin.
      // B is an opaque sibling and exercises origin and source together. Runner policy is unchanged.
      if(${literal(sourceCase)}==='opaque-sibling')sibling.setAttribute('sandbox','allow-scripts');
      sibling.srcdoc=${literal(sender)};
      const attack=new MessageChannel();let delivered=false,sent=false,started=false;
      const proceed=()=>{if(delivered&&sent&&!started){started=true;initialize();}};
      attack.port1.onmessage=e=>{
        const message=JSON.parse(e.data);
        if(evidence.portMessages.length>=8)evidence.overflow=true;else evidence.portMessages.push(message);
        if(message.probe==='SRC01_DELIVERED'){delivered=true;proceed();}
      };attack.port1.start();
      addEventListener('message',e=>{
        if(e.source!==sibling.contentWindow)return;
        if(evidence.senderEvents.length>=8)evidence.overflow=true;else evidence.senderEvents.push({origin:e.origin,data:e.data});
        if(e.data?.probe==='SRC01_SENT'){sent=true;proceed();}
      });
      sibling.onload=()=>sibling.contentWindow.postMessage({type:'SRC01_SEND',init},'*',[attack.port2]);
      document.body.append(sibling);
    };document.body.append(frame);`;
  const page = await context.newPage();
  try {
    if (strict) await page.addInitScript(() => {
      globalThis.restoreEvents = 0;
      document.addEventListener('input', () => globalThis.restoreEvents++); document.addEventListener('change', () => globalThis.restoreEvents++);
    });
    await page.route(origin + '/restore-harness', route => route.fulfill({ status: 200, contentType: 'text/html', headers: { 'Content-Security-Policy': policy(nonce), 'Referrer-Policy': 'no-referrer' }, body: `<!doctype html><head><meta charset="utf-8"></head><body><script nonce="${nonce}">${hostScript}<\/script></body>` }));
    await page.goto(origin + '/restore-harness');
    await page.waitForFunction(() => globalThis.snapshot, null, { timeout: 4000 });
    const messages = await page.evaluate(() => ({ restored: globalThis.restored, snapshot: globalThis.snapshot, unexpected: globalThis.unexpected ?? null, legitimate: globalThis.legitimateMessages, sourceEvidence: globalThis.sourceEvidence ?? null }));
    assert.deepEqual(messages.restored.payload, { requestId: 1, revision: 7 });
    assert.deepEqual(messages.snapshot.payload, { requestId: 2, baseRevision: 7, state }); assert.equal(messages.unexpected, null);
    if (sourceCase) {
      const evidence = messages.sourceEvidence, expectedOrigin = sourceCase === 'same-origin-sibling' ? origin : 'null';
      const init = { v: 1, type: 'INIT', sessionId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' };
      assert.equal(evidence.overflow, false); assert.deepEqual(evidence.legitimateInit, init);
      assert.deepEqual(evidence.senderEvents, [
        { origin: expectedOrigin, data: { probe: 'SRC01_PREPARED', init, ports: 1 } },
        { origin: expectedOrigin, data: { probe: 'SRC01_SENT' } }
      ]);
      assert.deepEqual(evidence.portMessages, [{ probe: 'SRC01_DELIVERED', init, origin: expectedOrigin, fromParent: false, fromSibling: true, ports: 1 }]);
      assert.deepEqual(messages.legitimate.map(x => ({ type: x.type, seq: x.seq, sessionId: x.sessionId })), [
        { type: 'READY', seq: 1, sessionId: init.sessionId }, { type: 'RESTORED', seq: 2, sessionId: init.sessionId }, { type: 'STATE_SNAPSHOT', seq: 3, sessionId: init.sessionId }
      ]);
      assert.deepEqual(messages.legitimate[0].payload, { adapterId: 'standard-fields', adapterVersion: 1 });
    }
    const f = page.frameLocator('#restore-runner');
    assert.equal(await f.locator('#text').inputValue(), values.text); assert.equal(await f.locator('#area').inputValue(), values.area);
    assert.equal(await f.locator('#check').isChecked(), true); assert.equal(await f.locator('#r1').isChecked(), false); assert.equal(await f.locator('#r2').isChecked(), true);
    assert.equal(await f.locator('#one').inputValue(), 'b'); assert.deepEqual(await f.locator('#many').evaluate(e => [...e.selectedOptions].map(o => o.value)), ['b']);
    assert.equal(await f.locator('body').evaluate(() => globalThis.restoreEvents), 0);
    let strictEvidence;
    if (strict) {
      assert.deepEqual(messages.legitimate.map(x => x.type), ['READY', 'RESTORED', 'STATE_SNAPSHOT']);
      const after = structuredClone(state); after.fields.find(f => f.id === 'check').value = false;
      await f.locator('#toggle').click();
      await page.waitForFunction(() => globalThis.strictChanges?.length === 1, null, { timeout: 4000 });
      await page.evaluate(() => globalThis.strictCheckpoint());
      await page.waitForFunction(() => globalThis.snapshot?.payload.requestId === 3, null, { timeout: 4000 });
      strictEvidence = await page.evaluate(() => ({ received: globalThis.legitimateMessages, sent: globalThis.sentMessages, unexpected: globalThis.unexpected ?? null }));
      assert.equal(strictEvidence.unexpected, null);
      assert.deepEqual(strictEvidence.received.map(x => [x.type, x.seq]), [['READY', 1], ['RESTORED', 2], ['STATE_SNAPSHOT', 3], ['STATE_CHANGED', 4], ['STATE_SNAPSHOT', 5]]);
      assert.deepEqual(strictEvidence.received[3].payload, { changeId: 1, baseRevision: 7, state: after });
      assert.deepEqual(strictEvidence.received[4].payload, { requestId: 3, baseRevision: 8, state: after });
      assert.deepEqual(strictEvidence.sent.find(x => x.type === 'STATE_ACCEPTED').payload, { changeId: 1, revision: 8, durability: 'memory' });
      assert.equal(await f.locator('#check').isChecked(), false); assert.equal(await f.locator('body').evaluate(() => globalThis.restoreEvents), 0);
    }
    return { ...(strict ? { caseId: 'STRICT01/C5', strictEvidence } : {}), ...(sourceCase ? { caseId: `G1-X04-SRC01/${sourceCase}`, sourceEvidence: messages.sourceEvidence, legitimateMessages: messages.legitimate } : {}), revision: 7, fields: state.fields, fixtureSha256: createHash('sha256').update(source).digest('hex'), runnerSha256: createHash('sha256').update(runnerSource).digest('hex') };
  } catch (error) {
    error.detail = await page.evaluate(() => ({ sourceEvidence: globalThis.sourceEvidence ?? null, legitimateMessages: globalThis.legitimateMessages ?? [], unexpected: globalThis.unexpected ?? null })).catch(() => null); throw error;
  } finally { await page.close(); }
}
