import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { normalizeStrict } from '../src/strict-import.ts';
import { admissions, policySource, inlineKinds, loaderKinds, resourceKinds } from './policy-fixtures.mjs';
import { policyExpectation, matchesPolicyViolation, assertPolicyReceiverAssets } from './policy-harness.mjs';
const raw = gunzipSync(readFileSync(new URL('../../../docs/reports/evidence/policy01-local/policy01-chromium.json.gz', import.meta.url)));
assert.equal(createHash('sha256').update(raw).digest('hex'), '1977d994c7e7f44be540d8ebde173649eafae610170157498b8cd9fd05113b2f');
const archived = JSON.parse(raw);
test('POLICY01 strict admission rejects the fixed active-source classes before runtime', () => {
  const valid = normalizeStrict(policySource); assert.equal(valid.mode, 'strict-v1'); assert.equal(valid.manifest.length, 2);
  assert.equal(admissions.length, 14); assert.equal(new Set(admissions.map(item => item.id)).size, 14);
  for (const definition of admissions) assert.throws(() => normalizeStrict(definition.source), error => /^STRICT_(ELEMENT|ATTRIBUTE|HEAD)$/.test(error.message), definition.id);
  assert.equal(new Set([...inlineKinds, ...loaderKinds, ...resourceKinds]).size, 19);
});
test('POLICY01 archived sinks require matching enforced directive/target/original policy; foreign events fail', () => {
  let count = 0;
  for (const group of archived.results.filter(item => item.caseId !== 'admission')) {
    const detail = group.detail;
    for (const sink of detail.negative) {
      const blobIndex = ['blob-script', 'import-blob', 'worker-blob'].indexOf(sink.kind);
      const expected = policyExpectation(sink.kind, { nonce: detail.policies.host.nonce, receiver: detail.receiver?.origin,
        blobURL: blobIndex >= 0 ? detail.sinkEvidence.urls[blobIndex] : undefined, after: sink.attempt.at });
      assert(matchesPolicyViolation({ violations: sink.violations, expected }), sink.kind); count++;
      for (const mutation of [{ effectiveDirective: 'connect-src' }, { blockedURI: 'https://foreign.invalid/' }, { originalPolicy: 'default-src *' }, { disposition: 'report' }]) {
        assert.equal(matchesPolicyViolation({ violations: sink.violations.map(event => ({ ...event, ...mutation })), expected }), false, sink.kind);
      }
    }
  }
  assert.equal(count, 19);
});
test('POLICY01 complete receiver histories reject late negative asset hits and unexpected paths', () => {
  let count = 0;
  for (const group of archived.results.filter(item => item.detail.receiver)) {
    const detail = group.detail, controls = [detail.afterPositive, detail.beforeControl, detail.afterControl];
    assertPolicyReceiverAssets(group.caseId, detail.receiver, controls); count++;
    for (const path of ['/asset?kind=external-classic&phase=negative', '/late-unexpected']) {
      const changed = structuredClone(detail.receiver), hit = { at: 'late', method: 'GET', url: path, referer: null };
      changed.fileHits.push(hit); changed.ipcHits.push(hit);
      assert.throws(() => assertPolicyReceiverAssets(group.caseId, changed, controls), /Complete receiver log/);
    }
  }
  assert.equal(count, 2);
});
