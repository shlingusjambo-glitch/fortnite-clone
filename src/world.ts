import { V3, add, scale, sub, clamp, rand, norm, cross } from './math.js';
import { MB, rgb, dk, Col, LBox, C } from './models.js';
import { BUILDERS, BuildingKind } from './buildings.js';
import { Renderer, Mesh } from './gl.js';

// ---------------- terrain (authored: broad hills + mesas with cliff walls + river valleys) ----------------
export const SIZE = 720, STEP = 3;
const hash = (x: number, z: number) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
const sstep = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export interface POI { name: string; x: number; z: number; h: number; r: number; houses: number; kinds: BuildingKind[]; layout: 'grid' | 'ring' | 'street' | 'scatter'; }
export const POIS: POI[] = [   // Chapter 1 Season 1 layout (north = -z)
  { name: 'ANARCHY ACRES', x: -40, z: -250, h: 10, r: 55, houses: 5, kinds: ['barn', 'barn', 'cottage', 'tower', 'colonial'], layout: 'scatter' },
  { name: 'PLEASANT PARK', x: -190, z: -130, h: 9, r: 70, houses: 8, kinds: ['colonial', 'colonial', 'cottage', 'colonial', 'colonial', 'cottage', 'colonial', 'colonial'], layout: 'ring' },
  { name: 'LOOT LAKE', x: 0, z: -40, h: 3.2, r: 10, houses: 1, kinds: ['colonial'], layout: 'scatter' },
  { name: 'WAILING WOODS', x: 215, z: -195, h: 12, r: 55, houses: 4, kinds: ['cottage', 'tower', 'cottage', 'tower'], layout: 'scatter' },
  { name: 'TOMATO TOWN', x: 110, z: -175, h: 9, r: 48, houses: 5, kinds: ['shop', 'gas', 'cottage', 'shop', 'colonial'], layout: 'street' },
  { name: 'LONELY LODGE', x: 265, z: -40, h: 11, r: 50, houses: 4, kinds: ['tower', 'cottage', 'cottage', 'barn'], layout: 'scatter' },
  { name: 'DUSTY DEPOT', x: 40, z: 60, h: 8, r: 55, houses: 4, kinds: ['warehouse', 'warehouse', 'warehouse', 'tower'], layout: 'grid' },
  { name: 'SALTY SPRINGS', x: 40, z: 150, h: 8, r: 60, houses: 7, kinds: ['colonial', 'cottage', 'colonial', 'gas', 'cottage', 'colonial', 'tower'], layout: 'street' },
  { name: 'RETAIL ROW', x: 205, z: 110, h: 10, r: 68, houses: 8, kinds: ['shop', 'shop', 'gas', 'warehouse', 'motel', 'colonial', 'cottage', 'colonial'], layout: 'grid' },
  { name: 'GREASY GROVE', x: -200, z: 120, h: 8, r: 62, houses: 7, kinds: ['gas', 'shop', 'colonial', 'cottage', 'colonial', 'motel', 'cottage'], layout: 'street' },
  { name: 'FATAL FIELDS', x: -40, z: 250, h: 9, r: 55, houses: 5, kinds: ['barn', 'cottage', 'barn', 'tower', 'colonial'], layout: 'scatter' },
  { name: 'MOISTY MIRE', x: 235, z: 240, h: 4, r: 50, houses: 3, kinds: ['cottage', 'tower', 'cottage'], layout: 'scatter' },
  { name: 'FLUSH FACTORY', x: -195, z: 260, h: 7, r: 50, houses: 4, kinds: ['warehouse', 'warehouse', 'shop', 'tower'], layout: 'grid' },
  { name: 'LUCKY LANDING', x: 60, z: 300, h: 6, r: 40, houses: 3, kinds: ['motel', 'shop', 'cottage'], layout: 'street' },
];

const LAKES: [number, number, number][] = [[0, -40, 62], [150, 30, 26], [-110, -30, 22], [-260, 20, 30], [120, 230, 24], [-120, 190, 22], [280, 160, 26]];
/** flat-topped hills with steep rock walls: [x, z, radius, height] */
const MESAS: [number, number, number, number][] = [[0, -40, 13, 8], [-110, 40, 30, 16], [150, -100, 34, 20], [-270, -230, 34, 16], [280, 40, 26, 14], [-290, 200, 30, 18], [130, 300, 26, 12], [300, -270, 26, 12]];
const ROADS: [number, number][] = [[0, 1], [0, 4], [4, 3], [4, 5], [1, 9], [1, 6], [4, 6], [6, 7], [7, 8], [8, 5], [9, 10], [7, 10], [10, 13], [8, 11], [12, 9], [12, 10], [13, 11], [3, 5]];
function riverMask(x: number, z: number) {
  const a = Math.abs(vnoise(x * 0.004 + 9, z * 0.004 + 3) - 0.5), b = Math.abs(vnoise(x * 0.0035 + 40, z * 0.0035 + 70) - 0.5);
  const c = Math.abs(vnoise(x * 0.003 + 80, z * 0.003 + 20) - 0.5);
  return Math.max(1 - Math.min(a, b, c) / 0.065, 0);
}
export function mesaAt(x: number, z: number): number {   // 0..1 how much a point is on a mesa top
  let m = 0; for (const [mx, mz, mr] of MESAS) { const d = Math.hypot(x - mx, z - mz); m = Math.max(m, sstep((mr - d) / 7 + 1)); } return m;
}
export function terrainH(x: number, z: number): number {
  const r = Math.hypot(x * 0.95, z * 1.05);
  let h = 0;
  for (let o = 0, f = 0.0045, a = 26; o < 4; o++, f *= 2.0, a *= 0.42) h += vnoise(x * f + 31, z * f + 17) * a;   // broad rolling hills
  const coast = vnoise(x * 0.01 + 5, z * 0.01 + 9) * 60;
  h = h - 8 + 16 * (1 - clamp((r - 200 + coast * 0.6) / 110, 0, 1));
  h -= riverMask(x, z) * 10 * clamp((h + 2) / 6, 0, 1);
  for (const [lx, lz, lr] of LAKES) { const d = Math.hypot(x - lx, z - lz); if (d < lr) { const t = clamp((1 - d / lr) * 2.2, 0, 1), k = t * t * (3 - 2 * t); h = h * (1 - k) + -4.5 * k; } }
  for (const [mx, mz, mr, mh] of MESAS) { const d = Math.hypot(x - mx, z - mz); if (d < mr + 10) { const k = sstep((mr - d) / 7 + 1); const top = h + mh + vnoise(x * 0.05, z * 0.05) * 2; h = h * (1 - k) + top * k; } }
  for (const p of POIS) { const t = clamp((Math.hypot(x - p.x, z - p.z) - p.r) / 30, 0, 1); h = p.h * (1 - t) + h * t; }
  return h;
}
function segDist(x: number, z: number, a: POI, b: POI) {
  const dx = b.x - a.x, dz = b.z - a.z, t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}
export function roadDist(x: number, z: number) { let m = 1e9; for (const [ia, ib] of ROADS) m = Math.min(m, segDist(x, z, POIS[ia], POIS[ib])); return m; }
/** base ground colour; the terrain shader adds grass/dirt/rock detail on top */
export function terrainColor(x: number, z: number, y: number): Col {
  if (y < -0.1) return rgb(0xf2f4e6);            // foam line at the waterline
  if (y < 1.4) return rgb(0xe9df9a);              // sand
  if (y < 2.2) return rgb(0xd4dc8a);
  const rd = roadDist(x, z);
  if (rd < 3.2) return rgb(0x6b6e72);             // asphalt
  if (rd < 4.4) return rgb(0xa89a70);             // dirt shoulder
  const v = vnoise(x * 0.03, z * 0.03), dirt = vnoise(x * 0.09 + 50, z * 0.09 + 12);
  if (dirt > 0.86) return rgb(0xa8945e);            // worn dirt patches
  return v > 0.6 ? rgb(0x7fcf3d) : v > 0.4 ? rgb(0x93dc4c) : rgb(0x88d644);
}

export interface Prop { type: 'tree' | 'tree2' | 'pine' | 'rock' | 'bush'; pos: V3; yaw: number; s: number; hp: number; r: number; h: number; dead: number; }
export interface Static { mesh: string; pos: V3; yaw: number; boxes: Box[]; aabb?: Box; hp?: number; maxHp?: number; shake?: number; dead?: boolean; }
export type Mat = 'wood' | 'stone' | 'metal';
export type PieceType = 'wall' | 'floor' | 'ramp' | 'pyramid';
export interface Piece { type: PieceType; mat: Mat; pos: V3; dir: number; hp: number; maxHp: number; key: string; edit: number; born: number; }
/** tiles of an editable piece: walls 3x3 (bit = row*3+col, row 0 = bottom), floors 2x2 */
export const TILES = (t: PieceType) => (t === 'wall' ? 9 : t === 'floor' ? 4 : 0);
export const MAT_HP: Record<Mat, number> = { wood: 150, stone: 300, metal: 500 };
export interface Box { min: V3; max: V3; ref?: any; }
export interface Hit { t: number; p: V3; n: V3; kind: 'terrain' | 'prop' | 'piece' | 'box' | 'static'; ref?: any; }

export class World {
  terrain!: Mesh; props: Prop[] = []; statics: Static[] = []; houseMeshes: Mesh[] = []; houseBoxes: Box[] = []; pieces = new Map<string, Piece>();
  lootSpots: V3[] = []; chestSpots: V3[] = []; footprints: [number, number, number][] = [];
  /** 32m spatial hash of props + statics so collision/raycast only touch nearby objects */
  grid = new Map<number, { props: Prop[]; statics: Static[] }>();
  static GC = 32;
  private gkey(x: number, z: number) { return (Math.floor(x / World.GC) + 512) * 4096 + Math.floor(z / World.GC) + 512; }
  private cell(x: number, z: number) { const k = this.gkey(x, z); let c = this.grid.get(k); if (!c) { c = { props: [], statics: [] }; this.grid.set(k, c); } return c; }
  buildGrid() {
    this.grid.clear();
    for (const q of this.props) this.cell(q.pos[0], q.pos[2]).props.push(q);
    for (const s of this.statics) {
      if (!s.boxes.length) continue;
      const a: Box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      for (const b of s.boxes) for (let i = 0; i < 3; i++) { a.min[i] = Math.min(a.min[i], b.min[i]); a.max[i] = Math.max(a.max[i], b.max[i]); }
      s.aabb = a;
      for (let x = a.min[0]; x <= a.max[0] + World.GC; x += World.GC) for (let z = a.min[2]; z <= a.max[2] + World.GC; z += World.GC) { const c = this.cell(Math.min(x, a.max[0]), Math.min(z, a.max[2])); if (!c.statics.includes(s)) c.statics.push(s); }
    }
  }
  /** cells within rad of (x,z) */
  private near(x: number, z: number, rad: number) { const out: { props: Prop[]; statics: Static[] }[] = []; for (let cx = x - rad; cx <= x + rad + World.GC; cx += World.GC) for (let cz = z - rad; cz <= z + rad + World.GC; cz += World.GC) { const c = this.grid.get(this.gkey(Math.min(cx, x + rad), Math.min(cz, z + rad))); if (c && !out.includes(c)) out.push(c); } return out; }
  constructor(r: Renderer) {
    const b = new MB(), n = Math.floor(SIZE / STEP);
    const N = (x: number, z: number): V3 => norm([terrainH(x - 1, z) - terrainH(x + 1, z), 2, terrainH(x, z - 1) - terrainH(x, z + 1)]);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x0 = -SIZE / 2 + i * STEP, z0 = -SIZE / 2 + j * STEP, x1 = x0 + STEP, z1 = z0 + STEP;
      const p = (x: number, z: number): V3 => [x, terrainH(x, z), z];
      const a = p(x0, z0), bb = p(x1, z0), c = p(x1, z1), d = p(x0, z1);
      if (Math.max(a[1], bb[1], c[1], d[1]) < -2.5) continue;
      const mx = x0 + STEP / 2, mz = z0 + STEP / 2, col = terrainColor(mx, mz, (a[1] + c[1]) / 2);
      b.triN(a, d, c, N(x0, z0), N(x0, z1), N(x1, z1), col); b.triN(a, c, bb, N(x0, z0), N(x1, z1), N(x1, z0), col);
    }
    this.terrain = b.build(r);
    // road center dashes
    for (const [ia, ib] of ROADS) { const A = POIS[ia], B = POIS[ib], L = Math.hypot(B.x - A.x, B.z - A.z), yaw = Math.atan2(B.x - A.x, B.z - A.z); for (let t = 0; t < L; t += 7) { const x = A.x + (B.x - A.x) * t / L, z = A.z + (B.z - A.z) * t / L, y = terrainH(x, z); if (y > 0.5) this.statics.push({ mesh: 'dash', pos: [x, y, z], yaw, boxes: [] }); } }
    const rotBox = (bx: LBox, k: number, o: V3): Box => {   // rotate local AABB by k*90deg around Y then offset
      const c = [bx.min, bx.max].flatMap(m => [[bx.min[0], m[2]], [bx.max[0], m[2]]]) as [number, number][];
      const rr = c.map(([x, z]) => { for (let i = 0; i < k; i++) [x, z] = [z, -x]; return [x, z]; });
      return { min: [Math.min(...rr.map(v => v[0])) + o[0], bx.min[1] + o[1], Math.min(...rr.map(v => v[1])) + o[2]], max: [Math.max(...rr.map(v => v[0])) + o[0], bx.max[1] + o[1], Math.max(...rr.map(v => v[1])) + o[2]] };
    };
    const rotPt = (p: V3, k: number, o: V3): V3 => { let [x, z] = [p[0], p[2]]; for (let i = 0; i < k; i++) [x, z] = [z, -x]; return [x + o[0], p[1] + o[1], z + o[2]]; };
    const addStatic = (mesh: string, pos: V3, k: number, lboxes: LBox[]) => { const hp = mesh.startsWith('house') ? 900 : mesh === 'car' || mesh === 'truck' ? 400 : 220; this.statics.push({ mesh, pos, yaw: k * Math.PI / 2, boxes: lboxes.map(bx => rotBox(bx, k, pos)), hp, maxHp: hp, shake: 0, dead: false }); };
    const footprints = this.footprints;   // x,z,radius — keep buildings from overlapping
    const placeBuilding = (kind: BuildingKind, x: number, z: number, k: number, pi: number, seed: number) => {
      const bd = BUILDERS[kind](pi, seed), rad = Math.hypot(bd.w, bd.d) / 2 + 2;
      for (const f of footprints) if (Math.hypot(f[0] - x, f[1] - z) < f[2] + rad) return false;
      footprints.push([x, z, rad]);
      this.houseMeshes.push(r.upload(new Float32Array(bd.b.d)));
      const y = terrainH(x, z) - 0.15, pos: V3 = [x, y, z];
      addStatic('house' + (this.houseMeshes.length - 1), pos, k, bd.boxes);
      this.houseBoxes.push(...this.statics[this.statics.length - 1].boxes);
      for (const l of bd.loot) this.lootSpots.push(rotPt(l, k, pos)); for (const c of bd.chests) this.chestSpots.push(rotPt(c, k, pos));
      // yard props in front of houses
      const fa = k * Math.PI / 2, fx = Math.sin(fa), fz = Math.cos(fa), sx = Math.cos(fa), sz = -Math.sin(fa), front = bd.d / 2 + 5;
      if (kind === 'colonial' || kind === 'cottage') {
        if (seed % 2 === 0) addStatic(seed % 4 ? 'car' : 'truck', [x + fx * front + sx * 5, y + 0.15, z + fz * front + sz * 5], k, [{ min: [-1.3, 0, -2.2], max: [1.3, 2.8, 3.8] }]);
        addStatic('mailbox', [x + fx * (front + 1) - sx * 3, y + 0.15, z + fz * (front + 1) - sz * 3], k, []);
        if (seed % 3 === 0) { addStatic('fence', [x + fx * (front + 2) - sx * 4, y + 0.15, z + fz * (front + 2) - sz * 4], k, []); addStatic('fence', [x + fx * (front + 2) + sx * 4, y + 0.15, z + fz * (front + 2) + sz * 4], k, []); }
        addStatic('hedge', [x - sx * (bd.w / 2 + 2.5), y + 0.15, z - sz * (bd.w / 2 + 2.5)], (k + 1) % 4, []);
      }
      if (kind === 'shop' || kind === 'gas' || kind === 'motel') { addStatic('dumpster', [x - sx * (bd.w / 2 + 3), y, z - sz * (bd.w / 2 + 3)], k, [{ min: [-1.1, 0, -0.6], max: [1.1, 1.4, 0.6] }]); addStatic('lamp', [x + fx * (front + 2) + sx * (bd.w / 2 - 1), y + 0.15, z + fz * (front + 2) + sz * (bd.w / 2 - 1)], 0, [{ min: [-0.15, 0, -0.15], max: [0.15, 5, 0.15] }]); }
      if (kind === 'warehouse') { addStatic('truck', [x + fx * (front + 4) - sx * 6, y + 0.15, z + fz * (front + 4) - sz * 6], k, [{ min: [-1.3, 0, -2.2], max: [1.3, 2.8, 3.8] }]); }
      return true;
    };
    for (let pi = 0; pi < POIS.length; pi++) {
      const p = POIS[pi], ty = (pi % 4) * Math.PI / 2, ca = Math.cos(ty), sa = Math.sin(ty);
      const slots: [number, number, number][] = [];   // local x,z,k(facing)
      if (p.layout === 'ring') { for (let i = 0; i < p.houses; i++) { const a = i / p.houses * 6.28; slots.push([Math.cos(a) * 36, Math.sin(a) * 36, ((Math.round((Math.atan2(-Math.cos(a), -Math.sin(a))) / (Math.PI / 2)) % 4) + 4) % 4]); } }
      else if (p.layout === 'street') { for (let i = 0; i < p.houses; i++) { const row = i % 2, col = Math.floor(i / 2); slots.push([(col - (Math.ceil(p.houses / 2) - 1) / 2) * 30, row ? 20 : -20, row ? 2 : 0]); } }
      else if (p.layout === 'grid') { for (let i = 0; i < p.houses; i++) { const row = Math.floor(i / 3), col = i % 3; slots.push([(col - 1) * 34, (row - 0.5) * 36, row ? 2 : 0]); } }
      else { for (let i = 0; i < p.houses; i++) { const a = i * 2.4 + 0.7, rr = 16 + (i % 3) * 14; slots.push([Math.cos(a) * rr, Math.sin(a) * rr, i % 4]); } }
      for (let i = 0; i < p.houses; i++) {
        const [lx, lz, lk] = slots[i], x = p.x + lx * ca + lz * sa, z = p.z - lx * sa + lz * ca, k = (lk + (pi % 4)) % 4;
        placeBuilding(p.kinds[i % p.kinds.length], x, z, k, pi + i, i + pi * 3);
      }
      // street furniture along the main street
      for (let tt = -p.r * 0.7; tt < p.r * 0.7; tt += 7) { const x = p.x + ca * tt, z = p.z - sa * tt; this.statics.push({ mesh: 'dash', pos: [x, p.h - 0.1, z], yaw: Math.PI / 2 + ty, boxes: [] }); }
      for (let tt = -p.r * 0.6; tt < p.r * 0.6; tt += 24) { const x = p.x + ca * tt + sa * 7, z = p.z - sa * tt + ca * 7; addStatic('lamp', [x, p.h, z], 0, [{ min: [-0.15, 0, -0.15], max: [0.15, 5, 0.15] }]); }
      if (p.name === 'PLEASANT PARK') { addStatic('fountain', [p.x, p.h, p.z], 0, [{ min: [-3, 0, -3], max: [3, 1, 3] }]); for (let a = 0; a < 6; a++) addStatic('bench', [p.x + Math.cos(a * Math.PI / 3) * 8, p.h, p.z + Math.sin(a * Math.PI / 3) * 8], a, []); }
      if (p.name === 'SALTY SPRINGS' || p.name === 'RETAIL ROW' || p.name === 'ANARCHY ACRES' || p.name === 'DUSTY DEPOT') addStatic('waterTower', [p.x - 44, p.h, p.z + 38], 0, [{ min: [-3.8, 0, -3.8], max: [3.8, 21.0, 3.8] }]);
      if (p.name === 'ANARCHY ACRES' || p.name === 'FATAL FIELDS') for (let i = -3; i <= 3; i++) { addStatic('fence', [p.x + i * 8, p.h, p.z - 40], 0, []); addStatic('fence', [p.x + i * 8, p.h, p.z + 40], 0, []); }
    }
    // vegetation: authored clusters (woods, tree lines along roads/rivers) + sparse fill
    const put = (x: number, z: number, type: Prop['type'], s: number) => { const y = terrainH(x, z); if (y < 2.2) return; for (const f of footprints) if (Math.hypot(f[0] - x, f[1] - z) < f[2] + 1) return; if (roadDist(x, z) < 6) return; this.props.push({ type, pos: [x, y - 0.2, z], yaw: rand(0, 6.28), s, hp: type === 'bush' ? 30 : 250, r: (type === 'rock' ? 1.4 : type === 'bush' ? 0.7 : 0.4) * s, h: (type === 'rock' ? 1.2 : type === 'bush' ? 1 : 6) * s, dead: 0 }); };
    for (let k = 0; k < 1500; k++) {   // sparse fill
      const x = rand(-SIZE / 2, SIZE / 2), z = rand(-SIZE / 2, SIZE / 2), rv = Math.random();
      let ok = true; for (const p of POIS) if (Math.hypot(x - p.x, z - p.z) < p.r * 0.7 && p.layout !== 'scatter') ok = false; if (!ok) continue;
      const type: Prop['type'] = rv < 0.4 ? 'tree' : rv < 0.55 ? 'tree2' : rv < 0.72 ? 'pine' : rv < 0.9 ? 'rock' : 'bush';
      put(x, z, type, type === 'pine' ? rand(1.1, 1.7) : type === 'rock' ? rand(0.9, 1.8) : type === 'bush' ? rand(1.2, 1.8) : rand(1.3, 1.9));
    }
    for (const [cx, cz, cr, pineK] of [[215, -195, 60, 0.85], [265, -40, 55, 0.9], [235, 240, 60, 0.2], [-120, 40, 50, 0.6], [-300, -60, 45, 0.5], [120, 10, 40, 0.4]] as [number, number, number, number][]) {   // woods
      for (let k = 0; k < 220; k++) { const a = rand(0, 6.28), rr = Math.sqrt(Math.random()) * cr; const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr; const pine = Math.random() < pineK; put(x, z, pine ? 'pine' : Math.random() < 0.7 ? 'tree' : 'tree2', pine ? rand(1.3, 2.0) : rand(1.4, 2.0)); }
    }
    for (const [ia, ib] of ROADS) { const A = POIS[ia], B = POIS[ib], L = Math.hypot(B.x - A.x, B.z - A.z), nx = -(B.z - A.z) / L, nz = (B.x - A.x) / L; for (let tt = 30; tt < L - 30; tt += rand(10, 18)) { const s = Math.random() < 0.5 ? 1 : -1, x = A.x + (B.x - A.x) * tt / L + nx * s * rand(9, 14), z = A.z + (B.z - A.z) * tt / L + nz * s * rand(9, 14); put(x, z, Math.random() < 0.8 ? 'tree' : 'bush', rand(1.3, 1.8)); } }
    for (const [mx, mz, mr] of MESAS) for (let k = 0; k < 10; k++) { const a = rand(0, 6.28); put(mx + Math.cos(a) * rand(0, mr * 0.7), mz + Math.sin(a) * rand(0, mr * 0.7), Math.random() < 0.5 ? 'pine' : 'rock', rand(1.2, 1.8)); for (let q = 0; q < 2; q++) put(mx + Math.cos(a) * (mr + rand(6, 14)), mz + Math.sin(a) * (mr + rand(6, 14)), 'rock', rand(1.4, 2.4)); }
    this.buildGrid();
  }
  /** lush 3D grass blade clusters with varied heights, wildflowers and wind sway */
  grassChunks = new Map<string, Mesh>();
  grassChunk(r: Renderer, cx: number, cz: number): Mesh {
    const key = cx + ',' + cz; let m = this.grassChunks.get(key); if (m) return m;
    const g = new MB(), S = 24, seed = cx * 73856093 ^ cz * 19349663; let rs = (seed >>> 0) || 1;
    const rnd = () => { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; return ((rs >>> 0) % 10000) / 10000; };
    for (let k = 0; k < 1000; k++) {
      const x = cx * S + rnd() * S, z = cz * S + rnd() * S, y = terrainH(x, z);
      if (y < 2.3 || roadDist(x, z) < 4.6 || this.footprints.some(f => Math.hypot(f[0] - x, f[1] - z) < f[2] - 1)) continue;
      // Tall, lush grass blades (0.45m - 0.75m tall) matching reference images
      const hgt = 0.45 + rnd() * 0.35, w = 0.05 + rnd() * 0.04, a = rnd() * 3.14;
      const c: Col = [0.36 + rnd() * 0.12, 0.82 + rnd() * 0.14, 0.25];
      // 3 intersecting blades per clump for full 3D volume
      for (const aa of [a, a + 1.05, a + 2.1]) {
        const dx = Math.cos(aa) * w, dz = Math.sin(aa) * w;
        const tipX = x + dx * 0.5 + Math.cos(a + 1.5) * 0.12, tipZ = z + dz * 0.5 + Math.sin(a + 1.5) * 0.12;
        g.triN([x - dx, y, z - dz], [x + dx, y, z + dz], [tipX, y + hgt, tipZ], [0, 1, 0], [0, 1, 0], [0, 1, 0], c);
        g.triN([x + dx, y, z + dz], [x - dx, y, z - dz], [tipX, y + hgt, tipZ], [0, 1, 0], [0, 1, 0], [0, 1, 0], dk(c, 0.9));
      }
      // Scattered wildflowers (yellow and white blossoms)
      if (rnd() < 0.08) {
        const flowerCol: Col = rnd() < 0.6 ? [1.0, 0.92, 0.35] : [0.98, 0.98, 0.98];
        g.sphere([x, y + hgt * 0.85, z], 0.065, flowerCol, 6, 1, true);
      }
    }
    m = g.build(r); this.grassChunks.set(key, m); return m;
  }

  /** top-down map image (used by minimap + fullscreen map) */
  drawMap(cv: HTMLCanvasElement) {
    const ctx = cv.getContext('2d')!, n = cv.width, px = SIZE / n, img = ctx.createImageData(n, n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -SIZE / 2 + i * px, z = -SIZE / 2 + j * px, y = terrainH(x, z);
      let c: Col = y < -0.2 ? (y < -4 ? rgb(0x3a9ad8) : rgb(0x5ec2e6)) : terrainColor(x, z, y);
      if (y > 0.5) { for (const [ia, ib] of ROADS) if (segDist(x, z, POIS[ia], POIS[ib]) < 1.6) c = rgb(0xe8e8e0); }
      const o = (j * n + i) * 4; img.data[o] = c[0] * 255; img.data[o + 1] = c[1] * 255; img.data[o + 2] = c[2] * 255; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.fillStyle = '#3f8a34';
    for (const q of this.props) if (q.type !== 'bush' && q.type !== 'rock') { const i = (q.pos[0] + SIZE / 2) / px, j = (q.pos[2] + SIZE / 2) / px; ctx.fillRect(i - 0.8, j - 0.8, 1.6, 1.6); }
    ctx.fillStyle = '#e4e6e8';
    for (const s of this.statics) if (s.mesh.startsWith('house')) { const i = (s.pos[0] + SIZE / 2) / px, j = (s.pos[2] + SIZE / 2) / px; ctx.fillRect(i - 3, j - 2.5, 6, 5); }
    ctx.font = 'italic bold 15px Impact, Arial'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#000a'; ctx.fillStyle = '#fff';
    for (const p of POIS) { const i = (p.x + SIZE / 2) / px, j = (p.z + SIZE / 2) / px + 5; ctx.strokeText(p.name, i, j); ctx.fillText(p.name, i, j); }
  }

  // ---------------- building ----------------
  static key(type: PieceType, p: V3, dir: number) { return `${type}:${p[0]},${p[1]},${p[2]}:${type === 'floor' || type === 'pyramid' ? 0 : dir % 2}`; }
  place(type: PieceType, mat: Mat, pos: V3, dir: number): Piece | null {
    const key = World.key(type, pos, dir);
    if (this.pieces.has(key)) return null;
    const p: Piece = { type, mat, pos, dir, hp: MAT_HP[mat], maxHp: MAT_HP[mat], key, edit: 0, born: performance.now() / 1000 };
    this.pieces.set(key, p); return p;
  }
  damagePiece(p: Piece, d: number) { p.hp -= d; if (p.hp <= 0) this.pieces.delete(p.key); }
  pieceBox(p: Piece): Box {
    const [x, y, z] = p.pos;
    if (p.type === 'wall') return p.dir % 2 === 0 ? { min: [x - 2, y, z - 0.13], max: [x + 2, y + 4, z + 0.13], ref: p } : { min: [x - 0.13, y, z - 2], max: [x + 0.13, y + 4, z + 2], ref: p };
    if (p.type === 'floor') return { min: [x - 2, y - 0.22, z - 2], max: [x + 2, y + 0.02, z + 2], ref: p };
    if (p.type === 'ramp') return { min: [x - 2, y - 0.25, z - 2], max: [x + 2, y + 4, z + 2], ref: p };
    return { min: [x - 2, y, z - 2], max: [x + 2, y + 2, z + 2], ref: p };
  }
  /** collision boxes honoring edits (removed tiles leave holes) */
  pieceBoxes(p: Piece): Box[] {
    if (!p.edit || !TILES(p.type)) return [this.pieceBox(p)];
    const [x, y, z] = p.pos, out: Box[] = [];
    if (p.type === 'wall') {
      const along = p.dir % 2 === 0 ? 0 : 2;   // axis the wall spans
      for (let i = 0; i < 9; i++) { if (p.edit & (1 << i)) continue; const r = Math.floor(i / 3), c = i % 3, lo = -2 + c * 4 / 3, hi = lo + 4 / 3; const b: Box = { min: [x - 0.13, y + r * 4 / 3, z - 0.13], max: [x + 0.13, y + (r + 1) * 4 / 3, z + 0.13], ref: p }; b.min[along] = p.pos[along] + lo; b.max[along] = p.pos[along] + hi; out.push(b); }
    } else for (let i = 0; i < 4; i++) { if (p.edit & (1 << i)) continue; const cx = i % 2 ? 1 : -1, cz = i > 1 ? 1 : -1; out.push({ min: [x + Math.min(0, cx * 2), y - 0.22, z + Math.min(0, cz * 2)], max: [x + Math.max(0, cx * 2), y + 0.02, z + Math.max(0, cz * 2)], ref: p }); }
    return out;
  }
  /** which tile of a wall/floor a world point (on the piece) falls in, or -1 */
  tileAt(p: Piece, pt: V3): number {
    const lx = pt[0] - p.pos[0], ly = pt[1] - p.pos[1], lz = pt[2] - p.pos[2];
    if (p.type === 'wall') { const a = p.dir % 2 === 0 ? lx : lz, c = clamp(Math.floor((a + 2) / (4 / 3)), 0, 2), r = clamp(Math.floor(ly / (4 / 3)), 0, 2); return r * 3 + c; }
    if (p.type === 'floor') return (lx > 0 ? 1 : 0) + (lz > 0 ? 2 : 0);
    return -1;
  }
  slopeH(p: Piece, x: number, z: number): number {
    const lx = x - p.pos[0], lz = z - p.pos[2];
    if (Math.abs(lx) > 2 || Math.abs(lz) > 2) return -Infinity;
    if (p.type === 'pyramid') return p.pos[1] + 2 - Math.max(Math.abs(lx), Math.abs(lz));
    if (p.type !== 'ramp') return -Infinity;
    const a = p.dir * Math.PI / 2, fz = -Math.sin(a) * lx + Math.cos(a) * lz;
    return p.pos[1] + (fz + 2);
  }
  solids(x: number, z: number, rad = 10): Box[] {
    const out: Box[] = [];
    for (const p of this.pieces.values()) if ((p.type === 'wall' || p.type === 'floor') && Math.abs(p.pos[0] - x) < rad && Math.abs(p.pos[2] - z) < rad) out.push(...this.pieceBoxes(p));
    for (const c of this.near(x, z, rad)) {
      for (const q of c.props) if (!q.dead && q.type !== 'bush' && Math.abs(q.pos[0] - x) < rad && Math.abs(q.pos[2] - z) < rad) out.push({ min: [q.pos[0] - q.r, q.pos[1] - 1, q.pos[2] - q.r], max: [q.pos[0] + q.r, q.pos[1] + q.h, q.pos[2] + q.r], ref: q });
      for (const s of c.statics) if (!s.dead && s.aabb && s.aabb.min[0] < x + rad && s.aabb.max[0] > x - rad && s.aabb.min[2] < z + rad && s.aabb.max[2] > z - rad) out.push(...s.boxes);
    }
    return out;
  }
  groundH(x: number, z: number, feetY: number): number {
    let g = terrainH(x, z);
    for (const p of this.pieces.values()) {
      if (p.type !== 'ramp' && p.type !== 'pyramid') continue;
      const h = this.slopeH(p, x, z);
      if (h > g && feetY > h - 1.6 && feetY < h + 0.6) g = h;
    }
    return g;
  }

  // ---------------- raycast ----------------
  static rayBox(o: V3, d: V3, b: Box, maxT: number): { t: number; n: V3 } | null {
    let t0 = 0, t1 = maxT, ax = -1;
    for (let i = 0; i < 3; i++) {
      const inv = 1 / d[i]; let a = (b.min[i] - o[i]) * inv, c = (b.max[i] - o[i]) * inv;
      if (a > c) [a, c] = [c, a];
      if (a > t0) { t0 = a; ax = i; }
      t1 = Math.min(t1, c);
      if (t0 > t1) return null;
    }
    const n: V3 = [0, 0, 0]; if (ax >= 0) n[ax] = d[ax] > 0 ? -1 : 1;
    return { t: t0, n };
  }
  raycast(o: V3, d: V3, maxT: number, extra: Box[] = []): Hit | null {
    let best: Hit | null = null;
    const consider = (h: Hit | null) => { if (h && (!best || h.t < best.t)) best = h; };
    let prev = o[1] - terrainH(o[0], o[2]);
    for (let t = 0; t < maxT; t += 1.0) {
      const p = add(o, scale(d, t)), dh = p[1] - terrainH(p[0], p[2]);
      if (dh < 0) { const tt = t - 1.0 * (-dh / (prev - dh || 1)); consider({ t: tt, p: add(o, scale(d, tt)), n: [0, 1, 0], kind: 'terrain' }); break; }
      prev = dh;
      if (p[1] > 80 && d[1] > 0) break;
    }
    const seen = new Set<{ props: Prop[]; statics: Static[] }>(), tEnd = best ? (best as Hit).t : maxT;
    for (let t = 0; t <= tEnd + World.GC; t += World.GC * 0.5) {
      const px = o[0] + d[0] * Math.min(t, tEnd), pz = o[2] + d[2] * Math.min(t, tEnd);
      for (const c of this.near(px, pz, World.GC * 0.5)) {
        if (seen.has(c)) continue; seen.add(c);
        for (const q of c.props) {
          if (q.dead || q.type === 'bush') continue;
          const h = World.rayBox(o, d, { min: [q.pos[0] - q.r, q.pos[1], q.pos[2] - q.r], max: [q.pos[0] + q.r, q.pos[1] + q.h, q.pos[2] + q.r] }, maxT);
          if (h) consider({ t: h.t, p: add(o, scale(d, h.t)), n: h.n, kind: 'prop', ref: q });
        }
        for (const s of c.statics) { if (s.dead || !s.aabb || !World.rayBox(o, d, s.aabb, maxT)) continue; for (const bx of s.boxes) { const h = World.rayBox(o, d, bx, maxT); if (h) consider({ t: h.t, p: add(o, scale(d, h.t)), n: h.n, kind: 'static', ref: s }); } }
      }
    }
    for (const p of this.pieces.values()) {
      const h = World.rayBox(o, d, this.pieceBox(p), maxT);
      if (!h) continue;
      if (p.type === 'wall' || p.type === 'floor') { for (const bx of this.pieceBoxes(p)) { const hh = World.rayBox(o, d, bx, maxT); if (hh) consider({ t: hh.t, p: add(o, scale(d, hh.t)), n: hh.n, kind: 'piece', ref: p }); } continue; }
      for (let t = h.t; t < h.t + 8 && t < maxT; t += 0.15) {
        const pt = add(o, scale(d, t)); const sh = this.slopeH(p, pt[0], pt[2]);
        if (sh === -Infinity) break;
        if (pt[1] <= sh && pt[1] >= p.pos[1] - 0.3) { consider({ t, p: pt, n: [0, 1, 0], kind: 'piece', ref: p }); break; }
      }
    }
    for (const b of extra) { const h = World.rayBox(o, d, b, maxT); if (h) consider({ t: h.t, p: add(o, scale(d, h.t)), n: h.n, kind: 'box', ref: b.ref }); }
    return best;
  }
}
