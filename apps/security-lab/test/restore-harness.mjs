// Trusted test host only. It exercises the real runner bundle with a nonempty synthetic restore.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { build } from 'esbuild';
import { normalize } from '../src/import.ts';
import { policy } from '../server.mjs';
const literal = value => JSON.stringify(value).replace(/</g, '\\u003c');
export async function checkNonemptyRestore(context, origin) {
  const nonce = randomBytes(24).toString('base64');
  const source = '<input id="text"><textarea id="area"></textarea><input id="check" type="checkbox"><fieldset id="group" data-ws-radio-group><input id="r1" name="group" type="radio"><input id="r2" name="group" type="radio"></fieldset><select id="one"><option value="a">A</option><option value="b">B</option></select><select id="many" multiple><option value="a">A</option><option value="b">B</option></select><script>globalThis.restoreEvents=0;document.addEventListener("input",()=>restoreEvents++);document.addEventListener("change",()=>restoreEvents++)</script>';
  const template = normalize(source, nonce);
  const values = { area: 'restored textarea', check: true, group: 'r2', many: ['b'], one: 'b', text: '<b>synthetic restore</b>' };
  const state = { schemaVersion: 1, fields: template.manifest.map(m => ({ id: m.id, kind: m.kind, value: values[m.id] })) };
  const runner = await build({ entryPoints: ['apps/security-lab/src/runner.ts'], bundle: true, format: 'iife', platform: 'browser', target: 'es2022', write: false });
  const runnerSource = runner.outputFiles[0].text;
  assert(!/<\/script/i.test(runnerSource));
  const childPolicy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  const child = `<!doctype html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${childPolicy}"><script nonce="${nonce}">(()=>{const __LAB_CONFIG__=${literal({ origin, manifest: template.manifest })};${runnerSource}\n})();<\/script></head><body>${template.content}</body>`;
  const hostScript = `
    const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');
    frame.srcdoc=${literal(child)};
    const sessionId='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';const state=${literal(state)};
    frame.onload=()=>{const channel=new MessageChannel();let seq=0;
      const send=(type,payload)=>channel.port1.postMessage(JSON.stringify({v:1,sessionId,seq:++seq,type,payload}));
      channel.port1.onmessage=e=>{const x=JSON.parse(e.data);
        if(x.type==='READY')send('RESTORE_STATE',{requestId:1,revision:7,adapterId:'standard-fields',adapterVersion:1,state});
        else if(x.type==='RESTORED'){globalThis.restored=x;send('REQUEST_STATE',{requestId:2,reason:'checkpoint'});}
        else if(x.type==='STATE_SNAPSHOT'){globalThis.snapshot=x;send('SNAPSHOT_ACCEPTED',{requestId:2,revision:7,durability:'memory'});}
        else globalThis.unexpected=x;
      };channel.port1.start();frame.contentWindow.postMessage({v:1,type:'INIT',sessionId},'*',[channel.port2]);
    };document.body.append(frame);`;
  const page = await context.newPage();
  try {
    await page.route(origin + '/restore-harness', route => route.fulfill({ status: 200, contentType: 'text/html', headers: { 'Content-Security-Policy': policy(nonce), 'Referrer-Policy': 'no-referrer' }, body: `<!doctype html><head><meta charset="utf-8"></head><body><script nonce="${nonce}">${hostScript}<\/script></body>` }));
    await page.goto(origin + '/restore-harness');
    await page.waitForFunction(() => globalThis.snapshot, null, { timeout: 4000 });
    const messages = await page.evaluate(() => ({ restored: globalThis.restored, snapshot: globalThis.snapshot, unexpected: globalThis.unexpected ?? null }));
    assert.deepEqual(messages.restored.payload, { requestId: 1, revision: 7 });
    assert.deepEqual(messages.snapshot.payload, { requestId: 2, baseRevision: 7, state }); assert.equal(messages.unexpected, null);
    const f = page.frameLocator('iframe');
    assert.equal(await f.locator('#text').inputValue(), values.text); assert.equal(await f.locator('#area').inputValue(), values.area);
    assert.equal(await f.locator('#check').isChecked(), true); assert.equal(await f.locator('#r1').isChecked(), false); assert.equal(await f.locator('#r2').isChecked(), true);
    assert.equal(await f.locator('#one').inputValue(), 'b'); assert.deepEqual(await f.locator('#many').evaluate(e => [...e.selectedOptions].map(o => o.value)), ['b']);
    assert.equal(await page.frames()[1].evaluate(() => globalThis.restoreEvents), 0);
    return { revision: 7, fields: state.fields, fixtureSha256: createHash('sha256').update(source).digest('hex'), runnerSha256: createHash('sha256').update(runnerSource).digest('hex') };
  } finally { await page.close(); }
}
