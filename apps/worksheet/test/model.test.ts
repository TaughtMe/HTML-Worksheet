import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { backupString, emptyState, fitTitle, imported, initialInstance, initialRevision, now, parseBackup, recordBytes, templateBytes, title, uuid, validateTree } from '../src/model.ts';
const source = readFileSync('tests/fixtures/demo-strict-fields.html', 'utf8');
test('functional backup preserves original source bytes, exact fields and all metadata within accounted bytes', async () => {
  const { template } = await imported(new File([source], 'Übung.html')), container = { id: uuid(), schemaVersion: 1 as const, kind: 'notebook' as const, parentId: null, title: 'Heft <Text>', metadataRevision: 0, createdAt: now(), updatedAt: now() };
  const instance = initialInstance(template, container.id), state = emptyState(template.adapterManifest);
  state.fields.find(x => x.id === 'text')!.value = '<b>Antwort: Grüße</b>'; state.fields.find(x => x.id === 'check')!.value = true;
  state.fields.find(x => x.id === 'group')!.value = 'r2'; state.fields.find(x => x.id === 'one')!.value = 'b'; state.fields.find(x => x.id === 'many')!.value = ['a', 'b'];
  const revision = await initialRevision(instance.id, state), data = { templates: [template], instances: [instance], containers: [container], revisions: [revision] };
  const json = await backupString(data), restored = await parseBackup(new File([json], 'backup.json'));
  assert.deepEqual(restored, data);
  const accounted = 1024 + templateBytes(template) + [instance, container, revision].reduce((n, x) => n + recordBytes(x), 0);
  assert(new TextEncoder().encode(json).length <= accounted);
  const changed = JSON.parse(json); changed.templates[0].sourceHash = '0'.repeat(64);
  await assert.rejects(parseBackup(new File([JSON.stringify(changed)], 'bad.json')), /SOURCE_HASH/);
  changed.formatVersion = 99; await assert.rejects(parseBackup(new File([JSON.stringify(changed)], 'bad.json')), /BACKUP_FORMAT/);
});
test('functional tree validation refuses cycles, missing parents and unsafe metadata revisions', () => {
  const a = { id: uuid(), schemaVersion: 1 as const, kind: 'folder' as const, parentId: null as string | null, title: 'A', metadataRevision: 0, createdAt: now(), updatedAt: now() }, b = { ...a, id: uuid(), parentId: a.id };
  validateTree([a, b]); assert.throws(() => validateTree([{ ...a, parentId: b.id }, b]), /CONTAINER_CYCLE_DEPTH/);
  assert.throws(() => validateTree([b]), /MISSING_PARENT/); assert.throws(() => validateTree([{ ...a, metadataRevision: Number.MAX_SAFE_INTEGER + 1 }]));
});
test('copy titles retain valid UTF-8 byte limits for long Unicode metadata', () => {
  const name = '界'.repeat(85), copied = fitTitle(name, 250) + ' Kopie'; title(name); title(copied); assert(copied.endsWith(' Kopie')); assert(new TextEncoder().encode(copied).length <= 256);
});
