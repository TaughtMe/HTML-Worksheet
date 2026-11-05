// CI source/version/completeness evidence only. No browser launch, product API, token or network access.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
export const functionalStages = Object.freeze([
  'UI hierarchy, strict import, every field kind, real snapshot and PDF download',
  'persistent browser profile restarts offline, restores all fields and continues with real PDF',
  'real second tab conflicts without overwrite and preserves candidate as independent working copy',
  'real UI storage failure keeps confirmed state and recovers bounded RAM candidate',
  'actual backup download and merge as new copies retains structure and confirmed answers'
]);
export function checkCompleteFlow(report, engine, expectedVersion) {
  assert.equal(report.engine, engine); assert.equal(report.browserVersion, expectedVersion);
  assert.deepEqual(report.results.map(item => item.name), functionalStages); assert(report.results.every(item => item.result === 'pass'));
  assert.equal(report.persistentProfileRestarted, true); assert.equal(report.serverStoppedBeforeOfflineRestart, true);
  assert.equal(report.offlineProof.directServerRequestFailed, true);
  assert.equal(report.offlineProof.serverFailure, 'ECONNREFUSED');
  assert.equal(report.screenshots.length, 2); assert.deepEqual(report.screenshots.map(item => item.viewport), [{ width: 1440, height: 1000 }, { width: 820, height: 1180 }]);
  assert(report.pdf.pages >= 3); assert.equal(report.pdf.path.endsWith('offline-answers.pdf'), true);
}
const output = 'apps/worksheet/test-results';
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
function registry(engine) {
  const require = createRequire(import.meta.url), core = dirname(require.resolve('playwright-core/package.json'));
  return JSON.parse(readFileSync(join(core, 'browsers.json'), 'utf8')).browsers.find(item => item.name === engine);
}
async function main(mode) {
  const engine = process.env.BROWSER_ENGINE; assert(['chromium', 'firefox', 'webkit'].includes(engine)); mkdirSync(output, { recursive: true });
  if (mode === 'source') {
    const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
    const files = ['.github/workflows/functional-mvp.yml', 'package-lock.json', 'apps/worksheet/test/functional.mjs', 'apps/worksheet/test/functional-ci.mjs', 'apps/worksheet/build.mjs', 'apps/worksheet/ui.ts', 'apps/worksheet/ui.html', 'apps/worksheet/ui.css', 'apps/worksheet/src/app.ts', 'apps/worksheet/src/session.ts', 'apps/worksheet/src/repository.ts', 'apps/worksheet/src/model.ts', 'apps/worksheet/src/pdf.ts', 'apps/worksheet/src/sw.ts', 'apps/worksheet/src/shell.ts', 'apps/security-lab/src/runner.ts', 'apps/security-lab/src/runner-policy.ts', 'apps/security-lab/src/strict-import.ts', 'apps/security-lab/src/contract.ts', 'apps/worksheet/assets/OpenSans-Regular.ttf'];
    const source = { engine, event: process.env.FUNCTIONAL_EVENT, eventSha: process.env.FUNCTIONAL_EVENT_SHA, head: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), trackedClean: git('status', '--porcelain', '--untracked-files=no') === '', nodeVersion: process.version, lockedPlaywright: JSON.parse(readFileSync('package-lock.json', 'utf8')).packages['node_modules/playwright'].version, sha256: Object.fromEntries(files.map(path => [path, hash(path)])) };
    writeFileSync(join(output, 'ci-source.json'), JSON.stringify(source, null, 2)); assert.equal(source.head, source.eventSha); assert.equal(source.trackedClean, true); assert.equal(source.lockedPlaywright, '1.57.0');
  } else if (mode === 'chromium-path') {
    const { chromium } = await import('playwright'); const path = chromium.executablePath(); assert(existsSync(path));
    // Fixed package-owned executable, never the system Chromium fallback in the application harness.
    assert(process.env.GITHUB_ENV); writeFileSync(process.env.GITHUB_ENV, `CHROMIUM_PATH=${path}\n`, { flag: 'a' });
  } else if (mode === 'verify') {
    const verdict = { engine, result: 'fail', expectedVersion: null, actualVersion: null, error: null };
    try {
      const expected = registry(engine); assert(expected?.browserVersion); verdict.expectedVersion = expected.browserVersion;
      const report = JSON.parse(readFileSync(join(output, `functional-${engine}.json`), 'utf8')); verdict.actualVersion = report.browserVersion;
      checkCompleteFlow(report, engine, expected.browserVersion);
      for (const name of ['online-answers.pdf', 'offline-answers.pdf', 'online-answers.pdf.txt', 'offline-answers.pdf.txt', 'backup.json', ...report.screenshots.map(item => item.path.split('/').at(-1))]) assert(readFileSync(join(output, name)).length > 0, `Missing artifact ${name}`);
      const source = JSON.parse(readFileSync(join(output, 'ci-source.json'), 'utf8')); assert.equal(source.head, process.env.FUNCTIONAL_EVENT_SHA);
      for (const [path, expectedHash] of Object.entries(source.sha256)) assert.equal(hash(path), expectedHash, `Changed test source ${path}`);
      for (const screenshot of report.screenshots) assert.equal(hash(screenshot.path), screenshot.sha256);
      assert.equal(hash(report.pdf.path), report.pdf.sha256);
      assert.equal(source.lockedPlaywright, JSON.parse(readFileSync('node_modules/playwright/package.json', 'utf8')).version);
      if (engine === 'chromium') { const { chromium } = await import('playwright'); assert.equal(report.selection.executablePath, chromium.executablePath()); }
      verdict.result = 'pass';
    } catch (error) { verdict.error = String(error); }
    writeFileSync(join(output, 'ci-verdict.json'), JSON.stringify(verdict, null, 2)); console.log(JSON.stringify(verdict)); if (verdict.result !== 'pass') process.exitCode = 1;
  } else throw Error('Unknown functional CI mode');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv[2]);
