import assert from 'node:assert/strict';
import { test } from 'node:test';
import { supervise } from './resource-supervisor.mjs';
import { observeStage, summarizeTabRecovery } from './tab-recovery-result.mjs';

if (process.argv[2] === 'loop') {
  process.send({ type: 'attack-started', kind: 'loop' });
  process.send({ type: 'measurement', result: { kind: 'tab-recovery', hostClose: { outcome: 'timeout' } } });
  setInterval(() => {}, 1000);
} else {
  const done = details => ({ outcome: 'completed', details });
  const measurement = {
    kind: 'tab-recovery', hostClose: done({ frameCount: 0, hostStatus: 'closed · USER_CLOSE' }),
    apiTabClose: done({ apiAcknowledged: true, pageClosed: true }),
    reopen: done({ sameContext: true, markerMatches: true, sameBrowserPid: true, browserConnected: true }),
  };
  const run = result => ({ result, reason: null, exit: { code: 0, signal: null }, cleanup: { remainingActive: [] }, events: [{ type: 'attack-started', kind: 'loop' }] });
  test('recovery needs closed old tab and same live profile; blocked host remains a risk', () => {
    assert.equal(summarizeTabRecovery(run(measurement)).verdict, 'observation');
    const hostBlocked = summarizeTabRecovery(run({ ...measurement, hostClose: { outcome: 'timeout' } }));
    assert.equal(hostBlocked.verdict, 'observed-risk'); assert.equal(hostBlocked.sameBrowserTabRecoveryConfirmed, true);
    const closeBlocked = summarizeTabRecovery(run({ ...measurement, apiTabClose: { outcome: 'timeout' } }));
    assert.equal(closeBlocked.sameProfileNewTabFunctional, true); assert.equal(closeBlocked.sameBrowserTabRecoveryConfirmed, false);
    assert.equal(summarizeTabRecovery(run({ ...measurement, reopen: done({ ...measurement.reopen.details, markerMatches: false }) })).sameBrowserTabRecoveryConfirmed, false);
    assert.equal(summarizeTabRecovery({ ...run(measurement), events: [] }).verdict, 'inconclusive');
    assert.equal(summarizeTabRecovery({ ...run(measurement), events: [...run().events, { type: 'page-crash' }] }).sameBrowserTabRecoveryConfirmed, false);
  });
  test('external kill and cleanup escalation are not spontaneous crash or app recovery', () => {
    const killed = summarizeTabRecovery({ ...run(measurement), reason: 'external-timeout', exit: { code: null, signal: 'SIGKILL' } });
    assert.equal(killed.processInterruptionRequired, true); assert.equal(killed.browserFailureObserved, false); assert.equal(killed.verdict, 'observed-risk');
    assert.equal(summarizeTabRecovery({ ...run(measurement), events: [...run().events, { type: 'cleanup-escalation-required' }] }).processInterruptionRequired, true);
    assert.equal(summarizeTabRecovery({ ...run(measurement), reason: 'rss-budget-stop' }).verdict, 'inconclusive');
    assert.equal(summarizeTabRecovery({ ...run(measurement), exit: { code: 1, signal: null } }).verdict, 'fail');
  });
  test('stage deadline preserves late API completion without upgrading the timed-out result', async () => {
    const events = []; let finish;
    const stage = await observeStage('pending', () => new Promise(resolve => { finish = resolve; }), 10, event => events.push(event));
    assert.equal(stage.outcome, 'timeout'); finish({ done: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(stage.outcome, 'timeout'); assert.equal(events.find(e => e.type === 'tab-stage-late').outcome, 'completed');
    assert.equal((await observeStage('error', () => { throw Error('synthetic'); }, 50)).outcome, 'error');
  });
  test('existing external supervisor preserves pre-cleanup measurement on worker timeout', async () => {
    const raw = await supervise('loop', { workerUrl: new URL(import.meta.url), wallMs: 2000 });
    const summary = summarizeTabRecovery(raw);
    assert.equal(raw.reason, 'external-timeout'); assert.equal(raw.cleanup.remainingActive.length, 0);
    assert.equal(summary.measurement.hostClose.outcome, 'timeout'); assert.equal(summary.processInterruptionRequired, true);
    assert.equal(summary.sameBrowserTabRecoveryConfirmed, false); assert.equal(summary.verdict, 'observed-risk');
  });
}
