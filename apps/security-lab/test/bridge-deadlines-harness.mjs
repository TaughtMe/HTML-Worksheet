// TIME01: real host deadlines, native ports, and original runner messages. No timer modification.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export const deadlineCases = Object.freeze(['READY', 'RESTORED', 'STATE_SNAPSHOT']);
const source = '<input id="answer" type="text"><input id="check" type="checkbox"><button id="toggle" type="button" data-ws-action="toggle-checkbox" data-ws-target="check">Toggle</button>';
const active = page => page.waitForFunction(() => document.getElementById('status').textContent.startsWith('active'), null, { timeout: 4000 });
const state = page => page.locator('#state').textContent().then(JSON.parse);
const barrier = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
function installProbe() {
  const Native = MessageChannel, nativeCreate = Document.prototype.createElement;
  const channels = [], frames = [], evidence = { states: [], statuses: [], overflow: false, clockOrigin: performance.timeOrigin };
  const append = (key, texts) => {
    evidence[key].push(...texts.map(text => ({ at: performance.now(), text })));
    if (evidence[key].length > 128) { evidence.overflow = true; evidence[key].length = 128; }
  };
  const texts = records => records.flatMap(r => r.type === 'childList'
    ? (r.addedNodes.length ? [...r.addedNodes].map(n => n.textContent) : r.removedNodes.length ? [''] : [])
    : [r.oldValue, r.target.data]).filter(text => typeof text === 'string');
  const options = { childList: true, subtree: true, characterData: true, characterDataOldValue: true };
  const observers = ['state', 'status'].map(id => {
    const key = id === 'state' ? 'states' : 'statuses', element = document.getElementById(id);
    append(key, [element.textContent]);
    const observer = new MutationObserver(records => append(key, texts(records))); observer.observe(element, options); return { key, observer };
  });
  const probe = document.createElement('pre'), probeObserver = new MutationObserver(() => {});
  probeObserver.observe(probe, options); probe.textContent = 'render-then-clear'; probe.textContent = '';
  const calibration = texts(probeObserver.takeRecords()); probeObserver.disconnect();
  evidence.renderClearControl = calibration.includes('render-then-clear') && calibration.includes('');
  Document.prototype.createElement = function (...args) {
    const element = Reflect.apply(nativeCreate, this, args);
    if (String(args[0]).toLowerCase() === 'iframe') {
      const frame = { element, createdAt: performance.now(), loadAt: null, removedObservedAt: null }; frames.push(frame);
      // Registered at creation, before the application's onload. This precedes the READY deadline arm.
      element.addEventListener('load', () => { frame.loadAt ??= performance.now(); }, { capture: true, once: true });
    }
    return element;
  };
  const collectFrames = records => {
    for (const record of records) for (const node of record.removedNodes) {
      const frame = frames.find(item => item.element === node); if (frame) frame.removedObservedAt = performance.now();
    }
  };
  const frameObserver = new MutationObserver(collectFrames); frameObserver.observe(document.getElementById('runner'), { childList: true });
  document.addEventListener('click', event => {
    if (event.target.id === 'checkpoint') channels.at(-1).checkpointAt = performance.now();
  }, true);
  globalThis.MessageChannel = new Proxy(Native, { construct() {
    const host = new Native(), runner = new Native(), hostPort = host.port1, hostPeer = host.port2, runnerPeer = runner.port1;
    const post = hostPort.postMessage, close = hostPort.close;
    const entry = { frame: frames.at(-1), holdType: globalThis.time01NextHold, held: null, hostSent: [], runner: [], releases: [], closeCalls: [], overflow: false,
      initPortReadAt: null, readyForwardAt: null, checkpointAt: null };
    globalThis.time01NextHold = null;
    const log = (key, item) => { if (entry[key].length >= 64) entry.overflow = true; else entry[key].push(item); };
    hostPort.postMessage = function (...args) {
      log('hostSent', { at: performance.now(), data: args[0], ports: args[1]?.length ?? 0 }); return Reflect.apply(post, this, args);
    };
    hostPort.close = function (...args) {
      log('closeCalls', { at: performance.now(), handlersCleared: this.onmessage === null && this.onmessageerror === null }); return Reflect.apply(close, this, args);
    };
    const forward = (data, ports = []) => {
      if (JSON.parse(data).type === 'READY') entry.readyForwardAt = performance.now();
      hostPeer.postMessage(data, ports);
    };
    hostPeer.onmessage = event => runnerPeer.postMessage(event.data, [...event.ports]);
    runnerPeer.onmessage = event => {
      log('runner', { at: performance.now(), data: event.data, ports: event.ports.length });
      if (!entry.held && JSON.parse(event.data).type === entry.holdType) {
        if (event.ports.length) throw Error('Unexpected transferred port');
        entry.held = event.data; entry.heldAt = performance.now(); return;
      }
      forward(event.data, [...event.ports]);
    };
    entry.release = () => { if (!entry.held) throw Error('No held message'); log('releases', { at: performance.now(), data: entry.held }); forward(entry.held); };
    entry.cleanup = () => { Reflect.apply(close, hostPort, []); hostPeer.close(); runnerPeer.close(); runner.port2.close(); };
    channels.push(entry);
    Object.defineProperty(host, 'port2', { get() { entry.initPortReadAt ??= performance.now(); return runner.port2; } }); return host;
  } });
  globalThis.time01Channels = channels;
  globalThis.time01Read = () => {
    for (const { key, observer } of observers) append(key, texts(observer.takeRecords())); collectFrames(frameObserver.takeRecords());
    return { ...structuredClone(evidence), channels: channels.map(({ frame, release, cleanup, ...entry }) => ({ ...entry,
      frame: { createdAt: frame.createdAt, loadAt: frame.loadAt, removedObservedAt: frame.removedObservedAt } })) };
  };
}
async function choose(page, holdType, name) {
  await page.evaluate(type => { globalThis.time01NextHold = type; }, holdType);
  await page.locator('#file').setInputFiles({ name, mimeType: 'text/html', buffer: Buffer.from(source) });
  await page.locator('#open-strict').click();
}
async function checkpoint(page) {
  const start = await page.evaluate(() => globalThis.time01Read().statuses.length);
  await page.locator('#checkpoint').click();
  await page.waitForFunction(index => globalThis.time01Read().statuses.slice(index).some(item => item.text.includes('Snapshot bestätigt')), start, { timeout: 4000 });
}
async function prepareSnapshot(page, value) {
  await active(page); await page.frameLocator('iframe').locator('#answer').fill('accepted-before-snapshot');
  await page.waitForFunction(() => JSON.parse(document.getElementById('state').textContent).state.fields[0].value === 'accepted-before-snapshot');
  // Trusted instrumentation changes the live field without an input event, leaving the host's revision at 1.
  await page.frameLocator('iframe').locator('#answer').evaluate((element, text) => { element.value = text; }, value);
  await page.locator('#checkpoint').click();
}
const messages = (entry, key = 'hostSent') => entry[key].map(item => ({ ...JSON.parse(item.data), at: item.at }));
function checkHeld(entry, type, snapshotValue) {
  const held = JSON.parse(entry.held);
  assert.equal(held.type, type); assert.equal(held.seq, type === 'READY' ? 1 : type === 'RESTORED' ? 2 : 4);
  if (type === 'STATE_SNAPSHOT') {
    assert.deepEqual(held.payload, { requestId: 2, baseRevision: 1, state: { schemaVersion: 1, fields: [
      { id: 'answer', kind: 'text', value: snapshotValue }, { id: 'check', kind: 'checkbox', value: false }
    ] } });
  } else assert.deepEqual(held.payload, type === 'READY' ? { adapterId: 'standard-fields', adapterVersion: 1 } : { requestId: 1, revision: 0 });
  return held;
}
export async function checkBridgeDeadline(context, origin, type) {
  assert(deadlineCases.includes(type));
  const page = await context.newPage(); let calibration, beforeTimeout, afterTimeout;
  try {
    await page.goto(origin); await page.evaluate(installProbe);
    await choose(page, type, `time01-positive-${type}.html`);
    if (type === 'STATE_SNAPSHOT') await prepareSnapshot(page, 'positive-snapshot');
    await page.waitForFunction(() => !!globalThis.time01Channels[0]?.held, null, { timeout: 4000 });
    await page.evaluate(() => globalThis.time01Channels[0].release()); await active(page);
    if (type === 'STATE_SNAPSHOT') {
      await page.waitForFunction(() => globalThis.time01Read().channels[0].hostSent.some(item => JSON.parse(item.data).type === 'SNAPSHOT_ACCEPTED'));
      calibration = await state(page); assert.equal(calibration.revision, 2); assert.equal(calibration.state.fields[0].value, 'positive-snapshot');
    } else { await checkpoint(page); calibration = await state(page); assert.equal(calibration.revision, 0); }
    const calibrated = (await page.evaluate(() => globalThis.time01Read())).channels[0];
    checkHeld(calibrated, type, 'positive-snapshot'); assert.deepEqual(calibrated.releases.map(item => item.data), [calibrated.held]);
    assert.equal(calibrated.closeCalls.length, 0);
    if (type === 'STATE_SNAPSHOT') assert.deepEqual(messages(calibrated).find(item => item.type === 'SNAPSHOT_ACCEPTED').payload, { requestId: 2, revision: 2, durability: 'memory' });
    await page.locator('#close').click(); assert.equal(await page.locator('iframe').count(), 0);
    const attackStart = await page.evaluate(() => globalThis.time01Read());
    await choose(page, type, `time01-timeout-${type}.html`);
    if (type === 'STATE_SNAPSHOT') await prepareSnapshot(page, 'late-snapshot-only');
    await page.waitForFunction(() => !!globalThis.time01Channels[1]?.held, null, { timeout: 4000 });
    beforeTimeout = await page.evaluate(() => globalThis.time01Read());
    const held = checkHeld(beforeTimeout.channels[1], type, 'late-snapshot-only');
    if (type === 'STATE_SNAPSHOT') { assert.equal((await state(page)).revision, 1); assert.equal((await state(page)).state.fields[0].value, 'accepted-before-snapshot'); }
    else { assert.equal(await page.locator('#state').textContent(), ''); assert(!(await page.locator('#status').textContent()).startsWith('active')); }
    await page.waitForFunction(() => document.getElementById('status').textContent === 'closed · TIMEOUT', null, { timeout: 4000 });
    assert.equal(await page.locator('iframe').count(), 0); assert.equal(await page.locator('#state').textContent(), '');
    afterTimeout = await page.evaluate(() => globalThis.time01Read());
    const expired = afterTimeout.channels[1], sent = messages(expired), closed = sent.find(item => item.type === 'CLOSE');
    assert.deepEqual(closed.payload, { code: 'TIMEOUT' }); assert.equal(closed.sessionId, held.sessionId);
    assert.equal(expired.closeCalls.length, 1); assert.equal(expired.closeCalls[0].handlersCleared, true); assert(expired.frame.removedObservedAt !== null);
    const duration = type === 'STATE_SNAPSHOT' ? 2000 : 3000;
    const bracket = type === 'READY' ? { before: expired.frame.loadAt, after: expired.initPortReadAt }
      : type === 'RESTORED' ? { before: expired.readyForwardAt, after: sent.find(item => item.type === 'RESTORE_STATE').at }
      : { before: expired.checkpointAt, after: sent.find(item => item.type === 'REQUEST_STATE').at };
    assert(bracket.before !== null && bracket.after !== null); assert(bracket.after >= bracket.before);
    assert(expired.closeCalls[0].at - bracket.before >= duration - 1, 'TIMEOUT preceded the observed phase interval');
    assert(expired.closeCalls[0].at >= bracket.after);
    const attackStatuses = afterTimeout.statuses.slice(attackStart.statuses.length).map(item => item.text);
    assert(!attackStatuses.some(text => text.includes('Snapshot bestätigt')));
    if (type !== 'STATE_SNAPSHOT') assert(!attackStatuses.some(text => text.startsWith('active')));
    assert(!afterTimeout.states.some(item => item.text.includes('late-snapshot-only')));
    await page.evaluate(() => globalThis.time01Channels[1].release()); await barrier(page);
    const closedRelease = await page.evaluate(() => globalThis.time01Read());
    assert.deepEqual(closedRelease.states, afterTimeout.states); assert.deepEqual(closedRelease.statuses, afterTimeout.statuses);
    assert.equal(await page.locator('iframe').count(), 0);
    await choose(page, null, `time01-fresh-${type}.html`); await active(page);
    const fresh = await state(page), freshStart = await page.evaluate(() => globalThis.time01Read());
    assert.equal(fresh.revision, 0); assert.deepEqual(fresh.state.fields.map(field => field.value), ['', false]);
    assert.notEqual(messages(freshStart.channels[2], 'runner')[0].sessionId, held.sessionId);
    await page.evaluate(() => globalThis.time01Channels[1].release()); await barrier(page);
    const late = await page.evaluate(() => globalThis.time01Read());
    assert.deepEqual(await state(page), fresh); assert.equal(await page.locator('iframe').count(), 1);
    assert.deepEqual(late.states.slice(freshStart.states.length), []); assert.deepEqual(late.statuses.slice(freshStart.statuses.length), []);
    await page.frameLocator('iframe').locator('#toggle').click();
    await page.waitForFunction(() => JSON.parse(document.getElementById('state').textContent).revision === 1);
    await checkpoint(page);
    const final = await state(page), evidence = await page.evaluate(() => globalThis.time01Read());
    assert.deepEqual(final, { ...fresh, revision: 1, state: { schemaVersion: 1, fields: [{ id: 'answer', kind: 'text', value: '' }, { id: 'check', kind: 'checkbox', value: true }] } });
    assert.deepEqual(evidence.channels[1].releases.map(item => item.data), [expired.held, expired.held]);
    assert(evidence.channels[1].releases.every(item => item.at > expired.closeCalls[0].at));
    assert.deepEqual(evidence.channels[1].hostSent, expired.hostSent); assert.deepEqual(evidence.channels[1].closeCalls, expired.closeCalls);
    assert(messages(evidence.channels[2]).some(item => item.type === 'SNAPSHOT_ACCEPTED' && item.payload.requestId === 2 && item.payload.revision === 1));
    assert(evidence.states.slice(freshStart.states.length).every(item => item.text && [fresh, final].some(expected => JSON.stringify(JSON.parse(item.text)) === JSON.stringify(expected))));
    assert.equal(evidence.renderClearControl, true); assert.equal(evidence.overflow, false); assert(evidence.channels.every(entry => !entry.overflow));
    return { caseId: `G1-X04-TIME01/${type}`, fixtureSha256: createHash('sha256').update(source).digest('hex'), calibration,
      heldSha256: createHash('sha256').update(expired.held).digest('hex'), duration, bracket, observedCloseAt: expired.closeCalls[0].at,
      beforeTimeout, afterTimeout, closedRelease, final, evidence };
  } catch (error) {
    error.detail = { type, calibration, beforeTimeout, afterTimeout, evidence: await page.evaluate(() => globalThis.time01Read?.()).catch(() => null) }; throw error;
  } finally {
    await page.evaluate(() => globalThis.time01Channels?.forEach(entry => entry.cleanup())).catch(() => {}); await page.close();
  }
}
