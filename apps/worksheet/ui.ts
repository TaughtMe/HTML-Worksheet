import type { AppActions, AppView, ContainerKind, ContainerView, MountedUi, WorksheetView } from './types.js';

const icon = (name: string): string => ({
  home: '⌂', folder: '▰', notebook: '▤', chapter: '◫', sheet: '▧', add: '+',
  open: '↗', edit: '✎', move: '↔', remove: '×', search: '⌕', save: '✓',
  import: '＋', export: '⇧', offline: '◉', menu: '⋯',
} as Record<string, string>)[name] ?? '•';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, kind: string, action: () => void | Promise<void>, className = 'secondary'): HTMLButtonElement {
  const node = el('button', className);
  node.type = 'button';
  node.setAttribute('aria-label', label);
  const glyph = el('span', 'icon', icon(kind)); glyph.setAttribute('aria-hidden', 'true');
  node.append(glyph, document.createTextNode(label));
  node.addEventListener('click', () => { void action(); });
  return node;
}

function statusLabel(status: WorksheetView['status']): string {
  if (status === 'completed') return 'Abgeschlossen';
  if (status === 'in-progress') return 'In Bearbeitung';
  return 'Entwurf';
}

function saveText(view: AppView): { text: string; kind: string } {
  if (view.save.state === 'saved') return { text: view.save.message || 'Änderungen lokal bestätigt', kind: 'saved' };
  if (view.save.state === 'saving') return { text: view.save.message || 'Speichert …', kind: 'saving' };
  if (view.save.state === 'conflict') return { text: view.save.message || 'Änderungskonflikt – bitte erneut laden oder schließen', kind: 'error' };
  if (view.save.state === 'error') return { text: view.save.message || 'Speichern fehlgeschlagen', kind: 'error' };
  return { text: view.save.message || 'Noch keine bestätigte Speicherung für dieses Blatt', kind: 'idle' };
}

export function mountUi(root: HTMLElement, actions: AppActions): MountedUi {
  root.replaceChildren();
  const shell = el('div', 'shell');
  const sidebar = el('aside', 'sidebar');
  const brand = el('div', 'brand', 'Meine Blätter');
  brand.append(el('small', '', 'LOKALER ARBEITSBEREICH'));
  const navSection = el('div', 'side-label', 'Bibliothek');
  const tree = el('nav', 'tree'); tree.setAttribute('aria-label', 'Ordner und Arbeitshefte');
  const mobileNav = el('nav', 'mobile-nav'); mobileNav.setAttribute('aria-label', 'Schnellnavigation');
  const spacer = el('div', 'sidebar-spacer');
  const storage = el('section', 'storage-card');
  const storageTitle = el('div', 'storage-title');
  const storageMessage = el('div', 'storage-message');
  const storageDot = el('span', 'icon', icon('offline')); storageDot.setAttribute('aria-hidden', 'true');
  storageTitle.append(storageDot, document.createTextNode('Dieses Gerät'));
  storage.append(storageTitle, storageMessage);
  sidebar.append(brand, navSection, tree, mobileNav, spacer, storage);

  const main = el('main', 'main');
  const toolbar = el('div', 'toolbar');
  const toolbarGrow = el('div', 'grow');
  const importInput = el('input', 'sr-only'); importInput.type = 'file'; importInput.accept = '.html,text/html'; importInput.setAttribute('aria-label', 'HTML-Arbeitsblatt auswählen');
  const importButton = button('Blatt öffnen', 'open', () => importInput.click());
  const newFolderButton = button('Neu', 'add', () => showCreate('folder'), 'primary');
  const backupOut = button('Sicherung exportieren', 'export', actions.exportBackup);
  const backupIn = button('Sicherung importieren', 'import', () => backupInput.click());
  const backupInput = el('input', 'sr-only'); backupInput.type = 'file'; backupInput.accept = '.json,application/json'; backupInput.setAttribute('aria-label', 'Sicherungsdatei auswählen');
  toolbar.append(toolbarGrow, importInput, importButton, backupInput, backupIn, backupOut, newFolderButton);
  const errorBox = el('div', 'main-error'); errorBox.hidden = true; errorBox.setAttribute('role', 'alert');
  const prototypeNote = el('p', 'card-meta', 'Technischer MVP: vorerst nur Beispieldaten verwenden.');
  const heading = el('div', 'heading-row');
  const headingCopy = el('div');
  const crumb = el('div', 'crumb');
  const title = el('h1', 'page-title', 'Alle Arbeitsblätter');
  headingCopy.append(crumb, title);
  const createNotebook = button('Arbeitsheft hinzufügen', 'add', () => showCreate('notebook'), 'secondary');
  const createChapter = button('Kapitel hinzufügen', 'add', () => showCreate('folder'), 'secondary');
  heading.append(headingCopy, createChapter, createNotebook);
  const saveStatus = el('div', 'status-line'); saveStatus.setAttribute('role', 'status'); saveStatus.setAttribute('aria-live', 'polite');
  const sectionHead = el('div', 'section-head');
  const sectionTitle = el('h2', '', 'Arbeitsblätter');
  const refreshText = el('span', 'card-meta');
  sectionHead.append(sectionTitle, refreshText);
  const containersGrid = el('div', 'card-grid');
  const worksheetsGrid = el('div', 'card-grid');
  const empty = el('div', 'empty');
  const runnerWrap = el('section', 'runner-wrap'); runnerWrap.hidden = true;
  const runnerLabel = el('div', 'runner-label', 'Arbeitsblatt');
  const editorActions = el('div', 'toolbar');
  const saveNow = button('Jetzt speichern', 'save', () => invoke(actions.saveNow));
  const workingCopy = button('Arbeitskopie anlegen', 'add', () => { if (latest?.openedId) return invoke(() => actions.copyWorksheet(latest!.openedId!)); });
  const pdf = button('PDF herunterladen', 'export', () => invoke(actions.exportPdf));
  const sharePdf = button('PDF teilen', 'export', () => invoke(actions.sharePdf));
  const close = button('Blatt schließen', 'remove', () => invoke(actions.closeWorksheet));
  editorActions.append(saveNow, workingCopy, pdf, sharePdf, close);
  const runnerMount = el('div', 'runner-mount');
  runnerWrap.append(runnerLabel, editorActions, runnerMount);
  const release = el('footer', 'release');
  const version = el('span', 'card-meta', 'Version ' + document.documentElement.dataset.appVersion);
  const updateMessage = el('span', 'card-meta'); updateMessage.setAttribute('role', 'status');
  const checkUpdate = button('Nach Updates suchen', 'search', actions.checkUpdate, 'quiet');
  const reload = button('Neue Version öffnen', 'open', () => {
    if (!latest?.busy && !latest?.openedId) location.reload();
  }, 'secondary');
  release.append(version, checkUpdate, reload, updateMessage);
  main.append(toolbar, prototypeNote, errorBox, heading, saveStatus, sectionHead, containersGrid, worksheetsGrid, empty, runnerWrap, release);
  shell.append(sidebar, main); root.append(shell);
  let latest: AppView | null = null;

  async function invoke(work: () => Promise<void>): Promise<void> {
    try { await work(); }
    catch (error) { errorBox.hidden = false; errorBox.textContent = error instanceof Error ? error.message : 'Aktion fehlgeschlagen'; }
  }
  function showCreate(kind: ContainerKind): void {
    if (!latest) return;
    const title = window.prompt(kind === 'notebook' ? 'Name des Arbeitshefts' : 'Name des Ordners oder Kapitels');
    if (title === null || !title.trim()) return;
    const parentId = kind === 'folder' ? latest.selectedContainerId : null;
    void invoke(() => actions.createContainer(kind, title.trim(), parentId));
  }
  function editTitle(item: ContainerView | WorksheetView, isContainer: boolean): void {
    const value = window.prompt('Neuer Titel', item.title);
    if (value === null || !value.trim() || value.trim() === item.title) return;
    const work = isContainer
      ? actions.renameContainer(item.id, value.trim(), item.metadataRevision)
      : actions.renameWorksheet(item.id, value.trim(), item.metadataRevision);
    void invoke(() => work);
  }
  function moveItem(item: ContainerView | WorksheetView, isContainer: boolean): void {
    if (!latest) return;
    const candidates = latest.containers.filter(c => !isContainer || c.id !== item.id);
    const choices = candidates.map((c, index) => `${index + 1}: ${c.title} (${c.kind === 'notebook' ? 'Arbeitsheft' : 'Ordner/Kapitel'})`).join('\n');
    const answer = window.prompt(`Ziel auswählen: 0 = oberste Ebene\n${choices}`, '0');
    if (answer === null) return;
    const index = Number(answer.trim());
    if (!Number.isInteger(index) || index < 0 || index > candidates.length) { errorBox.hidden = false; errorBox.textContent = 'Bitte eine der angezeigten Zielnummern wählen.'; return; }
    const target = index === 0 ? null : candidates[index - 1].id;
    const work = isContainer
      ? actions.moveContainer(item.id, target, item.metadataRevision)
      : actions.moveWorksheet(item.id, target, item.metadataRevision);
    void invoke(() => work);
  }
  function deleteItem(item: ContainerView | WorksheetView, isContainer: boolean): void {
    if (!window.confirm(`„${item.title}“ löschen? ${isContainer ? 'Es können nur leere Ordner oder Hefte gelöscht werden.' : 'Dabei werden auch die gespeicherten Antworten dieses Blatts entfernt.'}`)) return;
    const work = 'headRevision' in item
      ? actions.deleteWorksheet(item.id, item.metadataRevision, item.headRevision)
      : actions.deleteContainer(item.id, item.metadataRevision);
    void invoke(() => work);
  }
  function render(view: AppView): void {
    updateMessage.textContent = (view.update?.message ?? '') + (view.update?.available && view.openedId ? ' Bitte zuerst das Blatt speichern und schließen.' : '');
    checkUpdate.disabled = !!view.update?.checking;
    reload.hidden = !view.update?.available;
    reload.disabled = view.busy || !!view.openedId;
    latest = view; errorBox.hidden = !view.error; errorBox.textContent = view.error ?? '';
    const saving = saveText(view); saveStatus.textContent = saving.text; saveStatus.dataset.kind = saving.kind;
    saveStatus.hidden = !view.openedId && view.save.state === 'idle' && !view.save.message;
    storageMessage.textContent = view.offline.ready ? view.offline.message : view.offline.message || 'Offline-Bereitschaft nicht bestätigt';
    storage.dataset.ready = String(view.offline.ready);
    importInput.onchange = () => { const file = importInput.files?.[0]; if (file) void invoke(() => actions.importWorksheet(file)); importInput.value = ''; };
    backupInput.onchange = () => { const file = backupInput.files?.[0]; if (file) void invoke(() => actions.importBackup(file)); backupInput.value = ''; };
    for (const btn of [importButton, newFolderButton, backupIn, backupOut, createNotebook, createChapter]) btn.disabled = view.busy;
    for (const btn of [saveNow, workingCopy, pdf, sharePdf, close]) btn.disabled = view.busy || !view.openedId;
    const selected = view.containers.find(c => c.id === view.selectedContainerId);
    title.textContent = view.openedId ? view.openedTitle : selected?.title ?? 'Alle Arbeitsblätter';
    crumb.textContent = selected ? `${selected.kind === 'notebook' ? 'Arbeitsheft' : 'Ordner'} · ${selected.title}` : 'Deine lokale Bibliothek';
    tree.replaceChildren(); mobileNav.replaceChildren();
    const home = button('Alle Arbeitsblätter', 'home', () => invoke(() => actions.selectContainer(null)), `nav${selected ? '' : ' selected'}`);
    tree.append(home); mobileNav.append(home.cloneNode(true));
    (mobileNav.lastChild as HTMLButtonElement).onclick = () => { void invoke(() => actions.selectContainer(null)); };
    for (const c of view.containers) {
      const node = button(c.title, c.kind === 'notebook' ? 'notebook' : 'folder', () => invoke(() => actions.selectContainer(c.id)), `nav${selected?.id === c.id ? ' selected' : ''}`);
      node.style.setProperty('--indent', c.parentId ? '28px' : '10px');
      node.prepend(el('span', 'nav-icon', icon(c.kind === 'notebook' ? 'notebook' : 'folder')));
      tree.append(node);
      const mobile = button(c.title, c.kind === 'notebook' ? 'notebook' : 'folder', () => invoke(() => actions.selectContainer(c.id)), `nav${selected?.id === c.id ? ' selected' : ''}`);
      mobileNav.append(mobile);
    }
    containersGrid.replaceChildren(); worksheetsGrid.replaceChildren();
    const visibleContainers = view.containers.filter(c => c.parentId === view.selectedContainerId);
    for (const c of visibleContainers) {
      const card = el('article', 'card');
      const top = el('div', 'card-top');
      const cover = el('span', `cover ${c.kind === 'notebook' ? '' : 'folder'}`, icon(c.kind === 'notebook' ? 'notebook' : 'folder'));
      const actionsBox = el('div', 'card-actions');
      actionsBox.append(button('Umbenennen', 'edit', () => editTitle(c, true), 'mini'), button('Verschieben', 'move', () => moveItem(c, true), 'mini'), button('Löschen', 'remove', () => deleteItem(c, true), 'mini'));
      top.append(cover, actionsBox);
      const name = el('div', 'card-title', c.title);
      const meta = el('div', 'card-meta', c.kind === 'notebook' ? 'Arbeitsheft' : selected?.kind === 'notebook' ? 'Kapitel' : 'Ordner');
      card.append(top, name, meta);
      card.addEventListener('dblclick', () => { void invoke(() => actions.selectContainer(c.id)); });
      card.addEventListener('click', (event) => { if ((event.target as HTMLElement).closest('button')) return; void invoke(() => actions.selectContainer(c.id)); });
      containersGrid.append(card);
    }
    const worksheets = view.worksheets.filter(w => w.containerId === view.selectedContainerId);
    for (const w of worksheets) {
      const card = el('article', 'card'); card.tabIndex = 0; card.setAttribute('role', 'group');
      const top = el('div', 'card-top'); top.append(el('span', 'cover', icon('sheet')));
      const actionsBox = el('div', 'card-actions');
      actionsBox.append(button('Umbenennen', 'edit', () => editTitle(w, false), 'mini'), button('Verschieben', 'move', () => moveItem(w, false), 'mini'), button('Kopie erstellen', 'add', () => invoke(() => actions.copyWorksheet(w.id)), 'mini'), button('Löschen', 'remove', () => deleteItem(w, false), 'mini'));
      top.append(actionsBox);
      const name = el('div', 'card-title', w.title);
      const meta = el('div', 'card-meta', `${statusLabel(w.status)} · zuletzt geändert ${new Date(w.updatedAt).toLocaleDateString('de-DE')}`);
      const open = button('Öffnen', 'open', () => invoke(() => actions.openWorksheet(w.id)), 'quiet');
      card.append(top, name, meta, open);
      card.addEventListener('dblclick', () => { void invoke(() => actions.openWorksheet(w.id)); });
      worksheetsGrid.append(card);
    }
    const hasItems = visibleContainers.length + worksheets.length > 0;
    empty.hidden = hasItems;
    empty.replaceChildren();
    if (!hasItems) {
      empty.append(el('strong', '', selected ? 'Hier ist noch nichts abgelegt' : 'Deine Bibliothek ist bereit'), document.createTextNode(selected ? 'Lege ein Arbeitsblatt ab oder füge ein Kapitel hinzu.' : 'Öffne eine HTML-Datei oder erstelle ein Arbeitsheft. Deine Inhalte werden erst nach bestätigter lokaler Speicherung als gesichert angezeigt.'));
    }
    runnerWrap.hidden = !view.openedId;
    runnerLabel.textContent = view.openedTitle ? `Arbeitsblatt · ${view.openedTitle}` : 'Arbeitsblatt';
    runnerMount.hidden = !view.openedId;
    refreshText.textContent = `${worksheets.length} ${worksheets.length === 1 ? 'Blatt' : 'Blätter'}`;
  }
  return { render, runnerMount, dispose() { root.replaceChildren(); } };
}
