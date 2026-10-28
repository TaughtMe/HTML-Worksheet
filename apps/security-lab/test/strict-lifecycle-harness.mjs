// STRICT02: native port retirement and import ownership. Trusted Playwright instrumentation only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { childPolicy, strictChildPolicy } from '../src/runner-policy.ts';
export const strictLifecycleCases = Object.freeze(['retired-port', 'second-init', 'import-race']);
const source = '<input id="answer" type="text"><input id="check" type="checkbox"><button id="toggle" type="button" data-ws-action="toggle-checkbox" data-ws-target="check">Toggle</button>';
const active = page => page.waitForFunction(() => document.getElementById('status').textContent.startsWith('active'), null, { timeout: 4000 });
const state = page => page.locator('#state').textContent().then(JSON.parse);
async function choose(page, name) {
  await page.locator('#file').setInputFiles({ name, mimeType: 'text/html', buffer: Buffer.from(source) });
  await page.locator('#open-strict').click();
}
export function installObserver() {
  const evidence = globalThis.strict02 = { created: 0, mounted: 0, loads: 0, states: [], statuses: [], overflow: false };
  const append = (key, values) => {
    evidence[key].push(...values);
    if (evidence[key].length > 128) { evidence.overflow = true; evidence[key].length = 128; }
  };
  const texts = records => records.flatMap(r => r.type === 'childList'
    ? (r.addedNodes.length ? [...r.addedNodes].map(n => n.textContent) : r.removedNodes.length ? [''] : [])
    : [r.oldValue, r.target.data]).filter(x => typeof x === 'string');
  const options = { childList: true, subtree: true, characterData: true, characterDataOldValue: true };
  const observers = ['state', 'status'].map(id => {
    const key = id === 'state' ? 'states' : 'statuses', element = document.getElementById(id);
    append(key, [element.textContent]);
    const observer = new MutationObserver(records => append(key, texts(records))); observer.observe(element, options);
    return { observer, key };
  });
  const probe = document.createElement('pre'), probeObserver = new MutationObserver(() => {});
  probeObserver.observe(probe, options); probe.textContent = 'render-then-clear'; probe.textContent = '';
  const probeTexts = texts(probeObserver.takeRecords());
  evidence.renderClearControl = probeTexts.includes('render-then-clear') && probeTexts.includes(''); probeObserver.disconnect();
  const create = Document.prototype.createElement;
  Document.prototype.createElement = function (...args) {
    if (String(args[0]).toLowerCase() === 'iframe') evidence.created++;
    return Reflect.apply(create, this, args);
  };
  const collect = records => {
    for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1)
      evidence.mounted += Number(node.tagName === 'IFRAME') + node.querySelectorAll('iframe').length;
  };
  const frames = new MutationObserver(collect); frames.observe(document, { childList: true, subtree: true });
  addEventListener('load', event => { if (event.target instanceof HTMLIFrameElement) evidence.loads++; }, true);
  globalThis.strict02Read = () => {
    for (const { observer, key } of observers) append(key, texts(observer.takeRecords()));
    collect(frames.takeRecords()); return structuredClone(evidence);
  };
}
export function installRelay({ observeClose = false } = {}) {
  const Native = MessageChannel, channels = globalThis.strict02Channels = [];
  globalThis.MessageChannel = new Proxy(Native, { construct() {
    const host = new Native(), runner = new Native(), hostPeer = host.port2, runnerPeer = runner.port1;
    const entry = { host: [], runner: [], held: null, arm: false, injections: [], overflow: false, closeCalls: [] };
    if (observeClose) {
      const close = host.port1.close;
      host.port1.close = function (...args) {
        if (entry.closeCalls.length >= 64) entry.overflow = true;
        else entry.closeCalls.push({ at: performance.now(), handlersCleared: this.onmessage === null && this.onmessageerror === null });
        return Reflect.apply(close, this, args);
      };
    }
    const log = (key, data) => {
      if (entry[key].length >= 64) entry.overflow = true;
      else entry[key].push(JSON.parse(data));
    };
    // Both endpoints used by production remain native MessagePorts. All normal bytes and transfers are unchanged.
    hostPeer.onmessage = event => { log('host', event.data); runnerPeer.postMessage(event.data, [...event.ports]); };
    runnerPeer.onmessage = event => {
      log('runner', event.data);
      if (entry.arm && JSON.parse(event.data).type === 'STATE_CHANGED') {
        if (event.ports.length || entry.held) throw Error('Unexpected held message');
        entry.arm = false; entry.held = event.data; return;
      }
      hostPeer.postMessage(event.data, [...event.ports]);
    };
    entry.inject = (raw = entry.held) => { if (!entry.held || typeof raw !== 'string') throw Error('No held message/string'); hostPeer.postMessage(raw); entry.injections.push(raw); };
    entry.close = () => { host.port1.close(); hostPeer.close(); runnerPeer.close(); runner.port2.close(); };
    channels.push(entry);
    Object.defineProperty(host, 'port2', { value: runner.port2 }); return host;
  } });
  globalThis.strict02RelayRead = () => channels.map(({ host, runner, held, injections, overflow }) => ({ host, runner, held, injections, overflow }));
}
// A task barrier, not a timing/security guarantee: drains work before checking the finite observation interval.
const barrier = page => page.evaluate(() => new Promise(resolve => {
  const channel = new MessageChannel(); channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); }; channel.port2.postMessage('barrier');
}));
// Avoid creating the barrier through the instrumented constructor/relay, which expects protocol strings.
const animationBarrier = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function checkpoint(page) {
  const mutations = await page.evaluate(() => globalThis.strict02Read().statuses.length);
  await page.locator('#checkpoint').click();
  await page.waitForFunction(start => globalThis.strict02Read().statuses.slice(start).some(text => text.includes('Snapshot bestätigt')), mutations, { timeout: 4000 });
}
async function strictPolicy(page) {
  const evidence = await page.frameLocator('iframe').locator('head').evaluate(head => ({
    policies: [...head.querySelectorAll('meta[http-equiv]')].map(e => e.content), nonce: head.querySelector('script').nonce, scripts: document.scripts.length
  }));
  assert.equal(evidence.scripts, 1); assert.deepEqual(evidence.policies, [childPolicy, strictChildPolicy(evidence.nonce)]); return evidence;
}
async function actionAndCheckpoint(page, expectedAnswer) {
  const before = await state(page); assert.equal(before.state.fields[0].value, expectedAnswer);
  await page.frameLocator('iframe').locator('#toggle').click();
  await page.waitForFunction(rev => JSON.parse(document.getElementById('state').textContent).revision === rev + 1, before.revision, { timeout: 4000 });
  await checkpoint(page);
  const after = await state(page), expected = structuredClone(before); expected.revision++; expected.state.fields[1].value = !expected.state.fields[1].value;
  assert.deepEqual(after, expected); return after;
}
async function holdChange(page, index, value) {
  await page.evaluate(i => { globalThis.strict02Channels[i].arm = true; }, index);
  await page.frameLocator('iframe').locator('#answer').fill(value);
  await page.waitForFunction(i => !!globalThis.strict02Channels[i].held, index, { timeout: 4000 });
  return page.evaluate(i => globalThis.strict02Channels[i].held, index);
}
async function retiredPort(page) {
  await page.evaluate(installRelay);
  await choose(page, 'positive-native-port.html'); await active(page);
  const positive = await holdChange(page, 0, 'positive-native-port');
  await page.evaluate(() => globalThis.strict02Channels[0].inject());
  await page.waitForFunction(() => JSON.parse(document.getElementById('state').textContent).state.fields[0].value === 'positive-native-port');
  await page.waitForFunction(() => globalThis.strict02Channels[0].host.some(x => x.type === 'STATE_ACCEPTED'));
  const calibrated = await state(page); assert.equal(calibrated.revision, 1);
  const attempts = [];
  await choose(page, 'old-before-replacement.html'); await active(page);
  for (const [index, retirement] of [[1, 'REPLACED'], [2, 'USER_CLOSE']]) {
    const oldState = await state(page), oldMessages = await page.evaluate(i => globalThis.strict02RelayRead()[i].runner, index);
    const hostileValue = `late-${retirement}`, held = await holdChange(page, index, hostileValue), pending = JSON.parse(held);
    assert.equal(pending.type, 'STATE_CHANGED'); assert.equal(pending.seq, oldMessages.at(-1).seq + 1);
    assert.equal(pending.payload.changeId, oldMessages.filter(x => x.type === 'STATE_CHANGED').length + 1);
    assert.equal(pending.payload.baseRevision, oldState.revision);
    if (retirement === 'USER_CLOSE') { await page.locator('#close').click(); assert.equal(await page.locator('iframe').count(), 0); }
    await choose(page, `fresh-after-${retirement}.html`); await active(page);
    const before = await state(page), evidenceBefore = await page.evaluate(() => globalThis.strict02Read());
    assert.equal(before.revision, 0); assert.equal(before.state.fields[0].value, '');
    await page.evaluate(i => globalThis.strict02Channels[i].inject(), index);
    await animationBarrier(page); await checkpoint(page);
    assert.deepEqual(await state(page), before);
    const observed = await page.evaluate(() => globalThis.strict02Read()), relay = await page.evaluate(() => globalThis.strict02RelayRead());
    assert(observed.states.slice(evidenceBefore.states.length).every(text => text && JSON.stringify(JSON.parse(text)) === JSON.stringify(before)), 'Retired session committed or cleared the new state');
    assert(observed.statuses.slice(evidenceBefore.statuses.length).every(text => text.startsWith('active')), 'Retired session closed the new session');
    assert(!observed.states.some(text => text.includes(hostileValue)), 'Late value rendered before clear');
    assert.equal(await page.locator('iframe').count(), 1); assert.equal(observed.overflow, false);
    assert.equal(relay[index].overflow, false); assert.deepEqual(relay[index].injections, [held]);
    assert(relay[index].host.some(x => x.type === 'CLOSE' && x.payload.code === retirement));
    assert.notEqual(relay[index + 1].runner[0].sessionId, pending.sessionId);
    const after = await actionAndCheckpoint(page, '');
    attempts.push({ retirement, held, heldSha256: createHash('sha256').update(held).digest('hex'), injectedUnchanged: relay[index].injections[0] === held, before, after, observed });
  }
  const relay = await page.evaluate(() => globalThis.strict02RelayRead());
  assert.deepEqual(relay[0].injections, [positive]);
  assert.deepEqual(relay[0].host.find(x => x.type === 'STATE_ACCEPTED').payload, { changeId: 1, revision: 1, durability: 'memory' });
  assert(relay.every(x => !x.overflow));
  await page.evaluate(() => globalThis.strict02Channels.forEach(x => x.close()));
  return { positive, calibrated, relay, attempts };
}
async function secondInit(page, receipts) {
  await choose(page, 'second-init.html'); await active(page);
  await page.waitForFunction(() => globalThis.strict02DeliveredCount === 1, null, { timeout: 4000 });
  const initial = receipts.find(x => x.fromParent); assert(initial); const sessionId = initial.data.sessionId;
  await page.evaluate(sid => {
    const channel = new MessageChannel(); globalThis.strict02SecondPort = channel.port1; globalThis.strict02SecondMessages = [];
    channel.port1.onmessage = event => globalThis.strict02SecondMessages.push(event.data);
    document.querySelector('iframe').contentWindow.postMessage({ v: 1, type: 'INIT', sessionId: sid }, '*', [channel.port2]);
  }, sessionId);
  // The binding confirms actual receipt in the opaque runner, independently of the silent probe port.
  await page.waitForFunction(() => globalThis.strict02DeliveredCount >= 2, null, { timeout: 4000 });
  const after = await actionAndCheckpoint(page, ''); await barrier(page);
  const probe = await page.evaluate(() => globalThis.strict02SecondMessages);
  assert.deepEqual(probe, []); assert.equal(receipts.length, 2);
  assert.deepEqual(receipts.map(x => x.data), [{ v: 1, type: 'INIT', sessionId }, { v: 1, type: 'INIT', sessionId }]);
  assert(receipts.every(x => x.fromParent && x.ports === 1));
  await page.evaluate(() => globalThis.strict02SecondPort.close());
  return { receipts, probe, after };
}
function installImportGate() {
  const original = File.prototype.arrayBuffer;
  globalThis.strict02Gate = { entered: false, released: false, completed: false };
  File.prototype.arrayBuffer = function (...args) {
    if (this.name !== 'delayed-strict.html') return Reflect.apply(original, this, args);
    if (globalThis.strict02Gate.entered) throw Error('Only one delayed import allowed');
    globalThis.strict02Gate.entered = true;
    return new Promise(resolve => { globalThis.strict02Release = () => {
      globalThis.strict02Gate.released = true;
      resolve(Reflect.apply(original, this, args));
    }; }).then(buffer => { globalThis.strict02Gate.completed = true; return buffer; });
  };
}
async function importRace(page, origin, receipts) {
  const attempts = [];
  for (const winner of ['close', 'new-import']) {
    if (attempts.length) { await page.goto(origin); await page.evaluate(installObserver); }
    await page.evaluate(installImportGate);
    await choose(page, 'delayed-strict.html');
    await page.waitForFunction(() => globalThis.strict02Gate.entered);
    assert.equal(await page.locator('iframe').count(), 0);
    if (winner === 'close') await page.locator('#close').click();
    else { await choose(page, 'winning-strict.html'); await active(page); await actionAndCheckpoint(page, ''); }
    const before = await page.evaluate(() => ({ evidence: globalThis.strict02Read(), state: document.getElementById('state').textContent, status: document.getElementById('status').textContent, filename: document.getElementById('filename').textContent }));
    const receiptCount = receipts.length, policies = winner === 'new-import' ? await strictPolicy(page) : null;
    await page.evaluate(() => globalThis.strict02Release());
    await page.waitForFunction(() => globalThis.strict02Gate.completed);
    // Release resumes arrayBuffer -> importer -> open. These later tasks also cover queued frame/INIT work.
    await barrier(page); await animationBarrier(page);
    const after = await page.evaluate(() => ({ evidence: globalThis.strict02Read(), state: document.getElementById('state').textContent, status: document.getElementById('status').textContent, filename: document.getElementById('filename').textContent, gate: globalThis.strict02Gate }));
    for (const key of ['state', 'status', 'filename']) assert.equal(after[key], before[key]);
    for (const key of ['created', 'mounted', 'loads', 'states', 'statuses']) assert.deepEqual(after.evidence[key], before.evidence[key]);
    assert.equal(after.evidence.overflow, false); assert.equal(receipts.length, receiptCount);
    assert.deepEqual(after.gate, { entered: true, released: true, completed: true });
    assert.equal(after.filename, winner === 'close' ? 'delayed-strict.html' : 'winning-strict.html');
    assert.equal(await page.locator('iframe').count(), winner === 'close' ? 0 : 1);
    if (winner === 'new-import') { assert.deepEqual(await strictPolicy(page), policies); await actionAndCheckpoint(page, ''); }
    attempts.push({ winner, receiptCount, before, after, policies });
  }
  return { attempts };
}
export async function checkStrictLifecycle(context, origin, caseId) {
  assert(strictLifecycleCases.includes(caseId));
  const page = await context.newPage(), receipts = [];
  await page.exposeBinding('__strict02Receipt', async (_, receipt) => {
    receipts.push(receipt); await page.evaluate(count => { globalThis.strict02DeliveredCount = count; }, receipts.length);
  });
  await page.addInitScript(() => {
    if (parent === self) return;
    addEventListener('message', event => {
      if (event.data?.type === 'INIT') {
        globalThis.strict02InitDelivery = true;
        void globalThis.__strict02Receipt({ data: event.data, fromParent: event.source === parent, origin: event.origin, ports: event.ports.length });
      }
    });
  });
  try {
    await page.goto(origin); await page.evaluate(installObserver);
    const detail = caseId === 'retired-port' ? await retiredPort(page) : caseId === 'second-init' ? await secondInit(page, receipts) : await importRace(page, origin, receipts);
    const observed = await page.evaluate(() => globalThis.strict02Read());
    assert.equal(observed.renderClearControl, true); assert.equal(observed.overflow, false);
    return { caseId: `STRICT02/${caseId}`, fixtureSha256: createHash('sha256').update(source).digest('hex'), ...detail, observed };
  } catch (error) {
    error.detail = { caseId, receipts, observed: await page.evaluate(() => globalThis.strict02Read?.()).catch(() => null), relay: await page.evaluate(() => globalThis.strict02RelayRead?.()).catch(() => null) }; throw error;
  } finally { await page.close(); }
}
