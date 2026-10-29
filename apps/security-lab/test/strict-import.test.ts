import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILE_LIMIT, normalize } from '../src/import.ts';
import { emptyState, validateState } from '../src/contract.ts';
import { importStrictFile, normalizeStrict } from '../src/strict-import.ts';
const valid = '<input id="check" type="checkbox"><button id="toggle" type="button" data-ws-action="toggle-checkbox" data-ws-target="check">Toggle</button>';
test('STRICT01 C1: inert loop rejection and unchanged import limits', async () => {
  assert.throws(() => normalizeStrict(valid + '<script>while(true){}</script>'), /STRICT_ELEMENT/); // Never executed.
  let read = false;
  await assert.rejects(importStrictFile({ size: FILE_LIMIT + 1, arrayBuffer: async () => { read = true; return new ArrayBuffer(0); } }), /FILE_SIZE/); assert.equal(read, false);
  await assert.rejects(importStrictFile({ size: 2, arrayBuffer: async () => Uint8Array.from([0xc3, 0x28]).buffer }));
  await assert.rejects(importStrictFile({ size: 0, arrayBuffer: async () => new ArrayBuffer(FILE_LIMIT + 1) }), /FILE_SIZE/);
  assert.throws(() => normalizeStrict('<div>'.repeat(65) + valid + '</div>'.repeat(65)), /AST_LIMIT/);
  assert.throws(() => normalizeStrict(valid + '<p>x</p>'.repeat(10000)), /AST_LIMIT/);
  assert.throws(() => normalizeStrict(valid + '<p ' + Array.from({ length: 65 }, (_, i) => `a${i}="x"`).join(' ') + '></p>'), /AST_LIMIT/);
  assert.throws(() => normalizeStrict(valid + Array.from({ length: 1024 }, (_, i) => `<input id="x${i}" type="text">`).join('')), /FIELD_LIMIT/);
});
test('STRICT01 C2: fixed active-source corpus and parse errors reject as a whole', () => {
  for (const extra of ['<p onclick="1">x</p>', '<style>p{background:url(https://example.invalid)}</style>', '<img src="https://example.invalid">', '<svg></svg>']) assert.throws(() => normalizeStrict(valid + extra));
  for (const extra of ['<input id="x" id="y" type="text">', '<p a="1" a="2"></p>', '<head><title>x</title></head>', '<button>nested</button>', '<option value="x">x</option>', '<form></form>']) assert.throws(() => normalizeStrict(valid + extra));
});
test('STRICT01 C3: exact declarative references and source cannot choose mode', () => {
  const demo = readFileSync('tests/fixtures/demo-strict-fields.html', 'utf8'), template = normalizeStrict(demo);
  assert.equal(template.mode, 'strict-v1'); assert.deepEqual(template.action, { kind: 'toggle-checkbox', buttonId: 'toggle', targetId: 'check' });
  assert.deepEqual(validateState(emptyState(template.manifest), template.manifest), emptyState(template.manifest));
  assert.equal(template.content.includes('nonce='), false); assert.equal(template.manifest.length, 6);
  for (const invalid of [valid.replace('toggle-checkbox', 'unknown'), valid + '<button id="other" type="button">x</button>', valid.replace('data-ws-target="check"', ''), valid.replace('type="checkbox"', 'type="text"'), valid.replace('data-ws-target="check"', 'data-ws-target="foreign"'), valid.replace('id="check"', 'id="check" data-ws-mode="legacy"'), valid.replace('id="check"', 'id="check" checked'), valid.replace('id="check"', 'id="check" nonce="attacker"'), valid.replace('type="checkbox"', ''), valid.replace('>Toggle<', '><span>Toggle</span><'), valid.replace('id="toggle"', 'id="check"')]) assert.throws(() => normalizeStrict(invalid));
  assert.doesNotThrow(() => normalize('<script>globalThis.legacy=1</script>', 'legacy-nonce'));
});
