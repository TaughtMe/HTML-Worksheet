// Trusted positive controls only; failures propagate to the browser harness's record()/finalizer.
export async function checkTrustedControls(context) {
  const page = await context.newPage();
  try {
    await page.setContent('<button id="popup">Popup</button><button id="download">Download</button>');
    await page.evaluate(() => {
      document.getElementById('popup').onclick = () => window.open('about:blank');
      document.getElementById('download').onclick = () => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['synthetic control'])); a.download = 'synthetic-control.txt'; a.click();
      };
    });
    // Observe both promises immediately: an event timeout must also be caught while click is pending.
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('#popup').click()]);
    await popup.close();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
    const filename = download.suggestedFilename(); await download.delete();
    return { popup: 'closed', download: filename };
  } finally { await page.close(); }
}
