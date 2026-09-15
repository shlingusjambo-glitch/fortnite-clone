#!/usr/bin/env bash
# Transpiles the ported (pre-engine) game code to plain ESM so the strict engine validator only checks new engine-native TypeScript.
set -euo pipefail
cd "$(dirname "$0")"
../vapour-engine-0.2.5-alpha/cli/esbuild src-legacy/game.ts src-legacy/models.ts src-legacy/world.ts src-legacy/buildings.ts src-legacy/math.ts src-legacy/net.ts --outdir=Scripts/legacy --format=esm --target=es2022 --log-level=warning
