import { V3, M4, cross, norm, sub, transformPoint, transformDir, ident, mul, translate, rotY, rotX, rotZ, scaleM, rand } from './math.js';
import { Renderer, Mesh } from './gl.js';

export type Col = V3;
export const rgb = (h: number): Col => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const dk = (c: Col, k: number): Col => [c[0] * k, c[1] * k, c[2] * k];

/** Flat-shaded procedural mesh builder. Every model in the game is made from these primitives. */
export class MB {
  d: number[] = [];
  m: M4 = ident();
  private stack: M4[] = [];
  push(m: M4) { this.stack.push(this.m); this.m = mul(this.m, m); return this; }
  pop() { this.m = this.stack.pop()!; return this; }
  tri(a: V3, b: V3, c: V3, col: Col) {
    a = transformPoint(this.m, a); b = transformPoint(this.m, b); c = transformPoint(this.m, c);
    const n = norm(cross(sub(b, a), sub(c, a)));
    for (const p of [a, b, c]) this.d.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2]);
  }
  /** triangle with explicit per-vertex normals (smooth shading) */
  triN(a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3, col: Col) {
    for (const [p, n] of [[a, na], [b, nb], [c, nc]] as [V3, V3][]) { const q = transformPoint(this.m, p), m = norm(transformDir(this.m, n)); this.d.push(q[0], q[1], q[2], m[0], m[1], m[2], col[0], col[1], col[2]); }
  }
  quad(a: V3, b: V3, c: V3, d: V3, col: Col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  box(c: V3, s: V3, col: Col) {
    const [x, y, z] = c, [w, h, l] = [s[0] / 2, s[1] / 2, s[2] / 2];
    const p = (i: number): V3 => [x + (i & 1 ? w : -w), y + (i & 2 ? h : -h), z + (i & 4 ? l : -l)];
    this.quad(p(2), p(6), p(7), p(3), col); this.quad(p(0), p(1), p(5), p(4), dk(col, 0.6));
    this.quad(p(4), p(5), p(7), p(6), dk(col, 0.92)); this.quad(p(1), p(0), p(2), p(3), dk(col, 0.92));
    this.quad(p(5), p(1), p(3), p(7), dk(col, 0.84)); this.quad(p(0), p(4), p(6), p(2), dk(col, 0.84));
    return this;
  }
  cyl(c: V3, r0: number, r1: number, h: number, col: Col, seg = 8, caps = true, smooth = false) {
    const [x, y, z] = c;
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      const b0: V3 = [x + Math.cos(a0) * r0, y, z + Math.sin(a0) * r0], b1: V3 = [x + Math.cos(a1) * r0, y, z + Math.sin(a1) * r0];
      const t0: V3 = [x + Math.cos(a0) * r1, y + h, z + Math.sin(a0) * r1], t1: V3 = [x + Math.cos(a1) * r1, y + h, z + Math.sin(a1) * r1];
      if (smooth) { const n0: V3 = norm([Math.cos(a0), (r0 - r1) / h, Math.sin(a0)]), n1: V3 = norm([Math.cos(a1), (r0 - r1) / h, Math.sin(a1)]); this.triN(b1, b0, t0, n1, n0, n0, col); this.triN(b1, t0, t1, n1, n0, n1, col); }
      else if (r1 > 0) this.quad(b1, b0, t0, t1, col); else this.tri(b1, b0, t0, col);
      if (caps) { if (r0 > 0) this.tri([x, y, z], b0, b1, dk(col, 0.7)); if (r1 > 0) this.tri([x, y + h, z], t1, t0, col); }
    }
    return this;
  }
  sphere(c: V3, r: number, col: Col, seg = 6, sy = 1, smooth = false, rows: [number, number] = [0, 1]) {
    const p = (i: number, j: number): V3 => { const ph = i / seg * Math.PI, th = j / (seg * 2) * Math.PI * 2; return [c[0] + r * Math.sin(ph) * Math.cos(th), c[1] + r * sy * Math.cos(ph), c[2] + r * Math.sin(ph) * Math.sin(th)]; };
    const n = (i: number, j: number): V3 => norm(sub(p(i, j), c));
    for (let i = Math.round(rows[0] * seg); i < Math.round(rows[1] * seg); i++) for (let j = 0; j < seg * 2; j++) {
      if (smooth) { this.triN(p(i, j), p(i, j + 1), p(i + 1, j + 1), n(i, j), n(i, j + 1), n(i + 1, j + 1), col); this.triN(p(i, j), p(i + 1, j + 1), p(i + 1, j), n(i, j), n(i + 1, j + 1), n(i + 1, j), col); }
      else this.quad(p(i, j), p(i, j + 1), p(i + 1, j + 1), p(i + 1, j), col);
    }
    return this;
  }
  /** rounded box (bevelled) — for the soft "Fortnite" look on characters */
  rbox(c: V3, s: V3, col: Col, r = 0.05) {
    const [x, y, z] = c, [w, h, l] = [s[0] / 2, s[1] / 2, s[2] / 2];
    this.box([x, y, z], [s[0] - 2 * r, s[1], s[2] - 2 * r], col);
    this.box([x, y, z], [s[0], s[1] - 2 * r, s[2] - 2 * r], col);
    this.box([x, y, z], [s[0] - 2 * r, s[1] - 2 * r, s[2]], col);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) { this.box([x + sx * (w - r), y + sy * (h - r), z], [r * 1.4, r * 1.4, s[2] - 2 * r], dk(col, 0.9)); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { this.box([x + sx * (w - r), y, z + sz * (l - r)], [r * 1.4, s[1] - 2 * r, r * 1.4], dk(col, 0.9)); }
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) { this.box([x, y + sy * (h - r), z + sz * (l - r)], [s[0] - 2 * r, r * 1.4, r * 1.4], dk(col, 0.9)); }
    return this;
  }
  build(r: Renderer): Mesh { return r.upload(new Float32Array(this.d)); }
}

export const C = {
  wood: rgb(0xd9c39c), woodDark: rgb(0xb59a6e), stone: rgb(0xcbbfae), stoneDark: rgb(0xa89a88), metal: rgb(0xb9c6d2), metalDark: rgb(0x8a9aa8),
  leaf: rgb(0x6cc94f), leaf2: rgb(0x55b344), leaf3: rgb(0x86d95f), pine: rgb(0x3a9a52), pine2: rgb(0x55b566), trunk: rgb(0x9a7a55), rock: rgb(0x9a9a94),
  gold: rgb(0xe8b422), dark: rgb(0x26262c), white: rgb(0xffffff), red: rgb(0xd83a3a), blue: rgb(0x2f8fff), green: rgb(0x38c95a), purple: rgb(0x8a4fd6), orange: rgb(0xff8a1e),
  bus: rgb(0x2f6fe0), balloon: rgb(0x5fc9c9), cream: rgb(0xe9e3cf), asphalt: rgb(0x8f9296), glass: rgb(0xd6ecf8),
};

export interface Skin { name: string; skin: Col; top: Col; top2: Col; pants: Col; boots: Col; hair: Col; hat: 'beanie' | 'cap' | 'hair' | 'spiky' | 'blonde'; style: number; ribs?: boolean; female?: boolean; }
export const SKINS: Skin[] = [
  { name: 'Skull Trooper', skin: rgb(0x7b52d6), top: rgb(0x16161c), top2: rgb(0x8a5fe8), pants: rgb(0x1b1b22), boots: rgb(0x111114), hair: rgb(0x111114), hat: 'beanie', style: 0, ribs: true },
  { name: 'Ramirez', skin: rgb(0xe06bb6), top: rgb(0x7c8a70), top2: rgb(0x4c5946), pants: rgb(0x6e7b63), boots: rgb(0x1e1e1e), hair: rgb(0x2fa6a0), hat: 'spiky', style: 0, female: true },
  { name: 'Grid', skin: rgb(0x9ad7f5), top: rgb(0xe9a6df), top2: rgb(0x8fd3ff), pants: rgb(0x9ad7f5), boots: rgb(0xe9a6df), hair: rgb(0x9ad7f5), hat: 'spiky', style: 1 },
  { name: 'Jonesy', skin: rgb(0xf0c8a0), top: rgb(0x6b7550), top2: rgb(0x4a5238), pants: rgb(0x5a4a3a), boots: rgb(0x1e1e1e), hair: rgb(0xe8c84a), hat: 'blonde', style: 0 },
  { name: 'Renegade', skin: rgb(0x9c633f), top: rgb(0x7a3f31), top2: rgb(0x3d2c29), pants: rgb(0x554839), boots: rgb(0x25201d), hair: rgb(0x211713), hat: 'cap', style: 0, female: true },
  { name: 'Arctic Ace', skin: rgb(0xe7b98e), top: rgb(0xe7edf2), top2: rgb(0x94b9cf), pants: rgb(0x8399a8), boots: rgb(0x35414c), hair: rgb(0xd7e7f0), hat: 'beanie', style: 1 },
  { name: 'Wildcat', skin: rgb(0xc98257), top: rgb(0xe38b24), top2: rgb(0x272b31), pants: rgb(0x303942), boots: rgb(0x171a1e), hair: rgb(0x402719), hat: 'hair', style: 0, female: true },
  { name: 'Neon Striker', skin: rgb(0x6a4634), top: rgb(0x24243b), top2: rgb(0x35e4c1), pants: rgb(0x202634), boots: rgb(0x10131a), hair: rgb(0xb24cff), hat: 'spiky', style: 1 },
];

export interface CharMesh { torso: Mesh; head: Mesh; upperArm: Mesh; foreArm: Mesh; thigh: Mesh; shin: Mesh; style: number; }
/** Fortnite-style character: smooth chunky body, vest, pouches, two-segment limbs. Feet at origin, faces +z. */
export function buildCharacter(r: Renderer, s: Skin, bulk = 1): CharMesh {
  const mk = (f: (b: MB) => void) => { const b = new MB(); f(b); return b.build(r); };
  const flat = (b: MB, z = 0.72) => b.push(scaleM(1, 1, z));
  const sw = (s.female ? 0.86 : 1) * bulk, black = rgb(0x1f1f24);
  return {
    style: s.style,
    torso: mk(b => {
      flat(b, 0.64); b.cyl([0, 0.82, 0], 0.25 * sw, 0.35 * sw, 0.55, s.top, 16, false, true); b.sphere([0, 1.37, 0], 0.35 * sw, s.top, 10, 0.55, true, [0, 0.5]);  // chest
      b.cyl([0, 0.72, 0], 0.26 * sw, 0.26 * sw, 0.12, s.pants, 16, true, true); b.pop();                                                                    // hips
      if (s.ribs) { for (let i = 0; i < 4; i++) b.box([0, 1.36 - i * 0.11, 0.2 * sw], [0.32 - i * 0.03, 0.035, 0.03], s.top2); b.box([0, 1.13, 0.2 * sw], [0.05, 0.55, 0.03], s.top2); for (let i = 0; i < 3; i++) b.box([0, 0.92 - i * 0.07, 0.19 * sw], [0.08, 0.03, 0.03], s.top2); }
      else {
        b.rbox([0, 1.2, 0.17 * sw], [0.5 * sw, 0.5, 0.1], s.top2, 0.03);                                                                                  // vest front
        b.rbox([0, 1.2, -0.17 * sw], [0.5 * sw, 0.5, 0.1], s.top2, 0.03);                                                                                 // vest back
        for (const x of [-0.13, 0, 0.13]) b.rbox([x * sw, 0.86, -0.2 * sw], [0.11, 0.14, 0.09], black, 0.02);                                            // back pouches
        for (const x of [-0.16, 0.16]) b.rbox([x * sw, 0.86, 0.19 * sw], [0.12, 0.13, 0.08], black, 0.02);                                               // front pouches
        b.box([0, 0.86, 0], [0.56 * sw, 0.07, 0.42 * sw], black);                                                                                        // belt
        b.push(mul(translate(0, 1.2, 0.22 * sw), rotZ(0.6))); b.box([0, 0, 0], [0.06, 0.62, 0.02], black); b.pop();                                      // strap
        b.rbox([0, 1.05, -0.26 * sw], [0.28, 0.32, 0.14], dk(s.top2, 0.8), 0.03);                                                                        // small backpack
      }
      b.cyl([0, 1.48, 0], 0.09, 0.1, 0.1, s.skin, 8, false, true);                                                                                       // neck
    }),
    head: mk(b => {
      flat(b, 0.9); b.sphere([0, 0.26, 0], 0.235, s.skin, 12, 1.1, true); b.pop();
      b.box([-0.085, 0.29, 0.2], [0.06, 0.05, 0.03], C.dark); b.box([0.085, 0.29, 0.2], [0.06, 0.05, 0.03], C.dark);
      b.box([-0.085, 0.34, 0.205], [0.08, 0.02, 0.02], dk(s.hair, 0.5)); b.box([0.085, 0.34, 0.205], [0.08, 0.02, 0.02], dk(s.hair, 0.5));
      b.box([0, 0.15, 0.2], [0.09, 0.02, 0.03], dk(s.skin, 0.6)); b.box([0, 0.22, 0.225], [0.04, 0.07, 0.03], dk(s.skin, 0.85));
      if (s.hat === 'beanie') { flat(b, 0.92); b.sphere([0, 0.3, 0], 0.255, s.hair, 12, 1.1, true, [0, 0.42]); b.pop(); b.cyl([0, 0.33, 0], 0.25, 0.255, 0.09, dk(s.hair, 0.8), 14, false, true); }
      else if (s.hat === 'cap') { flat(b, 0.92); b.sphere([0, 0.29, 0], 0.25, s.hair, 12, 1.1, true, [0, 0.4]); b.pop(); b.box([0, 0.4, 0.3], [0.36, 0.04, 0.2], s.hair); }
      else if (s.hat === 'spiky') { flat(b, 0.9); b.sphere([0, 0.29, 0], 0.245, s.hair, 12, 1.1, true, [0, 0.42]); b.pop(); for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28, rr = 0.17; b.cyl([Math.cos(a) * rr, 0.42, Math.sin(a) * rr * 0.8 - 0.02], 0.045, 0.02, 0.14 + (i % 2) * 0.05, s.hair, 6, true, true); } b.cyl([0, 0.45, 0], 0.06, 0.02, 0.16, s.hair, 6, true, true); }
      else if (s.hat === 'blonde') { flat(b, 0.92); b.sphere([0, 0.29, 0], 0.25, s.hair, 12, 1.1, true, [0, 0.42]); b.pop(); b.box([0, 0.4, 0.18], [0.36, 0.1, 0.12], s.hair); b.box([0, 0.36, -0.2], [0.4, 0.14, 0.1], s.hair); }
      else { flat(b, 0.95); b.sphere([0, 0.3, -0.02], 0.26, s.hair, 12, 1.1, true, [0, 0.45]); b.pop(); }
    }),
    upperArm: mk(b => { b.sphere([0, 0, 0], 0.13 * sw, s.top, 8, 1, true); b.cyl([0, -0.32, 0], 0.09 * sw, 0.12 * sw, 0.32, s.top, 10, false, true); if (s.ribs) b.sphere([0, -0.05, 0], 0.16 * sw, s.top, 8, 1, true); }),
    foreArm: mk(b => { b.sphere([0, 0, 0], 0.09 * sw, s.top, 8, 1, true); b.cyl([0, -0.28, 0], 0.075, 0.09 * sw, 0.28, s.skin, 10, false, true); b.cyl([0, -0.1, 0], 0.08, 0.09 * sw, 0.1, s.top, 10, false, true); b.rbox([0, -0.33, 0.01], [0.13, 0.12, 0.09], s.skin, 0.03); }),
    thigh: mk(b => { b.sphere([0, 0, 0], 0.13, s.pants, 8, 1, true); b.cyl([0, -0.4, 0], 0.11, 0.13, 0.4, s.pants, 10, false, true); b.rbox([0.02, -0.25, 0.1], [0.12, 0.14, 0.06], dk(s.pants, 0.7), 0.02); }),
    shin: mk(b => { b.sphere([0, 0, 0], 0.11, s.pants, 8, 1, true); b.rbox([0, -0.02, 0.09], [0.14, 0.12, 0.08], black, 0.02); b.cyl([0, -0.3, 0], 0.1, 0.11, 0.3, s.pants, 10, false, true); flat(b, 1.4); b.cyl([0, -0.42, 0.03], 0.12, 0.11, 0.14, s.boots, 10, true, true); b.pop(); b.box([0, -0.3, 0.02], [0.24, 0.1, 0.3], s.boots); }),
  };
}

export type HouseSpec = { w: number; d: number; floors: number; wall: Col; roof: Col; trim: Col; style: number };
export const HOUSE_STYLES: Omit<HouseSpec, 'w' | 'd' | 'floors'>[] = [
  { wall: rgb(0xc4d6e2), roof: rgb(0x4c525c), trim: rgb(0xf8f8f6), style: 0 }, { wall: rgb(0xb07a68), roof: rgb(0x3d4046), trim: rgb(0xefe9dc), style: 3 },
  { wall: rgb(0xe6e2d2), roof: rgb(0x5a5f68), trim: rgb(0xffffff), style: 0 }, { wall: rgb(0xa9bcc9), roof: rgb(0x474a52), trim: rgb(0xf6f6f6), style: 0 },
  { wall: rgb(0xcfd8c6), roof: rgb(0x8a4a3c), trim: rgb(0xfaf6ea), style: 0 }, { wall: rgb(0xd9c9a8), roof: rgb(0x55606e), trim: rgb(0xffffff), style: 0 },
];
export interface LBox { min: V3; max: V3; }
export const FH = 3.6;   // floor height
/** hollow house with interior, stairs and furniture. Local space: front = +z. Returns collision boxes (local). */
export function house(b: MB, s: HouseSpec): LBox[] {
  const { w, d } = s, H = FH * s.floors, T = 0.3, hw = w / 2, hd = d / 2, boxes: LBox[] = [];
  const solid = (c: V3, sz: V3, col: Col) => { b.box(c, sz, col); boxes.push({ min: [c[0] - sz[0] / 2, c[1] - sz[1] / 2, c[2] - sz[2] / 2], max: [c[0] + sz[0] / 2, c[1] + sz[1] / 2, c[2] + sz[2] / 2] }); };
  solid([0, 0.2, 0], [w + 0.4, 0.4, d + 0.4], rgb(0x8a8a86));                         // foundation
  b.box([0, 0.45, 0], [w - 0.2, 0.12, d - 0.2], rgb(0xb8996e));                        // ground floor boards
  for (let f = 0; f < s.floors; f++) {
    const y0 = f * FH, yc = y0 + FH / 2;
    solid([0, yc, -hd + T / 2], [w, FH, T], s.wall);                                    // back
    solid([-hw + T / 2, yc, 0], [T, FH, d], s.wall); solid([hw - T / 2, yc, 0], [T, FH, d], s.wall);   // sides
    if (f === 0) { const dw = 1.5, dh = 2.5; solid([-(hw + dw / 2) / 2, yc, hd - T / 2], [hw - dw / 2, FH, T], s.wall); solid([(hw + dw / 2) / 2, yc, hd - T / 2], [hw - dw / 2, FH, T], s.wall); solid([0, y0 + dh + (FH - dh) / 2, hd - T / 2], [dw, FH - dh, T], s.wall); }
    else solid([0, yc, hd - T / 2], [w, FH, T], s.wall);
    if (s.style === 0) {                                                                   // horizontal siding boards
      const lc = dk(s.wall, 0.86);
      for (let yy = y0 + 0.3; yy < y0 + FH - 0.1; yy += 0.36) { b.box([0, yy, hd + 0.005], [w, 0.03, 0.02], lc); b.box([0, yy, -hd - 0.005], [w, 0.03, 0.02], lc); b.box([hw + 0.005, yy, 0], [0.02, 0.03, d], lc); b.box([-hw - 0.005, yy, 0], [0.02, 0.03, d], lc); }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([sx * hw, yc, sz * hd], [0.22, FH, 0.22], s.trim);        // corner boards
    // windows (glass flush on both faces) + frames
    const win = (x: number, z: number, side: 'z' | 'x') => { const y = y0 + 1.95, ww = 1.6, wh = 1.7; if (side === 'z') { for (const o of [T / 2 + 0.03, -T / 2 - 0.03]) { b.box([x, y, z + o], [ww + 0.24, wh + 0.24, 0.06], s.trim); b.box([x, y, z + o * 1.15], [ww, wh, 0.03], C.glass); b.box([x, y, z + o * 1.3], [0.06, wh, 0.02], s.trim); b.box([x, y, z + o * 1.3], [ww, 0.06, 0.02], s.trim); b.box([x - ww / 6, y, z + o * 1.3], [0.04, wh, 0.02], s.trim); b.box([x + ww / 6, y, z + o * 1.3], [0.04, wh, 0.02], s.trim); } b.box([x, y - wh / 2 - 0.1, z + Math.sign(z) * (T / 2 + 0.12)], [ww + 0.4, 0.12, 0.3], s.trim); } else { for (const o of [T / 2 + 0.03, -T / 2 - 0.03]) { b.box([x + o, y, z], [0.06, wh + 0.24, ww + 0.24], s.trim); b.box([x + o * 1.15, y, z], [0.03, wh, ww], C.glass); b.box([x + o * 1.3, y, z], [0.02, wh, 0.06], s.trim); b.box([x + o * 1.3, y, z], [0.02, 0.06, ww], s.trim); } } };
    const nx = Math.max(2, Math.round(w / 4));
    for (let i = 0; i < nx; i++) { const x = -hw + (i + 0.5) * w / nx; if (!(f === 0 && Math.abs(x) < 1.5)) win(x, hd - T / 2, 'z'); win(x, -hd + T / 2, 'z'); }
    for (const z of [-d * 0.25, d * 0.25]) { win(-hw + T / 2, z, 'x'); win(hw - T / 2, z, 'x'); }
    if (f > 0) {                                                                         // upper floor slab with stair hole on the left
      const sx0 = -hw + T, sx1 = -hw + T + 1.5;
      solid([(sx1 + hw - T) / 2, y0 + 0.1, 0], [hw - T - sx1, 0.25, d - 2 * T], rgb(0xb8996e));
      solid([(sx0 + sx1) / 2, y0 + 0.1, (3.2 + hd - T) / 2], [sx1 - sx0, 0.25, hd - T - 3.2], rgb(0xb8996e));
      solid([(sx0 + sx1) / 2, y0 + 0.1, -(3.2 + hd - T) / 2], [sx1 - sx0, 0.25, hd - T - 3.2], rgb(0xb8996e));
      b.box([(sx0 + sx1) / 2 + 0.75, y0 + 0.6, 0], [0.06, 1.0, 6.4], rgb(0x5a4a3a));      // railing
      const steps = 8, sl = 6.4 / steps;
      for (let k = 0; k < steps; k++) { const yy = y0 - FH + (k + 1) * FH / steps; solid([(sx0 + sx1) / 2, yy - 0.12, 3.2 - (k + 0.5) * sl], [sx1 - sx0, 0.24, sl], rgb(0xa88a60)); b.box([(sx0 + sx1) / 2, yy - 0.5, 3.2 - (k + 0.5) * sl], [sx1 - sx0 - 0.1, 0.5, sl], s.wall); }
    }
    // interior partition with a doorway
    if (w > 12) { const px = w / 6; solid([px, yc, -hd / 2 - 1], [T * 0.7, FH, hd - 2 + T], rgb(0xe8e4dc)); }
    // furniture
    if (f === 0) { b.box([hw * 0.5, 0.75, -hd * 0.5], [2.2, 0.12, 1.1], rgb(0x7a5a3a)); for (const [dx, dz] of [[-0.8, 0.3], [0.8, 0.3]]) b.box([hw * 0.5 + dx, 0.4, -hd * 0.5 + dz], [0.15, 0.7, 0.15], rgb(0x5a4a3a)); for (const [dx, dz] of [[-0.6, 0.9], [0.6, 0.9]]) { b.box([hw * 0.5 + dx, 0.5, -hd * 0.5 + dz], [0.5, 0.1, 0.5], rgb(0x5a4a3a)); b.box([hw * 0.5 + dx, 0.85, -hd * 0.5 + dz + 0.22], [0.5, 0.7, 0.06], rgb(0x5a4a3a)); }
      solid([-hw * 0.45, 0.4, hd * 0.4], [2.4, 0.8, 1.0], rgb(0x4a6f9a)); b.box([-hw * 0.45, 0.9, hd * 0.4 + 0.4], [2.4, 0.5, 0.25], rgb(0x4a6f9a));
      solid([hw * 0.5, 0.5, hd * 0.4], [2.4, 1.0, 0.7], rgb(0xdedad0)); b.box([hw * 0.5, 1.02, hd * 0.4], [2.5, 0.06, 0.75], rgb(0x555555)); }
    else { solid([hw * 0.4, 0.4 + y0, -hd * 0.3], [2.0, 0.6, 2.6], rgb(0xc0c8d8)); b.box([hw * 0.4, 0.75 + y0, -hd * 0.3 - 1.0], [1.8, 0.2, 0.6], rgb(0xffffff)); b.box([hw * 0.4, 0.9 + y0, -hd * 0.3 - 1.3], [2.0, 0.8, 0.08], rgb(0x7a5a3a)); }
  }
  // roof: gable along x, stacked collision
  const rh = d * 0.42, ov = 0.6, rc = s.roof;
  b.quad([-hw - ov, H, -hd - ov], [-hw - ov, H + rh, 0], [hw + ov, H + rh, 0], [hw + ov, H, -hd - ov], rc);
  b.quad([hw + ov, H, hd + ov], [hw + ov, H + rh, 0], [-hw - ov, H + rh, 0], [-hw - ov, H, hd + ov], rc);
  b.quad([-hw - ov, H - 0.25, -hd - ov], [hw + ov, H - 0.25, -hd - ov], [hw + ov, H, -hd - ov], [-hw - ov, H, -hd - ov], s.trim);
  b.quad([hw + ov, H - 0.25, hd + ov], [-hw - ov, H - 0.25, hd + ov], [-hw - ov, H, hd + ov], [hw + ov, H, hd + ov], s.trim);
  b.quad([-hw - ov, H, -hd - ov], [hw + ov, H, -hd - ov], [hw + ov, H + rh, 0], [-hw - ov, H + rh, 0], dk(rc, 0.7));   // underside
  b.quad([hw + ov, H, hd + ov], [-hw - ov, H, hd + ov], [-hw - ov, H + rh, 0], [hw + ov, H + rh, 0], dk(rc, 0.7));
  b.tri([hw, H, -hd], [hw, H + rh, 0], [hw, H, hd], s.wall); b.tri([-hw, H, hd], [-hw, H + rh, 0], [-hw, H, -hd], s.wall);
  b.box([0, H + 0.05, 0], [w, 0.1, d], rgb(0x7a6a5a));                                    // attic floor (visual cap)
  b.box([0, H - 0.1, hd + ov + 0.02], [w + 2 * ov, 0.3, 0.06], s.trim); b.box([0, H - 0.1, -hd - ov - 0.02], [w + 2 * ov, 0.3, 0.06], s.trim);   // gutters
  for (let k = 0; k < 4; k++) { const t0 = k / 4, t1 = (k + 1) / 4; boxes.push({ min: [-hw - ov, H + rh * t0, -(hd + ov) * (1 - t0)], max: [hw + ov, H + rh * t1, (hd + ov) * (1 - t0)] }); }
  b.box([hw * 0.4, H + rh * 0.75, -hd * 0.25], [0.9, rh * 1.3, 0.9], rgb(0x8a6a5a));      // chimney
  // door, porch, steps
  b.box([0, 1.25, hd - T / 2], [1.4, 2.5, 0.08], rgb(0x3b4a6b)); b.box([0.45, 1.2, hd + 0.02], [0.1, 0.1, 0.05], C.gold);
  b.box([0, 3.1, hd + 1.0], [3.2, 0.15, 2.0], s.roof); for (const x of [-1.4, 1.4]) solid([x, 1.55, hd + 1.8], [0.18, 3.1, 0.18], s.trim);
  solid([0, 0.2, hd + 1.2], [3.0, 0.4, 1.6], rgb(0xb0b0aa)); solid([0, 0.1, hd + 2.3], [3.0, 0.2, 0.7], rgb(0xb0b0aa));
  return boxes;
}

export interface Models { [k: string]: Mesh; }
const MATCOL: Record<string, [Col, Col]> = { wood: [rgb(0xd9c39c), rgb(0xb59a6e)], stone: [rgb(0xcbbfae), rgb(0xa89a88)], metal: [rgb(0xb9c6d2), rgb(0x8a9aa8)] };
/** wall (3x3) or floor (2x2) with tiles removed by the edit bitmask */
export function editedPiece(r: Renderer, type: 'wall' | 'floor', mat: string, mask: number): Mesh {
  const b = new MB(), [c, c2] = MATCOL[mat];
  if (type === 'wall') {
    const T = 4 / 3;
    for (let i = 0; i < 9; i++) { if (mask & (1 << i)) continue; const row = Math.floor(i / 3), col = i % 3; b.box([-2 + (col + 0.5) * T, (row + 0.5) * T, 0], [T, T, 0.25], c); }
    for (let i = 0; i < 9; i++) {   // frame the holes
      if (!(mask & (1 << i))) continue; const row = Math.floor(i / 3), col = i % 3, x = -2 + (col + 0.5) * T, y = (row + 0.5) * T;
      const nb = (j: number) => j < 0 || j > 8 || (mask & (1 << j));
      if (!nb(i + 3) || row === 2) b.box([x, y + T / 2, 0], [T, 0.1, 0.3], c2); if (!nb(i - 3) || row === 0) b.box([x, y - T / 2, 0], [T, 0.1, 0.3], c2);
      if (col < 2 && !nb(i + 1)) b.box([x + T / 2, y, 0], [0.1, T, 0.3], c2); if (col > 0 && !nb(i - 1)) b.box([x - T / 2, y, 0], [0.1, T, 0.3], c2);
    }
  } else for (let i = 0; i < 4; i++) { if (mask & (1 << i)) continue; const cx = i % 2 ? 1 : -1, cz = i > 1 ? 1 : -1; b.box([cx, -0.12, cz], [2, 0.25, 2], c); b.box([cx, -0.12, cz * 1.95], [2, 0.27, 0.1], c2); }
  return b.build(r);
}
export function buildModels(r: Renderer): Models {
  const M: Models = {};
  const mk = (f: (b: MB) => void) => { const b = new MB(); f(b); return b.build(r); };

  // --- weapons (held at origin, pointing +z) ---
  M.pickaxe = mk(b => { b.cyl([0, 0, 0], 0.03, 0.03, 0.9, rgb(0x5a4a3a), 6); b.box([0, 0.9, 0], [0.55, 0.09, 0.09], rgb(0xb0b6bd)); b.box([0.3, 0.9, 0], [0.14, 0.16, 0.11], rgb(0xb0b6bd)); b.box([-0.3, 0.9, 0], [0.14, 0.16, 0.11], rgb(0xb0b6bd)); b.box([0, 0.35, 0], [0.05, 0.25, 0.05], C.dark); });
  const tan = rgb(0xc9a86a), gun = rgb(0x2a2a2e), steel = rgb(0x6c7480);
  M.ar = mk(b => { b.rbox([0, 0, 0.15], [0.09, 0.15, 0.75], tan, 0.02); b.box([0, 0.09, 0.2], [0.05, 0.04, 0.6], gun); b.cyl([0, 0.02, 0.9], 0.028, 0.028, 0.35, gun, 8); b.box([0, -0.02, 0.62], [0.07, 0.09, 0.3], gun); b.box([0, -0.17, -0.03], [0.06, 0.2, 0.09], gun); b.push(mul(translate(0, -0.2, 0.2), rotX(0.25))); b.box([0, 0, 0], [0.06, 0.28, 0.1], gun); b.pop(); b.box([0, 0.0, -0.35], [0.07, 0.13, 0.32], tan); b.box([0, -0.07, -0.5], [0.07, 0.16, 0.05], gun); b.box([0, 0.14, 0.05], [0.03, 0.05, 0.16], gun); });
  M.burst = mk(b => { b.rbox([0, 0, 0.15], [0.09, 0.15, 0.75], rgb(0x8a8f7a), 0.02); b.box([0, 0.09, 0.2], [0.05, 0.04, 0.6], gun); b.cyl([0, 0.02, 0.9], 0.028, 0.028, 0.3, gun, 8); b.box([0, -0.17, -0.03], [0.06, 0.2, 0.09], gun); b.box([0, -0.2, 0.2], [0.06, 0.28, 0.1], gun); b.box([0, 0.0, -0.35], [0.07, 0.13, 0.32], rgb(0x8a8f7a)); b.box([0, 0.15, 0.1], [0.05, 0.06, 0.3], gun); });
  M.shotgun = mk(b => { b.rbox([0, 0, -0.05], [0.09, 0.13, 0.45], gun, 0.02); b.cyl([0, 0.03, 0.15], 0.03, 0.03, 0.8, gun, 8); b.cyl([0, -0.05, 0.15], 0.032, 0.032, 0.55, steel, 8); b.box([0, -0.05, 0.5], [0.08, 0.08, 0.22], rgb(0x6b4a2b)); b.box([0, -0.14, -0.1], [0.06, 0.16, 0.08], rgb(0x6b4a2b)); b.box([0, -0.03, -0.42], [0.08, 0.15, 0.35], rgb(0x6b4a2b)); b.box([0, 0.09, 0.05], [0.03, 0.04, 0.2], gun); });
  M.sniper = mk(b => { b.rbox([0, 0, 0.05], [0.08, 0.14, 0.65], rgb(0x5f5a4a), 0.02); b.cyl([0, 0.02, 0.35], 0.028, 0.028, 1.0, gun, 8); b.cyl([0, 0.02, 1.3], 0.04, 0.04, 0.12, gun, 8); b.box([0, 0.13, 0.05], [0.05, 0.05, 0.4], gun); b.cyl([0, 0.15, -0.05], 0.045, 0.045, 0.4, gun, 8); b.push(rotX(Math.PI / 2)); b.pop(); b.box([0, 0.15, 0.17], [0.09, 0.09, 0.04], rgb(0x3aa2ff)); b.box([0.08, 0.06, -0.05], [0.1, 0.03, 0.03], steel); b.box([0, -0.16, -0.05], [0.06, 0.2, 0.08], gun); b.box([0, -0.01, -0.4], [0.07, 0.15, 0.35], rgb(0x5f5a4a)); b.box([0, -0.2, 0.15], [0.06, 0.2, 0.1], gun); });
  M.smg = mk(b => { b.rbox([0, 0, 0.1], [0.08, 0.13, 0.45], gun, 0.02); b.cyl([0, 0.02, 0.32], 0.025, 0.025, 0.25, gun, 8); b.box([0, -0.15, 0.05], [0.06, 0.22, 0.08], gun); b.box([0, -0.2, 0.15], [0.05, 0.25, 0.08], steel); b.box([0, 0, -0.25], [0.04, 0.06, 0.2], steel); b.box([0, 0.09, 0.05], [0.03, 0.04, 0.2], gun); });
  M.fish = mk(b => { b.push(scaleM(0.45, 0.6, 1)); b.sphere([0, 0.3, 0], 0.5, rgb(0x3f7fe0), 8, 1, true); b.pop(); b.tri([0, 0.3, -0.45], [0, 0.55, -0.85], [0, 0.05, -0.85], rgb(0x3f7fe0)); b.tri([0, 0.05, -0.85], [0, 0.55, -0.85], [0, 0.3, -0.45], rgb(0x3f7fe0)); b.box([0.15, 0.36, 0.25], [0.06, 0.06, 0.04], C.white); b.box([-0.15, 0.36, 0.25], [0.06, 0.06, 0.04], C.white); });
  M.rod = mk(b => { b.push(rotX(-0.6)); b.cyl([0, 0, 0], 0.02, 0.012, 1.6, rgb(0xc9a56b), 6); b.box([0, 0.25, 0], [0.05, 0.3, 0.05], C.dark); b.cyl([0.06, 0.35, 0], 0.05, 0.05, 0.06, rgb(0x777777), 8); b.pop(); });
  M.shieldPot = mk(b => { b.cyl([0, 0, 0], 0.12, 0.12, 0.3, C.blue, 8); b.cyl([0, 0.3, 0], 0.05, 0.05, 0.1, C.white, 8); });
  M.medkit = mk(b => { b.box([0, 0.12, 0], [0.4, 0.24, 0.3], C.white); b.box([0, 0.25, 0], [0.2, 0.04, 0.06], C.red); b.box([0, 0.25, 0], [0.06, 0.04, 0.2], C.red); });
  M.bandage = mk(b => { b.cyl([0, 0, 0], 0.14, 0.14, 0.12, C.white, 10); b.box([0, 0.06, 0], [0.3, 0.13, 0.06], C.red); });
  M.ammo = mk(b => { b.box([0, 0.1, 0], [0.3, 0.2, 0.2], C.green); b.box([0, 0.21, 0], [0.32, 0.03, 0.22], C.dark); });
  M.tracer = mk(b => b.box([0, 0, 0.5], [0.03, 0.03, 1], rgb(0xffe27a)));

  // --- build pieces ---
  const mats: [string, Col, Col][] = [['wood', C.wood, C.woodDark], ['stone', C.stone, C.stoneDark], ['metal', C.metal, C.metalDark]];
  for (const [n, c, c2] of mats) {
    M['wall_' + n] = mk(b => { b.box([0, 2, 0], [4, 4, 0.25], c); b.box([0, 3.95, 0], [4.02, 0.1, 0.3], c2); b.box([0, 0.05, 0], [4.02, 0.1, 0.3], c2); });
    M['floor_' + n] = mk(b => { b.box([0, -0.12, 0], [4, 0.25, 4], c); b.box([0, -0.12, 1.95], [4, 0.27, 0.1], c2); b.box([0, -0.12, -1.95], [4, 0.27, 0.1], c2); });
    M['ramp_' + n] = mk(b => {
      const t = 0.25;
      b.quad([-2, 0, -2], [-2, 4, 2], [2, 4, 2], [2, 0, -2], c);
      b.quad([2, -t, -2], [2, 4 - t, 2], [-2, 4 - t, 2], [-2, -t, -2], c2);
      b.quad([-2, -t, -2], [-2, 4 - t, 2], [-2, 4, 2], [-2, 0, -2], c2);
      b.quad([2, 0, -2], [2, 4, 2], [2, 4 - t, 2], [2, -t, -2], c2);
      b.quad([-2, 4, 2], [-2, 4 - t, 2], [2, 4 - t, 2], [2, 4, 2], c2);
      b.quad([-2, 0, -2], [2, 0, -2], [2, -t, -2], [-2, -t, -2], c2);
      for (let i = 0; i < 8; i++) { const z = -1.75 + i * 0.5; b.box([0, (z + 2) + 0.05, z], [3.9, 0.1, 0.12], c2); }
    });
    M['pyramid_' + n] = mk(b => {
      const a: V3 = [-2, 0, -2], bb: V3 = [2, 0, -2], cc: V3 = [2, 0, 2], d: V3 = [-2, 0, 2], top: V3 = [0, 2, 0];
      b.tri(a, top, bb, c); b.tri(bb, top, cc, c); b.tri(cc, top, d, c); b.tri(d, top, a, c); b.quad(a, bb, cc, d, c2);
    });
  }

  // --- vegetation (smooth, lumpy canopies like the reference) ---
  M.tree = mk(b => {
    b.cyl([0, 0, 0], 0.32, 0.22, 3.4, C.trunk, 7, true, true);
    for (let i=0;i<7;i++) { const a=i/7*6.28; b.push(mul(translate(Math.cos(a)*.18,2.3+i%2*.35,Math.sin(a)*.18),mul(rotY(a),rotX(1.05)))); b.cyl([0,0,0],.13,.045,1.9,C.trunk,7,true,true); b.pop(); }
    b.sphere([0, 4.5, 0], 2.0, C.leaf, 7, 0.75, true);
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; b.sphere([Math.cos(a) * 1.3, 4.1 + (i % 2) * 0.5, Math.sin(a) * 1.3], 1.15, i % 2 ? C.leaf2 : C.leaf3, 5, 0.85, true); }
    b.sphere([0, 5.3, 0], 1.2, rgb(0x9de46b), 5, 0.8, true);
  });
  M.tree2 = mk(b => { b.cyl([0, 0, 0], 0.28, 0.2, 2.6, C.trunk, 7, true, true); b.sphere([0, 3.6, 0], 1.7, C.leaf2, 7, 0.7, true); b.sphere([0.9, 3.4, 0.5], 1.1, C.leaf, 5, 0.8, true); b.sphere([-0.8, 3.9, -0.4], 1.0, C.leaf3, 5, 0.8, true); });
  M.pine = mk(b => { b.cyl([0, 0, 0], 0.3, 0.13, 7.4, C.trunk, 9, true, true); for (let i = 0; i < 5; i++) { const y = 1.1 + i * 1.35, rr = 2.5 - i * 0.42; b.cyl([0, y, 0], rr, 0.12, 1.85, i % 2 ? C.pine2 : C.pine, 12, true, true); for(let j=0;j<8;j++){const a=j/8*6.28;b.push(mul(translate(0,y+.28,0),rotY(a)));b.cyl([0,0,0],.09,.025,rr*.95,C.trunk,6,true);b.pop();} } });
  M.rock = mk(b => { b.sphere([0, 0.3, 0], 1.3, C.rock, 5, 0.65, true); b.sphere([0.8, 0.2, 0.5], 0.8, rgb(0x888), 4, 0.8, true); });
  M.bush = mk(b => { b.sphere([0, 0.4, 0], 0.8, C.leaf2, 5, 0.7, true); b.sphere([0.5, 0.35, 0.3], 0.5, C.leaf, 4, 0.8, true); });
  M.hedge = mk(b => { b.rbox([0, 0.6, 0], [4, 1.2, 0.8], rgb(0x3f8f3a), 0.1); });

  // --- town props ---
  M.car = mk(b => { const y = rgb(0xe8c84a); b.rbox([0, 0.55, 0], [1.8, 0.5, 4.0], y, 0.06); b.rbox([0, 1.0, -0.2], [1.6, 0.5, 2.0], y, 0.06); b.box([0, 1.0, -0.2], [1.62, 0.32, 1.9], C.glass); b.box([0, 1.0, 0.85], [1.4, 0.32, 0.1], C.glass); for (const x of [-0.8, 0.8]) for (const z of [-1.3, 1.3]) { b.push(rotZ(Math.PI / 2)); b.cyl([-0.35, x - 0.12, z], 0.35, 0.35, 0.24, rgb(0x222), 10); b.pop(); } b.box([0, 0.55, 2.0], [1.6, 0.2, 0.1], rgb(0xddd)); b.box([-0.6, 0.6, 2.02], [0.25, 0.15, 0.05], rgb(0xfff8c0)); b.box([0.6, 0.6, 2.02], [0.25, 0.15, 0.05], rgb(0xfff8c0)); });
  M.lamp = mk(b => { b.cyl([0, 0, 0], 0.09, 0.07, 4.5, rgb(0x333), 6); b.box([0.5, 4.5, 0], [1.1, 0.08, 0.08], rgb(0x333)); b.box([1.0, 4.4, 0], [0.4, 0.15, 0.25], rgb(0xfff2b0)); });
  M.bench = mk(b => { b.box([0, 0.45, 0], [1.6, 0.08, 0.5], C.wood); b.box([0, 0.75, -0.22], [1.6, 0.45, 0.06], C.wood); for (const x of [-0.7, 0.7]) b.box([x, 0.25, 0], [0.08, 0.5, 0.5], rgb(0x333)); b.box([0.9, 0.35, 0.9], [0.5, 0.7, 0.5], rgb(0x2f6f9f)); });
  M.chest = mk(b => { b.box([0, 0.35, 0], [1.4, 0.7, 0.9], C.woodDark); b.box([0, 0.85, 0], [1.44, 0.3, 0.94], C.wood); b.box([0, 0.55, 0.47], [0.3, 0.3, 0.05], C.gold); for (let i = -1; i <= 1; i += 2) b.box([i * 0.5, 0.5, 0], [0.08, 1.05, 0.98], C.gold); });
  M.chestOpen = mk(b => { b.box([0, 0.35, 0], [1.4, 0.7, 0.9], C.woodDark); b.box([0, 0.9, -0.5], [1.44, 0.94, 0.3], C.wood); b.box([0, 0.75, 0], [1.2, 0.1, 0.7], C.gold); });
  M.fence = mk(b => { for (let i = 0; i < 9; i++) { b.box([-4 + i, 0.55, 0], [0.12, 1.1, 0.05], rgb(0xf4f4f0)); b.push(mul(translate(-4 + i, 1.1, 0), rotZ(Math.PI / 4))); b.box([0, 0, 0], [0.12, 0.12, 0.05], rgb(0xf4f4f0)); b.pop(); } b.box([0, 0.4, 0], [8.2, 0.08, 0.04], rgb(0xf4f4f0)); b.box([0, 0.85, 0], [8.2, 0.08, 0.04], rgb(0xf4f4f0)); });
  M.mailbox = mk(b => { b.box([0, 0.55, 0], [0.08, 1.1, 0.08], rgb(0x5a4a3a)); b.rbox([0, 1.2, 0], [0.25, 0.25, 0.45], rgb(0x3a5f9a), 0.05); b.box([0.15, 1.3, 0.1], [0.03, 0.2, 0.04], C.red); });
  M.dash = mk(b => b.box([0, 0.03, 0], [0.5, 0.06, 2.4], rgb(0xf4f4f4)));
  // Hollow two-storey shop: walkable sales floor, stock room, stairs, upper office and roof equipment.
  M.building = mk(b => {
    const wall = rgb(0xc7ccd2), trim = rgb(0x59616c), tile = rgb(0xe4dfd1), blue = rgb(0x397da4);
    b.box([0, 0.15, 0], [18.5, 0.3, 14.5], rgb(0x777b80)); b.box([0, 0.34, 0], [17.8, 0.08, 13.8], tile);
    b.box([0, 4.3, -7], [18, 8.6, 0.3], wall); b.box([-8.85, 4.3, 0], [0.3, 8.6, 14], wall); b.box([8.85, 4.3, 0], [0.3, 8.6, 14], wall);
    b.box([-6.2, 4.3, 6.9], [5.2, 8.6, 0.3], wall); b.box([6.2, 4.3, 6.9], [5.2, 8.6, 0.3], wall); b.box([0, 7.6, 6.9], [7.2, 2.0, 0.3], wall);
    b.box([0, 4.25, 0], [17.7, 0.28, 13.7], rgb(0x8d765b)); b.box([0, 8.65, 0], [18.5, 0.35, 14.5], trim);
    for (let x = -6; x <= 6; x += 3) { b.box([x, 2.35, 7.08], [2.25, 3.3, 0.08], C.glass); b.box([x, 2.35, 7.14], [0.08, 3.5, 0.15], trim); }
    b.box([0, 7.9, 7.15], [7.5, 0.9, 0.18], blue); b.box([0, 7.92, 7.25], [5.8, 0.16, 0.08], C.white);
    // aisles, stocked shelves, checkout and upstairs office
    for (const x of [-5.2, -1.8, 1.6, 5]) { b.box([x, 1.05, -1], [1.15, 1.7, 5.8], rgb(0x6d7580)); for (let z = -3.2; z <= 1.2; z += 1.1) for (let y = 0.65; y < 1.8; y += 0.55) b.box([x, y, z], [1.3, 0.18, 0.65], [0.65 + (z % 2) * 0.04, 0.28 + y * .08, 0.18 + x * .01]); }
    b.box([5.5, 0.85, 4.6], [5.2, 1.0, 1.0], rgb(0x4d5965)); for (const x of [4, 6.5]) { b.box([x, 1.45, 4.6], [0.7, 0.55, 0.18], rgb(0x20252b)); b.box([x, 1.47, 4.49], [0.52, 0.35, 0.04], rgb(0x68c9ef)); }
    for (let i = 0; i < 10; i++) b.box([-7.1, 0.55 + i * 0.42, 4.5 - i * 0.55], [2.1, 0.22, 0.62], rgb(0xa98a64));
    b.box([2.2, 4.7, -2], [0.18, 0.9, 8], rgb(0xe9e5dc)); b.box([5.5, 5.1, -1.5], [4.4, 1.0, 2.0], rgb(0x6f87a8)); b.box([5.5, 5.9, -2.35], [4.2, 0.8, 0.18], rgb(0x48566a)); b.box([-3.5, 5.1, -3], [3.6, 1.3, 1.5], rgb(0x856c50));
    for (const x of [-6, -2, 2, 6]) b.box([x, 6.3, -7.17], [2.4, 1.8, 0.07], C.glass);
    b.box([-4.5, 9.05, -2], [3.5, 0.6, 2.4], rgb(0x8e969c)); b.cyl([5, 8.8, 1], 1.0, 1.0, 1.1, rgb(0x77838c), 16, true, true);
  });
  M.truck = mk(b => { const red = rgb(0xc9483f); b.rbox([0, 1.0, -0.8], [2.4, 1.6, 3.2], red, .12); b.rbox([0, 1.45, 2.2], [2.5, 2.7, 3.0], rgb(0xe7e4dc), .08); b.box([0, 1.5, .84], [2.05, 1.0, .06], C.glass); b.box([0, .75, 3.72], [2.3, .2, .15], rgb(0x333)); for (const x of [-1.05,1.05]) for (const z of [-1.6,2.8]) { b.push(rotZ(Math.PI/2)); b.cyl([-.45,x-.15,z],.48,.48,.3,rgb(0x202226),12); b.pop(); } });
  M.fountain = mk(b => { b.cyl([0,0,0],3,3,.45,rgb(0xaebbc2),24); b.cyl([0,.45,0],2.55,2.55,.18,rgb(0x55bad5),24); b.cyl([0,.5,0],.55,.7,2.4,rgb(0xc6d1d5),16); b.sphere([0,3,0],.72,rgb(0xd8e1e3),12,.9,true); });
  M.dumpster = mk(b => { b.box([0,.65,0],[2.1,1.3,1.2],rgb(0x35745b)); b.push(rotX(-.2)); b.box([0,1.35,-.1],[2.2,.16,1.25],rgb(0x285d49)); b.pop(); for(const x of [-.8,.8]) b.cyl([x,.1,.55],.16,.16,.15,rgb(0x222),8); });

  // --- battle bus + balloon (origin: bus floor center, faces +z) ---
  M.bus = mk(b => {
    b.rbox([0, 1.4, 0], [3.2, 2.6, 10], C.bus, 0.1);
    for (let i = 0; i < 6; i++) { b.box([1.62, 1.9, -3.8 + i * 1.5], [0.05, 1.0, 1.1], C.glass); b.box([-1.62, 1.9, -3.8 + i * 1.5], [0.05, 1.0, 1.1], C.glass); }
    b.box([0, 1.9, 5.02], [2.8, 1.0, 0.05], C.glass); b.box([0, 1.0, -5.02], [2.4, 1.2, 0.05], rgb(0x333));
    b.box([0, 2.75, 0], [3.0, 0.1, 9.6], rgb(0x6f8399)); b.box([0, 3.1, 0], [3.2, 0.08, 0.08], rgb(0x333)); b.box([0, 3.1, 0], [0.08, 0.08, 9.8], rgb(0x333));
    for (const x of [-1.55, 1.55]) for (const z of [-4.8, 4.8]) b.box([x, 3.0, z], [0.06, 0.6, 0.06], rgb(0x333));
    for (const x of [-1.55, 1.55]) { b.box([x, 3.3, 0], [0.06, 0.06, 9.8], rgb(0x333)); }
    for (const x of [-1.2, 1.2]) for (const z of [-3.2, 3.2]) { b.push(rotZ(Math.PI / 2)); b.cyl([-0.55, x - 0.15, z], 0.55, 0.55, 0.3, rgb(0x1e1e22), 10); b.pop(); }
    b.box([0, 0.3, 5.1], [3.2, 0.3, 0.2], rgb(0xccc));
    b.cyl([0, 2.8, 0], 0.5, 0.45, 2.2, rgb(0xd8d8d0), 10);                              // burner base
    b.cyl([0, 5.0, 0], 0.25, 0.3, 1.2, rgb(0xd8d8d0), 8); b.box([0, 4.6, 0], [1.6, 0.1, 1.6], rgb(0xd8d8d0));
  });
  M.balloon = mk(b => {
    b.sphere([0, 0, 0], 7.5, C.balloon, 16, 1.1, true, [0, 0.56]);
    b.sphere([0, 0, 0], 7.5, C.cream, 16, 1.1, true, [0.56, 0.8]);
    b.cyl([0, -9.6, 0], 1.6, 4.4, 4.5, C.cream, 16, false, true);
    for (let i = 0; i < 14; i++) { const a = i / 14 * 6.28; b.box([Math.cos(a) * 2.2, -12.0, Math.sin(a) * 2.2], [0.05, 5, 0.05], rgb(0xb0a060)); }
  });
  // glider — wooden wing frame with arch (screenshot 3)
  M.glider = mk(b => {
    const tan = rgb(0xd8a86a), brown = rgb(0x7a5a3a);
    b.box([-2.3, 0, 0], [2.6, 0.06, 1.0], tan); b.box([2.3, 0, 0], [2.6, 0.06, 1.0], tan);
    b.box([-3.6, -0.05, 0.5], [0.6, 0.5, 0.5], brown); b.box([3.6, -0.05, 0.5], [0.6, 0.5, 0.5], brown);
    for (let i = 0; i < 10; i++) { const a0 = i / 10 * Math.PI, a1 = (i + 1) / 10 * Math.PI; const x0 = -Math.cos(a0) * 2.6, y0 = Math.sin(a0) * 1.6, x1 = -Math.cos(a1) * 2.6, y1 = Math.sin(a1) * 1.6; b.push(mul(translate((x0 + x1) / 2, (y0 + y1) / 2, 0), rotZ(Math.atan2(y1 - y0, x1 - x0)))); b.box([0, 0, 0], [Math.hypot(x1 - x0, y1 - y0) + 0.05, 0.1, 0.1], brown); b.pop(); }
    b.box([0, 0.0, 0], [1.4, 0.1, 0.1], brown); b.box([0, -0.9, 0], [1.0, 0.1, 0.1], brown);
    for (const x of [-0.5, 0.5]) { b.box([x, -0.5, 0], [0.05, 1.0, 0.05], rgb(0x333)); b.box([x, 0.8, 0], [0.04, 1.6, 0.04], rgb(0x333)); }
  });
  M.pad = mk(b => { b.cyl([0, 0, 0], 2.2, 2.2, 0.35, rgb(0x6f8fa0), 24, true, true); b.cyl([0, 0.35, 0], 1.9, 1.9, 0.12, rgb(0xd8e8f0), 24, true, true); b.cyl([0, 0.2, 0], 2.25, 2.25, 0.1, rgb(0x2f4f60), 24, true, true); });
  M.shadow = mk(b => b.cyl([0, 0.02, 0], 0.45, 0.45, 0.001, rgb(0x0), 12));
  M.water = mk(b => b.quad([-1000, 0, -1000], [-1000, 0, 1000], [1000, 0, 1000], [1000, 0, -1000], rgb(0x46c8d8)));
  M.hitbox = mk(b => b.box([0, 0, 0], [1, 1, 1], C.white));
  M.storm = mk(b => { b.cyl([0, -50, 0], 1, 1, 400, rgb(0x6f8fff), 64, false, true); });
  return M;
}
