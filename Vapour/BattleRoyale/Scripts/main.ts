import { GameRuntime, WebGpuRenderHost } from '@vapour/engine';
import { mountUi } from './ui';
import { AUDIO } from './audio';
import { initFx } from './fx';

mountUi();
const canvas = document.querySelector<HTMLCanvasElement>('#vapour-game')!;
const moduleUrl = new URL('vapour_runtime.js', document.baseURI).href;
const host = new WebGpuRenderHost(canvas, { moduleUrl });

// The game module builds every mesh at import time through the renderer adapter; the engine uploads them in `start`.
const gamePromise = import('./game');
let gameMod: Awaited<typeof gamePromise> | null = null;
const runtime = new GameRuntime(canvas, {
  async start(game) { gameMod = await gamePromise; gameMod.renderer.bind(game, host); initFx(host); },
  update() { try { gameMod?.tick(performance.now()); } catch (e) { const w = window as unknown as { _tickErr?: unknown }; if (!w._tickErr) { w._tickErr = e; console.error('tick', e); } } },   // synchronous: draws must be recorded before the runtime submits the frame
}, { host, moduleUrl, fixedHz: 60, audio: AUDIO, onError(error) { const m = error instanceof Error ? error.stack ?? error.message : String(error); console.error(m); const pre = document.createElement('pre'); pre.style.cssText = 'position:fixed;inset:10px;background:#210c;color:#fff;z-index:99;white-space:pre-wrap;overflow:auto'; pre.textContent = m; document.body.append(pre); } });
void runtime.start();
