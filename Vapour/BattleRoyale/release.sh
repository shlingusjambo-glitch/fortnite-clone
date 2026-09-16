#!/usr/bin/env bash
# Builds the static release into ../../v2 (GitHub Pages /v2/), drops source maps and makes the generated
# service worker version its cache by build hash and take over immediately, so a new release is live on the
# next load instead of after every old tab closes.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf ../../v2
../vapour-engine-0.2.5-alpha/vapour build . --out ../../v2 --json | grep -o '"ok":[a-z]*'
find ../../v2 -name "*.map" -delete
hash=$(ls ../../v2 | grep -o 'game\.[a-f0-9]*\.js' | sed 's/game\.\(.*\)\.js/\1/')
sw=../../v2/service-worker.js
sed -i '' "s/const CACHE=\"vapour-v1\"/const CACHE=\"vapour-$hash\"/" "$sw"
sed -i '' 's/self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));/self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)))});/' "$sw"
sed -i '' 's/self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x))))));/self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));/' "$sw"
grep -c "skipWaiting" "$sw" >/dev/null && echo "release $hash"
