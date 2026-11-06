import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, validateState } from '../src/contract.ts';
import { FILE_LIMIT, importFile, normalize } from '../src/import.ts';
const nonce = 'test-nonce-only';
test('all five standard field kinds form a sorted AST manifest', () => {
  const t = normalize('<textarea id="text"></textarea><input id="check" type="checkbox"><fieldset id="group" data-ws-radio-group><input id="r1" name="group" type="radio"><input id="r2" name="group" type="radio"></fieldset><select id="one"><option value="a">A</option></select><select id="many" multiple><option value="a">A</option><option value="b">B</option></select>', nonce);
  assert.deepEqual(t.manifest.map(f => f.kind), ['checkbox', 'radio', 'select-many', 'select-one', 'text']);
  assert.deepEqual(validateState(emptyState(t.manifest), t.manifest), emptyState(t.manifest));
  assert.equal(t.sourceBytes.length > 0, true);
});
test('size is checked before reading and invalid UTF-8 rejects', async () => {
  let read = false;
  await assert.rejects(importFile({ size: FILE_LIMIT + 1, arrayBuffer: async () => { read = true; return new ArrayBuffer(0); } }, nonce));
  assert.equal(read, false);
  await assert.rejects(importFile({ size: 2, arrayBuffer: async () => Uint8Array.from([0xc3, 0x28]).buffer }, nonce));
  const source = new TextEncoder().encode('<p>synthetic</p>');
  const t = await importFile({ size: source.length, arrayBuffer: async () => source.buffer }, nonce);
  assert.deepEqual(t.sourceBytes, source);
});
test('normalization uses parsed structure and never preserves an attacker nonce', () => {
  const t = normalize('<html><head><title>&lt;img src=x onerror=alert(1)&gt;</title><style>p{color:red}</style></head><body><p>ok</p><script>globalThis.marker=1</script></body></html>', nonce);
  assert.match(t.content, /nonce="test-nonce-only"/);
  assert.match(t.content, /&lt;img/);
  assert.throws(() => normalize('<script nonce="attacker">1</script>', nonce));
});
test('malformed raw text cannot create a new script boundary', () => {
  assert.throws(() => normalize('<script><!--<script>1</script>--></script>', nonce), /RAW_TEXT_BOUNDARY/);
  assert.doesNotThrow(() => normalize('</head></body><p>text</p>', nonce));
});
test('unsupported import surfaces reject', () => {
  for (const s of ['<img src="https://example.invalid/x">', '<input id="p" type="password">', '<input>', '<input id="x"><input id="x">', '<meta http-equiv="refresh" content="0;url=x">', '<svg onload="1"></svg>', '<button onclick="1">x</button>', '<style>@import "x";</style>', '<script src="x"></script>', '<iframe></iframe>', '<script type="module">1</script>', '<select id="x"><option>x</option></select>']) assert.throws(() => normalize(s, nonce), s);
});
test('AST depth, node count and attribute budgets reject', () => {
  assert.throws(() => normalize('<div>'.repeat(65) + '</div>'.repeat(65), nonce), /AST_LIMIT/);
  assert.throws(() => normalize('<p>x</p>'.repeat(10000), nonce), /AST_LIMIT/);
  assert.throws(() => normalize('<p ' + Array.from({ length: 65 }, (_, i) => `a${i}="x"`).join(' ') + '></p>', nonce), /AST_LIMIT/);
});
test('exact state inventory; inert HTML text roundtrips', () => {
  const m = normalize('<input id="x">', nonce).manifest;
  const s = { schemaVersion: 1, fields: [{ id: 'x', kind: 'text', value: '<b>Antwort</b>' }] };
  assert.equal(validateState(s, m).fields[0].value, '<b>Antwort</b>');
  assert.throws(() => validateState({ ...s, url: 'bad' }, m));
  assert.throws(() => validateState({ schemaVersion: 1, fields: [] }, m));
  assert.throws(() => validateState({ schemaVersion: 1, fields: [{ ...s.fields[0], value: 'x'.repeat(16385) }] }, m));
});

test('radio group cannot split across form owners', () => {
  assert.throws(() => normalize('<form id="f1"></form><form id="f2"></form><fieldset id="g" data-ws-radio-group><input id="r1" type="radio" name="g" form="f1"><input id="r2" type="radio" name="g" form="f2"></fieldset>', nonce), /UNSUPPORTED_ATTRIBUTE/);
  assert.throws(() => normalize('<fieldset id="g" data-ws-radio-group><form id="f"><input id="r1" type="radio" name="g"></form><input id="r2" type="radio" name="g"></fieldset>', nonce), /RADIO_FORM_OWNER/);
});
