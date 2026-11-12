// UI/Core contract. The UI renders only confirmed repository data and invokes these callbacks.
export type ContainerKind = 'folder' | 'notebook';
export type WorksheetStatus = 'draft' | 'in-progress' | 'completed';
export interface ContainerView {
  id: string;
  kind: ContainerKind;
  parentId: string | null;
  title: string;
  metadataRevision: number;
}
export interface WorksheetView {
  id: string;
  templateVersionId: string;
  containerId: string | null;
  title: string;
  status: WorksheetStatus;
  headRevision: number;
  metadataRevision: number;
  updatedAt: string;
}
export interface AppView {
  containers: ContainerView[];
  worksheets: WorksheetView[];
  selectedContainerId: string | null;
  openedId: string | null;
  openedTitle: string;
  save: { state: 'idle' | 'saving' | 'saved' | 'conflict' | 'error'; message: string };
  offline: { ready: boolean; message: string };
  update?: { message: string; available?: boolean; checking?: boolean };
  busy: boolean;
  error: string | null;
}
export interface AppActions {
  checkUpdate(): Promise<void>;
  selectContainer(id: string | null): Promise<void>;
  openWorksheet(id: string): Promise<void>;
  importWorksheet(file: File): Promise<void>;
  createContainer(kind: ContainerKind, title: string, parentId: string | null): Promise<void>;
  renameContainer(id: string, title: string, metadataRevision: number): Promise<void>;
  moveContainer(id: string, parentId: string | null, metadataRevision: number): Promise<void>;
  deleteContainer(id: string, metadataRevision: number): Promise<void>;
  renameWorksheet(id: string, title: string, metadataRevision: number): Promise<void>;
  moveWorksheet(id: string, containerId: string | null, metadataRevision: number): Promise<void>;
  deleteWorksheet(id: string, metadataRevision: number, headRevision: number): Promise<void>;
  copyWorksheet(id: string): Promise<void>;
  saveNow(): Promise<void>;
  closeWorksheet(): Promise<void>;
  exportPdf(): Promise<void>;
  sharePdf(): Promise<void>;
  exportBackup(): Promise<void>;
  importBackup(file: File): Promise<void>;
}
export interface MountedUi {
  render(view: AppView): void;
  /** Stable node: render must never replace, detach or clear this element. */
  runnerMount: HTMLElement;
  dispose(): void;
}
