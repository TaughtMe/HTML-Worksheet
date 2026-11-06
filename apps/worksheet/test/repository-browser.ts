import { Repository, DATABASE_NAME } from '../src/repository.ts';
import { check, emptyState } from '../src/model.ts';
const source = '<input id="answer" type="text"><input id="check" type="checkbox"><button id="toggle" type="button" data-ws-action="toggle-checkbox" data-ws-target="check">Toggle</button>';
const results: { name: string; result: string; elapsedMs: number; error?: string }[] = [];
const same = (a: unknown, b: unknown) => check(JSON.stringify(a) === JSON.stringify(b), 'ASSERT_EQUAL');
const fails = async (fn: () => Promise<unknown>, code: string) => { try { await fn(); } catch (error) { check(String(error).includes(code), 'WRONG_FAILURE:' + String(error)); return; } throw Error('EXPECTED_FAILURE:' + code); };
let repo: Repository;
async function reset() { repo?.close(); await new Promise<void>((resolve, reject) => { const r = indexedDB.deleteDatabase(DATABASE_NAME); r.onsuccess = () => resolve(); r.onerror = () => reject(r.error); r.onblocked = () => reject(Error('RESET_BLOCKED')); }); repo = await Repository.open(); }
async function run(name: string, work: () => Promise<void>) { const start = performance.now(); try { await reset(); await work(); results.push({ name, result: 'pass', elapsedMs: performance.now() - start }); } catch (error) { results.push({ name, result: 'fail', elapsedMs: performance.now() - start, error: String(error) }); } }
async function main() {
  await run('native IDB commit, CAS, stale delete and metadata conflict', async () => {
    const id = await repo.create(new File([source], 'A.html'), null), opened = await repo.read(id), next = emptyState(opened.template.adapterManifest); next.fields[0].value = 'confirmed';
    const other = await Repository.open();
    try {
      await repo.commit(id, opened.template.id, 0, next, opened.template.adapterManifest, new AbortController().signal);
      await fails(() => other.commit(id, opened.template.id, 0, next, opened.template.adapterManifest, new AbortController().signal), 'CONFLICT');
      await fails(() => other.deleteWorksheet(id, 0, 0), 'CONFLICT');
      await other.editWorksheet(id, 0, { title: 'Renamed' }); await fails(() => repo.editWorksheet(id, 0, { title: 'stale' }), 'CONFLICT');
      const saved = await repo.read(id); same(saved.revision.state, next); check(saved.instance.title === 'Renamed' && saved.instance.headRevision === 1);
    } finally { other.close(); }
    repo.close(); repo = await Repository.open(); same((await repo.read(id)).revision.state, next);
  });
  await run('native quota exception and aborted transaction preserve committed head and usage', async () => {
    const id = await repo.create(new File([source], 'A.html'), null), opened = await repo.read(id), next = emptyState(opened.template.adapterManifest); next.fields[0].value = 'must not commit';
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<IDBObjectStore['add']>) { if (this.name === 'revisions') throw new DOMException('Synthetic quota', 'QuotaExceededError'); return Reflect.apply(add, this, args); };
    try { await fails(() => repo.commit(id, opened.template.id, 0, next, opened.template.adapterManifest, new AbortController().signal), 'QuotaExceededError'); }
    finally { IDBObjectStore.prototype.add = add; }
    same((await repo.read(id)).revision.state, opened.revision.state);
    const controller = new AbortController(); controller.abort(); await fails(() => repo.commit(id, opened.template.id, 0, next, opened.template.adapterManifest, controller.signal), 'CANCELLED');
    await repo.commit(id, opened.template.id, 0, next, opened.template.adapterManifest, new AbortController().signal); same((await repo.read(id)).revision.state, next);
  });
  await run('35 import/delete cycles reclaim templates and backup accounting', async () => {
    for (let i = 0; i < 35; i++) { const id = await repo.create(new File([source], 'cycle.html'), null); await repo.deleteWorksheet(id, 0, 0); }
    const json = JSON.parse(await repo.exportBackup()); check(json.templates.length === 0 && json.instances.length === 0);
    await repo.create(new File([source], 'still usable.html'), null); check((await repo.list()).worksheets.length === 1);
  });
  await run('source capacity refuses the ninth import atomically and exports every admitted record', async () => {
    const wrapper = source + '<p></p>', large = source + '<p>' + 'q'.repeat(2 * 1024 * 1024 - wrapper.length) + '</p>';
    for (let i = 0; i < 8; i++) await repo.create(new File([large], `capacity-${i}.html`), null);
    await fails(() => repo.create(new File([source], 'overflow.html'), null), 'LIBRARY_BYTES_LIMIT');
    const json = await repo.exportBackup(), data = JSON.parse(json); check(data.templates.length === 8 && data.instances.length === 8 && new TextEncoder().encode(json).length <= 32 * 1024 * 1024);
    const first = (await repo.list()).worksheets[0]; await repo.deleteWorksheet(first.id, first.metadataRevision, first.headRevision); await repo.create(new File([source], 'capacity recovered.html'), null);
  });
  await run('backup merge remaps identities and malformed backup makes no partial writes', async () => {
    const folder = await repo.createContainer('notebook', 'Heft', null), id = await repo.create(new File([source], 'A.html'), folder), opened = await repo.read(id), next = emptyState(opened.template.adapterManifest); next.fields[0].value = 'Backup answer';
    await repo.commit(id, opened.template.id, 0, next, opened.template.adapterManifest, new AbortController().signal);
    const json = await repo.exportBackup(); await repo.importBackup(new File([json], 'backup.json'));
    const all = await repo.list(); check(all.worksheets.length === 2 && all.containers.length === 2); const copied = all.worksheets.find(x => x.id !== id)!;
    check(copied.templateVersionId !== opened.template.id && copied.containerId !== folder && copied.headRevision === 0); same((await repo.read(copied.id)).revision.state, next);
    const bad = JSON.parse(json); bad.revisions[0].stateHash = '0'.repeat(64); await fails(() => repo.importBackup(new File([JSON.stringify(bad)], 'bad.json')), 'STATE_HASH'); check((await repo.list()).worksheets.length === 2);
  });
  repo?.close(); (globalThis as any).repositoryTestResult = results;
}
void main().catch(error => { repo?.close(); (globalThis as any).repositoryTestResult = [...results, { name: 'harness', result: 'fail', error: String(error) }]; });
