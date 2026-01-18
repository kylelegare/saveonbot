/* eslint-disable no-console */
(async () => {
  const { chromium, devices } = require('playwright');
  const fs = require('fs');
  const path = require('path');

  const START_URL = 'https://www.saveonfoods.com/';
  const LOG_DIR = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const harPath = path.join(LOG_DIR, `session-${ts}.har`);

  const log = (m, d) => (d !== undefined ? console.log(`[lite] ${m}`, d) : console.log(`[lite] ${m}`));

  const userDataDir = './.pw-user';
  let browser, context;
  try {
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled'],
      viewport: { width: 1366, height: 860 },
      locale: 'en-CA',
      timezoneId: 'America/Vancouver',
      recordHar: { path: harPath, content: 'omit' },
      colorScheme: 'light',
    });
  } catch (e) {
    browser = await chromium.launch({ headless: false, args: ['--disable-blink-features=AutomationControlled'] });
    context = await browser.newContext({
      viewport: { width: 1366, height: 860 },
      locale: 'en-CA',
      timezoneId: 'America/Vancouver',
      recordHar: { path: harPath, content: 'omit' },
      colorScheme: 'light',
    });
  }

  // Avoid page injection: no addInitScript, no exposeBinding, no tracing.
  // Grant geolocation quietly to prevent permission popups.
  try {
    await context.grantPermissions(['geolocation'], { origin: 'https://www.saveonfoods.com' });
    await context.setGeolocation({ latitude: 49.2827, longitude: -123.1207, accuracy: 50 });
  } catch {}

  const page = await context.newPage();

  // Lightweight logging without DOM injection
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) log('Navigated', frame.url()); });
  page.on('pageerror', (err) => log('PageError', String(err)));
  page.on('console', (msg) => log(`Console[${msg.type()}]`, msg.text()));

  try {
    log('Opening site…');
    await page.goto(START_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // Accept cookies if present (non-invasive)
    try { const c = page.locator('#onetrust-accept-btn-handler, button:has-text("Accept All"), button:has-text("Accept")').first(); if (await c.isVisible().catch(() => false)) await c.click().catch(() => {}); } catch {}

    // Prompt user: interact freely; press Enter in terminal to stop
    log(`HAR recording to: ${harPath}`);
    console.log('A browser window is open. Interact freely (search, add to cart, etc.).');
    console.log('When done, return here and press Ctrl+C to stop.');

    // Keep process alive until terminated
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await page.waitForTimeout(1000);
    }
  } catch (err) {
    console.error('[lite] Error:', err);
  } finally {
    try { if (browser) await browser.close(); else await context.close(); } catch {}
    log('Saved HAR:', harPath);
  }
})();

