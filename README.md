# SaveOnBot

Automated grocery ordering for [Save-On-Foods](https://www.saveonfoods.com/) (Canadian grocery chain).

Uses [Camoufox](https://github.com/nickmilo/camoufox) (evasion-hardened Firefox) with Playwright to handle login, search, and add-to-cart automation while bypassing anti-bot detection.

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/kylelegare/saveonbot.git
cd saveonbot
npm install

# 2. Set up Camoufox
python3 -m venv venv
source venv/bin/activate
pip install "camoufox[geoip]==0.4.11"

# 3. Configure credentials
cp .env.example .env
# Edit .env with your Save-On-Foods / MoreRewards account

# 4. Run
source venv/bin/activate
SEARCH_ONLY=1 SEARCH_TERMS="milk" node scripts/login-via-saveonfoods-v2.js
```

## Usage Modes

### Mode 1: Search Only (Returns JSON)

Search for products without adding to cart. Returns product options as JSON.

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
        {"sku": "00068700011016", "name": "Dairyland - 2% Milk", "brand": "Dairyland", "price": "$6.09"},
        {"sku": "00068700100192", "name": "MILK 2 GO - 1% Milk", "brand": "MILK 2 GO", "price": "$3.05"}
      ]
    }
  ]
}
```

### Mode 2: Add by SKU

Add specific products to cart using SKUs from search results.

```bash
ADD_SKUS="00068700100192@2, 00068700011016" node scripts/login-via-saveonfoods-v2.js
```

**Output:**
```json
{
  "status": "success",
  "added": [{"sku": "00068700100192", "success": true, "quantity": 2}],
  "cartSummary": "Cart$6.10.2 Items"
}
```

### Mode 3: Quick Add (Default)

Search and add first result automatically.

```bash
SEARCH_TERMS="bananas@2, milk" node scripts/login-via-saveonfoods-v2.js
```

### Recommended Flow for AI Agents

1. **Search:** `SEARCH_ONLY=1 SEARCH_TERMS="milk"` → get options
2. **Decide:** Pick best product (cheapest, preferred brand, etc.)
3. **Add:** `ADD_SKUS="00068700100192@2"` → add to cart

### Interactive CLI (For Humans)

```bash
node scripts/grocery-chat-cli.js
```

Then type: `order 2 bananas and milk`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SAVEONFOODS_EMAIL` | Yes | Save-On-Foods / MoreRewards email |
| `SAVEONFOODS_PASSWORD` | Yes | Account password |
| `SEARCH_ONLY` | No | Set `1` to return JSON without adding |
| `SEARCH_TERMS` | No | Comma-separated search terms |
| `ADD_SKUS` | No | SKUs to add (format: `sku@qty,sku@qty`) |
| `MAX_PRODUCTS` | No | Max products per search (default: 10) |
| `HEADLESS` | No | Set `1` for headless mode |

## How It Works

1. Launches Camoufox browser (anti-detection Firefox)
2. Navigates to saveonfoods.com
3. Authenticates via MoreRewards SSO (if needed)
4. Executes requested mode (search/add/quick-add)
5. Returns JSON result

Session cached in `.pw-user/` - subsequent runs skip login.

## AgentSkills Compatible

Follows [agentskills.io](https://agentskills.io) open skill format. See `SKILL.md`.

Works with [Clawdbot](https://clawd.bot/) and other skills-compatible AI agents.

## Requirements

- macOS (tested)
- Node.js 18+
- Python 3.8+
- Save-On-Foods / MoreRewards account

## Limitations

- Does not complete checkout (stops at cart)
- No cart viewing or item removal (yet)
- Geolocation spoofed to Vancouver, BC

## License

MIT
