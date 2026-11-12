import { parse, serialize } from 'parse5';
import type { Field } from './contract.ts';
import { bytes } from './contract.ts';
export const FILE_LIMIT = 2 * 1024 * 1024;
export type Template = { sourceBytes: Uint8Array; content: string; manifest: Field[] };
const idPattern = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
export async function importFile(file: Pick<File, 'size' | 'arrayBuffer'>, nonce: string): Promise<Template> {
  if (file.size > FILE_LIMIT) throw Error('FILE_SIZE');
  const original = new Uint8Array(await file.arrayBuffer());
  if (original.length > FILE_LIMIT) throw Error('FILE_SIZE');
  const source = new TextDecoder('utf-8', { fatal: true }).decode(original);
  return normalize(source, nonce, original);
}
export function normalize(source: string, nonce: string, original = new TextEncoder().encode(source)): Template {
  if (original.length > FILE_LIMIT) throw Error('FILE_SIZE');
  const ast: any = parse(source);
  let count = 0; const ids = new Set<string>(); const manifest: Field[] = [];
  const attr = (n: any, key: string) => n.attrs?.find((a: any) => a.name === key)?.value;
  const add = (f: Field) => { if (manifest.length >= 1024) throw Error('FIELD_LIMIT'); manifest.push(f); };
  function walk(n: any, depth: number, group: Field | null): void {
    if (++count > 20000 || depth > 64 || (n.attrs?.length || 0) > 64) throw Error('AST_LIMIT');
    const tag = n.tagName;
    if (tag) {
      if (n.namespaceURI !== 'http://www.w3.org/1999/xhtml' || ['base', 'iframe', 'frame', 'frameset', 'object', 'embed', 'link', 'template', 'canvas'].includes(tag)) throw Error('UNSUPPORTED_ELEMENT');
      for (const a of n.attrs) {
        if (a.namespace || /^on/i.test(a.name) || ['nonce', 'style', 'form', 'srcdoc', 'ping', 'action', 'formaction', 'background', 'srcset', 'poster'].includes(a.name)) throw Error('UNSUPPORTED_ATTRIBUTE');
        if (a.name === 'http-equiv') throw Error('HTTP_EQUIV');
        if (['src', 'href', 'data'].includes(a.name) && !(tag === 'img' && a.name === 'src' && /^data:image\/(png|jpeg|gif|webp);base64,[a-zA-Z0-9+/=]+$/.test(a.value) && bytes(a.value) <= 131072) && !(tag === 'a' && a.name === 'href' && a.value.startsWith('#'))) throw Error('EXTERNAL_RESOURCE');
      }
      if (tag === 'script' || tag === 'style') {
        if (tag === 'script' && attr(n, 'type') && !['text/javascript', 'application/javascript'].includes(attr(n, 'type'))) throw Error('SCRIPT_TYPE');
        const text = (n.childNodes || []).map((x: any) => x.value || '').join('');
        // Raw-text reserialization must not create a different closing-tag boundary.
        if (new RegExp(`</${tag}`, 'i').test(text)) throw Error('RAW_TEXT_BOUNDARY');
        if (tag === 'style' && /url\s*\(|@import/i.test(text)) throw Error('EXTERNAL_STYLE');
        n.attrs.push({ name: 'nonce', value: nonce });
      }
      const id = attr(n, 'id');
      if (id !== undefined) { if (!idPattern.test(id) || ids.has(id)) throw Error('AMBIGUOUS_ID'); ids.add(id); }
      if (tag === 'form' && group) throw Error('RADIO_FORM_OWNER');
      if (tag === 'fieldset' && attr(n, 'data-ws-radio-group') !== undefined) {
        if (group || !id) throw Error('RADIO_GROUP');
        group = { id, kind: 'radio', options: [] }; add(group);
      }
      if (['input', 'textarea', 'select'].includes(tag)) {
        if (!id) throw Error('MISSING_ID');
        if (tag === 'input') {
          const type = (attr(n, 'type') || 'text').toLowerCase();
          if (type === 'radio') { if (!group || attr(n, 'name') !== group.id || group.options.length >= 128) throw Error('RADIO_GROUP'); group.options.push(id); }
          else if (['text', 'checkbox'].includes(type)) add({ id, kind: type as 'text' | 'checkbox', options: [] });
          else throw Error('UNSUPPORTED_FIELD');
        } else if (tag === 'textarea') add({ id, kind: 'text', options: [] });
        else {
          const options: string[] = [];
          function optionWalk(x: any) { if (x.tagName === 'option') { const value = attr(x, 'value'); if (value === undefined || bytes(value) > 128 || options.includes(value) || options.length >= 128) throw Error('SELECT_OPTIONS'); options.push(value); } (x.childNodes || []).forEach(optionWalk); }
          optionWalk(n); add({ id, kind: attr(n, 'multiple') !== undefined ? 'select-many' : 'select-one', options });
        }
      }
    }
    for (const c of n.childNodes || []) walk(c, depth + 1, group);
  }
  walk(ast, 1, null);
  for (const f of manifest) if (f.kind === 'radio' && !f.options.length) throw Error('RADIO_GROUP');
  manifest.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const html = ast.childNodes.find((x: any) => x.tagName === 'html');
  const content = html.childNodes.map((x: any) => serialize(x)).join('');
  return { sourceBytes: original.slice(), content, manifest };
}
