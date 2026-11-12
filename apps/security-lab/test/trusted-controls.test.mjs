import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('missing control event while click is pending records failure and closes page without unhandled rejection', () => {
  const directory = mkdtempSync(join(tmpdir(), 'worksheet-controls-')), report = join(directory, 'report.json');
  try {
    const script = `
      import { writeFileSync } from 'node:fs';
      import { checkTrustedControls } from ${JSON.stringify(new URL('./trusted-controls.mjs', import.meta.url).href)};
      let closed = false;
      const page = {
        setContent: async () => {}, evaluate: async () => {}, close: async () => { closed = true; },
        waitForEvent: type => type === 'popup' ? Promise.resolve({ close: async () => {} })
          : new Promise((_, reject) => setTimeout(() => reject(Error('SYNTHETIC_EVENT_TIMEOUT')), 20)),
        locator: () => ({ click: () => new Promise(resolve => setTimeout(resolve, 80)) })
      };
      let result;
      try { await checkTrustedControls({ newPage: async () => page }); result = { result: 'pass' }; }
      catch (error) { result = { result: 'fail', error: String(error) }; process.exitCode = 1; }
      finally { writeFileSync(process.argv[2], JSON.stringify({ ...result, closed })); }
    `;
    const child = spawnSync(process.execPath, ['--unhandled-rejections=strict', '--input-type=module', '-', report], { input: script, encoding: 'utf8', timeout: 5000 });
    assert.equal(child.error, undefined); assert.equal(child.signal, null); assert.equal(child.status, 1);
    assert.equal(child.stderr, '');
    assert.deepEqual(JSON.parse(readFileSync(report, 'utf8')), { result: 'fail', error: 'Error: SYNTHETIC_EVENT_TIMEOUT', closed: true });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
