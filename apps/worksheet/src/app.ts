import { mountUi } from '../ui.ts';
import type { AppActions, AppView } from '../types.ts';
import { Repository } from './repository.ts';
import { DurableSession } from './session.ts';
import { createPdf } from './pdf.ts';
import { waitForActivated } from './offline.ts';
const scriptNonce = (document.currentScript as HTMLScriptElement | null)?.nonce;
if (!scriptNonce) throw Error('APP_NONCE_MISSING');
const nonce = scriptNonce;
const view: AppView = { containers: [], worksheets: [], selectedContainerId: null, openedId: null, openedTitle: '', save: { state: 'idle', message: '' }, offline: { ready: false, message: 'Offline-Dateien werden vorbereitet …' }, busy: true, error: null };
let repo: Repository, session: DurableSession | null = null, refreshTicket = 0, databaseReady = false;
const errors: Record<string, string> = {
  CONFLICT: 'Ein anderer Tab hat dieses Blatt geändert. Deine ungesicherte Antwort bleibt bis zum Schließen im Arbeitsspeicher. Lege eine Arbeitskopie an.',
  READ_ONLY: 'Dieses Blatt ist abgeschlossen. Zum Weiterarbeiten bitte eine Arbeitskopie anlegen.',
  CONTAINER_NOT_EMPTY: 'Dieser Ordner enthält noch Inhalte. Verschiebe oder lösche diese zuerst.',
  CONTAINER_CYCLE_DEPTH: 'Dieses Verschieben würde einen Kreis oder eine zu tiefe Ordnerstruktur erzeugen.',
  INVALID_TITLE: 'Bitte einen Namen mit höchstens 256 UTF-8-Bytes eingeben.',
  LIBRARY_BYTES_LIMIT: 'Die lokale Bibliothek ist für eine vollständige Sicherung zu groß. Exportiere zuerst eine Sicherung und entferne nicht benötigte Blätter.',
  LIBRARY_LIMIT: 'Die begrenzte Bibliothek ist voll. Sichere und entferne nicht benötigte Inhalte.',
  UNSAVED_CANDIDATE: 'Es gibt einen ungesicherten Stand. Lege eine Arbeitskopie an oder schließe das Blatt bewusst.',
  TIMEOUT: 'Der Speichervorgang konnte nicht rechtzeitig bestätigt werden. Bitte den letzten bestätigten Stand erneut öffnen.',
  STORAGE_ERROR: 'Die Änderung konnte nicht lokal bestätigt werden. Der letzte gespeicherte Stand bleibt erhalten; eine Arbeitskopie kann den ungesicherten Stand übernehmen.',
  NOT_FOUND: 'Dieses Blatt wurde inzwischen entfernt.',
  DATABASE_BLOCKED: 'Ein anderer Tab blockiert die lokale Datenbank. Schließe ihn und lade die App neu.'
};
function message(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (text.startsWith('STRICT_') || ['UNSUPPORTED_FIELD', 'RADIO_GROUP', 'MISSING_ID', 'AMBIGUOUS_ID'].includes(text)) return 'Diese HTML-Datei passt nicht zum unterstützten Format. Erlaubt sind feste Standardfelder und genau eine deklarierte Checkboxaktion; fremde Skripte und externe Inhalte werden nicht importiert.';
  if (text.startsWith('PDF_GLYPH')) return 'Die PDF-Schrift unterstützt ein enthaltenes Zeichen nicht: ' + text.slice(11) + '. Es wurde keine unvollständige PDF erzeugt.';
  if (text === 'PDF_TOO_LARGE') return 'Dieser Datenbericht ist zu groß (höchstens 1 MiB Text und 250 PDF-Seiten). Es wurde keine unvollständige PDF erzeugt.';
  if (error instanceof DOMException && ['QuotaExceededError', 'AbortError'].includes(error.name)) return 'Die lokale Speicherung ist fehlgeschlagen. Der letzte bestätigte Stand bleibt erhalten.';
  return errors[text] ?? 'Der Vorgang ist fehlgeschlagen: ' + text;
}
function render() { ui.runnerMount.inert = view.busy; ui.render(view); }
async function refresh() { const ticket = ++refreshTicket, data = await repo.list(); if (ticket !== refreshTicket) return; view.containers = data.containers; view.worksheets = data.worksheets; if (view.selectedContainerId && !data.containers.some(x => x.id === view.selectedContainerId)) view.selectedContainerId = null; const current = data.worksheets.find(x => x.id === view.openedId); if (current) view.openedTitle = current.title; render(); }
async function operation(work: () => Promise<void>) {
  if (view.busy) return; view.busy = true; view.error = null; render();
  try { await work(); await refresh(); } catch (error) { view.error = message(error); }
  finally { view.busy = false; render(); }
}
async function checkpoint(reason: 'checkpoint' | 'close' | 'export' = 'checkpoint') {
  if (!session) return; if (session.phase === 'closed') { if (session.unsaved) throw Error('UNSAVED_CANDIDATE'); throw Error('SESSION_CLOSED'); } await session.checkpoint(reason);
}
async function open(id: string, alreadySaved = false) {
  if (!alreadySaved && session) await checkpoint('close');
  const loaded = await repo.read(id); session?.close('REPLACED');
  view.openedId = id; view.openedTitle = loaded.instance.title; view.save = { state: 'idle', message: 'Letzter bestätigter Stand wird geladen …' }; render();
  const current = new DurableSession(repo, loaded, nonce, ui.runnerMount, {
    saving() { view.save = { state: 'saving', message: 'Änderung wird lokal bestätigt …' }; render(); },
    confirmed(revision) { view.save = { state: 'saved', message: `Zuletzt lokal bestätigt: Revision ${revision}. Weitere Eingaben werden automatisch übertragen.` }; render(); },
    failed(code) { view.save = { state: code === 'CONFLICT' ? 'conflict' : 'error', message: message(Error(code)) }; view.error = view.save.message; render(); }
  }); session = current; await current.ready;
}
function download(file: File) {
  const url = URL.createObjectURL(file), link = document.createElement('a'); link.href = url; link.download = file.name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function pdfFile(): Promise<File> {
  const current = session; if (!current || !view.openedId) throw Error('Kein Arbeitsblatt geöffnet.');
  const snapshot = await current.checkpoint('export');
  const data = await createPdf(view.openedTitle, current.loaded.parsed.content, snapshot.state);
  return new File([new Uint8Array(data).buffer], `arbeitsblatt-${current.loaded.instance.id}.pdf`, { type: 'application/pdf' });
}
const actions: AppActions = {
  selectContainer: id => operation(async () => { if (session) { await checkpoint('close'); session.close(); session = null; view.openedId = null; view.openedTitle = ''; view.save = { state: 'idle', message: '' }; } view.selectedContainerId = id; }),
  openWorksheet: id => operation(() => open(id)),
  importWorksheet: file => operation(async () => { const id = await repo.create(file, view.selectedContainerId); await open(id); }),
  createContainer: (kind, title, parentId) => operation(async () => {
    if (session) { await checkpoint('close'); session.close(); session = null; view.openedId = null; view.openedTitle = ''; view.save = { state: 'idle', message: '' }; }
    view.selectedContainerId = await repo.createContainer(kind, title, parentId);
  }),
  renameContainer: (id, title, revision) => operation(() => repo.editContainer(id, revision, { title })),
  moveContainer: (id, parentId, revision) => operation(() => repo.editContainer(id, revision, { parentId })),
  deleteContainer: (id, revision) => operation(() => repo.deleteContainer(id, revision)),
  renameWorksheet: (id, title, revision) => operation(() => repo.editWorksheet(id, revision, { title })),
  moveWorksheet: (id, containerId, revision) => operation(() => repo.editWorksheet(id, revision, { containerId })),
  deleteWorksheet: (id, revision, head) => operation(async () => { await repo.deleteWorksheet(id, revision, head); if (view.openedId === id) { session?.close(); session = null; view.openedId = null; view.openedTitle = ''; view.save = { state: 'idle', message: '' }; } }),
  copyWorksheet: id => operation(async () => {
    let candidate;
    if (session?.loaded.instance.id === id) { if (session.phase === 'closed' && session.unsaved) candidate = session.unsaved; else { await checkpoint(); candidate = session.state; } }
    else if (session) await checkpoint('close');
    let copied;
    try { copied = await repo.copy(id, candidate); }
    catch (error) {
      if (!(error instanceof Error) || error.message !== 'NOT_FOUND' || !candidate || session?.loaded.instance.id !== id) throw error;
      copied = await repo.recover(session.loaded.template, candidate, view.openedTitle); view.selectedContainerId = null;
    }
    await open(copied, true);
  }),
  saveNow: () => operation(() => checkpoint()),
  closeWorksheet: () => operation(async () => {
    if (session?.phase === 'closed') { if (session.unsaved && !confirm('Ungesicherten Stand verwerfen? Eine Arbeitskopie erhält ihn.')) return; }
    else if (session) await checkpoint('close');
    session?.close(); session = null; view.openedId = null; view.openedTitle = ''; view.save = { state: 'idle', message: '' };
  }),
  exportPdf: () => operation(async () => download(await pdfFile())),
  sharePdf: () => operation(async () => {
    const file = await pdfFile();
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: view.openedTitle }); return; } catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return; } }
    download(file);
  }),
  exportBackup: () => operation(async () => { if (session) await checkpoint('export'); const json = await repo.exportBackup(); download(new File([json], 'arbeitsblaetter-sicherung.json', { type: 'application/json' })); }),
  importBackup: file => operation(async () => { if (session) await checkpoint('close'); await repo.importBackup(file); })
};
const ui = mountUi(document.getElementById('app')!, actions); render();
addEventListener('beforeunload', event => {
  // The runner may still be in its quiet debounce, before the host has seen a candidate.
  if (session?.unsaved || session && session.phase !== 'closed' && session.loaded.instance.status !== 'completed') { event.preventDefault(); (event as BeforeUnloadEvent).returnValue = ''; }
});
async function offline() {
  try {
    const preparationDeadline = performance.now() + 10000;
    if (!('serviceWorker' in navigator)) throw Error('Service Worker nicht verfügbar.');
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (!existing?.active) await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    const registration = await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => setTimeout(() => reject(Error('Offline-Vorbereitung noch nicht bestätigt.')), Math.max(0, preparationDeadline - performance.now())))]);
    if (!registration.active) throw Error('Offline-Worker ist nicht aktiv.');
    await waitForActivated(registration.active, preparationDeadline - performance.now());
    if (!navigator.serviceWorker.controller) await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Offline-Steuerung noch nicht aktiv.')), 5000);
      navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    await new Promise<void>((resolve, reject) => {
      const channel = new MessageChannel(), timer = setTimeout(() => { channel.port1.close(); reject(Error('Offline-Cache nicht bestätigt.')); }, 3000);
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); event.data?.ready === true ? resolve() : reject(Error('Offline-Dateien fehlen. Bitte einmal online neu laden.')); };
      navigator.serviceWorker.controller!.postMessage({ type: 'CACHE_STATUS' }, [channel.port2]);
    });
    view.offline = { ready: true, message: 'App-Dateien lokal verfügbar. Antworten werden separat auf diesem Gerät gespeichert.' };
  } catch (error) { view.offline = { ready: false, message: message(error) }; } render();
}
void (async () => {
  try { repo = await Repository.open(); repo.onChange = () => { void refresh().catch(error => { view.error = message(error); render(); }); }; await refresh(); databaseReady = true; }
  catch (error) { view.error = message(error); }
  finally { view.busy = !databaseReady; render(); }
  void offline();
})();
