// Playwright login script for https://account.morerewards.ca/login
// - Uses env vars: SAVEONFOODS_EMAIL, SAVEONFOODS_PASSWORD
// - Launches visible browser (headless: false)
// - Fills fields in one action (no per-char typing)
// - Clicks Submit once and waits for navigation/network idle
// - Reports success if URL no longer contains /login or if a dashboard-like element appears
// - On failure, captures inline error/helper text and exits non-zero

/* eslint-disable no-console */

(async () => {
  const { chromium } = require('playwright');
  const fs = require('fs');
  const URL = 'https://account.morerewards.ca/';

  const USERNAME = process.env.USERNAME || process.env.SAVEONFOODS_EMAIL;
  const PASSWORD = process.env.PASSWORD || process.env.SAVEONFOODS_PASSWORD;

  if (!USERNAME || !PASSWORD) {
    console.error('[login] Missing credentials. Provide SAVEONFOODS_EMAIL and SAVEONFOODS_PASSWORD (or USERNAME/PASSWORD).');
    process.exit(2);
  }

  const selectors = {
    emailCandidates: [
      '#email',
      'input[type="email"]',
      'input[name="email"]',
      'input[id*="email" i]',
    ],
    passwordCandidates: [
      '#password',
      'input[type="password"]',
      'input[name="password"]',
      'input[id*="password" i]',
    ],
    remember: '#rememberMeBtn',
    submit: 'button[type="submit"]',
    // Error/helper selectors
    errorCandidates: [
      '[role="alert"]',
      '[aria-live="assertive"]',
      '[id$="helper-text"]',
      '[data-testid*="error"]',
      '.error',
      '.helper-text',
    ],
    // Success indicators
    successCandidates: [
      '#dashboard',
      '[data-test="dashboard"]',
      'a[href*="/dashboard"]',
      'nav [aria-label*="Account" i]',
      '[aria-label*="profile" i]',
    ],
  };

  const timeout = {
    nav: 30000,
    wait: 15000,
  };

  const log = (msg, data) => {
    if (data !== undefined) console.log(`[login] ${msg}`, data);
    else console.log(`[login] ${msg}`);
  };

  function firstDefined(arr) {
    for (const v of arr) if (v && String(v).trim().length > 0) return String(v).trim();
    return null;
  }

  async function getFirstErrorText(page) {
    for (const sel of selectors.errorCandidates) {
      const loc = page.locator(sel);
      const count = await loc.count();
      for (let i = 0; i < Math.min(count, 3); i++) {
        const t = await loc.nth(i).innerText().catch(() => null);
        if (t && t.trim()) return t.trim();
      }
    }
    return null;
  }

  async function hasSuccessIndicator(page) {
    for (const sel of selectors.successCandidates) {
      const el = page.locator(sel);
      if (await el.first().isVisible().catch(() => false)) return true;
    }
    return false;
  }

  // Attempt stealthier persistent Chrome; fallback to bundled Chromium
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
  const page = await context.newPage();

  // Minimal stealth shims
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = window.chrome || { runtime: {} };
    Object.defineProperty(navigator, 'languages', { get: () => ['en-CA', 'en'] });
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
    const origQuery = window.navigator.permissions && window.navigator.permissions.query;
    if (origQuery) {
      window.navigator.permissions.query = (parameters) => (
        parameters && parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : origQuery(parameters)
      );
    }
  });

  try {
    log(`Navigating to ${URL}`);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: timeout.nav });

    // Accept cookie banners if present
    try {
      const cookieBtn = page.locator(
        [
          '#onetrust-accept-btn-handler',
          'button:has-text("Accept All")',
          'button:has-text("Accept")',
          'button:has-text("I Accept")',
        ].join(', ')
      );
      if (await cookieBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await cookieBtn.first().click().catch(() => {});
      }
    } catch {}

    // Email (with fallbacks)
    log('Waiting for email input');
    const emailInput = await (async () => {
      for (const sel of selectors.emailCandidates) {
        const loc = page.locator(sel);
        try {
          await loc.first().waitFor({ state: 'visible', timeout: 3000 });
          return loc.first();
        } catch {}
      }
      throw new Error('Email input not found');
    })();
    await emailInput.scrollIntoViewIfNeeded().catch(() => {});
    await emailInput.fill('');
    await emailInput.fill(USERNAME);

    // Password (with fallbacks)
    log('Waiting for password input');
    const passwordInput = await (async () => {
      for (const sel of selectors.passwordCandidates) {
        const loc = page.locator(sel);
        try {
          await loc.first().waitFor({ state: 'visible', timeout: 3000 });
          return loc.first();
        } catch {}
      }
      throw new Error('Password input not found');
    })();
    await passwordInput.scrollIntoViewIfNeeded().catch(() => {});
    await passwordInput.fill('');
    await passwordInput.fill(PASSWORD);

    // Remember me: leave untouched (intentionally)

    // Find submit button: enabled + text contains Sign in/Log in/Continue
    log('Locating enabled submit button');
    const submitBtn = page
      .locator(`${selectors.submit}:not([disabled])`)
      .filter({ hasText: /(sign\s*in|log\s*in|continue|next)/i })
      .or(page.locator('input[type="submit"]:not([disabled])'));

    await submitBtn.first().waitFor({ state: 'visible', timeout: timeout.wait });

    // Click once
    log('Clicking submit');
    await submitBtn.first().scrollIntoViewIfNeeded().catch(() => {});
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: timeout.nav }).catch(() => {}),
      submitBtn.first().click({ timeout: timeout.wait }),
    ]);

    // Also wait briefly for URL change if possible
    const prevUrl = page.url();
    let urlChanged = false;
    try {
      await page.waitForURL((u) => u.toString() !== prevUrl, { timeout: 8000 });
      urlChanged = true;
    } catch {}

    // Determine success
    const finalUrl = page.url();
    const notLoginPath = !/\/login(\b|\/|\?|#)/i.test(finalUrl);
    const successElement = await hasSuccessIndicator(page);

    if (notLoginPath || successElement) {
      log('Login success', { urlChanged, finalUrl, successElement });
      console.log(JSON.stringify({ status: 'success', finalUrl, urlChanged, successElement }));
      await context.storageState({ path: 'storageState.json' }).catch(() => {});
      if (browser) await browser.close(); else await context.close();
      process.exit(0);
    }

    // If not successful yet, check for inline error
    log('Checking for inline error');
    const errText = await getFirstErrorText(page);
    if (errText) {
      log('Inline error captured', errText);
      console.error(JSON.stringify({ status: 'error', message: errText, url: finalUrl }));
      if (browser) await browser.close(); else await context.close();
      process.exit(1);
    }

    // Handle potential MFA/CAPTCHA hints
    const mfaOrCaptcha = await page.locator('[id*="captcha" i], [class*="captcha" i], [aria-label*="captcha" i], [aria-label*="verification" i], [data-test*="mfa" i], [data-testid*="mfa" i]').first().isVisible().catch(() => false);
    if (mfaOrCaptcha) {
      log('MFA/CAPTCHA detected');
      console.error(JSON.stringify({ status: 'blocked', reason: 'mfa_or_captcha', url: finalUrl }));
      await browser.close();
      process.exit(1);
    }

    // If neither success nor error detected, report indeterminate state
    log('Login indeterminate, no success indicator or error found');
    console.error(JSON.stringify({ status: 'unknown', url: finalUrl }));
    if (browser) await browser.close(); else await context.close();
    process.exit(1);
  } catch (err) {
    log('Exception thrown');
    console.error(JSON.stringify({ status: 'exception', message: String(err && err.message || err) }));
    try { if (browser) await browser.close(); else await context.close(); } catch {}
    process.exit(1);
  }
})();
