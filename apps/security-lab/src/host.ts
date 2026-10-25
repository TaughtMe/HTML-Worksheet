import { importFile } from './import.ts';
import { Budget, bytes, decode, emptyState, exact, jsonLimits, positive, validateState } from './contract.ts';
import type { State } from './contract.ts';
import type { Template } from './import.ts';
declare const __RUNNER_SOURCE__: string;
const nonce = (() => {
  const value = (document.currentScript as HTMLScriptElement | null)?.nonce;
  if (typeof value !== 'string' || !value) throw Error('HOST_NONCE_MISSING');
  return value;
})();
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = get('status'), stateView = get('state'), container = get('runner');
const childPolicy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const literal = (x: unknown) => JSON.stringify(x).replace(/</g, '\\u003c');
let active: Session | null = null;
let opening = 0;
function textLabel(name: string) { let result = ''; for (const c of name) { if (bytes(result + c) > 256) break; result += c; } return result; }
function show(code: string) { status.textContent = code; }
class Session {
  frame = document.createElement('iframe'); port: MessagePort; sessionId: string;
  instanceId = crypto.randomUUID(); templateVersionId = crypto.randomUUID();
  phase = 'await-load'; revision = 0; state: State; input = 0; output = 0; changes = 0; requests = 1; pendingRequest = 0; crossed = false;
  timer: ReturnType<typeof setTimeout> | undefined; inputBudget = new Budget(); outputBudget = new Budget();
  constructor(readonly template: Template) {
    this.sessionId = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
    this.state = emptyState(template.manifest);
    const channel = new MessageChannel(); this.port = channel.port1;
    this.port.onmessage = e => this.receive(e); this.port.onmessageerror = () => this.close('PROTOCOL'); this.port.start();
    this.frame.setAttribute('sandbox', 'allow-scripts'); this.frame.setAttribute('referrerpolicy', 'no-referrer'); this.frame.title = 'Synthetischer isolierter Runner';
    const config = literal({ origin: location.origin, manifest: template.manifest });
    this.frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${childPolicy}"><script nonce="${nonce}">(()=>{const __LAB_CONFIG__=${config};${__RUNNER_SOURCE__}\n})();<\/script></head><body>${template.content}</body></html>`;
    this.frame.onload = () => {
      if (this.phase !== 'await-load') { this.close('NAVIGATION'); return; }
      this.phase = 'await-ready'; this.deadline(3000); this.frame.contentWindow!.postMessage({ v: 1, type: 'INIT', sessionId: this.sessionId }, '*', [channel.port2]);
    };
    this.deadline(5000); container.append(this.frame); show('await-load');
  }
  deadline(ms: number) { clearTimeout(this.timer); this.timer = setTimeout(() => this.close('TIMEOUT'), ms); }
  send(type: string, payload: unknown) {
    if (this.phase === 'closed') return;
    jsonLimits(payload); const data = JSON.stringify({ v: 1, sessionId: this.sessionId, seq: ++this.output, type, payload });
    decode(data, [], this.outputBudget); this.port.postMessage(data);
  }
  render() { stateView.textContent = JSON.stringify({ revision: this.revision, durability: 'memory', state: this.state }, null, 2); }
  receive(e: MessageEvent) {
    try {
      const x = decode(e.data, e.ports, this.inputBudget), p = x.payload;
      if (x.sessionId !== this.sessionId || x.seq !== ++this.input) throw Error('PROTOCOL');
      if (x.type === 'ADAPTER_ERROR' && exact(p, ['code']) && ['UNSUPPORTED_FIELD', 'AMBIGUOUS_ID', 'RESTORE_FAILED', 'SERIALIZE_FAILED'].includes(p.code)) { this.close('ADAPTER_ERROR'); return; }
      if (x.type === 'READY' && this.phase === 'await-ready' && exact(p, ['adapterId', 'adapterVersion']) && p.adapterId === 'standard-fields' && p.adapterVersion === 1) {
        this.phase = 'await-restore'; this.deadline(3000); this.send('RESTORE_STATE', { requestId: 1, revision: 0, adapterId: 'standard-fields', adapterVersion: 1, state: this.state }); return;
      }
      if (x.type === 'RESTORED' && this.phase === 'await-restore' && exact(p, ['requestId', 'revision']) && p.requestId === 1 && p.revision === 0) {
        clearTimeout(this.timer); this.phase = 'active'; show('active · synthetischer RAM-State'); this.render(); return;
      }
      if (x.type === 'STATE_CHANGED' && this.phase === 'active' && exact(p, ['changeId', 'baseRevision', 'state']) && positive(p.changeId) && p.changeId === this.changes + 1 && (!this.pendingRequest || !this.crossed)) {
        this.changes++; if (this.pendingRequest) this.crossed = true; this.commit(p, 'STATE', p.changeId); return;
      }
      if (x.type === 'STATE_SNAPSHOT' && this.phase === 'active' && this.pendingRequest && exact(p, ['requestId', 'baseRevision', 'state']) && p.requestId === this.pendingRequest) {
        this.commit(p, 'SNAPSHOT', p.requestId); if (this.phase === 'active') { this.pendingRequest = 0; clearTimeout(this.timer); show('active · RAM-Snapshot bestätigt'); } return;
      }
      throw Error('PROTOCOL');
    } catch { this.close('PROTOCOL'); }
  }
  commit(p: any, kind: 'STATE' | 'SNAPSHOT', id: number) {
    const next = validateState(p.state, this.template.manifest);
    const key = kind === 'STATE' ? 'changeId' : 'requestId';
    if (p.baseRevision !== this.revision || this.revision === Number.MAX_SAFE_INTEGER) {
      this.send(`${kind}_REJECTED`, { [key]: id, code: 'CONFLICT' }); this.close('PROTOCOL'); return;
    }
    if (JSON.stringify(next) !== JSON.stringify(this.state)) this.revision++;
    this.state = next; this.render(); this.send(`${kind}_ACCEPTED`, { [key]: id, revision: this.revision, durability: 'memory' });
  }
  checkpoint() {
    if (this.phase !== 'active' || this.pendingRequest) return;
    this.pendingRequest = ++this.requests; this.crossed = false; this.deadline(2000);
    try { this.send('REQUEST_STATE', { requestId: this.pendingRequest, reason: 'checkpoint' }); } catch { this.close('PROTOCOL'); }
  }
  close(code: string) {
    if (this.phase === 'closed') return;
    try { this.send('CLOSE', { code: ['USER_CLOSE', 'REPLACED', 'TIMEOUT', 'PROTOCOL', 'NAVIGATION'].includes(code) ? code : 'PROTOCOL' }); } catch { /* best effort */ }
    this.phase = 'closed'; clearTimeout(this.timer); this.port.onmessage = this.port.onmessageerror = null; this.port.close();
    this.frame.onload = null; this.frame.remove(); this.state = emptyState([]); stateView.textContent = '';
    if (active === this) active = null; show(`closed · ${code}`);
  }
}
async function open(file: Pick<File, 'size' | 'arrayBuffer'>, name: string) {
  const ticket = ++opening; active?.close('REPLACED'); stateView.textContent = ''; get('filename').textContent = textLabel(name);
  try { const template = await importFile(file, nonce); if (ticket !== opening) return; active = new Session(template); }
  catch { if (ticket === opening) show('IMPORT_REJECTED'); }
}
get('open').onclick = () => { const f = get<HTMLInputElement>('file').files?.[0]; if (f) void open(f, f.name); };
get('close').onclick = () => { opening++; active?.close('USER_CLOSE'); };
get('checkpoint').onclick = () => active?.checkpoint();
get('demo').onclick = () => {
  const html = '<h2>Synthetische Demo</h2><label>Antwort <input id="answer"></label><label><input id="check" type="checkbox"> Auswahl</label><button id="calculate">Interaktion</button><output id="result"></output><script>document.getElementById("calculate").addEventListener("click",()=>{document.getElementById("result").textContent="JS funktioniert"})</script>';
  const blob = new Blob([html], { type: 'text/html' }); void open(blob, 'synthetische-demo.html');
};
