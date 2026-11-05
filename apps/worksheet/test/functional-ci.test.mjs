import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkCompleteFlow, functionalStages } from './functional-ci.mjs';
test('functional CI rejects the recorded partial failure, missing stages and wrong actual versions', () => {
  const partial = JSON.parse(readFileSync('docs/reports/evidence/functional-core-app/functional-chromium.json', 'utf8'));
  assert.throws(() => checkCompleteFlow(partial, 'chromium', partial.browserVersion));
  const complete = { engine: 'webkit', browserVersion: '26.0', results: functionalStages.map(name => ({ name, result: 'pass' })), persistentProfileRestarted: true, serverStoppedBeforeOfflineRestart: true,
    offlineProof: { directServerRequestFailed: true, serverFailure: 'ECONNREFUSED' }, screenshots: [{ viewport: { width: 1440, height: 1000 } }, { viewport: { width: 820, height: 1180 } }], pdf: { path: 'offline-answers.pdf', pages: 6 } };
  assert.doesNotThrow(() => checkCompleteFlow(complete, 'webkit', '26.0'));
  for (const mutate of [x => { x.results.pop(); }, x => { x.results[1].result = 'fail'; }, x => { x.persistentProfileRestarted = false; }, x => { x.offlineProof.directServerRequestFailed = false; }, x => { x.browserVersion = 'other'; }, x => { x.screenshots.pop(); }]) {
    const wrong = structuredClone(complete); mutate(wrong); assert.throws(() => checkCompleteFlow(wrong, 'webkit', '26.0'));
  }
});
