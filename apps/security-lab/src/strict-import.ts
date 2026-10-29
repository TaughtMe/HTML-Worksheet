import { parse, serialize } from 'parse5';
import { bytes } from './contract.ts';
import type { Field } from './contract.ts';
import { FILE_LIMIT } from './import.ts';
import type { Template } from './import.ts';
export type StrictAction = { kind: 'toggle-checkbox'; buttonId: string; targetId: string };
export type StrictConfig = { mode: 'strict-v1'; action: StrictAction };
export type StrictTemplate = Template & StrictConfig;
const idPattern = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const tags = new Set('html head body h1 h2 p div span br label fieldset legend input textarea select option button'.split(' '));
const attributes: Record<string, string[]> = {
  label: ['for'], fieldset: ['data-ws-radio-group'], input: ['type', 'name'], select: ['multiple'], option: ['value'],
  button: ['type', 'data-ws-action', 'data-ws-target']
};
export async function importStrictFile(file: Pick<File, 'size' | 'arrayBuffer'>): Promise<StrictTemplate> {
  if (file.size > FILE_LIMIT) throw Error('FILE_SIZE');
  const original = new Uint8Array(await file.arrayBuffer());
  if (original.length > FILE_LIMIT) throw Error('FILE_SIZE');
  return normalizeStrict(new TextDecoder('utf-8', { fatal: true }).decode(original), original);
}
// AST only: reject the entire input. No DOM, source-code evaluation, sanitizing or nonce generation.
export function normalizeStrict(source: string, original = new TextEncoder().encode(source)): StrictTemplate {
  if (original.length > FILE_LIMIT || bytes(source) > FILE_LIMIT) throw Error('FILE_SIZE');
  const ast: any = parse(source, { onParseError: error => { if (error.code !== 'missing-doctype') throw Error('STRICT_PARSE'); } });
  const ids = new Set<string>(), controls = new Map<string, string>(), labels: string[] = [], actions: StrictAction[] = [], manifest: Field[] = [];
  let count = 0;
  const attr = (node: any, name: string): string | undefined => node.attrs?.find((a: any) => a.name === name)?.value;
  const add = (field: Field) => { if (manifest.length >= 1024) throw Error('FIELD_LIMIT'); manifest.push(field); };
  function walk(node: any, depth: number, group: Field | null): void {
    if (++count > 20000 || depth > 64 || (node.attrs?.length || 0) > 64) throw Error('AST_LIMIT');
    if (node.nodeName === '#documentType' && (node.name !== 'html' || node.publicId || node.systemId)) throw Error('STRICT_DOCTYPE');
    const tag = node.tagName;
    if (tag) {
      if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !tags.has(tag)) throw Error('STRICT_ELEMENT');
      const wrapper = ['html', 'head', 'body'].includes(tag);
      for (const a of node.attrs) if (a.namespace || wrapper || (a.name !== 'id' && !attributes[tag]?.includes(a.name))) throw Error('STRICT_ATTRIBUTE');
      if (tag === 'head' && node.childNodes.length) throw Error('STRICT_HEAD');
      if (['textarea', 'option', 'button'].includes(tag) && node.childNodes.some((n: any) => n.nodeName !== '#text')) throw Error('STRICT_TEXT_ONLY');
      const id = attr(node, 'id');
      if (id !== undefined) { if (!idPattern.test(id) || ids.has(id)) throw Error('AMBIGUOUS_ID'); ids.add(id); }
      if (tag === 'label' && attr(node, 'for') !== undefined) labels.push(attr(node, 'for')!);
      if (tag === 'fieldset' && attr(node, 'data-ws-radio-group') !== undefined) {
        if (group || !id || attr(node, 'data-ws-radio-group') !== '') throw Error('RADIO_GROUP');
        group = { id, kind: 'radio', options: [] }; add(group);
      }
      if (['input', 'textarea', 'select'].includes(tag)) {
        if (!id) throw Error('MISSING_ID');
        const type = attr(node, 'type'); controls.set(id, tag === 'input' ? type! : tag);
        if (tag === 'input') {
          if (!['text', 'checkbox', 'radio'].includes(type!)) throw Error('UNSUPPORTED_FIELD');
          if (type === 'radio') {
            if (!group || attr(node, 'name') !== group.id || group.options.length >= 128) throw Error('RADIO_GROUP'); group.options.push(id);
          } else {
            if (attr(node, 'name') !== undefined) throw Error('STRICT_ATTRIBUTE');
            add({ id, kind: type as 'text' | 'checkbox', options: [] });
          }
        } else if (tag === 'textarea') add({ id, kind: 'text', options: [] });
        else {
          if (attr(node, 'multiple') !== undefined && attr(node, 'multiple') !== '') throw Error('STRICT_ATTRIBUTE');
          const options: string[] = [];
          for (const option of node.childNodes.filter((n: any) => n.tagName === 'option')) {
            const value = attr(option, 'value');
            if (value === undefined || bytes(value) > 128 || options.includes(value) || options.length >= 128) throw Error('SELECT_OPTIONS'); options.push(value);
          }
          add({ id, kind: attr(node, 'multiple') === undefined ? 'select-one' : 'select-many', options });
        }
      }
      if (tag === 'option' && node.parentNode?.tagName !== 'select') throw Error('SELECT_OPTIONS');
      if (tag === 'button') {
        const target = attr(node, 'data-ws-target');
        if (!id || attr(node, 'type') !== 'button' || attr(node, 'data-ws-action') !== 'toggle-checkbox' || !target || !idPattern.test(target)) throw Error('STRICT_ACTION');
        actions.push({ kind: 'toggle-checkbox', buttonId: id, targetId: target });
      }
    }
    for (const child of node.childNodes || []) walk(child, depth + 1, group);
  }
  walk(ast, 1, null);
  if (manifest.some(f => f.kind === 'radio' && !f.options.length)) throw Error('RADIO_GROUP');
  if (labels.some(id => !controls.has(id))) throw Error('STRICT_LABEL');
  if (actions.length !== 1 || controls.get(actions[0].targetId) !== 'checkbox') throw Error('STRICT_ACTION');
  manifest.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const html = ast.childNodes.find((node: any) => node.tagName === 'html');
  return { sourceBytes: original.slice(), content: html.childNodes.map((node: any) => serialize(node)).join(''), manifest, mode: 'strict-v1', action: actions[0] };
}
