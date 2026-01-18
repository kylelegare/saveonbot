# SaveOnBot Worklog

## Current Focus
- Automating Save-On-Foods shopping with Playwright + Camoufox.
- Providing a lightweight terminal chat (`scripts/grocery-chat-cli.js`) that turns natural language requests into `SEARCH_TERMS` for the browser automation.

## Key Entry Points
- `scripts/grocery-chat-cli.js`: conversational CLI wrapper. Loads `.env`, parses requests (quantities, “add to cart” phrasing), launches the Camoufox Playwright flow, and narrates progress.
- `scripts/login-via-saveonfoods-v2.js`: main automation. Uses Camoufox Firefox, reuses `storageState.json`, searches for items, and adds them to the cart.
- `reinstall_camoufox.sh`: convenience script to recreate `./venv`, install `camoufox[geoip]==0.4.11`, and verify availability (`python -m camoufox path`).

## Environment / Setup
1. `python3 -m venv venv && source venv/bin/activate`
2. `pip install -r requirements.txt` *(not required today)* and/or `pip install camoufox[geoip]==0.4.11` (already handled by `reinstall_camoufox.sh`).
3. Ensure `.env` includes:
   ```
   SAVEONFOODS_EMAIL=...
   SAVEONFOODS_PASSWORD=...
   ```
4. Run `node scripts/grocery-chat-cli.js` (set `LOG_NETWORK=1` for detailed logging). Type `exit` to quit.

## Recent Changes
- Restored Camoufox by recreating `./venv` and re-installing `camoufox[geoip]==0.4.11`.
- Enhanced the chat CLI:
  - Auto-loads `.env` so credentials no longer need manual export.
  - Expanded parsing to strip conversational fluff (“can you… to the cart?”) before generating search terms.
  - Prevents overlapping runs; responds with friendly narration.
- Tightened automation waits in `login-via-saveonfoods-v2.js`:
  - Removed fixed one-second sleeps after searches and add-to-cart clicks.
  - Waits directly on the first add-to-cart button to appear and on the cart POST response, keeping the browser snappy.
  - Quantity bumps wait for each cart POST instead of using arbitrary delays.
- Added preview-response logging:
  - When `LOG_NETWORK=1`, `/api/stores/<id>/preview?q=…` responses log `type: preview_summary` with `term`, `sku`, `name`, and `price` for the top 3 products.
  - Console echoes the same summary to aid future API-based selectors.

## Outstanding Ideas / Follow-Ups
- **Preview parsing → selection logic:** Use the logged `preview` JSON to decide which SKU to click (e.g., prefer past purchases, exact name matches, or weight/price filters).
- **Direct cart API:** Reproduce the `POST /api/stores/{id}/cart` added to logs and push items without touching the DOM for even faster runs.
- **Error robustness:** Improve handling when no add-to-cart button appears, when geolocation prompts linger, or when the store returns substitutions/unavailable SKUs.
- **Chat UX extensions:** Add commands to inspect cart contents, remove items, or report totals via the CLI.
- **Future texting UI:** Once the core flow stabilizes, port the CLI parser to SMS (Twilio, etc.) so it can respond conversationally via text.

## Debugging / Observability
- Network logs: with `LOG_NETWORK=1`, each run writes `logs/network/<timestamp>.jsonl`. Look for:
  - `step` entries (`search`, `add_to_cart`) to gauge timing.
  - `preview_summary` entries for structured product info.
  - The raw `request`/`response` objects if you need headers or payloads for API replication.
- Screenshots / last UI state: use Playwright’s inspector or add-on `page.screenshot` around problem areas if the UI behaves unexpectedly.

Keep this file updated as we iterate—future sessions can skim it to get back up to speed quickly.
