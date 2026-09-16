#!/usr/bin/env bash
# Builds the static release into the repository root (GitHub Pages / Vercel serve it as the default game; the
# WebGL version stays at /legacy/), drops source maps and makes the generated service worker version its cache
# by build hash and take over immediately, so a new release is live on the next load.
set -euo pipefail
cd "$(dirname "$0")"
root=../..
out=$(mktemp -d)
../vapour-engine-0.2.5-alpha/vapour build . --out "$out" --json | grep -o '"ok":[a-z]*'
find "$out" -name "*.map" -delete
rm -f "$root"/game.*.js "$root"/index.html "$root"/vapour_runtime.js "$root"/vapour_runtime_bg.wasm "$root"/service-worker.js "$root"/headers.txt "$root"/THIRD-PARTY-NOTICES.txt
rm -rf "$root/assets"
cp -R "$out"/. "$root"/
hash=$(ls "$root" | grep -o 'game\.[a-f0-9]*\.js' | sed 's/game\.\(.*\)\.js/\1/')
sw=$root/service-worker.js
sed -i '' "s/const CACHE=\"vapour-v1\"/const CACHE=\"vapour-$hash\"/" "$sw"
sed -i '' 's/self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));/self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)))});/' "$sw"
sed -i '' 's/self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x))))));/self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));/' "$sw"
grep -c "skipWaiting" "$sw" >/dev/null && echo "release $hash"
