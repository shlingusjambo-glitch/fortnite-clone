#!/usr/bin/env bash
# (re)start the Vapour dev server on :4173.
set -euo pipefail
cd "$(dirname "$0")"

pkill -f "vapour.mjs dev" 2>/dev/null || true
(../vapour-engine-0.2.5-alpha/vapour dev . --port 4173 --json > /tmp/vapour-dev.log 2>&1 &)
for i in $(seq 1 60); do grep -q '"ready"' /tmp/vapour-dev.log 2>/dev/null && break; sleep 1; done
tail -c 300 /tmp/vapour-dev.log
