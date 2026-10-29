// RATE01: bounded native-port traffic, real monotonic time, unchanged production budgets.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { emptyState } from '../src/contract.ts';
import { installObserver, installRelay } from './strict-lifecycle-harness.mjs';
import { rateCases, source, manifest, change, replay, WINDOW_BYTES, MESSAGE_BYTES } from './bridge-rate-fixtures.mjs';
export { rateCases };
const sha = data => createHash('sha256').update(data).digest('hex');
const active = page => page.waitForFunction(() => document.getElementById('status').textContent.startsWith('active'), null, { timeout: 4000 });
const state = page => page.locator('#state').textContent().then(JSON.parse);
async function read(page) {
  return page.evaluate(() => ({ observer: globalThis.strict02Read(), status: document.getElementById('status').textContent,
    state: document.getElementById('state').textContent, frames: document.querySelectorAll('iframe').length,
    channels: globalThis.strict02Channels.map(({ host, runner, received, injections, closeCalls, overflow, rateControl }) =>
      ({ host, runner, received, injections, closeCalls, overflow, rateControl })) }));
}
// Padding is reconstructed exactly from JSON + paddingBytes; hashes identify complete actual wire strings.
function compact(evidence) {
  const wire = data => ({ json: JSON.parse(data), utf8Bytes: Buffer.byteLength(data), paddingBytes: data.length - JSON.stringify(JSON.parse(data)).length, sha256: sha(data) });
  return { ...evidence, channels: evidence.channels.map(entry => ({ ...entry,
    received: entry.received.map(({ data, ...item }) => ({ ...item, ...wire(data) })),
    injections: entry.injections.map(({ data, ...item }) => ({ ...item, ...wire(data) })) })) };
}
async function choose(page, name) {
  await page.locator('#file').setInputFiles({ name, mimeType: 'text/html', buffer: Buffer.from(source) });
  await page.locator('#open-strict').click(); await active(page);
}
async function checkpoint(page, channel) {
  const start = await page.evaluate(() => globalThis.strict02Read().statuses.length);
  await page.locator('#checkpoint').click();
  await page.waitForFunction(({ channel, start }) => globalThis.strict02Read().statuses.slice(start).some(text => text.includes('Snapshot bestätigt'))
    && globalThis.strict02Channels[channel].host.some(message => message.type === 'SNAPSHOT_ACCEPTED' && message.payload.requestId === 2
      && message.payload.revision === 1 && message.payload.durability === 'memory'), { channel, start }, { timeout: 4000 });
}
async function action(page, channel) {
  await page.frameLocator('iframe').locator('#toggle').click();
  await page.waitForFunction(channel => globalThis.strict02Channels[channel].host.some(message => message.type === 'STATE_ACCEPTED'
    && message.payload.changeId === 1 && message.payload.revision === 1 && message.payload.durability === 'memory'), channel, { timeout: 4000 });
  await checkpoint(page, channel);
  const result = await state(page); assert.equal(result.revision, 1); assert.deepEqual(result.state.fields.map(field => field.value), ['', true]); return result;
}
async function idle(page, duration) {
  const last = await page.evaluate(() => globalThis.strict02Channels[0].received.at(-1).after);
  await page.waitForFunction(target => performance.now() >= target, last + duration, { timeout: duration + 1000 });
  return page.evaluate(({ last, duration }) => ({ lastReceiveAfter: last, requestedMs: duration, resumedAt: performance.now() }), { last, duration });
}
function inputRecords(evidence) { return evidence.channels[0].received.slice(4); }
export function assertRateEvidence(evidence, expectedCount, accepted) {
  const entry = evidence.channels[0], records = inputRecords(evidence);
  assert.deepEqual(entry.received.slice(0, 4).map(item => JSON.parse(item.data).type), ['READY', 'RESTORED', 'STATE_CHANGED', 'STATE_SNAPSHOT']);
  assert.equal(entry.injections.length, expectedCount); assert.equal(records.length, expectedCount);
  assert.deepEqual(records.map(item => item.data), entry.injections.map(item => item.data), 'Posted bytes differ from actual native Host receipts');
  assert(records.every(item => item.ports === 0 && item.after >= item.before));
  assert.equal(evidence.observer.renderClearControl, true); assert.equal(evidence.observer.overflow, false); assert.equal(entry.overflow, false);
  const acknowledgements = entry.host.filter(message => message.type === 'STATE_ACCEPTED').map(message => message.payload);
  assert.deepEqual(acknowledgements, Array.from({ length: accepted + 1 }, (_, i) => ({ changeId: i + 1, revision: i + 1, durability: 'memory' })));
  const observed = evidence.observer.states.filter(Boolean).map(JSON.parse);
  const initial = { revision: 0, durability: 'memory', state: emptyState(manifest) };
  const calibration = structuredClone(initial); calibration.revision = 1; calibration.state.fields.find(field => field.id === 'check').value = true;
  const allowed = new Map([[0, initial], [1, calibration]]);
  for (let index = 0; index < accepted; index++) allowed.set(index + 2, { revision: index + 2, durability: 'memory', state: JSON.parse(entry.injections[index].data).payload.state });
  for (let revision = 1; revision <= accepted + 1; revision++) assert(observed.some(item => item.revision === revision), `Missing native commit ${revision}`);
  for (const rendered of observed) assert.deepEqual(rendered, allowed.get(rendered.revision), 'Unexpected rendered state, including transient candidate under an old revision');
  return records;
}
function validateTokenBracket(records, accepted) {
  const first = records[0], rejected = records.at(-1);
  const deltaUpper = rejected.after - first.before;
  assert(deltaUpper < (accepted + 1 - 20) * 100, 'Scheduler crossed rejection boundary: rate result is not calibrated');
  const lastAccepted = records[accepted - 1], deltaLower = lastAccepted.before - first.after;
  if (accepted > 20) assert(deltaLower >= (accepted - 20) * 100, 'Accepted refill lacks elapsed-time evidence');
  const expected = [...Array(accepted).fill('accepted'), 'RATE'];
  assert.deepEqual(replay(records, 'before'), expected); assert.deepEqual(replay(records, 'after'), expected);
  return { deltaLower, deltaUpper, accepted, rejected: accepted + 1, offlineBefore: expected, offlineAfter: expected };
}
async function closed(page, expectedCount, accepted) {
  await page.waitForFunction(() => document.getElementById('status').textContent === 'closed · PROTOCOL', null, { timeout: 4000 });
  // Peer callbacks are asynchronous; await the actual ACK evidence, not only the status mutation.
  await page.waitForFunction(count => globalThis.strict02Channels[0].host.filter(message => message.type === 'STATE_ACCEPTED').length === count, accepted + 1, { timeout: 4000 });
  const result = await read(page); assertRateEvidence(result, expectedCount, accepted);
  assert.equal(result.frames, 0); assert.equal(result.state, '');
  assert.equal(result.channels[0].closeCalls.length, 1); assert.equal(result.channels[0].closeCalls[0].handlersCleared, true);
  assert(result.observer.states.includes('')); return result;
}
async function accepted(page, count) {
  await page.waitForFunction(count => globalThis.strict02Channels[0].host.filter(message => message.type === 'STATE_ACCEPTED').length === count, count + 1, { timeout: 4000 });
  const result = await read(page); assertRateEvidence(result, count, count);
  assert(result.status.startsWith('active')); assert.equal(result.frames, 1); assert.deepEqual(result.channels[0].closeCalls, []);
  assert.deepEqual(JSON.parse(result.state), { revision: count + 1, durability: 'memory', state: JSON.parse(result.channels[0].injections.at(-1).data).payload.state }); return result;
}
async function trial(context, origin, kind, over = false) {
  const page = await context.newPage(); let calibration, rest, before, outcome, boundaries; let sent = 0, sessionId;
  async function send(sizes) {
    const data = sizes.map(size => change(sessionId, ++sent, size));
    await page.evaluate(data => globalThis.strict02Channels[0].batch(data), data);
  }
  try {
    await page.goto(origin); await page.evaluate(installObserver); await page.evaluate(installRelay, { observeClose: true, rateProbe: true });
    await choose(page, `rate01-${kind}-${over}.html`); calibration = await action(page, 0);
    const calibrated = await read(page); sessionId = calibrated.channels[0].runner[0].sessionId;
    assert.equal(calibrated.channels[0].received.length, 4); assert.deepEqual(calibrated.channels[0].closeCalls, []);
    rest = await idle(page, kind === 'burst' || kind === 'refill' ? 2100 : 10200);
    before = await read(page); assert(before.status.startsWith('active')); assert.equal(before.frames, 1); assert.deepEqual(before.channels[0].closeCalls, []);
    await page.evaluate(() => { globalThis.strict02Channels[0].rateControl = true; });
    if (kind === 'burst') {
      await send(Array(21).fill(undefined)); outcome = await closed(page, 21, 20);
      boundaries = validateTokenBracket(inputRecords(outcome), 20);
    } else if (kind === 'refill') {
      await send(Array(20).fill(undefined)); const drained = await accepted(page, 20), first = inputRecords(drained)[0];
      assert(inputRecords(drained).at(-1).after - first.before < 100, 'Drain batch was not a calibrated burst');
      await page.waitForFunction(target => performance.now() >= target, first.after + 650, { timeout: 1000 });
      await send(Array(7).fill(undefined)); outcome = await closed(page, 27, 26);
      boundaries = { ...validateTokenBracket(inputRecords(outcome), 26), drained: compact(drained) };
    } else if (kind === 'byte-limit') {
      await send([...Array(10).fill(MESSAGE_BYTES), 262144 + Number(over)]);
      outcome = over ? await closed(page, 11, 10) : await accepted(page, 11);
      const records = inputRecords(outcome), total = records.reduce((sum, item) => sum + Buffer.byteLength(item.data), 0);
      assert.equal(total, WINDOW_BYTES + Number(over)); assert(records.at(-1).after - records[0].before < 10000);
      const expected = [...Array(over ? 10 : 11).fill('accepted'), ...(over ? ['RATE_BYTES'] : [])];
      for (const edge of ['before', 'after']) assert.deepEqual(replay(records, edge), expected);
      boundaries = { totalUtf8Bytes: total, limit: WINDOW_BYTES, offline: expected };
    } else {
      await send(Array(3).fill(MESSAGE_BYTES)); const old = inputRecords(await accepted(page, 3));
      await page.waitForFunction(target => performance.now() >= target, old.at(-1).after + 5200, { timeout: 6200 });
      await send(Array(7).fill(MESSAGE_BYTES)); const younger = inputRecords(await accepted(page, 10)).slice(3);
      await page.waitForFunction(target => performance.now() >= target, old.at(-1).after + 10200, { timeout: 11200 });
      await send([...Array(3).fill(MESSAGE_BYTES), 262144]); const atLimit = await accepted(page, 14);
      await send([undefined]); outcome = await closed(page, 15, 14);
      const records = inputRecords(outcome), remaining = records.slice(10), last = records.at(-1);
      assert(remaining.every(item => item.before - old.at(-1).after > 10000), 'Old cohort not definitely expired');
      assert(last.after - younger[0].before < 10000, 'Younger cohort may have expired: rolling result is not calibrated');
      const resident = [...younger, ...remaining.slice(0, -1)].reduce((sum, item) => sum + Buffer.byteLength(item.data), 0); assert.equal(resident, WINDOW_BYTES);
      const expected = [...Array(14).fill('accepted'), 'RATE_BYTES'];
      for (const edge of ['before', 'after']) assert.deepEqual(replay(records, edge), expected);
      boundaries = { expiredCount: 3, retainedCount: 7, oldestRetainedAgeUpper: last.after - younger[0].before,
        youngestExpiredAgeLower: remaining[0].before - old.at(-1).after, residentUtf8BytesAtLimit: resident,
        overflowBytes: Buffer.byteLength(last.data), offline: expected, atLimit: compact(atLimit) };
    }
    await choose(page, 'rate01-fresh-recovery.html'); const fresh = await state(page); assert.equal(fresh.revision, 0);
    const recovered = await action(page, 1), final = await read(page);
    assert.notEqual(final.channels[1].runner[0].sessionId, sessionId); assert.equal(final.observer.overflow, false); assert(final.channels.every(entry => !entry.overflow));
    return { kind, over, fixtureSha256: sha(source), calibration, rest, before: compact(before), boundaries, outcome: compact(outcome), recovered, recovery: compact(final) };
  } catch (error) {
    error.detail = { kind, over, sent, calibration, rest, before: before && compact(before), boundaries, outcome: outcome && compact(outcome), current: await read(page).then(compact).catch(() => null) }; throw error;
  } finally {
    await page.evaluate(() => globalThis.strict02Channels?.forEach(entry => entry.close())).catch(() => {}); await page.close();
  }
}
export async function checkBridgeRate(context, origin, caseId) {
  assert(rateCases.includes(caseId)); const trials = [];
  try { for (const over of caseId === 'byte-limit' ? [false, true] : [false]) trials.push(await trial(context, origin, caseId, over)); }
  catch (error) { error.detail = { ...error.detail, completedTrials: trials }; throw error; }
  return { caseId: `S07/RATE01/${caseId}`, trials, limits: 'unchanged', excluded: ['isolated Host-output rate', 'continued invalid-message budget reset (first invalid message closes)', 'queue/DoS resilience'] };
}
