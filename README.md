# Fortnite clone — Vapour engine (WebGPU)

The game is a Vapour project in `Vapour/BattleRoyale`; `Vapour/BattleRoyale/release.sh` builds the static site into this
repository root (served by GitHub Pages and Vercel). The previous WebGL build is kept playable at `/legacy/`.

## Legacy WebGL build (`src/`, `legacy/`)

```
npm install
npm run build     # tsc → dist/
npm run serve     # http://localhost:8765
```
`npm run watch` recompiles on save. Press **F8** in a match for the Local Testing panel (aimbot/ESP/fly, give items, teleport, spawn bots, playground events).
