/* eslint-disable no-console */
(async () => {
  const { firefox } = require('playwright');
  const fs = require('fs');
  const path = require('path');
  const { spawnSync } = require('child_process');

  function resolveCamoufoxExecutable() {
    if (process.env.CAMOUFOX_EXECUTABLE) return process.env.CAMOUFOX_EXECUTABLE;

    const result = spawnSync('python3', ['-m', 'camoufox', 'path'], { encoding: 'utf-8' });
    if (result.status !== 0) {
      throw new Error(`Unable to determine Camoufox path (exit ${result.status}): ${result.stderr || ''}`);
    }

    const lines = result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!lines.length) {
      throw new Error('Camoufox path command returned no output');
    }

    const basePath = lines[lines.length - 1];
    return path.join(basePath, 'Camoufox.app', 'Contents', 'MacOS', 'camoufox');
  }

  const executablePath = resolveCamoufoxExecutable();

  const enableNetworkLogging = process.env.LOG_NETWORK === '1';
  const logDir = path.join('logs', 'network');
  let networkLogStream = null;
  if (enableNetworkLogging) {
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
    networkLogStream = fs.createWriteStream(logPath, { flags: 'a' });
    console.log(`[netlog] writing network log to ${logPath}`);
  }

  const shouldTrackUrl = (url) => /saveonfoods\.com|morerewards|pattisonfoodgroup/i.test(url);

  const writeNetworkLog = (entry) => {
    if (!networkLogStream) return;
    try {
      networkLogStream.write(`${JSON.stringify(entry)}\n`);
    } catch (err) {
      console.warn('[netlog] failed to write entry', err);
    }
  };

  const USERNAME = process.env.USERNAME || process.env.SAVEONFOODS_EMAIL;
  const PASSWORD = process.env.PASSWORD || process.env.SAVEONFOODS_PASSWORD;
  if (!USERNAME || !PASSWORD) {
    console.error('[login] Missing credentials: set SAVEONFOODS_EMAIL/PASSWORD or USERNAME/PASSWORD');
    process.exit(2);
  }

  const timeout = { nav: 45000, wait: 15000 };
  const log = (m, d) => (d !== undefined ? console.log(`[login] ${m}`, d) : console.log(`[login] ${m}`));

  const userDataDir = './.pw-user';
  let browser, context;
  const headless = String(process.env.HEADLESS || '').toLowerCase() === '1';
  log(`Headless mode: ${headless ? 'enabled' : 'disabled'}`);

  try {
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
    context = await firefox.launchPersistentContext(userDataDir, {
      headless,
      executablePath,
      viewport: { width: 1366, height: 860 },
      locale: 'en-CA',
      timezoneId: 'America/Vancouver',
    });
  } catch (e) {
    browser = await firefox.launch({ headless, executablePath });
    context = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'en-CA', timezoneId: 'America/Vancouver' });
  }

  if (enableNetworkLogging) {
    context.on('request', (request) => {
      if (!shouldTrackUrl(request.url())) return;
      writeNetworkLog({
        ts: Date.now(),
        type: 'request',
        method: request.method(),
        url: request.url(),
        headers: request.headers(),
        postData: request.postData() || null,
      });
    });

    context.on('requestfailed', (request) => {
      if (!shouldTrackUrl(request.url())) return;
      writeNetworkLog({
        ts: Date.now(),
        type: 'requestfailed',
        method: request.method(),
        url: request.url(),
        error: request.failure(),
      });
    });

    context.on('response', async (response) => {
      if (!shouldTrackUrl(response.url())) return;
      const entry = {
        ts: Date.now(),
        type: 'response',
        url: response.url(),
        status: response.status(),
        headers: response.headers(),
      };
      try {
        const ct = response.headers()['content-type'] || '';
        if (/application\/json/i.test(ct)) {
          const json = await response.json().catch(() => null);
          entry.body = json;
          if (json && /\/preview\?/i.test(response.url())) {
            const term = (() => {
              try { return new URL(response.url()).searchParams.get('q') || ''; }
              catch { return ''; }
            })();
            const topProducts = Array.isArray(json.products)
              ? json.products.slice(0, 3).map((product) => ({
                  sku: product.sku,
                  name: product.name,
                  price: product.price || product.priceNumeric || null,
                }))
              : [];
            if (topProducts.length && enableNetworkLogging) {
              writeNetworkLog({ ts: Date.now(), type: 'preview_summary', term, topProducts });
              log('Preview summary', { term, topProducts });
            }
          }
        } else if (/text\//i.test(ct)) {
          const text = await response.text().catch(() => null);
          if (text && text.length <= 2000) entry.body = text;
        }
      } catch (err) {
        entry.bodyError = String(err.message || err);
      }
      writeNetworkLog(entry);
    });
  }

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = window.chrome || { runtime: {} };
    Object.defineProperty(navigator, 'languages', { get: () => ['en-CA', 'en'] });
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
  });

  let page = await context.newPage();
  // Pre-grant geolocation to avoid browser permission prompt overlay
  try {
    await context.grantPermissions(['geolocation'], { origin: 'https://www.saveonfoods.com' });
    await context.setGeolocation({ latitude: 49.2827, longitude: -123.1207, accuracy: 50 });
  } catch {}

  async function waitForAnyPageWith(testFn, totalMs = 25000) {
    const start = Date.now();
    while (Date.now() - start < totalMs) {
      const pages = context.pages();
      if (process.env.DEBUG_LOGIN === '1') {
        log('debug: pages', pages.map(p => {
          try { return p.url(); } catch { return '[inaccessible]'; }
        }));
      }
      for (const p of pages) {
        try { if (await testFn(p)) return p; } catch {}
      }
      await new Promise(r => setTimeout(r, 250));
    }
    return null;
  }

  async function tryClick(loc) {
    try { await loc.waitFor({ state: 'visible', timeout: 2500 }); await loc.click({ timeout: 2500 }); return true; } catch { return false; }
  }

  function firstVisibleLocator(page, selectors, perTimeout = 3000) {
    return (async () => {
      for (const sel of selectors) {
        const loc = page.locator(sel).first();
        try { await loc.waitFor({ state: 'visible', timeout: perTimeout }); return loc; } catch {}
      }
      throw new Error(`No visible match for selectors: ${selectors.join(' | ')}`);
    })();
  }

  async function runShoppingFlow(page) {
    const rawTerms = process.env.SEARCH_TERMS ? process.env.SEARCH_TERMS.split(',') : ['milk', 'bread', 'apples'];
    const parsedTerms = rawTerms
      .map(t => t.trim())
      .filter(Boolean)
      .map(term => {
        const quantityMatch = term.match(/(.+?)@([0-9]+)$/);
        if (quantityMatch) {
          return { term: quantityMatch[1].trim(), quantity: Math.max(1, Number(quantityMatch[2])) };
        }
        const fallbackQuantity = Math.max(1, Number(process.env.ADD_TO_CART_QUANTITY || 1));
        return { term, quantity: fallbackQuantity };
      });

    if (!parsedTerms.length) return;

    for (const entry of parsedTerms) {
      const { term, quantity } = entry;
      log(`Searching for ${term}`);
      if (enableNetworkLogging) writeNetworkLog({ ts: Date.now(), type: 'step', step: 'search', term });
      const searchInput = page.locator('#searchInputField-desktop, #searchInputField-mobile, input[placeholder*="Search" i]').first();
      await searchInput.waitFor({ state: 'visible', timeout: timeout.wait });
      try { await searchInput.click({ clickCount: 3 }); } catch {}
      await searchInput.fill(term, { timeout: timeout.wait });

      const searchSubmit = page.locator('[data-testid="SearchInput-button-testId"], button[aria-label="Submit search query"]').first();
      const submitVisible = await searchSubmit.isVisible({ timeout: 2000 }).catch(() => false);
      if (submitVisible) {
        await searchSubmit.click().catch(() => searchInput.press('Enter'));
      } else {
        await searchInput.press('Enter').catch(() => {});
      }

      await page.waitForLoadState('domcontentloaded', { timeout: timeout.nav }).catch(() => {});

      const addButtons = page.locator('[data-testid^="addToCart_"]');
      await addButtons.first().waitFor({ state: 'visible', timeout: timeout.wait }).catch(() => {});
      const buttonCount = await addButtons.count();
      if (!buttonCount) {
        log('No add-to-cart buttons visible after search', { term });
        continue;
      }

      const addButton = addButtons.first();
      const skuTestId = await addButton.getAttribute('data-testid');
      await addButton.scrollIntoViewIfNeeded().catch(() => {});
      const cartResponse = page
        .waitForResponse(
          (response) => response.request().method() === 'POST' && /\/api\/stores\/\d+\/cart/i.test(response.url()),
          { timeout: timeout.nav }
        )
        .catch(() => null);
      await Promise.all([
        cartResponse,
        addButton.click({ timeout: timeout.wait }),
      ]);
      if (enableNetworkLogging) writeNetworkLog({ ts: Date.now(), type: 'step', step: 'add_to_cart', term, skuTestId, requestedQuantity: quantity });

      const productCard = addButton.locator('xpath=ancestor::article[contains(@class,"ProductCardWrapper")]');
      const increment = productCard.locator('button[data-testid="QuantityStepperIncrementButton"]').first();
      const quantityInput = productCard.locator('input.QuantityStepperInput--oakja, input[aria-label*="Quantity" i]').first();

      if (await increment.count()) {
        for (let i = 1; i < quantity; i += 1) {
          const incrementResponse = page
            .waitForResponse(
              (response) => response.request().method() === 'POST' && /\/api\/stores\/\d+\/cart/i.test(response.url()),
              { timeout: timeout.nav }
            )
            .catch(() => null);
          await Promise.all([
            incrementResponse,
            increment.click({ timeout: timeout.wait }).catch(() => {}),
          ]);
        }
      }

      let recordedQuantity = null;
      if (await quantityInput.count()) {
        try {
          await page.waitForTimeout(200);
          recordedQuantity = await quantityInput.evaluate((el) => Number(el.value) || Number(el.getAttribute('value')) || null);
        } catch {}
      }

      log('Added item', { term, requestedQuantity: quantity, skuTestId, recordedQuantity });
    }

    try {
      const miniCart = page.locator('[data-testid="minicart-button-testId"]').first();
      if (await miniCart.count()) {
        const miniText = await miniCart.textContent();
        log('Cart summary', miniText ? miniText.trim() : '');
      }
    } catch {}
  }

  try {
    log('Navigating to https://www.saveonfoods.com/');
    await page.goto('https://www.saveonfoods.com/', { waitUntil: 'domcontentloaded', timeout: timeout.nav });

    // Wait for initial location modal to finish (Camoufox geolocation may take a moment)
    try {
      await page.waitForSelector('#outside-modal', { state: 'hidden', timeout: 15000 });
    } catch {
      // If modal still blocking interaction, attempt to dismiss it directly
      try {
        await page.evaluate(() => {
          const modal = document.querySelector('#outside-modal');
          if (!modal) return;
          const closeButton = modal.querySelector('button, [role="button"], [aria-label="Close"]');
          if (closeButton) {
            closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          } else if (modal.parentElement) {
            modal.parentElement.remove();
          } else {
            modal.remove();
          }
        });
      } catch {}
    }

    // Ensure the modal no longer intercepts pointer events
    const modalDeadline = Date.now() + 20000;
    while (Date.now() < modalDeadline) {
      const stillVisible = await page.locator('#outside-modal').isVisible({ timeout: 500 }).catch(() => false);
      if (!stillVisible) break;
      await page.evaluate(() => {
        const modal = document.querySelector('#outside-modal');
        if (modal) {
          modal.style.display = 'none';
          modal.style.pointerEvents = 'none';
        }
      }).catch(() => {});
      await page.waitForTimeout(250);
    }

    // Camoufox often opens the floating feedback widget immediately—close it so it doesn't block header clicks.
    try {
      const feedbackClose = page.locator('button.feedbackWidgetFormCloseButton').first();
      if (await feedbackClose.isVisible({ timeout: 2000 }).catch(() => false)) {
        await feedbackClose.click({ timeout: 2000 });
      } else {
        await page.evaluate(() => {
          const widget = document.querySelector('.feedbackWidgetForm, .feedbackWidgetContainer');
          if (widget && widget.parentElement) widget.parentElement.removeChild(widget);
        }).catch(() => {});
      }
    } catch {}

    // Cookie banner
    try {
      const btn = page.locator('#onetrust-accept-btn-handler, button:has-text("Accept All"), button:has-text("Accept")').first();
      if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {});
    } catch {}

    let finalPage = page;
    let finalUrl = page.url();
    let alreadySignedIn = false;
    try {
      const headerStatus = await page.locator('span[data-testid="header-sub-title-testId"]').first().innerText({ timeout: 2000 });
      alreadySignedIn = headerStatus ? !/sign\s*in|register/i.test(headerStatus) : false;
      if (alreadySignedIn) log('Detected existing signed-in session, skipping SSO');
    } catch {}

    if (!alreadySignedIn) {
    const attemptSignIn = async (targetPage) => {
      log('Seeking Sign In/Register');
      let clicked = false;
      try {
        const span = targetPage.locator('span[data-testid="header-sub-title-testId"]').filter({ hasText: /sign\s*in|register/i }).first();
        await span.waitFor({ state: 'visible', timeout: 2500 });
        const handle = await span.elementHandle();
        await targetPage.evaluate((el) => { const c = el.closest('a,button,[role="button"]'); if (c) c.click(); else el.click(); }, handle);
        clicked = true;
      } catch {}
      const candidates = [
        'a:has-text("Sign In")',
        'button:has-text("Sign In")',
        'a:has-text("Register")',
        'button:has-text("Register")',
        'text=/Sign\\s*In or Register/i',
        'a[href*="account"]',
        'a[href*="morerewards"]',
        '[data-testid="header-sub-title-testId"]',
        'a[aria-label*="Sign In" i]',
        'button[aria-label*="Sign In" i]',
      ];
      for (const sel of candidates) { if (!clicked) clicked = await tryClick(targetPage.locator(sel).first()); }
      if (!clicked) throw new Error('Could not find Sign In/Register control');
      await targetPage.waitForLoadState('domcontentloaded', { timeout: timeout.nav }).catch(() => {});
      await targetPage.waitForLoadState('networkidle', { timeout: timeout.nav }).catch(() => {});
    };

    let mrPage = null;
    for (let attempt = 0; attempt < 3 && !mrPage; attempt += 1) {
      await attemptSignIn(page);
      await page.waitForTimeout(1500);
      mrPage = await waitForAnyPageWith(async p => /account\.morerewards\.ca/i.test(p.url()), 10000);
      if (!mrPage) {
        const latest = context.pages().slice(-1)[0];
        if (latest) page = latest;
      }
    }
    if (!mrPage) {
      try { await page.waitForURL(/account\.morerewards\.ca/i, { timeout: 15000 }); mrPage = page; } catch {}
    }
    if (!mrPage) throw new Error('Did not reach account.morerewards.ca after clicking Sign In');

      // Fill credentials
      log('Filling credentials on MoreRewards');
      const email = await firstVisibleLocator(mrPage, ['#email','input[type="email"]','input[name="email"]','input[id*="email" i]']);
      await email.scrollIntoViewIfNeeded().catch(() => {});
      await email.fill(''); await email.fill(USERNAME);
      const pass = await firstVisibleLocator(mrPage, ['#password','input[type="password"]','input[name="password"]','input[id*="password" i]']);
      await pass.scrollIntoViewIfNeeded().catch(() => {});
      await pass.fill(''); await pass.fill(PASSWORD);

      const submit = mrPage.locator('button[type="submit"]:not([disabled])').filter({ hasText: /(sign\s*in|log\s*in|continue|next)/i }).or(mrPage.locator('input[type="submit"]:not([disabled])'));
      await submit.first().waitFor({ state: 'visible', timeout: timeout.wait });
      log('Submitting');
      await submit.first().scrollIntoViewIfNeeded().catch(() => {});
      await Promise.all([
        mrPage.waitForLoadState('networkidle', { timeout: timeout.nav }).catch(() => {}),
        submit.first().click({ timeout: timeout.wait }),
      ]);

      // Wait for redirect back to Save-On-Foods
      log('Waiting for redirect to saveonfoods.com');
      const soPage = await waitForAnyPageWith(async p => /saveonfoods\.com/i.test(p.url()), 30000);
      finalPage = soPage || mrPage;
      finalUrl = finalPage.url();
    } else {
      finalPage = page;
      finalUrl = page.url();
    }

    // Success conditions
    const onSaveOn = /saveonfoods\.com/i.test(finalUrl);
    let headerText = '';
    try { headerText = await finalPage.locator('span[data-testid="header-sub-title-testId"]').first().innerText({ timeout: 2000 }); } catch {}
    const looksSignedOut = /sign\s*in|register/i.test(headerText || '');

    if (onSaveOn && !looksSignedOut) {
      log('SSO success on saveonfoods.com', { finalUrl });
      try {
        await runShoppingFlow(finalPage);
      } catch (flowErr) {
        log('Post-login shopping flow error', flowErr);
      }
      console.log(JSON.stringify({ status: 'success', finalUrl }));
      await context.storageState({ path: 'storageState.json' }).catch(() => {});
      if (networkLogStream) networkLogStream.close();
      if (browser) await browser.close(); else await context.close();
      process.exit(0);
    }

    if (/account\.morerewards\.ca/i.test(finalUrl)) {
      const path = new URL(finalUrl).pathname;
      if (/\/userPage\/home/i.test(path)) {
        log('MoreRewards success (no redirect observed)', { finalUrl });
        console.log(JSON.stringify({ status: 'success_morerewards_only', finalUrl }));
        await context.storageState({ path: 'storageState.json' }).catch(() => {});
        if (browser) await browser.close(); else await context.close();
        process.exit(0);
      }
    }

    // Inline errors
    const err = await (async () => {
      const sels = ['[role="alert"]','[aria-live="assertive"]','[id$="helper-text"]','[data-testid*="error"]','.error','.helper-text'];
      for (const s of sels) {
        const t = await finalPage.locator(s).first().innerText().catch(() => '');
        if (t && t.trim()) return t.trim();
      }
      return '';
    })();
    if (err) {
      console.error(JSON.stringify({ status: 'error', message: err, finalUrl }));
      if (networkLogStream) networkLogStream.close();
      if (browser) await browser.close(); else await context.close();
      process.exit(1);
    }

    console.error(JSON.stringify({ status: 'unknown', finalUrl }));
    if (networkLogStream) networkLogStream.close();
    if (browser) await browser.close(); else await context.close();
    process.exit(1);
  } catch (err) {
    console.error(JSON.stringify({ status: 'exception', message: String(err && err.message || err) }));
    try {
      if (networkLogStream) networkLogStream.close();
      if (browser) await browser.close(); else await context.close();
    } catch {}
    process.exit(1);
  }
})();
