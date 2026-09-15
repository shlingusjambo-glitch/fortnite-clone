import { V3, M4, cross, norm, sub, transformPoint, transformDir, ident, mul, translate, rotY, rotX, rotZ, scaleM, rand } from './math.js';
import { Renderer, Mesh } from './gl.js';

export type Col = V3;
export const rgb = (h: number): Col => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
export const dk = (c: Col, k: number): Col => [c[0] * k, c[1] * k, c[2] * k];
export const lt = (c: Col, k: number): Col => [Math.min(1, c[0] + (1 - c[0]) * k), Math.min(1, c[1] + (1 - c[1]) * k), Math.min(1, c[2] + (1 - c[2]) * k)];

/**
 * High-Poly Procedural Mesh Builder with Smooth Normals, Chamfers, and Organic Curves.
 * Used for all cartoonish, high-fidelity Fortnite Chapter 1 models.
 */
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

  triN(a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3, col: Col) {
    for (const [p, n] of [[a, na], [b, nb], [c, nc]] as [V3, V3][]) {
      const q = transformPoint(this.m, p), m = norm(transformDir(this.m, n));
      this.d.push(q[0], q[1], q[2], m[0], m[1], m[2], col[0], col[1], col[2]);
    }
  }

  quad(a: V3, b: V3, c: V3, d: V3, col: Col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }

  quadN(a: V3, b: V3, c: V3, d: V3, na: V3, nb: V3, nc: V3, nd: V3, col: Col) {
    this.triN(a, b, c, na, nb, nc, col);
    this.triN(a, c, d, na, nc, nd, col);
  }

  box(c: V3, s: V3, col: Col) {
    const [x, y, z] = c, [w, h, l] = [s[0] / 2, s[1] / 2, s[2] / 2];
    const p = (i: number): V3 => [x + (i & 1 ? w : -w), y + (i & 2 ? h : -h), z + (i & 4 ? l : -l)];
    this.quad(p(2), p(6), p(7), p(3), col); this.quad(p(0), p(1), p(5), p(4), dk(col, 0.65));
    this.quad(p(4), p(5), p(7), p(6), dk(col, 0.92)); this.quad(p(1), p(0), p(2), p(3), dk(col, 0.92));
    this.quad(p(5), p(1), p(3), p(7), dk(col, 0.82)); this.quad(p(0), p(4), p(6), p(2), dk(col, 0.82));
    return this;
  }

  /** High-poly smooth cylinder with optional beveled caps and normals */
  cyl(c: V3, r0: number, r1: number, h: number, col: Col, seg = 16, caps = true, smooth = true) {
    const [x, y, z] = c;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const b0: V3 = [x + c0 * r0, y, z + s0 * r0], b1: V3 = [x + c1 * r0, y, z + s1 * r0];
      const t0: V3 = [x + c0 * r1, y + h, z + s0 * r1], t1: V3 = [x + c1 * r1, y + h, z + s1 * r1];
      if (smooth) {
        const ny = (r0 - r1) / (h || 0.001);
        const n0: V3 = norm([c0, ny, s0]), n1: V3 = norm([c1, ny, s1]);
        this.triN(b1, b0, t0, n1, n0, n0, col);
        this.triN(b1, t0, t1, n1, n0, n1, col);
      } else {
        if (r1 > 0) this.quad(b1, b0, t0, t1, col); else this.tri(b1, b0, t0, col);
      }
      if (caps) {
        if (r0 > 0) this.tri([x, y, z], b0, b1, dk(col, 0.72));
        if (r1 > 0) this.tri([x, y + h, z], t1, t0, lt(col, 0.12));
      }
    }
    return this;
  }

  /** Smooth high-poly sphere / spheroid with per-vertex normals */
  sphere(c: V3, r: number, col: Col, seg = 12, sy = 1, smooth = true, rows: [number, number] = [0, 1]) {
    const p = (i: number, j: number): V3 => {
      const ph = (i / seg) * Math.PI, th = (j / (seg * 2)) * Math.PI * 2;
      return [c[0] + r * Math.sin(ph) * Math.cos(th), c[1] + r * sy * Math.cos(ph), c[2] + r * Math.sin(ph) * Math.sin(th)];
    };
    const n = (i: number, j: number): V3 => norm(sub(p(i, j), c));
    const startRow = Math.max(0, Math.round(rows[0] * seg)), endRow = Math.min(seg, Math.round(rows[1] * seg));
    for (let i = startRow; i < endRow; i++) {
      for (let j = 0; j < seg * 2; j++) {
        const jNext = (j + 1) % (seg * 2);
        const p00 = p(i, j), p01 = p(i, jNext), p11 = p(i + 1, jNext), p10 = p(i + 1, j);
        if (smooth) {
          const n00 = n(i, j), n01 = n(i, jNext), n11 = n(i + 1, jNext), n10 = n(i + 1, j);
          if (i === 0) { this.triN(p00, p11, p10, n00, n11, n10, col); }
          else if (i === seg - 1) { this.triN(p00, p01, p11, n00, n01, n11, col); }
          else {
            this.triN(p00, p01, p11, n00, n01, n11, col);
            this.triN(p00, p11, p10, n00, n11, n10, col);
          }
        } else {
          this.quad(p00, p01, p11, p10, col);
        }
      }
    }
    return this;
  }

  /** Smooth chamfer box (curved edges and rounded corners) */
  rbox(c: V3, s: V3, col: Col, r = 0.05) {
    const [x, y, z] = c, [w, h, l] = [s[0] / 2, s[1] / 2, s[2] / 2];
    this.box([x, y, z], [s[0] - 2 * r, s[1], s[2] - 2 * r], col);
    this.box([x, y, z], [s[0], s[1] - 2 * r, s[2] - 2 * r], col);
    this.box([x, y, z], [s[0] - 2 * r, s[1] - 2 * r, s[2]], col);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      this.box([x + sx * (w - r), y + sy * (h - r), z], [r * 1.5, r * 1.5, s[2] - 2 * r], dk(col, 0.92));
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.box([x + sx * (w - r), y, z + sz * (l - r)], [r * 1.5, s[1] - 2 * r, r * 1.5], dk(col, 0.92));
    }
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      this.box([x, y + sy * (h - r), z + sz * (l - r)], [s[0] - 2 * r, r * 1.5, r * 1.5], dk(col, 0.92));
    }
    return this;
  }

  /** Torus / ring (for sights, collars, belts, rims) */
  torus(c: V3, R: number, r: number, col: Col, segR = 16, segr = 8) {
    for (let i = 0; i < segR; i++) {
      const u0 = (i / segR) * Math.PI * 2, u1 = ((i + 1) / segR) * Math.PI * 2;
      for (let j = 0; j < segr; j++) {
        const v0 = (j / segr) * Math.PI * 2, v1 = ((j + 1) / segr) * Math.PI * 2;
        const pt = (u: number, v: number): V3 => [
          c[0] + (R + r * Math.cos(v)) * Math.cos(u),
          c[1] + r * Math.sin(v),
          c[2] + (R + r * Math.cos(v)) * Math.sin(u)
        ];
        this.quad(pt(u0, v0), pt(u1, v0), pt(u1, v1), pt(u0, v1), col);
      }
    }
    return this;
  }

  /** High-poly timber plank with beveled border and end-grain */
  plank(c: V3, s: V3, col: Col, r = 0.02) {
    this.rbox(c, s, col, r);
    // Subtle end-grain cuts
    this.box([c[0], c[1], c[2] + s[2] * 0.49], [s[0] * 0.96, s[1] * 0.96, 0.01], dk(col, 0.85));
    this.box([c[0], c[1], c[2] - s[2] * 0.49], [s[0] * 0.96, s[1] * 0.96, 0.01], dk(col, 0.85));
    return this;
  }

  build(r: Renderer): Mesh { return r.upload(new Float32Array(this.d)); }
}

export const C = {
  wood: rgb(0xd8c29b), woodDark: rgb(0x9d7a52), woodLight: rgb(0xebd8b5),
  stone: rgb(0xc4b9a8), stoneDark: rgb(0x8e8477), stoneLight: rgb(0xe2dacf),
  metal: rgb(0xb2c2cf), metalDark: rgb(0x657788), metalLight: rgb(0xdbe6f0),
  leaf: rgb(0x5fc944), leaf2: rgb(0x45a932), leaf3: rgb(0x76de4e),
  pine: rgb(0x2f8b46), pine2: rgb(0x44a65b), pineDark: rgb(0x206332),
  trunk: rgb(0x826040), trunkDark: rgb(0x5c4228),
  rock: rgb(0x928f88), rockDark: rgb(0x6b6760),
  gold: rgb(0xf0b824), dark: rgb(0x1a1a20), white: rgb(0xffffff),
  red: rgb(0xe63b3b), blue: rgb(0x2c88f5), green: rgb(0x35c255),
  purple: rgb(0x964de6), orange: rgb(0xff8a1e), yellow: rgb(0xffd232),
  bus: rgb(0x286ee6), balloon: rgb(0x4ec2c6), cream: rgb(0xeee8d4),
  asphalt: rgb(0x4a4d52), glass: rgb(0xd0ecfc), holographic: rgb(0x3db5ff),
};

export interface Skin {
  name: string;
  skin: Col;
  top: Col;
  top2: Col;
  pants: Col;
  boots: Col;
  hair: Col;
  hat: 'beanie' | 'cap' | 'hair' | 'spiky' | 'blonde';
  style: number;
  ribs?: boolean;
  female?: boolean;
}

export const SKINS: Skin[] = [
  { name: 'Jonesy', skin: rgb(0xf4c99b), top: rgb(0x6b7752), top2: rgb(0x4a5534), pants: rgb(0x634f3b), boots: rgb(0x222226), hair: rgb(0xf2cf50), hat: 'blonde', style: 0 },
  { name: 'Ramirez', skin: rgb(0xdb9b78), top: rgb(0xfa842a), top2: rgb(0x3c424d), pants: rgb(0x4c5548), boots: rgb(0x222226), hair: rgb(0x201e22), hat: 'hair', style: 0, female: true },
  { name: 'Skull Trooper', skin: rgb(0xdedee6), top: rgb(0x16161c), top2: rgb(0x8a5fe8), pants: rgb(0x1b1b22), boots: rgb(0x111114), hair: rgb(0x111114), hat: 'beanie', style: 0, ribs: true },
  { name: 'Wildcat', skin: rgb(0xcc8b62), top: rgb(0xe68722), top2: rgb(0x262a30), pants: rgb(0x333b45), boots: rgb(0x181a1f), hair: rgb(0x8c2818), hat: 'spiky', style: 0, female: true },
  { name: 'Renegade', skin: rgb(0xa36c47), top: rgb(0x824436), top2: rgb(0x3d2c29), pants: rgb(0x5c4d3d), boots: rgb(0x24201c), hair: rgb(0x1a1614), hat: 'cap', style: 0, female: true },
  { name: 'Arctic Ace', skin: rgb(0xebd2b2), top: rgb(0xeef2f7), top2: rgb(0x90b7d4), pants: rgb(0x8098ab), boots: rgb(0x323e4a), hair: rgb(0xdbeef8), hat: 'beanie', style: 1 },
  { name: 'Neon Striker', skin: rgb(0x734c38), top: rgb(0x22243d), top2: rgb(0x30e8c4), pants: rgb(0x1e2436), boots: rgb(0x12141c), hair: rgb(0xb44aff), hat: 'spiky', style: 1 },
  { name: 'Black Knight', skin: rgb(0xd8b48f), top: rgb(0x1b1b22), top2: rgb(0xc8102e), pants: rgb(0x23232b), boots: rgb(0x141418), hair: rgb(0x2b2b33), hat: 'beanie', style: 0 },
  { name: 'Rust Lord', skin: rgb(0xe0b48c), top: rgb(0xb5471f), top2: rgb(0x3c3c44), pants: rgb(0x4a3a2c), boots: rgb(0x2a2420), hair: rgb(0x8a5a2a), hat: 'cap', style: 0 },
  { name: 'Brite Bomber', skin: rgb(0xf1c9a5), top: rgb(0xff3ec9), top2: rgb(0x8be0ff), pants: rgb(0x6c3cff), boots: rgb(0xff3ec9), hair: rgb(0xb84cff), hat: 'hair', style: 0, female: true },
  { name: 'Raven', skin: rgb(0x9a9aa8), top: rgb(0x151520), top2: rgb(0x5a3cff), pants: rgb(0x101018), boots: rgb(0x0c0c12), hair: rgb(0x0e0e14), hat: 'beanie', style: 1 },
  { name: 'Renegade Raider', skin: rgb(0xe8c09a), top: rgb(0x8a1a12), top2: rgb(0x2a2a30), pants: rgb(0x3b3b44), boots: rgb(0x1a1a1e), hair: rgb(0x3a2418), hat: 'cap', style: 0, female: true },
  { name: 'Aerial Assault Trooper', skin: rgb(0xd9b08c), top: rgb(0x2b3f2a), top2: rgb(0x6a7a3a), pants: rgb(0x4a5a3a), boots: rgb(0x1e1e22), hair: rgb(0x2a1e14), hat: 'beanie', style: 0 },
  { name: 'Blue Squire', skin: rgb(0xf0c8a4), top: rgb(0x2255cc), top2: rgb(0xd8dde8), pants: rgb(0x1a3c8a), boots: rgb(0x2a2a30), hair: rgb(0x5a3a1a), hat: 'hair', style: 0 },
  { name: 'Tower Recon Specialist', skin: rgb(0xc98a68), top: rgb(0xb7a37c), top2: rgb(0x4a4a3a), pants: rgb(0x6a6a4a), boots: rgb(0x2a2420), hair: rgb(0x1a1410), hat: 'cap', style: 0 },
  { name: 'Grid Leader', skin: rgb(0x9bd9fa), top: rgb(0xefa2e4), top2: rgb(0x8cd5ff), pants: rgb(0x9bd9fa), boots: rgb(0xefa2e4), hair: rgb(0x9bd9fa), hat: 'spiky', style: 1 },
];

export interface CharMesh {
  torso: Mesh;
  head: Mesh;
  upperArm: Mesh;
  foreArm: Mesh;
  thigh: Mesh;
  shin: Mesh;
  style: number;
}

/**
 * High-Poly Cartoonish Fortnite Character.
 * Anatomical curves, detailed facial features, tactical harnesses, ammo pouches, knee-pads, laced boots.
 */
export function buildCharacter(r: Renderer, s: Skin, bulk = 1): CharMesh {
  const mk = (f: (b: MB) => void) => { const b = new MB(); f(b); return b.build(r); };
  const sw = (s.female ? 0.88 : 1.02) * bulk, black = rgb(0x1e1e24), darkGrey = rgb(0x30333b), gold = rgb(0xe6b422);

  return {
    style: s.style,
    torso: mk(b => {
      // Sculpted Torso & Muscular Contour (waist to chest)
      b.cyl([0, 0.72, 0], 0.26 * sw, 0.25 * sw, 0.14, s.pants, 20, true, true);         // hips
      b.cyl([0, 0.85, 0], 0.24 * sw, 0.28 * sw, 0.24, s.top, 20, false, true);          // lower waist
      b.cyl([0, 1.08, 0], 0.28 * sw, 0.36 * sw, 0.32, s.top, 20, false, true);          // ribcage & chest
      b.sphere([0, 1.36, 0.04 * sw], 0.35 * sw, s.top, 14, 0.52, true, [0, 0.65]);       // pectoral curvature

      // Tactical Collar & Neck
      b.cyl([0, 1.44, 0], 0.11, 0.12, 0.14, s.skin, 14, false, true);                   // neck
      b.torus([0, 1.45, 0], 0.14 * sw, 0.025, s.top2, 16, 8);                            // shirt collar ring

      // Dog tag necklace (Jonesy style)
      if (!s.female && !s.ribs) {
        b.torus([0, 1.41, 0.05], 0.13 * sw, 0.008, rgb(0xaaaaaa), 16, 6);
        b.box([0.02, 1.28, 0.22 * sw], [0.035, 0.05, 0.008], rgb(0xcccccc));
      }

      if (s.ribs) {
        // Skull Trooper skeletal ribcage
        for (let i = 0; i < 5; i++) {
          const y = 1.34 - i * 0.09, rw = (0.34 - i * 0.028) * sw;
          b.cyl([0, y, 0.18 * sw], rw * 0.5, rw * 0.5, 0.028, C.white, 12, true, true);
        }
        b.box([0, 1.16, 0.20 * sw], [0.06, 0.44, 0.025], C.white);                     // sternum
      } else {
        // High-Poly Tactical Combat Harness (dual cross-straps with metal buckles)
        b.rbox([0, 1.22, 0.19 * sw], [0.52 * sw, 0.46, 0.08], s.top2, 0.03);            // vest front
        b.rbox([0, 1.22, -0.19 * sw], [0.50 * sw, 0.48, 0.08], s.top2, 0.03);           // vest back
        // Shoulder harness straps
        for (const sx of [-0.18, 0.18]) {
          b.box([sx * sw, 1.38, 0], [0.09, 0.04, 0.42 * sw], black);
          b.box([sx * sw, 1.32, 0.23 * sw], [0.07, 0.05, 0.02], rgb(0x888888));         // strap clip
        }
        // Chest ammo pouches (flap covers with snap rivets)
        for (const x of [-0.14, 0.14]) {
          b.rbox([x * sw, 1.18, 0.24 * sw], [0.11, 0.14, 0.07], darkGrey, 0.02);
          b.box([x * sw, 1.22, 0.28 * sw], [0.025, 0.025, 0.01], gold);                  // pouch snap
        }
        // Radio with antenna on left chest
        b.box([-0.22 * sw, 1.26, 0.22 * sw], [0.06, 0.12, 0.05], black);
        b.cyl([-0.22 * sw, 1.32, 0.22 * sw], 0.008, 0.006, 0.14, black, 8);             // antenna

        // Utility Belt with heavy modeled buckle
        b.box([0, 0.85, 0], [0.58 * sw, 0.08, 0.44 * sw], black);
        b.box([0, 0.85, 0.23 * sw], [0.12, 0.09, 0.03], gold);                          // buckle
        b.box([0, 0.85, 0.24 * sw], [0.07, 0.05, 0.02], black);                         // buckle inner

        // Side canteen & utility pouches on belt
        b.cyl([0.28 * sw, 0.85, 0], 0.06, 0.06, 0.11, darkGrey, 10, true, true);        // canteen
        b.rbox([-0.27 * sw, 0.85, 0], [0.08, 0.11, 0.14], darkGrey, 0.02);             // pouch
        // Compact back tactical pack
        b.rbox([0, 1.12, -0.28 * sw], [0.30 * sw, 0.34, 0.15], dk(s.top2, 0.85), 0.03);
      }
    }),

    head: mk(b => {
      // High-Poly Sculpted Head
      b.sphere([0, 0.27, 0.01], 0.235, s.skin, 16, 1.12, true);                         // cranium & jaw
      b.sphere([0, 0.18, 0.12], 0.11, s.skin, 12, 0.85, true);                          // sculpted chin

      // Facial Features: Cartoon Eyes (white sclera, dark iris, comic highlight)
      for (const sx of [-0.082, 0.082]) {
        // Eye socket contour
        b.sphere([sx, 0.285, 0.19], 0.045, C.white, 10, 0.7, true);                     // eye sclera
        b.sphere([sx, 0.288, 0.218], 0.024, C.dark, 8, 0.7, true);                       // iris / pupil
        b.sphere([sx + 0.008, 0.298, 0.228], 0.009, C.white, 6, 1, true);                // specular glint
        // Expressive comic eyebrows
        b.box([sx, 0.345, 0.21], [0.075, 0.022, 0.02], dk(s.hair, 0.45));
        // Cheekbone blush/contour
        b.sphere([sx * 1.3, 0.23, 0.16], 0.06, lt(s.skin, 0.08), 8, 0.6, true);
      }

      // Sculpted 3D Nose with nostrils
      b.cyl([0, 0.22, 0.22], 0.032, 0.018, 0.075, dk(s.skin, 0.94), 10, true, true);
      b.sphere([0, 0.225, 0.245], 0.032, dk(s.skin, 0.96), 10, 1, true);               // nose tip

      // Cartoon mouth line & jawline
      b.box([0, 0.155, 0.215], [0.08, 0.018, 0.02], dk(s.skin, 0.65));

      // Modeled ears on sides
      for (const sx of [-0.225, 0.225]) {
        b.push(mul(translate(sx, 0.26, 0), rotY(sx > 0 ? 0.3 : -0.3)));
        b.sphere([0, 0, 0], 0.065, s.skin, 8, 1.4, true);
        b.sphere([0, 0, 0.01], 0.04, dk(s.skin, 0.8), 8, 1.2, true);                    // inner ear
        b.pop();
      }

      // High-Poly Hair / Headgear
      if (s.hat === 'blonde') {
        // Jonesy: Signature sweeping layered cartoon blonde hair (matching Image 2 & 3)
        b.sphere([0, 0.32, -0.04], 0.255, s.hair, 16, 1.05, true);                      // hair base
        b.rbox([0, 0.43, 0.08], [0.34, 0.13, 0.28], s.hair, 0.04);                     // top swept mass
        b.rbox([0.05, 0.46, 0.18], [0.22, 0.09, 0.16], lt(s.hair, 0.15), 0.03);        // front wave crest
        b.rbox([-0.08, 0.42, 0.20], [0.14, 0.07, 0.12], s.hair, 0.02);
        // Sideburns
        for (const sx of [-0.20, 0.20]) {
          b.cyl([sx, 0.30, 0.05], 0.04, 0.02, 0.12, s.hair, 8, true, true);
        }
      } else if (s.female && s.hat === 'hair') {
        // Ramirez: Sleek tactical bun & front fringe (matching Image 1)
        b.sphere([0, 0.31, -0.03], 0.255, s.hair, 16, 1.05, true);
        b.sphere([0, 0.36, -0.22], 0.13, s.hair, 14, 1.0, true);                         // high ponytail bun
        b.torus([0, 0.36, -0.16], 0.07, 0.02, C.orange, 12, 6);                           // hairband
        b.rbox([0, 0.39, 0.14], [0.32, 0.06, 0.12], s.hair, 0.02);                      // bangs
      } else if (s.hat === 'beanie') {
        // Skull Trooper / Arctic Ace beanie
        b.sphere([0, 0.32, 0], 0.265, s.hair, 16, 1.08, true, [0, 0.5]);
        b.cyl([0, 0.31, 0], 0.255, 0.265, 0.11, dk(s.hair, 0.85), 18, false, true);
        b.sphere([0, 0.48, -0.02], 0.06, dk(s.hair, 0.7), 10, 1, true);                 // beanie pompom
      } else if (s.hat === 'spiky') {
        b.sphere([0, 0.31, -0.02], 0.255, s.hair, 16, 1.05, true);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2, rr = 0.16;
          b.cyl([Math.cos(a) * rr, 0.44, Math.sin(a) * rr * 0.85 - 0.02], 0.045, 0.015, 0.16, s.hair, 8, true, true);
        }
        b.cyl([0, 0.48, 0], 0.06, 0.02, 0.18, s.hair, 8, true, true);
      } else {
        b.sphere([0, 0.31, -0.02], 0.265, s.hair, 16, 1.08, true);
      }
    }),

    upperArm: mk(b => {
      // Deltoid shoulder cap & arm contour
      b.sphere([0, 0, 0], 0.14 * sw, s.top, 14, 1.1, true);
      b.cyl([0, -0.30, 0], 0.10 * sw, 0.13 * sw, 0.30, s.top, 14, false, true);         // bicep / tricep
      // Rolled sleeve cuff
      b.torus([0, -0.28, 0], 0.11 * sw, 0.022, s.top2, 14, 6);
      if (s.ribs) b.sphere([0, -0.05, 0], 0.16 * sw, s.top, 10, 1, true);
    }),

    foreArm: mk(b => {
      // Sculpted forearm muscle anatomy
      b.sphere([0, 0, 0], 0.105 * sw, s.skin, 12, 1, true);                             // elbow
      b.cyl([0, -0.28, 0], 0.082, 0.10 * sw, 0.28, s.skin, 14, false, true);            // forearm
      // Forearm cloth sweatband / tactical wrap with folds
      b.torus([0, -0.16, 0], 0.092 * sw, 0.022, s.top2, 14, 6);
      b.torus([0, -0.12, 0], 0.094 * sw, 0.022, s.top2, 14, 6);

      // Tactical Combat Glove (wrist guard, knuckles, modeled thumb & fingers)
      b.rbox([0, -0.29, 0.01], [0.12, 0.08, 0.09], black, 0.02);                       // glove cuff
      b.rbox([0, -0.36, 0.01], [0.13, 0.12, 0.08], darkGrey, 0.02);                    // palm / back
      b.rbox([0, -0.34, 0.05], [0.11, 0.03, 0.03], black, 0.01);                       // knuckle armor pad
      // Modeled thumb & curled fingers
      b.cyl([0.06, -0.34, 0.04], 0.022, 0.018, 0.06, s.skin, 8, true, true);            // thumb
      for (let f = -1.5; f <= 1.5; f += 1.0) {
        b.cyl([f * 0.03, -0.42, 0.01], 0.016, 0.014, 0.05, s.skin, 6, true, true);      // fingers
      }
    }),

    thigh: mk(b => {
      // Sculpted Thigh Muscle Contour
      b.sphere([0, 0, 0], 0.145, s.pants, 14, 1.1, true);                               // hip ball
      b.cyl([0, -0.40, 0], 0.125, 0.145, 0.40, s.pants, 16, false, true);               // thigh
      // 3D Outer Cargo Pocket with flap & button
      b.rbox([0.06, -0.22, 0.08], [0.14, 0.16, 0.07], dk(s.pants, 0.85), 0.02);
      b.box([0.06, -0.15, 0.12], [0.14, 0.04, 0.02], dk(s.pants, 0.72));              // pocket flap
    }),

    shin: mk(b => {
      // Knee joint with tactical hard-shell knee pad
      b.sphere([0, 0, 0], 0.125, s.pants, 12, 1, true);
      b.rbox([0.01, -0.03, 0.11], [0.14, 0.15, 0.07], black, 0.025);                   // knee pad plate
      b.box([0.01, -0.03, -0.11], [0.12, 0.10, 0.03], black);                          // knee pad back straps

      // Calf taper into combat boot
      b.cyl([0, -0.30, 0], 0.11, 0.12, 0.30, s.pants, 14, false, true);

      // High-Poly Laced Combat Boot
      b.push(scaleM(1, 1, 1.25));
      b.cyl([0, -0.40, 0.02], 0.128, 0.115, 0.15, s.boots, 16, true, true);            // boot cuff
      b.pop();
      b.rbox([0, -0.36, 0.06], [0.22, 0.12, 0.34], s.boots, 0.03);                     // boot body
      b.box([0, -0.44, 0.06], [0.24, 0.06, 0.38], black);                              // thick tread sole
      // Silver lace eyelets & crossed laces
      for (let k = 0; k < 3; k++) {
        const y = -0.32 - k * 0.04;
        b.box([-0.04, y, 0.17], [0.018, 0.018, 0.01], rgb(0xbbbbbb));
        b.box([0.04, y, 0.17], [0.018, 0.018, 0.01], rgb(0xbbbbbb));
        b.box([0, y, 0.175], [0.08, 0.01, 0.008], rgb(0x888888));                       // lace cross
      }
    }),
  };
}

export type HouseSpec = { w: number; d: number; floors: number; wall: Col; roof: Col; trim: Col; style: number };
export const HOUSE_STYLES: Omit<HouseSpec, 'w' | 'd' | 'floors'>[] = [
  { wall: rgb(0xc4d6e2), roof: rgb(0x4c525c), trim: rgb(0xf8f8f6), style: 0 },
  { wall: rgb(0xb07a68), roof: rgb(0x3d4046), trim: rgb(0xefe9dc), style: 3 },
  { wall: rgb(0xe6e2d2), roof: rgb(0x5a5f68), trim: rgb(0xffffff), style: 0 },
  { wall: rgb(0xa9bcc9), roof: rgb(0x474a52), trim: rgb(0xf6f6f6), style: 0 },
  { wall: rgb(0xcfd8c6), roof: rgb(0x8a4a3c), trim: rgb(0xfaf6ea), style: 0 },
  { wall: rgb(0xd9c9a8), roof: rgb(0x55606e), trim: rgb(0xffffff), style: 0 },
];
export interface LBox { min: V3; max: V3; }
export const FH = 3.6;

/** Hollow house with interior rooms, kitchen, bedrooms, stairs, and porch */
export function house(b: MB, s: HouseSpec): LBox[] {
  const { w, d } = s, H = FH * s.floors, T = 0.3, hw = w / 2, hd = d / 2, boxes: LBox[] = [];
  const solid = (c: V3, sz: V3, col: Col) => {
    b.box(c, sz, col);
    boxes.push({ min: [c[0] - sz[0] / 2, c[1] - sz[1] / 2, c[2] - sz[2] / 2], max: [c[0] + sz[0] / 2, c[1] + sz[1] / 2, c[2] + sz[2] / 2] });
  };

  solid([0, 0.2, 0], [w + 0.5, 0.4, d + 0.5], rgb(0x8a8a86));                         // foundation
  b.box([0, 0.45, 0], [w - 0.2, 0.12, d - 0.2], rgb(0xb8996e));                        // ground floor boards

  for (let f = 0; f < s.floors; f++) {
    const y0 = f * FH, yc = y0 + FH / 2;
    solid([0, yc, -hd + T / 2], [w, FH, T], s.wall);                                    // back wall
    solid([-hw + T / 2, yc, 0], [T, FH, d], s.wall); solid([hw - T / 2, yc, 0], [T, FH, d], s.wall);   // side walls

    if (f === 0) {
      const dw = 1.6, dh = 2.6;
      solid([-(hw + dw / 2) / 2, yc, hd - T / 2], [hw - dw / 2, FH, T], s.wall);
      solid([(hw + dw / 2) / 2, yc, hd - T / 2], [hw - dw / 2, FH, T], s.wall);
      solid([0, y0 + dh + (FH - dh) / 2, hd - T / 2], [dw, FH - dh, T], s.wall);
    } else {
      solid([0, yc, hd - T / 2], [w, FH, T], s.wall);
    }

    // Horizontal siding boards (authentic wooden clapboard)
    for (let yy = y0 + 0.3; yy < y0 + FH - 0.1; yy += 0.35) {
      b.box([0, yy, hd + 0.01], [w, 0.04, 0.025], dk(s.wall, 0.88));
      b.box([0, yy, -hd - 0.01], [w, 0.04, 0.025], dk(s.wall, 0.88));
      b.box([hw + 0.01, yy, 0], [0.025, 0.04, d], dk(s.wall, 0.88));
      b.box([-hw - 0.01, yy, 0], [0.025, 0.04, d], dk(s.wall, 0.88));
    }

    // High-poly windows with glass panes & trim frames
    const win = (x: number, z: number, side: 'z' | 'x') => {
      const y = y0 + 1.95, ww = 1.6, wh = 1.7;
      if (side === 'z') {
        b.box([x, y, z], [ww + 0.28, wh + 0.28, 0.08], s.trim);
        b.box([x, y, z], [ww, wh, 0.03], C.glass);
        b.box([x, y, z + 0.02], [0.07, wh, 0.03], s.trim);                              // vertical mullion
        b.box([x, y, z + 0.02], [ww, 0.07, 0.03], s.trim);                              // horizontal transom
        b.box([x, y - wh / 2 - 0.08, z + Math.sign(z) * 0.14], [ww + 0.4, 0.12, 0.26], s.trim); // sill
      } else {
        b.box([x, y, z], [0.08, wh + 0.28, ww + 0.28], s.trim);
        b.box([x, y, z], [0.03, wh, ww], C.glass);
        b.box([x + 0.02, y, z], [0.03, wh, 0.07], s.trim);
        b.box([x + 0.02, y, z], [0.03, 0.07, ww], s.trim);
      }
    };

    const nx = Math.max(2, Math.round(w / 4));
    for (let i = 0; i < nx; i++) {
      const x = -hw + (i + 0.5) * (w / nx);
      if (!(f === 0 && Math.abs(x) < 1.6)) win(x, hd - T / 2, 'z');
      win(x, -hd + T / 2, 'z');
    }
    for (const z of [-d * 0.25, d * 0.25]) {
      win(-hw + T / 2, z, 'x'); win(hw - T / 2, z, 'x');
    }

    // Upper floor & stairs
    if (f > 0) {
      const sx0 = -hw + T, sx1 = -hw + T + 1.5;
      solid([(sx1 + hw - T) / 2, y0 + 0.1, 0], [hw - T - sx1, 0.25, d - 2 * T], rgb(0xb8996e));
      solid([(sx0 + sx1) / 2, y0 + 0.1, (3.2 + hd - T) / 2], [sx1 - sx0, 0.25, hd - T - 3.2], rgb(0xb8996e));
      solid([(sx0 + sx1) / 2, y0 + 0.1, -(3.2 + hd - T) / 2], [sx1 - sx0, 0.25, hd - T - 3.2], rgb(0xb8996e));
      // Railing with banister
      b.box([(sx0 + sx1) / 2 + 0.75, y0 + 0.7, 0], [0.08, 0.9, 6.4], rgb(0x5a4a3a));
      for (let st = 0; st < 8; st++) {
        const yy = y0 - FH + (st + 1) * (FH / 8);
        solid([(sx0 + sx1) / 2, yy - 0.12, 3.2 - (st + 0.5) * 0.8], [sx1 - sx0, 0.24, 0.8], rgb(0xa88a60));
      }
    }

    // Interior furniture
    if (f === 0) {
      // Kitchen counter with sink & faucet
      solid([hw * 0.55, 0.5, hd * 0.35], [2.6, 0.95, 0.8], rgb(0xdedad0));
      b.box([hw * 0.55, 1.0, hd * 0.35], [2.7, 0.08, 0.85], rgb(0x3a3a40));             // countertop
      b.cyl([hw * 0.55, 1.08, hd * 0.35], 0.015, 0.015, 0.14, rgb(0xdddddd), 8);        // faucet
      // Living room sofa with cushions
      solid([-hw * 0.45, 0.45, hd * 0.35], [2.4, 0.85, 1.0], rgb(0x3b6699));
      b.rbox([-hw * 0.45, 0.95, hd * 0.35 + 0.4], [2.4, 0.6, 0.28], rgb(0x2f5280), 0.05); // sofa back
      // Coffee table
      b.rbox([-hw * 0.45, 0.3, hd * 0.35 - 0.9], [1.6, 0.08, 0.8], rgb(0x7a5a3a), 0.02);
    } else {
      // Bedroom double bed with mattress, pillows, headboard
      solid([hw * 0.45, y0 + 0.4, -hd * 0.3], [2.2, 0.65, 2.6], rgb(0xc5cdd8));         // mattress
      b.box([hw * 0.45, y0 + 0.76, -hd * 0.3 - 1.0], [1.8, 0.16, 0.6], rgb(0xffffff));   // pillows
      b.rbox([hw * 0.45, y0 + 0.9, -hd * 0.3 - 1.35], [2.2, 0.9, 0.12], rgb(0x6e4e30), 0.03); // headboard
    }
  }

  // Gable roof with overhangs and shingles
  const rh = d * 0.44, ov = 0.6, rc = s.roof;
  b.quad([-hw - ov, H, -hd - ov], [-hw - ov, H + rh, 0], [hw + ov, H + rh, 0], [hw + ov, H, -hd - ov], rc);
  b.quad([hw + ov, H, hd + ov], [hw + ov, H + rh, 0], [-hw - ov, H + rh, 0], [-hw - ov, H, hd + ov], rc);
  b.tri([hw, H, -hd], [hw, H + rh, 0], [hw, H, hd], s.wall);
  b.tri([-hw, H, hd], [-hw, H + rh, 0], [-hw, H, -hd], s.wall);
  b.box([0, H + 0.05, 0], [w, 0.1, d], rgb(0x7a6a5a));                                  // ceiling cap
  b.rbox([hw * 0.4, H + rh * 0.7, -hd * 0.2], [0.95, rh * 1.3, 0.95], rgb(0x8a483a), 0.04); // brick chimney

  // Front Porch with roof and pillars
  b.box([0, 1.3, hd - T / 2], [1.4, 2.5, 0.09], rgb(0x2d436b));                         // front door
  b.sphere([0.5, 1.25, hd + 0.02], 0.04, C.gold, 8, 1, true);                            // door knob
  b.rbox([0, 3.15, hd + 1.1], [3.4, 0.18, 2.2], s.roof, 0.03);                          // porch roof
  for (const x of [-1.5, 1.5]) solid([x, 1.55, hd + 2.0], [0.18, 3.1, 0.18], s.trim);     // porch pillars
  solid([0, 0.2, hd + 1.2], [3.2, 0.4, 1.8], rgb(0xb0b0aa));                             // porch floor
  solid([0, 0.1, hd + 2.4], [3.2, 0.2, 0.7], rgb(0xb0b0aa));                             // steps

  for (let k = 0; k < 4; k++) {
    const t0 = k / 4, t1 = (k + 1) / 4;
    boxes.push({ min: [-hw - ov, H + rh * t0, -(hd + ov) * (1 - t0)], max: [hw + ov, H + rh * t1, (hd + ov) * (1 - t0)] });
  }
  return boxes;
}

export interface Models { [k: string]: Mesh; }

/** Edited pieces with tiles removed by edit mask */
export function editedPiece(r: Renderer, type: 'wall' | 'floor', mat: string, mask: number): Mesh {
  const b = new MB();
  const c = mat === 'metal' ? C.metal : mat === 'stone' ? C.stone : C.wood;
  const c2 = mat === 'metal' ? C.metalDark : mat === 'stone' ? C.stoneDark : C.woodDark;

  if (type === 'wall') {
    const T = 4 / 3;
    for (let i = 0; i < 9; i++) {
      if (mask & (1 << i)) continue;
      const row = Math.floor(i / 3), col = i % 3;
      b.plank([-2 + (col + 0.5) * T, (row + 0.5) * T, 0], [T * 0.98, T * 0.98, 0.22], c, 0.02);
    }
    for (let i = 0; i < 9; i++) {
      if (!(mask & (1 << i))) continue;
      const row = Math.floor(i / 3), col = i % 3, x = -2 + (col + 0.5) * T, y = (row + 0.5) * T;
      const nb = (j: number) => j < 0 || j > 8 || (mask & (1 << j));
      if (!nb(i + 3) || row === 2) b.rbox([x, y + T / 2, 0], [T, 0.12, 0.28], c2, 0.02);
      if (!nb(i - 3) || row === 0) b.rbox([x, y - T / 2, 0], [T, 0.12, 0.28], c2, 0.02);
      if (col < 2 && !nb(i + 1)) b.rbox([x + T / 2, y, 0], [0.12, T, 0.28], c2, 0.02);
      if (col > 0 && !nb(i - 1)) b.rbox([x - T / 2, y, 0], [0.12, T, 0.28], c2, 0.02);
    }
  } else {
    for (let i = 0; i < 4; i++) {
      if (mask & (1 << i)) continue;
      const cx = i % 2 ? 1 : -1, cz = i > 1 ? 1 : -1;
      b.plank([cx, -0.12, cz], [1.96, 0.24, 1.96], c, 0.02);
    }
  }
  return b.build(r);
}

/** Build all high-poly game models, weapons, build pieces, and props */
export function buildModels(r: Renderer): Models {
  const M: Models = {};
  const mk = (f: (b: MB) => void) => { const b = new MB(); f(b); return b.build(r); };

  // ==================== HIGH-POLY WEAPONS ====================
  // Pickaxe: Steel pick head with beveled edges and taped wooden shaft
  M.pickaxe = mk(b => {
    b.cyl([0, 0, 0], 0.032, 0.028, 0.95, rgb(0x654a32), 12, true, true);                // haft
    // Grip wrap
    for (let i = 0; i < 6; i++) {
      b.torus([0, 0.15 + i * 0.04, 0], 0.034, 0.008, C.dark, 12, 6);
    }
    // Hardened steel pick head (curved double point)
    b.rbox([0, 0.92, 0], [0.24, 0.14, 0.14], rgb(0x42464e), 0.02);                      // central collar
    b.box([0, 0.92, 0.07], [0.12, 0.08, 0.03], C.gold);                                 // emblem
    // Pick horns (arched)
    for (const sx of [-1, 1]) {
      b.push(mul(translate(sx * 0.22, 0.90, 0), rotZ(sx * -0.25)));
      b.cyl([0, 0, 0], 0.065, 0.025, 0.32, rgb(0x9fa8b4), 8, true, true);
      b.cyl([0, 0.30, 0], 0.025, 0.005, 0.14, rgb(0xd0d8e2), 6, true, true);           // chisel tip
      b.pop();
    }
  });

  // Assault Rifle (SCAR / M4 tactical style with rails and magazine)
  const gunMetal = rgb(0x28292d), steelGrey = rgb(0x656d78), tanReceiver = rgb(0xd4ad68);
  M.ar = mk(b => {
    b.rbox([0, 0, 0.12], [0.10, 0.16, 0.72], tanReceiver, 0.025);                       // receiver
    b.box([0, 0.09, 0.18], [0.055, 0.035, 0.58], gunMetal);                             // picatinny rail
    b.cyl([0, 0.02, 0.85], 0.026, 0.026, 0.42, gunMetal, 12, true, true);               // barrel
    b.cyl([0, 0.02, 1.25], 0.035, 0.035, 0.08, steelGrey, 8, true, true);               // flash hider
    // Front and rear iron sights
    b.box([0, 0.08, 1.0], [0.03, 0.08, 0.05], gunMetal);
    b.box([0, 0.12, 0.12], [0.04, 0.06, 0.04], gunMetal);
    // Ergonomic pistol grip
    b.push(mul(translate(0, -0.16, -0.04), rotX(0.35)));
    b.rbox([0, 0, 0], [0.065, 0.20, 0.09], gunMetal, 0.02);
    b.pop();
    // Curved 30-round magazine with grip ribs
    b.push(mul(translate(0, -0.22, 0.22), rotX(0.25)));
    b.rbox([0, 0, 0], [0.065, 0.30, 0.11], gunMetal, 0.015);
    for (let i = -1; i <= 1; i++) b.box([0, i * 0.07, 0.06], [0.068, 0.02, 0.015], tanReceiver);
    b.pop();
    // Tactical stock with recoil pad
    b.rbox([0, -0.01, -0.34], [0.075, 0.13, 0.34], tanReceiver, 0.02);
    b.rbox([0, -0.06, -0.51], [0.075, 0.17, 0.06], gunMetal, 0.015);
  });

  // Burst Rifle
  M.burst = mk(b => {
    b.rbox([0, 0, 0.12], [0.095, 0.15, 0.72], rgb(0x8a907e), 0.025);
    b.cyl([0, 0.02, 0.85], 0.028, 0.028, 0.36, gunMetal, 12, true, true);
    b.rbox([0, -0.16, -0.04], [0.065, 0.20, 0.09], gunMetal, 0.02);
    b.rbox([0, -0.22, 0.20], [0.065, 0.28, 0.11], gunMetal, 0.02);
    b.rbox([0, -0.01, -0.34], [0.075, 0.13, 0.32], rgb(0x8a907e), 0.02);
    b.box([0, 0.12, 0.14], [0.05, 0.07, 0.32], gunMetal);
  });

  // Pump Shotgun
  M.shotgun = mk(b => {
    b.rbox([0, 0, -0.05], [0.095, 0.14, 0.46], gunMetal, 0.02);                        // receiver
    b.cyl([0, 0.035, 0.16], 0.032, 0.032, 0.85, gunMetal, 12, true, true);              // upper barrel
    b.cyl([0, -0.042, 0.16], 0.030, 0.030, 0.60, steelGrey, 12, true, true);            // mag tube
    // Ribbed sliding pump forend with grooves
    b.rbox([0, -0.042, 0.48], [0.095, 0.095, 0.24], rgb(0x6e4a2e), 0.02);
    for (let i = 0; i < 5; i++) b.box([0, -0.042, 0.40 + i * 0.04], [0.10, 0.10, 0.012], rgb(0x452d1b));
    // Classic contoured stock with recoil buttpad
    b.push(mul(translate(0, -0.08, -0.22), rotX(0.2)));
    b.rbox([0, 0, 0], [0.075, 0.14, 0.18], rgb(0x6e4a2e), 0.02);
    b.pop();
    b.rbox([0, -0.05, -0.42], [0.08, 0.16, 0.32], rgb(0x6e4a2e), 0.025);
    b.box([0, -0.05, -0.58], [0.082, 0.17, 0.04], gunMetal);
  });

  // Bolt-Action Sniper Rifle with Multi-Ring Telescopic Scope
  M.sniper = mk(b => {
    b.rbox([0, 0, 0.05], [0.085, 0.14, 0.68], rgb(0x5a5646), 0.025);
    b.cyl([0, 0.02, 0.38], 0.032, 0.028, 1.15, gunMetal, 14, true, true);               // long barrel
    b.box([0, 0.02, 1.54], [0.09, 0.06, 0.14], gunMetal);                               // massive muzzle brake
    // Telescopic Scope
    b.cyl([0, 0.15, -0.08], 0.05, 0.05, 0.46, gunMetal, 16, true, true);
    b.cyl([0, 0.15, -0.16], 0.06, 0.05, 0.10, gunMetal, 16, true, true);                // ocular bell
    b.cyl([0, 0.15, 0.36], 0.05, 0.065, 0.12, gunMetal, 16, true, true);                // objective bell
    b.sphere([0, 0.15, 0.46], 0.055, C.holographic, 12, 0.3, true);                     // front glass lens
    // Scope mounting rings
    b.box([0, 0.08, -0.02], [0.04, 0.06, 0.06], steelGrey);
    b.box([0, 0.08, 0.22], [0.04, 0.06, 0.06], steelGrey);
    // Bolt action handle with round knob
    b.box([0.08, 0.04, -0.04], [0.09, 0.03, 0.03], steelGrey);
    b.sphere([0.13, 0.04, -0.04], 0.035, gunMetal, 8, 1, true);
    // Stock with cheek rest
    b.rbox([0, -0.02, -0.42], [0.075, 0.16, 0.38], rgb(0x5a5646), 0.02);
    b.box([0, 0.07, -0.38], [0.076, 0.05, 0.18], gunMetal);                             // cheek riser
  });

  // Pistol
  M.pistol = mk(b => {
    b.rbox([0, 0.02, 0.06], [0.07, 0.10, 0.34], gunMetal, 0.015);                      // slide
    b.cyl([0, 0.02, 0.26], 0.018, 0.018, 0.1, steelGrey, 10, true, true);
    b.push(mul(translate(0, -0.11, -0.06), rotX(0.3))); b.rbox([0, 0, 0], [0.06, 0.2, 0.08], rgb(0x3a2e24), 0.015); b.pop();
    b.box([0, -0.04, 0.02], [0.03, 0.05, 0.06], gunMetal);                             // trigger guard
    for (let i = 0; i < 4; i++) b.box([0.036, 0.04, -0.06 + i * 0.03], [0.004, 0.06, 0.012], steelGrey);   // slide serrations
  });
  // Tactical Shotgun (semi-auto, drum-free, short)
  M.tac = mk(b => {
    b.rbox([0, 0, -0.02], [0.1, 0.15, 0.5], rgb(0x2f3438), 0.02);
    b.cyl([0, 0.035, 0.2], 0.03, 0.03, 0.7, gunMetal, 12, true, true);
    b.cyl([0, -0.04, 0.2], 0.03, 0.03, 0.6, steelGrey, 12, true, true);
    b.rbox([0, -0.04, 0.42], [0.1, 0.1, 0.3], rgb(0x2f3438), 0.02);
    for (let i = 0; i < 6; i++) b.box([0, 0.1, 0.05 + i * 0.05], [0.05, 0.03, 0.02], gunMetal);   // rail
    b.push(mul(translate(0, -0.16, -0.06), rotX(0.35))); b.rbox([0, 0, 0], [0.065, 0.2, 0.09], gunMetal, 0.02); b.pop();
    b.rbox([0, -0.02, -0.4], [0.075, 0.14, 0.3], rgb(0x2f3438), 0.02);
    b.rbox([0, -0.06, -0.56], [0.078, 0.17, 0.05], C.orange, 0.01);                     // orange pad
  });
  // Hunting Rifle (no scope, wooden)
  M.hunting = mk(b => {
    const wood = rgb(0x6e4a2e);
    b.rbox([0, -0.02, -0.1], [0.08, 0.14, 0.9], wood, 0.025);
    b.cyl([0, 0.03, 0.5], 0.026, 0.024, 1.0, gunMetal, 12, true, true);
    b.box([0, 0.09, 0.95], [0.02, 0.06, 0.03], gunMetal); b.box([0, 0.1, -0.1], [0.06, 0.05, 0.03], gunMetal);   // sights
    b.box([0.07, 0.04, -0.06], [0.08, 0.03, 0.03], steelGrey); b.sphere([0.12, 0.04, -0.06], 0.03, gunMetal, 8, 1, true);
    b.rbox([0, -0.05, -0.55], [0.075, 0.17, 0.3], wood, 0.02); b.box([0, -0.05, -0.7], [0.08, 0.18, 0.04], gunMetal);
    b.box([0, -0.09, 0.1], [0.05, 0.05, 0.14], gunMetal);                               // internal mag
  });
  // SCAR (legendary AR: gold accents)
  M.scar = mk(b => {
    b.rbox([0, 0, 0.12], [0.1, 0.16, 0.72], rgb(0xb8a15a), 0.025);
    b.box([0, 0.09, 0.18], [0.055, 0.035, 0.58], gunMetal);
    b.cyl([0, 0.02, 0.85], 0.028, 0.028, 0.45, gunMetal, 12, true, true); b.cyl([0, 0.02, 1.28], 0.04, 0.04, 0.1, C.gold, 8, true, true);
    b.box([0, 0.14, 0.1], [0.05, 0.06, 0.2], gunMetal); b.box([0, 0.14, 0.1], [0.03, 0.03, 0.14], C.holographic);   // holo sight
    b.push(mul(translate(0, -0.16, -0.04), rotX(0.35))); b.rbox([0, 0, 0], [0.065, 0.2, 0.09], gunMetal, 0.02); b.pop();
    b.push(mul(translate(0, -0.22, 0.22), rotX(0.25))); b.rbox([0, 0, 0], [0.065, 0.3, 0.11], rgb(0xb8a15a), 0.015); b.pop();
    b.rbox([0, -0.01, -0.34], [0.075, 0.13, 0.34], rgb(0xb8a15a), 0.02); b.rbox([0, -0.06, -0.51], [0.075, 0.17, 0.06], gunMetal, 0.015);
  });
  // consumables: mini shield, chug jug
  M.miniShield = mk(b => { b.cyl([0, 0.02, 0], 0.09, 0.1, 0.22, rgb(0x3aa2ff), 12, true, true); b.cyl([0, 0.26, 0], 0.05, 0.05, 0.06, C.white, 10, true, true); b.box([0, 0.14, 0.1], [0.1, 0.08, 0.01], C.white); });
  M.grenade = mk(b => { b.sphere([0, 0.15, 0], 0.14, rgb(0x4a6a3a), 10, 1.2, true); b.cyl([0, 0.3, 0], 0.05, 0.05, 0.08, rgb(0x888888), 8, true, true); b.box([0.06, 0.34, 0], [0.12, 0.02, 0.03], rgb(0xcccccc)); for (let k = 0; k < 3; k++) b.torus([0, 0.08 + k * 0.07, 0], 0.14, 0.008, rgb(0x2e4a26), 10, 4); });
  M.chug = mk(b => { b.cyl([0, 0, 0], 0.2, 0.22, 0.55, rgb(0x3aa2ff), 14, true, true); b.torus([0, 0.35, 0.22], 0.08, 0.025, rgb(0x2c6fb0), 12, 6); b.cyl([0, 0.55, 0], 0.09, 0.09, 0.08, rgb(0x2c6fb0), 10, true, true); b.box([0, 0.28, 0.21], [0.22, 0.18, 0.01], C.white); });

  // Submachine Gun
  M.smg = mk(b => {
    b.rbox([0, 0, 0.10], [0.085, 0.14, 0.46], gunMetal, 0.02);
    b.cyl([0, 0.02, 0.32], 0.026, 0.026, 0.28, gunMetal, 10, true, true);
    b.rbox([0, -0.16, 0.04], [0.065, 0.22, 0.08], gunMetal, 0.02);
    b.rbox([0, -0.22, 0.16], [0.055, 0.26, 0.08], steelGrey, 0.015);                   // mag
    b.box([0, 0.08, -0.24], [0.04, 0.07, 0.22], steelGrey);                             // wire stock
  });

  // Consumables & Items
  M.fish = mk(b => {
    b.sphere([0, 0.3, 0], 0.52, rgb(0x3882e8), 14, 0.65, true);
    b.tri([0, 0.3, -0.45], [0, 0.60, -0.88], [0, 0.02, -0.88], rgb(0x3882e8));
    b.sphere([0.16, 0.36, 0.26], 0.05, C.white, 8, 1, true);
    b.sphere([0.18, 0.37, 0.28], 0.025, C.dark, 6, 1, true);
    b.sphere([-0.16, 0.36, 0.26], 0.05, C.white, 8, 1, true);
    b.sphere([-0.18, 0.37, 0.28], 0.025, C.dark, 6, 1, true);
  });
  M.rod = mk(b => {
    b.push(rotX(-0.6));
    b.cyl([0, 0, 0], 0.024, 0.012, 1.7, rgb(0xd0aa6f), 8, true, true);
    b.cyl([0.06, 0.35, 0], 0.05, 0.05, 0.06, steelGrey, 10, true, true);                // reel
    b.pop();
  });
  M.shieldPot = mk(b => {
    b.cyl([0, 0, 0], 0.13, 0.13, 0.32, C.blue, 14, true, true);
    b.cyl([0, 0.32, 0], 0.05, 0.05, 0.09, C.white, 10, true, true);
    b.torus([0, 0.38, 0], 0.055, 0.015, rgb(0x9d7a52), 12, 6);                         // cork
  });
  M.medkit = mk(b => {
    b.rbox([0, 0.14, 0], [0.42, 0.26, 0.32], C.white, 0.04);
    b.box([0, 0.28, 0], [0.22, 0.04, 0.06], C.red);
    b.box([0, 0.28, 0], [0.06, 0.04, 0.22], C.red);
    b.rbox([0, 0.28, 0.17], [0.14, 0.08, 0.04], C.dark, 0.01);                         // handle
  });
  M.bandage = mk(b => {
    b.cyl([0, 0, 0], 0.15, 0.15, 0.13, C.white, 14, true, true);
    b.box([0, 0.065, 0], [0.32, 0.14, 0.06], C.red);
  });
  M.ammo = mk(b => {
    b.rbox([0, 0.11, 0], [0.32, 0.22, 0.22], rgb(0x427d35), 0.02);
    b.box([0, 0.23, 0], [0.34, 0.035, 0.24], C.dark);
    b.box([0, 0.14, 0.115], [0.08, 0.05, 0.02], C.gold);                               // clasp
  });
  M.tracer = mk(b => b.box([0, 0, 0.5], [0.035, 0.035, 1], rgb(0xffea85)));

  // ==================== ALL-NEW HIGH-POLY BUILD PIECES ====================
  // Authentic Fortnite Chapter 1 building pieces:
  // - Wood: Stud framing, diagonal braces, 8 horizontal overlapping wooden planks
  // - Stone: Masonry ashlar blocks with mortar seams
  // - Metal: Corrugated steel sheet with riveted structural I-beams

  // --- WOOD WALL ---
  M['wall_wood'] = mk(b => {
    const plankCol = C.wood, frameCol = C.woodDark;
    // 4 vertical structural studs
    for (const x of [-1.9, -0.65, 0.65, 1.9]) {
      b.box([x, 2, 0.08], [0.14, 4.0, 0.14], frameCol);
    }
    // Top and bottom plates
    b.box([0, 0.07, 0.08], [4.0, 0.14, 0.14], frameCol);
    b.box([0, 3.93, 0.08], [4.0, 0.14, 0.14], frameCol);
    // Diagonal structural cross-bracing
    b.push(mul(translate(0, 2, 0.08), rotZ(0.785)));
    b.box([0, 0, 0], [0.12, 5.4, 0.12], frameCol);
    b.pop();
    // 8 Individual Horizontal Planks with bevels and end cuts
    for (let i = 0; i < 8; i++) {
      const y = 0.25 + i * 0.50;
      b.plank([0, y, -0.04], [3.96, 0.46, 0.10], plankCol, 0.02);
      // Modeled nail heads on studs
      for (const x of [-1.9, -0.65, 0.65, 1.9]) {
        b.sphere([x, y, 0.02], 0.015, rgb(0x444444), 6, 1, true);
      }
    }
  });

  // --- WOOD RAMP ---
  M['ramp_wood'] = mk(b => {
    const plankCol = C.wood, frameCol = C.woodDark;
    // Two angled heavy timber stringers
    for (const x of [-1.9, 1.9]) {
      b.push(mul(translate(x, 2, 0), rotX(-0.785)));
      b.box([0, 0, -0.10], [0.16, 5.66, 0.18], frameCol);
      b.pop();
    }
    // Vertical support posts at back
    b.box([-1.9, 2, 1.9], [0.15, 4.0, 0.15], frameCol);
    b.box([1.9, 2, 1.9], [0.15, 4.0, 0.15], frameCol);
    // 8 individual step-by-step planked stair treads
    for (let i = 0; i < 8; i++) {
      const z = -1.75 + i * 0.50, y = 0.25 + i * 0.50;
      b.plank([0, y, z], [3.92, 0.08, 0.52], plankCol, 0.02);                             // stair tread
      b.box([0, y - 0.22, z + 0.24], [3.90, 0.44, 0.06], frameCol);                      // stair riser
    }
  });

  // --- WOOD FLOOR ---
  M['floor_wood'] = mk(b => {
    const plankCol = C.wood, frameCol = C.woodDark;
    // Perimeter and cross joists underneath
    for (const x of [-1.9, 0, 1.9]) b.box([x, -0.18, 0], [0.15, 0.22, 4.0], frameCol);
    for (const z of [-1.9, 1.9]) b.box([0, -0.18, z], [4.0, 0.22, 0.15], frameCol);
    // 8 Individual floorboards
    for (let i = 0; i < 8; i++) {
      const z = -1.75 + i * 0.50;
      b.plank([0, -0.04, z], [3.96, 0.08, 0.48], plankCol, 0.02);
    }
  });

  // --- WOOD PYRAMID ---
  M['pyramid_wood'] = mk(b => {
    const top: V3 = [0, 2, 0], a: V3 = [-2, 0, -2], bb: V3 = [2, 0, -2], cc: V3 = [2, 0, 2], d: V3 = [-2, 0, 2];
    b.tri(a, top, bb, C.wood); b.tri(bb, top, cc, C.wood);
    b.tri(cc, top, d, C.wood); b.tri(d, top, a, C.wood);
    b.quad(a, bb, cc, d, C.woodDark);
    for (const pt of [a, bb, cc, d]) {
      b.push(mul(translate(pt[0] * 0.5, 1, pt[2] * 0.5), rotY(Math.atan2(pt[0], pt[2]))));
      b.box([0, 0, 0], [0.14, 2.8, 0.14], C.woodDark);
      b.pop();
    }
  });

  // --- STONE BUILDS ---
  M['wall_stone'] = mk(b => {
    b.box([0, 2, 0], [4.0, 4.0, 0.26], C.stone);
    for (let r = 0; r < 8; r++) {
      const y = 0.25 + r * 0.50, off = (r % 2) * 0.4;
      b.box([0, y, 0.14], [4.0, 0.03, 0.02], C.stoneDark);                               // mortar line
      for (let x = -1.6 + off; x <= 1.8; x += 0.8) {
        b.box([x, y, 0.14], [0.03, 0.46, 0.02], C.stoneDark);                             // vertical mortar
      }
    }
    // Corner reinforcement quoins
    for (const sx of [-1.92, 1.92]) b.box([sx, 2, 0], [0.18, 4.0, 0.32], C.stoneLight);
  });
  M['ramp_stone'] = mk(b => {
    b.quad([-2, 0, -2], [-2, 4, 2], [2, 4, 2], [2, 0, -2], C.stone);
    b.quad([2, -0.25, -2], [2, 3.75, 2], [-2, 3.75, 2], [-2, -0.25, -2], C.stoneDark);
    for (let i = 0; i < 8; i++) {
      const z = -1.75 + i * 0.50, y = 0.25 + i * 0.50;
      b.box([0, y, z], [3.96, 0.10, 0.50], C.stoneLight);
    }
  });
  M['floor_stone'] = mk(b => {
    b.box([0, -0.12, 0], [4.0, 0.24, 4.0], C.stone);
    b.box([0, -0.12, 1.95], [4.0, 0.26, 0.1], C.stoneDark);
    b.box([0, -0.12, -1.95], [4.0, 0.26, 0.1], C.stoneDark);
  });
  M['pyramid_stone'] = mk(b => {
    const top: V3 = [0, 2, 0], a: V3 = [-2, 0, -2], bb: V3 = [2, 0, -2], cc: V3 = [2, 0, 2], d: V3 = [-2, 0, 2];
    b.tri(a, top, bb, C.stone); b.tri(bb, top, cc, C.stone);
    b.tri(cc, top, d, C.stone); b.tri(d, top, a, C.stone);
    b.quad(a, bb, cc, d, C.stoneDark);
  });

  // --- METAL BUILDS ---
  M['wall_metal'] = mk(b => {
    b.box([0, 2, 0], [4.0, 4.0, 0.12], C.metal);
    // Steel I-beam frame
    for (const sx of [-1.92, 1.92]) b.box([sx, 2, 0], [0.16, 4.0, 0.24], C.metalDark);
    b.box([0, 0.08, 0], [4.0, 0.16, 0.24], C.metalDark);
    b.box([0, 3.92, 0], [4.0, 0.16, 0.24], C.metalDark);
    // Corrugated iron ribs
    for (let x = -1.7; x <= 1.7; x += 0.22) {
      b.cyl([x, 2, 0.07], 0.045, 0.045, 3.8, C.metalLight, 8, false, true);
    }
  });
  M['ramp_metal'] = mk(b => {
    b.quad([-2, 0, -2], [-2, 4, 2], [2, 4, 2], [2, 0, -2], C.metal);
    for (const sx of [-1.9, 1.9]) {
      b.push(mul(translate(sx, 2, 0), rotX(-0.785)));
      b.box([0, 0, 0], [0.18, 5.66, 0.18], C.metalDark);
      b.pop();
    }
    for (let i = 0; i < 8; i++) {
      const z = -1.75 + i * 0.50, y = 0.25 + i * 0.50;
      b.box([0, y, z], [3.9, 0.08, 0.48], C.metalLight);
    }
  });
  M['floor_metal'] = mk(b => {
    b.box([0, -0.12, 0], [4.0, 0.24, 4.0], C.metal);
    for (const x of [-1.9, 0, 1.9]) b.box([x, -0.14, 0], [0.16, 0.26, 4.0], C.metalDark);
  });
  M['pyramid_metal'] = mk(b => {
    const top: V3 = [0, 2, 0], a: V3 = [-2, 0, -2], bb: V3 = [2, 0, -2], cc: V3 = [2, 0, 2], d: V3 = [-2, 0, 2];
    b.tri(a, top, bb, C.metal); b.tri(bb, top, cc, C.metal);
    b.tri(cc, top, d, C.metal); b.tri(d, top, a, C.metal);
    b.quad(a, bb, cc, d, C.metalDark);
  });

  // ==================== HIGH-POLY VEGETATION & NATURE ====================
  // Pine Tree: Layered conical conifer with textured needle fronds (matching Image 1 & 3)
  M.pine = mk(b => {
    b.cyl([0, 0, 0], 0.38, 0.14, 8.4, C.trunk, 12, true, true);                         // tapered trunk
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; b.push(mul(translate(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3), rotY(a))); b.cyl([0, 0, 0], 0.14, 0.04, 0.7, C.trunkDark, 8, true, true); b.pop(); }
    // stacked needle tiers: each tier is a slightly scalloped cone (lobed by 8 overlapping sub-cones) with a lighter tip band
    const tiers = 6;
    for (let i = 0; i < tiers; i++) {
      const y = 1.3 + i * 1.15, rB = 3.1 - i * 0.45, h = 1.9, col = i % 2 ? C.pine2 : C.pine;
      b.cyl([0, y, 0], rB, 0.15, h, col, 18, false, true);
      for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283 + i * 0.4, rr = rB * 0.55; b.cyl([Math.cos(a) * rr, y - 0.15, Math.sin(a) * rr], rB * 0.5, 0.05, h * 0.7, dk(col, 0.92), 8, false, true); }
      b.cyl([0, y + h * 0.55, 0], rB * 0.45, 0.1, h * 0.45, lt(col, 0.12), 12, false, true);   // sunlit tip
    }
    b.cyl([0, 8.0, 0], 0.55, 0.04, 1.3, lt(C.pine, 0.1), 10, true, true);              // crown
  });

  // Oak Tree: Smooth organic trunk splitting into lush cartoon leaf boughs (Image 1 & 2)
  M.tree = mk(b => {
    b.cyl([0, 0, 0], 0.5, 0.34, 3.8, C.trunk, 14, true, true);
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; b.cyl([Math.cos(a) * 0.45, 0.12, Math.sin(a) * 0.45], 0.2, 0.05, 0.5, C.trunkDark, 8, true, true); }   // root flare
    for (let i = 0; i < 5; i++) {   // boughs
      const a = (i / 5) * Math.PI * 2;
      b.push(mul(translate(Math.cos(a) * 0.22, 2.7 + (i % 2) * 0.4, Math.sin(a) * 0.22), mul(rotY(a), rotX(0.95))));
      b.cyl([0, 0, 0], 0.18, 0.07, 2.3, C.trunk, 10, true, true);
      b.pop();
    }
    // lumpy multi-lobe canopy: big core + ring of lobes + second smaller ring + crown, each lobe slightly squashed
    b.sphere([0, 5.1, 0], 2.5, C.leaf, 16, 0.8, true);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, rr = 1.9; b.sphere([Math.cos(a) * rr, 4.5 + (i % 2) * 0.7, Math.sin(a) * rr], 1.35 + (i % 3) * 0.15, i % 2 ? C.leaf2 : C.leaf3, 12, 0.88, true); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.5, rr = 1.3; b.sphere([Math.cos(a) * rr, 6.2, Math.sin(a) * rr], 1.1, i % 2 ? C.leaf : C.leaf3, 12, 0.85, true); }
    b.sphere([0.3, 6.9, 0.2], 1.4, lt(C.leaf, 0.18), 12, 0.8, true);                     // sunlit crown
    b.sphere([-1.2, 3.9, 1.4], 0.9, dk(C.leaf2, 0.85), 10, 0.9, true);                   // shaded underside lobe
  });

  M.tree2 = mk(b => {
    b.cyl([0, 0, 0], 0.36, 0.26, 2.8, C.trunk, 12, true, true);
    b.sphere([0, 3.8, 0], 2.0, C.leaf2, 12, 0.75, true);
    b.sphere([1.1, 3.6, 0.6], 1.3, C.leaf, 10, 0.85, true);
    b.sphere([-1.0, 4.0, -0.5], 1.2, C.leaf3, 10, 0.85, true);
  });

  // Boulders with faceted bevels
  M.rock = mk(b => {
    b.sphere([0, 0.4, 0], 1.6, C.rock, 10, 0.7, true);
    b.sphere([0.9, 0.3, 0.6], 1.0, C.rockDark, 8, 0.8, true);
    b.sphere([-0.7, 0.35, -0.5], 0.8, C.rock, 8, 0.75, true);
    b.sphere([0, 1.2, 0], 0.8, lt(C.leaf2, 0.1), 8, 0.3, true);                         // moss cap
  });

  M.bush = mk(b => {
    b.sphere([0, 0.45, 0], 1.0, C.leaf2, 10, 0.75, true);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.sphere([Math.cos(a) * 0.6, 0.35, Math.sin(a) * 0.6], 0.65, i % 2 ? C.leaf : C.leaf3, 8, 0.8, true);
    }
  });

  M.hedge = mk(b => {
    b.rbox([0, 0.7, 0], [4.0, 1.4, 0.9], rgb(0x388f34), 0.12);
  });

  // ==================== ALL-NEW TOWN & MAP PROPS ====================
  // Water Tower (Iconic landmark featured in Image 3)
  M.waterTower = mk(b => {
    const steel = rgb(0x5a636e), tankCol = rgb(0x8f9aa6), roofCol = rgb(0x424852);
    // 4 Heavy Steel Legs with diagonal cross-braces
    const legR = 3.6, H = 14.0;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const x0 = Math.cos(a) * legR, z0 = Math.sin(a) * legR;
      const x1 = Math.cos(a) * (legR * 0.75), z1 = Math.sin(a) * (legR * 0.75);
      b.push(mul(translate((x0 + x1) / 2, H / 2, (z0 + z1) / 2), rotY(a)));
      b.box([0, 0, 0], [0.35, H, 0.35], steel);
      b.pop();
    }
    // Horizontal girt rings and diagonal cross braces
    for (let h = 3.0; h <= H; h += 3.5) {
      for (let i = 0; i < 4; i++) {
        const a0 = (i / 4) * Math.PI * 2 + Math.PI / 4, a1 = ((i + 1) / 4) * Math.PI * 2 + Math.PI / 4;
        const k = 1 - (h / H) * 0.25;
        const p0: V3 = [Math.cos(a0) * legR * k, h, Math.sin(a0) * legR * k];
        const p1: V3 = [Math.cos(a1) * legR * k, h, Math.sin(a1) * legR * k];
        b.push(mul(translate((p0[0] + p1[0]) / 2, h, (p0[1] + p1[1]) / 2), rotY(Math.atan2(p1[0] - p0[0], p1[2] - p0[2]))));
        b.box([0, 0, 0], [0.15, 0.15, Math.hypot(p1[0] - p0[0], p1[2] - p0[2])], steel);
        b.pop();
      }
    }
    // Upper Catwalk Platform & Safety Railing
    b.cyl([0, H + 0.15, 0], 3.8, 3.8, 0.3, steel, 16, true, true);
    b.torus([0, H + 1.2, 0], 3.75, 0.05, steel, 16, 6);                                  // railing
    // Cylindrical Galvanized Water Tank
    b.cyl([0, H + 0.3, 0], 3.4, 3.4, 5.6, tankCol, 24, true, true);
    // Banded Iron Reinforcement Hoops
    for (let y = H + 1.2; y <= H + 5.2; y += 1.3) {
      b.torus([0, y, 0], 3.42, 0.04, rgb(0x383e46), 24, 6);
    }
    // Conical Roof with Ventilation Ball Finial
    b.cyl([0, H + 5.9, 0], 3.6, 0.1, 1.8, roofCol, 24, true, true);
    b.sphere([0, H + 7.8, 0], 0.25, C.gold, 10, 1, true);
  });

  // Red Farm Barn (Anarchy Acres / Fatal Fields style)
  M.barn = mk(b => {
    const red = rgb(0xa83226), white = rgb(0xf0f0ee), roof = rgb(0x4a4d52);
    // Main barn hall
    b.box([0, 3.5, 0], [16.0, 7.0, 22.0], red);
    // White corner trims
    for (const sx of [-8.05, 8.05]) for (const sz of [-11.05, 11.05]) {
      b.box([sx, 3.5, sz], [0.35, 7.0, 0.35], white);
    }
    // Double sliding front doors with white X-braces
    b.box([0, 2.5, 11.08], [4.8, 5.0, 0.15], white);
    b.box([0, 2.5, 11.16], [4.6, 4.8, 0.08], red);
    // Loft window
    b.box([0, 7.5, 11.08], [2.2, 2.2, 0.12], white);
    b.box([0, 7.5, 11.09], [1.8, 1.8, 0.04], C.dark);
    // Gambrel roof
    b.push(mul(translate(0, 7.0, 0), rotX(0)));
    b.cyl([0, 0, 0], 8.2, 8.2, 22.4, roof, 8, true, true);
    b.pop();
  });

  // Pickup Truck with curved cab and flatbed
  M.truck = mk(b => {
    const red = rgb(0xd0382c), chrome = rgb(0xcccccc);
    // Hood & Cab
    b.rbox([0, 0.75, 0.8], [2.0, 0.65, 1.8], red, 0.08);                               // hood
    b.rbox([0, 1.35, -0.3], [1.9, 0.85, 1.6], red, 0.08);                              // cab
    b.box([0, 1.38, 0.52], [1.7, 0.55, 0.04], C.glass);                                // windshield
    b.box([0, 1.38, -0.3], [1.92, 0.48, 1.3], C.glass);                                // side glass
    // Flatbed & Tailgate
    b.rbox([0, 0.85, -1.8], [2.0, 0.55, 2.2], red, 0.06);
    b.box([0, 0.65, -1.8], [1.7, 0.12, 2.0], rgb(0x444444));                           // ribbed bed floor
    // Grille & Headlights
    b.box([0, 0.75, 1.72], [1.6, 0.35, 0.06], chrome);
    b.sphere([-0.7, 0.75, 1.74], 0.12, rgb(0xfff8d0), 10, 1, true);
    b.sphere([0.7, 0.75, 1.74], 0.12, rgb(0xfff8d0), 10, 1, true);
    // 4 Wheels with rubber tires and chrome hubcaps
    for (const sx of [-1.05, 1.05]) {
      for (const sz of [-1.6, 1.0]) {
        b.push(mul(translate(sx, 0.38, sz), rotZ(Math.PI / 2)));
        b.cyl([0, 0, 0], 0.38, 0.38, 0.26, rgb(0x202226), 16, true, true);
        b.cyl([0, 0.02, 0], 0.22, 0.22, 0.28, chrome, 12, true, true);                  // hubcap
        b.pop();
      }
    }
  });

  // Town Sedan Car
  M.car = mk(b => {
    const y = rgb(0x3878d6), chrome = rgb(0xdddddd);
    b.rbox([0, 0.55, 0], [1.9, 0.52, 4.2], y, 0.08);                                   // lower chassis
    b.rbox([0, 1.05, -0.2], [1.65, 0.52, 2.2], y, 0.08);                               // cabin
    b.box([0, 1.05, -0.2], [1.68, 0.34, 2.0], C.glass);                                // side windows
    b.box([0, 1.05, 0.92], [1.45, 0.35, 0.08], C.glass);                               // windshield
    b.box([0, 0.52, 2.12], [1.65, 0.18, 0.08], chrome);                                // bumper
    b.sphere([-0.65, 0.62, 2.14], 0.11, rgb(0xfff8d0), 10, 1, true);
    b.sphere([0.65, 0.62, 2.14], 0.11, rgb(0xfff8d0), 10, 1, true);
    for (const sx of [-0.96, 0.96]) { b.box([sx, 0.7, -0.2], [0.01, 0.4, 0.02], dk(y, 0.6)); b.box([sx, 0.7, 0.6], [0.01, 0.4, 0.02], dk(y, 0.6)); b.box([sx, 0.85, 0.2], [0.03, 0.03, 0.18], chrome); }   // door seams + handles
    for (const sx of [-0.9, 0.9]) b.box([sx, 1.0, 0.85], [0.18, 0.1, 0.08], y);                                         // mirrors
    b.box([0, 1.33, -0.2], [1.5, 0.05, 2.1], dk(y, 0.9));                                                              // roof
    b.box([0, 0.62, -2.12], [0.4, 0.15, 0.03], rgb(0xf4f4f0)); b.box([0, 0.72, -2.12], [1.6, 0.16, 0.04], rgb(0xd83030)); // plate + tail lights
    b.box([0, 0.5, -2.12], [1.65, 0.18, 0.08], chrome);
    // 4 Wheels with tyre tread rings and hubcaps
    for (const sx of [-0.95, 0.95]) {
      for (const sz of [-1.3, 1.3]) {
        b.push(mul(translate(sx, 0.35, sz), rotZ(Math.PI / 2)));
        b.cyl([0, 0, 0], 0.35, 0.35, 0.24, rgb(0x222226), 16, true, true);
        b.torus([0, 0.13 * Math.sign(sx), 0], 0.3, 0.03, rgb(0x2e2e33), 16, 6);
        b.cyl([0, 0.02, 0], 0.20, 0.20, 0.26, chrome, 12, true, true);
        for (let k = 0; k < 5; k++) { const a = k / 5 * 6.283; b.box([Math.cos(a) * 0.12, 0.14 * Math.sign(sx), Math.sin(a) * 0.12], [0.06, 0.02, 0.06], dk(chrome, 0.7)); }
        b.pop();
      }
    }
  });

  // Golden Treasure Chest (Iconic glowing chest)
  M.chest = mk(b => {
    b.rbox([0, 0.35, 0], [1.44, 0.70, 0.94], C.woodDark, 0.04);                        // chest base
    b.rbox([0, 0.86, 0], [1.48, 0.34, 0.98], C.wood, 0.05);                            // lid
    // Heavy iron reinforcement bands with rivets
    for (const sx of [-0.52, 0.52]) {
      b.box([sx, 0.52, 0], [0.10, 1.06, 1.02], rgb(0x3a3632));
      for (let y = 0.15; y < 1.0; y += 0.25) {
        b.sphere([sx, y, 0.52], 0.02, C.gold, 6, 1, true);
        b.sphere([sx, y, -0.52], 0.02, C.gold, 6, 1, true);
      }
    }
    // Ornate gold latch clasp with keyhole
    b.box([0, 0.58, 0.49], [0.32, 0.32, 0.08], C.gold);
    b.cyl([0, 0.58, 0.53], 0.04, 0.04, 0.02, C.dark, 8);
  });
  M.chestOpen = mk(b => {
    b.rbox([0, 0.35, 0], [1.44, 0.70, 0.94], C.woodDark, 0.04);
    b.push(mul(translate(0, 0.85, -0.45), rotX(-1.2)));
    b.rbox([0, 0.2, 0], [1.48, 0.34, 0.98], C.wood, 0.05);
    b.pop();
    // Glowing golden interior treasure tray
    b.box([0, 0.55, 0], [1.32, 0.12, 0.82], C.gold);
  });

  // Street Lamp with Curved Arm & Glass Globe
  M.lamp = mk(b => {
    b.cyl([0, 0, 0], 0.16, 0.09, 4.8, rgb(0x2a2c30), 12, true, true);
    b.cyl([0, 0, 0], 0.26, 0.18, 0.5, rgb(0x2a2c30), 12, true, true);                     // base
    b.push(mul(translate(0, 4.8, 0), rotZ(-1.35)));
    b.cyl([0, 0, 0], 0.07, 0.05, 1.15, rgb(0x2a2c30), 10, true, true);                     // arm
    b.pop();
    b.box([1.05, 4.9, 0], [0.7, 0.16, 0.36], rgb(0x2a2c30));                              // head housing
    b.box([1.05, 4.78, 0], [0.6, 0.08, 0.3], rgb(0xfff6d0));                              // lens
    b.sphere([1.05, 4.7, 0], 0.16, rgb(0xfff6d0), 10, 0.8, true);
  });

  M.bench = mk(b => {
    b.box([0, 0.45, 0], [1.7, 0.08, 0.52], C.wood);
    b.box([0, 0.80, -0.22], [1.7, 0.48, 0.07], C.wood);
    for (const x of [-0.75, 0.75]) b.rbox([x, 0.25, 0], [0.09, 0.54, 0.54], rgb(0x2a2c30), 0.02);
  });

  M.fence = mk(b => {
    for (let i = 0; i < 9; i++) {
      b.box([-4 + i, 0.55, 0], [0.14, 1.1, 0.06], rgb(0xf4f4f0));
      b.push(mul(translate(-4 + i, 1.1, 0), rotZ(Math.PI / 4)));
      b.box([0, 0, 0], [0.14, 0.14, 0.06], rgb(0xf4f4f0));
      b.pop();
    }
    b.box([0, 0.42, 0], [8.2, 0.09, 0.05], rgb(0xf4f4f0));
    b.box([0, 0.88, 0], [8.2, 0.09, 0.05], rgb(0xf4f4f0));
  });

  M.mailbox = mk(b => {
    b.cyl([0, 0, 0], 0.06, 0.06, 1.1, rgb(0x5a4a3a), 8, true, true);
    b.rbox([0, 1.22, 0], [0.26, 0.26, 0.48], rgb(0x2c64b5), 0.06);
    b.box([0.16, 1.32, 0.12], [0.03, 0.22, 0.04], C.red);                               // red flag
  });

  M.dash = mk(b => b.box([0, 0.03, 0], [0.5, 0.06, 2.4], rgb(0xf4f4f4)));

  M.fountain = mk(b => {
    b.cyl([0, 0, 0], 3.2, 3.2, 0.5, rgb(0xaebbc2), 24, true, true);
    b.cyl([0, 0.48, 0], 2.8, 2.8, 0.2, rgb(0x45bede), 24, true, true);
    b.cyl([0, 0.5, 0], 0.6, 0.8, 2.6, rgb(0xc6d1d5), 16, true, true);
    b.sphere([0, 3.2, 0], 0.78, rgb(0xd8e1e3), 14, 0.9, true);
  });

  M.dumpster = mk(b => {
    b.rbox([0, 0.7, 0], [2.2, 1.35, 1.25], rgb(0x2e6e54), 0.05);
    b.push(rotX(-0.25));
    b.rbox([0, 1.4, -0.1], [2.25, 0.16, 1.3], rgb(0x225540), 0.03);
    b.pop();
    for (const x of [-0.85, 0.85]) b.cyl([x, 0.12, 0.55], 0.18, 0.18, 0.16, rgb(0x222), 10, true, true);
  });

  // Battle Bus with Turbo Jet Engines and Hot Air Balloon (Image 2)
  M.bus = mk(b => {
    b.rbox([0, 1.4, 0], [3.3, 2.6, 10.2], C.bus, 0.14);
    for (let i = 0; i < 6; i++) {
      b.box([1.68, 1.9, -3.8 + i * 1.5], [0.06, 1.0, 1.1], C.glass);
      b.box([-1.68, 1.9, -3.8 + i * 1.5], [0.06, 1.0, 1.1], C.glass);
    }
    b.box([0, 1.9, 5.12], [2.9, 1.0, 0.06], C.glass);                                   // front windshield
    b.box([0, 0.3, 5.2], [3.3, 0.35, 0.22], rgb(0xcccccc));                            // front bumper
    b.rbox([0, 2.8, 0], [3.1, 0.16, 9.8], rgb(0x728aa0), 0.04);                        // roof rack
    // Turbo Thrusters on sides of bus
    for (const sx of [-1.8, 1.8]) {
      b.cyl([sx, 1.6, -3.2], 0.42, 0.36, 1.8, rgb(0x3a3e46), 14, true, true);
      b.sphere([sx, 1.6, -4.2], 0.25, C.orange, 10, 1, true);                            // afterburner flame
    }
    // 4 Heavy Wheels
    for (const x of [-1.25, 1.25]) {
      for (const z of [-3.2, 3.2]) {
        b.push(mul(translate(x, 0.55, z), rotZ(Math.PI / 2)));
        b.cyl([0, 0, 0], 0.58, 0.58, 0.34, rgb(0x1e1e22), 16, true, true);
        b.pop();
      }
    }
    // Burner Rig Mount on roof
    b.cyl([0, 3.0, 0], 0.55, 0.50, 2.4, rgb(0xd0d0c8), 12, true, true);
    b.cyl([0, 5.4, 0], 0.30, 0.35, 1.3, rgb(0xd0d0c8), 10, true, true);
  });

  // Hot Air Balloon (Image 2)
  M.balloon = mk(b => {
    b.sphere([0, 0, 0], 7.8, C.balloon, 20, 1.12, true, [0, 0.56]);
    b.sphere([0, 0, 0], 7.8, C.cream, 20, 1.12, true, [0.56, 0.82]);
    b.cyl([0, -9.8, 0], 1.8, 4.6, 4.6, C.cream, 20, false, true);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      b.cyl([Math.cos(a) * 2.3, -12.4, Math.sin(a) * 2.3], 0.03, 0.03, 5.4, rgb(0xb0a060), 6);
    }
  });

  // Glider: Classic military umbrella / canopy glider (Image 2)
  M.glider = mk(b => {
    const tan = rgb(0xd8a86a), brown = rgb(0x7a5a3a);
    b.rbox([-2.3, 0, 0], [2.6, 0.08, 1.1], tan, 0.03);
    b.rbox([2.3, 0, 0], [2.6, 0.08, 1.1], tan, 0.03);
    // Outer wingtip struts
    b.box([-3.6, -0.05, 0.5], [0.65, 0.52, 0.52], brown);
    b.box([3.6, -0.05, 0.5], [0.65, 0.52, 0.52], brown);
    // Center curved frame arch
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI, a1 = ((i + 1) / 12) * Math.PI;
      const x0 = -Math.cos(a0) * 2.6, y0 = Math.sin(a0) * 1.6;
      const x1 = -Math.cos(a1) * 2.6, y1 = Math.sin(a1) * 1.6;
      b.push(mul(translate((x0 + x1) / 2, (y0 + y1) / 2, 0), rotZ(Math.atan2(y1 - y0, x1 - x0))));
      b.box([0, 0, 0], [Math.hypot(x1 - x0, y1 - y0) + 0.06, 0.11, 0.11], brown);
      b.pop();
    }
    // Handlebars for player hands to grip
    for (const x of [-0.55, 0.55]) {
      b.cyl([x, -0.6, 0], 0.025, 0.025, 1.1, rgb(0x333), 8, true, true);
    }
  });

  M.pad = mk(b => {
    b.cyl([0, 0, 0], 2.4, 2.4, 0.38, rgb(0x608095), 24, true, true);
    b.cyl([0, 0.38, 0], 2.1, 2.1, 0.14, rgb(0xd8ecf6), 24, true, true);
    b.torus([0, 0.42, 0], 2.12, 0.04, C.blue, 24, 6);                                   // glowing blue rim
  });

  M.shadow = mk(b => b.cyl([0, 0.02, 0], 0.48, 0.48, 0.001, rgb(0x0), 16));
  M.water = mk(b => b.quad([-1000, 0, -1000], [-1000, 0, 1000], [1000, 0, 1000], [1000, 0, -1000], rgb(0x289cc8)));
  M.hitbox = mk(b => b.box([0, 0, 0], [1, 1, 1], C.white));
  M.storm = mk(b => { b.cyl([0, -50, 0], 1, 1, 400, rgb(0x7052ff), 64, false, true); });

  return M;
}
