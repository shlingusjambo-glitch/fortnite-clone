import { GameRuntime, WebGpuRenderHost } from '@vapour/engine';
import { mountUi } from './ui';
import { AUDIO } from './audio';
import { initFx } from './fx';
import { initPhysics } from './physics';
import { initEui } from './eui';

mountUi();
const canvas = document.querySelector<HTMLCanvasElement>('#vapour-game')!;
const moduleUrl = new URL('vapour_runtime.js', document.baseURI).href;

/** The WebGL build at /legacy/ is the fallback for browsers without WebGPU and for software adapters
 * (SwiftShader / llvmpipe on Linux), which render this build at a few frames per second. `?force=1` skips the check. */
export const toLegacy = (why: string) => { try { sessionStorage.setItem('fn-fallback', why); } catch {} location.replace(new URL('legacy/' + location.search, document.baseURI).href); };
async function gpuUsable(): Promise<boolean> {
  if (!('gpu' in navigator) || !navigator.gpu) return false;
  try {
    const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!a) return false;
    const info = (a as GPUAdapter & { info?: GPUAdapterInfo }).info ?? await (a as GPUAdapter & { requestAdapterInfo?: () => Promise<GPUAdapterInfo> }).requestAdapterInfo?.();
    const desc = info ? `${info.vendor} ${info.architecture} ${info.device} ${info.description}`.toLowerCase() : '';
    if ((a as GPUAdapter & { isFallbackAdapter?: boolean }).isFallbackAdapter || /swiftshader|llvmpipe|lavapipe|softpipe|software/.test(desc)) return false;
    return true;
  } catch { return false; }
}
const forced = new URLSearchParams(location.search).get('force') === '1';
if (!forced && !(await gpuUsable())) { toLegacy('no-webgpu'); throw new Error('falling back to the WebGL build'); }
const host = new WebGpuRenderHost(canvas, { moduleUrl });

// The game module builds every mesh at import time through the renderer adapter; the engine uploads them in `start`.
const gamePromise = import('./game');
let gameMod: Awaited<typeof gamePromise> | null = null;
const runtime = new GameRuntime(canvas, {
  async start(game) { gameMod = await gamePromise; gameMod.renderer.bind(game, host); initFx(host); await initEui(game); await initPhysics(moduleUrl); gameMod.physicsReady(); },
  update() { try { gameMod?.tick(performance.now()); } catch (e) { const w = window as unknown as { _tickErr?: unknown }; if (!w._tickErr) { w._tickErr = e; console.error('tick', e); } } },   // synchronous: draws must be recorded before the runtime submits the frame
}, { host, moduleUrl, fixedHz: 60, audio: AUDIO, onError(error) { const m = error instanceof Error ? error.stack ?? error.message : String(error); console.error(m); const pre = document.createElement('pre'); pre.style.cssText = 'position:fixed;inset:10px;background:#210c;color:#fff;z-index:99;white-space:pre-wrap;overflow:auto'; pre.textContent = m; document.body.append(pre); } });
void runtime.start();
