/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

const LOGIN_SCRIPT = path.join(__dirname, 'login-via-saveonfoods-v2.js');
const DOTENV_PATH = path.join(__dirname, '..', '.env');

function loadDotenvIfPresent() {
  if (process.env.__GROCERY_CHAT_ENV_LOADED) return;
  if (!fs.existsSync(DOTENV_PATH)) return;
  try {
    const lines = fs.readFileSync(DOTENV_PATH, 'utf-8').split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) continue;
      const key = line.slice(0, eqIndex).trim();
      if (!key) continue;
      const value = line.slice(eqIndex + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
    process.env.__GROCERY_CHAT_ENV_LOADED = '1';
  } catch (err) {
    process.stdout.write(`Bot: Failed to load .env (${err.message}).\n`);
  }
}

function stripLeadingCommand(text) {
  let working = text.trim();

  const leadPatterns = [
    /^(?:hey|hi|hello|ok(?:ay)?|yo)\b[\s,]*/i,
    /^(?:bot|assistant)\b[\s,]*/i,
    /^(?:can|could|would|will|please)\s+you\s+(?:please\s+)*/i,
    /^please\s+/i,
  ];

  for (const pattern of leadPatterns) {
    working = working.replace(pattern, '');
  }

  working = working.replace(
    /^(?:please\s+)?(?:can\s+you\s+)?(?:please\s+)?(order|add|get|grab|buy|purchase|need|want|put|pick\s+up)\b/i,
    ''
  );

  return working.trim();
}

function cleanupToken(token) {
  return token
    .replace(/[!?]/g, ' ')
    .replace(/\b(please|me|some|a|an|the|to|for|into|my|our|their|your|this|that|cart|basket)\b/gi, '')
    .replace(/\b(?:in|into)\s+$/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseItemsFromInput(raw) {
  if (!raw || !raw.trim()) return [];
  let working = stripLeadingCommand(raw);
  working = working.replace(/\band\b/gi, ',');
  const pieces = working.split(/[,.?]/).map((piece) => piece.trim()).filter(Boolean);
  const items = [];
  for (const piece of pieces) {
    let token = cleanupToken(piece);
    if (!token) continue;
    let quantity = null;
    let term = token;
    let match = token.match(/(.+?)[\s]*(?:@|x)\s*([0-9]+)/i);
    if (match) {
      term = match[1].trim();
      quantity = Number(match[2]);
    }
    if (!quantity) {
      match = token.match(/^([0-9]+)\s+(.+)$/);
      if (match) {
        quantity = Number(match[1]);
        term = match[2].trim();
      }
    }
    term = cleanupToken(term);
    term = term.replace(/\b(?:into|in)?\s*(?:the\s*)?(?:cart|basket)\b/gi, '').trim();
    if (!term) continue;
    items.push({ term, quantity: quantity && quantity > 0 ? quantity : 1 });
  }
  return items;
}

function formatSearchTerms(items) {
  return items.map(({ term, quantity }) => (quantity && quantity > 1 ? `${term}@${quantity}` : term)).join(', ');
}

function say(text) {
  process.stdout.write(`Bot: ${text}\n`);
}

function watchChildOutput(child) {
  child.stdout.on('data', (chunk) => {
    chunk
      .toString()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        if (line.startsWith('[login]')) {
          const message = line.replace(/^\[login\]\s*/, '');
          if (/^Added item/i.test(message)) {
            const jsonStart = message.indexOf('{');
            if (jsonStart !== -1) {
              try {
                const info = JSON.parse(message.slice(jsonStart));
                const qty = info.recordedQuantity || info.requestedQuantity || 1;
                say(`Added ${qty} × ${info.term}`);
                return;
              } catch {/* swallow parse errors */}
            }
          }
          if (/^Cart summary/i.test(message)) {
            say(`Cart summary: ${message.replace(/^Cart summary\s*/, '')}`);
            return;
          }
          if (/^Searching for/i.test(message)) {
            say(message.replace(/^Searching for/, 'Searching for'));
            return;
          }
          const map = [
            { test: /^Navigating to/i, say: 'Starting the grocery run…' },
            { test: /^Seeking Sign In/i, say: 'Looking for the sign-in button…' },
            { test: /^Filling credentials/i, say: 'Signing in with saved account…' },
            { test: /^Submitting/i, say: 'Submitting login…' },
            { test: /^Waiting for redirect/i, say: 'Waiting for the store to finish login…' },
            { test: /^SSO success/i, say: 'Back at Save-On-Foods, ready to shop.' },
            { test: /^Detected existing signed-in session/i, say: 'Session already active; jumping straight to shopping.' },
          ];
          for (const entry of map) {
            if (entry.test.test(message)) {
              say(entry.say);
              return;
            }
          }
          say(message);
          return;
        }
        if (/^\{\"status\"/.test(line)) {
          try {
            const payload = JSON.parse(line);
            if (payload.status === 'success') {
              say('All set—items added to the cart.');
              return;
            }
            if (payload.status === 'success_morerewards_only') {
              say('Signed in to MoreRewards, but no cart action happened.');
              return;
            }
            say(`Login flow reported ${payload.status}: ${payload.message || payload.finalUrl || ''}`.trim());
            return;
          } catch {/* ignore JSON parse errors */}
        }
        say(line);
      });
  });

  child.stderr.on('data', (chunk) => {
    chunk
      .toString()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        if (/^\{\"status\"/.test(line)) {
          try {
            const payload = JSON.parse(line);
            say(`Problem: ${payload.message || payload.status}`);
            return;
          } catch {/* ignore */}
        }
        say(`stderr: ${line}`);
      });
  });
}

async function runOrder(items) {
  return new Promise((resolve) => {
    const env = { ...process.env, SEARCH_TERMS: formatSearchTerms(items) };
    const child = spawn('node', [LOGIN_SCRIPT], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    watchChildOutput(child);
    child.on('close', (code) => {
      if (code === 0) {
        say('Done. What else can I grab?');
      } else {
        say(`Run finished with exit code ${code}.`);
      }
      resolve();
    });
  });
}

function checkCredentials() {
  const hasUser = Boolean(process.env.USERNAME || process.env.SAVEONFOODS_EMAIL);
  const hasPass = Boolean(process.env.PASSWORD || process.env.SAVEONFOODS_PASSWORD);
  if (!hasUser || !hasPass) {
    say('Heads up: set SAVEONFOODS_EMAIL and SAVEONFOODS_PASSWORD (or USERNAME/PASSWORD) before ordering.');
  }
}

async function main() {
  loadDotenvIfPresent();
  say('Hi! Tell me what to order (e.g., "order bananas and 2 milk"), or type "exit" to quit.');
  checkCredentials();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'You: ' });
  let busy = false;

  rl.prompt();

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }
    if (/^(exit|quit)$/i.test(trimmed)) {
      say('Talk soon.');
      rl.close();
      return;
    }
    if (busy) {
      say('Still working on the last request—hang tight.');
      rl.prompt();
      return;
    }
    const items = parseItemsFromInput(trimmed);
    if (!items.length) {
      say("Didn't catch any items. Try something like 'order bananas and 2 milk'.");
      rl.prompt();
      return;
    }
    busy = true;
    const termSummary = items.map(({ term, quantity }) => `${quantity} × ${term}`).join(', ');
    say(`On it—ordering ${termSummary}.`);
    await runOrder(items);
    busy = false;
    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
