import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkCompleteFlow, functionalStages } from './functional-ci.mjs';
test('functional CI rejects the recorded partial failure, missing stages and wrong actual versions', () => {
  const partial = JSON.parse(readFileSync('docs/reports/evidence/functional-core-app/functional-chromium.json', 'utf8'));
  assert.throws(() => checkCompleteFlow(partial, 'chromium', partial.browserVersion));
  const complete = { engine: 'webkit', browserVersion: '26.0', results: functionalStages.map(name => ({ name, result: 'pass' })), persistentProfileRestarted: true, serverStoppedBeforeOfflineRestart: true,
    offlineProof: { directServerRequestFailed: true, serverFailure: 'ECONNREFUSED' }, screenshots: [{ width: 1440, height: 1000 }, { width: 820, height: 1180 }, { width: 390, height: 844 }].map(viewport => ({ viewport, actions: [{ visible: true, horizontalViewport: true, insideContainer: true }] })), pdf: { path: 'offline-answers.pdf', pages: 6 } };
  assert.doesNotThrow(() => checkCompleteFlow(complete, 'webkit', '26.0'));
  for (const mutate of [x => { x.results.pop(); }, x => { x.results[1].result = 'fail'; }, x => { x.persistentProfileRestarted = false; }, x => { x.offlineProof.directServerRequestFailed = false; }, x => { x.browserVersion = 'other'; }, x => { x.screenshots.pop(); }, x => { x.screenshots[2].actions[0].horizontalViewport = false; }, x => { x.screenshots[1].actions[0].insideContainer = false; }]) {
    const wrong = structuredClone(complete); mutate(wrong); assert.throws(() => checkCompleteFlow(wrong, 'webkit', '26.0'));
  }
});
