import { createPublicKey, verify, constants } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export const ISSUER = 'https://token.actions.githubusercontent.com';
export const AUDIENCE = 'https://github.com/TaughtMe/HTML-Worksheet/baseline-observation/v1';
export const REPOSITORY = 'TaughtMe/HTML-Worksheet';
export const REPOSITORY_ID = '1432048888';
export const WORKFLOW = `${REPOSITORY}/.github/workflows/baseline-observation.yml`;
export const JWKS_URL = `${ISSUER}/.well-known/jwks`;
const grants = new WeakMap(), pathFailures = new WeakMap(), runGit = promisify(execFile);
class Refusal extends Error {}
const check = (condition, code) => { if (!condition) throw new Refusal(code); };
export const contextFailure = error => error instanceof Refusal ? error.message : 'CI_CONTEXT_UNVERIFIED';
export const contextFailureDetails = error => pathFailures.get(error) ?? null;
function pathKinds(pathname) {
  const parts = pathname.split('/', 18).slice(1);
  if (parts.length > 16) return ['too-many-segments'];
  const literals = new Set(['_apis', 'distributedtask', 'hubs', 'build', 'plans', 'jobs', 'idtoken']);
  return parts.map(part => literals.has(part.toLowerCase()) ? part.toLowerCase()
    : /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(part) ? 'uuid'
      : /^\d+$/.test(part) ? 'integer' : part === '' ? 'empty' : 'opaque');
}
function flatJSON(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes), x = JSON.parse(text);
  check(x && Object.getPrototypeOf(x) === Object.prototype && Object.keys(x).length <= 128, 'OIDC_JSON');
  check(Object.values(x).every(v => v === null || ['string', 'boolean', 'number'].includes(typeof v)), 'OIDC_JSON');
  const tokens = text.match(/"(?:[^"\\]|\\.)*"|true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}:,]/g), keys = new Set();
  for (let i = 1; i < tokens.length - 1; i += 4) {
    const key = JSON.parse(tokens[i]); check(!keys.has(key) && !['__proto__', 'constructor', 'prototype'].includes(key), 'OIDC_DUPLICATE_KEY'); keys.add(key);
  }
  return x;
}
function base64url(value, max) {
  check(typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value) && value.length <= max * 2, 'OIDC_ENCODING');
  const bytes = Buffer.from(value, 'base64url'); check(bytes.length <= max && bytes.toString('base64url') === value, 'OIDC_ENCODING'); return bytes;
}
export function expectedContext(env, checkout) {
  check(env.GITHUB_ACTIONS === 'true' && env.RUNNER_ENVIRONMENT === 'github-hosted' && env.RUNNER_OS === 'Linux' && env.ImageOS === 'ubuntu24', 'CI_PROVIDER_CONTEXT');
  check(env.GITHUB_REPOSITORY === REPOSITORY && env.GITHUB_REPOSITORY_ID === REPOSITORY_ID, 'CI_REPOSITORY');
  check(checkout.clean === true && checkout.workspaceMatches === true && /^[a-f0-9]{40}$/.test(checkout.sha), 'CHECKOUT_UNVERIFIED');
  check(env.GITHUB_SHA === checkout.sha && env.GITHUB_WORKFLOW_SHA === checkout.sha, 'CI_CHECKOUT_SHA');
  check(/^[1-9]\d{0,19}$/.test(env.GITHUB_RUN_ID ?? '') && /^[1-9]\d{0,8}$/.test(env.GITHUB_RUN_ATTEMPT ?? ''), 'CI_RUN');
  const event = env.GITHUB_EVENT_NAME, ref = env.GITHUB_REF;
  check(['workflow_dispatch', 'pull_request'].includes(event), 'CI_EVENT');
  let prNumber = null;
  if (event === 'pull_request') {
    const match = /^refs\/pull\/([1-9]\d{0,8})\/merge$/.exec(ref ?? ''); check(match && env.GITHUB_HEAD_REF === 'feat/security-foundation' && !!env.GITHUB_BASE_REF, 'CI_PR_REF'); prNumber = Number(match[1]);
  } else check(/^refs\/heads\/[A-Za-z0-9][A-Za-z0-9_./-]{0,200}$/.test(ref ?? ''), 'CI_REF');
  check(env.GITHUB_WORKFLOW_REF === `${WORKFLOW}@${ref}`, 'CI_WORKFLOW');
  return { sha: checkout.sha, workflowRef: env.GITHUB_WORKFLOW_REF, ref, event, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT, prNumber, headRef: env.GITHUB_HEAD_REF ?? '', baseRef: env.GITHUB_BASE_REF ?? '' };
}
export function verifyToken(token, jwks, expected, now = Math.floor(Date.now() / 1000)) {
  try {
    check(typeof token === 'string' && token.length <= 24576, 'OIDC_TOKEN_SIZE'); const parts = token.split('.'); check(parts.length === 3, 'OIDC_ENCODING');
    const header = flatJSON(base64url(parts[0], 2048)), claims = flatJSON(base64url(parts[1], 16384)), signature = base64url(parts[2], 512);
    check(Object.keys(header).every(k => ['alg', 'typ', 'kid', 'x5t'].includes(k)) && header.alg === 'RS256' && header.typ === 'JWT' && typeof header.kid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(header.kid), 'OIDC_HEADER');
    check(jwks && Array.isArray(jwks.keys) && jwks.keys.length > 0 && jwks.keys.length <= 32, 'OIDC_JWKS');
    check(new Set(jwks.keys.map(k => k.kid)).size === jwks.keys.length, 'OIDC_JWKS_AMBIGUOUS');
    const key = jwks.keys.find(k => k.kid === header.kid);
    check(key && key.kty === 'RSA' && key.use === 'sig' && (key.alg === undefined || key.alg === 'RS256') && (key.key_ops === undefined || JSON.stringify(key.key_ops) === '["verify"]'), 'OIDC_KEY');
    check(!['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'].some(k => Object.hasOwn(key, k)) && key.e === 'AQAB', 'OIDC_KEY'); base64url(key.n, 512);
    const publicKey = createPublicKey({ key, format: 'jwk' }), bits = publicKey.asymmetricKeyDetails?.modulusLength;
    check(publicKey.asymmetricKeyType === 'rsa' && bits >= 2048 && bits <= 4096, 'OIDC_KEY');
    check(verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), { key: publicKey, padding: constants.RSA_PKCS1_PADDING }, signature), 'OIDC_SIGNATURE');
    check(claims.iss === ISSUER && claims.aud === AUDIENCE, 'OIDC_ISSUER_AUDIENCE');
    check([claims.iat, claims.nbf, claims.exp].every(Number.isSafeInteger) && claims.nbf <= now && claims.iat <= now + 30 && claims.nbf <= claims.iat && claims.iat < claims.exp && claims.exp > now && claims.exp - claims.iat <= 600 && now - claims.iat <= 600, 'OIDC_VALIDITY');
    check(claims.repository === REPOSITORY && claims.repository_id === REPOSITORY_ID && claims.runner_environment === 'github-hosted', 'OIDC_REPOSITORY_RUNNER');
    check(claims.sha === expected.sha && claims.workflow_sha === expected.sha && claims.workflow_ref === expected.workflowRef, 'OIDC_CHECKOUT_WORKFLOW');
    check(claims.run_id === expected.runId && claims.run_attempt === expected.runAttempt && claims.event_name === expected.event && claims.ref === expected.ref, 'OIDC_RUN_REF');
    check(!Object.hasOwn(claims, 'job_workflow_ref') && !Object.hasOwn(claims, 'job_workflow_sha'), 'OIDC_REUSABLE_WORKFLOW');
    check(claims.sub === `repo:${REPOSITORY}:${expected.event === 'pull_request' ? 'pull_request' : 'ref:' + expected.ref}`, 'OIDC_SUBJECT');
    if (expected.event === 'pull_request') check(claims.head_ref === expected.headRef && claims.base_ref === expected.baseRef, 'OIDC_PR_REFS');
    // This plain summary is NOT a grant. Only the fixed production acquisition path can brand one.
    return { issuer: ISSUER, audience: AUDIENCE, repository: REPOSITORY, repositoryId: REPOSITORY_ID, checkoutSha: expected.sha, workflowSha: expected.sha, workflowRef: expected.workflowRef, runId: expected.runId, runAttempt: expected.runAttempt, event: expected.event, ref: expected.ref, runnerEnvironment: 'github-hosted', verifiedAt: now, expiresAt: claims.exp, assumption: 'reviewed ubuntu-24.04 GitHub-hosted guest job without container or namespace wrapper; not a kernel-hierarchy proof' };
  } catch (error) { throw new Refusal(contextFailure(error)); }
}
export function tokenRequestURL(source) {
  try {
    const url = new URL(source), host = url.hostname;
    check(url.protocol === 'https:', 'OIDC_REQUEST_TRANSPORT');
    check(!url.username && !url.password && !url.port && !url.hash, 'OIDC_REQUEST_AUTHORITY');
    // Diagnostics classify rejected inputs only. They never authorize a new host or expose URL data.
    const rejectedHost = /^run-actions-[1-9]\d{0,2}-[1-9]\d{0,2}\.actions\.githubusercontent\.com$/.test(host) ? 'OIDC_REQUEST_HOST_NUMERIC_SHARD'
      : host.endsWith('.actions.githubusercontent.com') ? 'OIDC_REQUEST_HOST_OTHER_ACTIONS' : 'OIDC_REQUEST_HOST_UNTRUSTED';
    check(host === 'pipelines.actions.githubusercontent.com' || /^run-actions-[1-9]\d{0,2}-[a-z][a-z0-9-]{0,80}\.actions\.githubusercontent\.com$/.test(host), rejectedHost);
    const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
    if (!new RegExp(`^/${uuid}/_apis/distributedtask/hubs/build/plans/${uuid}/jobs/${uuid}/idtoken$`, 'i').test(url.pathname)) {
      const error = new Refusal('OIDC_REQUEST_PATH_UNRECOGNIZED');
      pathFailures.set(error, Object.freeze({ pathSegments: Object.freeze(pathKinds(url.pathname)) })); throw error;
    }
    check([...url.searchParams.keys()].length === 1 && url.searchParams.get('api-version') === '2.0', 'OIDC_REQUEST_QUERY_UNRECOGNIZED');
    url.searchParams.set('audience', AUDIENCE); return url;
  } catch (error) { throw error instanceof Refusal ? error : new Refusal('OIDC_REQUEST_PARSE'); }
}
export async function boundedJSON(url, { headers = {}, maxBytes = 131072, fetchImpl = fetch } = {}) {
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 5000); let reader;
  try {
    const response = await fetchImpl(url, { headers, redirect: 'error', signal: abort.signal });
    check(response.status === 200 && /^application\/(?:json|vnd\.github\+json)(?:;|$)/i.test(response.headers.get('content-type') ?? ''), 'NET_RESPONSE');
    const length = response.headers.get('content-length'); check(length === null || (/^\d+$/.test(length) && Number(length) <= maxBytes), 'NET_SIZE');
    reader = response.body.getReader(); const chunks = []; let total = 0;
    while (true) { const part = await reader.read(); if (part.done) break; total += part.value.byteLength; check(total <= maxBytes, 'NET_SIZE'); chunks.push(part.value); }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } catch (error) { throw new Refusal(error instanceof Refusal ? error.message : 'NET_UNVERIFIED'); }
  finally { abort.abort(); clearTimeout(timer); if (reader) void reader.cancel().catch(() => {}); }
}
export function verifyPullRequest(pr, expected) {
  check(pr && pr.number === expected.prNumber && pr.state === 'open' && pr.merged === false && pr.merge_commit_sha === expected.sha, 'PR_MERGE_CONTEXT');
  check(pr.head?.repo?.id === Number(REPOSITORY_ID) && pr.base?.repo?.id === Number(REPOSITORY_ID) && pr.head.repo.full_name === REPOSITORY && pr.base.repo.full_name === REPOSITORY && pr.head.ref === 'feat/security-foundation', 'PR_NOT_SAME_REPOSITORY_BRANCH');
}
export function baselineChildEnvironment(env, engine) {
  // Allowlist only execution paths/locale/proxy trust. Unknown runtime credentials are never inherited.
  const allowed = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'XDG_RUNTIME_DIR', 'XDG_CACHE_HOME', 'PLAYWRIGHT_BROWSERS_PATH', 'CHROMIUM_PATH', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_USE_ENV_PROXY'];
  const result = Object.fromEntries(allowed.filter(key => typeof env[key] === 'string').map(key => [key, env[key]]));
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) if (result[key]) {
    let proxy; try { proxy = new URL(result[key]); } catch { throw new Refusal('CI_RUNTIME_PROXY_UNSUPPORTED'); }
    check(!proxy.username && !proxy.password && !proxy.search && !proxy.hash, 'CI_RUNTIME_PROXY_UNSUPPORTED');
  }
  if (engine !== undefined) result.BROWSER_ENGINE = engine;
  return result;
}
async function readCheckout(env) {
  try {
    const root = await realpath(fileURLToPath(new URL('../../../', import.meta.url)));
    const cleanEnv = baselineChildEnvironment(env);
    const git = async args => (await runGit('/usr/bin/git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-C', root, ...args], { env: cleanEnv, timeout: 2000, maxBuffer: 8192 })).stdout.trim();
    const top = await git(['rev-parse', '--show-toplevel']), sha = await git(['rev-parse', '--verify', 'HEAD']);
    check(await realpath(top) === root && await realpath(env.GITHUB_WORKSPACE) === root, 'CHECKOUT_UNVERIFIED');
    return { sha, clean: (await git(['status', '--porcelain', '--untracked-files=all'])) === '', workspaceMatches: true };
  } catch { throw new Refusal('CHECKOUT_UNVERIFIED'); }
}
export async function acquireCIContext() {
  try {
    // Reject non-CI before any subprocess or network work. Environment assertions alone never grant access.
    check(process.env.GITHUB_ACTIONS === 'true' && process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0' && !process.env.NODE_OPTIONS && process.execArgv.length === 0, 'CI_PROVIDER_CONTEXT');
    const expected = expectedContext(process.env, await readCheckout(process.env));
    const requestURL = tokenRequestURL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL), bearer = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    check(typeof bearer === 'string' && bearer.length > 0 && bearer.length < 16384 && !/[\r\n]/.test(bearer), 'OIDC_REQUEST_CREDENTIAL');
    const reply = await boundedJSON(requestURL, { headers: { Authorization: `Bearer ${bearer}` }, maxBytes: 32768 });
    const jwks = await boundedJSON(JWKS_URL), summary = verifyToken(reply.value, jwks, expected);
    if (expected.event === 'pull_request') verifyPullRequest(await boundedJSON(`https://api.github.com/repos/${REPOSITORY}/pulls/${expected.prNumber}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'html-worksheet-baseline-context' } }), expected);
    check(summary.expiresAt > Math.floor(Date.now() / 1000), 'OIDC_VALIDITY');
    const grant = Object.freeze(summary); grants.set(grant, summary.expiresAt); return grant;
  } catch (error) { throw error instanceof Refusal ? error : new Refusal(contextFailure(error)); }
}
export function validCIContext(grant, now = Math.floor(Date.now() / 1000)) { return !!grant && grants.has(grant) && grants.get(grant) > now; }
