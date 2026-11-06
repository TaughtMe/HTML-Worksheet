// POLICY01: strict admission, actual final policy, and separately labelled trusted defense-in-depth injection.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { policy as hostPolicy } from '../server.mjs';
import { childPolicy, strictChildPolicy } from '../src/runner-policy.ts';
import { installFrameProbe } from './strict-harness.mjs';
import { installObserver, installRelay } from './strict-lifecycle-harness.mjs';
import { policyCases, policySource, admissions, inlineKinds, loaderKinds, resourceKinds, png, installPolicyController } from './policy-fixtures.mjs';
import { startPolicyReceiver } from './policy-receiver.mjs';
export { policyCases };
const hash = data => createHash('sha256').update(data).digest('hex');
const active = page => page.waitForFunction(() => document.getElementById('status').textContent.startsWith('active'), null, { timeout: 4000 });
const frame = page => page.frames().find(item => item.parentFrame() === page.mainFrame());
async function choose(page, source = policySource, name = 'policy01-valid.html') {
  await page.locator('#file').setInputFiles({ name, mimeType: 'text/html', buffer: Buffer.from(source) }); await page.locator('#open-strict').click();
}
async function setup(page, origin) {
  const response = await page.goto(origin); await page.evaluate(installObserver); await page.evaluate(installRelay, { observeClose: true });
  await choose(page); await active(page); return response.headers()['content-security-policy'];
}
async function action(page, changeId = 1, requestId = 2) {
  await page.frameLocator('iframe').locator('#toggle').click();
  await page.waitForFunction(changeId => globalThis.strict02Channels[0].host.some(x => x.type === 'STATE_ACCEPTED' && x.payload.changeId === changeId
    && x.payload.revision === changeId && x.payload.durability === 'memory'), changeId, { timeout: 4000 });
  const start = await page.evaluate(() => globalThis.strict02Read().statuses.length); await page.locator('#checkpoint').click();
  await page.waitForFunction(({ start, requestId, changeId }) => globalThis.strict02Read().statuses.slice(start).some(text => text.includes('Snapshot bestätigt'))
    && globalThis.strict02Channels[0].host.some(x => x.type === 'SNAPSHOT_ACCEPTED' && x.payload.requestId === requestId && x.payload.revision === changeId
      && x.payload.durability === 'memory'), { start, requestId, changeId }, { timeout: 4000 });
  const value = JSON.parse(await page.locator('#state').textContent());
  assert.deepEqual(value, { revision: changeId, durability: 'memory', state: { schemaVersion: 1, fields: [{ id: 'answer', kind: 'text', value: '' }, { id: 'check', kind: 'checkbox', value: changeId % 2 === 1 }] } }); return value;
}
async function policyEvidence(page, header) {
  const host = await page.locator('script[nonce]').evaluate(element => ({ nonce: element.nonce }));
  assert.equal(header, hostPolicy(host.nonce));
  const attributes = await page.locator('iframe').evaluate(element => ({ sandbox: element.getAttribute('sandbox'), referrerpolicy: element.getAttribute('referrerpolicy') }));
  assert.deepEqual(attributes, { sandbox: 'allow-scripts', referrerpolicy: 'no-referrer' });
  const child = await frame(page).evaluate(() => {
    let parentDOM; try { void parent.document.body; parentDOM = 'accessible'; } catch (error) { parentDOM = error.name; }
    return { origin: self.origin, parentDOM, tags: [...document.head.children].map(element => element.tagName), nonce: document.querySelector('script').nonce,
      policies: [...document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')].map(element => element.content), scripts: document.scripts.length };
  });
  assert.equal(child.origin, 'null'); assert.equal(child.parentDOM, 'SecurityError'); assert.equal(child.nonce, host.nonce);
  assert.deepEqual(child.tags, ['META', 'META', 'META', 'SCRIPT']); assert.equal(child.scripts, 1);
  assert.deepEqual(child.policies, [childPolicy, strictChildPolicy(host.nonce)]); return { header, host, attributes, child };
}
async function install(target, config) {
  await target.evaluate(({ config, source }) => {
    const element = document.createElement('script'); element.nonce = config.nonce; element.textContent = `(${source})(${JSON.stringify(config)})`; document.head.append(element);
  }, { config: { ...config, png }, source: installPolicyController.toString() });
  await target.waitForFunction(() => globalThis.policy01?.installed === true, null, { timeout: 4000 });
}
const readSinks = target => target.evaluate(() => { const { cleanup, workers, ...value } = globalThis.policy01; return structuredClone(value); });
export function policyExpectation(kind, { nonce, receiver, blobURL, after }) {
  let directives, blocked, policy = strictChildPolicy(nonce);
  if (inlineKinds.includes(kind)) {
    directives = kind === 'inline-handler' ? ['script-src-attr', 'script-src'] : ['eval', 'function'].includes(kind) ? ['script-src'] : ['script-src-elem', 'script-src'];
    blocked = ['eval', 'function'].includes(kind) ? ['eval'] : ['inline'];
  } else if (loaderKinds.includes(kind)) {
    policy = childPolicy; directives = kind === 'worker-blob' ? ['worker-src'] : ['script-src-elem', 'script-src'];
    if (kind.includes('blob')) { assert(blobURL?.startsWith('blob:')); blocked = ['blob', 'blob:', blobURL]; }
    else if (kind.includes('data')) {
      const code = kind === 'data-script' ? `globalThis.policy01.markers.push(${JSON.stringify(kind)})` : `export default ${JSON.stringify(kind)}`;
      blocked = ['data', 'data:', 'data:text/javascript,' + encodeURIComponent(code)];
    } else blocked = [`${receiver}/asset?kind=${kind}&phase=negative`];
  } else {
    assert(resourceKinds.includes(kind)); directives = kind === 'font-style' ? ['style-src-elem', 'style-src'] : ['img-src'];
    blocked = kind === 'font-style' ? ['inline'] : kind === 'data-image' ? ['data', 'data:', 'data:image/png;base64,' + png] : [`${receiver}/asset?kind=${kind}&phase=negative`];
  }
  return { kind, directives, blocked, policy, after };
}
// Self-contained: the same predicate runs in the browser wait and the offline assertion regression.
export function matchesPolicyViolation({ violations, expected, start }) {
  const canonical = value => value.split(';').map(part => part.trim().replace(/\s+/g, ' ')).filter(Boolean).join(';');
  return (violations ?? globalThis.policy01.violations.slice(start)).some(event => event.disposition === 'enforce' && event.kind === expected.kind
    && event.at >= expected.after && expected.directives.includes(event.effectiveDirective) && expected.blocked.includes(event.blockedURI)
    && canonical(event.originalPolicy) === canonical(expected.policy));
}
export function assertPolicyReceiverAssets(caseId, receiver, controls) {
  const kinds = caseId === 'loaders' ? ['external-classic', 'external-module', 'import-http'] : ['srcset', 'poster', 'font-style'];
  assert(['loaders', 'resources'].includes(caseId)); assert.deepEqual(receiver.fileHits, receiver.ipcHits);
  const expectedAssetPaths = kinds.map(kind => `/asset?kind=${kind}&phase=positive`).sort();
  const assets = receiver.fileHits.filter(hit => new URL(hit.url, receiver.origin).pathname === '/asset');
  assert.deepEqual(assets.map(hit => hit.url).sort(), expectedAssetPaths, 'Complete receiver log contains missing, duplicate or forbidden asset requests');
  const otherPaths = receiver.fileHits.filter(hit => new URL(hit.url, receiver.origin).pathname !== '/asset').map(hit => hit.url).sort();
  assert.deepEqual(otherPaths, ['/page', ...controls].sort(), 'Complete receiver log contains unexpected requests outside the asset paths');
  return { expectedAssetPaths, observedAssetPaths: assets.map(hit => hit.url), completeRequestCount: receiver.fileHits.length };
}
async function sink(target, kind, positive, receiver, nonce) {
  const start = await target.evaluate(() => globalThis.policy01.violations.length);
  await target.evaluate(kind => dispatchEvent(new CustomEvent('policy01-start', { detail: kind })), kind);
  await target.waitForFunction(kind => globalThis.policy01.attempts.some(item => item.kind === kind), kind, { timeout: 4000 });
  if (kind === 'inline-handler') await target.locator('p[data-policy-handler]').click();
  let expectedViolation;
  if (positive) {
    if (kind === 'poster' || kind === 'font-style') await receiver.waitHit(`/asset?kind=${kind}&phase=positive`);
    else await target.waitForFunction(kind => globalThis.policy01.markers.includes(kind), kind, { timeout: 4000 });
  } else {
    const current = await readSinks(target);
    expectedViolation = policyExpectation(kind, { nonce, receiver: receiver?.origin, blobURL: current.urls.at(-1), after: current.attempts.at(-1).at });
    await target.waitForFunction(matchesPolicyViolation, { start, expected: expectedViolation }, { timeout: 4000 });
    assert(!(await readSinks(target)).markers.includes(kind));
  }
  // Drain ordinary callbacks before attributing supplementary violation events to the next sink.
  await target.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const evidence = await readSinks(target);
  if (!positive) assert(matchesPolicyViolation({ violations: evidence.violations.slice(start), expected: expectedViolation }), 'Matching enforced CSP violation missing');
  return { kind, positive, attempt: evidence.attempts.find(item => item.kind === kind), markers: evidence.markers.filter(marker => marker === kind),
    expectedViolation, violations: evidence.violations.slice(start), errors: evidence.errors.filter(item => item.kind === kind) };
}
async function evidence(page) {
  return page.evaluate(() => ({ observer: globalThis.strict02Read(), relay: globalThis.strict02RelayRead(), closeCalls: globalThis.strict02Channels[0].closeCalls,
    status: document.getElementById('status').textContent, frames: document.querySelectorAll('iframe').length }));
}
async function admission(context, origin) {
  const page = await context.newPage(), attempts = [], receipts = []; let positiveBefore, positiveAfter;
  await page.exposeBinding('__policy01Init', (_, data) => { receipts.push(data); });
  await page.addInitScript(() => { if (self === parent) return; addEventListener('message', event => { if (event.data?.type === 'INIT') void globalThis.__policy01Init({ fromParent: event.source === parent, ports: event.ports.length }); }); });
  const control = async () => {
    await page.goto(origin); await page.evaluate(installObserver); await page.evaluate(installRelay); await page.evaluate(installFrameProbe);
    await choose(page); await active(page); await action(page);
    const probe = await page.evaluate(() => globalThis.strictProbeRead()); assert.deepEqual(probe, { created: 1, mounted: 1, channels: 1 });
    await page.locator('#close').click(); return probe;
  };
  try {
    positiveBefore = await control();
    for (const definition of admissions) {
      await page.goto(origin); await page.evaluate(installFrameProbe); const before = receipts.length;
      await choose(page, definition.source, `policy01-rejected-${definition.id}.html`);
      await page.waitForFunction(() => document.getElementById('status').textContent === 'IMPORT_REJECTED', null, { timeout: 4000 });
      const probe = await page.evaluate(() => globalThis.strictProbeRead()); assert.deepEqual(probe, { created: 0, mounted: 0, channels: 0 });
      assert.equal(receipts.length, before); assert.equal(await page.locator('iframe').count(), 0); assert.equal(await page.locator('#state').textContent(), '');
      attempts.push({ id: definition.id, sourceSha256: hash(definition.source), probe, initReceipts: receipts.length - before, status: 'IMPORT_REJECTED' });
    }
    positiveAfter = await control(); assert.equal(receipts.length, 2); assert(receipts.every(item => item.fromParent && item.ports === 1));
    return { positiveBefore, positiveAfter, receipts, attempts, claim: 'Admission only, before iframe/port creation; no runtime claim for rejected source' };
  } catch (error) { error.detail = { positiveBefore, positiveAfter, receipts, attempts }; throw error; }
  finally { await page.close(); }
}
export async function checkPolicy(context, origin, caseId) {
  assert(policyCases.includes(caseId)); if (caseId === 'admission') return { caseId: 'POLICY01/admission', ...await admission(context, origin) };
  const page = await context.newPage(); let receiver, receiverEvidence, before, policies, positive, negative, result, error, control;
  try {
    const header = await setup(page, origin); policies = await policyEvidence(page, header); const calibrated = await action(page); before = await evidence(page);
    const target = frame(page), nonce = policies.host.nonce;
    const kinds = caseId === 'final-policy' ? inlineKinds : caseId === 'loaders' ? loaderKinds : resourceKinds;
    if (caseId === 'final-policy') {
      control = await context.newPage(); await control.setContent('<!doctype html><body>Trusted inline control</body>');
      const fresh = await context.newPage(); try { const response = await fresh.goto(origin); assert.notEqual(response.headers()['content-security-policy'], header); policies.nextHeader = response.headers()['content-security-policy']; } finally { await fresh.close(); }
    } else { receiver = await startPolicyReceiver(context); control = receiver.page; }
    await install(control, { nonce, positive: true, phase: 'positive', receiver: receiver?.origin ?? '' });
    positive = []; for (const kind of kinds) positive.push(await sink(control, kind, true, receiver));
    const afterPositive = receiver ? await receiver.control() : null;
    const positiveHits = receiver ? receiver.hits.filter(hit => hit.url.startsWith('/asset?')) : [];
    const expectedAssets = caseId === 'loaders' ? ['external-classic', 'external-module', 'import-http'] : caseId === 'resources' ? ['srcset', 'poster', 'font-style'] : [];
    assert.deepEqual(positiveHits.map(hit => hit.url).sort(), expectedAssets.map(kind => `/asset?kind=${kind}&phase=positive`).sort());
    if (caseId === 'final-policy') {
      const weaker = "default-src * data: blob:; script-src * data: blob: 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'; img-src * data:; worker-src * blob:";
      await target.evaluate(content => { const meta = document.createElement('meta'); meta.httpEquiv = 'Content-Security-Policy'; meta.content = content; document.head.append(meta); }, weaker);
      policies.afterWeakerMeta = await target.evaluate(() => [...document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')].map(element => element.content));
      assert.deepEqual(policies.afterWeakerMeta, [...policies.child.policies, weaker]);
    }
    const beforeControl = receiver ? await receiver.control() : null, startHits = receiver?.hits.length ?? 0;
    await install(target, { nonce, positive: false, phase: 'negative', receiver: receiver?.origin ?? '' });
    negative = []; for (const kind of kinds) negative.push(await sink(target, kind, false, receiver, nonce));
    // Positive nonce-bearing InlineClassic/InlineModule remain possible after the weaker intersecting Meta.
    if (caseId === 'final-policy') {
      const allowed = await target.evaluate(nonce => {
        for (const module of [false, true]) { const script = document.createElement('script'); script.nonce = nonce; if (module) script.type = 'module'; script.textContent = `globalThis.policy01.markers.push("allowed-${module ? 'module' : 'classic'}")`; document.head.append(script); }
        return ['allowed-classic', 'allowed-module'];
      }, nonce);
      await target.waitForFunction(markers => markers.every(marker => globalThis.policy01.markers.includes(marker)), allowed, { timeout: 4000 });
    }
    const observationStart = performance.now(); await page.waitForTimeout(3000);
    const afterControl = receiver ? await receiver.control() : null;
    const attackHits = receiver ? receiver.hits.slice(startHits).filter(hit => hit.url !== afterControl) : [];
    assert.deepEqual(attackHits, []);
    const sinkEvidence = await readSinks(target); assert.deepEqual(sinkEvidence.attempts.map(item => item.kind), [...kinds]);
    assert.deepEqual(sinkEvidence.markers, caseId === 'final-policy' ? ['allowed-classic', 'allowed-module'] : []);
    let fontStyle;
    if (caseId === 'resources') {
      fontStyle = { positive: await control.locator('span[data-policy-font]').evaluate(element => getComputedStyle(element).getPropertyValue('--policy01-font-marker')),
        negative: await target.locator('span[data-policy-font]').evaluate(element => getComputedStyle(element).getPropertyValue('--policy01-font-marker')) };
      assert.equal(fontStyle.positive, 'applied'); assert.equal(fontStyle.negative, '');
    }
    const after = await action(page, 2, 3), final = await evidence(page);
    assert.equal(final.frames, 1); assert(final.status.startsWith('active')); assert.deepEqual(final.closeCalls, []); assert.equal(final.relay.length, 1);
    assert.equal(final.relay[0].runner[0].sessionId, before.relay[0].runner[0].sessionId); assert.equal(final.observer.overflow, false); assert.equal(final.relay[0].overflow, false);
    await control.evaluate(() => globalThis.policy01.cleanup()); if (!receiver) await control.close();
    result = { caseId: `POLICY01/${caseId}`, sourceSha256: hash(policySource), policies, calibrated, before, positive, negative, afterPositive, beforeControl, afterControl,
      positiveHits, attackHits, sinkEvidence, fontStyle, observationMs: performance.now() - observationStart, after, final,
      claim: 'Trusted defense-in-depth injection after valid strict admission; not reachable through imported strict source',
      limits: ['No X02 navigation', 'No HTTPS/WSS or all X03 resource variants', 'Font request gated by style-src, not isolated font-src', 'No product/G1 approval'] };
  } catch (caught) {
    error = caught; error.detail = { caseId, before, policies, positive, negative, observer: await evidence(page).catch(() => null), sinks: await readSinks(frame(page)).catch(() => null) };
  } finally {
    if (receiver) { try { receiverEvidence = await receiver.close(); } catch (caught) { if (!error) error = caught; else error.detail.receiverCleanup = String(caught); } }
    else await control?.close();
    await page.close();
  }
  if (!error && receiverEvidence) {
    try { result.receiverValidation = assertPolicyReceiverAssets(caseId, receiverEvidence, [result.afterPositive, result.beforeControl, result.afterControl]); }
    catch (caught) { error = caught; }
  }
  if (error) { error.detail = { ...error.detail, receiver: receiverEvidence }; throw error; }
  return { ...result, receiver: receiverEvidence };
}
