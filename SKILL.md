---
name: save-on-foods-ordering
description: Automate grocery ordering from Save-On-Foods (Canadian grocery chain). Uses Camoufox browser automation to log in, search for items, and add them to cart. Supports two-step flow: search for products (returns JSON), then add specific SKUs. Invoke when user wants to order groceries from Save-On-Foods.
license: MIT
compatibility: Requires Node.js 18+, Python 3.8+, Playwright, and Camoufox. macOS tested. Credentials must be set in environment.
metadata:
  author: legare
  version: "1.1"
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

## Usage Modes

### Mode 1: Search Only (Recommended for Agents)

Search for products and get JSON results without adding to cart. Allows the agent to choose the best product.

```bash
SEARCH_ONLY=1 SEARCH_TERMS="milk, bread" node scripts/login-via-saveonfoods-v2.js
```

**Output:**
```json
{
  "status": "search_results",
  "results": [
    {
      "term": "milk",
      "products": [
        {"sku": "00068700011016", "name": "Dairyland - 2% Regular Milk", "brand": "Dairyland", "price": "$6.09"},
        {"sku": "00068700100192", "name": "MILK 2 GO - 1% Partly Skimmed Milk", "brand": "MILK 2 GO", "price": "$3.05"},
        {"sku": "00068700011009", "name": "Dairyland - 3.25% Milk", "brand": "Dairyland", "price": "$6.45"}
      ]
    }
  ]
}
```

### Mode 2: Add by SKU

Add specific products to cart by SKU (from search results).

```bash
ADD_SKUS="00068700100192@2, 00068700011016" node scripts/login-via-saveonfoods-v2.js
```

**Output:**
```json
{
  "status": "success",
  "added": [
    {"sku": "00068700100192", "success": true, "quantity": 2},
    {"sku": "00068700011016", "success": true, "quantity": 1}
  ],
  "cartSummary": "Cart$9.14.3 Items"
}
```

### Mode 3: Quick Add (Default)

Search and add first result automatically (original behavior).

```bash
SEARCH_TERMS="bananas@2, milk" node scripts/login-via-saveonfoods-v2.js
```

### Recommended Two-Step Flow for Agents

1. **Search:** `SEARCH_ONLY=1 SEARCH_TERMS="milk"` → get product options
2. **Decide:** Agent picks best product (cheapest, preferred brand, etc.)
3. **Add:** `ADD_SKUS="00068700100192@2"` → add selected SKU to cart

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SAVEONFOODS_EMAIL` | Yes | Save-On-Foods / MoreRewards account email |
| `SAVEONFOODS_PASSWORD` | Yes | Account password |
| `SEARCH_ONLY` | No | Set `1` to return search results as JSON without adding |
| `SEARCH_TERMS` | No | Comma-separated search terms |
| `ADD_SKUS` | No | Comma-separated SKUs to add (format: `sku@qty` or just `sku`) |
| `MAX_PRODUCTS` | No | Max products per search result (default: 10) |
| `HEADLESS` | No | Set `1` for headless browser mode |
| `LOG_NETWORK` | No | Set `1` to log network requests |

## Session Persistence

Browser session stored in `.pw-user/`. Subsequent runs skip login if session is valid.

## Limitations

- macOS tested only
- Geolocation spoofed to Vancouver, BC
- Does not complete checkout (stops at cart)
- No cart viewing or item removal (yet)
