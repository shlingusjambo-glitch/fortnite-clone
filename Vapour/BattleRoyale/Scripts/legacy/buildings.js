import { mul, translate, rotY, rotZ, rotX } from "./math";
import { MB, rgb, dk, lt, C, FH, aoY } from "./models";
const PALETTES = [
  { wall: rgb(12900066), wall2: rgb(11123913), roof: rgb(5001820), trim: rgb(16316662), floor: rgb(12160866), interior: rgb(15328472) },
  { wall: rgb(15131346), wall2: rgb(13682864), roof: rgb(5922664), trim: rgb(16777215), floor: rgb(11045472), interior: rgb(15789284) },
  { wall: rgb(11565672), wall2: rgb(10119256), roof: rgb(4014150), trim: rgb(15722972), floor: rgb(11901550), interior: rgb(14999252) },
  { wall: rgb(13621446), wall2: rgb(12108974), roof: rgb(9062972), trim: rgb(16447210), floor: rgb(12623984), interior: rgb(15657696) },
  { wall: rgb(14272936), wall2: rgb(12890766), roof: rgb(5595246), trim: rgb(16777215), floor: rgb(11569754), interior: rgb(15525592) },
  { wall: rgb(10467273), wall2: rgb(8954034), roof: rgb(4146768), trim: rgb(16053492), floor: rgb(11901550), interior: rgb(15263972) }
];
const DARK = rgb(2369067), GLASSF = rgb(16054008), BRICK = rgb(12087388), CONCRETE = rgb(12039340), ASPH = rgb(5066837), STEEL = rgb(10135217), RUST = rgb(9067066);
class Kit {
  constructor(b, p) {
    this.b = b;
    this.p = p;
  }
  boxes = [];
  loot = [];
  chests = [];
  solid(c, s, col) {
    this.b.box(c, s, col);
    this.boxes.push({ min: [c[0] - s[0] / 2, c[1] - s[1] / 2, c[2] - s[2] / 2], max: [c[0] + s[0] / 2, c[1] + s[1] / 2, c[2] + s[2] / 2] });
  }
  /** wall segment builder in a local frame: k=0 wall spans x at z=cz; k=1 wall spans z at x=cx */
  wall(axis, at, from, to, y0, h, col, openings = [], T = 0.3, trim = this.p.trim) {
    const put = (a0, a1, b0, b1, c) => {
      if (a1 - a0 < 0.02 || b1 - b0 < 0.02) return;
      const mid = (a0 + a1) / 2, len = a1 - a0, yc = (b0 + b1) / 2, hh = b1 - b0;
      if (axis === "x") this.solid([mid, yc, at], [len, hh, T], c);
      else this.solid([at, yc, mid], [T, hh, len], c);
    };
    const ops = [...openings].sort((a, b) => a.x - b.x);
    let cur = from;
    for (const o of ops) {
      const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2;
      put(cur, x0, y0, y0 + h, col);
      put(x0, x1, o.y + o.h, y0 + h, col);
      if (o.y > y0 + 0.01) put(x0, x1, y0, o.y, col);
      const fr = (a0, a1, b0, b1) => {
        const mid = (a0 + a1) / 2, len = a1 - a0, yc = (b0 + b1) / 2, hh = b1 - b0;
        if (axis === "x") this.b.box([mid, yc, at], [len, hh, T + 0.12], trim);
        else this.b.box([at, yc, mid], [T + 0.12, hh, len], trim);
      };
      fr(x0 - 0.12, x0, o.y - (o.door ? 0 : 0.12), o.y + o.h + 0.12);
      fr(x1, x1 + 0.12, o.y - (o.door ? 0 : 0.12), o.y + o.h + 0.12);
      fr(x0 - 0.12, x1 + 0.12, o.y + o.h, o.y + o.h + 0.12);
      if (o.sill) {
        const sc = dk(this.p.roof, 1.1), ym = o.y + o.h / 2;
        for (const [a0, a1] of [[x0 - 0.5, x0 - 0.14], [x1 + 0.14, x1 + 0.5]]) {
          const mid = (a0 + a1) / 2;
          if (axis === "x") {
            this.b.box([mid, ym, at + (at > 0 ? 0.2 : -0.2)], [a1 - a0, o.h + 0.2, 0.06], sc);
            for (let k = -2; k <= 2; k++) this.b.box([mid, ym + k * 0.28, at + (at > 0 ? 0.24 : -0.24)], [a1 - a0 - 0.08, 0.05, 0.02], dk(sc, 0.8));
          } else {
            this.b.box([at + (at > 0 ? 0.2 : -0.2), ym, mid], [0.06, o.h + 0.2, a1 - a0], sc);
          }
        }
        if (axis === "x") {
          this.b.box([(x0 + x1) / 2, o.y - 0.3, at + (at > 0 ? 0.3 : -0.3)], [o.w, 0.28, 0.3], rgb(6965808));
          for (let k = 0; k < 4; k++) this.b.sphere([x0 + 0.2 + k * (o.w - 0.4) / 3, o.y - 0.08, at + (at > 0 ? 0.32 : -0.32)], 0.11, [C.red, C.yellow, rgb(16734899), C.white][k % 4], 6, 1, true);
        }
      }
      if (!o.door) {
        fr(x0 - 0.12, x1 + 0.12, o.y - 0.12, o.y);
        const mid = (x0 + x1) / 2, ym = o.y + o.h / 2;
        if (axis === "x") {
          this.b.box([mid, ym, at], [0.06, o.h, 0.05], trim);
          this.b.box([mid, ym, at], [o.w, 0.06, 0.05], trim);
          this.b.box([mid, o.y - 0.16, at + T / 2 + 0.1], [o.w + 0.4, 0.1, 0.28], trim);
        } else {
          this.b.box([at, ym, mid], [0.05, o.h, 0.06], trim);
          this.b.box([at, ym, mid], [0.05, 0.06, o.w], trim);
        }
      }
      cur = x1;
    }
    put(cur, to, y0, y0 + h, col);
  }
  floorSlab(x0, x1, z0, z1, y, col, thick = 0.25) {
    this.solid([(x0 + x1) / 2, y - thick / 2, (z0 + z1) / 2], [x1 - x0, thick, z1 - z0], col);
  }
  /** open wooden stairs along z (rising toward +z) inside a 1.5-wide bay at x */
  stairs(x, z0, y0, rise, len, col) {
    const steps = 9, sl = len / steps, sh = rise / steps;
    for (let k = 0; k < steps; k++) {
      const yy = y0 + (k + 1) * sh, zz = z0 + (k + 0.5) * sl;
      this.solid([x, yy - 0.1, zz], [1.5, 0.2, sl], col);
      this.b.box([x, yy - 0.1 - sh / 2, zz - sl / 2 + 0.03], [1.45, sh, 0.06], dk(col, 0.85));
    }
    this.b.box([x + 0.8, y0 + rise / 2 + 0.5, z0 + len / 2], [0.06, 0.06, len], DARK);
    for (let k = 0; k < 4; k++) this.b.box([x + 0.8, y0 + (k + 0.5) * rise / 4 + 0.45, z0 + (k + 0.5) * len / 4], [0.05, 0.9, 0.05], DARK);
  }
  gableRoof(w, d, H, rh, ov, rc, along = "x") {
    const b = this.b, hw = w / 2 + ov, hd = d / 2 + ov;
    if (along === "x") {
      b.quad([-hw, H, -hd], [-hw, H + rh, 0], [hw, H + rh, 0], [hw, H, -hd], rc);
      b.quad([hw, H, hd], [hw, H + rh, 0], [-hw, H + rh, 0], [-hw, H, hd], rc);
      b.quad([-hw, H, -hd], [hw, H, -hd], [hw, H + rh, 0], [-hw, H + rh, 0], dk(rc, 0.65));
      b.quad([hw, H, hd], [-hw, H, hd], [-hw, H + rh, 0], [hw, H + rh, 0], dk(rc, 0.65));
      for (let k = 0; k < 8; k++) {
        const t0 = k / 8, t1 = (k + 1) / 8;
        this.boxes.push({ min: [-hw, H + rh * t0, -hd * (1 - t0)], max: [hw, H + rh * t1, hd * (1 - t0)] });
      }
      b.box([0, H + rh + 0.05, 0], [w + 2 * ov, 0.14, 0.3], dk(rc, 0.8));
      for (let k = 1; k < 6; k++) {
        const t = k / 6;
        b.box([0, H + rh * t + 0.02, -hd * (1 - t)], [w + 2 * ov, 0.05, 0.08], dk(rc, 0.88));
        b.box([0, H + rh * t + 0.02, hd * (1 - t)], [w + 2 * ov, 0.05, 0.08], dk(rc, 0.88));
      }
      b.box([0, H - 0.12, hd + 0.02], [w + 2 * ov, 0.28, 0.08], this.p.trim);
      b.box([0, H - 0.12, -hd - 0.02], [w + 2 * ov, 0.28, 0.08], this.p.trim);
      for (const sz of [-1, 1]) {
        b.box([0, H - 0.3, sz * (hd + 0.1)], [w + 2 * ov, 0.14, 0.22], dk(this.p.trim, 0.85));
        for (const sx of [-1, 1]) {
          b.cyl([sx * (w / 2 - 0.3), H / 2 - 0.1, sz * (hd - 0.05)], 0.07, 0.07, H - 0.4, dk(this.p.trim, 0.8), 8, true, true);
          b.box([sx * (w / 2 - 0.3), H - 0.35, sz * (hd - 0.1)], [0.16, 0.16, 0.5], dk(this.p.trim, 0.8));
        }
      }
      for (const sx of [-1, 1]) b.box([sx * (w / 2 + 0.02), H / 2 + 0.15, 0], [0.12, H - 0.3, 0.12], this.p.trim);
      b.tri([w / 2, H, -d / 2], [w / 2, H + rh, 0], [w / 2, H, d / 2], this.p.wall2);
      b.tri([-w / 2, H, d / 2], [-w / 2, H + rh, 0], [-w / 2, H, -d / 2], this.p.wall2);
    } else {
      b.quad([-hw, H, -hd], [hw, H, -hd], [0, H + rh, -hd], [0, H + rh, -hd], rc);
      b.quad([-hw, H, hd], [0, H + rh, hd], [0, H + rh, -hd], [-hw, H, -hd], rc);
      b.quad([hw, H, -hd], [0, H + rh, -hd], [0, H + rh, hd], [hw, H, hd], rc);
      b.quad([-hw, H, hd], [-hw, H, -hd], [0, H + rh, -hd], [0, H + rh, hd], dk(rc, 0.65));
      b.quad([hw, H, -hd], [hw, H, hd], [0, H + rh, hd], [0, H + rh, -hd], dk(rc, 0.65));
      for (let k = 0; k < 8; k++) {
        const t0 = k / 8, t1 = (k + 1) / 8;
        this.boxes.push({ min: [-hw * (1 - t0), H + rh * t0, -hd], max: [hw * (1 - t0), H + rh * t1, hd] });
      }
      b.box([0, H + rh + 0.05, 0], [0.3, 0.14, d + 2 * ov], dk(rc, 0.8));
      b.tri([-w / 2, H, d / 2], [0, H + rh, d / 2], [w / 2, H, d / 2], this.p.wall2);
      b.tri([w / 2, H, -d / 2], [0, H + rh, -d / 2], [-w / 2, H, -d / 2], this.p.wall2);
    }
  }
  siding(w, d, y0, h, col) {
    const b = this.b, lc = dk(col, 0.84);
    for (let yy = y0 + 0.3; yy < y0 + h - 0.1; yy += 0.36) {
      b.box([0, yy, d / 2 + 5e-3], [w, 0.03, 0.02], lc);
      b.box([0, yy, -d / 2 - 5e-3], [w, 0.03, 0.02], lc);
      b.box([w / 2 + 5e-3, yy, 0], [0.02, 0.03, d], lc);
      b.box([-w / 2 - 5e-3, yy, 0], [0.02, 0.03, d], lc);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([sx * w / 2, y0 + h / 2, sz * d / 2], [0.22, h, 0.22], this.p.trim);
  }
  // ---- furniture (local positions) ----
  table(x, y, z, w = 1.8, d = 1) {
    this.solid([x, y + 0.75, z], [w, 0.08, d], rgb(8018490));
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.b.box([x + dx * (w / 2 - 0.1), y + 0.37, z + dz * (d / 2 - 0.1)], [0.1, 0.74, 0.1], rgb(5914672));
  }
  chair(x, y, z, yaw = 0) {
    this.b.push(mul(translate(x, y, z), rotY(yaw)));
    this.b.box([0, 0.46, 0], [0.5, 0.06, 0.5], rgb(6965808));
    this.b.box([0, 0.85, -0.22], [0.5, 0.75, 0.06], rgb(6965808));
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.b.box([dx * 0.21, 0.22, dz * 0.21], [0.05, 0.44, 0.05], rgb(4861984));
    this.b.pop();
  }
  couch(x, y, z, yaw = 0, col = rgb(4878234)) {
    this.b.push(mul(translate(x, y, z), rotY(yaw)));
    this.b.rbox([0, 0.32, 0], [2.4, 0.5, 1], col, 0.08);
    this.b.rbox([0, 0.75, -0.4], [2.4, 0.6, 0.25], col, 0.08);
    for (const sx of [-1, 1]) this.b.rbox([sx * 1.1, 0.6, 0], [0.2, 0.4, 1], dk(col, 0.9), 0.06);
    for (const sx of [-0.55, 0.55]) this.b.rbox([sx, 0.58, 0.05], [1, 0.12, 0.8], lt(col, 0.15), 0.05);
    this.b.pop();
    this.boxes.push({ min: [x - 1.2, y, z - 0.5], max: [x + 1.2, y + 0.9, z + 0.5] });
  }
  bed(x, y, z, yaw = 0, col = rgb(13228266)) {
    this.b.push(mul(translate(x, y, z), rotY(yaw)));
    this.b.box([0, 0.3, 0], [1.7, 0.5, 2.3], rgb(6965808));
    this.b.rbox([0, 0.62, 0], [1.6, 0.25, 2.2], col, 0.06);
    this.b.rbox([0, 0.8, -0.8], [1.4, 0.16, 0.5], C.white, 0.05);
    this.b.rbox([0, 0.72, 0.35], [1.62, 0.1, 1.3], dk(col, 0.7), 0.04);
    this.b.box([0, 0.85, -1.2], [1.7, 1.2, 0.1], rgb(6965808));
    this.b.pop();
    this.boxes.push({ min: [x - 0.85, y, z - 1.15], max: [x + 0.85, y + 0.75, z + 1.15] });
  }
  cabinet(x, y, z, w, h, d, col, top) {
    this.solid([x, y + h / 2, z], [w, h, d], col);
    if (top) this.b.box([x, y + h + 0.03, z], [w + 0.04, 0.06, d + 0.04], top);
    for (let i = 0; i < Math.round(w / 0.6); i++) this.b.box([x - w / 2 + (i + 0.5) * w / Math.round(w / 0.6), y + h * 0.6, z + d / 2 + 0.02], [0.04, 0.16, 0.03], rgb(4473924));
  }
  fridge(x, y, z) {
    this.solid([x, y + 1, z], [0.9, 2, 0.8], rgb(14673128));
    this.b.box([x, y + 1.25, z], [0.92, 0.03, 0.82], rgb(10133670));
    this.b.box([x + 0.35, y + 1.5, z + 0.42], [0.04, 0.5, 0.04], rgb(10133670));
    this.b.box([x + 0.35, y + 0.7, z + 0.42], [0.04, 0.7, 0.04], rgb(10133670));
  }
  stove(x, y, z) {
    this.solid([x, y + 0.45, z], [0.9, 0.9, 0.7], rgb(15132390));
    this.b.box([x, y + 0.92, z], [0.9, 0.04, 0.7], DARK);
    for (const [dx, dz] of [[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.15], [0.2, 0.15]]) this.b.cyl([x + dx, y + 0.94, z + dz], 0.12, 0.12, 0.02, rgb(5592405), 10);
    this.b.box([x, y + 0.5, z + 0.36], [0.6, 0.4, 0.03], rgb(3355443));
  }
  toilet(x, y, z, yaw = 0) {
    this.b.push(mul(translate(x, y, z), rotY(yaw)));
    this.b.box([0, 0.4, -0.25], [0.45, 0.8, 0.25], C.white);
    this.b.cyl([0, 0.2, 0.1], 0.25, 0.28, 0.4, C.white, 12);
    this.b.cyl([0, 0.4, 0.1], 0.3, 0.3, 0.05, rgb(15658734), 12);
    this.b.pop();
    this.boxes.push({ min: [x - 0.3, y, z - 0.4], max: [x + 0.3, y + 0.8, z + 0.4] });
  }
  sink(x, y, z) {
    this.solid([x, y + 0.42, z], [0.7, 0.84, 0.55], rgb(15790314));
    this.b.box([x, y + 0.86, z], [0.74, 0.05, 0.58], rgb(14540253));
    this.b.cyl([x, y + 0.88, z - 0.15], 0.02, 0.02, 0.2, STEEL, 6);
    this.b.box([x, y + 1.5, z - 0.25], [0.6, 0.7, 0.03], rgb(13625074));
  }
  tub(x, y, z) {
    this.solid([x, y + 0.3, z], [1.7, 0.6, 0.8], C.white);
    this.b.box([x, y + 0.45, z], [1.5, 0.35, 0.6], rgb(14216436));
  }
  bookshelf(x, y, z, yaw = 0, w = 1.2) {
    this.b.push(mul(translate(x, y, z), rotY(yaw)));
    this.b.box([0, 1, 0], [w, 2, 0.35], rgb(6965808));
    for (let s = 0; s < 4; s++) {
      this.b.box([0, 0.3 + s * 0.5, 0.02], [w - 0.1, 0.04, 0.32], rgb(9071176));
      for (let i = 0; i < Math.floor(w / 0.12); i++) if (Math.random() < 0.8) this.b.box([-w / 2 + 0.1 + i * 0.12, 0.5 + s * 0.5, 0.05], [0.09, 0.36 + Math.random() * 0.06, 0.24], [Math.random() * 0.6 + 0.2, Math.random() * 0.5 + 0.2, Math.random() * 0.6 + 0.2]);
    }
    this.b.pop();
    this.boxes.push({ min: [x - w / 2, y, z - 0.2], max: [x + w / 2, y + 2, z + 0.2] });
  }
  tv(x, y, z, yaw = 0) {
    this.b.push(mul(translate(x, y, z), rotY(yaw)));
    this.b.box([0, 0.3, 0], [1.4, 0.6, 0.5], rgb(4864554));
    this.b.box([0, 1.05, 0], [1.3, 0.8, 0.08], DARK);
    this.b.box([0, 1.05, 0.045], [1.2, 0.7, 0.01], rgb(2047839));
    this.b.pop();
  }
  rug(x, y, z, w, d, col) {
    this.b.box([x, y + 0.015, z], [w, 0.03, d], col);
    this.b.box([x, y + 0.02, z], [w - 0.3, 0.03, d - 0.3], lt(col, 0.2));
  }
  lamp(x, y, z) {
    this.b.cyl([x, y, z], 0.2, 0.2, 0.04, DARK, 10);
    this.b.cyl([x, y, z], 0.03, 0.03, 1.5, DARK, 6);
    this.b.cyl([x, y + 1.45, z], 0.28, 0.2, 0.32, rgb(16049856), 12, false);
  }
  crate(x, y, z, s = 1, col = rgb(11569754)) {
    this.solid([x, y + 0.5 * s, z], [s, s, s], col);
    for (const e of [[0, 1], [0, -1], [1, 0], [-1, 0]]) this.b.box([x + e[0] * s * 0.5, y + 0.5 * s, z + e[1] * s * 0.5], [e[0] ? 0.04 : s, s, e[1] ? 0.04 : s], dk(col, 0.75));
  }
  barrel(x, y, z, col = rgb(3829672)) {
    this.b.cyl([x, y, z], 0.42, 0.42, 1.1, col, 14);
    this.b.torus([x, y + 0.25, z], 0.43, 0.03, dk(col, 0.6), 14, 6);
    this.b.torus([x, y + 0.85, z], 0.43, 0.03, dk(col, 0.6), 14, 6);
    this.boxes.push({ min: [x - 0.42, y, z - 0.42], max: [x + 0.42, y + 1.1, z + 0.42] });
  }
  shelfRack(x, y, z, yaw = 0, w = 3, tiers = 3, stock = true) {
    this.b.push(mul(translate(x, y, z), rotY(yaw)));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.b.box([sx * (w / 2 - 0.04), 1.05, sz * 0.45], [0.06, 2.1, 0.06], STEEL);
    for (let s = 0; s < tiers; s++) {
      const yy = 0.2 + s * 0.65;
      this.b.box([0, yy, 0], [w, 0.05, 1], rgb(13489112));
      if (stock) {
        for (let i = 0; i < Math.floor(w / 0.45); i++) if (Math.random() < 0.75) this.b.rbox([-w / 2 + 0.25 + i * 0.45, yy + 0.22, (Math.random() - 0.5) * 0.4], [0.32, 0.36, 0.32], [0.3 + Math.random() * 0.6, 0.3 + Math.random() * 0.5, 0.3 + Math.random() * 0.6], 0.03);
      }
    }
    this.b.pop();
    this.boxes.push({ min: [x - w / 2, y, z - 0.5], max: [x + w / 2, y + 2.1, z + 0.5] });
  }
  counter(x, y, z, w, yaw = 0) {
    this.b.push(mul(translate(x, y, z), rotY(yaw)));
    this.b.box([0, 0.5, 0], [w, 1, 0.8], rgb(7301730));
    this.b.box([0, 1.02, 0], [w + 0.1, 0.06, 0.9], rgb(3815994));
    this.b.box([w * 0.3, 1.25, 0], [0.5, 0.4, 0.4], DARK);
    this.b.pop();
    this.boxes.push({ min: [x - w / 2, y, z - 0.45], max: [x + w / 2, y + 1.05, z + 0.45] });
  }
  hayBale(x, y, z, yaw = 0) {
    this.b.push(mul(translate(x, y, z), rotY(yaw)));
    this.b.rbox([0, 0.45, 0], [1.4, 0.9, 0.9], rgb(14268778), 0.08);
    this.b.box([-0.4, 0.45, 0], [0.05, 0.92, 0.92], rgb(10123834));
    this.b.box([0.4, 0.45, 0], [0.05, 0.92, 0.92], rgb(10123834));
    this.b.pop();
    this.boxes.push({ min: [x - 0.7, y, z - 0.45], max: [x + 0.7, y + 0.9, z + 0.45] });
  }
  door(x, y, z, yaw, col = rgb(5917242)) {
    this.b.push(mul(translate(x, y, z), rotY(yaw)));
    this.b.box([0.55, 1.15, 0], [1.1, 2.3, 0.08], col);
    this.b.box([0.55, 1.5, 0.05], [0.8, 0.9, 0.02], dk(col, 0.85));
    this.b.box([0.55, 0.6, 0.05], [0.8, 0.7, 0.02], dk(col, 0.85));
    this.b.sphere([0.95, 1.1, 0.08], 0.05, C.gold, 8);
    this.b.pop();
  }
  interiorWall(axis, at, from, to, y0, h, doorAt) {
    this.wall(axis, at, from, to, y0, h, this.p.interior, doorAt === void 0 ? [] : [{ x: doorAt, w: 1.2, y: y0, h: 2.3, door: true }], 0.18, this.p.trim);
  }
  baseboard(x0, x1, z0, z1, y) {
    const c = this.p.trim;
    this.b.box([(x0 + x1) / 2, y + 0.08, z0 + 0.1], [x1 - x0, 0.16, 0.04], c);
    this.b.box([(x0 + x1) / 2, y + 0.08, z1 - 0.1], [x1 - x0, 0.16, 0.04], c);
    this.b.box([x0 + 0.1, y + 0.08, (z0 + z1) / 2], [0.04, 0.16, z1 - z0], c);
    this.b.box([x1 - 0.1, y + 0.08, (z0 + z1) / 2], [0.04, 0.16, z1 - z0], c);
  }
  ceilingLight(x, y, z) {
    this.b.cyl([x, y - 0.05, z], 0.35, 0.3, 0.06, rgb(16774352), 10);
  }
}
function colonial(pi = 0, seed = 0) {
  const p = PALETTES[pi % PALETTES.length], b = new MB(), k = new Kit(b, p);
  const w = 16 + seed % 2 * 2, d = 11 + seed % 3, hw = w / 2, hd = d / 2, H = FH * 2, T = 0.3, garage = seed % 3 !== 1;
  k.solid([0, 0.2, 0], [w + 0.5, 0.4, d + 0.5], rgb(9407878));
  k.floorSlab(-hw + T, hw - T, -hd + T, hd - T, 0.46, p.floor, 0.12);
  const winsF = [], winsB = [], winsL = [], winsR = [];
  const nx = Math.round(w / 4);
  for (let f = 0; f < 2; f++) {
    const y = f * FH + 1.1;
    for (let i = 0; i < nx; i++) {
      const x = -hw + (i + 0.5) * w / nx;
      if (f === 0 && Math.abs(x) < 1.6) continue;
      winsF.push({ x, w: 1.5, y, h: 1.7, sill: true });
      winsB.push({ x, w: 1.5, y, h: 1.7 });
    }
    winsL.push({ x: -hd * 0.4, w: 1.4, y, h: 1.6 }, { x: hd * 0.4, w: 1.4, y, h: 1.6 });
    winsR.push({ x: 0, w: 1.4, y, h: 1.6 });
  }
  winsF.push({ x: 0, w: 1.4, y: 0.4, h: 2.4, door: true });
  k.wall("x", hd - T / 2, -hw, hw, 0.4, H - 0.4, p.wall, winsF);
  k.wall("x", -hd + T / 2, -hw, hw, 0.4, H - 0.4, p.wall, winsB);
  k.wall("z", -hw + T / 2, -hd, hd, 0.4, H - 0.4, p.wall, winsL);
  k.wall("z", hw - T / 2, -hd, hd, 0.4, H - 0.4, p.wall, garage ? [...winsR, { x: 0.2, w: 1.2, y: 0.4, h: 2.3, door: true }] : winsR);
  k.siding(w, d, 0.4, H - 0.4, p.wall);
  const y0 = 0.52;
  k.interiorWall("z", 1.5, -hd + T, hd - T, y0, FH - 0.2, 2.5);
  k.interiorWall("x", 0, -hw + T, 1.5, y0, FH - 0.2, -hw + 3);
  k.interiorWall("x", -hd * 0.25, 1.5, hw - T, y0, FH - 0.2, hw - 2.2);
  k.stairs(hw - 1.3, -hd + T + 0.2, y0, FH, 6.4, p.floor);
  k.floorSlab(-hw + T, hw - 2.1, -hd + T, hd - T, FH, p.floor);
  k.floorSlab(hw - 2.1, hw - T, -hd + 6.9, hd - T, FH, p.floor);
  b.box([hw - 2.1, FH + 0.5, -hd + 3.3], [0.06, 1, 6.6], DARK);
  k.ceilingLight(-hw * 0.5, FH - 0.1, hd * 0.5);
  k.ceilingLight(-hw * 0.5, FH - 0.1, -hd * 0.5);
  k.ceilingLight(hw * 0.5, FH - 0.1, hd * 0.5);
  k.rug(-hw * 0.5, y0, hd * 0.5, 4, 3, rgb(9058874));
  k.couch(-hw * 0.5, y0, hd * 0.75, Math.PI);
  k.tv(-hw * 0.5, y0, hd * 0.2, 0);
  k.table(-hw * 0.5, y0, hd * 0.5, 1.2, 0.7);
  k.lamp(-hw + 1, y0, hd - 1);
  k.bookshelf(-hw + 0.5, y0, hd * 0.5, Math.PI / 2);
  k.cabinet(-hw * 0.55, y0, -hd + 0.75, 5, 0.9, 0.7, rgb(15262416), rgb(5921370));
  k.fridge(-hw + 0.8, y0, -hd + 0.75);
  k.stove(-hw * 0.25 + 0.2, y0, -hd + 0.75);
  k.table(-hw * 0.5, y0, -hd * 0.45, 1.6, 1);
  k.chair(-hw * 0.5 - 0.5, y0, -hd * 0.45 + 0.9, Math.PI);
  k.chair(-hw * 0.5 + 0.5, y0, -hd * 0.45 + 0.9, Math.PI);
  k.chair(-hw * 0.5, y0, -hd * 0.45 - 0.9, 0);
  for (let i = 0; i < 3; i++) b.rbox([-hw * 0.7 + i * 1.2, y0 + 1.9, -hd + 0.6], [1, 0.7, 0.4], rgb(15262416), 0.03);
  k.toilet(hw - 1.2, y0, -hd * 0.25 + 1.6, -Math.PI / 2);
  k.sink(hw - 3.2, y0, -hd * 0.25 - 1);
  k.tub(3.2, y0, -hd * 0.25 - 1.5);
  const y1 = FH + 0.02;
  k.interiorWall("z", -1, -hd + T, hd - T, y1, FH - 0.2, hd * 0.5);
  k.bed(-hw * 0.55, y1, -hd * 0.3, 0);
  k.bed(hw * 0.35, y1, -hd * 0.25, 0, rgb(15122624));
  k.bookshelf(-hw + 0.5, y1, hd * 0.6, Math.PI / 2);
  k.rug(hw * 0.35, y1, hd * 0.3, 3, 2.5, rgb(3824266));
  k.lamp(hw - 1, y1, -hd + 1);
  k.cabinet(-hw * 0.5, y1, hd - 0.8, 2.2, 1.2, 0.6, rgb(8018490));
  k.tv(hw * 0.35, y1, hd * 0.75, Math.PI);
  k.baseboard(-hw + T, hw - T, -hd + T, hd - T, y0);
  k.baseboard(-hw + T, hw - T, -hd + T, hd - T, y1);
  k.gableRoof(w, d, H, d * 0.42, 0.6, p.roof, "x");
  b.box([hw * 0.4, H + d * 0.42 * 0.7, -hd * 0.25], [0.9, d * 0.42 * 1.3, 0.9], BRICK);
  b.box([0, 3.1, hd + 1], [3.4, 0.15, 2], p.roof);
  for (const x of [-1.5, 1.5]) k.solid([x, 1.55, hd + 1.8], [0.18, 3.1, 0.18], p.trim);
  k.solid([0, 0.2, hd + 1.2], [3.2, 0.4, 1.8], CONCRETE);
  k.solid([0, 0.1, hd + 2.4], [3.2, 0.2, 0.7], CONCRETE);
  k.door(0.7, 0.4, hd - 0.1, Math.PI * 0.55);
  if (garage) {
    const gw = 6, gd = 6.5, gx = hw + gw / 2, gz = hd - gd / 2;
    k.wall("x", gz - gd / 2 + T / 2, hw, hw + gw, 0.4, 3.2, p.wall2);
    k.wall("z", hw + gw - T / 2, gz - gd / 2, gz + gd / 2, 0.4, 3.2, p.wall2);
    k.wall("x", gz + gd / 2 - T / 2, hw, hw + gw, 0.4, 3.2, p.wall2, [{ x: gx, w: 3.6, y: 0.4, h: 2.6, door: true }]);
    k.solid([gx, 0.2, gz], [gw, 0.4, gd], CONCRETE);
    b.box([gx, 3.25, gz], [gw + 0.4, 0.2, gd + 0.4], p.roof);
    b.box([gx, 3.6, gz], [gw + 0.6, 0.5, gd + 0.6], dk(p.roof, 0.9));
    k.shelfRack(hw + 0.8, 0.4, gz - gd / 2 + 1.2, Math.PI / 2, 2.5, 3);
    k.crate(hw + gw - 1, 0.4, gz - 2, 0.9);
    k.barrel(hw + gw - 1, 0.4, gz - 0.6);
    k.loot.push([gx, 0.5, gz + 1]);
    k.chests.push([hw + gw - 1.4, 0.4, gz + gd / 2 - 1.5]);
  }
  k.loot.push([-hw * 0.5, y0, hd * 0.5], [-hw * 0.5, y0, -hd * 0.5], [hw * 0.35, y1, hd * 0.3], [-hw * 0.55, y1, hd * 0.3]);
  k.chests.push([-hw + 1.5, y1, -hd + 1.5]);
  aoY(b.d, -0.2, 2.2, 0.66);
  return { b, boxes: k.boxes, loot: k.loot, chests: k.chests, w: garage ? w + 6 : w, d, h: H + d * 0.42, kind: "colonial" };
}
function cottage(pi = 1, seed = 0) {
  const p = PALETTES[pi % PALETTES.length], b = new MB(), k = new Kit(b, p);
  const w = 12, d = 9, hw = w / 2, hd = d / 2, H = FH, T = 0.3, y0 = 0.52;
  k.solid([0, 0.2, 0], [w + 0.5, 0.4, d + 0.5], rgb(9407878));
  k.floorSlab(-hw + T, hw - T, -hd + T, hd - T, 0.46, p.floor, 0.12);
  k.wall("x", hd - T / 2, -hw, hw, 0.4, H - 0.4, p.wall, [{ x: -hw * 0.5, w: 1.6, y: 1.1, h: 1.6, sill: true }, { x: hw * 0.5, w: 1.6, y: 1.1, h: 1.6, sill: true }, { x: 0, w: 1.3, y: 0.4, h: 2.3, door: true }]);
  k.wall("x", -hd + T / 2, -hw, hw, 0.4, H - 0.4, p.wall, [{ x: -hw * 0.5, w: 1.4, y: 1.1, h: 1.6 }, { x: hw * 0.5, w: 1.4, y: 1.1, h: 1.6 }]);
  k.wall("z", -hw + T / 2, -hd, hd, 0.4, H - 0.4, p.wall, [{ x: 0, w: 1.4, y: 1.1, h: 1.6 }]);
  k.wall("z", hw - T / 2, -hd, hd, 0.4, H - 0.4, p.wall, [{ x: -hd * 0.3, w: 1.4, y: 1.1, h: 1.6 }]);
  k.siding(w, d, 0.4, H - 0.4, p.wall);
  k.interiorWall("z", 1.2, -hd + T, hd - T, y0, FH - 0.2, -hd * 0.4);
  k.interiorWall("x", -hd * 0.1, 1.2, hw - T, y0, FH - 0.2, hw - 1.6);
  k.couch(-hw * 0.5, y0, hd * 0.55, Math.PI);
  k.tv(-hw * 0.5, y0, -hd * 0.1, 0);
  k.rug(-hw * 0.5, y0, hd * 0.3, 3, 2.4, rgb(5929530));
  k.cabinet(-hw * 0.5, y0, -hd + 0.75, 4, 0.9, 0.7, rgb(15262416), rgb(5921370));
  k.fridge(-hw + 0.8, y0, -hd + 0.75);
  k.stove(-hw * 0.2, y0, -hd + 0.75);
  k.bed(hw * 0.4, y0, -hd * 0.5, 0, rgb(14214848));
  k.bookshelf(hw - 0.5, y0, hd * 0.6, -Math.PI / 2, 1);
  k.toilet(hw - 1, y0, hd - 1.2, -Math.PI / 2);
  k.sink(3, y0, hd - 1);
  k.baseboard(-hw + T, hw - T, -hd + T, hd - T, y0);
  k.ceilingLight(-hw * 0.5, H - 0.1, 0);
  k.ceilingLight(hw * 0.4, H - 0.1, 0);
  k.gableRoof(w, d, H, d * 0.5, 0.7, p.roof, "x");
  b.box([-hw * 0.5, H + d * 0.5 * 0.7, -hd * 0.3], [0.8, d * 0.5 * 1.3, 0.8], BRICK);
  b.box([0, 2.9, hd + 1], [3, 0.15, 2], p.roof);
  for (const x of [-1.3, 1.3]) k.solid([x, 1.45, hd + 1.8], [0.16, 2.9, 0.16], p.trim);
  k.solid([0, 0.2, hd + 1.1], [3, 0.4, 1.6], CONCRETE);
  k.door(0.65, 0.4, hd - 0.1, Math.PI * 0.6);
  k.loot.push([-hw * 0.5, y0, hd * 0.3], [hw * 0.4, y0, hd * 0.2]);
  k.chests.push([-hw + 1.2, y0, -hd + 3]);
  aoY(b.d, -0.2, 2.2, 0.66);
  return { b, boxes: k.boxes, loot: k.loot, chests: k.chests, w, d, h: H + d * 0.5, kind: "cottage" };
}
function shop(pi = 2, seed = 0) {
  const p = PALETTES[pi % PALETTES.length], b = new MB(), k = new Kit(b, p);
  const w = 20, d = 14, hw = w / 2, hd = d / 2, H = 5.2, T = 0.35, y0 = 0.42, brick = seed % 2 ? BRICK : rgb(14208952);
  k.solid([0, 0.2, 0], [w + 1, 0.4, d + 1], CONCRETE);
  k.floorSlab(-hw + T, hw - T, -hd + T, hd - T, 0.4, rgb(13223096), 0.08);
  k.wall("x", hd - T / 2, -hw, hw, 0.4, H, brick, [{ x: -6, w: 4.5, y: 1.2, h: 2.6 }, { x: 6, w: 4.5, y: 1.2, h: 2.6 }, { x: 0, w: 2.6, y: 0.4, h: 2.8, door: true }], T, DARK);
  k.wall("x", -hd + T / 2, -hw, hw, 0.4, H, brick, [{ x: hw - 3, w: 1.6, y: 0.4, h: 2.4, door: true }], T, DARK);
  k.wall("z", -hw + T / 2, -hd, hd, 0.4, H, brick, [{ x: 0, w: 2.4, y: 1.4, h: 2 }], T, DARK);
  k.wall("z", hw - T / 2, -hd, hd, 0.4, H, brick, [], T, DARK);
  b.box([0, H + 0.6, hd + 0.3], [w + 0.6, 1.4, 0.4], rgb(2902638));
  b.box([0, H + 0.6, hd + 0.52], [8, 0.9, 0.05], rgb(16765498));
  b.box([0, H + 0.6, hd + 0.55], [7, 0.45, 0.02], rgb(2902638));
  b.box([0, H + 0.2, 0], [w + 0.6, 0.4, d + 0.6], rgb(6975092));
  b.box([0, H + 0.5, 0], [w + 0.8, 0.2, d + 0.8], rgb(5330267));
  for (const x of [-6, 0, 6]) b.box([x, H + 0.9, -hd * 0.3], [1.6, 1, 1.6], rgb(10133670));
  b.box([0, 3.9, hd + 1.2], [w * 0.8, 0.12, 2.4], rgb(2902638));
  for (const x of [-7, 0, 7]) k.solid([x, 2.1, hd + 2.2], [0.2, 3.6, 0.2], DARK);
  k.interiorWall("x", -hd + 4, -hw + T, hw - T, y0, H - 0.4, hw - 3);
  for (let i = 0; i < 3; i++) k.shelfRack(-hw + 4 + i * 4.5, y0, 1, 0, 5, 3);
  for (let i = 0; i < 3; i++) k.shelfRack(-hw + 4 + i * 4.5, y0, 4.2, 0, 5, 3);
  k.counter(hw - 3, y0, hd - 3, 4, Math.PI / 2);
  k.shelfRack(-hw + 1, y0, 0, Math.PI / 2, 8, 4);
  for (let i = 0; i < 4; i++) k.fridge(-hw + 3 + i * 1, y0, -hd + 4.7);
  k.crate(-hw + 2, y0, -hd + 1.5);
  k.crate(-hw + 3.2, y0, -hd + 1.5, 0.8);
  k.crate(-hw + 2.6, y0 + 1, -hd + 1.5, 0.8);
  k.barrel(hw - 2, y0, -hd + 1.5);
  k.shelfRack(2, y0, -hd + 2, 0, 6, 3);
  for (const x of [-6, 0, 6]) for (const z of [-2, 3]) k.ceilingLight(x, H - 0.1, z);
  k.loot.push([-hw + 6, y0, 2.6], [2, y0, 2.6], [hw - 3, y0, 0], [0, y0, -hd + 2]);
  k.chests.push([-hw + 1.5, y0, -hd + 1.4], [hw - 2, y0, hd - 1.5]);
  aoY(b.d, -0.2, 2.2, 0.66);
  return { b, boxes: k.boxes, loot: k.loot, chests: k.chests, w, d, h: H + 1.5, kind: "shop" };
}
function gas(pi = 3, seed = 0) {
  const p = PALETTES[pi % PALETTES.length], b = new MB(), k = new Kit(b, p);
  const w = 12, d = 9, hw = w / 2, hd = d / 2, H = 4.2, T = 0.3, y0 = 0.42;
  k.solid([0, 0.2, 0], [w + 0.6, 0.4, d + 0.6], CONCRETE);
  k.floorSlab(-hw + T, hw - T, -hd + T, hd - T, 0.4, rgb(13223096), 0.08);
  k.wall("x", hd - T / 2, -hw, hw, 0.4, H, rgb(15262936), [{ x: -3.5, w: 3.6, y: 1, h: 2.4 }, { x: 3.2, w: 2.6, y: 1, h: 2.4 }, { x: 0, w: 1.6, y: 0.4, h: 2.6, door: true }], T, rgb(12595248));
  k.wall("x", -hd + T / 2, -hw, hw, 0.4, H, rgb(15262936), [{ x: -hw + 2, w: 1.4, y: 0.4, h: 2.3, door: true }], T, rgb(12595248));
  k.wall("z", -hw + T / 2, -hd, hd, 0.4, H, rgb(15262936), [], T);
  k.wall("z", hw - T / 2, -hd, hd, 0.4, H, rgb(15262936), [{ x: 0, w: 1.6, y: 1.2, h: 1.6 }], T);
  b.box([0, H + 0.15, 0], [w + 0.6, 0.3, d + 0.6], rgb(6975092));
  b.box([0, H + 0.6, hd + 0.2], [w + 0.6, 0.9, 0.3], rgb(12595248));
  b.box([0, H + 0.6, hd + 0.4], [5, 0.6, 0.05], rgb(16777215));
  k.counter(-hw + 2.5, y0, hd - 2.2, 3.5, 0);
  k.shelfRack(1, y0, 0.5, 0, 6, 3);
  k.shelfRack(1, y0, -2.2, 0, 6, 3);
  for (let i = 0; i < 3; i++) k.fridge(-hw + 1 + i * 1, y0, -hd + 0.8);
  k.ceilingLight(-2, H - 0.1, 0);
  k.ceilingLight(3, H - 0.1, 0);
  const cz = hd + 9;
  for (const x of [-4.5, 4.5]) k.solid([x, 2.6, cz], [0.5, 5.2, 0.5], rgb(14540253));
  b.box([0, 5.4, cz], [16, 0.5, 9], rgb(15790320));
  b.box([0, 5, cz], [16.2, 0.35, 9.2], rgb(12595248));
  b.box([0, 5.75, cz], [16.2, 0.2, 9.2], rgb(3815994));
  k.solid([0, 0.1, cz], [4.5, 0.2, 2.4], CONCRETE);
  for (const x of [-1.2, 1.2]) {
    k.solid([x, 1, cz], [0.9, 1.8, 0.5], rgb(15263976));
    b.box([x, 1.5, cz + 0.26], [0.7, 0.5, 0.03], rgb(2109504));
    b.box([x, 0.9, cz + 0.27], [0.5, 0.3, 0.03], rgb(12595248));
    b.box([x + 0.3, 1.2, cz - 0.3], [0.1, 0.9, 0.1], DARK);
    b.cyl([x + 0.3, 1.65, cz - 0.3], 0.06, 0.06, 0.4, DARK, 6);
  }
  b.box([-6.5, 0.8, cz - 2], [1.4, 1.6, 0.6], rgb(2902638));
  b.box([-6.5, 1.5, cz - 2], [1.2, 0.3, 0.62], rgb(16765498));
  k.loot.push([1, y0, -0.9], [-hw + 2, y0, hd - 3.5], [2, 0.3, cz]);
  k.chests.push([hw - 1.5, y0, -hd + 1.5]);
  aoY(b.d, -0.2, 2.2, 0.66);
  return { b, boxes: k.boxes, loot: k.loot, chests: k.chests, w: 18, d: d + 18, h: H + 1, kind: "gas" };
}
function barn(pi = 2, seed = 0) {
  const p = PALETTES[pi % PALETTES.length], b = new MB(), k = new Kit(b, p);
  const w = 14, d = 20, hw = w / 2, hd = d / 2, H = 6.5, T = 0.3, red = rgb(11023918), redD = rgb(8005152), y0 = 0.42;
  k.solid([0, 0.2, 0], [w + 0.4, 0.4, d + 0.4], CONCRETE);
  k.floorSlab(-hw + T, hw - T, -hd + T, hd - T, 0.4, rgb(10123856), 0.08);
  k.wall("x", hd - T / 2, -hw, hw, 0.4, H, red, [{ x: 0, w: 4.6, y: 0.4, h: 4.2, door: true }], T, C.white);
  k.wall("x", -hd + T / 2, -hw, hw, 0.4, H, red, [{ x: 0, w: 3, y: 0.4, h: 3.2, door: true }, { x: 0, w: 1.6, y: 4.6, h: 1.4 }], T, C.white);
  k.wall("z", -hw + T / 2, -hd, hd, 0.4, H, red, [{ x: -5, w: 1.2, y: 1.6, h: 1.2 }, { x: 5, w: 1.2, y: 1.6, h: 1.2 }], T, C.white);
  k.wall("z", hw - T / 2, -hd, hd, 0.4, H, red, [{ x: 0, w: 1.2, y: 1.6, h: 1.2 }], T, C.white);
  for (const z of [-hd, hd]) for (const s of [-1, 1]) {
    b.push(mul(translate(s * hw * 0.5, 2.4, z + (z > 0 ? 0.18 : -0.18)), rotZ(s * 0.5)));
    b.box([0, 0, 0], [0.14, 5.5, 0.06], C.white);
    b.pop();
  }
  for (let x = -hw + 1; x < hw; x += 1) {
    b.box([x, 3.4, hd + 0.17], [0.05, 6, 0.02], redD);
    b.box([x, 3.4, -hd - 0.17], [0.05, 6, 0.02], redD);
  }
  const rh = 5.5;
  b.quad([-hw - 0.5, H, -hd - 0.5], [-hw * 0.55, H + rh * 0.7, -hd - 0.5], [-hw * 0.55, H + rh * 0.7, hd + 0.5], [-hw - 0.5, H, hd + 0.5], rgb(4868688));
  b.quad([-hw * 0.55, H + rh * 0.7, -hd - 0.5], [0, H + rh, -hd - 0.5], [0, H + rh, hd + 0.5], [-hw * 0.55, H + rh * 0.7, hd + 0.5], rgb(4868688));
  b.quad([hw + 0.5, H, hd + 0.5], [hw * 0.55, H + rh * 0.7, hd + 0.5], [hw * 0.55, H + rh * 0.7, -hd - 0.5], [hw + 0.5, H, -hd - 0.5], rgb(4868688));
  b.quad([hw * 0.55, H + rh * 0.7, hd + 0.5], [0, H + rh, hd + 0.5], [0, H + rh, -hd - 0.5], [hw * 0.55, H + rh * 0.7, -hd - 0.5], rgb(4868688));
  for (const z of [-hd, hd]) {
    b.quad([-hw, H, z], [hw, H, z], [hw * 0.55, H + rh * 0.7, z], [-hw * 0.55, H + rh * 0.7, z], red);
    b.tri([-hw * 0.55, H + rh * 0.7, z], [hw * 0.55, H + rh * 0.7, z], [0, H + rh, z], red);
  }
  for (let kk = 0; kk < 6; kk++) {
    const t0 = kk / 6, t1 = (kk + 1) / 6;
    k.boxes.push({ min: [-hw * (1 - t0 * 0.9), H + rh * t0, -hd], max: [hw * (1 - t0 * 0.9), H + rh * t1, hd] });
  }
  b.box([0, H + rh + 0.3, 0], [1.2, 0.6, 1.2], C.white);
  b.cyl([0, H + rh + 0.6, 0], 0.5, 0, 0.8, rgb(4868688), 8);
  for (let i = 0; i < 3; i++) {
    const z = -hd + 3 + i * 4.5;
    k.interiorWall("x", z, -hw + T, -hw + 4.5, y0, 1.5);
    b.box([-hw + 4.5, y0 + 0.75, z + 2.25], [0.08, 1.5, 4.4], rgb(10123856));
  }
  k.hayBale(-hw + 2, y0, -hd + 4.5);
  k.hayBale(-hw + 2, y0, -hd + 9, 0.3);
  k.hayBale(-hw + 2, y0 + 0.9, -hd + 4.5, 0.1);
  k.hayBale(hw - 2.5, y0, hd - 3);
  k.hayBale(hw - 4, y0, hd - 3, 0.5);
  k.hayBale(hw - 3.2, y0 + 0.9, hd - 3, 0.2);
  k.crate(hw - 2, y0, -hd + 2);
  k.crate(hw - 3.2, y0, -hd + 2, 0.8);
  k.barrel(hw - 1.5, y0, 0, RUST);
  k.barrel(hw - 2.5, y0, 0.6, RUST);
  k.floorSlab(-hw + T, hw - T, -hd + T, -hd + 8, 4, rgb(10123856));
  b.box([0, 4.5, -hd + 8], [w - 0.6, 1, 0.06], rgb(10123856));
  for (let x = -hw + 1; x < hw; x += 1) b.box([x, 4.5, -hd + 8], [0.06, 1, 0.06], rgb(10123856));
  k.stairs(hw - 1.4, -hd + 8.2, y0, 3.6, 5.5, rgb(10123856));
  k.hayBale(-hw + 2, 4, -hd + 2);
  k.hayBale(-hw + 3.5, 4, -hd + 2, 0.4);
  k.hayBale(0, 4, -hd + 3);
  k.loot.push([0, y0, 0], [0, y0, hd - 4], [-2, 4, -hd + 5], [hw - 3, y0, -hd + 5]);
  k.chests.push([-hw + 1.5, 4, -hd + 6]);
  aoY(b.d, -0.2, 2.2, 0.66);
  return { b, boxes: k.boxes, loot: k.loot, chests: k.chests, w, d, h: H + rh, kind: "barn" };
}
function warehouse(pi = 5, seed = 0) {
  const p = PALETTES[pi % PALETTES.length], b = new MB(), k = new Kit(b, p);
  const w = 24, d = 18, hw = w / 2, hd = d / 2, H = 7.5, T = 0.3, wallC = rgb(9411236), y0 = 0.42;
  k.solid([0, 0.2, 0], [w + 0.6, 0.4, d + 0.6], CONCRETE);
  k.floorSlab(-hw + T, hw - T, -hd + T, hd - T, 0.4, rgb(11053220), 0.06);
  k.wall("x", hd - T / 2, -hw, hw, 0.4, H, wallC, [{ x: -5, w: 5, y: 0.4, h: 4.5, door: true }, { x: 6, w: 1.4, y: 0.4, h: 2.4, door: true }, { x: 9.5, w: 1.6, y: 4.8, h: 1.2 }, { x: -10, w: 1.6, y: 4.8, h: 1.2 }], T, DARK);
  k.wall("x", -hd + T / 2, -hw, hw, 0.4, H, wallC, [{ x: 0, w: 5, y: 0.4, h: 4.5, door: true }], T, DARK);
  k.wall("z", -hw + T / 2, -hd, hd, 0.4, H, wallC, [{ x: -4, w: 1.6, y: 4.8, h: 1.2 }, { x: 4, w: 1.6, y: 4.8, h: 1.2 }], T, DARK);
  k.wall("z", hw - T / 2, -hd, hd, 0.4, H, wallC, [{ x: 0, w: 1.4, y: 0.4, h: 2.4, door: true }], T, DARK);
  for (let x = -hw + 0.6; x < hw; x += 0.6) {
    b.box([x, H / 2 + 0.2, hd + 0.17], [0.08, H - 0.4, 0.04], dk(wallC, 0.8));
    b.box([x, H / 2 + 0.2, -hd - 0.17], [0.08, H - 0.4, 0.04], dk(wallC, 0.8));
  }
  for (let z = -hd + 0.6; z < hd; z += 0.6) {
    b.box([hw + 0.17, H / 2 + 0.2, z], [0.04, H - 0.4, 0.08], dk(wallC, 0.8));
    b.box([-hw - 0.17, H / 2 + 0.2, z], [0.04, H - 0.4, 0.08], dk(wallC, 0.8));
  }
  k.gableRoof(w, d, H, 2.2, 0.5, rgb(5922920), "x");
  for (let i = -2; i <= 2; i++) b.box([i * 4.5, H + 1.1, 0], [1.2, 0.1, d - 2], rgb(14216436));
  for (let r = 0; r < 3; r++) k.shelfRack(-hw + 5 + r * 6, y0, -hd + 5, 0, 5, 4);
  for (let r = 0; r < 3; r++) k.shelfRack(-hw + 5 + r * 6, y0, 0, 0, 5, 4);
  k.crate(hw - 3, y0, hd - 3, 1.2);
  k.crate(hw - 4.4, y0, hd - 3, 1);
  k.crate(hw - 3.7, y0 + 1.2, hd - 3, 1);
  k.crate(-hw + 3, y0, hd - 3, 1.2);
  k.barrel(-hw + 5, y0, hd - 3, rgb(3829672));
  k.barrel(-hw + 5.9, y0, hd - 3.6, rgb(14204960));
  k.barrel(-hw + 5.4, y0, hd - 2.4, RUST);
  k.floorSlab(hw - 8, hw - T, -hd + T, hd - T, 4.2, rgb(7305860), 0.3);
  k.stairs(hw - 8.8, -hd + 0.5, y0, 3.8, 6, rgb(7305860));
  b.box([hw - 8, 4.7, -hd + 3.5], [0.06, 1, 6], DARK);
  b.box([hw - 4, 4.7, hd - T], [8, 1, 0.06], DARK);
  k.interiorWall("x", -hd + 5, hw - 8, hw - T, 4.2, 3, hw - 4);
  k.table(hw - 4, 4.2, -hd + 2.5, 1.6, 0.8);
  k.chair(hw - 4, 4.2, -hd + 1.6, 0);
  k.cabinet(hw - 1.2, 4.2, -hd + 2.5, 0.6, 1.4, 1.2, rgb(8028038));
  for (const x of [-6, 0, 6]) for (const z of [-3, 3]) k.ceilingLight(x, H - 0.1, z);
  k.loot.push([-hw + 5, y0, -hd + 2.5], [0, y0, 2.5], [hw - 4, 4.3, 2], [-hw + 3, y0, hd - 5]);
  k.chests.push([hw - 2, 4.2, hd - 2], [-hw + 2, y0, -hd + 2]);
  aoY(b.d, -0.2, 2.2, 0.66);
  return { b, boxes: k.boxes, loot: k.loot, chests: k.chests, w, d, h: H + 2.2, kind: "warehouse" };
}
function tower(pi = 0, seed = 0) {
  const p = PALETTES[pi % PALETTES.length], b = new MB(), k = new Kit(b, p);
  const wood = rgb(10123856), y = 0.2, H = 9;
  for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) k.solid([x, H / 2, z], [0.35, H, 0.35], wood);
  for (let lvl = 1; lvl <= 2; lvl++) {
    const yy = lvl * 3;
    for (const s of [-1, 1]) {
      b.push(mul(translate(s * 2, yy - 1.5, 0), rotX(0.93)));
      b.box([0, 0, 0], [0.16, 5.6, 0.16], wood);
      b.pop();
      b.push(mul(translate(0, yy - 1.5, s * 2), rotZ(0.93)));
      b.box([0, 0, 0], [5.6, 0.16, 0.16], wood);
      b.pop();
    }
  }
  k.floorSlab(-2.6, 2.6, -2.6, 2.6, H, wood, 0.2);
  k.wall("x", 2.5, -2.6, 2.6, H, 1.1, wood, [], 0.12, wood);
  k.wall("x", -2.5, -2.6, 2.6, H, 1.1, wood, [], 0.12, wood);
  k.wall("z", -2.5, -2.6, 2.6, H, 1.1, wood, [], 0.12, wood);
  k.wall("z", 2.5, -2.6, 0.9, H, 1.1, wood, [], 0.12, wood);
  for (const [x, z] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) b.box([x, H + 1.6, z], [0.2, 3.2, 0.2], wood);
  b.quad([-3.2, H + 3.2, -3.2], [-3.2, H + 3.2, 3.2], [0, H + 4.6, 0], [0, H + 4.6, 0], rgb(4868688));
  b.tri([-3.2, H + 3.2, -3.2], [0, H + 4.6, 0], [3.2, H + 3.2, -3.2], rgb(4868688));
  b.tri([3.2, H + 3.2, -3.2], [0, H + 4.6, 0], [3.2, H + 3.2, 3.2], rgb(4868688));
  b.tri([3.2, H + 3.2, 3.2], [0, H + 4.6, 0], [-3.2, H + 3.2, 3.2], rgb(4868688));
  b.tri([-3.2, H + 3.2, 3.2], [0, H + 4.6, 0], [-3.2, H + 3.2, -3.2], rgb(4868688));
  for (let i = 0; i < 14; i++) k.solid([1.8, y + (i + 1) * H / 14 - 0.05, 2.9 - i * 0.02], [1, 0.1, 0.5], wood);
  k.crate(-1.5, H, -1.5, 0.9);
  k.loot.push([0, H, 0]);
  k.chests.push([1.2, H, -1.5]);
  aoY(b.d, -0.2, 2.2, 0.66);
  return { b, boxes: k.boxes, loot: k.loot, chests: k.chests, w: 6, d: 6, h: H + 4.6, kind: "tower" };
}
function motel(pi = 4, seed = 0) {
  const p = PALETTES[pi % PALETTES.length], b = new MB(), k = new Kit(b, p);
  const rooms = 5, rw = 5, w = rooms * rw, d = 8, hw = w / 2, hd = d / 2, H = FH * 2, T = 0.3, wallC = rgb(14735040), y0 = 0.42;
  k.solid([0, 0.2, 0], [w + 0.5, 0.4, d + 0.5], CONCRETE);
  k.floorSlab(-hw + T, hw - T, -hd + T, hd - T, 0.4, rgb(9071178), 0.1);
  for (let f = 0; f < 2; f++) {
    const y = f * FH + 0.4, ops = [];
    for (let i = 0; i < rooms; i++) {
      const x = -hw + (i + 0.5) * rw;
      ops.push({ x: x - 1.4, w: 1, y, h: 2.3, door: true }, { x: x + 0.9, w: 1.6, y: y + 0.9, h: 1.4 });
    }
    k.wall("x", hd - T / 2, -hw, hw, y, FH - 0.4 + (f ? 0.4 : 0), wallC, ops, T, rgb(4881050));
    for (let i = 1; i < rooms; i++) k.interiorWall("z", -hw + i * rw, -hd + T, hd - T, y + (f ? 0 : 0.12), FH - 0.2);
    for (let i = 0; i < rooms; i++) {
      const x = -hw + (i + 0.5) * rw, yy = y + (f ? 0 : 0.12);
      k.bed(x - 1, yy, -hd + 1.8, Math.PI, [rgb(13228266), rgb(15122624), rgb(14214848)][i % 3]);
      k.cabinet(x + 1.6, yy, -hd + 1, 1.2, 1, 0.6, rgb(8018490));
      k.tv(x + 1.6, yy + 1, -hd + 1, 0);
      k.chair(x + 1.5, yy, hd - 1.6, 0);
      k.lamp(x + 0.9, yy, -hd + 0.6);
      k.rug(x, yy, 0, 2.4, 1.6, rgb(6961722));
      k.ceilingLight(x, y + FH - 0.2, 0);
      if (i % 2 === 0) k.loot.push([x, yy, 0.5]);
    }
  }
  k.wall("x", -hd + T / 2, -hw, hw, 0.4, H, wallC, [], T);
  k.wall("z", -hw + T / 2, -hd, hd, 0.4, H, wallC, [], T);
  k.wall("z", hw - T / 2, -hd, hd, 0.4, H, wallC, [], T);
  k.floorSlab(-hw - 0.2, hw + 3.2, hd, hd + 2.4, FH, rgb(9407878), 0.25);
  b.box([0, FH + 0.55, hd + 2.35], [w + 3.4, 1.1, 0.06], rgb(4881050));
  for (let x = -hw; x < hw + 3.2; x += 1.2) b.box([x, FH + 0.55, hd + 2.35], [0.06, 1.1, 0.06], rgb(4881050));
  for (const x of [-hw + 1, 0, hw - 1]) k.solid([x, FH / 2, hd + 2.2], [0.2, FH, 0.2], rgb(4881050));
  k.stairs(hw + 2.5, hd + 2.4 - 6.4, 0.4, FH, 6.4, rgb(9407878));
  b.box([0, H + 0.15, 0], [w + 0.6, 0.3, d + 5.4], rgb(6975092));
  b.box([0, H + 0.5, 0], [w + 0.8, 0.2, d + 5.6], rgb(5330267));
  b.box([-hw - 1.5, 5.5, hd + 3], [0.3, 11, 0.3], rgb(4881050));
  b.box([-hw - 1.5, 10.5, hd + 3], [4.5, 2.2, 0.3], rgb(16049856));
  b.box([-hw - 1.5, 10.5, hd + 3.2], [3.6, 1.2, 0.05], rgb(12595248));
  k.chests.push([hw - 1.2, FH + 0.02, -hd + 1], [-hw + 1.2, 0.52, -hd + 1]);
  aoY(b.d, -0.2, 2.2, 0.66);
  return { b, boxes: k.boxes, loot: k.loot, chests: k.chests, w, d: d + 3, h: H + 1, kind: "motel" };
}
const BUILDERS = { colonial, cottage, shop, gas, barn, warehouse, tower, motel };
export {
  BUILDERS,
  barn,
  colonial,
  cottage,
  gas,
  motel,
  shop,
  tower,
  warehouse
};
