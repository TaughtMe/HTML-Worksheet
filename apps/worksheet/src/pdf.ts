import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { parse } from 'parse5';
import type { State } from './model.ts';
import { check } from './model.ts';
declare const __PDF_FONT_BASE64__: string;
export function reportText(title: string, source: string, state: State): string {
  const ast: any = parse(source), parts: string[] = [];
  function walk(node: any) {
    if (node.tagName === 'script' || node.tagName === 'style' || node.tagName === 'button' || node.tagName === 'textarea') return;
    const block = ['h1', 'h2', 'p', 'div', 'label', 'fieldset', 'legend', 'option', 'br'].includes(node.tagName);
    if (block) parts.push('\n'); if (node.nodeName === '#text') parts.push(node.value);
    for (const child of node.childNodes ?? []) walk(child); if (block) parts.push('\n');
  }
  walk(ast);
  const questions = parts.join('').replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const answers = state.fields.map(field => {
    const value = typeof field.value === 'boolean' ? field.value ? 'Ja (true)' : 'Nein (false)' : field.value === null ? '(keine Auswahl)' : Array.isArray(field.value) ? field.value.join(', ') : field.value || '(leer)';
    return `${field.id} [${field.kind}]\n${value}`;
  }).join('\n\n');
  return `${title}\n\nArbeitsblatt\n${questions}\n\nAntworten\n${answers}\n\nSemantischer Datenbericht; kein originalgetreues Drucklayout.`;
}
export async function createPdf(title: string, source: string, state: State): Promise<Uint8Array> {
  const text = reportText(title, source, state).replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
  check(new TextEncoder().encode(text).length <= 1024 * 1024, 'PDF_TOO_LARGE');
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
  const fontBytes = Uint8Array.from(atob(__PDF_FONT_BASE64__), c => c.charCodeAt(0)), font = await doc.embedFont(fontBytes, { subset: true });
  const characters = new Set(font.getCharacterSet());
  for (const char of text) if (char !== '\n' && !characters.has(char.codePointAt(0)!)) throw Error('PDF_GLYPH: ' + char + ' (U+' + char.codePointAt(0)!.toString(16).toUpperCase() + ')');
  const size = 11, margin = 48, width = 595.28, height = 841.89, lineHeight = 16, available = width - 2 * margin;
  const advances = new Map<string, number>(), lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '', length = 0;
    for (const char of paragraph) {
      let advance = advances.get(char); if (advance === undefined) { advance = font.widthOfTextAtSize(char, size); advances.set(char, advance); }
      if (line && length + advance > available) { lines.push(line); line = ''; length = 0; }
      line += char; length += advance;
    }
    lines.push(line);
  }
  const perPage = Math.floor((height - 2 * margin - 20) / lineHeight); check(Math.ceil(lines.length / perPage) <= 250, 'PDF_TOO_LARGE');
  for (let start = 0; start < lines.length; start += perPage) {
    const page = doc.addPage([width, height]); let y = height - margin;
    for (const line of lines.slice(start, start + perPage)) { page.drawText(line, { x: margin, y, font, size, color: rgb(0.12, 0.12, 0.12) }); y -= lineHeight; }
    page.drawText(`Seite ${doc.getPageCount()}`, { x: margin, y: 28, font, size: 9 });
  }
  doc.setTitle(title); doc.setProducer('HTML Worksheet – lokaler Datenbericht'); return doc.save();
}
