// Login flow starting at saveonfoods.com, following SSO to account.morerewards.ca
// and back to saveonfoods.com. Pastes credentials (no per-char typing).
/* eslint-disable no-console */

(async () => {
  const { chromium } = require('playwright');
  const fs = require('fs');

  const USERNAME = process.env.USERNAME || process.env.SAVEONFOODS_EMAIL;
  const PASSWORD = process.env.PASSWORD || process.env.SAVEONFOODS_PASSWORD;
  if (!USERNAME || !PASSWORD) {
    console.error('[login] Missing credentials: set SAVEONFOODS_EMAIL/PASSWORD or USERNAME/PASSWORD');
    process.exit(2);
  }

  const timeout = { nav: 45000, wait: 15000 };
  const log = (m, d) => (d !== undefined ? console.log(`[login] ${m}`, d) : console.log(`[login] ${m}`));

  const SITES = {
    saveon: 'https://www.saveonfoods.com/',
    account: /account\.morerewards\.ca/i,
  };

  function firstVisibleLocator(page, selectors, perTimeout = 3000) {
    return (async () => {
      for (const sel of selectors) {
        const loc = page.locator(sel).first();
        try {
          await loc.waitFor({ state: 'visible', timeout: perTimeout });
          return loc;
        } catch {}
      }
      throw new Error(`No visible match for selectors: ${selectors.join(' | ')}`);
    })();
  }

  async function waitForAnyPageWith(context, testFn, totalMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < totalMs) {
      for (const p of context.pages()) {
        try { if (await testFn(p)) return p; } catch {}
      }
      await new Promise(r => setTimeout(r, 250));
    }
    return null;
  }

  let browser, context;
  const userDataDir = './.pw-user';
  try {
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled'],
      viewport: { width: 1366, height: 860 },
      locale: 'en-CA',
      timezoneId: 'America/Vancouver',
    });
  } catch (e) {
    browser = await chromium.launch({ headless: false, args: ['--disable-blink-features=AutomationControlled'] });
    context = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'en-CA', timezoneId: 'America/Vancouver' });
  }

  // Minimal stealth shims
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = window.chrome || { runtime: {} };
    Object.defineProperty(navigator, 'languages', { get: () => ['en-CA', 'en'] });
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
  });

  const page = await context.newPage();

  try {
    // 1) Go to Save-On-Foods
    log(`Navigating to ${SITES.saveon}`);
    await page.goto(SITES.saveon, { waitUntil: 'domcontentloaded', timeout: timeout.nav });

    // Handle cookie banners if present
    try {
      const cookieBtn = page.locator(
        [
          '#onetrust-accept-btn-handler',
          'button:has-text("Accept All")',
          'button:has-text("Accept")',
          'button:has-text("I Accept")',
        ].join(', ')
      );
      if (await cookieBtn.first().isVisible().catch(() => false)) {
        await cookieBtn.first().click().catch(() => {});
      }
    } catch {}

    // 2) Click "Sign In or Register"
    log('Looking for Sign In or Register');
    const signInSpan = await firstVisibleLocator(page, [
      'span[data-testid="header-sub-title-testId"]:has-text("Sign In")',
      'span[data-testid="header-sub-title-testId"]:has-text("Register")',
      'text=/Sign\s*In|Register/i',
    ]);

    // Try clicking closest clickable ancestor; fallback to direct click
    try {
      const handle = await signInSpan.elementHandle();
      await page.evaluate((el) => {
        const c = el.closest('a,button,[role="button"]');
        if (c) c.click(); else el.click();
      }, handle);
    } catch {
      await signInSpan.click({ timeout: timeout.wait }).catch(() => {});
    }

    // 3) Find Morerewards page (same or new tab)
    log('Waiting for account.morerewards.ca');
    let mrPage = await waitForAnyPageWith(context, async (p) => /account\.morerewards\.ca/i.test(p.url()), 20000);
    if (!mrPage) {
      // Try explicit wait on current page
      try { await page.waitForURL(SITES.account, { timeout: 10000 }); mrPage = page; } catch {}
    }
    if (!mrPage) throw new Error('Did not reach account.morerewards.ca after clicking Sign In');

    // 4) Fill credentials and submit on morerewards
    log('Filling MoreRewards credentials');
    const emailInput = await firstVisibleLocator(mrPage, ['#email','input[type="email"]','input[name="email"]','input[id*="email" i]']);
    await emailInput.scrollIntoViewIfNeeded().catch(() => {});
    await emailInput.fill('');
    await emailInput.fill(USERNAME);

    const passwordInput = await firstVisibleLocator(mrPage, ['#password','input[type="password"]','input[name="password"]','input[id*="password" i]']);
    await passwordInput.scrollIntoViewIfNeeded().catch(() => {});
    await passwordInput.fill('');
    await passwordInput.fill(PASSWORD);

    const submitBtn = mrPage
      .locator('button[type="submit"]:not([disabled])')
      .filter({ hasText: /(sign\s*in|log\s*in|continue|next)/i })
      .or(mrPage.locator('input[type="submit"]:not([disabled])'));

    await submitBtn.first().waitFor({ state: 'visible', timeout: timeout.wait });
    log('Submitting login');
    await submitBtn.first().scrollIntoViewIfNeeded().catch(() => {});
    await Promise.all([
      mrPage.waitForLoadState('networkidle', { timeout: timeout.nav }).catch(() => {}),
      submitBtn.first().click({ timeout: timeout.wait }),
    ]);

    // 5) Wait for redirect back to saveonfoods.com
    log('Waiting for redirect back to saveonfoods.com');
    const soPage = await waitForAnyPageWith(context, async (p) => /saveonfoods\.com/i.test(p.url()), 30000);
    const finalPage = soPage || mrPage;
    const finalUrl = finalPage.url();

    // Check for inline errors if still on MR and no redirect
    if (!soPage && /account\.morerewards\.ca/i.test(finalUrl)) {
      const err = await (async () => {
        const sels = ['[role="alert"]','[aria-live="assertive"]','[id$="helper-text"]','[data-testid*="error"]','.error','.helper-text'];
        for (const s of sels) {
          const t = await mrPage.locator(s).first().innerText().catch(() => '');
          if (t && t.trim()) return t.trim();
        }
        return '';
      })();
      if (err) {
        console.error(JSON.stringify({ status: 'error', message: err, url: finalUrl }));
        if (browser) await browser.close(); else await context.close();
        process.exit(1);
      }
    }

    // Determine success: prefer being on saveonfoods.com
    const onSaveOn = /saveonfoods\.com/i.test(finalUrl);
    let headerSpanText = '';
    try { headerSpanText = await finalPage.locator('span[data-testid="header-sub-title-testId"]').first().innerText({ timeout: 2000 }); } catch {}
    const signedOutHeader = /sign\s*in|register/i.test(headerSpanText || '');

    if (onSaveOn && !signedOutHeader) {
      log('Login success on saveonfoods.com', { finalUrl });
      console.log(JSON.stringify({ status: 'success', finalUrl }));
      await context.storageState({ path: 'storageState.json' }).catch(() => {});
      if (browser) await browser.close(); else await context.close();
      process.exit(0);
    }

    // Fallback success if morerewards shows logged-in page and SSO stays there
    if (/account\.morerewards\.ca/i.test(finalUrl)) {
      const path = new URL(finalUrl).pathname;
      if (/\/userPage\/home/i.test(path)) {
        log('MoreRewards login success (no redirect observed)', { finalUrl });
        console.log(JSON.stringify({ status: 'success_morerewards_only', finalUrl }));
        await context.storageState({ path: 'storageState.json' }).catch(() => {});
        if (browser) await browser.close(); else await context.close();
        process.exit(0);
      }
    }

    // Neither success condition met
    log('Login indeterminate');
    console.error(JSON.stringify({ status: 'unknown', finalUrl }));
    if (browser) await browser.close(); else await context.close();
    process.exit(1);
  } catch (err) {
    console.error(JSON.stringify({ status: 'exception', message: String(err && err.message || err) }));
    try { if (browser) await browser.close(); else await context.close(); } catch {}
    process.exit(1);
  }
})();

