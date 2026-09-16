// Engine physics (Rapier in Rust/WASM): the terrain heightfields, every static collider, trees/rocks and player
// builds live in one physics world, and players/bots move with the engine's kinematic character controller
// (capsule, auto-step, slope limits, ground snap). Gameplay raycasts for damage still use the world's own
// hit kinds; this is the movement/collision backend.
import { createPhysicsWorld3d, type CharacterController3dOptions, type ColliderShape3d, type PhysicsWorld3dBridge } from '@vapour/engine';
import type { V3 } from './math';
import { ISLAND, type Box, type Hit, type Piece, type World } from './world';

export let PH: PhysicsWorld3dBridge | null = null;
const Q0: readonly [number, number, number, number] = [0, 0, 0, 1];
let nextId = 1;
interface Entry { ids: number[]; edit?: number; }
const bodies = new Map<object, Entry>();
const info = new Map<number, { kind: Hit['kind']; ref?: unknown }>();   // body id → what a ray hit means to gameplay
let dirty = false;   // a step is only needed to admit changed colliders into the broad phase

export async function initPhysics(moduleUrl: string) { PH = await createPhysicsWorld3d({ moduleUrl, gravity: [0, -26, 0] }); }

const insert = (position: V3, shape: ColliderShape3d, kind: Hit['kind'] = 'static', ref?: unknown) => { const id = nextId++; dirty = true; PH!.insert({ id, bodyType: 'static', position, rotation: Q0, shape, friction: 0.6 }); info.set(id, { kind, ref }); return id; };
const boxBody = (b: Box, kind: Hit['kind'] = 'static', ref?: unknown) => insert([(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2], { type: 'box', halfExtents: [(b.max[0] - b.min[0]) / 2, (b.max[1] - b.min[1]) / 2, (b.max[2] - b.min[2]) / 2] }, kind, ref);
const remove = (ref: object) => { const e = bodies.get(ref); if (!e) return; for (const id of e.ids) { PH!.remove(id); info.delete(id); } bodies.delete(ref); dirty = true; };

/** Ramps and pyramids are true sloped hulls so walking up them is smooth; walls/floors keep their edit-aware boxes. */
function pieceShape(W: World, p: Piece): { ids: number[] } {
  const [x, y, z] = p.pos;
  if (p.type === 'wall' || p.type === 'floor') return { ids: W.pieceBoxes(p).map(b => boxBody(b, 'piece', p)) };
  if (p.type === 'pyramid') return { ids: [insert([x, y, z], { type: 'convexMesh', points: [[-2, -0.25, -2], [2, -0.25, -2], [2, -0.25, 2], [-2, -0.25, 2], [-2, 0, -2], [2, 0, -2], [2, 0, 2], [-2, 0, 2], [0, 2, 0]] }, 'piece', p)] };
  const a = p.dir * Math.PI / 2, c = Math.cos(a), s = Math.sin(a), pt = (fx: number, fz: number, ly: number): [number, number, number] => [c * fx - s * fz, ly, s * fx + c * fz];   // (fx, fz): across, rise axis (matches slopeH)
  const points = [pt(-2, -2, -0.25), pt(2, -2, -0.25), pt(2, 2, -0.25), pt(-2, 2, -0.25), pt(-2, -2, 0.02), pt(2, -2, 0.02), pt(2, 2, 4), pt(-2, 2, 4)];
  return { ids: [insert([x, y, z], { type: 'convexMesh', points }, 'piece', p)] };
}
const addPiece = (W: World, p: Piece) => { bodies.set(p, { ...pieceShape(W, p), edit: p.edit }); };

/** Rebuilds the physics world from a (re)generated game world. */
export function syncWorld(W: World) {
  if (!PH) return;
  for (const ref of [...bodies.keys()]) remove(ref);
  bodies.set(W, { ids: [insert([0, 0, 0], W.field.collider(), 'terrain'), insert([ISLAND[0], 0, ISLAND[2]], W.islandField.collider(), 'terrain')] });
  for (const st of W.statics) if (st.boxes.length && !st.dead) bodies.set(st, { ids: st.boxes.map(b => boxBody(b, 'static', st)) });
  for (const q of W.props) if (q.type !== 'bush' && !q.dead) bodies.set(q, { ids: [boxBody({ min: [q.pos[0] - q.r, q.pos[1] - 1, q.pos[2] - q.r], max: [q.pos[0] + q.r, q.pos[1] + q.h, q.pos[2] + q.r] }, 'prop', q)] });
  for (const p of W.pieces.values()) addPiece(W, p);
  PH.flush(); PH.step(1 / 60); dirty = false;
}
/** Per frame: mirror destroyed props/statics, placed/removed/edited pieces, then advance the world. */
export function stepPhysics(W: World, dt: number) {
  if (!PH) return;
  for (const p of W.pieces.values()) { const e = bodies.get(p); if (!e) addPiece(W, p); else if (e.edit !== p.edit) { remove(p); addPiece(W, p); } }
  for (const [ref, e] of bodies) { if (ref === W) continue; const r = ref as { dead?: boolean; key?: string }; if (r.dead || (e.edit !== undefined && !W.pieces.has(r.key!))) remove(ref); }
  if (dirty || hitboxes.size) { PH.flush(); PH.step(Math.max(1 / 240, Math.min(dt, 1 / 20))); dirty = false; }
}

/** Bot hitboxes are kinematic sensor bodies (body + head) that follow their bot each frame, so shots are one engine ray. */
const hitboxes = new Map<object, [number, number]>();
export function syncHitboxes(bots: readonly { pos: V3; dead: boolean }[]) {
  if (!PH) return;
  for (const b of bots) {
    let ids = hitboxes.get(b);
    if (b.dead) { if (ids) { for (const id of ids) { PH.remove(id); info.delete(id); } hitboxes.delete(b); } continue; }
    if (!ids) {
      ids = [nextId++, nextId++]; hitboxes.set(b, ids);
      PH.insert({ id: ids[0], bodyType: 'kinematicPosition', position: [b.pos[0], b.pos[1] + 0.775, b.pos[2]], rotation: Q0, shape: { type: 'box', halfExtents: [0.35, 0.775, 0.25] }, sensor: true });
      PH.insert({ id: ids[1], bodyType: 'kinematicPosition', position: [b.pos[0], b.pos[1] + 1.8, b.pos[2]], rotation: Q0, shape: { type: 'box', halfExtents: [0.25, 0.25, 0.25] }, sensor: true });
      info.set(ids[0], { kind: 'box', ref: { d: b, head: false } }); info.set(ids[1], { kind: 'box', ref: { d: b, head: true } });
    }
    PH.setKinematicTarget(ids[0], [b.pos[0], b.pos[1] + 0.775, b.pos[2]], Q0); PH.setKinematicTarget(ids[1], [b.pos[0], b.pos[1] + 1.8, b.pos[2]], Q0);
  }
  for (const [b, ids] of hitboxes) if (!bots.includes(b as { pos: V3; dead: boolean })) { for (const id of ids) { PH.remove(id); info.delete(id); } hitboxes.delete(b); }
}
/** Gameplay hit-scan through the engine physics world; `withBots` includes the bot hitbox sensors. */
export function physicsRay(o: V3, d: V3, maxT: number, withBots: boolean): Hit | null {
  if (!PH) return null;
  const h = PH.raycast(o, d, maxT, { includeSensors: withBots });
  if (!h) return null;
  const i = info.get(h.bodyId);
  if (!i) return null;
  return { t: h.distance, p: [h.point[0], h.point[1], h.point[2]], n: [h.normal[0], h.normal[1], h.normal[2]], kind: i.kind, ref: i.ref };
}

const ctrl = (h: number): CharacterController3dOptions => ({ shape: { type: 'capsule', halfHeight: Math.max(0.05, h / 2 - 0.35), radius: 0.35 }, offset: 0.02, slide: true, autostepMaxHeight: 0.72, autostepMinWidth: 0.2, autostepDynamicBodies: false, maxSlopeClimbDegrees: 58, minSlopeSlideDegrees: 62, snapToGround: 0.3 });
/** Moves a capsule of height `h` by `vel*dt`; returns true when it just landed. Blocked velocity components are zeroed. */
export function moveCapsule(e: { pos: V3; vel: V3; grounded: boolean }, h: number, dt: number): boolean {
  const desired: V3 = [e.vel[0] * dt, e.vel[1] * dt, e.vel[2] * dt];
  if (e.grounded && e.vel[1] <= 0 && (desired[0] !== 0 || desired[2] !== 0)) {   // run along slopes/ramps at full speed: project the horizontal wish onto the ground plane
    const g = PH!.raycast([e.pos[0], e.pos[1] + 0.4, e.pos[2]], [0, -1, 0], 1.0);
    if (g && g.normal[1] > 0.5 && g.normal[1] < 0.985) { const n = g.normal, d = desired[0] * n[0] + desired[2] * n[2], L = Math.hypot(desired[0], desired[2]); const px = desired[0] - n[0] * d, py = -n[1] * d, pz = desired[2] - n[2] * d, pl = Math.hypot(px, py, pz) || 1; desired[0] = px / pl * L; desired[1] += py / pl * L; desired[2] = pz / pl * L; }
  }
  const m = PH!.moveCharacter(dt, [e.pos[0], e.pos[1] + h / 2, e.pos[2]], Q0, desired, ctrl(h));
  const was = e.grounded;
  e.pos[0] += m.translation[0]; e.pos[1] += m.translation[1]; e.pos[2] += m.translation[2];
  for (let ax = 0; ax < 3; ax++) if (Math.abs(m.translation[ax]! - desired[ax]!) > 1e-3 && Math.sign(m.translation[ax]!) !== Math.sign(desired[ax]!) || (ax === 1 && m.grounded && e.vel[1] < 0)) e.vel[ax] = 0;
  if (Math.abs(m.translation[1] - desired[1]) > 1e-3 && desired[1] > 0) e.vel[1] = 0;   // ceiling
  e.grounded = m.grounded;
  return m.grounded && !was && desired[1] <= 0;
}
