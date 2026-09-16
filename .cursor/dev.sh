#!/usr/bin/env bash
# Runs the Fleet Worker locally with Wrangler, serving the built Board bundle
# and the /v1 API against the local D1 database.
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 24 >/dev/null 2>&1 || true

export WRANGLER_SEND_METRICS=false

# dist/client is produced by install; rebuild it if a fresh checkout lacks it.
[ -d dist/client ] || npm run build

exec npx wrangler dev --port 8787 --ip 127.0.0.1
