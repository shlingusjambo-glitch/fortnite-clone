import { cross, norm, sub, transformPoint, transformDir, ident, mul, translate, rotY, rotX, rotZ, scaleM } from "./math";
const rgb = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
const dk = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
function aoY(d, y0, y1, dark) {
  for (let i = 0; i < d.length; i += 9) {
    const t = Math.min(1, Math.max(0, (d[i + 1] - y0) / (y1 - y0))), k = dark + (1 - dark) * t * t * (3 - 2 * t);
    d[i + 6] *= k;
    d[i + 7] *= k;
    d[i + 8] *= k;
  }
}
const lt = (c, k) => [Math.min(1, c[0] + (1 - c[0]) * k), Math.min(1, c[1] + (1 - c[1]) * k), Math.min(1, c[2] + (1 - c[2]) * k)];
class MB {
  d = [];
  m = ident();
  stack = [];
  push(m) {
    this.stack.push(this.m);
    this.m = mul(this.m, m);
    return this;
  }
  pop() {
    this.m = this.stack.pop();
    return this;
  }
  tri(a, b, c, col) {
    a = transformPoint(this.m, a);
    b = transformPoint(this.m, b);
    c = transformPoint(this.m, c);
    const n = norm(cross(sub(b, a), sub(c, a)));
    for (const p of [a, b, c]) this.d.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2]);
  }
  triN(a, b, c, na, nb, nc, col) {
    for (const [p, n] of [[a, na], [b, nb], [c, nc]]) {
      const q = transformPoint(this.m, p), m = norm(transformDir(this.m, n));
      this.d.push(q[0], q[1], q[2], m[0], m[1], m[2], col[0], col[1], col[2]);
    }
  }
  quad(a, b, c, d, col) {
    this.tri(a, b, c, col);
    this.tri(a, c, d, col);
  }
  quadN(a, b, c, d, na, nb, nc, nd, col) {
    this.triN(a, b, c, na, nb, nc, col);
    this.triN(a, c, d, na, nc, nd, col);
  }
  box(c, s, col) {
    const [x, y, z] = c, [w, h, l] = [s[0] / 2, s[1] / 2, s[2] / 2];
    const p = (i) => [x + (i & 1 ? w : -w), y + (i & 2 ? h : -h), z + (i & 4 ? l : -l)];
    this.quad(p(2), p(6), p(7), p(3), col);
    this.quad(p(0), p(1), p(5), p(4), dk(col, 0.65));
    this.quad(p(4), p(5), p(7), p(6), dk(col, 0.92));
    this.quad(p(1), p(0), p(2), p(3), dk(col, 0.92));
    this.quad(p(5), p(1), p(3), p(7), dk(col, 0.82));
    this.quad(p(0), p(4), p(6), p(2), dk(col, 0.82));
    return this;
  }
  /** High-poly smooth cylinder with optional beveled caps and normals */
  cyl(c, r0, r1, h, col, seg = 16, caps = true, smooth = true) {
    const [x, y, z] = c;
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const b0 = [x + c0 * r0, y, z + s0 * r0], b1 = [x + c1 * r0, y, z + s1 * r0];
      const t0 = [x + c0 * r1, y + h, z + s0 * r1], t1 = [x + c1 * r1, y + h, z + s1 * r1];
      if (smooth) {
        const ny = (r0 - r1) / (h || 1e-3);
        const n0 = norm([c0, ny, s0]), n1 = norm([c1, ny, s1]);
        this.triN(b1, b0, t0, n1, n0, n0, col);
        this.triN(b1, t0, t1, n1, n0, n1, col);
      } else {
        if (r1 > 0) this.quad(b1, b0, t0, t1, col);
        else this.tri(b1, b0, t0, col);
      }
      if (caps) {
        if (r0 > 0) this.tri([x, y, z], b0, b1, dk(col, 0.72));
        if (r1 > 0) this.tri([x, y + h, z], t1, t0, lt(col, 0.12));
      }
    }
    return this;
  }
  /** Smooth high-poly sphere / spheroid with per-vertex normals */
  sphere(c, r, col, seg = 12, sy = 1, smooth = true, rows = [0, 1]) {
    const p = (i, j) => {
      const ph = i / seg * Math.PI, th = j / (seg * 2) * Math.PI * 2;
      return [c[0] + r * Math.sin(ph) * Math.cos(th), c[1] + r * sy * Math.cos(ph), c[2] + r * Math.sin(ph) * Math.sin(th)];
    };
    const n = (i, j) => norm(sub(p(i, j), c));
    const startRow = Math.max(0, Math.round(rows[0] * seg)), endRow = Math.min(seg, Math.round(rows[1] * seg));
    for (let i = startRow; i < endRow; i++) {
      for (let j = 0; j < seg * 2; j++) {
        const jNext = (j + 1) % (seg * 2);
        const p00 = p(i, j), p01 = p(i, jNext), p11 = p(i + 1, jNext), p10 = p(i + 1, j);
        if (smooth) {
          const n00 = n(i, j), n01 = n(i, jNext), n11 = n(i + 1, jNext), n10 = n(i + 1, j);
          if (i === 0) {
            this.triN(p00, p11, p10, n00, n11, n10, col);
          } else if (i === seg - 1) {
            this.triN(p00, p01, p11, n00, n01, n11, col);
          } else {
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
  rbox(c, s, col, r = 0.05) {
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
  torus(c, R, r, col, segR = 16, segr = 8) {
    for (let i = 0; i < segR; i++) {
      const u0 = i / segR * Math.PI * 2, u1 = (i + 1) / segR * Math.PI * 2;
      for (let j = 0; j < segr; j++) {
        const v0 = j / segr * Math.PI * 2, v1 = (j + 1) / segr * Math.PI * 2;
        const pt = (u, v) => [
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
  plank(c, s, col, r = 0.02) {
    this.rbox(c, s, col, r);
    this.box([c[0], c[1], c[2] + s[2] * 0.49], [s[0] * 0.96, s[1] * 0.96, 0.01], dk(col, 0.85));
    this.box([c[0], c[1], c[2] - s[2] * 0.49], [s[0] * 0.96, s[1] * 0.96, 0.01], dk(col, 0.85));
    return this;
  }
  build(r) {
    return r.upload(new Float32Array(this.d));
  }
}
const C = {
  wood: rgb(14205595),
  woodDark: rgb(10320466),
  woodLight: rgb(15456437),
  stone: rgb(12892584),
  stoneDark: rgb(9340023),
  stoneLight: rgb(14867151),
  metal: rgb(11715279),
  metalDark: rgb(6649736),
  metalLight: rgb(14411504),
  leaf: rgb(6277444),
  leaf2: rgb(4565298),
  leaf3: rgb(7790158),
  pine: rgb(3115846),
  pine2: rgb(4499035),
  pineDark: rgb(2122546),
  trunk: rgb(8544320),
  trunkDark: rgb(6046248),
  rock: rgb(9605e3),
  rockDark: rgb(7038816),
  gold: rgb(15775780),
  dark: rgb(1710624),
  white: rgb(16777215),
  red: rgb(15088443),
  blue: rgb(2918645),
  green: rgb(3523157),
  purple: rgb(9850342),
  orange: rgb(16747038),
  yellow: rgb(16765490),
  bus: rgb(2649830),
  balloon: rgb(5161670),
  cream: rgb(15657172),
  asphalt: rgb(4869458),
  glass: rgb(13692156),
  holographic: rgb(4044287)
};
const SKINS = [
  { name: "Jonesy", skin: rgb(16042395), top: rgb(7042898), top2: rgb(4871476), pants: rgb(6508347), boots: rgb(2236966), hair: rgb(15912784), hat: "blonde", style: 0 },
  { name: "Ramirez", skin: rgb(14392184), top: rgb(16417834), top2: rgb(3949133), pants: rgb(5002568), boots: rgb(2236966), hair: rgb(2104866), hat: "hair", style: 0, female: true },
  { name: "Skull Trooper", skin: rgb(14606054), top: rgb(1447452), top2: rgb(9068520), pants: rgb(1776418), boots: rgb(1118484), hair: rgb(1118484), hat: "beanie", style: 0, ribs: true },
  { name: "Wildcat", skin: rgb(13405026), top: rgb(15107874), top2: rgb(2501168), pants: rgb(3357509), boots: rgb(1579551), hair: rgb(9185304), hat: "spiky", style: 0, female: true },
  { name: "Renegade", skin: rgb(10710087), top: rgb(8537142), top2: rgb(4009001), pants: rgb(6049085), boots: rgb(2367516), hair: rgb(1709588), hat: "cap", style: 0, female: true },
  { name: "Arctic Ace", skin: rgb(15454898), top: rgb(15659767), top2: rgb(9484244), pants: rgb(8427691), boots: rgb(3292746), hair: rgb(14413560), hat: "beanie", style: 1 },
  { name: "Neon Striker", skin: rgb(7556152), top: rgb(2237501), top2: rgb(3205316), pants: rgb(1975350), boots: rgb(1184796), hair: rgb(11815679), hat: "spiky", style: 1 },
  { name: "Black Knight", skin: rgb(14201999), top: rgb(1776418), top2: rgb(13111342), pants: rgb(2302763), boots: rgb(1315864), hair: rgb(2829107), hat: "knight", style: 0 },
  { name: "Rust Lord", skin: rgb(14726284), top: rgb(11880223), top2: rgb(3947588), pants: rgb(4864556), boots: rgb(2761760), hair: rgb(9067050), hat: "cap", style: 0 },
  { name: "Brite Bomber", skin: rgb(15845797), top: rgb(16727753), top2: rgb(9167103), pants: rgb(7093503), boots: rgb(16727753), hair: rgb(12078335), hat: "hair", style: 0, female: true },
  { name: "Raven", skin: rgb(10132136), top: rgb(1381664), top2: rgb(5913855), pants: rgb(1052696), boots: rgb(789522), hair: rgb(921108), hat: "beanie", style: 1 },
  { name: "Renegade Raider", skin: rgb(15253658), top: rgb(9050642), top2: rgb(2763312), pants: rgb(3881796), boots: rgb(1710622), hair: rgb(3810328), hat: "cap", style: 0, female: true },
  { name: "Aerial Assault Trooper", skin: rgb(14266508), top: rgb(2834218), top2: rgb(6978106), pants: rgb(4872762), boots: rgb(1973794), hair: rgb(2760212), hat: "helmet", style: 0 },
  { name: "Blue Squire", skin: rgb(15780004), top: rgb(2250188), top2: rgb(14212584), pants: rgb(1719434), boots: rgb(2763312), hair: rgb(5913114), hat: "hair", style: 0 },
  { name: "Tower Recon Specialist", skin: rgb(13208168), top: rgb(12034940), top2: rgb(4868666), pants: rgb(6974026), boots: rgb(2761760), hair: rgb(1709072), hat: "cap", style: 0 },
  { name: "Red Knight", skin: rgb(15253658), top: rgb(9048594), top2: rgb(2763312), pants: rgb(2829107), boots: rgb(1710622), hair: rgb(9048594), hat: "knight", style: 0, female: true },
  { name: "Sparkle Specialist", skin: rgb(15845797), top: rgb(16734899), top2: rgb(6217983), pants: rgb(2759236), boots: rgb(1710622), hair: rgb(3811866), hat: "hair", style: 1, female: true },
  { name: "Ghoul Trooper", skin: rgb(10473610), top: rgb(3095082), top2: rgb(9162858), pants: rgb(3815978), boots: rgb(1973790), hair: rgb(1714708), hat: "hair", style: 0, female: true },
  { name: "Love Ranger", skin: rgb(14211296), top: rgb(15219306), top2: rgb(16777215), pants: rgb(12632264), boots: rgb(9079440), hair: rgb(14211296), hat: "spiky", style: 1 },
  { name: "Grid Leader", skin: rgb(10213882), top: rgb(15704804), top2: rgb(9229823), pants: rgb(10213882), boots: rgb(15704804), hair: rgb(10213882), hat: "spiky", style: 1 }
];
function buildCharacter(r, s, bulk = 1) {
  const mk = (f, ao) => {
    const b = new MB();
    f(b);
    if (ao) aoY(b.d, ao[0], ao[1], ao[2]);
    return b.build(r);
  };
  const sw = (s.female ? 0.86 : 1) * bulk, black = rgb(1973796), darkGrey = rgb(3158843), gold = rgb(15119394), leather = rgb(4864556);
  return {
    style: s.style,
    torso: mk((b) => {
      b.sphere([0, 0, 0], 0.2 * sw, s.pants, 14, 0.7, true);
      b.cyl([0, -0.02, 0], 0.19 * sw, 0.17 * sw, 0.16, s.pants, 16, false, true);
      b.cyl([0, 0.14, 0], 0.17 * sw, 0.19 * sw, 0.18, s.top, 16, false, true);
      b.cyl([0, 0.32, 0], 0.19 * sw, 0.245 * sw, 0.22, s.top, 16, false, true);
      b.sphere([0, 0.47, 0.02], 0.25 * sw, s.top, 16, 0.55, true, [0, 0.6]);
      b.box([0, 0.5, 0], [0.5 * sw, 0.12, 0.26 * sw], s.top);
      for (const sx of [-1, 1]) b.sphere([sx * 0.25 * sw, 0.52, 0], 0.09 * sw, s.top, 10, 0.9, true);
      b.cyl([0, 0.6, 0], 0.075, 0.085, 0.12, s.skin, 12, false, true);
      b.torus([0, 0.58, 0], 0.11 * sw, 0.025, s.top2, 16, 8);
      if (s.ribs) {
        for (let i = 0; i < 5; i++) {
          const y = 0.44 - i * 0.075, rw = (0.23 - i * 0.02) * sw;
          b.cyl([0, y, 0.13 * sw], rw * 0.5, rw * 0.5, 0.025, C.white, 12, true, true);
        }
        b.box([0, 0.3, 0.16 * sw], [0.05, 0.36, 0.02], C.white);
      } else {
        b.rbox([0, 0.34, 0.16 * sw], [0.38 * sw, 0.36, 0.07], s.top2, 0.03);
        b.rbox([0, 0.34, -0.15 * sw], [0.36 * sw, 0.38, 0.07], s.top2, 0.03);
        for (const sx of [-0.14, 0.14]) {
          b.box([sx * sw, 0.5, 0], [0.07, 0.03, 0.32 * sw], black);
          b.box([sx * sw, 0.44, 0.19 * sw], [0.06, 0.04, 0.02], rgb(8947848));
        }
        for (const x of [-0.11, 0.11]) {
          b.rbox([x * sw, 0.24, 0.2 * sw], [0.1, 0.12, 0.06], darkGrey, 0.02);
          b.box([x * sw, 0.28, 0.235 * sw], [0.02, 0.02, 0.01], gold);
        }
        b.box([-0.19 * sw, 0.38, 0.17 * sw], [0.05, 0.1, 0.04], black);
        b.cyl([-0.19 * sw, 0.44, 0.17 * sw], 6e-3, 5e-3, 0.12, black, 6);
        b.box([0, 0.05, 0], [0.42 * sw, 0.07, 0.36 * sw], leather);
        b.box([0, 0.05, 0.19 * sw], [0.1, 0.08, 0.02], gold);
        b.box([0, 0.05, 0.2 * sw], [0.06, 0.04, 0.01], black);
        b.cyl([0.21 * sw, 0.03, 0.02], 0.05, 0.05, 0.1, darkGrey, 10, true, true);
        b.rbox([-0.2 * sw, 0.03, 0.02], [0.07, 0.1, 0.12], darkGrey, 0.02);
        b.rbox([0, 0.3, -0.24 * sw], [0.26 * sw, 0.3, 0.13], dk(s.top2, 0.85), 0.03);
        b.box([0, 0.3, -0.31 * sw], [0.2 * sw, 0.16, 0.02], dk(s.top2, 0.7));
      }
    }, [-0.05, 0.5, 0.82]),
    head: mk((b) => {
      b.push(mul(translate(0, -0.06, 0), scaleM(0.76, 0.76, 0.76)));
      b.sphere([0, 0.27, 0.01], 0.235, s.skin, 16, 1.12, true);
      b.sphere([0, 0.18, 0.12], 0.11, s.skin, 12, 0.85, true);
      for (const sx of [-0.082, 0.082]) {
        b.sphere([sx, 0.285, 0.19], 0.045, C.white, 10, 0.7, true);
        b.sphere([sx, 0.288, 0.218], 0.024, C.dark, 8, 0.7, true);
        b.sphere([sx + 8e-3, 0.298, 0.228], 9e-3, C.white, 6, 1, true);
        b.box([sx, 0.345, 0.21], [0.075, 0.022, 0.02], dk(s.hair, 0.45));
        b.sphere([sx * 1.3, 0.23, 0.16], 0.06, lt(s.skin, 0.08), 8, 0.6, true);
      }
      b.cyl([0, 0.22, 0.22], 0.032, 0.018, 0.075, dk(s.skin, 0.94), 10, true, true);
      b.sphere([0, 0.225, 0.245], 0.032, dk(s.skin, 0.96), 10, 1, true);
      b.box([0, 0.155, 0.215], [0.08, 0.018, 0.02], dk(s.skin, 0.65));
      for (const sx of [-0.225, 0.225]) {
        b.push(mul(translate(sx, 0.26, 0), rotY(sx > 0 ? 0.3 : -0.3)));
        b.sphere([0, 0, 0], 0.065, s.skin, 8, 1.4, true);
        b.sphere([0, 0, 0.01], 0.04, dk(s.skin, 0.8), 8, 1.2, true);
        b.pop();
      }
      if (s.hat === "blonde") {
        b.sphere([0, 0.32, -0.04], 0.255, s.hair, 16, 1.05, true);
        b.rbox([0, 0.43, 0.08], [0.34, 0.13, 0.28], s.hair, 0.04);
        b.rbox([0.05, 0.46, 0.18], [0.22, 0.09, 0.16], lt(s.hair, 0.15), 0.03);
        b.rbox([-0.08, 0.42, 0.2], [0.14, 0.07, 0.12], s.hair, 0.02);
        for (const sx of [-0.2, 0.2]) {
          b.cyl([sx, 0.3, 0.05], 0.04, 0.02, 0.12, s.hair, 8, true, true);
        }
      } else if (s.female && s.hat === "hair") {
        b.sphere([0, 0.31, -0.03], 0.255, s.hair, 16, 1.05, true);
        b.sphere([0, 0.36, -0.22], 0.13, s.hair, 14, 1, true);
        b.torus([0, 0.36, -0.16], 0.07, 0.02, C.orange, 12, 6);
        b.rbox([0, 0.39, 0.14], [0.32, 0.06, 0.12], s.hair, 0.02);
      } else if (s.hat === "knight") {
        b.sphere([0, 0.3, 0], 0.27, s.hair, 16, 1.1, true, [0, 0.55]);
        b.cyl([0, 0.2, 0], 0.265, 0.265, 0.24, s.hair, 18, false, true);
        b.box([0, 0.27, 0.24], [0.3, 0.035, 0.06], rgb(1052692));
        b.box([0, 0.18, 0.25], [0.04, 0.16, 0.04], dk(s.hair, 0.7));
        for (let k = 0; k < 5; k++) b.box([-0.08 + k * 0.04, 0.12, 0.255], [0.012, 0.06, 0.02], rgb(1052692));
        b.box([0, 0.48, -0.02], [0.05, 0.16, 0.34], s.top2);
        b.sphere([0, 0.56, -0.16], 0.08, s.top2, 8, 1, true);
      } else if (s.hat === "helmet") {
        b.sphere([0, 0.31, 0], 0.275, s.hair, 16, 1, true, [0, 0.55]);
        b.torus([0, 0.2, 0], 0.27, 0.02, dk(s.hair, 0.7), 18, 6);
        b.box([0, 0.36, 0.22], [0.36, 0.09, 0.08], rgb(1710624));
        for (const sx of [-0.09, 0.09]) b.cyl([sx, 0.36, 0.26], 0.05, 0.05, 0.03, C.holographic, 10, true, true);
        b.box([0, 0.14, 0.12], [0.03, 0.14, 0.03], rgb(1710624));
      } else if (s.hat === "beanie") {
        b.sphere([0, 0.32, 0], 0.265, s.hair, 16, 1.08, true, [0, 0.5]);
        b.cyl([0, 0.31, 0], 0.255, 0.265, 0.11, dk(s.hair, 0.85), 18, false, true);
        b.sphere([0, 0.48, -0.02], 0.06, dk(s.hair, 0.7), 10, 1, true);
      } else if (s.hat === "spiky") {
        b.sphere([0, 0.31, -0.02], 0.255, s.hair, 16, 1.05, true);
        for (let i = 0; i < 12; i++) {
          const a = i / 12 * Math.PI * 2, rr = 0.16;
          b.cyl([Math.cos(a) * rr, 0.44, Math.sin(a) * rr * 0.85 - 0.02], 0.045, 0.015, 0.16, s.hair, 8, true, true);
        }
        b.cyl([0, 0.48, 0], 0.06, 0.02, 0.18, s.hair, 8, true, true);
      } else {
        b.sphere([0, 0.31, -0.02], 0.265, s.hair, 16, 1.08, true);
      }
      b.pop();
    }),
    upperArm: mk((b) => {
      b.sphere([0, 0, 0], 0.095 * sw, s.top, 12, 1, true);
      b.cyl([0, -0.3, 0], 0.07 * sw, 0.085 * sw, 0.3, s.top, 12, false, true);
      b.torus([0, -0.26, 0], 0.078 * sw, 0.02, s.top2, 12, 6);
      b.sphere([0.04 * sw, -0.16, 0], 0.075 * sw, s.top, 10, 1.1, true);
    }),
    foreArm: mk((b) => {
      b.sphere([0, 0, 0], 0.068 * sw, s.skin, 10, 1, true);
      b.cyl([0, -0.29, 0], 0.052, 0.068 * sw, 0.29, s.skin, 12, false, true);
      b.torus([0, -0.17, 0], 0.062 * sw, 0.018, s.top2, 12, 6);
      b.torus([0, -0.13, 0], 0.063 * sw, 0.018, s.top2, 12, 6);
      b.rbox([0, -0.31, 5e-3], [0.1, 0.06, 0.08], black, 0.02);
      b.rbox([0, -0.38, 0.01], [0.1, 0.11, 0.07], darkGrey, 0.02);
      b.cyl([0.05, -0.36, 0.03], 0.018, 0.015, 0.05, s.skin, 6, true, true);
      for (let k = -1.5; k <= 1.5; k += 1) b.cyl([k * 0.024, -0.45, 0.01], 0.013, 0.011, 0.045, s.skin, 6, true, true);
    }),
    thigh: mk((b) => {
      b.sphere([0, 0, 0], 0.11, s.pants, 12, 1, true);
      b.cyl([0, -0.23, 0], 0.095, 0.115, 0.46, s.pants, 14, false, true);
      b.rbox([0.05, -0.2, 0.07], [0.11, 0.14, 0.06], dk(s.pants, 0.85), 0.02);
      b.box([0.05, -0.14, 0.1], [0.11, 0.035, 0.02], dk(s.pants, 0.72));
    }),
    shin: mk((b) => {
      b.sphere([0, 0, 0], 0.095, s.pants, 12, 1, true);
      b.rbox([0.01, -0.02, 0.085], [0.12, 0.13, 0.06], black, 0.025);
      b.cyl([0, -0.25, 0], 0.075, 0.09, 0.4, s.pants, 12, false, true);
      b.cyl([0, -0.42, 0.01], 0.09, 0.085, 0.12, s.boots, 14, true, true);
      b.rbox([0, -0.47, 0.05], [0.17, 0.1, 0.28], s.boots, 0.03);
      b.box([0, -0.52, 0.05], [0.18, 0.05, 0.3], black);
      for (let k = 0; k < 3; k++) {
        const y = -0.43 - k * 0.03;
        b.box([-0.03, y, 0.13], [0.014, 0.014, 0.01], rgb(12303291));
        b.box([0.03, y, 0.13], [0.014, 0.014, 0.01], rgb(12303291));
        b.box([0, y, 0.135], [0.06, 8e-3, 6e-3], rgb(8947848));
      }
    }, [-0.55, -0.3, 0.8])
  };
}
const HOUSE_STYLES = [
  { wall: rgb(12900066), roof: rgb(5001820), trim: rgb(16316662), style: 0 },
  { wall: rgb(11565672), roof: rgb(4014150), trim: rgb(15722972), style: 3 },
  { wall: rgb(15131346), roof: rgb(5922664), trim: rgb(16777215), style: 0 },
  { wall: rgb(11123913), roof: rgb(4672082), trim: rgb(16185078), style: 0 },
  { wall: rgb(13621446), roof: rgb(9062972), trim: rgb(16447210), style: 0 },
  { wall: rgb(14272936), roof: rgb(5595246), trim: rgb(16777215), style: 0 }
];
const FH = 3.6;
function house(b, s) {
  const { w, d } = s, H = FH * s.floors, T = 0.3, hw = w / 2, hd = d / 2, boxes = [];
  const solid = (c, sz, col) => {
    b.box(c, sz, col);
    boxes.push({ min: [c[0] - sz[0] / 2, c[1] - sz[1] / 2, c[2] - sz[2] / 2], max: [c[0] + sz[0] / 2, c[1] + sz[1] / 2, c[2] + sz[2] / 2] });
  };
  solid([0, 0.2, 0], [w + 0.5, 0.4, d + 0.5], rgb(9079430));
  b.box([0, 0.45, 0], [w - 0.2, 0.12, d - 0.2], rgb(12097902));
  for (let f = 0; f < s.floors; f++) {
    const y0 = f * FH, yc = y0 + FH / 2;
    solid([0, yc, -hd + T / 2], [w, FH, T], s.wall);
    solid([-hw + T / 2, yc, 0], [T, FH, d], s.wall);
    solid([hw - T / 2, yc, 0], [T, FH, d], s.wall);
    if (f === 0) {
      const dw = 1.6, dh = 2.6;
      solid([-(hw + dw / 2) / 2, yc, hd - T / 2], [hw - dw / 2, FH, T], s.wall);
      solid([(hw + dw / 2) / 2, yc, hd - T / 2], [hw - dw / 2, FH, T], s.wall);
      solid([0, y0 + dh + (FH - dh) / 2, hd - T / 2], [dw, FH - dh, T], s.wall);
    } else {
      solid([0, yc, hd - T / 2], [w, FH, T], s.wall);
    }
    for (let yy = y0 + 0.3; yy < y0 + FH - 0.1; yy += 0.35) {
      b.box([0, yy, hd + 0.01], [w, 0.04, 0.025], dk(s.wall, 0.88));
      b.box([0, yy, -hd - 0.01], [w, 0.04, 0.025], dk(s.wall, 0.88));
      b.box([hw + 0.01, yy, 0], [0.025, 0.04, d], dk(s.wall, 0.88));
      b.box([-hw - 0.01, yy, 0], [0.025, 0.04, d], dk(s.wall, 0.88));
    }
    const win = (x, z, side) => {
      const y = y0 + 1.95, ww = 1.6, wh = 1.7;
      if (side === "z") {
        b.box([x, y, z], [ww + 0.28, wh + 0.28, 0.08], s.trim);
        b.box([x, y, z], [ww, wh, 0.03], C.glass);
        b.box([x, y, z + 0.02], [0.07, wh, 0.03], s.trim);
        b.box([x, y, z + 0.02], [ww, 0.07, 0.03], s.trim);
        b.box([x, y - wh / 2 - 0.08, z + Math.sign(z) * 0.14], [ww + 0.4, 0.12, 0.26], s.trim);
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
      if (!(f === 0 && Math.abs(x) < 1.6)) win(x, hd - T / 2, "z");
      win(x, -hd + T / 2, "z");
    }
    for (const z of [-d * 0.25, d * 0.25]) {
      win(-hw + T / 2, z, "x");
      win(hw - T / 2, z, "x");
    }
    if (f > 0) {
      const sx0 = -hw + T, sx1 = -hw + T + 1.5;
      solid([(sx1 + hw - T) / 2, y0 + 0.1, 0], [hw - T - sx1, 0.25, d - 2 * T], rgb(12097902));
      solid([(sx0 + sx1) / 2, y0 + 0.1, (3.2 + hd - T) / 2], [sx1 - sx0, 0.25, hd - T - 3.2], rgb(12097902));
      solid([(sx0 + sx1) / 2, y0 + 0.1, -(3.2 + hd - T) / 2], [sx1 - sx0, 0.25, hd - T - 3.2], rgb(12097902));
      b.box([(sx0 + sx1) / 2 + 0.75, y0 + 0.7, 0], [0.08, 0.9, 6.4], rgb(5917242));
      for (let st = 0; st < 8; st++) {
        const yy = y0 - FH + (st + 1) * (FH / 8);
        solid([(sx0 + sx1) / 2, yy - 0.12, 3.2 - (st + 0.5) * 0.8], [sx1 - sx0, 0.24, 0.8], rgb(11045472));
      }
    }
    if (f === 0) {
      solid([hw * 0.55, 0.5, hd * 0.35], [2.6, 0.95, 0.8], rgb(14605008));
      b.box([hw * 0.55, 1, hd * 0.35], [2.7, 0.08, 0.85], rgb(3816e3));
      b.cyl([hw * 0.55, 1.08, hd * 0.35], 0.015, 0.015, 0.14, rgb(14540253), 8);
      solid([-hw * 0.45, 0.45, hd * 0.35], [2.4, 0.85, 1], rgb(3892889));
      b.rbox([-hw * 0.45, 0.95, hd * 0.35 + 0.4], [2.4, 0.6, 0.28], rgb(3101312), 0.05);
      b.rbox([-hw * 0.45, 0.3, hd * 0.35 - 0.9], [1.6, 0.08, 0.8], rgb(8018490), 0.02);
    } else {
      solid([hw * 0.45, y0 + 0.4, -hd * 0.3], [2.2, 0.65, 2.6], rgb(12963288));
      b.box([hw * 0.45, y0 + 0.76, -hd * 0.3 - 1], [1.8, 0.16, 0.6], rgb(16777215));
      b.rbox([hw * 0.45, y0 + 0.9, -hd * 0.3 - 1.35], [2.2, 0.9, 0.12], rgb(7228976), 0.03);
    }
  }
  const rh = d * 0.44, ov = 0.6, rc = s.roof;
  b.quad([-hw - ov, H, -hd - ov], [-hw - ov, H + rh, 0], [hw + ov, H + rh, 0], [hw + ov, H, -hd - ov], rc);
  b.quad([hw + ov, H, hd + ov], [hw + ov, H + rh, 0], [-hw - ov, H + rh, 0], [-hw - ov, H, hd + ov], rc);
  b.tri([hw, H, -hd], [hw, H + rh, 0], [hw, H, hd], s.wall);
  b.tri([-hw, H, hd], [-hw, H + rh, 0], [-hw, H, -hd], s.wall);
  b.box([0, H + 0.05, 0], [w, 0.1, d], rgb(8022618));
  b.rbox([hw * 0.4, H + rh * 0.7, -hd * 0.2], [0.95, rh * 1.3, 0.95], rgb(9062458), 0.04);
  b.box([0, 1.3, hd - T / 2], [1.4, 2.5, 0.09], rgb(2966379));
  b.sphere([0.5, 1.25, hd + 0.02], 0.04, C.gold, 8, 1, true);
  b.rbox([0, 3.15, hd + 1.1], [3.4, 0.18, 2.2], s.roof, 0.03);
  for (const x of [-1.5, 1.5]) solid([x, 1.55, hd + 2], [0.18, 3.1, 0.18], s.trim);
  solid([0, 0.2, hd + 1.2], [3.2, 0.4, 1.8], rgb(11579562));
  solid([0, 0.1, hd + 2.4], [3.2, 0.2, 0.7], rgb(11579562));
  for (let k = 0; k < 4; k++) {
    const t0 = k / 4, t1 = (k + 1) / 4;
    boxes.push({ min: [-hw - ov, H + rh * t0, -(hd + ov) * (1 - t0)], max: [hw + ov, H + rh * t1, (hd + ov) * (1 - t0)] });
  }
  return boxes;
}
function editedPiece(r, type, mat, mask) {
  const b = new MB();
  const c = mat === "metal" ? C.metal : mat === "stone" ? C.stone : C.wood;
  const c2 = mat === "metal" ? C.metalDark : mat === "stone" ? C.stoneDark : C.woodDark;
  if (type === "wall") {
    const T = 4 / 3;
    for (let i = 0; i < 9; i++) {
      if (mask & 1 << i) continue;
      const row = Math.floor(i / 3), col = i % 3;
      b.plank([-2 + (col + 0.5) * T, (row + 0.5) * T, 0], [T * 0.98, T * 0.98, 0.22], c, 0.02);
    }
    for (let i = 0; i < 9; i++) {
      if (!(mask & 1 << i)) continue;
      const row = Math.floor(i / 3), col = i % 3, x = -2 + (col + 0.5) * T, y = (row + 0.5) * T;
      const nb = (j) => j < 0 || j > 8 || mask & 1 << j;
      if (!nb(i + 3) || row === 2) b.rbox([x, y + T / 2, 0], [T, 0.12, 0.28], c2, 0.02);
      if (!nb(i - 3) || row === 0) b.rbox([x, y - T / 2, 0], [T, 0.12, 0.28], c2, 0.02);
      if (col < 2 && !nb(i + 1)) b.rbox([x + T / 2, y, 0], [0.12, T, 0.28], c2, 0.02);
      if (col > 0 && !nb(i - 1)) b.rbox([x - T / 2, y, 0], [0.12, T, 0.28], c2, 0.02);
    }
  } else {
    for (let i = 0; i < 4; i++) {
      if (mask & 1 << i) continue;
      const cx = i % 2 ? 1 : -1, cz = i > 1 ? 1 : -1;
      b.plank([cx, -0.12, cz], [1.96, 0.24, 1.96], c, 0.02);
    }
  }
  return b.build(r);
}
function buildModels(r) {
  const mkAO = (y0, y1, dark, f) => {
    const b = new MB();
    f(b);
    aoY(b.d, y0, y1, dark);
    return b.build(r);
  };
  const M = {};
  const mk = (f) => {
    const b = new MB();
    f(b);
    return b.build(r);
  };
  M.pickaxe = mk((b) => {
    b.cyl([0, 0, 0], 0.034, 0.028, 0.98, rgb(9069120), 12, true, true);
    b.cyl([0, 0.05, 0], 0.04, 0.04, 0.22, rgb(2763312), 10, true, true);
    for (let i = 0; i < 5; i++) b.torus([0, 0.08 + i * 0.045, 0], 0.041, 6e-3, rgb(1092), 10, 5);
    b.rbox([0, 0.92, 0], [0.12, 0.16, 0.12], rgb(4343374), 0.02);
    b.box([0, 0.92, 0.065], [0.06, 0.06, 0.01], C.gold);
    b.push(mul(translate(0.28, 0.93, 0), rotZ(-0.35)));
    b.cyl([0, 0, 0], 0.05, 0.012, 0.5, rgb(10463412), 8, true, true);
    b.cyl([0, 0.02, 0], 0.052, 0.02, 0.2, rgb(7239298), 8, true, true);
    b.pop();
    b.push(mul(translate(-0.16, 0.93, 0), rotZ(1.57)));
    b.box([0, 0, 0], [0.06, 0.28, 0.16], rgb(10463412));
    b.box([0, 0.13, 0], [0.02, 0.03, 0.2], rgb(13687010));
    b.pop();
    b.torus([0, 0.83, 0], 0.045, 0.01, rgb(7239298), 10, 5);
    b.torus([0, 1, 0], 0.045, 0.01, rgb(7239298), 10, 5);
  });
  const gunMetal = rgb(2631981), steelGrey = rgb(6647160), tanReceiver = rgb(13938024);
  M.ar = mk((b) => {
    b.rbox([0, 0, 0.12], [0.1, 0.16, 0.72], tanReceiver, 0.025);
    b.box([0, 0.09, 0.18], [0.055, 0.035, 0.58], gunMetal);
    b.cyl([0, 0.02, 0.85], 0.026, 0.026, 0.42, gunMetal, 12, true, true);
    b.cyl([0, 0.02, 1.25], 0.035, 0.035, 0.08, steelGrey, 8, true, true);
    b.box([0, 0.08, 1], [0.03, 0.08, 0.05], gunMetal);
    b.box([0, 0.12, 0.12], [0.04, 0.06, 0.04], gunMetal);
    b.push(mul(translate(0, -0.16, -0.04), rotX(0.35)));
    b.rbox([0, 0, 0], [0.065, 0.2, 0.09], gunMetal, 0.02);
    b.pop();
    b.push(mul(translate(0, -0.22, 0.22), rotX(0.25)));
    b.rbox([0, 0, 0], [0.065, 0.3, 0.11], gunMetal, 0.015);
    for (let i = -1; i <= 1; i++) b.box([0, i * 0.07, 0.06], [0.068, 0.02, 0.015], tanReceiver);
    b.pop();
    b.rbox([0, -0.01, -0.34], [0.075, 0.13, 0.34], tanReceiver, 0.02);
    b.rbox([0, -0.06, -0.51], [0.075, 0.17, 0.06], gunMetal, 0.015);
  });
  M.burst = mk((b) => {
    b.rbox([0, 0, 0.12], [0.095, 0.15, 0.72], rgb(9080958), 0.025);
    b.cyl([0, 0.02, 0.85], 0.028, 0.028, 0.36, gunMetal, 12, true, true);
    b.rbox([0, -0.16, -0.04], [0.065, 0.2, 0.09], gunMetal, 0.02);
    b.rbox([0, -0.22, 0.2], [0.065, 0.28, 0.11], gunMetal, 0.02);
    b.rbox([0, -0.01, -0.34], [0.075, 0.13, 0.32], rgb(9080958), 0.02);
    b.box([0, 0.12, 0.14], [0.05, 0.07, 0.32], gunMetal);
  });
  M.shotgun = mk((b) => {
    b.rbox([0, 0, -0.05], [0.095, 0.14, 0.46], gunMetal, 0.02);
    b.cyl([0, 0.035, 0.16], 0.032, 0.032, 0.85, gunMetal, 12, true, true);
    b.cyl([0, -0.042, 0.16], 0.03, 0.03, 0.6, steelGrey, 12, true, true);
    b.rbox([0, -0.042, 0.48], [0.095, 0.095, 0.24], rgb(7227950), 0.02);
    for (let i = 0; i < 5; i++) b.box([0, -0.042, 0.4 + i * 0.04], [0.1, 0.1, 0.012], rgb(4533531));
    b.push(mul(translate(0, -0.08, -0.22), rotX(0.2)));
    b.rbox([0, 0, 0], [0.075, 0.14, 0.18], rgb(7227950), 0.02);
    b.pop();
    b.rbox([0, -0.05, -0.42], [0.08, 0.16, 0.32], rgb(7227950), 0.025);
    b.box([0, -0.05, -0.58], [0.082, 0.17, 0.04], gunMetal);
  });
  M.sniper = mk((b) => {
    b.rbox([0, 0, 0.05], [0.085, 0.14, 0.68], rgb(5920326), 0.025);
    b.cyl([0, 0.02, 0.38], 0.032, 0.028, 1.15, gunMetal, 14, true, true);
    b.box([0, 0.02, 1.54], [0.09, 0.06, 0.14], gunMetal);
    b.cyl([0, 0.15, -0.08], 0.05, 0.05, 0.46, gunMetal, 16, true, true);
    b.cyl([0, 0.15, -0.16], 0.06, 0.05, 0.1, gunMetal, 16, true, true);
    b.cyl([0, 0.15, 0.36], 0.05, 0.065, 0.12, gunMetal, 16, true, true);
    b.sphere([0, 0.15, 0.46], 0.055, C.holographic, 12, 0.3, true);
    b.box([0, 0.08, -0.02], [0.04, 0.06, 0.06], steelGrey);
    b.box([0, 0.08, 0.22], [0.04, 0.06, 0.06], steelGrey);
    b.box([0.08, 0.04, -0.04], [0.09, 0.03, 0.03], steelGrey);
    b.sphere([0.13, 0.04, -0.04], 0.035, gunMetal, 8, 1, true);
    b.rbox([0, -0.02, -0.42], [0.075, 0.16, 0.38], rgb(5920326), 0.02);
    b.box([0, 0.07, -0.38], [0.076, 0.05, 0.18], gunMetal);
  });
  M.pistol = mk((b) => {
    b.rbox([0, 0.02, 0.06], [0.07, 0.1, 0.34], gunMetal, 0.015);
    b.cyl([0, 0.02, 0.26], 0.018, 0.018, 0.1, steelGrey, 10, true, true);
    b.push(mul(translate(0, -0.11, -0.06), rotX(0.3)));
    b.rbox([0, 0, 0], [0.06, 0.2, 0.08], rgb(3812900), 0.015);
    b.pop();
    b.box([0, -0.04, 0.02], [0.03, 0.05, 0.06], gunMetal);
    for (let i = 0; i < 4; i++) b.box([0.036, 0.04, -0.06 + i * 0.03], [4e-3, 0.06, 0.012], steelGrey);
  });
  M.revolver = mk((b) => {
    b.rbox([0, 0.03, 0.02], [0.06, 0.09, 0.3], gunMetal, 0.012);
    b.cyl([0, 0.04, 0.3], 0.016, 0.016, 0.22, steelGrey, 10, true, true);
    b.push(rotX(1.57));
    b.cyl([0, -0.06, 0.04], 0.045, 0.045, 0.12, steelGrey, 8, true, true);
    b.pop();
    b.push(mul(translate(0, -0.1, -0.1), rotX(0.4)));
    b.rbox([0, 0, 0], [0.05, 0.18, 0.07], rgb(7227950), 0.015);
    b.pop();
    b.box([0, -0.04, 0.02], [0.03, 0.05, 0.06], gunMetal);
    b.box([0, 0.09, -0.1], [0.02, 0.03, 0.03], gunMetal);
  });
  M.silenced = mk((b) => {
    b.rbox([0, 0.02, 0.06], [0.07, 0.1, 0.34], gunMetal, 0.015);
    b.cyl([0, 0.02, 0.4], 0.032, 0.032, 0.36, rgb(1710622), 10, true, true);
    b.push(mul(translate(0, -0.11, -0.06), rotX(0.3)));
    b.rbox([0, 0, 0], [0.06, 0.2, 0.08], rgb(3812900), 0.015);
    b.pop();
    b.box([0, -0.04, 0.02], [0.03, 0.05, 0.06], gunMetal);
    b.box([0, 0.09, 0], [0.03, 0.04, 0.16], C.holographic);
  });
  M.tac = mk((b) => {
    b.rbox([0, 0, -0.02], [0.1, 0.15, 0.5], rgb(3093560), 0.02);
    b.cyl([0, 0.035, 0.2], 0.03, 0.03, 0.7, gunMetal, 12, true, true);
    b.cyl([0, -0.04, 0.2], 0.03, 0.03, 0.6, steelGrey, 12, true, true);
    b.rbox([0, -0.04, 0.42], [0.1, 0.1, 0.3], rgb(3093560), 0.02);
    for (let i = 0; i < 6; i++) b.box([0, 0.1, 0.05 + i * 0.05], [0.05, 0.03, 0.02], gunMetal);
    b.push(mul(translate(0, -0.16, -0.06), rotX(0.35)));
    b.rbox([0, 0, 0], [0.065, 0.2, 0.09], gunMetal, 0.02);
    b.pop();
    b.rbox([0, -0.02, -0.4], [0.075, 0.14, 0.3], rgb(3093560), 0.02);
    b.rbox([0, -0.06, -0.56], [0.078, 0.17, 0.05], C.orange, 0.01);
  });
  M.hunting = mk((b) => {
    const wood = rgb(7227950);
    b.rbox([0, -0.02, -0.1], [0.08, 0.14, 0.9], wood, 0.025);
    b.cyl([0, 0.03, 0.5], 0.026, 0.024, 1, gunMetal, 12, true, true);
    b.box([0, 0.09, 0.95], [0.02, 0.06, 0.03], gunMetal);
    b.box([0, 0.1, -0.1], [0.06, 0.05, 0.03], gunMetal);
    b.box([0.07, 0.04, -0.06], [0.08, 0.03, 0.03], steelGrey);
    b.sphere([0.12, 0.04, -0.06], 0.03, gunMetal, 8, 1, true);
    b.rbox([0, -0.05, -0.55], [0.075, 0.17, 0.3], wood, 0.02);
    b.box([0, -0.05, -0.7], [0.08, 0.18, 0.04], gunMetal);
    b.box([0, -0.09, 0.1], [0.05, 0.05, 0.14], gunMetal);
  });
  M.scar = mk((b) => {
    b.rbox([0, 0, 0.12], [0.1, 0.16, 0.72], rgb(12099930), 0.025);
    b.box([0, 0.09, 0.18], [0.055, 0.035, 0.58], gunMetal);
    b.cyl([0, 0.02, 0.85], 0.028, 0.028, 0.45, gunMetal, 12, true, true);
    b.cyl([0, 0.02, 1.28], 0.04, 0.04, 0.1, C.gold, 8, true, true);
    b.box([0, 0.14, 0.1], [0.05, 0.06, 0.2], gunMetal);
    b.box([0, 0.14, 0.1], [0.03, 0.03, 0.14], C.holographic);
    b.push(mul(translate(0, -0.16, -0.04), rotX(0.35)));
    b.rbox([0, 0, 0], [0.065, 0.2, 0.09], gunMetal, 0.02);
    b.pop();
    b.push(mul(translate(0, -0.22, 0.22), rotX(0.25)));
    b.rbox([0, 0, 0], [0.065, 0.3, 0.11], rgb(12099930), 0.015);
    b.pop();
    b.rbox([0, -0.01, -0.34], [0.075, 0.13, 0.34], rgb(12099930), 0.02);
    b.rbox([0, -0.06, -0.51], [0.075, 0.17, 0.06], gunMetal, 0.015);
  });
  M.rpg = mk((b) => {
    const od = rgb(7306578);
    b.cyl([0, 0.05, 0.1], 0.075, 0.075, 1.3, od, 14, true, true);
    b.torus([0, 0.05, -0.5], 0.08, 0.02, gunMetal, 12, 6);
    b.torus([0, 0.05, 0.7], 0.08, 0.02, gunMetal, 12, 6);
    b.cyl([0, 0.05, 0.85], 0.1, 0.075, 0.2, gunMetal, 12, true, true);
    b.box([0, 0.17, -0.1], [0.04, 0.12, 0.2], gunMetal);
    b.box([0, 0.24, -0.1], [0.06, 0.05, 0.12], C.holographic);
    b.push(mul(translate(0, -0.12, -0.15), rotX(0.3)));
    b.rbox([0, 0, 0], [0.06, 0.2, 0.08], gunMetal, 0.02);
    b.pop();
    b.rbox([0, -0.06, 0.25], [0.06, 0.12, 0.1], gunMetal, 0.02);
    b.cyl([0, 0.05, 1], 0.07, 0.03, 0.22, rgb(14168112), 10, true, true);
  });
  M.rocket = mk((b) => {
    b.cyl([0, 0, 0.2], 0.06, 0.06, 0.5, rgb(7306578), 10, true, true);
    b.cyl([0, 0, 0.55], 0.06, 0, 0.18, rgb(14168112), 10, true, true);
    for (let k = 0; k < 4; k++) {
      b.push(mul(translate(0, 0, -0.05), rotZ(k * 1.57)));
      b.box([0.08, 0, 0], [0.1, 0.02, 0.12], gunMetal);
      b.pop();
    }
    b.sphere([0, 0, -0.15], 0.1, rgb(16756768), 8, 1, true);
  });
  M.miniShield = mk((b) => {
    b.cyl([0, 0.02, 0], 0.09, 0.1, 0.22, rgb(3842815), 12, true, true);
    b.cyl([0, 0.26, 0], 0.05, 0.05, 0.06, C.white, 10, true, true);
    b.box([0, 0.14, 0.1], [0.1, 0.08, 0.01], C.white);
  });
  M.grenade = mk((b) => {
    b.sphere([0, 0.15, 0], 0.14, rgb(4876858), 10, 1.2, true);
    b.cyl([0, 0.3, 0], 0.05, 0.05, 0.08, rgb(8947848), 8, true, true);
    b.box([0.06, 0.34, 0], [0.12, 0.02, 0.03], rgb(13421772));
    for (let k = 0; k < 3; k++) b.torus([0, 0.08 + k * 0.07, 0], 0.14, 8e-3, rgb(3033638), 10, 4);
  });
  M.launchpad = mkAO(0, 0.4, 0.7, (b) => {
    b.cyl([0, 0, 0], 1.5, 1.4, 0.25, rgb(2899546), 16, true, true);
    b.cyl([0, 0.25, 0], 1, 1, 0.08, C.blue, 16, true, true);
    for (let k = 0; k < 4; k++) {
      b.push(rotY(k * 1.57));
      b.box([0.5, 0.4, 0], [0.7, 0.06, 0.16], C.holographic);
      b.pop();
    }
    b.cyl([0, 0.3, 0], 0.25, 0.25, 0.3, C.yellow, 10, true, true);
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * 6.283;
      b.box([Math.cos(a) * 1.25, 0.16, Math.sin(a) * 1.25], [0.2, 0.1, 0.2], C.yellow);
    }
  });
  M.bushItem = mk((b) => {
    b.sphere([0, 0.25, 0], 0.25, C.leaf2, 8, 0.8, true);
    b.sphere([0.15, 0.3, 0.1], 0.16, C.leaf3, 8, 0.8, true);
    b.sphere([-0.15, 0.32, -0.05], 0.15, C.leaf, 8, 0.8, true);
  });
  M.boogie = mk((b) => {
    b.sphere([0, 0.16, 0], 0.16, rgb(13224408), 12, 1, true);
    for (let k = 0; k < 10; k++) {
      const a = k * 2.4, y = 0.16 + Math.sin(k * 1.7) * 0.1;
      b.sphere([Math.cos(a) * 0.14, y, Math.sin(a) * 0.14], 0.03, [C.red, C.blue, C.yellow, rgb(16727753)][k % 4], 6, 1, true);
    }
    b.cyl([0, 0.32, 0], 0.04, 0.04, 0.06, rgb(8947848), 8, true, true);
  });
  M.impulse = mk((b) => {
    b.sphere([0, 0.16, 0], 0.15, C.blue, 12, 1, true);
    b.torus([0, 0.16, 0], 0.16, 0.02, C.holographic, 14, 6);
    b.cyl([0, 0.32, 0], 0.04, 0.04, 0.06, rgb(8947848), 8, true, true);
  });
  M.chug = mk((b) => {
    b.cyl([0, 0, 0], 0.2, 0.22, 0.55, rgb(3842815), 14, true, true);
    b.torus([0, 0.35, 0.22], 0.08, 0.025, rgb(2912176), 12, 6);
    b.cyl([0, 0.55, 0], 0.09, 0.09, 0.08, rgb(2912176), 10, true, true);
    b.box([0, 0.28, 0.21], [0.22, 0.18, 0.01], C.white);
  });
  M.smg = mk((b) => {
    b.rbox([0, 0, 0.1], [0.085, 0.14, 0.46], gunMetal, 0.02);
    b.cyl([0, 0.02, 0.32], 0.026, 0.026, 0.28, gunMetal, 10, true, true);
    b.rbox([0, -0.16, 0.04], [0.065, 0.22, 0.08], gunMetal, 0.02);
    b.rbox([0, -0.22, 0.16], [0.055, 0.26, 0.08], steelGrey, 0.015);
    b.box([0, 0.08, -0.24], [0.04, 0.07, 0.22], steelGrey);
  });
  M.fish = mk((b) => {
    b.sphere([0, 0.3, 0], 0.52, rgb(3703528), 14, 0.65, true);
    b.tri([0, 0.3, -0.45], [0, 0.6, -0.88], [0, 0.02, -0.88], rgb(3703528));
    b.sphere([0.16, 0.36, 0.26], 0.05, C.white, 8, 1, true);
    b.sphere([0.18, 0.37, 0.28], 0.025, C.dark, 6, 1, true);
    b.sphere([-0.16, 0.36, 0.26], 0.05, C.white, 8, 1, true);
    b.sphere([-0.18, 0.37, 0.28], 0.025, C.dark, 6, 1, true);
  });
  M.rod = mk((b) => {
    b.push(rotX(-0.6));
    b.cyl([0, 0, 0], 0.024, 0.012, 1.7, rgb(13675119), 8, true, true);
    b.cyl([0.06, 0.35, 0], 0.05, 0.05, 0.06, steelGrey, 10, true, true);
    b.pop();
  });
  M.shieldPot = mk((b) => {
    b.cyl([0, 0, 0], 0.13, 0.13, 0.32, C.blue, 14, true, true);
    b.cyl([0, 0.32, 0], 0.05, 0.05, 0.09, C.white, 10, true, true);
    b.torus([0, 0.38, 0], 0.055, 0.015, rgb(10320466), 12, 6);
  });
  M.medkit = mk((b) => {
    b.rbox([0, 0.14, 0], [0.42, 0.26, 0.32], C.white, 0.04);
    b.box([0, 0.28, 0], [0.22, 0.04, 0.06], C.red);
    b.box([0, 0.28, 0], [0.06, 0.04, 0.22], C.red);
    b.rbox([0, 0.28, 0.17], [0.14, 0.08, 0.04], C.dark, 0.01);
  });
  M.bandage = mk((b) => {
    b.cyl([0, 0, 0], 0.15, 0.15, 0.13, C.white, 14, true, true);
    b.box([0, 0.065, 0], [0.32, 0.14, 0.06], C.red);
  });
  M.ammo = mk((b) => {
    b.rbox([0, 0.11, 0], [0.32, 0.22, 0.22], rgb(4357429), 0.02);
    b.box([0, 0.23, 0], [0.34, 0.035, 0.24], C.dark);
    b.box([0, 0.14, 0.115], [0.08, 0.05, 0.02], C.gold);
  });
  M.tracer = mk((b) => b.box([0, 0, 0.5], [0.035, 0.035, 1], rgb(16771717)));
  M["wall_wood"] = mk((b) => {
    const plankCol = C.wood, frameCol = C.woodDark;
    for (const x of [-1.9, -0.65, 0.65, 1.9]) {
      b.box([x, 2, 0.08], [0.14, 4, 0.14], frameCol);
    }
    b.box([0, 0.07, 0.08], [4, 0.14, 0.14], frameCol);
    b.box([0, 3.93, 0.08], [4, 0.14, 0.14], frameCol);
    b.push(mul(translate(0, 2, 0.08), rotZ(0.785)));
    b.box([0, 0, 0], [0.12, 5.4, 0.12], frameCol);
    b.pop();
    for (let i = 0; i < 8; i++) {
      const y = 0.25 + i * 0.5;
      b.plank([0, y, -0.04], [3.96, 0.46, 0.1], plankCol, 0.02);
      for (const x of [-1.9, -0.65, 0.65, 1.9]) {
        b.sphere([x, y, 0.02], 0.015, rgb(4473924), 6, 1, true);
      }
    }
  });
  M["ramp_wood"] = mk((b) => {
    const plankCol = C.wood, frameCol = C.woodDark;
    for (const x of [-1.9, 1.9]) {
      b.push(mul(translate(x, 2, 0), rotX(-0.785)));
      b.box([0, 0, -0.1], [0.16, 5.66, 0.18], frameCol);
      b.pop();
    }
    b.box([-1.9, 2, 1.9], [0.15, 4, 0.15], frameCol);
    b.box([1.9, 2, 1.9], [0.15, 4, 0.15], frameCol);
    for (let i = 0; i < 8; i++) {
      const z = -1.75 + i * 0.5, y = 0.25 + i * 0.5;
      b.plank([0, y, z], [3.92, 0.08, 0.52], plankCol, 0.02);
      b.box([0, y - 0.22, z + 0.24], [3.9, 0.44, 0.06], frameCol);
    }
  });
  M["floor_wood"] = mk((b) => {
    const plankCol = C.wood, frameCol = C.woodDark;
    for (const x of [-1.9, 0, 1.9]) b.box([x, -0.18, 0], [0.15, 0.22, 4], frameCol);
    for (const z of [-1.9, 1.9]) b.box([0, -0.18, z], [4, 0.22, 0.15], frameCol);
    for (let i = 0; i < 8; i++) {
      const z = -1.75 + i * 0.5;
      b.plank([0, -0.04, z], [3.96, 0.08, 0.48], plankCol, 0.02);
    }
  });
  M["pyramid_wood"] = mk((b) => {
    const top = [0, 2, 0], a = [-2, 0, -2], bb = [2, 0, -2], cc = [2, 0, 2], d = [-2, 0, 2];
    b.tri(a, top, bb, C.wood);
    b.tri(bb, top, cc, C.wood);
    b.tri(cc, top, d, C.wood);
    b.tri(d, top, a, C.wood);
    b.quad(a, bb, cc, d, C.woodDark);
    for (const pt of [a, bb, cc, d]) {
      b.push(mul(translate(pt[0] * 0.5, 1, pt[2] * 0.5), rotY(Math.atan2(pt[0], pt[2]))));
      b.box([0, 0, 0], [0.14, 2.8, 0.14], C.woodDark);
      b.pop();
    }
  });
  M["wall_stone"] = mk((b) => {
    b.box([0, 2, 0], [4, 4, 0.26], C.stone);
    for (let r2 = 0; r2 < 8; r2++) {
      const y = 0.25 + r2 * 0.5, off = r2 % 2 * 0.4;
      b.box([0, y, 0.14], [4, 0.03, 0.02], C.stoneDark);
      for (let x = -1.6 + off; x <= 1.8; x += 0.8) {
        b.box([x, y, 0.14], [0.03, 0.46, 0.02], C.stoneDark);
      }
    }
    for (const sx of [-1.92, 1.92]) b.box([sx, 2, 0], [0.18, 4, 0.32], C.stoneLight);
  });
  M["ramp_stone"] = mk((b) => {
    b.quad([-2, 0, -2], [-2, 4, 2], [2, 4, 2], [2, 0, -2], C.stone);
    b.quad([2, -0.25, -2], [2, 3.75, 2], [-2, 3.75, 2], [-2, -0.25, -2], C.stoneDark);
    for (let i = 0; i < 8; i++) {
      const z = -1.75 + i * 0.5, y = 0.25 + i * 0.5;
      b.box([0, y, z], [3.96, 0.1, 0.5], C.stoneLight);
    }
  });
  M["floor_stone"] = mk((b) => {
    b.box([0, -0.12, 0], [4, 0.24, 4], C.stone);
    b.box([0, -0.12, 1.95], [4, 0.26, 0.1], C.stoneDark);
    b.box([0, -0.12, -1.95], [4, 0.26, 0.1], C.stoneDark);
  });
  M["pyramid_stone"] = mk((b) => {
    const top = [0, 2, 0], a = [-2, 0, -2], bb = [2, 0, -2], cc = [2, 0, 2], d = [-2, 0, 2];
    b.tri(a, top, bb, C.stone);
    b.tri(bb, top, cc, C.stone);
    b.tri(cc, top, d, C.stone);
    b.tri(d, top, a, C.stone);
    b.quad(a, bb, cc, d, C.stoneDark);
  });
  M["wall_metal"] = mk((b) => {
    b.box([0, 2, 0], [4, 4, 0.12], C.metal);
    for (const sx of [-1.92, 1.92]) b.box([sx, 2, 0], [0.16, 4, 0.24], C.metalDark);
    b.box([0, 0.08, 0], [4, 0.16, 0.24], C.metalDark);
    b.box([0, 3.92, 0], [4, 0.16, 0.24], C.metalDark);
    for (let x = -1.7; x <= 1.7; x += 0.22) {
      b.cyl([x, 2, 0.07], 0.045, 0.045, 3.8, C.metalLight, 8, false, true);
    }
  });
  M["ramp_metal"] = mk((b) => {
    b.quad([-2, 0, -2], [-2, 4, 2], [2, 4, 2], [2, 0, -2], C.metal);
    for (const sx of [-1.9, 1.9]) {
      b.push(mul(translate(sx, 2, 0), rotX(-0.785)));
      b.box([0, 0, 0], [0.18, 5.66, 0.18], C.metalDark);
      b.pop();
    }
    for (let i = 0; i < 8; i++) {
      const z = -1.75 + i * 0.5, y = 0.25 + i * 0.5;
      b.box([0, y, z], [3.9, 0.08, 0.48], C.metalLight);
    }
  });
  M["floor_metal"] = mk((b) => {
    b.box([0, -0.12, 0], [4, 0.24, 4], C.metal);
    for (const x of [-1.9, 0, 1.9]) b.box([x, -0.14, 0], [0.16, 0.26, 4], C.metalDark);
  });
  M["pyramid_metal"] = mk((b) => {
    const top = [0, 2, 0], a = [-2, 0, -2], bb = [2, 0, -2], cc = [2, 0, 2], d = [-2, 0, 2];
    b.tri(a, top, bb, C.metal);
    b.tri(bb, top, cc, C.metal);
    b.tri(cc, top, d, C.metal);
    b.tri(d, top, a, C.metal);
    b.quad(a, bb, cc, d, C.metalDark);
  });
  M.pine = mkAO(0, 7.5, 0.5, (b) => {
    b.cyl([0, 0, 0], 0.42, 0.12, 9, C.trunk, 10, true, false);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * 6.283;
      b.push(mul(translate(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32), rotY(a)));
      b.cyl([0, 0, 0], 0.16, 0.04, 0.8, C.trunkDark, 6, true, false);
      b.pop();
    }
    const tiers = 7;
    for (let i = 0; i < tiers; i++) {
      const y = 1.6 + i * 1.05, rB = 3 - i * 0.38, col = i % 2 ? C.pine2 : C.pine, seg = 7;
      b.push(mul(translate(0, y, 0), rotY(i * 0.45)));
      b.cyl([0, 0, 0], rB, 0.12, 1.5 + rB * 0.15, col, seg, false, false);
      b.cyl([0, -0.35, 0], rB * 0.82, rB * 0.55, 0.5, dk(col, 0.8), seg, false, false);
      b.cyl([0, 0.9, 0], rB * 0.5, 0.08, 0.9, lt(col, 0.14), seg, false, false);
      b.pop();
    }
    b.cyl([0, 8.6, 0], 0.5, 0.03, 1.5, lt(C.pine, 0.18), 6, true, false);
  });
  M.tree = mkAO(0, 6.5, 0.55, (b) => {
    b.cyl([0, 0, 0], 0.62, 0.36, 4.2, C.trunk, 12, true, true);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26 + 0.4;
      b.push(mul(translate(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5), rotY(a)));
      b.cyl([0, 0, 0], 0.28, 0.06, 0.9, C.trunkDark, 6, true, true);
      b.pop();
    }
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * 6.283, y = 0.3 + i % 4 * 0.9;
      b.box([Math.cos(a) * 0.5, y, Math.sin(a) * 0.5], [0.08, 0.5 + i % 3 * 0.2, 0.08], dk(C.trunk, 0.8));
    }
    const boughs = [[0.3, 2.9, 1], [2, 3.3, 0.9], [3.9, 3, 1.1], [5.4, 3.6, 0.85]];
    for (const [a, y, l] of boughs) {
      b.push(mul(translate(Math.cos(a) * 0.25, y, Math.sin(a) * 0.25), mul(rotY(-a + 1.57), rotX(1.05))));
      b.cyl([0, 0, 0], 0.22, 0.08, 2.6 * l, C.trunk, 8, true, true);
      b.pop();
    }
    let seed = 3;
    const rr = () => {
      seed = seed * 16807 % 2147483647;
      return seed / 2147483647;
    };
    const lobe = (x, y, z, r2, c) => b.sphere([x, y, z], r2, c, 9, 0.72 + rr() * 0.2, true);
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * 6.283 + rr() * 0.4, d = 1.9 + rr() * 0.6;
      lobe(Math.cos(a) * d, 4.4 + rr() * 0.6, Math.sin(a) * d, 1.15 + rr() * 0.35, i % 2 ? C.leaf2 : dk(C.leaf, 0.92));
    }
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * 6.283 + 0.35 + rr() * 0.4, d = 1.5 + rr() * 0.5;
      lobe(Math.cos(a) * d, 5.6 + rr() * 0.6, Math.sin(a) * d, 1.2 + rr() * 0.35, i % 2 ? C.leaf : C.leaf3);
    }
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * 6.283 + rr(), d = 0.7 + rr() * 0.5;
      lobe(Math.cos(a) * d, 6.7 + rr() * 0.5, Math.sin(a) * d, 1.05 + rr() * 0.3, lt(C.leaf3, 0.1));
    }
    lobe(0, 5.3, 0, 1.9, C.leaf2);
    lobe(0.4, 7.4, 0.2, 0.95, lt(C.leaf3, 0.25));
  });
  M.tree2 = mkAO(0, 6.5, 0.55, (b) => {
    const bark = rgb(15262936), mark = rgb(3814960), leafA = rgb(11065418), leafB = rgb(9226298), leafC = rgb(12904544);
    b.cyl([0, 0, 0], 0.3, 0.18, 5.2, bark, 12, true, true);
    for (let k = 0; k < 9; k++) {
      const a = k * 2.1, y = 0.4 + k * 0.5;
      b.box([Math.cos(a) * 0.24, y, Math.sin(a) * 0.24], [0.14, 0.08 + k % 3 * 0.04, 0.06], mark);
    }
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + 0.8;
      b.push(mul(translate(Math.cos(a) * 0.15, 3 + i * 0.4, Math.sin(a) * 0.15), mul(rotY(a), rotX(0.8))));
      b.cyl([0, 0, 0], 0.1, 0.04, 2.2, bark, 8, true, true);
      b.pop();
    }
    b.sphere([0, 5.6, 0], 1.7, leafB, 12, 0.9, true);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * 6.283, rr = 1.5 + i % 2 * 0.4;
      b.sphere([Math.cos(a) * rr, 4.8 + i % 3 * 0.7, Math.sin(a) * rr], 0.9 + i % 2 * 0.2, [leafA, leafB, leafC][i % 3], 10, 0.9, true);
    }
    b.sphere([0.2, 6.9, 0.1], 1, leafC, 10, 0.85, true);
  });
  M.rock = mkAO(0, 1.6, 0.6, (b) => {
    b.sphere([0, 0.45, 0], 1.6, C.rock, 7, 0.7, false);
    b.sphere([1, 0.3, 0.7], 1, C.rockDark, 6, 0.8, false);
    b.sphere([-0.8, 0.3, -0.6], 0.85, lt(C.rock, 0.1), 6, 0.75, false);
    b.sphere([0.2, 0.2, -1.1], 0.5, C.rockDark, 6, 0.8, false);
    b.sphere([0.1, 1.45, 0.1], 0.8, lt(C.leaf2, 0.1), 7, 0.35, false);
    b.sphere([-0.9, 0.8, -0.3], 0.3, lt(C.leaf2, 0.05), 6, 0.4, false);
  });
  M.bush = mkAO(0, 1.3, 0.6, (b) => {
    b.cyl([0, 0, 0], 0.08, 0.05, 0.4, C.trunkDark, 6, true, true);
    b.sphere([0, 0.5, 0], 1, C.leaf2, 10, 0.75, true);
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      b.sphere([Math.cos(a) * 0.65, 0.35 + i % 2 * 0.25, Math.sin(a) * 0.65], 0.6, i % 2 ? C.leaf : C.leaf3, 8, 0.8, true);
    }
    b.sphere([0.2, 0.95, 0.1], 0.55, lt(C.leaf3, 0.15), 8, 0.7, true);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.1 + 0.3;
      b.sphere([Math.cos(a) * 0.9, 0.5 + i % 3 * 0.2, Math.sin(a) * 0.9], 0.07, C.red, 6, 1, true);
    }
  });
  M.hedge = mkAO(0, 2, 0.6, (b) => {
    b.rbox([0, 0.7, 0], [4, 1.4, 0.9], rgb(3706676), 0.12);
  });
  M.waterTower = mkAO(0, 6, 0.7, (b) => {
    const steel = rgb(5923694), tankCol = rgb(9411238), roofCol = rgb(4343890);
    const legR = 3.6, H = 14;
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4;
      const x0 = Math.cos(a) * legR, z0 = Math.sin(a) * legR;
      const x1 = Math.cos(a) * (legR * 0.75), z1 = Math.sin(a) * (legR * 0.75);
      b.push(mul(translate((x0 + x1) / 2, H / 2, (z0 + z1) / 2), rotY(a)));
      b.box([0, 0, 0], [0.35, H, 0.35], steel);
      b.pop();
    }
    for (let h = 3; h <= H; h += 3.5) {
      for (let i = 0; i < 4; i++) {
        const a0 = i / 4 * Math.PI * 2 + Math.PI / 4, a1 = (i + 1) / 4 * Math.PI * 2 + Math.PI / 4;
        const k = 1 - h / H * 0.25;
        const p0 = [Math.cos(a0) * legR * k, h, Math.sin(a0) * legR * k];
        const p1 = [Math.cos(a1) * legR * k, h, Math.sin(a1) * legR * k];
        b.push(mul(translate((p0[0] + p1[0]) / 2, h, (p0[1] + p1[1]) / 2), rotY(Math.atan2(p1[0] - p0[0], p1[2] - p0[2]))));
        b.box([0, 0, 0], [0.15, 0.15, Math.hypot(p1[0] - p0[0], p1[2] - p0[2])], steel);
        b.pop();
      }
    }
    b.cyl([0, H + 0.15, 0], 3.8, 3.8, 0.3, steel, 16, true, true);
    b.torus([0, H + 1.2, 0], 3.75, 0.05, steel, 16, 6);
    b.cyl([0, H + 0.3, 0], 3.4, 3.4, 5.6, tankCol, 24, true, true);
    for (let y = H + 1.2; y <= H + 5.2; y += 1.3) {
      b.torus([0, y, 0], 3.42, 0.04, rgb(3685958), 24, 6);
    }
    b.cyl([0, H + 5.9, 0], 3.6, 0.1, 1.8, roofCol, 24, true, true);
    b.sphere([0, H + 7.8, 0], 0.25, C.gold, 10, 1, true);
  });
  M.barn = mkAO(0, 2.5, 0.65, (b) => {
    const red = rgb(11022886), white = rgb(15790318), roof = rgb(4869458);
    b.box([0, 3.5, 0], [16, 7, 22], red);
    for (const sx of [-8.05, 8.05]) for (const sz of [-11.05, 11.05]) {
      b.box([sx, 3.5, sz], [0.35, 7, 0.35], white);
    }
    b.box([0, 2.5, 11.08], [4.8, 5, 0.15], white);
    b.box([0, 2.5, 11.16], [4.6, 4.8, 0.08], red);
    b.box([0, 7.5, 11.08], [2.2, 2.2, 0.12], white);
    b.box([0, 7.5, 11.09], [1.8, 1.8, 0.04], C.dark);
    b.push(mul(translate(0, 7, 0), rotX(0)));
    b.cyl([0, 0, 0], 8.2, 8.2, 22.4, roof, 8, true, true);
    b.pop();
  });
  M.truck = mkAO(0, 1, 0.62, (b) => {
    const red = rgb(13645868), chrome = rgb(13421772);
    b.rbox([0, 0.75, 0.8], [2, 0.65, 1.8], red, 0.08);
    b.rbox([0, 1.35, -0.3], [1.9, 0.85, 1.6], red, 0.08);
    b.box([0, 1.38, 0.52], [1.7, 0.55, 0.04], C.glass);
    b.box([0, 1.38, -0.3], [1.92, 0.48, 1.3], C.glass);
    b.rbox([0, 0.85, -1.8], [2, 0.55, 2.2], red, 0.06);
    b.box([0, 0.65, -1.8], [1.7, 0.12, 2], rgb(4473924));
    b.box([0, 0.75, 1.72], [1.6, 0.35, 0.06], chrome);
    b.sphere([-0.7, 0.75, 1.74], 0.12, rgb(16775376), 10, 1, true);
    b.sphere([0.7, 0.75, 1.74], 0.12, rgb(16775376), 10, 1, true);
    for (let k = 0; k < 5; k++) b.box([0, 0.62 + k * 0.07, 1.73], [1.4, 0.02, 0.02], dk(chrome, 0.7));
    b.box([0, 0.45, 1.78], [2.1, 0.18, 0.1], chrome);
    b.box([0, 0.45, -2.95], [2.1, 0.18, 0.1], chrome);
    for (const sx of [-1, 1]) {
      b.box([sx, 1.4, 0.35], [0.2, 0.12, 0.1], red);
      b.box([sx * 0.96, 1.15, -0.3], [0.01, 0.5, 0.02], dk(red, 0.6));
      b.box([sx * 0.98, 1.2, -0.1], [0.04, 0.03, 0.2], chrome);
    }
    b.box([0, 1.82, -0.3], [1.7, 0.06, 1.4], dk(red, 0.9));
    for (let k = -1; k <= 1; k++) b.sphere([k * 0.5, 1.87, 0.2], 0.06, rgb(16756768), 8, 1, true);
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) b.box([sx, 1, -1 - k * 0.55], [0.05, 0.45, 0.06], dk(red, 0.75));
    b.box([0, 0.98, -2.88], [1.9, 0.4, 0.06], dk(red, 0.85));
    b.box([0, 1, -2.92], [0.5, 0.15, 0.02], rgb(16053488));
    for (const sx of [-0.8, 0.8]) b.box([sx, 0.9, -2.93], [0.22, 0.14, 0.03], rgb(14168112));
    b.push(mul(translate(-0.4, 1.15, -1.8), rotY(0.3)));
    b.box([0, 0, 0], [0.8, 0.6, 0.8], rgb(11569754));
    b.pop();
    b.cyl([0.5, 0.71, -1.4], 0.3, 0.3, 0.7, rgb(3829672), 12, true, true);
    for (const sx of [-1.05, 1.05]) {
      for (const sz of [-1.6, 1]) {
        b.push(mul(translate(sx, 0.38, sz), rotZ(Math.PI / 2)));
        b.cyl([0, 0, 0], 0.38, 0.38, 0.26, rgb(2105894), 16, true, true);
        b.cyl([0, 0.02, 0], 0.22, 0.22, 0.28, chrome, 12, true, true);
        b.pop();
      }
    }
  });
  M.car = mkAO(0, 0.9, 0.62, (b) => {
    const y = rgb(3700950), chrome = rgb(14540253);
    b.rbox([0, 0.55, 0], [1.9, 0.52, 4.2], y, 0.08);
    b.rbox([0, 1.05, -0.2], [1.65, 0.52, 2.2], y, 0.08);
    b.box([0, 1.05, -0.2], [1.68, 0.34, 2], C.glass);
    b.box([0, 1.05, 0.92], [1.45, 0.35, 0.08], C.glass);
    b.box([0, 0.52, 2.12], [1.65, 0.18, 0.08], chrome);
    b.sphere([-0.65, 0.62, 2.14], 0.11, rgb(16775376), 10, 1, true);
    b.sphere([0.65, 0.62, 2.14], 0.11, rgb(16775376), 10, 1, true);
    for (const sx of [-0.96, 0.96]) {
      b.box([sx, 0.7, -0.2], [0.01, 0.4, 0.02], dk(y, 0.6));
      b.box([sx, 0.7, 0.6], [0.01, 0.4, 0.02], dk(y, 0.6));
      b.box([sx, 0.85, 0.2], [0.03, 0.03, 0.18], chrome);
    }
    for (const sx of [-0.9, 0.9]) b.box([sx, 1, 0.85], [0.18, 0.1, 0.08], y);
    b.box([0, 1.33, -0.2], [1.5, 0.05, 2.1], dk(y, 0.9));
    b.box([0, 0.62, -2.12], [0.4, 0.15, 0.03], rgb(16053488));
    b.box([0, 0.72, -2.12], [1.6, 0.16, 0.04], rgb(14168112));
    b.box([0, 0.5, -2.12], [1.65, 0.18, 0.08], chrome);
    for (const sx of [-0.95, 0.95]) {
      for (const sz of [-1.3, 1.3]) {
        b.push(mul(translate(sx, 0.35, sz), rotZ(Math.PI / 2)));
        b.cyl([0, 0, 0], 0.35, 0.35, 0.24, rgb(2236966), 16, true, true);
        b.torus([0, 0.13 * Math.sign(sx), 0], 0.3, 0.03, rgb(3026483), 16, 6);
        b.cyl([0, 0.02, 0], 0.2, 0.2, 0.26, chrome, 12, true, true);
        for (let k = 0; k < 5; k++) {
          const a = k / 5 * 6.283;
          b.box([Math.cos(a) * 0.12, 0.14 * Math.sign(sx), Math.sin(a) * 0.12], [0.06, 0.02, 0.06], dk(chrome, 0.7));
        }
        b.pop();
      }
    }
  });
  M.crate = mkAO(0, 1.2, 0.72, (b) => {
    const c = rgb(11569754);
    b.box([0, 1, 0], [2, 2, 2], c);
    for (const e of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      b.box([e[0], 1, e[1]], [e[0] ? 0.08 : 2.04, 2.04, e[1] ? 0.08 : 2.04], dk(c, 0.7));
      b.box([e[0], 0.06, e[1]], [e[0] ? 0.08 : 2.04, 0.12, e[1] ? 0.08 : 2.04], dk(c, 0.7));
      b.box([e[0], 1.94, e[1]], [e[0] ? 0.08 : 2.04, 0.12, e[1] ? 0.08 : 2.04], dk(c, 0.7));
    }
    b.box([0, 2.02, 0], [2.04, 0.06, 2.04], dk(c, 0.8));
    b.box([0.3, 1.2, 1.03], [0.7, 0.4, 0.02], rgb(3355443));
  });
  M.mountains = mk((b) => {
    let seed = 7;
    const rr = () => {
      seed = seed * 16807 % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 44; i++) {
      const a = i / 44 * 6.283 + rr() * 0.1, rad = 470 + rr() * 90, h = 40 + rr() * 70, w = 45 + rr() * 50;
      b.cyl([Math.cos(a) * rad, -5, Math.sin(a) * rad], w, w * 0.08, h, i % 3 ? rgb(7309930) : rgb(9080710), 5, false, false);
      if (h > 85) b.cyl([Math.cos(a) * rad, h * 0.62 - 5, Math.sin(a) * rad], w * 0.36, w * 0.08, h * 0.38, rgb(15791352), 5, false, false);
    }
  });
  M.pole = mkAO(0, 2.5, 0.65, (b) => {
    const w = rgb(8020552);
    b.cyl([0, 0, 0], 0.16, 0.13, 9, w, 8, true, true);
    b.box([0, 8.4, 0], [2.2, 0.14, 0.14], w);
    b.box([0, 7.6, 0], [1.6, 0.12, 0.12], w);
    for (const x of [-0.9, -0.3, 0.3, 0.9]) b.cyl([x, 8.55, 0], 0.05, 0.05, 0.16, rgb(7320520), 6, true, true);
    b.box([0.5, 4.5, 0], [0.5, 0.7, 0.5], rgb(10133670));
  });
  M.flowers = mkAO(0, 0.3, 0.8, (b) => {
    let sd = 5;
    const rr = () => {
      sd = sd * 16807 % 2147483647;
      return sd / 2147483647;
    };
    for (let k = 0; k < 14; k++) {
      const x = (rr() - 0.5) * 2.4, z = (rr() - 0.5) * 2.4, c = [C.red, C.yellow, rgb(16734899), C.white, rgb(16747038)][k % 5];
      b.cyl([x, 0, z], 0.02, 0.015, 0.3, dk(C.leaf2, 0.8), 5, true, true);
      b.sphere([x, 0.32, z], 0.07, c, 6, 0.7, true);
    }
    b.sphere([0, 0.1, 0], 0.9, dk(C.leaf2, 0.9), 8, 0.25, true);
  });
  M.curb = mkAO(0, 0.3, 0.75, (b) => {
    b.box([0, 0.12, 0], [0.5, 0.24, 8], rgb(12105390));
    b.box([0.9, 0.1, 0], [1.4, 0.2, 8], rgb(11118496));
    for (let k = -3; k <= 3; k++) b.box([0.9, 0.21, k * 1.15], [1.42, 0.01, 0.04], rgb(9407878));
  });
  M.sign = mkAO(0, 1, 0.7, (b) => {
    b.cyl([0, 0, 0], 0.05, 0.05, 2.6, rgb(8028038), 8, true, true);
    b.box([0, 2.5, 0], [0.9, 0.22, 0.04], rgb(3115578));
    b.box([0, 2.5, 0.025], [0.7, 0.1, 0.01], C.white);
    b.box([0, 1.9, 0], [0.6, 0.6, 0.04], rgb(14168112));
    b.box([0, 1.9, 0.025], [0.4, 0.08, 0.01], C.white);
  });
  M.bridge = mkAO(-2, 0.5, 0.7, (b) => {
    const w = rgb(10123856);
    for (let i = 0; i < 16; i++) b.plank([0, 0.3, -3.75 + i * 0.5], [4.4, 0.16, 0.46], w, 0.02);
    for (const sx of [-2.1, 2.1]) {
      b.box([sx, 0.15, 0], [0.25, 0.4, 8], dk(w, 0.7));
      b.box([sx, 1.1, 0], [0.08, 0.08, 8], dk(w, 0.8));
      for (let k = -3; k <= 3; k++) b.box([sx, 0.7, k * 1.2], [0.1, 0.9, 0.1], dk(w, 0.8));
    }
    for (const sz of [-3, 0, 3]) for (const sx of [-1.8, 1.8]) b.cyl([sx, -2, sz], 0.2, 0.2, 2.5, dk(w, 0.6), 8, true, true);
  });
  M.beam = mk((b) => b.cyl([0, 0, 0], 0.18, 0.05, 2.4, C.white, 8, false, true));
  M.glow = mk((b) => b.sphere([0, 0.4, 0], 1, rgb(16765498), 12, 0.9, true));
  M.chest = mkAO(0, 0.6, 0.7, (b) => {
    b.rbox([0, 0.35, 0], [1.44, 0.7, 0.94], C.woodDark, 0.04);
    b.rbox([0, 0.86, 0], [1.48, 0.34, 0.98], C.wood, 0.05);
    for (const sx of [-0.52, 0.52]) {
      b.box([sx, 0.52, 0], [0.1, 1.06, 1.02], rgb(3814962));
      for (let y = 0.15; y < 1; y += 0.25) {
        b.sphere([sx, y, 0.52], 0.02, C.gold, 6, 1, true);
        b.sphere([sx, y, -0.52], 0.02, C.gold, 6, 1, true);
      }
    }
    b.box([0, 0.58, 0.49], [0.32, 0.32, 0.08], C.gold);
    b.cyl([0, 0.58, 0.53], 0.04, 0.04, 0.02, C.dark, 8);
  });
  M.chestOpen = mk((b) => {
    b.rbox([0, 0.35, 0], [1.44, 0.7, 0.94], C.woodDark, 0.04);
    b.push(mul(translate(0, 0.85, -0.45), rotX(-1.2)));
    b.rbox([0, 0.2, 0], [1.48, 0.34, 0.98], C.wood, 0.05);
    b.pop();
    b.box([0, 0.55, 0], [1.32, 0.12, 0.82], C.gold);
  });
  M.lamp = mkAO(0, 1.5, 0.7, (b) => {
    b.cyl([0, 0, 0], 0.16, 0.09, 4.8, rgb(2763824), 12, true, true);
    b.cyl([0, 0, 0], 0.26, 0.18, 0.5, rgb(2763824), 12, true, true);
    b.push(mul(translate(0, 4.8, 0), rotZ(-1.35)));
    b.cyl([0, 0, 0], 0.07, 0.05, 1.15, rgb(2763824), 10, true, true);
    b.pop();
    b.box([1.05, 4.9, 0], [0.5, 0.12, 0.26], rgb(2763824));
    b.box([1.05, 4.82, 0], [0.42, 0.05, 0.2], rgb(16774864));
    b.sphere([1.05, 4.76, 0], 0.1, rgb(16774864), 10, 0.8, true);
  });
  M.bench = mkAO(0, 0.5, 0.7, (b) => {
    b.box([0, 0.45, 0], [1.7, 0.08, 0.52], C.wood);
    b.box([0, 0.8, -0.22], [1.7, 0.48, 0.07], C.wood);
    for (const x of [-0.75, 0.75]) b.rbox([x, 0.25, 0], [0.09, 0.54, 0.54], rgb(2763824), 0.02);
  });
  M.fence = mkAO(0, 0.8, 0.7, (b) => {
    for (let i = 0; i < 9; i++) {
      b.box([-4 + i, 0.55, 0], [0.14, 1.1, 0.06], rgb(16053488));
      b.push(mul(translate(-4 + i, 1.1, 0), rotZ(Math.PI / 4)));
      b.box([0, 0, 0], [0.14, 0.14, 0.06], rgb(16053488));
      b.pop();
    }
    b.box([0, 0.42, 0], [8.2, 0.09, 0.05], rgb(16053488));
    b.box([0, 0.88, 0], [8.2, 0.09, 0.05], rgb(16053488));
  });
  M.mailbox = mkAO(0, 0.8, 0.7, (b) => {
    b.cyl([0, 0, 0], 0.06, 0.06, 1.1, rgb(5917242), 8, true, true);
    b.rbox([0, 1.22, 0], [0.26, 0.26, 0.48], rgb(2909365), 0.06);
    b.box([0.16, 1.32, 0.12], [0.03, 0.22, 0.04], C.red);
  });
  M.dash = mk((b) => b.box([0, 0.03, 0], [0.5, 0.06, 2.4], rgb(16053492)));
  M.fountain = mkAO(0, 1, 0.7, (b) => {
    b.cyl([0, 0, 0], 3.2, 3.2, 0.5, rgb(11451330), 24, true, true);
    b.cyl([0, 0.48, 0], 2.8, 2.8, 0.2, rgb(4570846), 24, true, true);
    b.cyl([0, 0.5, 0], 0.6, 0.8, 2.6, rgb(13029845), 16, true, true);
    b.sphere([0, 3.2, 0], 0.78, rgb(14213603), 14, 0.9, true);
  });
  M.dumpster = mkAO(0, 0.8, 0.7, (b) => {
    b.rbox([0, 0.7, 0], [2.2, 1.35, 1.25], rgb(3042900), 0.05);
    b.push(rotX(-0.25));
    b.rbox([0, 1.4, -0.1], [2.25, 0.16, 1.3], rgb(2250048), 0.03);
    b.pop();
    for (const x of [-0.85, 0.85]) b.cyl([x, 0.12, 0.55], 0.18, 0.18, 0.16, rgb(546), 10, true, true);
  });
  M.bus = mkAO(0, 1.2, 0.65, (b) => {
    b.rbox([0, 1.4, 0], [3.3, 2.6, 10.2], C.bus, 0.14);
    for (let i = 0; i < 6; i++) {
      b.box([1.68, 1.9, -3.8 + i * 1.5], [0.06, 1, 1.1], C.glass);
      b.box([-1.68, 1.9, -3.8 + i * 1.5], [0.06, 1, 1.1], C.glass);
    }
    b.box([0, 1.9, 5.12], [2.9, 1, 0.06], C.glass);
    b.box([0, 0.3, 5.2], [3.3, 0.35, 0.22], rgb(13421772));
    b.box([0, 1.15, 0], [3.34, 0.22, 10.2], C.white);
    b.box([0, 0.95, 0], [3.34, 0.1, 10.2], C.yellow);
    b.box([0, 2.55, 0], [3.34, 0.1, 10.2], dk(C.bus, 0.7));
    for (let i = 0; i < 6; i++) {
      b.box([0, 1.9, -3.05 + i * 1.5], [3.4, 1.06, 0.06], dk(C.bus, 0.75));
    }
    for (const sx of [-1.2, 1.2]) {
      b.sphere([sx, 1, 5.15], 0.22, rgb(16775376), 10, 1, true);
      b.box([sx, 0.62, -5.12], [0.5, 0.25, 0.05], rgb(14168112));
    }
    b.box([0, 0.75, 5.18], [2.2, 0.45, 0.06], rgb(3355443));
    for (let k = 0; k < 4; k++) b.box([0, 0.6 + k * 0.1, 5.2], [2, 0.02, 0.02], rgb(8947848));
    b.box([0, 2.25, 5.14], [2.4, 0.3, 0.06], rgb(1710624));
    b.box([0, 2.25, 5.18], [1.6, 0.14, 0.02], C.yellow);
    for (const sx of [-1.85, 1.85]) b.box([sx, 2, 4.6], [0.3, 0.35, 0.12], rgb(1973794));
    b.box([0, 0.45, -5.15], [1.5, 0.3, 0.06], C.white);
    b.rbox([0, 2.8, 0], [3.1, 0.16, 9.8], rgb(7506592), 0.04);
    for (const sx of [-1.8, 1.8]) {
      b.cyl([sx, 1.6, -3.2], 0.42, 0.36, 1.8, rgb(3817030), 14, true, true);
      b.sphere([sx, 1.6, -4.2], 0.25, C.orange, 10, 1, true);
    }
    for (const x of [-1.25, 1.25]) {
      for (const z of [-3.2, 3.2]) {
        b.push(mul(translate(x, 0.55, z), rotZ(Math.PI / 2)));
        b.cyl([0, 0, 0], 0.58, 0.58, 0.34, rgb(1973794), 16, true, true);
        b.pop();
      }
    }
    b.cyl([0, 3, 0], 0.55, 0.5, 2.4, rgb(13684936), 12, true, true);
    b.cyl([0, 5.4, 0], 0.3, 0.35, 1.3, rgb(13684936), 10, true, true);
  });
  M.balloon = mk((b) => {
    b.sphere([0, 0, 0], 7.8, C.balloon, 20, 1.12, true, [0, 0.56]);
    b.sphere([0, 0, 0], 7.8, C.cream, 20, 1.12, true, [0.56, 0.82]);
    b.cyl([0, -9.8, 0], 1.8, 4.6, 4.6, C.cream, 20, false, true);
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      b.cyl([Math.cos(a) * 2.3, -12.4, Math.sin(a) * 2.3], 0.03, 0.03, 5.4, rgb(11575392), 6);
    }
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * 6.283;
      b.push(mul(translate(0, 0, 0), rotY(a)));
      b.box([7.9 * 0.999, 0, 0], [0.12, 8.5, 0.35], dk(C.balloon, 0.7));
      b.pop();
    }
    b.torus([0, -6.6, 0], 5.2, 0.12, rgb(11575392), 24, 6);
    b.box([0, 2, 0], [0.4, 9, 0.4], dk(C.balloon, 0.6));
    b.box([0, 2, 0], [0.4, 9, 0.4], dk(C.balloon, 0.6));
  });
  M.glider = mk((b) => {
    const tan = rgb(14198890), brown = rgb(8018490), cell = rgb(15252862);
    for (let i = 0; i < 12; i++) {
      const a0 = i / 12 * Math.PI, a1 = (i + 1) / 12 * Math.PI;
      const x0 = -Math.cos(a0) * 3.2, y0 = Math.sin(a0) * 1.4, x1 = -Math.cos(a1) * 3.2, y1 = Math.sin(a1) * 1.4;
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, ang = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0);
      b.push(mul(translate(mx, my, 0), rotZ(ang)));
      b.rbox([0, 0, 0], [L + 0.04, 0.1, 1.6], i % 2 ? tan : cell, 0.02);
      b.box([0, 0.03, 0], [L + 0.05, 0.12, 0.06], brown);
      b.box([0, -0.02, -0.72], [L + 0.05, 0.1, 0.16], dk(tan, 0.75));
      b.pop();
    }
    b.box([0, 1.45, 0], [0.16, 0.16, 1.7], brown);
    for (const x of [-1.5, 1.5]) {
      b.push(mul(translate(x * 0.5, 0.35, 0), rotZ(x > 0 ? -0.9 : 0.9)));
      b.cyl([0, 0, 0], 0.03, 0.03, 1.9, rgb(3355443), 6, true, true);
      b.pop();
    }
    for (const x of [-0.55, 0.55]) b.cyl([x, -0.6, 0], 0.03, 0.03, 1.1, rgb(3355443), 8, true, true);
    b.box([0, -0.6, 0], [1.2, 0.06, 0.06], rgb(3355443));
  });
  M.pad = mk((b) => {
    b.cyl([0, 0, 0], 2.4, 2.4, 0.38, rgb(6324373), 24, true, true);
    b.cyl([0, 0.38, 0], 2.1, 2.1, 0.14, rgb(14216438), 24, true, true);
    b.torus([0, 0.42, 0], 2.12, 0.04, C.blue, 24, 6);
  });
  M.shadow = mk((b) => b.cyl([0, 0.02, 0], 0.48, 0.48, 1e-3, rgb(0), 16));
  M.water = mk((b) => b.quad([-1e3, 0, -1e3], [-1e3, 0, 1e3], [1e3, 0, 1e3], [1e3, 0, -1e3], rgb(2661576)));
  M.hitbox = mk((b) => b.box([0, 0, 0], [1, 1, 1], C.white));
  M.storm = mk((b) => {
    b.cyl([0, -50, 0], 1, 1, 400, rgb(7361279), 64, false, true);
  });
  return M;
}
export {
  C,
  FH,
  HOUSE_STYLES,
  MB,
  SKINS,
  aoY,
  buildCharacter,
  buildModels,
  dk,
  editedPiece,
  house,
  lt,
  rgb
};
