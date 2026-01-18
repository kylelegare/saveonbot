/* eslint-disable no-console */
(async () => {
  const { chromium } = require('playwright');
  const fs = require('fs');
  const path = require('path');
  const readline = require('readline');

  const USERNAME = process.env.USERNAME || process.env.SAVEONFOODS_EMAIL;
  const PASSWORD = process.env.PASSWORD || process.env.SAVEONFOODS_PASSWORD;
  const START_URL = 'https://www.saveonfoods.com/';
  const LOG_DIR = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = path.join(LOG_DIR, `session-${ts}.jsonl`);

  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  const write = (obj) => logStream.write(JSON.stringify({ t: Date.now(), ...obj }) + '\n');

  const log = (m, d) => (d !== undefined ? console.log(`[rec] ${m}`, d) : console.log(`[rec] ${m}`));

  function shortText(s, max = 120) { if (!s) return s; const t = String(s).trim().replace(/\s+/g, ' '); return t.length > max ? t.slice(0, max) + '…' : t; }

  function buildSelector(el) {
    try {
      const parts = [];
      let node = el;
      while (node && parts.length < 6 && node.nodeType === 1) {
        let sel = node.nodeName.toLowerCase();
        if (node.id) { sel += `#${node.id}`; parts.unshift(sel); break; }
        if (node.classList && node.classList.length) sel += '.' + [...node.classList].slice(0,3).join('.');
        const parent = node.parentElement;
        if (parent) {
          const siblings = [...parent.children].filter(c => c.nodeName === node.nodeName);
          if (siblings.length > 1) sel += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
        parts.unshift(sel);
        node = parent;
      }
      return parts.join(' > ');
    } catch { return ''; }
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
      bypassCSP: true,
    });
  } catch (e) {
    browser = await chromium.launch({ headless: false, args: ['--disable-blink-features=AutomationControlled'] });
    context = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'en-CA', timezoneId: 'America/Vancouver', bypassCSP: true });
  }

  // Tracing and permissions
  try { await context.tracing.start({ screenshots: true, snapshots: true, sources: true }); } catch {}
  try {
    await context.grantPermissions(['geolocation'], { origin: 'https://www.saveonfoods.com' });
    await context.setGeolocation({ latitude: 49.2827, longitude: -123.1207, accuracy: 50 });
  } catch {}

  // Minimal stealth shims
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = window.chrome || { runtime: {} };
    Object.defineProperty(navigator, 'languages', { get: () => ['en-CA', 'en'] });
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
  });

  async function instrumentPage(page) {
    // Network
    page.on('request', (req) => {
      write({ type: 'request', method: req.method(), url: req.url(), resourceType: req.resourceType(), postData: req.postData() ? '[len:' + req.postData().length + ']' : null });
    });
    page.on('response', async (res) => {
      const req = res.request();
      write({ type: 'response', status: res.status(), url: res.url(), method: req.method(), resourceType: req.resourceType() });
    });
    page.on('console', (msg) => { write({ type: 'console', level: msg.type(), text: msg.text() }); });
    page.on('pageerror', (err) => { write({ type: 'pageerror', message: String(err) }); });
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) write({ type: 'navigated', url: frame.url() }); });

    // DOM interaction recorder
    await page.exposeBinding('_REC_LOG', (source, payload) => { write({ type: 'dom', ...payload }); });
    await page.addInitScript(({ maxText }) => {
      const st = (s) => (s ? s.trim().replace(/\s+/g, ' ') : s);
      function selectorFor(el) {
        try {
          const parts = [];
          let node = el;
          while (node && parts.length < 6 && node.nodeType === 1) {
            let sel = node.nodeName.toLowerCase();
            if (node.id) { sel += `#${node.id}`; parts.unshift(sel); break; }
            if (node.classList && node.classList.length) sel += '.' + [...node.classList].slice(0,3).join('.');
            const parent = node.parentElement;
            if (parent) {
              const siblings = [...parent.children].filter(c => c.nodeName === node.nodeName);
              if (siblings.length > 1) sel += `:nth-of-type(${siblings.indexOf(node) + 1})`;
            }
            parts.unshift(sel); node = parent;
          }
          return parts.join(' > ');
        } catch { return ''; }
      }
      function payloadFor(el) {
        return {
          tag: el && el.tagName ? el.tagName.toLowerCase() : null,
          id: el && el.id || null,
          classes: el && el.classList ? Array.from(el.classList).slice(0,5) : [],
          text: st(el && ('innerText' in el ? el.innerText : el.textContent))?.slice(0, maxText) || null,
          name: el && el.getAttribute && el.getAttribute('name'),
          type: el && el.getAttribute && el.getAttribute('type'),
          role: el && el.getAttribute && el.getAttribute('role'),
          sel: selectorFor(el),
        };
      }
      window.addEventListener('click', (e) => {
        const el = e.target;
        window._REC_LOG({ ev: 'click', el: payloadFor(el) });
      }, true);
      window.addEventListener('input', (e) => {
        const el = e.target;
        if (!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'))) return;
        const v = (el.value || '').toString();
        window._REC_LOG({ ev: 'input', el: payloadFor(el), valuePreview: v.length ? `[len:${v.length}]` : '' });
      }, true);
      window.addEventListener('change', (e) => {
        const el = e.target;
        window._REC_LOG({ ev: 'change', el: payloadFor(el) });
      }, true);
      document.addEventListener('submit', (e) => {
        const el = e.target;
        window._REC_LOG({ ev: 'submit', el: payloadFor(el) });
      }, true);
    }, { maxText: 120 });
  }

  context.on('page', (p) => { instrumentPage(p).catch(() => {}); });
  const page = await context.newPage();
  await instrumentPage(page);

  // Helper: ensure logged in by checking header; if not, run SSO login inline
  async function ensureLoggedIn() {
    await page.goto(START_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // Accept cookies if present
    try { const c = page.locator('#onetrust-accept-btn-handler, button:has-text("Accept All"), button:has-text("Accept")').first(); if (await c.isVisible().catch(() => false)) await c.click().catch(() => {}); } catch {}

    // Check header text
    let headerText = '';
    try { headerText = await page.locator('span[data-testid="header-sub-title-testId"]').first().innerText({ timeout: 2000 }); } catch {}
    const looksSignedOut = /sign\s*in|register/i.test(headerText || '');
    if (!looksSignedOut) { log('Already logged in'); return; }
    if (!USERNAME || !PASSWORD) { log('No credentials available; please sign in manually in the window.'); return; }

    // Click Sign In/Register
    log('Starting SSO login');
    let clicked = false;
    try {
      const span = page.locator('span[data-testid="header-sub-title-testId"]').filter({ hasText: /sign\s*in|register/i }).first();
      await span.waitFor({ state: 'visible', timeout: 2500 });
      const handle = await span.elementHandle();
      await page.evaluate((el) => { const c = el.closest('a,button,[role="button"]'); if (c) c.click(); else el.click(); }, handle);
      clicked = true;
    } catch {}
    const candidates = ['a:has-text("Sign In")','button:has-text("Sign In")','a:has-text("Register")','button:has-text("Register")','text=/Sign\\s*In or Register/i','a[href*="account"]','a[href*="morerewards"]'];
    for (const sel of candidates) { if (!clicked) { try { await page.locator(sel).first().click({ timeout: 2000 }); clicked = true; } catch {} } }

    // Find MR page
    const start = Date.now(); let mrPage = null;
    while (Date.now() - start < 30000 && !mrPage) {
      for (const p of context.pages()) { if (/account\.morerewards\.ca|spEntityID=https%3A%2F%2Fsts\.saveonfoods\.com/i.test(p.url())) { mrPage = p; break; } }
      await new Promise(r => setTimeout(r, 250));
    }
    if (!mrPage) { log('Did not reach account.morerewards.ca automatically; please complete login manually.'); return; }

    // Fill credentials on MR
    const email = mrPage.locator('#email, input[type="email"], input[name="email"], input[id*="email" i]').first();
    await email.waitFor({ state: 'visible', timeout: 15000 });
    await email.fill(''); await email.fill(USERNAME);
    const pass = mrPage.locator('#password, input[type="password"], input[name="password"], input[id*="password" i]').first();
    await pass.waitFor({ state: 'visible', timeout: 15000 });
    await pass.fill(''); await pass.fill(PASSWORD);
    const submit = mrPage.locator('button[type="submit"]:not([disabled])').filter({ hasText: /(sign\s*in|log\s*in|continue|next)/i }).or(mrPage.locator('input[type="submit"]:not([disabled])')).first();
    await submit.waitFor({ state: 'visible', timeout: 15000 });
    await submit.click();

    // Wait for redirect back
    const soStart = Date.now();
    while (Date.now() - soStart < 30000) {
      for (const p of context.pages()) { if (/saveonfoods\.com/i.test(p.url())) return; }
      await new Promise(r => setTimeout(r, 250));
    }
  }

  try {
    await ensureLoggedIn();
    log(`Recording started. Logs: ${logPath}`);
    console.log('Interact in the browser. Press Enter here to stop.');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise((resolve) => rl.question('', () => { rl.close(); resolve(); }));

    log('Stopping recording…');
  } catch (err) {
    console.error('Error during session:', err);
  } finally {
    try { await context.tracing.stop({ path: path.join(LOG_DIR, `trace-${ts}.zip`) }); } catch {}
    try { if (browser) await browser.close(); else await context.close(); } catch {}
    logStream.end();
    log('Saved logs:', logPath);
  }
})();

