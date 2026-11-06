// BOUND01 fixtures exercise reachable standard-fields bounds, never extra schema fields.
import assert from 'node:assert/strict';
import { normalizeStrict } from '../src/strict-import.ts';
import { Budget, bytes, decode, emptyState, validateState } from '../src/contract.ts';
export const boundaryCases = Object.freeze(['message-ascii', 'message-utf8', 'state-bytes', 'text-strings', 'json-values']);
const button = '<button id="toggle" type="button" data-ws-action="toggle-checkbox" data-ws-target="check">Toggle</button>';
export const recoverySource = '<input id="answer" type="text"><input id="check" type="checkbox">' + button;
export function variants(caseId) { return caseId === 'text-strings' ? ['ascii', 'utf8'] : ['default']; }
export function metrics(raw) {
  const envelope = JSON.parse(raw), result = { codeunits: raw.length, utf8Bytes: bytes(raw), stateBytes: bytes(JSON.stringify(envelope.payload.state)), envelopeValues: 0, stateValues: 0, maxStringBytes: 0, depth: 0, maxArray: 0, maxProperties: 0, maxKeyBytes: 0 };
  function visit(value, depth, countStrings = true) {
    result.depth = Math.max(result.depth, depth);
    if (typeof value === 'string' && countStrings) result.maxStringBytes = Math.max(result.maxStringBytes, bytes(value));
    if (Array.isArray(value)) { result.maxArray = Math.max(result.maxArray, value.length); return 1 + value.reduce((n, child) => n + visit(child, depth + 1, countStrings), 0); }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value); result.maxProperties = Math.max(result.maxProperties, entries.length);
      for (const [key] of entries) result.maxKeyBytes = Math.max(result.maxKeyBytes, bytes(key));
      return 1 + entries.reduce((n, [, child]) => n + visit(child, depth + 1, countStrings), 0);
    }
    return 1;
  }
  result.envelopeValues = visit(envelope, 1); result.stateValues = visit(envelope.payload.state, 1, false); return result;
}
export function fixture(caseId, variant = 'default') {
  assert(boundaryCases.includes(caseId) && variants(caseId).includes(variant));
  const options = Array.from({ length: 128 }, (_, i) => `o${String(i).padStart(3, '0')}`);
  const source = caseId === 'state-bytes' ? '<input id="check" type="checkbox">' + Array.from({ length: 17 }, (_, i) => `<input id="t${String(i).padStart(2, '0')}" type="text">`).join('') + button
    : caseId === 'json-values' ? '<input id="check" type="checkbox">' + Array.from({ length: 152 }, (_, i) => `<select id="s${String(i).padStart(3, '0')}" multiple="">${options.map(value => `<option value="${value}"></option>`).join('')}</select>`).join('') + button : recoverySource;
  const template = normalizeStrict(source), positive = emptyState(template.manifest);
  if (caseId === 'state-bytes') {
    for (const field of positive.fields) if (field.kind === 'text') field.value = 'a'.repeat(16000);
    const excess = bytes(JSON.stringify(positive)) - 262144; positive.fields.at(-1).value = positive.fields.at(-1).value.slice(0, -excess);
  } else if (caseId === 'json-values') {
    for (const field of positive.fields) if (field.kind === 'select-many') field.value = options.slice(0, field.id === 's151' ? 49 : 128);
  } else positive.fields[0].value = caseId === 'text-strings' ? (variant === 'utf8' ? 'é'.repeat(8192) : 'a'.repeat(16384)) : caseId === 'message-utf8' ? 'é'.repeat(32) + '-boundary' : 'a-boundary';
  const next = structuredClone(positive);
  if (caseId === 'json-values') next.fields[0].value = true;
  else { const field = next.fields.find(f => f.kind === 'text'); field.value = (field.value[0] === 'é' ? 'è' : 'b') + field.value.slice(1); }
  return { caseId, variant, source, manifest: template.manifest, positive, next, triggerId: caseId === 'json-values' ? 'check' : positive.fields.find(f => f.kind === 'text').id };
}
export function wire(original, definition, over = false) {
  const { caseId } = definition;
  if (caseId.startsWith('message-')) return original + ' '.repeat(393216 + Number(over) - bytes(original)); // JSON whitespace only.
  if (!over) return original;
  const envelope = JSON.parse(original);
  if (caseId === 'json-values') envelope.payload.state.fields.at(-1).value.push('o049');
  else envelope.payload.state.fields.filter(field => field.kind === 'text').at(-1).value += '!'; // Exactly one ASCII byte.
  return JSON.stringify(envelope);
}
export function validatePair(definition, positiveRaw, negativeOriginal, negativeRaw) {
  for (const raw of [positiveRaw, negativeOriginal]) { const message = decode(raw, [], new Budget()); validateState(message.payload.state, definition.manifest); }
  const expected = definition.caseId === 'message-ascii' ? 'MESSAGE_SIZE_TYPE' : definition.caseId === 'message-utf8' ? 'MESSAGE_SIZE' : definition.caseId === 'state-bytes' ? 'STATE' : definition.caseId === 'text-strings' ? 'JSON_TYPE' : 'JSON_LIMIT';
  assert.throws(() => { const message = decode(negativeRaw, [], new Budget()); validateState(message.payload.state, definition.manifest); }, error => error.message === expected);
  const positiveMetrics = metrics(positiveRaw), originalMetrics = metrics(negativeOriginal), negativeMetrics = metrics(negativeRaw);
  const key = definition.caseId.startsWith('message-') ? 'utf8Bytes' : definition.caseId === 'state-bytes' ? 'stateBytes' : definition.caseId === 'text-strings' ? 'maxStringBytes' : 'envelopeValues';
  const limit = key === 'utf8Bytes' ? 393216 : key === 'stateBytes' ? 262144 : key === 'maxStringBytes' ? 16384 : 20000;
  assert.equal(positiveMetrics[key], limit); assert.equal(negativeMetrics[key], limit + 1);
  if (!definition.caseId.startsWith('message-')) assert.equal(originalMetrics[key], limit);
  if (definition.caseId === 'message-utf8') assert(negativeMetrics.codeunits < 393216);
  if (definition.caseId === 'json-values') { assert.equal(positiveMetrics.stateValues, 19992); assert.equal(negativeMetrics.stateValues, 19993); validateState(JSON.parse(negativeRaw).payload.state, definition.manifest); }
  return { key, limit, expectedFirstFailure: expected, positiveMetrics, originalMetrics, negativeMetrics };
}
