export const TAB_BUDGETS = Object.freeze({ wallMs: 35000, hostCloseMs: 1500, apiCloseMs: 3000, reopenMs: 5000, cleanupMs: 3000 });

// A deadline observes an API call; it cannot cancel it. Late completion is evidence, not retroactive success.
export async function observeStage(name, action, timeoutMs, emit = () => {}) {
  const start = performance.now(); let timer, timedOut = false;
  emit({ type: 'tab-stage-start', name, timeoutMs });
  const pending = Promise.resolve().then(action).then(
    details => ({ outcome: 'completed', details: details ?? null }),
    error => ({ outcome: 'error', error: String(error).slice(0, 1000) }),
  ).then(value => { if (timedOut) emit({ type: 'tab-stage-late', name, elapsedMs: Math.round(performance.now() - start), ...value }); return value; });
  try {
    const value = await Promise.race([pending, new Promise(resolve => { timer = setTimeout(() => { timedOut = true; resolve({ outcome: 'timeout' }); }, timeoutMs); })]);
    const result = { name, elapsedMs: Math.round(performance.now() - start), ...value };
    emit({ type: 'tab-stage-finished', ...result }); return result;
  } finally { clearTimeout(timer); }
}

export function summarizeTabRecovery(run) {
  const measurement = run.result?.kind === 'tab-recovery' ? run.result : run.events.findLast(e => e.type === 'measurement' && e.result?.kind === 'tab-recovery')?.result ?? null;
  const attackStarted = run.events.some(e => e.type === 'attack-started' && e.kind === 'loop');
  const host = measurement?.hostClose, tab = measurement?.apiTabClose, reopen = measurement?.reopen;
  const hostCloseConfirmed = host?.outcome === 'completed' && host.details?.frameCount === 0 && host.details?.hostStatus === 'closed · USER_CLOSE';
  const apiTabCloseConfirmed = tab?.outcome === 'completed' && tab.details?.apiAcknowledged === true && tab.details?.pageClosed === true;
  const sameProfileNewTabFunctional = reopen?.outcome === 'completed' && reopen.details?.sameContext === true && reopen.details?.markerMatches === true && reopen.details?.sameBrowserPid === true && reopen.details?.browserConnected === true;
  const browserFailureObserved = run.events.some(e => ['page-crash', 'browser-disconnected'].includes(e.type));
  const externalStop = run.reason !== null || typeof run.exit?.signal === 'string';
  const cleanupEscalated = run.events.some(e => e.type === 'cleanup-escalation-required');
  const processInterruptionRequired = externalStop || cleanupEscalated;
  const sameBrowserTabRecoveryConfirmed = apiTabCloseConfirmed && sameProfileNewTabFunctional && !browserFailureObserved;
  let verdict, classification;
  if (run.cleanup.remainingActive.length) { verdict = 'fail'; classification = 'cleanup-incomplete'; }
  else if (run.reason && run.reason !== 'external-timeout') { verdict = 'inconclusive'; classification = run.reason; }
  else if (!externalStop && run.exit?.code !== 0) { verdict = 'fail'; classification = 'worker-exit-error'; }
  else if (!attackStarted) { verdict = 'inconclusive'; classification = 'attack-execution-not-confirmed'; }
  else if (browserFailureObserved) { verdict = 'observed-risk'; classification = 'browser-failure-before-cleanup'; }
  else if (!measurement) { verdict = 'observed-risk'; classification = 'measurement-not-completed'; }
  else if (processInterruptionRequired) { verdict = 'observed-risk'; classification = 'process-interruption-required'; }
  else if (!hostCloseConfirmed) { verdict = 'observed-risk'; classification = sameBrowserTabRecoveryConfirmed ? 'host-close-unconfirmed-api-tab-recovery-confirmed' : 'host-close-and-tab-recovery-unconfirmed'; }
  else if (!sameBrowserTabRecoveryConfirmed) { verdict = 'observed-risk'; classification = 'api-tab-recovery-unconfirmed'; }
  else { verdict = 'observation'; classification = 'host-close-and-api-tab-recovery-observed'; }
  return { verdict, classification, attackStarted, hostCloseConfirmed, apiTabCloseConfirmed, sameProfileNewTabFunctional, sameBrowserTabRecoveryConfirmed, processInterruptionRequired, externalStop, cleanupEscalated, browserFailureObserved, measurement };
}
