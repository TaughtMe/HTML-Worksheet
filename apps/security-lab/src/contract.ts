export type Kind = 'text' | 'checkbox' | 'radio' | 'select-one' | 'select-many';
export type Field = { id: string; kind: Kind; options: string[] };
export type State = { schemaVersion: 1; fields: { id: string; kind: Kind; value: string | boolean | null | string[] }[] };
export const bytes = (x: string) => new TextEncoder().encode(x).length;
export function exact(x: unknown, keys: string[]): x is Record<string, any> {
  return !!x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === keys.length && keys.every(k => Object.hasOwn(x, k));
}
export function jsonLimits(x: unknown): void {
  let count = 0;
  function visit(v: unknown, depth: number): void {
    if (++count > 20000 || depth > 16) throw Error('JSON_LIMIT');
    if (v === null || typeof v === 'boolean') return;
    if (typeof v === 'number' && Number.isFinite(v)) return;
    if (typeof v === 'string' && bytes(v) <= 16384) return;
    if (Array.isArray(v)) { if (v.length > 2048) throw Error('JSON_LIMIT'); v.forEach(y => visit(y, depth + 1)); return; }
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      const entries = Object.entries(v);
      if (entries.length > 1024) throw Error('JSON_LIMIT');
      for (const [k, y] of entries) {
        if (bytes(k) > 64 || ['__proto__', 'prototype', 'constructor'].includes(k)) throw Error('JSON_KEY');
        visit(y, depth + 1);
      }
      return;
    }
    throw Error('JSON_TYPE');
  }
  visit(x, 1);
}
export class Budget {
  tokens = 20; last = performance.now(); window: { time: number; size: number }[] = [];
  charge(size: number, now = performance.now()) {
    this.tokens = Math.min(20, this.tokens + (now - this.last) / 100); this.last = now;
    // A monotonic timestamp subtraction can round a full token just below 1.
    if (this.tokens < 1 - 1e-9) throw Error('RATE'); this.tokens = Math.max(0, this.tokens - 1);
    this.window = this.window.filter(x => now - x.time < 10000);
    this.window.push({ time: now, size });
    if (this.window.reduce((n, x) => n + x.size, 0) > 4 * 1024 * 1024) throw Error('RATE_BYTES');
  }
}
export function decode(data: unknown, ports: readonly MessagePort[], budget: Budget): any {
  // Charge even non-string and oversized inputs before any JSON parsing.
  budget.charge(0);
  if (ports.length || typeof data !== 'string' || data.length > 393216) throw Error('MESSAGE_SIZE_TYPE');
  const size = bytes(data);
  if (size > 393216) throw Error('MESSAGE_SIZE');
  budget.window[budget.window.length - 1].size = size;
  if (budget.window.reduce((n, x) => n + x.size, 0) > 4 * 1024 * 1024) throw Error('RATE_BYTES');
  const x = JSON.parse(data); jsonLimits(x);
  if (!exact(x, ['v', 'sessionId', 'seq', 'type', 'payload']) || x.v !== 1 || typeof x.sessionId !== 'string' || !/^[a-f0-9]{32}$/.test(x.sessionId) || !positive(x.seq) || typeof x.type !== 'string') throw Error('ENVELOPE');
  return x;
}
export const positive = (x: unknown): x is number => Number.isSafeInteger(x) && Number(x) > 0;
export const revision = (x: unknown): x is number => Number.isSafeInteger(x) && Number(x) >= 0;
export function validateState(x: unknown, manifest: Field[]): State {
  jsonLimits(x);
  if (bytes(JSON.stringify(x)) > 262144 || !exact(x, ['schemaVersion', 'fields']) || x.schemaVersion !== 1 || !Array.isArray(x.fields) || x.fields.length !== manifest.length) throw Error('STATE');
  for (let i = 0; i < manifest.length; i++) {
    const f = x.fields[i], m = manifest[i];
    if (!exact(f, ['id', 'kind', 'value']) || f.id !== m.id || f.kind !== m.kind) throw Error('STATE_FIELD');
    const v = f.value;
    if (m.kind === 'text' && !(typeof v === 'string' && bytes(v) <= 16384)) throw Error('STATE_TEXT');
    if (m.kind === 'checkbox' && typeof v !== 'boolean') throw Error('STATE_CHECKBOX');
    if ((m.kind === 'radio' || m.kind === 'select-one') && v !== null && !(typeof v === 'string' && m.options.includes(v))) throw Error('STATE_OPTION');
    if (m.kind === 'select-many' && (!Array.isArray(v) || v.length > 128 || v.some((a: unknown) => typeof a !== 'string') || JSON.stringify(v) !== JSON.stringify(m.options.filter(o => v.includes(o))))) throw Error('STATE_OPTIONS');
  }
  return { schemaVersion: 1, fields: x.fields.map((f: any) => ({ id: f.id, kind: f.kind, value: Array.isArray(f.value) ? [...f.value] : f.value })) };
}
export const emptyState = (m: Field[]): State => ({ schemaVersion: 1, fields: m.map(f => ({ id: f.id, kind: f.kind, value: f.kind === 'text' ? '' : f.kind === 'checkbox' ? false : f.kind === 'select-many' ? [] : null })) });
