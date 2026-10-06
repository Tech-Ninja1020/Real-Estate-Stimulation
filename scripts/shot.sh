#!/usr/bin/env bash
# Headless screenshot of a running dev/prod server.
# Dark mode: add `&theme=dark` (or `?theme=dark`) to the URL.
# Usage: scripts/shot.sh <url> <out.png> [width] [height] [wait-ms]
# Example: scripts/shot.sh "http://localhost:3111/lab?preset=retiring-landlord&theme=dark" /tmp/lab.png 1440 1000
set -euo pipefail
URL="$1"; OUT="$2"; W="${3:-1440}"; H="${4:-1000}"; WAIT="${5:-4000}"
google-chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
  --window-size="${W},${H}" --virtual-time-budget="${WAIT}" \
  --screenshot="${OUT}" "${URL}" >/dev/null 2>&1
echo "wrote ${OUT}"
