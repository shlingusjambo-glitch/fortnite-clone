import { V3, add, scale, sub, clamp, rand, norm, cross } from './math.js';
import { MB, rgb, Col, house, HOUSE_STYLES, LBox, C } from './models.js';
import { Renderer, Mesh } from './gl.js';

// ---------------- terrain ----------------
export const SIZE = 720, STEP = 3;
const hash = (x: number, z: number) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
export interface POI { name: string; x: number; z: number; h: number; r: number; houses: number; }
export const POIS: POI[] = [
  { name: 'PLEASANT PARK', x: -160, z: -140, h: 9, r: 70, houses: 8 }, { name: 'SALTY SPRINGS', x: 40, z: -50, h: 8, r: 60, houses: 6 },
  { name: 'RETAIL ROW', x: 190, z: 20, h: 10, r: 65, houses: 6 }, { name: 'LAZY LAKE', x: 60, z: 170, h: 7, r: 60, houses: 6 },
  { name: 'MISTY MEADOWS', x: -150, z: 150, h: 8, r: 60, houses: 6 }, { name: 'SWEATY SANDS', x: -240, z: 10, h: 4, r: 55, houses: 4 },
  { name: 'WEEPING WOODS', x: -40, z: 60, h: 12, r: 60, houses: 1 }, { name: 'DIRTY DOCKS', x: 210, z: -160, h: 5, r: 50, houses: 4 },
  { name: 'CRAGGY CLIFFS', x: 60, z: -260, h: 22, r: 50, houses: 3 },
];
const LAKES: [number, number, number][] = [[150, 140, 34], [-70, -30, 24], [210, 110, 30], [-190, -210, 36], [-20, 240, 40], [140, -90, 26], [-270, -110, 30]];
const ROADS: [number, number][] = [[0, 1], [1, 2], [1, 3], [3, 4], [0, 5], [4, 5], [1, 6], [6, 4], [2, 7], [0, 7]];
function riverMask(x: number, z: number) {  // two winding rivers
  const a = Math.abs(vnoise(x * 0.004 + 9, z * 0.004 + 3) - 0.5), b = Math.abs(vnoise(x * 0.0035 + 40, z * 0.0035 + 70) - 0.5);
  const c = Math.abs(vnoise(x * 0.003 + 80, z * 0.003 + 20) - 0.5);
  return Math.max(1 - Math.min(a, b, c) / 0.065, 0);
}
export function terrainH(x: number, z: number): number {
  const r = Math.hypot(x * 0.95, z * 1.05);
  let h = 0;
  for (let o = 0, f = 0.0045, a = 26; o < 4; o++, f *= 2.0, a *= 0.42) h += vnoise(x * f + 31, z * f + 17) * a;   // broad rolling hills, few octaves
  const coast = vnoise(x * 0.01 + 5, z * 0.01 + 9) * 60;
  h = h - 8 + 16 * (1 - clamp((r - 200 + coast * 0.6) / 110, 0, 1));
  // Landmark mesas with steep readable silhouettes, softened just enough for traversal.
  for (const [mx,mz,mr,mh] of [[-255,105,46,30],[115,-235,42,34],[245,205,48,28]] as [number,number,number,number][]) {
    const d=Math.hypot(x-mx,z-mz), top=1-clamp((d-mr*.58)/(mr*.42),0,1); h+=top*top*(3-2*top)*mh;
  }
  h -= riverMask(x, z) * 10 * clamp((h + 2) / 6, 0, 1);
  for (const [lx, lz, lr] of LAKES) { const d = Math.hypot(x - lx, z - lz); if (d < lr) { const t = clamp((1 - d / lr) * 2.2, 0, 1), k = t * t * (3 - 2 * t); h = h * (1 - k) + -4.5 * k; } }
  for (const p of POIS) { const t = clamp((Math.hypot(x - p.x, z - p.z) - p.r) / 30, 0, 1); h = p.h * (1 - t) + h * t; }
  return h;
}
function segDist(x: number, z: number, a: POI, b: POI) {
  const dx = b.x - a.x, dz = b.z - a.z, t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}
export function terrainColor(x: number, z: number, y: number): Col {
  if (y < -0.1) return rgb(0xf2f4e6);            // foam line at the waterline
  if (y < 1.4) return rgb(0xe9df9a);              // sand
  if (y < 2.2) return rgb(0xd4dc8a);
  if (y > 48) return rgb(0x9da09b);
  const v = vnoise(x * 0.025, z * 0.025), broad=vnoise(x*.007+40,z*.007-11), warm=vnoise(x*.011-8,z*.011+20);
  if (y>32 && broad>.42) return v>.52?rgb(0xa6aa9e):rgb(0x8f958d);
  if (warm>.67) return v>.5?rgb(0x83be45):rgb(0x6da63c);
  if (broad<.3) return v>.55?rgb(0x62b74b):rgb(0x4f9d45);
  return v > 0.62 ? rgb(0xa7dc58) : v > 0.42 ? rgb(0x83c94b) : rgb(0x67b648);
}

export interface Prop { type: 'tree' | 'tree2' | 'pine' | 'rock' | 'bush'; pos: V3; yaw: number; s: number; hp: number; r: number; h: number; dead: number; }
export interface Static { mesh: string; pos: V3; yaw: number; boxes: Box[]; hp?: number; maxHp?: number; shake?: number; dead?: boolean; }
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
  constructor(r: Renderer) {
    const b = new MB(), n = Math.floor(SIZE / STEP);
    const N = (x: number, z: number): V3 => norm([terrainH(x - 1, z) - terrainH(x + 1, z), 2, terrainH(x, z - 1) - terrainH(x, z + 1)]);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x0 = -SIZE / 2 + i * STEP, z0 = -SIZE / 2 + j * STEP, x1 = x0 + STEP, z1 = z0 + STEP;
      const p = (x: number, z: number): V3 => [x, terrainH(x, z), z];
      const a = p(x0, z0), bb = p(x1, z0), c = p(x1, z1), d = p(x0, z1);
      if (Math.max(a[1], bb[1], c[1], d[1]) < -2.5) continue;
      const mx=x0+STEP/2,mz=z0+STEP/2, nn=N(mx,mz), base=terrainColor(mx,mz,(a[1]+c[1])/2), col:Col=nn[1]<.78?rgb(nn[1]<.58?0x8f887d:0xa9a18f):base;
      b.triN(a, d, c, N(x0, z0), N(x0, z1), N(x1, z1), col); b.triN(a, c, bb, N(x0, z0), N(x1, z1), N(x1, z0), col);
    }
    this.terrain = b.build(r);
    // road dashes
    for (const [ia, ib] of ROADS) { const A = POIS[ia], B = POIS[ib], L = Math.hypot(B.x - A.x, B.z - A.z), yaw = Math.atan2(B.x - A.x, B.z - A.z); for (let t = 0; t < L; t += 7) { const x = A.x + (B.x - A.x) * t / L, z = A.z + (B.z - A.z) * t / L, y = terrainH(x, z); if (y > 0.5) this.statics.push({ mesh: 'dash', pos: [x, y, z], yaw, boxes: [] }); } }
    // Authored neighborhood plans: irregular blocks, cul-de-sacs and waterfront streets.
    const rotBox = (bx: LBox, k: number, o: V3): Box => {   // rotate local AABB by k*90deg around Y then offset
      const c = [bx.min, bx.max].flatMap(m => [[bx.min[0], m[2]], [bx.max[0], m[2]]]) as [number, number][];
      const r = c.map(([x, z]) => { for (let i = 0; i < k; i++) [x, z] = [z, -x]; return [x, z]; });
      return { min: [Math.min(...r.map(v => v[0])) + o[0], bx.min[1] + o[1], Math.min(...r.map(v => v[1])) + o[2]], max: [Math.max(...r.map(v => v[0])) + o[0], bx.max[1] + o[1], Math.max(...r.map(v => v[1])) + o[2]] };
    };
    const addStatic = (mesh: string, pos: V3, k: number, lboxes: LBox[]) => { const hp=mesh.startsWith('house')?650:mesh==='building'?1000:mesh==='car'||mesh==='truck'?400:220; this.statics.push({ mesh, pos, yaw: k * Math.PI / 2, boxes: lboxes.map(b => rotBox(b, k, pos)),hp,maxHp:hp,shake:0,dead:false }); };
    const plans: [number, number, number][] = [[-30,-20,0],[-8,-26,0],[18,-22,0],[33,-4,1],[25,22,2],[1,29,2],[-25,24,2],[-36,3,3],[0,0,1],[14,5,3]];
    const shopBoxes: LBox[] = [
      {min:[-9,0,-7.2],max:[9,8.7,-6.8]},{min:[-9,0,-7],max:[-8.7,8.7,7]},{min:[8.7,0,-7],max:[9,8.7,7]},
      {min:[-9,0,6.8],max:[-3.6,8.7,7.2]},{min:[3.6,0,6.8],max:[9,8.7,7.2]},{min:[-3.6,7.5,6.8],max:[3.6,8.7,7.2]},
      {min:[-9,4.1,-7],max:[5.8,4.45,7]},{min:[7,4.1,-7],max:[9,4.45,7]}
    ];
    for (let pi = 0; pi < POIS.length; pi++) {
      const p = POIS[pi], n = p.houses, per = Math.ceil(n / 2), townYaw = (pi % 4) * Math.PI / 2;
      for (let i = 0; i < n; i++) {
        const base = plans[(i + pi * 2) % plans.length], ca = Math.cos(townYaw), sa = Math.sin(townYaw), ox = base[0] * ca + base[1] * sa, oz = -base[0] * sa + base[1] * ca;
        const x = p.x + ox, z = p.z + oz, row = (base[2] + pi) % 4;
        const st = HOUSE_STYLES[(i + p.houses) % HOUSE_STYLES.length];
        const spec = { w: 14 + Math.floor(rand(0, 3)) * 2, d: 10 + Math.floor(rand(0, 2)) * 2, floors: rand(0, 1) < 0.75 ? 2 : 1, ...st };
        const hb = new MB(); const lb = house(hb, spec); this.houseMeshes.push(r.upload(new Float32Array(hb.d)));
        const k = row, y = p.h - 0.15;
        addStatic('house' + (this.houseMeshes.length - 1), [x, y, z], k, lb);
        this.houseBoxes.push(...this.statics[this.statics.length - 1].boxes);
        const fa = k * Math.PI / 2, fx = Math.sin(fa), fz = Math.cos(fa);
        if (i % 2 === 0) addStatic(i % 4 ? 'car' : 'truck', [x + 6, y + 0.15, z + fz * 10], k, [{ min: [-1.3, 0, -2.2], max: [1.3, 2.8, 3.8] }]);
        addStatic('lamp', [x - 9, y + 0.15, z + fz * 9], 0, [{ min: [-0.15, 0, -0.15], max: [0.15, 5, 0.15] }]);
        if (i % 3 === 0) addStatic('bench', [x + 10, y + 0.15, z + fz * 8], k, [{ min: [-0.8, 0, -0.3], max: [0.8, 0.9, 0.3] }]);
        addStatic('hedge', [x + spec.w / 2 + 3, y + 0.15, z], 1, []);
        if (i % 2 === 1) { addStatic('fence', [x - 4, y + 0.15, z + fz * (spec.d / 2 + 7)], 0, []); addStatic('fence', [x + 4, y + 0.15, z + fz * (spec.d / 2 + 7)], 0, []); }
        addStatic('mailbox', [x - 3, y + 0.15, z + fz * (spec.d / 2 + 5.5)], 0, []);
      }
      for (let t = -p.r * .7; t < p.r * .7; t += 7) { const x = p.x + Math.cos(townYaw) * t, z = p.z - Math.sin(townYaw) * t; this.statics.push({ mesh: 'dash', pos: [x, p.h - 0.1, z], yaw: Math.PI / 2 + townYaw, boxes: [] }); }
      if (p.name === 'RETAIL ROW' || p.name === 'DIRTY DOCKS') { addStatic('building', [p.x + 30, p.h - 0.1, p.z + 40], pi % 4, shopBoxes); addStatic('dumpster', [p.x + 38, p.h, p.z + 32], pi % 4, [{min:[-1.1,0,-.6],max:[1.1,1.4,.6]}]); }
      if (p.name === 'PLEASANT PARK') { addStatic('fountain', [p.x, p.h, p.z], 0, [{min:[-3,0,-3],max:[3,1,3]}]); for(let a=0;a<6;a++) addStatic('bench',[p.x+Math.cos(a*Math.PI/3)*8,p.h,p.z+Math.sin(a*Math.PI/3)*8],a,[]); }
      if (p.name === 'SWEATY SANDS') for(let i=-2;i<=2;i++) addStatic('fence',[p.x+i*9,p.h,p.z-28],0,[]);
    }
    // vegetation
    for (let k = 0; k < 2200; k++) {
      const x = rand(-SIZE / 2, SIZE / 2), z = rand(-SIZE / 2, SIZE / 2), y = terrainH(x, z);
      if (y < 2.2) continue;
      let ok = true; for (const p of POIS) if (Math.hypot(x - p.x, z - p.z) < p.r * 0.75 && p.name !== 'WEEPING WOODS') ok = false;
      if (!ok) continue;
      const woods = Math.hypot(x + 40, z - 60) < 60, rv = Math.random();
      const type: Prop['type'] = woods ? (rv < 0.7 ? 'pine' : 'tree') : rv < 0.45 ? 'tree' : rv < 0.6 ? 'tree2' : rv < 0.78 ? 'pine' : rv < 0.9 ? 'rock' : 'bush';
      const s = type === 'pine' ? rand(1.1, 1.7) : type === 'rock' ? rand(0.9, 1.6) : type === 'bush' ? rand(1.2, 1.8) : rand(1.3, 1.9);
      this.props.push({ type, pos: [x, y - 0.2, z], yaw: rand(0, 6.28), s, hp: type === 'bush' ? 30 : 250, r: (type === 'rock' ? 1.4 : type === 'bush' ? 0.7 : 0.4) * s, h: (type === 'rock' ? 1.2 : type === 'bush' ? 1 : 6) * s, dead: 0 });
    }
  }
  /** grass tufts in 40 m chunks, generated lazily around the camera */
  grassChunks = new Map<string, Mesh>();
  grassChunk(r: Renderer, cx: number, cz: number): Mesh {
    const key = cx + ',' + cz; let m = this.grassChunks.get(key); if (m) return m;
    const g = new MB(), S = 24, seed = cx * 73856093 ^ cz * 19349663; let rs = (seed >>> 0) || 1;
    const rnd = () => { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; return ((rs >>> 0) % 10000) / 10000; };
    for (let k = 0; k < 2200; k++) {
      const x = cx * S + rnd() * S, z = cz * S + rnd() * S, y = terrainH(x, z);
      if (y < 2.3) continue;
      const hgt = 0.09 + rnd() * 0.13, w = 0.012 + rnd() * 0.012, a = rnd() * 3.14, c: Col = [0.50 + rnd() * 0.08, 0.80 + rnd() * 0.07, 0.30];
      for (const aa of [a, a + 1.57]) { const dx = Math.cos(aa) * w, dz = Math.sin(aa) * w; g.triN([x - dx, y, z - dz], [x + dx, y, z + dz], [x + dx * 0.4, y + hgt, z + dz * 0.4], [0, 1, 0], [0, 1, 0], [0, 1, 0], c); }
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
    for (const s of this.statics) if (s.mesh.startsWith('house') || s.mesh === 'building') { const i = (s.pos[0] + SIZE / 2) / px, j = (s.pos[2] + SIZE / 2) / px; ctx.fillRect(i - 3, j - 2.5, 6, 5); }
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
    for (const q of this.props) if (!q.dead && q.type !== 'bush' && Math.abs(q.pos[0] - x) < rad && Math.abs(q.pos[2] - z) < rad) out.push({ min: [q.pos[0] - q.r, q.pos[1] - 1, q.pos[2] - q.r], max: [q.pos[0] + q.r, q.pos[1] + q.h, q.pos[2] + q.r], ref: q });
    for (const s of this.statics) if (!s.dead && s.boxes.length && Math.abs(s.pos[0] - x) < rad + 14 && Math.abs(s.pos[2] - z) < rad + 14) out.push(...s.boxes);
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
    for (let t = 0; t < maxT; t += 0.6) {
      const p = add(o, scale(d, t)), dh = p[1] - terrainH(p[0], p[2]);
      if (dh < 0) { const tt = t - 0.6 * (-dh / (prev - dh || 1)); consider({ t: tt, p: add(o, scale(d, tt)), n: [0, 1, 0], kind: 'terrain' }); break; }
      prev = dh;
      if (p[1] > 80 && d[1] > 0) break;
    }
    for (const q of this.props) {
      if (q.dead || q.type === 'bush') continue;
      if (Math.abs(q.pos[0] - o[0]) > maxT + 5 || Math.abs(q.pos[2] - o[2]) > maxT + 5) continue;
      const h = World.rayBox(o, d, { min: [q.pos[0] - q.r, q.pos[1], q.pos[2] - q.r], max: [q.pos[0] + q.r, q.pos[1] + q.h, q.pos[2] + q.r] }, maxT);
      if (h) consider({ t: h.t, p: add(o, scale(d, h.t)), n: h.n, kind: 'prop', ref: q });
    }
    for (const s of this.statics) { if (s.dead || !s.boxes.length || Math.abs(s.pos[0] - o[0]) > maxT + 20 || Math.abs(s.pos[2] - o[2]) > maxT + 20) continue; for (const bx of s.boxes) { const h = World.rayBox(o, d, bx, maxT); if (h) consider({ t: h.t, p: add(o, scale(d, h.t)), n: h.n, kind: 'static', ref: s }); } }
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
