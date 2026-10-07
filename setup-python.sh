#!/usr/bin/env bash
# Creates .venv and installs ScrapeGraphAI.
# In the Claude cloud environment, Playwright is downgraded to 1.56.0 to match the
# Chromium build pre-installed in /opt/pw-browsers (scrapegraphai declares >=1.57,
# but works with 1.56). Elsewhere, run `.venv/bin/playwright install chromium` instead.
set -euo pipefail
cd "$(dirname "$0")"
python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt
if [ -d /opt/pw-browsers/chromium-1194 ]; then
  .venv/bin/pip install -q "playwright==1.56.0" 2>/dev/null || true
fi
