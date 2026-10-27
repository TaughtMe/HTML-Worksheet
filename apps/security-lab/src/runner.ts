import { Budget, decode, exact, positive, revision, validateState } from './contract.ts';
import type { Field, State } from './contract.ts';
import type { StrictConfig } from './strict-import.ts';
declare const __LAB_CONFIG__: { origin: string; manifest: Field[] } & Partial<StrictConfig>;
const config = __LAB_CONFIG__;
let port: MessagePort | null = null, sid = '', incoming = 0, outgoing = 0;
let phase = 'init', rev = 0, changeId = 0, pending = 0, request = 0, dirty = false;
let quiet: ReturnType<typeof setTimeout> | undefined, maxWait: ReturnType<typeof setTimeout> | undefined;
let lastRequest = 1;
const inputBudget = new Budget(), outputBudget = new Budget();
let strictButton: HTMLButtonElement | null = null, strictTarget: HTMLInputElement | null = null;
function stop() { phase = 'closed'; clearTimeout(quiet); clearTimeout(maxWait); strictButton?.removeEventListener('click', strictClick); port?.close(); }
function send(type: string, payload: unknown) {
  if (!port || phase === 'closed') return;
  const data = JSON.stringify({ v: 1, sessionId: sid, seq: ++outgoing, type, payload });
  decode(data, [], outputBudget); port.postMessage(data);
}
function fail(code: string) { try { send('ADAPTER_ERROR', { code }); } finally { stop(); } }
function strictBindings(ids: Map<string, HTMLElement>) {
  if (config.mode === undefined && config.action === undefined) return null;
  const action = config.action;
  if (config.mode !== 'strict-v1' || !exact(action, ['kind', 'buttonId', 'targetId']) || action.kind !== 'toggle-checkbox') throw Error('UNSUPPORTED_FIELD');
  const button = ids.get(action.buttonId), target = ids.get(action.targetId);
  if (!(button instanceof HTMLButtonElement) || button.type !== 'button' || button.form || document.querySelectorAll('button').length !== 1
    || button.getAttribute('data-ws-action') !== action.kind || button.getAttribute('data-ws-target') !== action.targetId
    || !(target instanceof HTMLInputElement) || target.type !== 'checkbox' || target.form
    || !config.manifest.some(field => field.id === action.targetId && field.kind === 'checkbox')
    || (strictButton && button !== strictButton) || (strictTarget && target !== strictTarget)) throw Error('UNSUPPORTED_FIELD');
  return { button, target };
}
function strictClick() {
  if (phase !== 'active') return;
  try { const binding = strictBindings(fieldElements())!; binding.target.checked = !binding.target.checked; changed(); }
  catch { fail('UNSUPPORTED_FIELD'); }
}
function fieldElements(): Map<string, HTMLElement> {
  if ([...document.querySelectorAll('*')].some(e => e.shadowRoot)) throw Error('UNSUPPORTED_FIELD');
  const all = [...document.querySelectorAll<HTMLElement>('[id]')]; const ids = new Map<string, HTMLElement>();
  for (const e of all) { if (ids.has(e.id)) throw Error('AMBIGUOUS_ID'); ids.set(e.id, e); }
  const inventory: { id: string; kind: string; options: string[] }[] = [];
  for (const e of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input,textarea,select')) {
    if (!ids.has(e.id)) throw Error('UNSUPPORTED_FIELD');
    if (e instanceof HTMLInputElement && e.type === 'radio') {
      const group = e.closest('fieldset[data-ws-radio-group]');
      if (!group || group.id !== e.name || group.parentElement?.closest('fieldset[data-ws-radio-group]')) throw Error('UNSUPPORTED_FIELD');
      continue;
    }
    const kind = e instanceof HTMLTextAreaElement ? 'text' : e instanceof HTMLSelectElement ? (e.multiple ? 'select-many' : 'select-one') : e.type;
    if (!['text', 'checkbox', 'select-one', 'select-many'].includes(kind)) throw Error('UNSUPPORTED_FIELD');
    inventory.push({ id: e.id, kind, options: e instanceof HTMLSelectElement ? [...e.options].map(o => o.value) : [] });
  }
  for (const e of document.querySelectorAll('fieldset[data-ws-radio-group]')) {
    const radios = [...e.querySelectorAll<HTMLInputElement>('input[type=radio]')];
    if (radios.some(r => r.form !== radios[0]?.form)) throw Error('UNSUPPORTED_FIELD');
    inventory.push({ id: e.id, kind: 'radio', options: radios.map(r => r.id) });
  }
  inventory.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (JSON.stringify(inventory) !== JSON.stringify(config.manifest)) throw Error('UNSUPPORTED_FIELD');
  strictBindings(ids);
  return ids;
}
function capture(): State {
  const ids = fieldElements();
  return validateState({ schemaVersion: 1, fields: config.manifest.map(m => {
    const e = ids.get(m.id)!; let value: string | boolean | null | string[];
    if (m.kind === 'text') value = (e as HTMLInputElement).value;
    else if (m.kind === 'checkbox') value = (e as HTMLInputElement).checked;
    else if (m.kind === 'radio') value = m.options.find(id => (ids.get(id) as HTMLInputElement).checked) ?? null;
    else if (m.kind === 'select-many') value = [...(e as HTMLSelectElement).selectedOptions].map(o => o.value);
    else value = (e as HTMLSelectElement).selectedIndex < 0 ? null : (e as HTMLSelectElement).value;
    return { id: m.id, kind: m.kind, value };
  }) }, config.manifest);
}
function restore(state: State) {
  const ids = fieldElements();
  for (const f of state.fields) {
    const e = ids.get(f.id)!;
    if (f.kind === 'text') (e as HTMLInputElement).value = f.value as string;
    else if (f.kind === 'checkbox') (e as HTMLInputElement).checked = f.value as boolean;
    else if (f.kind === 'radio') { for (const id of config.manifest.find(m => m.id === f.id)!.options) (ids.get(id) as HTMLInputElement).checked = id === f.value; }
    else {
      const select = e as HTMLSelectElement;
      for (const o of select.options) o.selected = Array.isArray(f.value) ? f.value.includes(o.value) : o.value === f.value;
      if (f.kind === 'select-one' && f.value === null) select.selectedIndex = -1;
    }
  }
}
function snapshot() { if (request && !pending) { dirty = false; send('STATE_SNAPSHOT', { requestId: request, baseRevision: rev, state: capture() }); } }
function flush() {
  clearTimeout(quiet); clearTimeout(maxWait); quiet = maxWait = undefined;
  if (phase !== 'active' || pending || request || !dirty) return;
  dirty = false; pending = ++changeId; send('STATE_CHANGED', { changeId: pending, baseRevision: rev, state: capture() });
}
function changed() {
  if (phase !== 'active') return;
  dirty = true; clearTimeout(quiet);
  quiet = setTimeout(() => { try { flush(); } catch { fail('SERIALIZE_FAILED'); } }, 500);
  maxWait ??= setTimeout(() => { try { flush(); } catch { fail('SERIALIZE_FAILED'); } }, 2000);
}
function onPort(event: MessageEvent) {
  try {
    const x = decode(event.data, event.ports, inputBudget), p = x.payload;
    if (x.sessionId !== sid || x.seq !== ++incoming) throw Error('PROTOCOL');
    if (x.type === 'CLOSE' && exact(p, ['code']) && ['USER_CLOSE', 'REPLACED', 'TIMEOUT', 'PROTOCOL', 'NAVIGATION'].includes(p.code)) { stop(); return; }
    if (x.type === 'RESTORE_STATE' && phase === 'restore' && exact(p, ['requestId', 'revision', 'adapterId', 'adapterVersion', 'state']) && p.requestId === 1 && revision(p.revision) && p.adapterId === 'standard-fields' && p.adapterVersion === 1) {
      restore(validateState(p.state, config.manifest)); rev = p.revision; phase = 'active'; send('RESTORED', { requestId: 1, revision: rev }); return;
    }
    if (x.type === 'STATE_ACCEPTED' && phase === 'active' && pending && exact(p, ['changeId', 'revision', 'durability']) && p.changeId === pending && revision(p.revision) && p.revision >= rev && p.revision <= rev + 1 && p.durability === 'memory') {
      rev = p.revision; pending = 0; if (request) snapshot(); else if (dirty) changed(); return;
    }
    if (x.type === 'REQUEST_STATE' && phase === 'active' && !request && exact(p, ['requestId', 'reason']) && positive(p.requestId) && p.requestId === lastRequest + 1 && ['checkpoint', 'close', 'export'].includes(p.reason)) {
      request = p.requestId; lastRequest = request; clearTimeout(quiet); clearTimeout(maxWait); quiet = maxWait = undefined; snapshot(); return;
    }
    if (x.type === 'SNAPSHOT_ACCEPTED' && request && exact(p, ['requestId', 'revision', 'durability']) && p.requestId === request && revision(p.revision) && p.revision >= rev && p.revision <= rev + 1 && p.durability === 'memory') {
      rev = p.revision; request = 0; if (dirty) changed(); return;
    }
    throw Error('PROTOCOL');
  } catch { fail('RESTORE_FAILED'); }
}
function init(event: MessageEvent) {
  const p = event.data;
  if (phase !== 'init' || event.source !== parent || event.origin !== config.origin || event.ports.length !== 1 || !exact(p, ['v', 'type', 'sessionId']) || p.v !== 1 || p.type !== 'INIT' || typeof p.sessionId !== 'string' || !/^[a-f0-9]{32}$/.test(p.sessionId)) return;
  window.removeEventListener('message', init);
  sid = p.sessionId; port = event.ports[0]; port.onmessage = onPort; port.onmessageerror = stop; port.start(); phase = 'restore';
  try {
    const binding = strictBindings(fieldElements());
    if (binding) { strictButton = binding.button; strictTarget = binding.target; strictButton.addEventListener('click', strictClick); }
    send('READY', { adapterId: 'standard-fields', adapterVersion: 1 });
  }
  catch { fail('UNSUPPORTED_FIELD'); }
}
window.addEventListener('message', init);
document.addEventListener('input', changed); document.addEventListener('change', changed);

// Native form reset runs after its event dispatch and emits no input/change.
document.addEventListener('reset', () => setTimeout(changed, 0));
