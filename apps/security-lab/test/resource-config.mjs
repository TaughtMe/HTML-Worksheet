import { existsSync } from 'node:fs';
export const CASES = Object.freeze({ flood: 15000, refill: 20000, lifecycle: 40000, loop: 15000, allocation: 20000, recovery: 15000 });
export const RSS_BUDGET = 768 * 1024 * 1024;
export const ALLOCATION_BYTES = 64 * 1024 * 1024;
export const engine = process.env.BROWSER_ENGINE ?? 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(engine)) throw Error('BROWSER_ENGINE must be chromium, firefox or webkit');
export function launchOptions() {
  const options = { headless: true, timeout: 5000 };
  if (engine === 'chromium') {
    options.args = ['--no-sandbox'];
    if (process.env.CHROMIUM_PATH !== undefined) {
      if (!process.env.CHROMIUM_PATH) throw Error('CHROMIUM_PATH must not be empty');
      options.executablePath = process.env.CHROMIUM_PATH;
    } else if (existsSync('/usr/bin/chromium')) options.executablePath = '/usr/bin/chromium';
  }
  return options;
}
