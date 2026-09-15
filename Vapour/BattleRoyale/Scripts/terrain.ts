// Engine terrain: the analytic height function becomes a Vapour heightfield, painted with a splat map
// (grass / dirt / rock / sand / asphalt) and meshed by the engine's chunk grid at two LOD steps. Detail
// textures are baked from engine gradient noise so every layer has albedo grain and a normal map.
import { GradientNoise, TerrainChunkGrid, TerrainHeightfield, TerrainMaterial, TerrainSplatMap, type MeshUpload, type TextureUpload } from '@vapour/engine';
import type { V3 } from './math';

export const LAYERS = ['grass', 'dirt', 'rock', 'sand', 'asphalt'] as const;
export const TERRAIN_MATERIAL = new TerrainMaterial({ layers: LAYERS.map(name => ({ name })), baseColorTexture: 't:terrain', normalTexture: 't:terrainN', uvScale: [1, 1], atlasInset: 0.004 });
export const TERRAIN_STYLE = 5;

export interface TerrainChunkOut { fine: MeshUpload; coarse: MeshUpload; c: V3; r: number; }
export interface TerrainBuild { chunks: TerrainChunkOut[]; }

/** Builds a chunked, splat-painted terrain over `size` metres centred on (cx, cz). `cellM` metres per sample. */
export function buildTerrain(cx: number, cz: number, size: number, cellM: number, height: (x: number, z: number) => number, paint: (x: number, z: number, y: number, slope: number) => number, chunkCells: number): TerrainBuild {
  const n = Math.round(size / cellM) + 1;
  const field = TerrainHeightfield.generate(n, n, [size, 1, size], (u, v) => height(cx + (u - 0.5) * size, cz + (v - 0.5) * size), [size / 4, size / 4]);
  const splat = new TerrainSplatMap(n, n, LAYERS.length);
  for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
    const x = cx + (col / (n - 1) - 0.5) * size, z = cz + (row / (n - 1) - 0.5) * size, y = field.heights[row * n + col]!;
    const slope = Math.abs(height(x + 1, z) - height(x - 1, z)) + Math.abs(height(x, z + 1) - height(x, z - 1));
    splat.setWeights(splat.vertexIndex(col, row), LAYERS.map((_, i) => i === paint(x, z, y, slope) ? 1 : 0));
  }
  const grid = new TerrainChunkGrid({ heightfield: field, chunkCells, material: TERRAIN_MATERIAL, splat });
  const chunks: TerrainChunkOut[] = [];
  for (const ch of grid.chunks()) {
    const fine = ch.mesh({ step: 1, skirtDepth: 1.5 }), coarse = ch.mesh({ step: 4, skirtDepth: 4 });
    // shift from heightfield-local (centred on origin) to world space, and mark underwater ground so it is skipped when nothing is above the sea
    for (const m of [fine, coarse]) for (let i = 0; i < m.positions.length; i += 3) { m.positions[i] = m.positions[i]! + cx; m.positions[i + 2] = m.positions[i + 2]! + cz; }
    chunks.push({ fine, coarse, c: [ch.bounds.center[0] + cx, ch.bounds.center[1], ch.bounds.center[2] + cz], r: ch.bounds.radius });
  }
  return { chunks };
}

/** Bakes the layer atlas (one cell per layer) as an sRGB albedo and a tangent-space normal map. */
export function bakeTerrainTextures(cell = 192): { base: TextureUpload; normal: TextureUpload } {
  const cols = LAYERS.length, W = cell * cols, H = cell, base = new Uint8Array(W * H * 4), normal = new Uint8Array(W * H * 4), noise = new GradientNoise('c1-terrain');
  // noise sampled on a torus so every cell tiles seamlessly
  const per = (x: number, y: number, s: number, seed: number) => { const a = x / cell * Math.PI * 2, b = y / cell * Math.PI * 2; return noise.fbm3D(Math.cos(a) * s + seed, Math.sin(a) * s, Math.cos(b) * s + Math.sin(b) * s * 0.5, { octaves: 4, frequency: 1 }); };
  const heightAt = (layer: number, x: number, y: number): number => {
    switch (layer) {
      case 0: return per(x, y, 6, 3) * 0.6 + per(x, y, 14, 9) * 0.4;                                  // grass: fine blades
      case 1: return per(x, y, 3, 21) * 0.7 + per(x, y, 9, 33) * 0.3;                                 // dirt: soft clumps
      case 2: return Math.abs(per(x, y, 2.5, 41)) * 0.8 + per(x, y, 8, 47) * 0.3;                    // rock: ridged
      case 3: return per(x, y, 10, 61) * 0.3;                                                          // sand: fine
      default: { const g = per(x, y, 12, 71) * 0.25; const cy = ((y % 96) < 4) ? -0.15 : 0; return g + cy; }   // asphalt: gritty with a crack line
    }
  };
  const lum = [0.86, 0.82, 0.8, 0.9, 0.78], hm = new Float32Array(cell * cell);
  for (let layer = 0; layer < cols; layer++) {
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) hm[y * cell + x] = heightAt(layer, x, y);
    const at = (x: number, y: number) => hm[((y + cell) % cell) * cell + (x + cell) % cell]!;
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
    const h = at(x, y), i = ((y * W) + layer * cell + x) * 4, v = Math.max(0, Math.min(255, Math.round((lum[layer]! + h * 0.28) * 255)));
    const tintR = layer === 2 ? 0.97 : 1, tintB = layer === 0 ? 0.92 : layer === 3 ? 0.9 : 1;
    base[i] = Math.round(v * tintR); base[i + 1] = v; base[i + 2] = Math.round(v * tintB); base[i + 3] = 255;
    const amp = layer === 2 ? 2.2 : layer === 0 ? 1.2 : 0.8;
    const dx = (at(x + 1, y) - at(x - 1, y)) * amp, dy = (at(x, y + 1) - at(x, y - 1)) * amp;
    const l = Math.hypot(dx, dy, 1);
    normal[i] = Math.round((-dx / l * 0.5 + 0.5) * 255); normal[i + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255); normal[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); normal[i + 3] = 255;
    }
  }
  return { base: { width: W, height: H, pixels: base, colorSpace: 'srgb', mipmaps: true }, normal: { width: W, height: H, pixels: normal, colorSpace: 'linear', mipmaps: true } };
}
