import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
// Use the user-facing button so Playwright observes the same busy/disabled boundary as a person.
export async function importWorksheet(page, file, buttonName = 'Blatt öffnen') {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: buttonName, exact: true }).click()]);
  await chooser.setFiles(file);
}

export async function captureApp(page, output) {
  const screenshots = [];
  const original = page.viewportSize();
  try { for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['tablet-width', { width: 820, height: 1180 }], ['phone-width', { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport);
    // The synthetic fixtures share these two controls. Bring their actual frame into view before capture:
    // a full-page image alone can contain a blank offscreen iframe on narrow viewports.
    const iframe = page.locator('iframe'); await iframe.scrollIntoViewIfNeeded();
    const worksheetControls = [];
    for (const id of ['check', 'toggle']) {
      const control = page.frameLocator('iframe').locator('#' + id);
      await control.scrollIntoViewIfNeeded(); await control.waitFor({ state: 'visible' });
    }
    const frameRect = await iframe.boundingBox(); assert(frameRect, 'Missing worksheet frame bounds');
    for (const id of ['check', 'toggle']) {
      const control = page.frameLocator('iframe').locator('#' + id), rect = await control.boundingBox();
      assert(rect && rect.width > 0 && rect.height > 0 && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width && rect.y + rect.height <= viewport.height
        && rect.x >= frameRect.x && rect.y >= frameRect.y && rect.x + rect.width <= frameRect.x + frameRect.width && rect.y + rect.height <= frameRect.y + frameRect.height,
      `Worksheet #${id} not fully visible in frame/viewport at ${viewport.width}px`);
      worksheetControls.push({ id, rect, visible: true, insideViewportAndFrame: true });
    }
    const actions = await page.evaluate(() => [...document.querySelectorAll('.main > .toolbar > button, .runner-wrap .toolbar > button, .card-actions > button')].map(button => {
      const rect = button.getBoundingClientRect(), container = (button.closest('.card') ?? button.closest('.runner-wrap') ?? button.closest('.toolbar')).getBoundingClientRect(), style = getComputedStyle(button);
      return { label: button.getAttribute('aria-label'), rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
        horizontalViewport: rect.left >= -2 && rect.right <= innerWidth + 2,
        insideContainer: rect.left >= container.left - 2 && rect.right <= container.right + 2 && rect.top >= container.top - 2 && rect.bottom <= container.bottom + 2 };
    }));
    const worksheetPath = join(output, `app-${name}-worksheet-viewport.png`), worksheetData = await page.screenshot({ path: worksheetPath, fullPage: false });
    const path = join(output, `app-${name}.png`); const data = await page.screenshot({ path, fullPage: true });
    screenshots.push({ path, viewport, actions, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'),
      worksheetViewport: { path: worksheetPath, controls: worksheetControls, bytes: worksheetData.length, sha256: createHash('sha256').update(worksheetData).digest('hex') },
      note: 'Viewport only, no physical device claim; vertical page scrolling is allowed, horizontal clipping is not' });
    for (const label of ['Blatt öffnen', 'Jetzt speichern', 'Arbeitskopie anlegen', 'PDF herunterladen']) assert(actions.some(action => action.label === label), `Missing action ${label}`);
    assert(actions.every(action => action.visible && action.horizontalViewport && action.insideContainer), `Action outside viewport/container at ${viewport.width}px: ${JSON.stringify(actions.filter(action => !action.visible || !action.horizontalViewport || !action.insideContainer))}`);
  } } finally { if (original) await page.setViewportSize(original); }
  return screenshots;
}
