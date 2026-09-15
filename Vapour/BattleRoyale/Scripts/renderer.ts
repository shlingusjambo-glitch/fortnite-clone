// Vapour adapter: the game records draws through the same `Renderer` interface the WebGL version used
// (draw / flush / upload), and this class forwards them to the engine's FrameBuilder with PBR materials,
// cascaded shadows, procedural sky, fog and the HDR post stack. Game logic never touches WebGPU.
import type { GameContext, MeshUpload, WebGpuRenderHost } from '@vapour/engine';
import { TERRAIN_MATERIAL, bakeTerrainTextures } from './terrain';
export type V3 = [number, number, number]; export type M4 = Float32Array;
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export interface Mesh { id: string; n: number; data?: Float32Array; raw?: MeshUpload; }
interface Item { m: Mesh; mat: M4; tint: V3; alpha: number; style: number; shadow: boolean; two: boolean; }
export interface Cam { pos: V3; fwd: V3; fov: number; aspect: number; }

/** style → material asset + surface response. Styles mirror the old shader switch. */
const STYLE: Record<number, { material: string; roughness: number; metallic: number; emissive?: number }> = {
  0: { material: 'm:default', roughness: 0.82, metallic: 0 },
  1: { material: 'm:default', roughness: 0.6, metallic: 0 },
  2: { material: 'm:wood', roughness: 0.78, metallic: 0 },
  3: { material: 'm:stone', roughness: 0.92, metallic: 0 },
  4: { material: 'm:metal', roughness: 0.38, metallic: 0.7 },
  5: { material: 'm:terrain', roughness: 0.96, metallic: 0 },
  6: { material: 'm:water', roughness: 0.08, metallic: 0.1 },
  7: { material: 'm:unlit', roughness: 1, metallic: 0, emissive: 1.2 },
  8: { material: 'm:holo', roughness: 0.3, metallic: 0, emissive: 0.8 },
  9: { material: 'm:storm', roughness: 1, metallic: 0, emissive: 0.6 },
};

export class Renderer {
  items: Item[] = []; shadows = 2; scale = 1; fog: V3 = [0.80, 0.90, 0.98];
  private game: GameContext | null = null; private host: WebGpuRenderHost | null = null;
  private pending: Mesh[] = []; private nextId = 1;
  private camM = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); private sunDir: V3 = [0.55, 0.62, 0.35]; private warned = false;
  private canvas: HTMLCanvasElement; private applied = ''; 
  constructor(canvas: HTMLCanvasElement) { this.canvas = canvas; }
  /** Render scale: the engine sizes the swapchain from the DOM at up to 2x DPR; a fixed size below that is the FPS lever. */
  private applyScale() {
    const dpr = Math.min(devicePixelRatio, 2) * this.scale, w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr)), h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr)), key = this.scale >= 1 ? 'auto' : `${w}x${h}`;
    if (key === this.applied || !this.host) return; this.applied = key;
    if (key === 'auto') this.host.setFixedSize(undefined); else this.host.setFixedSize(w, h);
  }

  /** Called once the engine is ready: defines materials and uploads every mesh built before then. */
  bind(game: GameContext, host: WebGpuRenderHost) {
    this.game = game; this.host = host;
    const white = { width: 1, height: 1, pixels: Uint8Array.from([255, 255, 255, 255]), colorSpace: 'srgb' as const };
    game.uploadTexture('t:white', white);
    const base = { textures: { baseColor: 't:white' }, addressMode: 'repeat' as const };
    game.defineMaterial('m:default', { ...base, alphaMode: 'opaque' });
    game.defineMaterial('m:wood', { ...base, alphaMode: 'opaque' });
    game.defineMaterial('m:stone', { ...base, alphaMode: 'opaque' });
    game.defineMaterial('m:metal', { ...base, alphaMode: 'opaque' });
    const tt = bakeTerrainTextures(); game.uploadTexture('t:terrain', tt.base); game.uploadTexture('t:terrainN', tt.normal);
    game.defineMaterial('m:terrain', { ...TERRAIN_MATERIAL.upload(), normalScale: 0.9, alphaMode: 'opaque' });
    game.defineMaterial('m:twosided', { ...base, alphaMode: 'opaque', doubleSided: true });
    game.defineMaterial('m:water', { ...base, alphaMode: 'blend', depthWrite: false, doubleSided: true });
    game.defineMaterial('m:unlit', { ...base, alphaMode: 'blend', depthWrite: false, doubleSided: true });
    game.defineMaterial('m:holo', { ...base, alphaMode: 'blend', depthWrite: false, doubleSided: true });
    game.defineMaterial('m:storm', { ...base, alphaMode: 'blend', depthWrite: false, doubleSided: true });
    game.defineMaterial('m:blend', { ...base, alphaMode: 'blend', depthWrite: false });
    for (const m of this.pending) this.gpuUpload(m); this.pending = [];
    host.setPostProcess({ exposure: 1.05, toneMapping: 'aces', bloom: { intensity: 0.12, threshold: 1.1, scatter: 0.6 }, saturation: 1.06, contrast: 1.04, vignette: 0.18, antiAliasing: 'fxaa' });
  }
  private gpuUpload(m: Mesh) {
    if (m.raw) { this.game!.uploadMesh(m.id, m.raw); return; }
    const d = m.data!, n = d.length / 9, positions = new Float32Array(n * 3), normals = new Float32Array(n * 3), colors = new Float32Array(n * 4), indices = new Uint32Array(n);
    for (let i = 0; i < n; i++) { const o = i * 9; positions.set([d[o]!, d[o + 1]!, d[o + 2]!], i * 3); normals.set([d[o + 3]!, d[o + 4]!, d[o + 5]!], i * 3); colors.set([srgb(d[o + 6]!), srgb(d[o + 7]!), srgb(d[o + 8]!), 1], i * 4); indices[i] = i; }
    this.game!.uploadMesh(m.id, { positions, normals, colors, indices });
  }
  /** Interleaved [px,py,pz, nx,ny,nz, r,g,b] triangles, same as the WebGL builder produced. */
  upload(data: Float32Array): Mesh {
    const m: Mesh = { id: 'g' + this.nextId++, n: data.length / 9, data };
    if (this.game) this.gpuUpload(m); else this.pending.push(m);
    return m;
  }
  /** Engine-built geometry (terrain chunks etc.) goes up as-is. */
  uploadRaw(raw: MeshUpload): Mesh {
    const m: Mesh = { id: 'g' + this.nextId++, n: raw.indices.length, raw };
    if (this.game) this.gpuUpload(m); else this.pending.push(m);
    return m;
  }
  draw(m: Mesh, mat: M4, tint: V3 = [1, 1, 1], alpha = 1, style = 0, shadow = true, two = false) { if (!m) { console.error('draw(): undefined mesh'); return; } this.items.push({ m, mat, tint, alpha, style, shadow, two }); }
  get itemCount() { return this.items.length; }
  /** Submits everything queued this frame. `sky` false = lobby/gallery lighting. */
  flush(cam: Cam, _vp: M4, sun: V3, _focus: V3, _t: number, sky = true, _shadowRange = 90) {
    const g = this.game; if (!g) { this.items.length = 0; return; }
    this.sunDir = sun; this.applyScale();
    const bad = [...cam.pos, ...cam.fwd, cam.fov, cam.aspect].some(v => !Number.isFinite(v));
    if (bad) { if (!this.warned) { this.warned = true; console.error('renderer: non-finite camera', cam); } this.items.length = 0; g.frame.setCamera(this.camM, 60, 0.1, 100); return; }
    const f = norm(cam.fwd), r = norm(cross(f, [0, 1, 0])), u = cross(r, f), c = this.camM;
    void u;
    c[0] = r[0]; c[1] = r[1]; c[2] = r[2]; c[3] = 0; c[4] = u[0]; c[5] = u[1]; c[6] = u[2]; c[7] = 0; c[8] = -f[0]; c[9] = -f[1]; c[10] = -f[2]; c[11] = 0; c[12] = cam.pos[0]; c[13] = cam.pos[1]; c[14] = cam.pos[2]; c[15] = 1;
    g.frame.setCamera(c, cam.fov * 180 / Math.PI, 0.1, 1600);
    // Chapter 1 daylight: warm sun, cool sky ambient, blue distance haze; sky colours are linear HDR
    g.frame.lights.addDirectional([-sun[0], -sun[1], -sun[2]], [1.0, 0.93, 0.82], sky ? 3.4 : 2.4);
    g.frame.lights.addHemisphere([0.42, 0.55, 0.85], [0.28, 0.24, 0.18], sky ? 1.0 : 1.3);
    const skySet = { mode: 'procedural' as const, zenithColor: [0.1, 0.3, 0.92] as const, horizonColor: [0.58, 0.74, 1.0] as const, groundColor: [0.32, 0.4, 0.34] as const, horizonCurve: 0.9, sunAngularRadius: 0.012 };
    if (sky) g.frame.setEnvironment({ clearColor: [0.55, 0.72, 0.95, 1], fog: { color: [0.62, 0.74, 0.92], mode: 'exponential', density: 0.0016 }, sky: skySet });
    else g.frame.setEnvironment({ clearColor: [0.55, 0.72, 0.95, 1], sky: skySet });
    for (const it of this.items) {
      const st = STYLE[it.style] ?? STYLE[0]!;
      const material = it.alpha < 1 && st.material !== 'm:water' && st.material !== 'm:unlit' && st.material !== 'm:holo' && st.material !== 'm:storm' ? 'm:blend' : it.two && it.alpha >= 1 ? 'm:twosided' : st.material;
      const opts: { color: [number, number, number, number]; material: string; roughness: number; metallic: number; emissive?: number } = { color: [it.tint[0], it.tint[1], it.tint[2], it.alpha], material, roughness: st.roughness, metallic: st.metallic }; if (st.emissive !== undefined) opts.emissive = st.emissive;
      g.frame.draw(it.m.id, it.mat, opts);
    }
    this.items.length = 0;
  }
}
const srgb = (v: number) => Math.pow(Math.max(0, Math.min(1, v)), 2.2);   // authored colours are sRGB; vertex colours are linear
