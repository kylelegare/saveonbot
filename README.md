# SaveOnBot

Automated grocery ordering for [Save-On-Foods](https://www.saveonfoods.com/) (Canadian grocery chain).

Uses [Camoufox](https://github.com/nickmilo/camoufox) (evasion-hardened Firefox) with Playwright to handle login, search, and add-to-cart automation while bypassing anti-bot detection.

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/YOUR_USERNAME/saveonbot.git
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
SEARCH_TERMS="bananas@2, milk, bread" node scripts/login-via-saveonfoods-v2.js
```

## Usage

### For AI Agents / Programmatic Use

Set `SEARCH_TERMS` environment variable and run the script directly:

```bash
SEARCH_TERMS="bananas@2, milk, bread" node scripts/login-via-saveonfoods-v2.js
```

**SEARCH_TERMS format:**
- Comma-separated list of items
- `@N` suffix for quantity (e.g., `milk@2` for 2 milk)
- Default quantity is 1

### For Humans (Interactive CLI)

```bash
node scripts/grocery-chat-cli.js
```

Then type naturally: `order 2 bananas and milk`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SAVEONFOODS_EMAIL` | Yes | Your Save-On-Foods / MoreRewards email |
| `SAVEONFOODS_PASSWORD` | Yes | Your password |
| `SEARCH_TERMS` | Yes* | Items to order (*for direct script) |
| `HEADLESS` | No | Set `1` for headless mode |
| `LOG_NETWORK` | No | Set `1` to log network requests |

## How It Works

1. Launches Camoufox browser (anti-detection Firefox)
2. Navigates to saveonfoods.com
3. Authenticates via MoreRewards SSO (if not already logged in)
4. For each item: searches, clicks "Add to Cart", adjusts quantity
5. Outputs JSON status and cart summary

Session data is cached in `.pw-user/` so subsequent runs can skip login.

## AgentSkills Compatible

This project follows the [agentskills.io](https://agentskills.io) open skill format. See `SKILL.md` for the skill definition.

Works with [Clawdbot](https://clawd.bot/) and other skills-compatible AI agents.

## Requirements

- macOS (tested), Linux (untested)
- Node.js 18+
- Python 3.8+
- Save-On-Foods / MoreRewards account

## Limitations

- Adds first search result for each item (no product picker)
- Does not complete checkout (stops at cart)
- Geolocation spoofed to Vancouver, BC area

## License

MIT
