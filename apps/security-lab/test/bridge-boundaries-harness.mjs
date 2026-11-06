// BOUND01: production Host/Runner, native endpoints, real pending Changes. No budget/clock overrides.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { installObserver, installRelay } from './strict-lifecycle-harness.mjs';
import { boundaryCases, fixture, variants, wire, validatePair, metrics, recoverySource } from './bridge-boundary-fixtures.mjs';
export { boundaryCases };
const active = page => page.waitForFunction(() => document.getElementById('status').textContent.startsWith('active'), null, { timeout: 4000 });
const readState = page => page.locator('#state').textContent().then(JSON.parse);
const hash = text => createHash('sha256').update(text).digest('hex');
async function choose(page, source, name) {
  await page.locator('#file').setInputFiles({ name, mimeType: 'text/html', buffer: Buffer.from(source) });
  await page.locator('#open-strict').click(); await active(page);
}
async function checkpoint(page, channelIndex, expectedACK) {
  const start = await page.evaluate(() => globalThis.strict02Read().statuses.length);
  await page.locator('#checkpoint').click();
  // Status and the native peer callback are separate tasks. Both must arrive within the same original wait budget.
  await page.waitForFunction(({ start, channelIndex, expectedACK }) =>
    globalThis.strict02Read().statuses.slice(start).some(text => text.includes('Snapshot bestätigt'))
    && globalThis.strict02Channels[channelIndex]?.host.some(message => message.type === 'SNAPSHOT_ACCEPTED'
      && message.payload?.requestId === expectedACK.requestId && message.payload?.revision === expectedACK.revision
      && message.payload?.durability === expectedACK.durability), { start, channelIndex, expectedACK }, { timeout: 4000 });
}
async function holdChange(page, state, triggerId) {
  await page.evaluate(() => { const entry = globalThis.strict02Channels[0]; entry.held = null; entry.arm = true; });
  // Bounded test instrumentation sets live DOM values, then the unchanged adapter captures/sends them.
  await page.frameLocator('iframe').locator('body').evaluate((_, { state, triggerId }) => {
    for (const field of state.fields) {
      const element = document.getElementById(field.id);
      if (field.kind === 'text') element.value = field.value;
      else if (field.kind === 'checkbox') element.checked = field.value;
      else if (field.kind === 'select-many') for (const option of element.options) option.selected = field.value.includes(option.value);
      else throw Error('Unsupported BOUND01 fixture kind');
    }
    document.getElementById(triggerId).dispatchEvent(new Event('input', { bubbles: true }));
  }, { state, triggerId });
  await page.waitForFunction(() => !!globalThis.strict02Channels[0]?.held, null, { timeout: 4000 });
  return page.evaluate(() => globalThis.strict02Channels[0].held);
}
async function inject(page, raw) { await page.evaluate(data => globalThis.strict02Channels[0].inject(data), raw); }
const envelopeIdentity = (message, expected) => {
  assert.deepEqual(Object.keys(message).sort(), ['payload', 'seq', 'sessionId', 'type', 'v']);
  assert.equal(message.v, 1); assert.match(message.sessionId, /^[a-f0-9]{32}$/); assert.equal(message.type, 'STATE_CHANGED');
  assert.equal(message.seq, expected.seq); assert.equal(message.payload.changeId, expected.changeId); assert.equal(message.payload.baseRevision, expected.baseRevision);
};
async function checkPair(context, origin, definition) {
  const page = await context.newPage(); let positiveOriginal, positiveRaw, negativeOriginal, negativeRaw, validation, calibrated, beforeNegative, negativePrecondition;
  try {
    await page.goto(origin); await page.evaluate(installObserver); await page.evaluate(installRelay, { observeClose: true });
    await choose(page, definition.source, `bound01-${definition.caseId}-${definition.variant}.html`);
    const initial = await readState(page); assert.equal(initial.revision, 0);
    positiveOriginal = await holdChange(page, definition.positive, definition.triggerId);
    const positiveMessage = JSON.parse(positiveOriginal); envelopeIdentity(positiveMessage, { seq: 3, changeId: 1, baseRevision: 0 });
    assert.deepEqual(positiveMessage.payload.state, definition.positive);
    assert.deepEqual(await readState(page), initial, 'Held Change affected Host before release');
    positiveRaw = wire(positiveOriginal, definition);
    assert.deepEqual(JSON.parse(positiveRaw), positiveMessage, 'Positive padding changed message semantics');
    await inject(page, positiveRaw);
    await page.waitForFunction(() => globalThis.strict02Channels[0].host.some(x => x.type === 'STATE_ACCEPTED'), null, { timeout: 4000 });
    calibrated = await readState(page);
    assert.deepEqual(calibrated, { revision: 1, durability: 'memory', state: definition.positive });
    await checkpoint(page, 0, { requestId: 2, revision: 1, durability: 'memory' }); assert.deepEqual(await readState(page), calibrated);
    const positiveRelay = await page.evaluate(() => globalThis.strict02RelayRead()[0]);
    assert.deepEqual(positiveRelay.injections, [positiveRaw]);
    assert.deepEqual(positiveRelay.host.find(x => x.type === 'STATE_ACCEPTED').payload, { changeId: 1, revision: 1, durability: 'memory' });
    assert.deepEqual(positiveRelay.host.find(x => x.type === 'SNAPSHOT_ACCEPTED').payload, { requestId: 2, revision: 1, durability: 'memory' });
    assert.deepEqual(positiveRelay.runner.find(x => x.type === 'STATE_SNAPSHOT').payload, { requestId: 2, baseRevision: 1, state: definition.positive });
    negativeOriginal = await holdChange(page, definition.next, definition.triggerId);
    const negativeMessage = JSON.parse(negativeOriginal); envelopeIdentity(negativeMessage, { seq: 5, changeId: 2, baseRevision: 1 });
    assert.equal(negativeMessage.sessionId, positiveMessage.sessionId); assert.deepEqual(negativeMessage.payload.state, definition.next);
    assert.deepEqual(await readState(page), calibrated);
    negativeRaw = wire(negativeOriginal, definition, true);
    validation = validatePair(definition, positiveRaw, negativeOriginal, negativeRaw);
    const mutated = JSON.parse(negativeRaw); envelopeIdentity(mutated, { seq: 5, changeId: 2, baseRevision: 1 }); assert.equal(mutated.sessionId, positiveMessage.sessionId);
    beforeNegative = await page.evaluate(() => globalThis.strict02Read());
    negativePrecondition = await page.evaluate(() => ({ status: document.getElementById('status').textContent,
      frames: document.querySelectorAll('iframe').length, closeCalls: [...globalThis.strict02Channels[0].closeCalls],
      closeMessages: globalThis.strict02Channels[0].host.filter(message => message.type === 'CLOSE') }));
    assert(negativePrecondition.status.startsWith('active')); assert.equal(negativePrecondition.frames, 1);
    assert.deepEqual(negativePrecondition.closeCalls, []); assert.deepEqual(negativePrecondition.closeMessages, []);
    assert.deepEqual(await readState(page), calibrated);
    await inject(page, negativeRaw);
    await page.waitForFunction(() => document.getElementById('status').textContent === 'closed · PROTOCOL', null, { timeout: 4000 });
    await page.waitForFunction(() => globalThis.strict02Channels[0].host.some(x => x.type === 'CLOSE'), null, { timeout: 4000 });
    const afterNegative = await page.evaluate(() => ({ observer: globalThis.strict02Read(), relay: globalThis.strict02RelayRead()[0], closeCalls: globalThis.strict02Channels[0].closeCalls }));
    assert.equal(await page.locator('iframe').count(), 0); assert.equal(await page.locator('#state').textContent(), '');
    assert.equal(afterNegative.observer.renderClearControl, true); assert.equal(afterNegative.observer.overflow, false); assert.equal(afterNegative.relay.overflow, false);
    assert.deepEqual(afterNegative.relay.injections, [positiveRaw, negativeRaw], 'Native sends not completed exactly once');
    assert.equal(afterNegative.closeCalls.length, 1); assert.equal(afterNegative.closeCalls[0].handlersCleared, true);
    assert.deepEqual(afterNegative.relay.host.filter(x => x.type === 'STATE_ACCEPTED').map(x => x.payload), [{ changeId: 1, revision: 1, durability: 'memory' }]);
    assert.deepEqual(afterNegative.relay.host.at(-1).payload, { code: 'PROTOCOL' });
    const rejectedStates = afterNegative.observer.states.slice(beforeNegative.states.length);
    assert(rejectedStates.includes(''), 'State clear missing from calibrated observer');
    assert(rejectedStates.every(text => text === '' || JSON.stringify(JSON.parse(text)) === JSON.stringify(calibrated)), 'Rejected candidate rendered transiently');
    await choose(page, recoverySource, 'bound01-fresh-recovery.html');
    const fresh = await readState(page); assert.equal(fresh.revision, 0); assert.deepEqual(fresh.state.fields.map(field => field.value), ['', false]);
    await page.frameLocator('iframe').locator('#toggle').click();
    await page.waitForFunction(() => JSON.parse(document.getElementById('state').textContent).revision === 1);
    await checkpoint(page, 1, { requestId: 2, revision: 1, durability: 'memory' });
    const recovered = await readState(page);
    assert.deepEqual(recovered, { revision: 1, durability: 'memory', state: { schemaVersion: 1, fields: [{ id: 'answer', kind: 'text', value: '' }, { id: 'check', kind: 'checkbox', value: true }] } });
    const final = await page.evaluate(() => ({ observer: globalThis.strict02Read(), relay: globalThis.strict02RelayRead() }));
    assert.notEqual(final.relay[1].runner[0].sessionId, positiveMessage.sessionId); assert.equal(final.observer.overflow, false); assert(final.relay.every(entry => !entry.overflow));
    const recoveryEvidence = { previousSessionId: positiveMessage.sessionId, newSessionId: final.relay[1].runner[0].sessionId, relay: final.relay[1],
      observer: { ...final.observer, states: final.observer.states.slice(afterNegative.observer.states.length), statuses: final.observer.statuses.slice(afterNegative.observer.statuses.length) } };
    assert.deepEqual(recoveryEvidence.relay.host.find(message => message.type === 'STATE_ACCEPTED').payload, { changeId: 1, revision: 1, durability: 'memory' });
    assert.deepEqual(recoveryEvidence.relay.host.find(message => message.type === 'SNAPSHOT_ACCEPTED').payload, { requestId: 2, revision: 1, durability: 'memory' });
    return { variant: definition.variant, fixtureSha256: hash(definition.source), sourceBytes: Buffer.byteLength(definition.source), fields: definition.manifest.length,
      validation, positiveOriginal, positiveRaw, negativeOriginal, negativeRaw, calibrated, beforeNegative, negativePrecondition, afterNegative, recovered, recoveryEvidence };
  } catch (error) {
    error.detail = { caseId: definition.caseId, variant: definition.variant, positiveOriginal, positiveRaw, negativeOriginal, negativeRaw, validation, calibrated, beforeNegative, negativePrecondition,
      observer: await page.evaluate(() => globalThis.strict02Read?.()).catch(() => null), relay: await page.evaluate(() => globalThis.strict02RelayRead?.()).catch(() => null) }; throw error;
  } finally {
    await page.evaluate(() => globalThis.strict02Channels?.forEach(entry => entry.close())).catch(() => {}); await page.close();
  }
}
export async function checkBridgeBoundary(context, origin, caseId) {
  assert(boundaryCases.includes(caseId)); const pairs = [];
  try { for (const variant of variants(caseId)) pairs.push(await checkPair(context, origin, fixture(caseId, variant))); }
  catch (error) { error.detail = { ...error.detail, completedPairs: pairs }; throw error; }
  return { caseId: `S07/BOUND01/${caseId}`, pairs, limits: 'unchanged', excluded: ['unreachable generic depth/array/object/key maxima', 'isolated UTF16-only guard', 'Host-output maxima'] };
}
