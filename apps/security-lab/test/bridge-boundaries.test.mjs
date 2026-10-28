import test from 'node:test';
import { boundaryCases, fixture, variants, wire, validatePair } from './bridge-boundary-fixtures.mjs';
test('BOUND01 reachable schema-valid fixtures isolate the intended first failure', () => {
  for (const caseId of boundaryCases) for (const variant of variants(caseId)) {
    const definition = fixture(caseId, variant);
    const wrap = (state, seq, changeId, baseRevision) => JSON.stringify({ v: 1, sessionId: 'a'.repeat(32), seq, type: 'STATE_CHANGED', payload: { changeId, baseRevision, state } });
    const positive = wrap(definition.positive, 3, 1, 0), negativeOriginal = wrap(definition.next, 5, 2, 1);
    validatePair(definition, wire(positive, definition), negativeOriginal, wire(negativeOriginal, definition, true));
  }
});
