import assert from 'node:assert/strict';
import { Budget, bytes, decode, validateState } from '../src/contract.ts';
import { normalizeStrict } from '../src/strict-import.ts';
export const rateCases = Object.freeze(['burst', 'refill', 'byte-limit', 'rolling-window']);
export const source = '<input id="answer" type="text"><input id="check" type="checkbox"><button id="toggle" type="button" data-ws-action="toggle-checkbox" data-ws-target="check">Toggle</button>';
export const manifest = normalizeStrict(source).manifest;
export const WINDOW_BYTES = 4 * 1024 * 1024, MESSAGE_BYTES = 393216;
export function change(sessionId, index, size) {
  const message = { v: 1, sessionId, seq: index + 4, type: 'STATE_CHANGED', payload: { changeId: index + 1, baseRevision: index,
    state: { schemaVersion: 1, fields: [{ id: 'answer', kind: 'text', value: `rate01-candidate-${index}` }, { id: 'check', kind: 'checkbox', value: index % 2 === 0 }] } } };
  const json = JSON.stringify(message), data = json + ' '.repeat((size ?? bytes(json)) - bytes(json));
  assert(bytes(data) <= MESSAGE_BYTES);
  const decoded = decode(data, [], new Budget()); validateState(decoded.payload.state, manifest);
  assert.deepEqual(decoded, message); return data;
}
// This replay is an offline consistency check only; the browser uses its untouched real clock.
export function replay(records, edge) {
  const budget = new Budget(); budget.last = records[0][edge];
  return records.map(record => {
    try { budget.charge(bytes(record.data), record[edge]); return 'accepted'; }
    catch (error) { return error.message; }
  });
}
