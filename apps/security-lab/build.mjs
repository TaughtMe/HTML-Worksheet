import { build } from 'esbuild';
const runner = await build({ entryPoints: ['apps/security-lab/src/runner.ts'], bundle: true, format: 'iife', platform: 'browser', target: 'es2022', write: false });
const source = runner.outputFiles[0].text;
if (/<\/script/i.test(source)) throw Error('Runner raw-text boundary');
await build({ entryPoints: ['apps/security-lab/src/host.ts'], bundle: true, format: 'iife', platform: 'browser', target: 'es2022', define: { __RUNNER_SOURCE__: JSON.stringify(source) }, outfile: 'apps/security-lab/dist/host.js' });
console.log('security-lab build complete');
