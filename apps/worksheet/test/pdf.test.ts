import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
(globalThis as any).__PDF_FONT_BASE64__ = readFileSync('apps/worksheet/assets/OpenSans-Regular.ttf').toString('base64');
const { createPdf, reportText } = await import('../src/pdf.ts');
const state = { schemaVersion: 1 as const, fields: [{ id: 'answer', kind: 'text' as const, value: '<b>Nur Text</b>' }, { id: 'check', kind: 'checkbox' as const, value: true }] };
test('PDF semantic report keeps literal answers and all question/choice text without evaluating HTML', () => {
  const text = reportText('Bericht', '<h1>Frage</h1><p>Welche Antwort?</p><select><option>A</option><option>B</option></select><script>globalThis.pdfEscaped=1</script>', state);
  for (const value of ['Frage', 'Welche Antwort?', 'A', 'B', '<b>Nur Text</b>', 'Ja (true)']) assert(text.includes(value));
  assert(!text.includes('pdfEscaped')); assert.equal((globalThis as any).pdfEscaped, undefined);
});
test('PDF refuses unsupported glyphs and excessive output before returning an incomplete file', async () => {
  const emoji = structuredClone(state); emoji.fields[0].value = '😀'; await assert.rejects(createPdf('Titel', '<p>Frage</p>', emoji), /PDF_GLYPH/);
  await assert.rejects(createPdf('Titel', '<p>' + 'q'.repeat(1024 * 1024) + '</p>', state), /PDF_TOO_LARGE/);
});
