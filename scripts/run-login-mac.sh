#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Load credentials from env or .env
if [[ -z "${USERNAME:-}" ]]; then
  USERNAME=$(grep -E '^SAVEONFOODS_EMAIL=' .env | sed -E 's/^SAVEONFOODS_EMAIL=//')
fi
if [[ -z "${PASSWORD:-}" ]]; then
  PASSWORD=$(grep -E '^SAVEONFOODS_PASSWORD=' .env | sed -E 's/^SAVEONFOODS_PASSWORD=//')
fi
if [[ -z "$USERNAME" || -z "$PASSWORD" ]]; then
  echo "Missing USERNAME/PASSWORD or SAVEONFOODS_EMAIL/SAVEONFOODS_PASSWORD in .env" >&2
  exit 2
fi

# Open Chrome to the login page (visible)
open -a "Google Chrome" "https://account.morerewards.ca/login"

# Run the AppleScript, passing credentials via environment
USERNAME="$USERNAME" PASSWORD="$PASSWORD" /usr/bin/osascript scripts/login-morerewards.applescript

