import { bytes, emptyState, exact, revision, validateState } from '../../security-lab/src/contract.ts';
import type { State, Field } from '../../security-lab/src/contract.ts';
import { importStrictFile, normalizeStrict } from '../../security-lab/src/strict-import.ts';
import type { StrictTemplate } from '../../security-lab/src/strict-import.ts';
import type { ContainerKind, ContainerView, WorksheetView } from '../types.ts';
export interface TemplateRecord { id: string; schemaVersion: 1; sourceBytes: Uint8Array; sourceHash: string; mediaType: 'text/html'; encoding: 'utf-8'; title: string; adapterId: 'standard-fields'; adapterVersion: 1; adapterManifest: Field[]; createdAt: string }
export interface InstanceRecord extends WorksheetView { schemaVersion: 1; createdAt: string }
export interface ContainerRecord extends ContainerView { schemaVersion: 1; createdAt: string; updatedAt: string }
export interface RevisionRecord { schemaVersion: 1; instanceId: string; revision: number; adapterId: 'standard-fields'; adapterVersion: 1; state: State; stateHash: string; committedAt: string }
export interface Records { templates: TemplateRecord[]; instances: InstanceRecord[]; containers: ContainerRecord[]; revisions: RevisionRecord[] }
export const uuid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export function check(ok: unknown, code = 'INVALID_DATA'): asserts ok { if (!ok) throw Error(code); }
export function validId(x: unknown): x is string { return typeof x === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x); }
export function title(x: unknown): string { check(typeof x === 'string' && x.trim().length && bytes(x) <= 256, 'INVALID_TITLE'); return x; }
export function fitTitle(value: string, limit = 256): string { let result = ''; for (const c of value.trim()) { if (bytes(result + c) > limit) break; result += c; } return result || 'Arbeitsblatt'; }
export const fileTitle = (name: string) => fitTitle(name.replace(/\.html?$/i, ''));
export function date(x: unknown): void { check(typeof x === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x) && new Date(x).toISOString() === x); }
export async function sha(data: Uint8Array): Promise<string> { const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(data).buffer); return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join(''); }
export const stateHash = (state: State) => sha(new TextEncoder().encode(JSON.stringify(state)));
// Conservative backup accounting: one comma per record plus a fixed envelope reserve in meta.
export const recordBytes = (record: unknown) => bytes(JSON.stringify(record)) + 1;
export const templateBytes = (t: TemplateRecord) => recordBytes({ ...t, sourceBytes: { encoding: 'base64', data: '' } }) + 4 * Math.ceil(t.sourceBytes.length / 3);
export async function imported(file: File): Promise<{ template: TemplateRecord; parsed: StrictTemplate }> {
  const parsed = await importStrictFile(file), createdAt = now();
  return { parsed, template: { id: uuid(), schemaVersion: 1, sourceBytes: parsed.sourceBytes, sourceHash: await sha(parsed.sourceBytes), mediaType: 'text/html', encoding: 'utf-8', title: fileTitle(file.name), adapterId: 'standard-fields', adapterVersion: 1, adapterManifest: parsed.manifest, createdAt } };
}
export async function validateTemplate(t: TemplateRecord): Promise<StrictTemplate> {
  check(exact(t, ['id', 'schemaVersion', 'sourceBytes', 'sourceHash', 'mediaType', 'encoding', 'title', 'adapterId', 'adapterVersion', 'adapterManifest', 'createdAt']));
  check(validId(t.id) && t.schemaVersion === 1 && t.sourceBytes instanceof Uint8Array && t.mediaType === 'text/html' && t.encoding === 'utf-8' && t.adapterId === 'standard-fields' && t.adapterVersion === 1);
  title(t.title); date(t.createdAt); check(t.sourceHash === await sha(t.sourceBytes), 'SOURCE_HASH');
  const parsed = normalizeStrict(new TextDecoder('utf-8', { fatal: true }).decode(t.sourceBytes), new Uint8Array(t.sourceBytes));
  check(JSON.stringify(parsed.manifest) === JSON.stringify(t.adapterManifest), 'MANIFEST'); return parsed;
}
export function validateInstance(x: InstanceRecord): void {
  check(exact(x, ['id', 'schemaVersion', 'templateVersionId', 'containerId', 'title', 'status', 'headRevision', 'metadataRevision', 'createdAt', 'updatedAt']));
  check(validId(x.id) && x.schemaVersion === 1 && validId(x.templateVersionId) && (x.containerId === null || validId(x.containerId)) && ['draft', 'in-progress', 'completed'].includes(x.status) && revision(x.headRevision) && revision(x.metadataRevision));
  title(x.title); date(x.createdAt); date(x.updatedAt);
}
export function validateContainer(x: ContainerRecord): void {
  check(exact(x, ['id', 'schemaVersion', 'kind', 'parentId', 'title', 'metadataRevision', 'createdAt', 'updatedAt']));
  check(validId(x.id) && x.schemaVersion === 1 && ['folder', 'notebook'].includes(x.kind) && (x.parentId === null || validId(x.parentId)) && revision(x.metadataRevision));
  title(x.title); date(x.createdAt); date(x.updatedAt);
}
export function validateTree(containers: ContainerRecord[]): void {
  const ids = new Map(containers.map(x => [x.id, x])); check(ids.size === containers.length, 'DUPLICATE_ID');
  for (const item of containers) { validateContainer(item); let node: ContainerRecord | undefined = item, depth = 0; const seen = new Set();
    while (node) { check(!seen.has(node.id) && ++depth <= 16, 'CONTAINER_CYCLE_DEPTH'); seen.add(node.id); if (node.parentId === null) break; node = ids.get(node.parentId); check(node, 'MISSING_PARENT'); }
  }
}
export async function validateRevision(x: RevisionRecord, instance: InstanceRecord, template: TemplateRecord): Promise<void> {
  check(exact(x, ['schemaVersion', 'instanceId', 'revision', 'adapterId', 'adapterVersion', 'state', 'stateHash', 'committedAt']));
  check(x.schemaVersion === 1 && x.instanceId === instance.id && x.revision === instance.headRevision && x.adapterId === 'standard-fields' && x.adapterVersion === 1);
  date(x.committedAt); const state = validateState(x.state, template.adapterManifest); check(x.stateHash === await stateHash(state), 'STATE_HASH');
}
export function initialInstance(template: TemplateRecord, containerId: string | null, id = uuid()): InstanceRecord {
  const time = now(); return { id, schemaVersion: 1, templateVersionId: template.id, containerId, title: template.title, status: 'draft', headRevision: 0, metadataRevision: 0, createdAt: time, updatedAt: time };
}
export async function initialRevision(instanceId: string, state: State): Promise<RevisionRecord> { return { schemaVersion: 1, instanceId, revision: 0, adapterId: 'standard-fields', adapterVersion: 1, state, stateHash: await stateHash(state), committedAt: now() }; }
function base64(data: Uint8Array): string { let text = ''; for (let i = 0; i < data.length; i += 32768) text += String.fromCharCode(...data.subarray(i, i + 32768)); return btoa(text); }
function unbase64(value: unknown): Uint8Array { check(exact(value, ['encoding', 'data']) && value.encoding === 'base64' && typeof value.data === 'string' && value.data.length <= 2796204 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.data), 'BASE64'); const result = Uint8Array.from(atob(value.data), c => c.charCodeAt(0)); check(base64(result) === value.data, 'BASE64'); return result; }
export async function validateRecords(data: Records): Promise<void> {
  check(data.templates.length <= 32 && data.instances.length <= 256 && data.containers.filter(x => x.kind === 'notebook').length <= 64 && data.containers.filter(x => x.kind === 'folder').length <= 256, 'BACKUP_LIMIT');
  const templates = new Map(data.templates.map(t => [t.id, t])), instances = new Map(data.instances.map(x => [x.id, x]));
  const entityIds = [...data.templates, ...data.instances, ...data.containers].map(x => x.id); check(new Set(entityIds).size === entityIds.length, 'DUPLICATE_ID');
  check(templates.size === data.templates.length && instances.size === data.instances.length && data.revisions.length === data.instances.length, 'DUPLICATE_ID'); validateTree(data.containers);
  check(data.templates.reduce((n, t) => n + t.sourceBytes.length, 0) <= 16 * 1024 * 1024 && data.revisions.reduce((n, r) => n + bytes(JSON.stringify(r.state)), 0) <= 8 * 1024 * 1024, 'BACKUP_LIMIT');
  for (const t of data.templates) await validateTemplate(t);
  const revisionIds = new Set();
  for (const x of data.instances) { validateInstance(x); check(templates.has(x.templateVersionId) && (x.containerId === null || data.containers.some(c => c.id === x.containerId)), 'MISSING_REFERENCE'); }
  for (const r of data.revisions) { check(!revisionIds.has(r.instanceId) && instances.has(r.instanceId), 'REVISION_REFERENCE'); revisionIds.add(r.instanceId); const instance = instances.get(r.instanceId)!; await validateRevision(r, instance, templates.get(instance.templateVersionId)!); }
}
export async function backupString(data: Records): Promise<string> {
  await validateRecords(data);
  const result = JSON.stringify({ format: 'html-worksheet-backup', formatVersion: 1, createdAt: now(), ...data, templates: data.templates.map(t => ({ ...t, sourceBytes: { encoding: 'base64', data: base64(t.sourceBytes) } })) });
  check(bytes(result) <= 32 * 1024 * 1024, 'BACKUP_LIMIT'); return result;
}
export async function parseBackup(file: Pick<File, 'size' | 'arrayBuffer'>): Promise<Records> {
  check(file.size <= 32 * 1024 * 1024, 'BACKUP_LIMIT'); const input = new Uint8Array(await file.arrayBuffer()); check(input.length <= 32 * 1024 * 1024, 'BACKUP_LIMIT');
  const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(input));
  const depth = (value: any, n = 1): void => { check(n <= 32, 'BACKUP_DEPTH'); if (value && typeof value === 'object') for (const child of Object.values(value)) depth(child, n + 1); }; depth(data);
  check(exact(data, ['format', 'formatVersion', 'createdAt', 'templates', 'instances', 'containers', 'revisions']) && data.format === 'html-worksheet-backup' && data.formatVersion === 1, 'BACKUP_FORMAT'); date(data.createdAt);
  for (const key of ['templates', 'instances', 'containers', 'revisions']) check(Array.isArray(data[key]), 'BACKUP_FORMAT');
  const result: Records = { templates: data.templates.map((t: any) => ({ ...t, sourceBytes: unbase64(t.sourceBytes) })), instances: data.instances, containers: data.containers, revisions: data.revisions };
  await validateRecords(result); return result;
}
export { emptyState, validateState };
export type { State, Field, StrictTemplate, ContainerKind };
