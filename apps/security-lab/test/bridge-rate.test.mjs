import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { change, replay, WINDOW_BYTES, MESSAGE_BYTES } from './bridge-rate-fixtures.mjs';
import { assertRateEvidence } from './bridge-rate-harness.mjs';
test('RATE01 schema-valid wire fixtures preserve counters, exact byte pairs and offline rolling model', () => {
  const sid = 'a'.repeat(32), changes = Array.from({ length: 27 }, (_, i) => change(sid, i + 1));
  for (let i = 0; i < changes.length; i++) {
    const x = JSON.parse(changes[i]); assert.equal(x.seq, i + 5); assert.equal(x.payload.changeId, i + 2); assert.equal(x.payload.baseRevision, i + 1);
  }
  for (const over of [false, true]) {
    const sizes = [...Array(10).fill(MESSAGE_BYTES), 262144 + Number(over)];
    const records = sizes.map((size, i) => ({ data: change(sid, i + 1, size), before: 0, after: 0 }));
    assert.equal(records.reduce((sum, item) => sum + Buffer.byteLength(item.data), 0), WINDOW_BYTES + Number(over));
    assert.deepEqual(replay(records, 'before'), [...Array(over ? 10 : 11).fill('accepted'), ...(over ? ['RATE_BYTES'] : [])]);
  }
  const burst = changes.slice(0, 21).map(data => ({ data, before: 0, after: 0 }));
  assert.deepEqual(replay(burst, 'before'), [...Array(20).fill('accepted'), 'RATE']);
  const refill = changes.map((data, i) => ({ data, before: i < 20 ? 0 : 650, after: i < 20 ? 0 : 650 }));
  assert.deepEqual(replay(refill, 'before'), [...Array(26).fill('accepted'), 'RATE']);
  const rolling = [...Array(10).fill(MESSAGE_BYTES), ...Array(3).fill(MESSAGE_BYTES), 262144, undefined]
    .map((size, i) => ({ data: change(sid, i + 1, size), before: i < 3 ? 0 : i < 10 ? 5200 : 10200, after: i < 3 ? 0 : i < 10 ? 5200 : 10200 }));
  assert.deepEqual(replay(rolling, 'before'), [...Array(14).fill('accepted'), 'RATE_BYTES']);
});
test('RATE01 archived native evidence satisfies exact state/complete receipt oracle; injected gaps fail', () => {
  const raw = gunzipSync(readFileSync(new URL('../../../docs/reports/evidence/rate01-local/rate01-chromium.json.gz', import.meta.url)));
  assert.equal(createHash('sha256').update(raw).digest('hex'), '94f918dd63cbff7b30432fb59d2ce09b557321b0c2c761f6589c09aec70d5f03');
  const report = JSON.parse(raw), evidence = [];
  for (const group of report.results) for (const trial of group.detail.trials) {
    evidence.push(trial.outcome);
    if (trial.boundaries.drained) evidence.push(trial.boundaries.drained);
    if (trial.boundaries.atLimit) evidence.push(trial.boundaries.atLimit);
  }
  assert.equal(evidence.length, 7);
  for (const archived of evidence) {
    const restored = structuredClone(archived), entry = restored.channels[0];
    for (const key of ['received', 'injections']) for (const item of entry[key]) {
      item.data = JSON.stringify(item.json) + ' '.repeat(item.paddingBytes);
      assert.equal(Buffer.byteLength(item.data), item.utf8Bytes); assert.equal(createHash('sha256').update(item.data).digest('hex'), item.sha256);
    }
    const count = entry.injections.length, accepted = entry.host.filter(message => message.type === 'STATE_ACCEPTED').length - 1;
    assertRateEvidence(restored, count, accepted);
    const staleRevision = structuredClone(restored);
    staleRevision.observer.states.push(JSON.stringify({ revision: 1, durability: 'memory', state: JSON.parse(entry.injections.at(-1).data).payload.state }));
    assert.throws(() => assertRateEvidence(staleRevision, count, accepted), /Unexpected rendered state/);
    const unexpectedReceive = structuredClone(restored);
    unexpectedReceive.channels[0].received.push({ before: 0, after: 0, ports: 0, data: JSON.stringify({ type: 'UNEXPECTED' }) });
    assert.throws(() => assertRateEvidence(unexpectedReceive, count, accepted));
  }
});
