#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

echo "Installing npm dependencies..."
PUPPETEER_SKIP_DOWNLOAD=true npm install

# Point puppeteer to the pre-installed Playwright Chromium binary
CHROMIUM_PATH=$(find /root/.cache/ms-playwright -name "chrome" -type f 2>/dev/null | head -1 || true)
if [ -n "$CHROMIUM_PATH" ]; then
  echo "Using Playwright Chromium at: $CHROMIUM_PATH"
  echo "export PUPPETEER_EXECUTABLE_PATH=$CHROMIUM_PATH" >> "$CLAUDE_ENV_FILE"
fi
