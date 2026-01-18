---
name: save-on-foods-ordering
description: Automate grocery ordering from Save-On-Foods (Canadian grocery chain). Uses Camoufox browser automation to log in, search for items, and add them to cart with specified quantities. Invoke when user wants to order groceries from Save-On-Foods.
license: MIT
compatibility: Requires Node.js 18+, Python 3.8+, Playwright, and Camoufox. macOS tested. Credentials must be set in environment.
metadata:
  author: legare
  version: "1.0"
  store: Save-On-Foods
  region: Canada (BC focus)
---

# Save-On-Foods Grocery Ordering

Automates grocery ordering from Save-On-Foods using Camoufox (evasion-hardened Firefox) to bypass anti-bot detection.

## Prerequisites

1. **Install dependencies:**
   ```bash
   cd {baseDir}
   npm install
   ```

2. **Install Camoufox:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install "camoufox[geoip]==0.4.11"
   ```

3. **Set credentials** in environment or `.env` file:
   ```
   SAVEONFOODS_EMAIL=your-email@example.com
   SAVEONFOODS_PASSWORD=your-password
   ```

## Usage

### Direct Script Invocation (Recommended for Agents)

Run the automation script directly with `SEARCH_TERMS` environment variable:

```bash
cd {baseDir}
SEARCH_TERMS="bananas@2, milk, bread" node scripts/login-via-saveonfoods-v2.js
```

**SEARCH_TERMS format:**
- Comma-separated list of items
- Optional `@N` suffix for quantity (e.g., `bananas@3` = 3 bananas)
- Default quantity is 1 if not specified

**Examples:**
- `"milk"` - adds 1 milk
- `"milk@2"` - adds 2 milk
- `"bananas@3, milk@2, bread"` - adds 3 bananas, 2 milk, 1 bread

### Interactive CLI (Optional)

For human users who prefer natural language:

```bash
cd {baseDir}
node scripts/grocery-chat-cli.js
```

Then type requests like: `order 2 bananas and milk`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SAVEONFOODS_EMAIL` | Yes | Save-On-Foods / MoreRewards account email |
| `SAVEONFOODS_PASSWORD` | Yes | Account password |
| `SEARCH_TERMS` | Yes* | Comma-separated items to order (*for direct script) |
| `HEADLESS` | No | Set to `1` for headless browser mode |
| `LOG_NETWORK` | No | Set to `1` to enable network logging to `logs/network/` |

## Output

The script outputs JSON status to stdout:

```json
{"status": "success", "finalUrl": "https://www.saveonfoods.com/..."}
```

During execution, `[login]` prefixed messages indicate progress:
- `[login] Navigating to...`
- `[login] Filling credentials...`
- `[login] Added item {"term": "milk", "requestedQuantity": 2, ...}`
- `[login] Cart summary: 3 items`

## How It Works

1. Launches Camoufox browser with anti-detection measures
2. Navigates to saveonfoods.com
3. If not already logged in, redirects through MoreRewards SSO
4. For each item in SEARCH_TERMS:
   - Searches for the item
   - Clicks "Add to Cart" on first result
   - Increments quantity if > 1
5. Outputs cart summary and exits

## Session Persistence

The script stores browser session data in `.pw-user/` directory. Subsequent runs may skip login if the session is still valid.

## Limitations

- Only tested on macOS
- Geolocation is spoofed to Vancouver, BC area
- Adds first search result for each term (no product selection)
- Does not complete checkout (stops at cart)
