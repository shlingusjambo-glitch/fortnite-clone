// Engine GPU particles: impacts, muzzle sparks, explosions and harvest chips are simulated and drawn inside the
// renderer (one compute pass + one indirect draw per system). The game only says "burst N here".
import { GpuParticleSystem, type WebGpuRenderHost } from '@vapour/engine';
import { curve, gradientBetween } from '@vapour/math';
import type { V3 } from './math';

type Sys = { s: GpuParticleSystem; n: number };
const pools: Record<string, Sys[]> = {}; let host: WebGpuRenderHost | null = null; let rr = 0;
const def = (name: string, count: number, opts: ConstructorParameters<typeof GpuParticleSystem>[1]) => { pools[name] = []; for (let i = 0; i < count; i++) { const s = new GpuParticleSystem(host!, { ...opts, rate: 0, loop: false, seed: i * 7919 + 1 }, `fx:${name}:${i}`); s.play(); pools[name]!.push({ s, n: 0 }); } };

/** Creates the effect pools once the renderer is up. Several systems per effect so bursts in the same frame keep their own origins. */
export function initFx(h: WebGpuRenderHost) {
  host = h;
  def('dust', 6, { capacity: 256, lifetime: [0.25, 0.55], speed: [1.5, 4], shape: { kind: 'sphere', size: [0.1, 0.1, 0.1] }, gravity: [0, -4, 0], drag: 2.5, size: curve([{ time: 0, value: 0.14 }, { time: 1, value: 0.02 }]), color: gradientBetween([0.85, 0.78, 0.6, 0.9], [0.7, 0.65, 0.55, 0]) });
  def('spark', 6, { capacity: 256, lifetime: [0.12, 0.3], speed: [6, 14], shape: { kind: 'cone', angle: 40 }, gravity: [0, -12, 0], drag: 1.2, size: curve([{ time: 0, value: 0.05 }, { time: 1, value: 0 }]), color: gradientBetween([1, 0.9, 0.5, 1], [1, 0.4, 0.1, 0]), blend: 'additive' });
  def('chip', 4, { capacity: 256, lifetime: [0.3, 0.7], speed: [2, 6], shape: { kind: 'cone', angle: 60 }, gravity: [0, -14, 0], drag: 0.8, size: curve([{ time: 0, value: 0.08 }, { time: 1, value: 0.03 }]), color: gradientBetween([0.7, 0.55, 0.35, 1], [0.5, 0.4, 0.25, 0]) });
  def('boom', 2, { capacity: 1024, lifetime: [0.4, 1.1], speed: [4, 16], shape: { kind: 'sphere', size: [0.6, 0.6, 0.6] }, gravity: [0, 2, 0], drag: 2, size: curve([{ time: 0, value: 0.22 }, { time: 0.3, value: 0.55 }, { time: 1, value: 0.12 }]), color: gradientBetween([1, 0.75, 0.3, 1], [0.25, 0.22, 0.2, 0]), blend: 'additive' });
  def('smoke', 2, { capacity: 512, lifetime: [1.2, 2.4], speed: [1, 4], shape: { kind: 'sphere', size: [1, 1, 1] }, gravity: [0, 1.2, 0], drag: 1.5, size: curve([{ time: 0, value: 0.6 }, { time: 1, value: 2.2 }]), color: gradientBetween([0.35, 0.33, 0.3, 0.7], [0.5, 0.5, 0.5, 0]) });
}
function burst(name: string, at: V3, n: number) { const pool = pools[name]; if (!pool || !pool.length) return; const p = pool[rr++ % pool.length]!; p.s.setOrigin(at); p.s.burst(n); }
export const fxDust = (at: V3, n = 14) => burst('dust', at, n);
export const fxSpark = (at: V3, n = 10) => burst('spark', at, n);
export const fxChip = (at: V3, n = 12) => burst('chip', at, n);
export const fxExplosion = (at: V3) => { burst('boom', at, 220); burst('smoke', at, 60); };
/** Advance every system; must run before the frame is submitted. */
export function updateFx(dt: number) { for (const k in pools) for (const p of pools[k]!) p.s.update(dt); }
