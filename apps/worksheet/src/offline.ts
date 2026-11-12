// ServiceWorkerContainer.ready may resolve while the worker is still activating.
// A cache-readiness query must follow completion of that lifecycle, within the original preparation deadline.
export function waitForActivated(worker: ServiceWorker, remainingMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error) => { clearTimeout(timer); worker.removeEventListener('statechange', changed); error ? reject(error) : resolve(); };
    const changed = () => { if (worker.state === 'activated') finish(); else if (worker.state === 'redundant') finish(Error('Offline-Worker wurde ersetzt. Bitte neu laden.')); };
    worker.addEventListener('statechange', changed);
    timer = setTimeout(() => finish(Error('Offline-Vorbereitung noch nicht bestätigt.')), Math.max(0, remainingMs));
    changed();
  });
}
