import { backupString, check, emptyState, fitTitle, imported, initialInstance, initialRevision, now, parseBackup, recordBytes, templateBytes, stateHash, title, uuid, validateContainer, validateInstance, validateRecords, validateRevision, validateState, validateTemplate, validateTree } from './model.ts';
import type { ContainerKind, ContainerRecord, InstanceRecord, Records, RevisionRecord, State, TemplateRecord, Field } from './model.ts';
export const DATABASE_NAME = 'html-worksheet-v1';
const stores = ['templates', 'instances', 'revisions', 'containers', 'meta'];
interface Usage { key: 'usage'; sourceBytes: number; stateBytes: number; exportBytes: number }
async function capacity(tx: IDBTransaction, sourceDelta: number, stateDelta: number, exportDelta: number) {
  const usage: Usage = await request(tx.objectStore('meta').get('usage'));
  check(usage && Number.isSafeInteger(usage.sourceBytes) && Number.isSafeInteger(usage.stateBytes) && Number.isSafeInteger(usage.exportBytes), 'DATABASE_USAGE');
  const next = { ...usage, sourceBytes: usage.sourceBytes + sourceDelta, stateBytes: usage.stateBytes + stateDelta, exportBytes: usage.exportBytes + exportDelta };
  check(next.sourceBytes >= 0 && next.stateBytes >= 0 && next.exportBytes >= 1024 && next.sourceBytes <= 16 * 1024 * 1024 && next.stateBytes <= 8 * 1024 * 1024 && next.exportBytes <= 32 * 1024 * 1024, 'LIBRARY_BYTES_LIMIT'); tx.objectStore('meta').put(next);
}
const stateSize = (state: State) => new TextEncoder().encode(JSON.stringify(state)).length;
const request = <T>(value: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error ?? Error('IDB_REQUEST')); });
async function transaction<T>(db: IDBDatabase, names: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => Promise<T>, signal?: AbortSignal): Promise<T> {
  check(!signal?.aborted, 'CANCELLED');
  const tx = mode === 'readwrite' ? db.transaction(names, mode, { durability: 'strict' }) : db.transaction(names, mode);
  const done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error ?? Error('IDB_ABORT')); tx.onerror = () => {}; });
  void done.catch(() => {}); const abort = () => { try { tx.abort(); } catch { /* already complete */ } }; signal?.addEventListener('abort', abort, { once: true });
  try { const value = await work(tx); await done; return value; }
  catch (error) { abort(); await done.catch(() => {}); throw error; }
  finally { signal?.removeEventListener('abort', abort); }
}
export class Repository {
  db: IDBDatabase;
  channel: BroadcastChannel | null;
  onChange: () => void = () => {};
  constructor(db: IDBDatabase) {
    this.db = db; this.channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('html-worksheet-invalidation-v1') : null;
    if (this.channel) this.channel.onmessage = () => this.onChange(); // Invalidation only. All data comes from IndexedDB.
    db.onversionchange = () => { this.close(); this.onChange(); };
  }
  static async open(): Promise<Repository> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(DATABASE_NAME, 1); let refused = false;
      open.onblocked = () => { refused = true; reject(Error('DATABASE_BLOCKED')); };
      open.onerror = () => reject(open.error ?? Error('DATABASE_OPEN'));
      open.onupgradeneeded = event => {
        if (event.oldVersion !== 0) { open.transaction!.abort(); return; }
        const db = open.result;
        for (const name of stores) db.createObjectStore(name, { keyPath: name === 'revisions' ? ['instanceId', 'revision'] : name === 'meta' ? 'key' : 'id' });
        open.transaction!.objectStore('meta').add({ key: 'schema', dbVersion: 1, schemaVersion: 1 });
        open.transaction!.objectStore('meta').add({ key: 'usage', sourceBytes: 0, stateBytes: 0, exportBytes: 1024 });
      };
      open.onsuccess = () => { if (refused) open.result.close(); else resolve(open.result); };
    });
    const meta = await transaction(db, ['meta'], 'readonly', tx => request(tx.objectStore('meta').get('schema')));
    check(meta?.dbVersion === 1 && meta.schemaVersion === 1, 'DATABASE_VERSION'); return new Repository(db);
  }
  close() { this.channel?.close(); this.channel = null; this.db.close(); }
  changed() { this.channel?.postMessage({ type: 'changed' }); this.onChange(); }
  async list(): Promise<{ containers: ContainerRecord[]; worksheets: InstanceRecord[] }> {
    const result = await transaction(this.db, ['containers', 'instances'], 'readonly', async tx => ({ containers: await request<ContainerRecord[]>(tx.objectStore('containers').getAll()), worksheets: await request<InstanceRecord[]>(tx.objectStore('instances').getAll()) }));
    validateTree(result.containers); result.worksheets.forEach(validateInstance); return result;
  }
  async read(id: string) {
    const result = await transaction(this.db, ['instances', 'templates', 'revisions'], 'readonly', async tx => {
      const instance: InstanceRecord = await request(tx.objectStore('instances').get(id)); check(instance, 'NOT_FOUND');
      const template: TemplateRecord = await request(tx.objectStore('templates').get(instance.templateVersionId)); check(template, 'MISSING_TEMPLATE');
      const revision: RevisionRecord = await request(tx.objectStore('revisions').get([id, instance.headRevision])); check(revision, 'MISSING_STATE'); return { instance, template, revision };
    });
    validateInstance(result.instance); const parsed = await validateTemplate(result.template); await validateRevision(result.revision, result.instance, result.template); return { ...result, parsed };
  }
  async create(file: File, containerId: string | null) {
    const { template } = await imported(file), instance = initialInstance(template, containerId), revision = await initialRevision(instance.id, emptyState(template.adapterManifest));
    await this.insertNew(template, instance, revision); return instance.id;
  }
  private async insertNew(template: TemplateRecord, instance: InstanceRecord, revision: RevisionRecord) {
    await transaction(this.db, ['templates', 'instances', 'revisions', 'containers', 'meta'], 'readwrite', async tx => {
      if (instance.containerId !== null) check(await request(tx.objectStore('containers').get(instance.containerId)), 'MISSING_PARENT');
      check(await request(tx.objectStore('templates').count()) < 32 && await request(tx.objectStore('instances').count()) < 256, 'LIBRARY_LIMIT');
      await capacity(tx, template.sourceBytes.length, stateSize(revision.state), templateBytes(template) + recordBytes(instance) + recordBytes(revision));
      tx.objectStore('templates').add(template); tx.objectStore('instances').add(instance); tx.objectStore('revisions').add(revision);
    }); this.changed();
  }
  async recover(original: TemplateRecord, candidate: State, name: string) {
    await validateTemplate(original);
    const template: TemplateRecord = { ...original, id: uuid(), sourceBytes: original.sourceBytes.slice(), createdAt: now() }, instance = initialInstance(template, null);
    instance.title = title(fitTitle(name, 250) + ' Kopie');
    const revision = await initialRevision(instance.id, validateState(candidate, template.adapterManifest));
    await this.insertNew(template, instance, revision); return instance.id;
  }
  async copy(id: string, candidate?: State) {
    const original = await this.read(id), instance = initialInstance(original.template, original.instance.containerId);
    instance.title = title(fitTitle(original.instance.title, 250) + ' Kopie');
    const revision = await initialRevision(instance.id, candidate ? validateState(candidate, original.template.adapterManifest) : original.revision.state);
    await transaction(this.db, ['instances', 'revisions', 'containers', 'meta'], 'readwrite', async tx => {
      check(await request(tx.objectStore('instances').get(id)), 'NOT_FOUND');
      if (instance.containerId !== null) check(await request(tx.objectStore('containers').get(instance.containerId)), 'MISSING_PARENT');
      check(await request(tx.objectStore('instances').count()) < 256, 'LIBRARY_LIMIT'); await capacity(tx, 0, stateSize(revision.state), recordBytes(instance) + recordBytes(revision)); tx.objectStore('instances').add(instance); tx.objectStore('revisions').add(revision);
    }); this.changed(); return instance.id;
  }
  async commit(id: string, templateId: string, baseRevision: number, input: State, manifest: Field[], signal: AbortSignal): Promise<{ revision: number; state: State }> {
    const state = validateState(input, manifest), hash = await stateHash(state);
    const result = await transaction(this.db, ['instances', 'revisions', 'meta'], 'readwrite', async tx => {
      const instance: InstanceRecord = await request(tx.objectStore('instances').get(id)); check(instance, 'NOT_FOUND'); validateInstance(instance);
      check(instance.templateVersionId === templateId, 'TEMPLATE_CHANGED'); check(instance.headRevision === baseRevision, 'CONFLICT');
      const previous: RevisionRecord = await request(tx.objectStore('revisions').get([id, baseRevision])); check(previous, 'MISSING_STATE');
      if (previous.stateHash === hash && JSON.stringify(previous.state) === JSON.stringify(state)) return { revision: baseRevision, state };
      check(instance.status !== 'completed', 'READ_ONLY');
      check(Number.isSafeInteger(baseRevision + 1), 'REVISION_OVERFLOW'); const committedAt = now(), revision = baseRevision + 1;
      const next: RevisionRecord = { schemaVersion: 1, instanceId: id, revision, adapterId: 'standard-fields', adapterVersion: 1, state, stateHash: hash, committedAt };
      const nextInstance: InstanceRecord = { ...instance, headRevision: revision, status: 'in-progress', updatedAt: committedAt };
      await capacity(tx, 0, stateSize(state) - stateSize(previous.state), recordBytes(next) - recordBytes(previous) + recordBytes(nextInstance) - recordBytes(instance));
      tx.objectStore('revisions').add(next); tx.objectStore('instances').put(nextInstance);
      if (baseRevision > 0) tx.objectStore('revisions').delete([id, baseRevision - 1]); return { revision, state };
    }, signal);
    this.changed(); return result;
  }
  async createContainer(kind: ContainerKind, value: string, parentId: string | null) {
    const time = now(), container: ContainerRecord = { id: uuid(), schemaVersion: 1, kind, parentId, title: title(value), metadataRevision: 0, createdAt: time, updatedAt: time };
    await transaction(this.db, ['containers', 'meta'], 'readwrite', async tx => {
      const all: ContainerRecord[] = await request(tx.objectStore('containers').getAll()); check(all.filter(x => x.kind === kind).length < (kind === 'notebook' ? 64 : 256), 'LIBRARY_LIMIT'); validateTree([...all, container]); await capacity(tx, 0, 0, recordBytes(container)); tx.objectStore('containers').add(container);
    }); this.changed(); return container.id;
  }
  async editContainer(id: string, expected: number, patch: { title?: string; parentId?: string | null }) {
    await transaction(this.db, ['containers', 'meta'], 'readwrite', async tx => {
      const all: ContainerRecord[] = await request(tx.objectStore('containers').getAll()), current = all.find(x => x.id === id); check(current, 'NOT_FOUND'); check(current.metadataRevision === expected, 'CONFLICT');
      const next = { ...current, ...patch, metadataRevision: expected + 1, updatedAt: now() }; validateContainer(next); validateTree(all.map(x => x.id === id ? next : x)); await capacity(tx, 0, 0, recordBytes(next) - recordBytes(current)); tx.objectStore('containers').put(next);
    }); this.changed();
  }
  async deleteContainer(id: string, expected: number) {
    await transaction(this.db, ['containers', 'instances', 'meta'], 'readwrite', async tx => {
      const all: ContainerRecord[] = await request(tx.objectStore('containers').getAll()), current = all.find(x => x.id === id); check(current, 'NOT_FOUND'); check(current.metadataRevision === expected, 'CONFLICT');
      check(!all.some(x => x.parentId === id) && !(await request<InstanceRecord[]>(tx.objectStore('instances').getAll())).some(x => x.containerId === id), 'CONTAINER_NOT_EMPTY'); await capacity(tx, 0, 0, -recordBytes(current)); tx.objectStore('containers').delete(id);
    }); this.changed();
  }
  async editWorksheet(id: string, expected: number, patch: { title?: string; containerId?: string | null }) {
    await transaction(this.db, ['instances', 'containers', 'meta'], 'readwrite', async tx => {
      const current: InstanceRecord = await request(tx.objectStore('instances').get(id)); check(current, 'NOT_FOUND'); check(current.metadataRevision === expected, 'CONFLICT');
      const next = { ...current, ...patch, metadataRevision: expected + 1, updatedAt: now() }; validateInstance(next);
      if (next.containerId !== null) check(await request(tx.objectStore('containers').get(next.containerId)), 'MISSING_PARENT'); await capacity(tx, 0, 0, recordBytes(next) - recordBytes(current)); tx.objectStore('instances').put(next);
    }); this.changed();
  }
  async deleteWorksheet(id: string, expected: number, expectedHead: number) {
    await transaction(this.db, ['instances', 'revisions', 'templates', 'meta'], 'readwrite', async tx => {
      const current: InstanceRecord = await request(tx.objectStore('instances').get(id)); check(current, 'NOT_FOUND'); check(current.metadataRevision === expected, 'CONFLICT');
      check(current.headRevision === expectedHead, 'CONFLICT');
      const head: RevisionRecord = await request(tx.objectStore('revisions').get([id, current.headRevision])); check(head, 'MISSING_STATE');
      const others: InstanceRecord[] = await request(tx.objectStore('instances').getAll()); let removedSource = 0, removedTemplateBytes = 0;
      if (!others.some(x => x.id !== id && x.templateVersionId === current.templateVersionId)) {
        const template: TemplateRecord = await request(tx.objectStore('templates').get(current.templateVersionId)); check(template, 'MISSING_TEMPLATE'); removedSource = template.sourceBytes.length; removedTemplateBytes = templateBytes(template); tx.objectStore('templates').delete(template.id);
      }
      await capacity(tx, -removedSource, -stateSize(head.state), -removedTemplateBytes - recordBytes(current) - recordBytes(head));
      const revisions = await request<RevisionRecord[]>(tx.objectStore('revisions').getAll()); for (const r of revisions) if (r.instanceId === id) tx.objectStore('revisions').delete([id, r.revision]); tx.objectStore('instances').delete(id);
    }); this.changed();
  }
  async exportBackup(): Promise<string> {
    const data = await transaction(this.db, ['templates', 'instances', 'containers', 'revisions'], 'readonly', async tx => {
      const templates = await request<TemplateRecord[]>(tx.objectStore('templates').getAll()), instances = await request<InstanceRecord[]>(tx.objectStore('instances').getAll()), containers = await request<ContainerRecord[]>(tx.objectStore('containers').getAll()), all = await request<RevisionRecord[]>(tx.objectStore('revisions').getAll());
      return { templates, instances, containers, revisions: instances.map(i => { const r = all.find(r => r.instanceId === i.id && r.revision === i.headRevision); check(r, 'MISSING_STATE'); return r; }) };
    }); return backupString(data);
  }
  async importBackup(file: File) {
    const data = await parseBackup(file), remap = new Map([...data.templates, ...data.instances, ...data.containers].map(x => [x.id, uuid()]));
    const copied: Records = {
      templates: data.templates.map(t => ({ ...t, id: remap.get(t.id)! })),
      containers: data.containers.map(c => ({ ...c, id: remap.get(c.id)!, parentId: c.parentId === null ? null : remap.get(c.parentId)!, metadataRevision: 0 })),
      instances: data.instances.map(i => ({ ...i, id: remap.get(i.id)!, templateVersionId: remap.get(i.templateVersionId)!, containerId: i.containerId === null ? null : remap.get(i.containerId)!, headRevision: 0, metadataRevision: 0 })),
      revisions: data.revisions.map(r => ({ ...r, instanceId: remap.get(r.instanceId)!, revision: 0 }))
    };
    await validateRecords(copied);
    await transaction(this.db, ['templates', 'instances', 'containers', 'revisions', 'meta'], 'readwrite', async tx => {
      check(await request(tx.objectStore('templates').count()) + copied.templates.length <= 32 && await request(tx.objectStore('instances').count()) + copied.instances.length <= 256, 'LIBRARY_LIMIT');
      const containers = await request<ContainerRecord[]>(tx.objectStore('containers').getAll());
      check(containers.filter(c => c.kind === 'folder').length + copied.containers.filter(c => c.kind === 'folder').length <= 256 && containers.filter(c => c.kind === 'notebook').length + copied.containers.filter(c => c.kind === 'notebook').length <= 64, 'LIBRARY_LIMIT'); validateTree([...containers, ...copied.containers]);
      await capacity(tx, copied.templates.reduce((n, t) => n + t.sourceBytes.length, 0), copied.revisions.reduce((n, r) => n + stateSize(r.state), 0), copied.templates.reduce((n, t) => n + templateBytes(t), 0) + [...copied.instances, ...copied.containers, ...copied.revisions].reduce((n, x) => n + recordBytes(x), 0));
      for (const name of ['templates', 'instances', 'containers', 'revisions'] as const) for (const record of copied[name]) tx.objectStore(name).add(record);
    }); this.changed();
  }
}
