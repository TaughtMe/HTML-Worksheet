import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { childPolicy, strictChildPolicy } from '../src/runner-policy.ts';
import { checkStrictRestore } from './restore-harness.mjs';
export const strictCases = Object.freeze(['C1', 'C2', 'C3', 'C4', 'C5']); // C6 reuses the unchanged legacy corpus.
const valid = '<input id="check" type="checkbox"><button id="toggle" type="button" data-ws-action="toggle-checkbox" data-ws-target="check">Toggle</button>';
function installFrameProbe() {
  const counts = globalThis.strictProbe = { created: 0, mounted: 0, channels: 0 };
  for (const method of ['createElement', 'createElementNS']) {
    const original = Document.prototype[method];
    Document.prototype[method] = function (...args) {
      if (String(args[method === 'createElement' ? 0 : 1]).toLowerCase() === 'iframe') counts.created++;
      return Reflect.apply(original, this, args);
    };
  }
  globalThis.MessageChannel = new Proxy(MessageChannel, { construct(target, args) { counts.channels++; return Reflect.construct(target, args); } });
  const collect = records => { for (const record of records) for (const node of record.addedNodes) {
    if (node.nodeType === 1) counts.mounted += (node.tagName === 'IFRAME' ? 1 : 0) + node.querySelectorAll('iframe').length;
  } };
  const observer = new MutationObserver(collect); observer.observe(document, { childList: true, subtree: true });
  globalThis.strictProbeRead = () => { collect(observer.takeRecords()); return { ...counts }; };
}
async function choose(page, source, name) {
  await page.locator('#file').setInputFiles({ name, mimeType: 'text/html', buffer: Buffer.from(source) });
  await page.locator('#open-strict').click();
}
const active = page => page.waitForFunction(() => document.getElementById('status').textContent.startsWith('active'), null, { timeout: 4000 });
export async function checkStrictCase(context, origin, caseId) {
  assert(strictCases.includes(caseId));
  if (caseId === 'C5') return checkStrictRestore(context, origin);
  const page = await context.newPage(), attempts = []; let initReceipts = 0;
  await page.exposeBinding('__strictInitReceipt', () => { initReceipts++; });
  await page.addInitScript(() => addEventListener('message', event => { if (event.data?.type === 'INIT') void globalThis.__strictInitReceipt(); }));
  try {
    if (caseId !== 'C4') {
      // Same click-started fixture as resource-worker.mjs's loop branch. Never click its attack button.
      const loop = `<input id="x"><button id="attack">Synthetic load</button><script>document.getElementById('attack').addEventListener('click',()=>setTimeout(()=>{console.log('S10:'+JSON.stringify({type:'attack-started',kind:'loop'}));while(true){}},100))</script>`;
      const corpus = caseId === 'C1' ? [loop] : caseId === 'C2' ? [
        valid + '<p onclick="globalThis.unexpected=1">x</p>', valid + '<style>p{background:url(https://example.invalid)}</style>',
        valid + '<img src="https://example.invalid">', valid + '<svg></svg>'
      ] : [valid.replace('toggle-checkbox', 'unknown'), valid + valid.replace('id="check"', 'id="otherCheck"').replace('id="toggle"', 'id="otherToggle"').replace('data-ws-target="check"', 'data-ws-target="otherCheck"'),
        valid.replace('data-ws-target="check"', ''), valid.replace('type="checkbox"', 'type="text"'), valid.replace('id="check"', 'id="check" data-ws-mode="legacy"')];
      for (const [i, source] of corpus.entries()) {
        await page.goto(origin);
        if (caseId === 'C3') { await choose(page, valid, 'valid-before-rejection.html'); await active(page); }
        await page.evaluate(installFrameProbe); initReceipts = 0;
        await choose(page, source, `strict-reject-${caseId}-${i}.html`);
        await page.waitForFunction(() => document.getElementById('status').textContent === 'IMPORT_REJECTED', null, { timeout: 4000 });
        const counts = await page.evaluate(() => globalThis.strictProbeRead());
        assert.deepEqual(counts, { created: 0, mounted: 0, channels: 0 }); assert.equal(initReceipts, 0);
        assert.equal(await page.locator('iframe').count(), 0); assert.equal(await page.locator('#state').textContent(), '');
        attempts.push({ fixtureSha256: createHash('sha256').update(source).digest('hex'), ...counts, initReceipts, status: 'IMPORT_REJECTED' });
      }
      return { caseId: `STRICT01/${caseId}`, attempts, noAttackClick: true };
    }
    await page.goto(origin); await page.evaluate(installFrameProbe);
    const source = await readFile('tests/fixtures/demo-strict-fields.html', 'utf8');
    await choose(page, source, 'demo-strict-fields.html'); await active(page);
    assert.deepEqual(await page.evaluate(() => globalThis.strictProbeRead()), { created: 1, mounted: 1, channels: 1 }); assert.equal(initReceipts, 1);
    const frame = page.frameLocator('iframe');
    const policies = await frame.locator('head').evaluate(head => ({ tags: [...head.children].map(e => e.tagName), policies: [...head.querySelectorAll('meta[http-equiv]')].map(e => e.content), nonce: head.querySelector('script').nonce, scripts: document.scripts.length }));
    assert.deepEqual(policies.tags, ['META', 'META', 'META', 'SCRIPT']); assert.equal(policies.scripts, 1);
    assert.deepEqual(policies.policies, [childPolicy, strictChildPolicy(policies.nonce)]);
    await frame.locator('#text').fill('<b>synthetic</b>'); await frame.locator('#area').fill('strict textarea');
    await frame.locator('#r2').check(); await frame.locator('#one').selectOption('b'); await frame.locator('#many').selectOption(['a', 'b']);
    const fields = [{ id: 'area', kind: 'text', value: 'strict textarea' }, { id: 'check', kind: 'checkbox', value: false }, { id: 'group', kind: 'radio', value: 'r2' }, { id: 'many', kind: 'select-many', value: ['a', 'b'] }, { id: 'one', kind: 'select-one', value: 'b' }, { id: 'text', kind: 'text', value: '<b>synthetic</b>' }];
    await page.waitForFunction(expected => { const raw = document.getElementById('state').textContent; return raw && JSON.stringify(JSON.parse(raw).state.fields) === JSON.stringify(expected); }, fields, { timeout: 4000 });
    const before = JSON.parse(await page.locator('#state').textContent());
    await frame.locator('#toggle').click(); fields[1].value = true;
    await page.waitForFunction(expected => JSON.stringify(JSON.parse(document.getElementById('state').textContent).state.fields) === JSON.stringify(expected), fields, { timeout: 4000 });
    const after = JSON.parse(await page.locator('#state').textContent());
    assert.deepEqual(after, { revision: before.revision + 1, durability: 'memory', state: { schemaVersion: 1, fields } });
    await page.locator('#checkpoint').click(); await page.waitForFunction(() => document.getElementById('status').textContent.includes('Snapshot bestätigt'));
    assert.deepEqual(JSON.parse(await page.locator('#state').textContent()), after); assert.equal(await page.locator('#state b').count(), 0);
    await page.locator('#close').click(); assert.equal(await page.locator('iframe').count(), 0);
    return { caseId: 'STRICT01/C4', fixtureSha256: createHash('sha256').update(source).digest('hex'), positiveFrameProbe: { created: 1, mounted: 1, channels: 1, initReceipts }, policies, before, after, checkpoint: 'memory' };
  } catch (error) { error.detail = { caseId, attempts, initReceipts }; throw error; }
  finally { await page.close(); }
}
