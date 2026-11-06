import { Budget, decode, exact, jsonLimits, positive, validateState } from '../../security-lab/src/contract.ts';
import type { State } from '../../security-lab/src/contract.ts';
import { childPolicy, strictChildPolicy } from '../../security-lab/src/runner-policy.ts';
import { check } from './model.ts';
import type { Repository } from './repository.ts';
declare const __RUNNER_SOURCE__: string;
type Opened = Awaited<ReturnType<Repository['read']>>;
interface Hooks { saving(): void; confirmed(revision: number): void; failed(code: string): void }
export interface ConfirmedSnapshot { revision: number; state: State }
interface Snapshot { requestId: number; crossed: boolean; resolve: (snapshot: ConfirmedSnapshot) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
const literal = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
export class DurableSession {
  readonly loaded: Opened; readonly frame = document.createElement('iframe'); readonly port: MessagePort;
  readonly sessionId = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
  readonly repo: Repository; readonly hooks: Hooks;
  phase = 'await-load'; revision: number; state: State; unsaved: State | null = null;
  input = 0; output = 0; changes = 0; requests = 1; inputBudget = new Budget(); outputBudget = new Budget();
  ready: Promise<void>; private resolveReady!: () => void; private rejectReady!: (error: Error) => void;
  private phaseTimer?: ReturnType<typeof setTimeout>; private commitTimer?: ReturnType<typeof setTimeout>;
  private committing: Promise<void> | null = null; private snapshot: Snapshot | null = null; private snapshotPromise: Promise<ConfirmedSnapshot> | null = null;
  private abort = new AbortController();
  constructor(repo: Repository, loaded: Opened, nonce: string, mount: HTMLElement, hooks: Hooks) {
    this.repo = repo; this.loaded = loaded; this.hooks = hooks; this.state = loaded.revision.state; this.revision = loaded.instance.headRevision;
    this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; }); void this.ready.catch(() => {});
    const channel = new MessageChannel(); this.port = channel.port1; this.port.onmessage = event => this.receive(event); this.port.onmessageerror = () => this.close('PROTOCOL'); this.port.start();
    this.frame.setAttribute('sandbox', 'allow-scripts'); this.frame.setAttribute('referrerpolicy', 'no-referrer'); this.frame.title = 'Arbeitsblatt bearbeiten';
    const parsed = loaded.parsed, config = literal({ origin: location.origin, manifest: parsed.manifest, mode: parsed.mode, action: parsed.action, durability: 'committed', readOnly: loaded.instance.status === 'completed' });
    this.frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${childPolicy}"><meta http-equiv="Content-Security-Policy" content="${strictChildPolicy(nonce)}"><script nonce="${nonce}">(()=>{const __LAB_CONFIG__=${config};${__RUNNER_SOURCE__}\n})();<\/script></head><body>${parsed.content}</body></html>`;
    this.frame.onload = () => {
      if (this.phase !== 'await-load') { this.close('NAVIGATION'); return; }
      this.phase = 'await-ready'; this.deadline(3000); this.frame.contentWindow!.postMessage({ v: 1, type: 'INIT', sessionId: this.sessionId }, '*', [channel.port2]);
    };
    this.deadline(5000); mount.append(this.frame);
  }
  private deadline(ms: number) { clearTimeout(this.phaseTimer); this.phaseTimer = setTimeout(() => this.close('TIMEOUT'), ms); }
  private send(type: string, payload: unknown) {
    if (this.phase === 'closed') return; jsonLimits(payload);
    const data = JSON.stringify({ v: 1, sessionId: this.sessionId, seq: ++this.output, type, payload }); decode(data, [], this.outputBudget); this.port.postMessage(data);
  }
  private receive(event: MessageEvent) {
    try {
      const x = decode(event.data, event.ports, this.inputBudget), p = x.payload; check(x.sessionId === this.sessionId && x.seq === ++this.input, 'PROTOCOL');
      if (x.type === 'ADAPTER_ERROR' && exact(p, ['code']) && ['UNSUPPORTED_FIELD', 'AMBIGUOUS_ID', 'RESTORE_FAILED', 'SERIALIZE_FAILED'].includes(p.code)) { this.close('ADAPTER_ERROR'); return; }
      if (x.type === 'READY' && this.phase === 'await-ready' && exact(p, ['adapterId', 'adapterVersion']) && p.adapterId === 'standard-fields' && p.adapterVersion === 1) {
        this.phase = 'await-restore'; this.deadline(3000); this.send('RESTORE_STATE', { requestId: 1, revision: this.revision, adapterId: 'standard-fields', adapterVersion: 1, state: this.state }); return;
      }
      if (x.type === 'RESTORED' && this.phase === 'await-restore' && exact(p, ['requestId', 'revision']) && p.requestId === 1 && p.revision === this.revision) {
        clearTimeout(this.phaseTimer); this.phase = 'active'; this.hooks.confirmed(this.revision); this.resolveReady(); return;
      }
      if (x.type === 'STATE_CHANGED' && this.phase === 'active' && !this.committing && exact(p, ['changeId', 'baseRevision', 'state']) && positive(p.changeId) && p.changeId === this.changes + 1 && (!this.snapshot || !this.snapshot.crossed)) {
        this.changes++; if (this.snapshot) this.snapshot.crossed = true; this.startCommit(p, 'STATE', p.changeId); return;
      }
      if (x.type === 'STATE_SNAPSHOT' && this.phase === 'active' && !this.committing && this.snapshot && exact(p, ['requestId', 'baseRevision', 'state']) && p.requestId === this.snapshot.requestId) {
        this.startCommit(p, 'SNAPSHOT', p.requestId); return;
      }
      throw Error('PROTOCOL');
    } catch { this.close('PROTOCOL'); }
  }
  private startCommit(payload: any, kind: 'STATE' | 'SNAPSHOT', id: number) {
    const next = validateState(payload.state, this.loaded.template.adapterManifest); this.unsaved = next; this.hooks.saving();
    this.commitTimer = setTimeout(() => this.close('TIMEOUT'), 5000);
    const work = async () => {
      try {
        check(payload.baseRevision === this.revision, 'CONFLICT');
        const result = await this.repo.commit(this.loaded.instance.id, this.loaded.template.id, payload.baseRevision, next, this.loaded.template.adapterManifest, this.abort.signal);
        if (this.phase === 'closed') return; // No ACK after close, even if a transaction completed just before cancellation.
        this.revision = result.revision; this.state = result.state; this.unsaved = null;
        this.send(kind + '_ACCEPTED', { [kind === 'STATE' ? 'changeId' : 'requestId']: id, revision: this.revision, durability: 'committed' });
        this.hooks.confirmed(this.revision);
        if (kind === 'SNAPSHOT') { const pending = this.snapshot; this.snapshot = null; if (pending) { clearTimeout(pending.timer); pending.resolve({ revision: this.revision, state: structuredClone(this.state) }); } }
      } catch (error) {
        if (this.phase === 'closed') return;
        const code = String(error).includes('CONFLICT') ? 'CONFLICT' : String(error).includes('READ_ONLY') ? 'READ_ONLY' : 'STORAGE_ERROR';
        try { this.send(kind + '_REJECTED', { [kind === 'STATE' ? 'changeId' : 'requestId']: id, code }); } catch { /* best effort */ }
        this.close(code);
      } finally { clearTimeout(this.commitTimer); this.committing = null; }
    };
    this.committing = work();
  }
  checkpoint(reason: 'checkpoint' | 'close' | 'export' = 'checkpoint'): Promise<ConfirmedSnapshot> {
    if (this.snapshotPromise) return this.snapshotPromise;
    const run = async () => {
      await this.ready; if (this.committing) await this.committing; check(this.phase === 'active', 'SESSION_CLOSED');
      return new Promise<ConfirmedSnapshot>((resolve, reject) => {
        const requestId = ++this.requests; check(positive(requestId), 'REQUEST_OVERFLOW');
        this.snapshot = { requestId, crossed: false, resolve, reject, timer: setTimeout(() => this.close('TIMEOUT'), 2000) };
        try { this.send('REQUEST_STATE', { requestId, reason }); } catch { this.close('PROTOCOL'); }
      });
    };
    this.snapshotPromise = run().finally(() => { this.snapshotPromise = null; }); return this.snapshotPromise;
  }
  close(code = 'USER_CLOSE') {
    if (this.phase === 'closed') return;
    try { this.send('CLOSE', { code: ['USER_CLOSE', 'REPLACED', 'TIMEOUT', 'PROTOCOL', 'NAVIGATION'].includes(code) ? code : 'PROTOCOL' }); } catch { /* best effort */ }
    this.phase = 'closed'; this.abort.abort(); clearTimeout(this.phaseTimer); clearTimeout(this.commitTimer);
    if (this.snapshot) { clearTimeout(this.snapshot.timer); this.snapshot.reject(Error(code)); this.snapshot = null; }
    this.rejectReady(Error(code)); this.port.onmessage = this.port.onmessageerror = null; this.port.close(); this.frame.onload = null; this.frame.remove();
    if (!['USER_CLOSE', 'REPLACED'].includes(code)) this.hooks.failed(code);
  }
}
