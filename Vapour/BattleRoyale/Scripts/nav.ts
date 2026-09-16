// Engine navigation for the bots: the terrain chunks plus every static collider are baked into a Vapour NavMesh
// (slope rejection, agent radius erosion), player-built pieces become runtime obstacles, and bots follow
// smoothed A* corridors instead of walking straight at their target and probing for walls.
import { bakeNavMesh, navMeshLineOfSight, smoothPath, type NavMesh } from '@vapour/engine';
import type { V3 } from './math';
import type { Box, World } from './world';

export let NAV: NavMesh | null = null;
const WATER_AREA = { id: 2, name: 'water', cost: 3 };

function pushBox(pos: number[], idx: number[], b: Box) {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, base = pos.length / 3;
  pos.push(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1);
  for (const f of [[4, 5, 6, 7], [0, 3, 2, 1], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]]) idx.push(base + f[0]!, base + f[1]!, base + f[2]!, base + f[0]!, base + f[2]!, base + f[3]!);
}

/** Bakes the match navmesh from the world's terrain and static colliders. Runs once per world (about a second). */
export function bakeWorldNav(W: World): NavMesh {
  const pos: number[] = [], idx: number[] = [];
  for (const tc of W.terrainChunks) { const m = tc.mesh.raw!, base = pos.length / 3; for (let i = 0; i < m.positions.length; i++) pos.push(m.positions[i]!); for (let i = 0; i < m.indices.length; i++) idx.push(base + m.indices[i]!); }
  for (const s of W.statics) for (const b of s.boxes) pushBox(pos, idx, b);   // static colliders are stored in world space
  for (const p of W.props) if (p.type !== 'bush') pushBox(pos, idx, { min: [p.pos[0] - p.r, p.pos[1], p.pos[2] - p.r], max: [p.pos[0] + p.r, p.pos[1] + p.h, p.pos[2] + p.r] });
  const areas = new Uint8Array(idx.length / 3);
  for (let t = 0; t < areas.length; t++) { const y = (pos[idx[t * 3]! * 3 + 1]! + pos[idx[t * 3 + 1]! * 3 + 1]! + pos[idx[t * 3 + 2]! * 3 + 1]!) / 3; areas[t] = y < -0.6 ? WATER_AREA.id : 1; }
  const t0 = performance.now();
  NAV = bakeNavMesh({ positions: new Float32Array(pos), indices: new Uint32Array(idx), areas }, { cellSize: 1.5, cellHeight: 0.5, agentRadius: 0.55, agentHeight: 2, agentMaxClimb: 0.7, maxSlopeDegrees: 42 }, [WATER_AREA]);
  console.info(`navmesh: ${NAV.spanCount} spans in ${(performance.now() - t0).toFixed(0)} ms`);
  return NAV;
}
/** Player/bot builds block routes while they stand; pieces are ~4 m, so one obstacle per piece. */
export const navBlock = (key: string, pos: V3, on: boolean) => { if (!NAV) return; if (on) NAV.setObstacle({ id: key, position: pos, radius: 2.1, height: 4 }); else NAV.removeObstacle(key); };

let budget = 0;
export const navFrame = () => { budget = 2; };   // path queries per frame, so 32 bots repathing at once cannot hitch
/** Smoothed corridor from `from` to `to`, or null when there is no navmesh, no budget left, or no route. */
export function navPath(from: V3, to: V3): V3[] | null {
  if (!NAV || budget <= 0) return null; budget--;
  const r = NAV.findPath(from, to, { maxVisited: 6000 });
  if (r.status !== 'complete' || r.points.length < 2) return null;
  return smoothPath(r.points, (a, b) => navMeshLineOfSight(NAV!, a, b)).map(p => [p[0], p[1], p[2]] as V3);
}
