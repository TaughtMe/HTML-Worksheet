import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
const runner = await build({ entryPoints: ['apps/security-lab/src/runner.ts'], bundle: true, format: 'iife', platform: 'browser', target: 'es2022', write: false });
const runnerSource = runner.outputFiles[0].text; if (/<\/script/i.test(runnerSource)) throw Error('Runner raw-text boundary');
const font = await readFile('apps/worksheet/assets/OpenSans-Regular.ttf');
await mkdir('apps/worksheet/dist', { recursive: true });
await build({ entryPoints: ['apps/worksheet/src/app.ts'], bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: true, define: { __RUNNER_SOURCE__: JSON.stringify(runnerSource), __PDF_FONT_BASE64__: JSON.stringify(font.toString('base64')) }, outfile: 'apps/worksheet/dist/app.js' });
const html = await readFile('apps/worksheet/ui.html', 'utf8'), css = await readFile('apps/worksheet/ui.css', 'utf8'); if (/<\/style/i.test(css)) throw Error('Style raw-text boundary');
const dist = 'apps/worksheet/dist';
const digest = bytes => 'sha256-' + createHash('sha256').update(bytes).digest('base64');
const jsIntegrity = digest(await readFile(dist + '/app.js'));
const release = new Date().toISOString().replace(/[-:]/g, '').replace('T', '.').replace('Z', '');
const shell = html.replace('__APP_STYLE__', () => css)
  .replace('__APP_VERSION__', release).replace('__APP_INTEGRITY__', jsIntegrity);
await writeFile(dist + '/shell-template', shell);
const shellIntegrity = digest(shell);
await build({
  entryPoints: ['apps/worksheet/src/sw.ts'], bundle: true, format: 'iife', platform: 'browser',
  target: 'es2022', minify: true, outfile: dist + '/sw.js',
  define: {
    __APP_VERSION__: JSON.stringify(release), __SHELL_INTEGRITY__: JSON.stringify(shellIntegrity),
    __JS_INTEGRITY__: JSON.stringify(jsIntegrity)
  }
});
const pages = dist + '/pages';
await mkdir(pages, { recursive: true });
await copyFile(dist + '/app.js', pages + '/app.js');
await copyFile(dist + '/sw.js', pages + '/sw.js');
await copyFile(dist + '/shell-template', pages + '/shell-template.txt');
await build({ entryPoints: ['apps/worksheet/pages.mjs'], bundle: true, format: 'esm',
  platform: 'browser', target: 'es2022', outfile: pages + '/_worker.js' });
console.log('Worksheet build', release);
