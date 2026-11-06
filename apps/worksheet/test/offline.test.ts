import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForActivated } from '../src/offline.ts';
test('cache readiness waits for activated, not merely ready/activating, and refuses redundant workers', async () => {
  const worker = Object.assign(new EventTarget(), { state: 'activating' }); let queried = false;
  const waiting = waitForActivated(worker as unknown as ServiceWorker, 1000).then(() => { queried = true; });
  await Promise.resolve(); assert.equal(queried, false);
  worker.state = 'activated'; worker.dispatchEvent(new Event('statechange')); await waiting; assert.equal(queried, true);
  await waitForActivated(worker as unknown as ServiceWorker, 0);
  worker.state = 'redundant'; await assert.rejects(waitForActivated(worker as unknown as ServiceWorker, 1000), /ersetzt/);
  worker.state = 'activating'; await assert.rejects(waitForActivated(worker as unknown as ServiceWorker, 0), /noch nicht bestätigt/);
});
