#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for the Fleet control plane.
# Prepares the toolchain, dependencies, generated Worker types, the local D1
# database, and the client bundle so the Worker and its test seams run.
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# Fleet pins Node.js 24 (package.json "engines"); make it the login default so
# every later terminal, start command, and agent shell resolves the same node.
nvm install 24
nvm alias default 24
nvm use 24
node --version

# Wrangler is offline here; never phone home during setup.
export WRANGLER_SEND_METRICS=false

# Install the exact locked dependency tree. workerd and esbuild ship
# platform-specific optional dependencies the Worker and Board suites require,
# so npm ci must keep optional dependencies.
npm ci

# Generate the Worker binding types (worker-configuration.d.ts) that the
# typecheck gate consumes.
npm run types

# Apply D1 migrations to the local Wrangler database. Idempotent: already
# applied migrations are skipped.
npx wrangler d1 migrations apply DB --local

# Build the client bundle the Worker serves from dist/client.
npm run build
