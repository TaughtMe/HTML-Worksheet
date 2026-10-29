import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, constants } from 'node:crypto';
import { verifyToken, expectedContext, tokenRequestURL, contextFailure, contextFailureDetails, verifyPullRequest, boundedJSON, validCIContext, baselineChildEnvironment, ISSUER, AUDIENCE, REPOSITORY, REPOSITORY_ID, WORKFLOW } from './baseline-context.mjs';
import { assessReserve, headroomDecision, ADMISSION_HEADROOM } from './baseline-memory.mjs';
const pair = generateKeyPairSync('rsa', { modulusLength: 2048 }), wrongPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' }, jwks = { keys: [publicJwk] };
const now = 1800000000, sha = 'a'.repeat(40);
const env = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_OS: 'Linux', ImageOS: 'ubuntu24', GITHUB_REPOSITORY: REPOSITORY, GITHUB_REPOSITORY_ID: REPOSITORY_ID, GITHUB_SHA: sha, GITHUB_WORKFLOW_SHA: sha, GITHUB_WORKFLOW_REF: `${WORKFLOW}@refs/heads/feat/security-foundation`, GITHUB_REF: 'refs/heads/feat/security-foundation', GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '1', GITHUB_EVENT_NAME: 'workflow_dispatch' };
const checkout = { sha, clean: true, workspaceMatches: true }, expected = expectedContext(env, checkout);
const claims = { iss: ISSUER, aud: AUDIENCE, iat: now - 5, nbf: now - 10, exp: now + 295, repository: REPOSITORY, repository_id: REPOSITORY_ID, runner_environment: 'github-hosted', sha, workflow_sha: sha, workflow_ref: expected.workflowRef, run_id: expected.runId, run_attempt: '1', event_name: 'workflow_dispatch', ref: expected.ref, sub: `repo:${REPOSITORY}:ref:${expected.ref}` };
const encode = x => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
function token(payload = claims, header = { alg: 'RS256', typ: 'JWT', kid: 'test-key' }, privateKey = pair.privateKey) {
  const input = encode(header) + '.' + encode(payload); return input + '.' + sign('RSA-SHA256', Buffer.from(input), { key: privateKey, padding: constants.RSA_PKCS1_PADDING }).toString('base64url');
}
let cases = 0;
const rejected = fn => { assert.throws(fn); cases++; };
const good = verifyToken(token(), jwks, expected, now); assert.equal(good.checkoutSha, sha); assert.equal(validCIContext(good), false); cases++;
for (const [key, value] of Object.entries({ iss: 'https://other.invalid', aud: 'other', repository: 'other/repo', repository_id: '1', runner_environment: 'self-hosted', sha: 'b'.repeat(40), workflow_sha: 'b'.repeat(40), workflow_ref: expected.workflowRef.replace('baseline-observation', 'other'), run_id: '12346', run_attempt: '2', event_name: 'pull_request_target', ref: 'refs/heads/other', sub: 'other', iat: now + 60, nbf: now + 1, exp: now })) rejected(() => verifyToken(token({ ...claims, [key]: value }), jwks, expected, now));
rejected(() => verifyToken(token({ ...claims, exp: now + 601 }), jwks, expected, now));
rejected(() => verifyToken(token({ ...claims, job_workflow_ref: 'reusable' }), jwks, expected, now));
rejected(() => verifyToken(token(claims, undefined, wrongPair.privateKey), jwks, expected, now));
for (const extra of [{ alg: 'none' }, { alg: 'HS256' }, { kid: 'unknown' }, { jku: 'https://other.invalid' }, { crit: 'unknown' }]) rejected(() => verifyToken(token(claims, { alg: 'RS256', typ: 'JWT', kid: 'test-key', ...extra }), jwks, expected, now));
rejected(() => verifyToken(token(), { keys: [publicJwk, publicJwk] }, expected, now));
rejected(() => verifyToken(token(), { keys: [{ ...publicJwk, use: 'enc' }] }, expected, now));
rejected(() => verifyToken(token(), { keys: [{ ...publicJwk, d: 'private' }] }, expected, now));
rejected(() => verifyToken(token('{"iss":"duplicate",' + JSON.stringify(claims).slice(1)), jwks, expected, now));
rejected(() => verifyToken('x'.repeat(24577), jwks, expected, now));
for (const change of [{ GITHUB_ACTIONS: 'false' }, { RUNNER_ENVIRONMENT: 'self-hosted' }, { ImageOS: 'ubuntu22' }, { GITHUB_REPOSITORY_ID: '1' }, { GITHUB_WORKFLOW_SHA: 'b'.repeat(40) }, { GITHUB_EVENT_NAME: 'pull_request_target' }, { GITHUB_RUN_ATTEMPT: '' }]) rejected(() => expectedContext({ ...env, ...change }, checkout));
rejected(() => expectedContext(env, { ...checkout, clean: false })); rejected(() => expectedContext(env, { ...checkout, workspaceMatches: false }));
const prEnv = { ...env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/pull/1/merge', GITHUB_WORKFLOW_REF: `${WORKFLOW}@refs/pull/1/merge`, GITHUB_HEAD_REF: 'feat/security-foundation', GITHUB_BASE_REF: 'main' }, prExpected = expectedContext(prEnv, checkout);
const prClaims = { ...claims, event_name: 'pull_request', ref: prExpected.ref, workflow_ref: prExpected.workflowRef, sub: `repo:${REPOSITORY}:pull_request`, head_ref: 'feat/security-foundation', base_ref: 'main' };
assert.equal(verifyToken(token(prClaims), jwks, prExpected, now).event, 'pull_request'); cases++;
const repo = { id: Number(REPOSITORY_ID), full_name: REPOSITORY }, pr = { number: 1, state: 'open', merged: false, merge_commit_sha: sha, head: { repo, ref: 'feat/security-foundation' }, base: { repo } };
verifyPullRequest(pr, prExpected); cases++;
for (const bad of [{ ...pr, head: { repo: { ...repo, id: 2 }, ref: 'feat/security-foundation' } }, { ...pr, head: { repo, ref: 'other' } }, { ...pr, merge_commit_sha: 'b'.repeat(40) }, { ...pr, state: 'closed' }, { ...pr, number: 2 }]) rejected(() => verifyPullRequest(bad, prExpected));
const uuid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', endpoint = `https://run-actions-1-azure-eastus.actions.githubusercontent.com/${uuid}/_apis/distributedtask/hubs/build/plans/${uuid}/jobs/${uuid}/idtoken?api-version=2.0`;
assert.equal(tokenRequestURL(endpoint).searchParams.get('audience'), AUDIENCE); cases++;
for (const bad of [endpoint.replace('https:', 'http:'), endpoint.replace('run-actions-1-azure-eastus.actions.githubusercontent.com', 'attacker.invalid'), endpoint + '&audience=other', endpoint.replace('/idtoken?', '/other?'), endpoint.replace('https://', 'https://user:password@'), endpoint + '#fragment']) rejected(() => tokenRequestURL(bad));
// Failure output is a fixed enum, never a hostname, path, query or parser error containing input.
for (const [source, code] of [
  [endpoint.replace('https:', 'http:'), 'OIDC_REQUEST_TRANSPORT'],
  [endpoint.replace('https://', 'https://synthetic-sensitive:password@'), 'OIDC_REQUEST_AUTHORITY'],
  [endpoint.replace('run-actions-1-azure-eastus', 'run-actions-3-1'), 'OIDC_REQUEST_HOST_NUMERIC_SHARD'],
  [endpoint.replace('run-actions-1-azure-eastus', 'synthetic-sensitive'), 'OIDC_REQUEST_HOST_OTHER_ACTIONS'],
  [endpoint.replace('run-actions-1-azure-eastus.actions.githubusercontent.com', 'synthetic-sensitive.invalid'), 'OIDC_REQUEST_HOST_UNTRUSTED'],
  [endpoint.replace('/idtoken?', '/synthetic-sensitive?'), 'OIDC_REQUEST_PATH_UNRECOGNIZED'],
  [endpoint + '&synthetic-sensitive=value', 'OIDC_REQUEST_QUERY_UNRECOGNIZED'],
  ['synthetic-sensitive invalid url', 'OIDC_REQUEST_PARSE']
]) {
  assert.throws(() => tokenRequestURL(source), error => {
    const diagnostic = contextFailure(error);
    assert.equal(diagnostic, code); assert.equal(diagnostic.includes('synthetic-sensitive'), false);
    assert.equal(diagnostic.includes('https:'), false); assert.equal(diagnostic.includes('.com'), false);
    return true;
  }); cases++;
}
for (const [pathname, expectedKinds] of [
  [`/_APIS/distributedtask/hubs/build/plans/${uuid}/jobs/${uuid}/idtoken`, ['_apis', 'distributedtask', 'hubs', 'build', 'plans', 'uuid', 'jobs', 'uuid', 'idtoken']],
  [`/${uuid}/123/_apis/distributedtask`, ['uuid', 'integer', '_apis', 'distributedtask']],
  [`/synthetic-sensitive/%73ecret//123/${uuid}/`, ['opaque', 'opaque', 'empty', 'integer', 'uuid', 'empty']],
  ['/' + Array(17).fill('synthetic-sensitive').join('/'), ['too-many-segments']],
  ['/' + Array(16).fill('synthetic-sensitive').join('/'), Array(16).fill('opaque')],
  ['/%5fapis/synthetic-sensitive', ['opaque', 'opaque']]
]) {
  assert.throws(() => tokenRequestURL(`https://pipelines.actions.githubusercontent.com${pathname}?synthetic-sensitive=credential`), error => {
    assert.equal(contextFailure(error), 'OIDC_REQUEST_PATH_UNRECOGNIZED');
    const details = contextFailureDetails(error); assert.deepEqual(details, { pathSegments: expectedKinds });
    assert(Object.isFrozen(details) && Object.isFrozen(details.pathSegments));
    const serialized = JSON.stringify(details); assert.equal(serialized.includes('synthetic-sensitive'), false);
    assert.equal(serialized.includes('credential'), false); assert.equal(serialized.includes(uuid), false);
    return true;
  }); cases++;
}
assert.throws(() => tokenRequestURL('https://synthetic-sensitive.invalid/private?credential=value'), error => { assert.equal(contextFailureDetails(error), null); return true; }); cases++;
assert.equal(contextFailureDetails(Object.assign(new Error('OIDC_REQUEST_PATH_UNRECOGNIZED'), { pathSegments: ['synthetic-sensitive'] })), null); cases++;
const child = baselineChildEnvironment({ PATH: '/usr/bin', HOME: '/tmp/home', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic-sensitive', ACTIONS_ID_TOKEN_REQUEST_URL: endpoint, GITHUB_TOKEN: 'synthetic-sensitive', GH_TOKEN: 'synthetic-sensitive', AWS_SECRET_ACCESS_KEY: 'synthetic-sensitive', UNKNOWN_RUNTIME_CREDENTIAL: 'synthetic-sensitive', HTTP_PROXY: 'http://proxy:8080' }, 'chromium');
assert.equal(child.BROWSER_ENGINE, 'chromium'); assert.equal(Object.values(child).includes('synthetic-sensitive'), false); assert.equal(child.HTTP_PROXY, 'http://proxy:8080'); cases++;
rejected(() => baselineChildEnvironment({ HTTPS_PROXY: 'https://user:password@proxy' }));
const visible = { reason: 'cgroup-namespace-unproven', mountRoot: '/', host: { totalBytes: 8 * 1024 ** 3, availableBytes: ADMISSION_HEADROOM }, groups: [{ currentBytes: 0, maxBytes: null, highBytes: null, oom: 0, oomKill: 0 }] };
assert.equal(headroomDecision(visible).ok, true); assert.equal(assessReserve(visible, ADMISSION_HEADROOM, good).ok, false); cases++;
assert.equal(headroomDecision({ ...visible, host: { ...visible.host, availableBytes: ADMISSION_HEADROOM - 1 } }).ok, false); cases++;
let requests = 0;
const okFetch = async (url, options) => { requests++; assert.equal(options.redirect, 'error'); assert.equal(options.signal.aborted, false); return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }); };
assert.equal((await boundedJSON('https://synthetic.invalid', { fetchImpl: okFetch })).ok, true); assert.equal(requests, 1); cases++;
for (const response of [new Response('redirect', { status: 302 }), new Response('html', { headers: { 'Content-Type': 'text/html' } }), new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '999999' } }), new Response('x'.repeat(100), { headers: { 'Content-Type': 'application/json' } }), new Response('not json synthetic-sensitive', { headers: { 'Content-Type': 'application/json' } })]) {
  await assert.rejects(() => boundedJSON('https://synthetic.invalid', { fetchImpl: async () => response, maxBytes: 32 }), error => !error.message.includes('synthetic-sensitive')); cases++;
}
await assert.rejects(() => boundedJSON('https://synthetic.invalid', { fetchImpl: async () => { throw Error('synthetic-sensitive'); } }), error => error.message === 'NET_UNVERIFIED'); cases++;
const timeoutStarted = performance.now();
await assert.rejects(() => boundedJSON('https://synthetic.invalid', { fetchImpl: async (_, options) => new Response(new ReadableStream({ start(controller) { options.signal.addEventListener('abort', () => controller.error(Error('synthetic-sensitive')), { once: true }); } }), { headers: { 'Content-Type': 'application/json' } }) }), error => error.message === 'NET_UNVERIFIED');
assert(performance.now() - timeoutStarted < 6500); cases++;
console.log(`OIDC synthetic signature/claims/checkout/PR/target/transport/credential checks passed (${cases} cases); no network, token or browser output`);
