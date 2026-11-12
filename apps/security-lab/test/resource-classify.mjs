import { ALLOCATION_BYTES } from './resource-config.mjs';
export function classifyRun({ caseId, cleanup, reason, result, exit, events }) {
  const resource = ['loop', 'allocation'].includes(caseId);
  const attackStarted = events.some(e => e.type === 'attack-started');
  const allocationComplete = events.some(e => e.type === 'allocation-done' && e.bytes === ALLOCATION_BYTES);
  const crash = events.some(e => ['page-crash', 'browser-disconnected'].includes(e.type)) || (typeof exit.signal === 'string' && exit.signal.startsWith('SIG'));
  const riskEvidence = resource && attackStarted ? { crash, externalTimeout: reason === 'external-timeout', uiUnresponsive: events.some(e => e.type === 'ui-probe' && e.responsive === false) } : null;
  let verdict, classification;
  if (cleanup.remainingActive.length) { verdict = 'fail'; classification = 'cleanup-incomplete'; }
  else if (['rss-budget-stop', 'interrupted', 'instrumentation-error', 'worker-error', 'stdio-close-timeout'].includes(reason)) { verdict = 'inconclusive'; classification = reason; }
  else if (caseId === 'allocation' && attackStarted && !allocationComplete) { verdict = 'inconclusive'; classification = 'allocation-did-not-reach-bounded-target'; }
  else if (reason === 'external-timeout') { verdict = resource && attackStarted ? 'observed-risk' : 'fail'; classification = 'external-timeout'; }
  else if (!result) { verdict = resource && attackStarted && crash ? 'observed-risk' : 'fail'; classification = crash ? 'worker-or-browser-crash' : 'missing-result'; }
  else if (result.verdict === 'observed-risk' && !resource) { verdict = 'fail'; classification = 'functional-case-without-required-evidence'; }
  else { ({ verdict, classification } = result); if (exit.code !== 0) { verdict = 'fail'; classification = 'worker-exit-error'; } }
  return { verdict, classification, attackStarted, allocationComplete, riskEvidence };
}
