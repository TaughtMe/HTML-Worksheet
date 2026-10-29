import test from 'node:test';
import assert from 'node:assert/strict';
import { Budget, bytes, decode, jsonLimits, validateState, emptyState } from '../src/contract.ts';
const envelope = (payload: unknown = {}) => JSON.stringify({ v: 1, sessionId: 'a'.repeat(32), seq: 1, type: 'READY', payload });
test('JSON bounds and poison keys', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) assert.throws(() => jsonLimits(JSON.parse(`{"${key}":1}`)));
  assert.doesNotThrow(() => jsonLimits('x'.repeat(16384)));
  assert.throws(() => jsonLimits('x'.repeat(16385)));
  let d: unknown = 1; for (let i = 0; i < 16; i++) d = [d]; assert.throws(() => jsonLimits(d));
  assert.throws(() => jsonLimits(Array(2049).fill(null)));
});
test('port strings, exact envelope, version and byte budgets', () => {
  assert.equal(decode(envelope(), [], new Budget()).v, 1);
  for (const data of [{}, 'x'.repeat(393217), envelope().replace('"v":1', '"v":2'), envelope().replace('"seq":1', '"seq":0'), envelope().replace('"payload":{}', '"payload":{},"extra":1')]) assert.throws(() => decode(data, [], new Budget()));
  assert.throws(() => decode(envelope(), [{}] as MessagePort[], new Budget()));
  assert.equal(bytes('é'), 2);
  const atLimit = envelope() + ' '.repeat(393216 - bytes(envelope()));
  assert.doesNotThrow(() => decode(atLimit, [], new Budget()));
  assert.throws(() => decode(atLimit + ' ', [], new Budget()));
  const multi = envelope({ value: 'é'.repeat(8192) });
  assert.doesNotThrow(() => decode(multi + ' '.repeat(393216 - bytes(multi)), [], new Budget()));
  assert.throws(() => decode(multi + ' '.repeat(393217 - bytes(multi)), [], new Budget()));
});
test('token bucket burst and refill; rolling byte window', () => {
  const b = new Budget(); const now = b.last;
  for (let i = 0; i < 20; i++) b.charge(0, now);
  assert.throws(() => b.charge(0, now));
  assert.doesNotThrow(() => b.charge(0, now + 100));
  const c = new Budget(); assert.throws(() => c.charge(4 * 1024 * 1024 + 1, c.last));
});

test('manifest-bound state validates all five kinds and canonicalizes inert strings', () => {
  const m = [
    { id: 'check', kind: 'checkbox', options: [] },
    { id: 'group', kind: 'radio', options: ['r1', 'r2'] },
    { id: 'many', kind: 'select-many', options: ['a', 'b'] },
    { id: 'one', kind: 'select-one', options: ['a', 'b'] },
    { id: 'text', kind: 'text', options: [] },
  ] as const;
  const state = emptyState(m as any);
  state.fields[0].value = true; state.fields[1].value = 'r2'; state.fields[2].value = ['a', 'b']; state.fields[3].value = 'a'; state.fields[4].value = '<b>Antwort</b>';
  assert.deepEqual(validateState(state, m as any), state);
  for (const [index, bad] of [[0, 'true'], [1, 'unknown'], [2, ['b', 'a']], [2, ['a', 'a']], [3, 'unknown'], [4, false]] as const) {
    const copy = structuredClone(state); copy.fields[index].value = bad as any;
    assert.throws(() => validateState(copy, m as any));
  }
  assert.throws(() => validateState({ ...state, destination: 'https://example.invalid' }, m as any));
});
