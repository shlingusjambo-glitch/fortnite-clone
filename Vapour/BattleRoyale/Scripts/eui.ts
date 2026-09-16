// Engine UI: every menu and HUD element is a Vapour UiDocument laid out by the engine, composed into sprite/text
// batches (composeUi2D + SpriteBatch2D + SDF font atlas) and drawn on the engine's screen-space overlay layer.
// The API is immediate-mode: game code describes the tree every frame; clicks resolve against the previous
// frame's layout, so a button is one line of gameplay code.
import { SpriteBatch2D, UiDocument, composeUi2D, importBrowserFont, layoutText2D, type FontAtlas, type GameContext, type SpriteAsset, type UiNodeDefinition, type UiNodeVisual, type UiRect, type UiStyle } from '@vapour/engine';

export type RGBA = readonly [number, number, number, number];
export const C = { panel: [0.04, 0.09, 0.22, 0.92] as RGBA, panel2: [0.08, 0.16, 0.34, 0.95] as RGBA, yellow: [1, 0.87, 0.18, 1] as RGBA, yellowHi: [1, 0.95, 0.55, 1] as RGBA, white: [1, 1, 1, 1] as RGBA, dim: [0.75, 0.82, 0.95, 1] as RGBA, navy: [0.07, 0.19, 0.35, 1] as RGBA, green: [0.45, 0.9, 0.3, 1] as RGBA, blue: [0.35, 0.7, 1, 1] as RGBA, red: [1, 0.35, 0.3, 1] as RGBA, black: [0, 0, 0, 0.55] as RGBA, clear: [0, 0, 0, 0] as RGBA, cyan: [0.37, 0.93, 0.95, 1] as RGBA };
const PPU = 100, IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), CAM = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 8, 1]);

let font: FontAtlas | null = null, game: GameContext | null = null;
export const FLAT: SpriteAsset = { id: 'ui:flat', material: 'm:ui', textureSize: [1, 1], rect: [0, 0, 1, 1], pixelsPerUnit: PPU };
const mouse = { x: -1, y: -1, down: false, justDown: false, justUp: false, wheel: 0 };
let hoverId: string | undefined, pressId: string | undefined, prevDoc: UiDocument | null = null;
const clickedIds = new Set<string>(); let keysTyped: string[] = [];

export async function initEui(g: GameContext) {
  game = g;
  g.uploadTexture('t:ui', { width: 1, height: 1, pixels: Uint8Array.from([255, 255, 255, 255]), colorSpace: 'srgb' });
  g.defineMaterial('m:ui', { textures: { baseColor: 't:ui' }, alphaMode: 'blend', depthWrite: false, doubleSided: true });
  let chars = ''; for (let c = 32; c < 127; c++) chars += String.fromCharCode(c); chars += '·—…✔';
  const f = await importBrowserFont({ id: 'font:ui', material: 'm:font', family: 'Impact', weight: 400, characters: chars, designSize: 48, atlasWidth: 2048, sdfRadius: 6, fallbackCharacter: '?' });
  font = f.font; g.uploadTexture(f.textureId, f.texture); g.defineMaterial(font.material, f.material);
  const el = g.canvas;
  const at = (e: PointerEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
  el.addEventListener('pointermove', at); el.addEventListener('pointerdown', e => { at(e); if (e.button === 0) { mouse.down = true; mouse.justDown = true; } });
  addEventListener('pointerup', e => { if (e.button === 0) { mouse.down = false; mouse.justUp = true; } });
  addEventListener('wheel', e => { mouse.wheel += e.deltaY; }, { passive: true });
  addEventListener('keydown', e => { if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter') keysTyped.push(e.key); });
}
export const uiReady = () => !!font;
export const uiMouse = () => mouse;
/** Keys typed since the last frame (single characters, 'Backspace', 'Enter'); consumed by text fields. */
export const takeTyped = () => { const k = keysTyped; keysTyped = []; return k; };

// ---- immediate-mode tree ----
let visuals: Record<string, UiNodeVisual> = {}; let post: ((doc: UiDocument, sprites: SpriteBatch2D) => void)[] = []; let nodeIds: string[] = [];
const uniq = (id: string) => { nodeIds.push(id); return id; };
export const textW = (t: string, size: number) => font ? layoutText2D(font, t, { fontSize: size / PPU }).width * PPU : t.length * size * 0.5;
export function box(id: string, style: UiStyle, children: UiNodeDefinition[] = [], bg?: RGBA): UiNodeDefinition { if (bg) visuals[id] = { background: FLAT, backgroundColor: bg }; return { id: uniq(id), role: 'panel', style, children }; }
export function label(id: string, text: string, size = 18, color: RGBA = C.white, style: UiStyle = {}, align: 'left' | 'center' | 'right' = 'left', bg?: RGBA): UiNodeDefinition {
  const w = style.width ?? Math.ceil(textW(text, size)) + 2, h = style.height ?? Math.ceil(size * 1.15);
  visuals[id] = { text, font: font!, fontSize: size, textColor: color, textAlign: align, ...(bg ? { background: FLAT, backgroundColor: bg } : {}) };
  return { id: uniq(id), role: 'text', intrinsicSize: [typeof w === 'number' ? w : 10, typeof h === 'number' ? h : 10], style: { width: w, height: h, ...style } };
}
/** A yellow Fortnite-style button; `clicked(id)` reports the press. */
export function button(id: string, text: string, style: UiStyle = {}, opts: { bg?: RGBA; fg?: RGBA; size?: number; on?: boolean } = {}): UiNodeDefinition {
  const size = opts.size ?? 20, w = style.width ?? Math.ceil(textW(text, size)) + 34, h = style.height ?? Math.ceil(size * 1.9);
  const hot = hoverId === id, base = opts.on ? C.yellow : opts.bg ?? C.yellow, bg: RGBA = hot ? [Math.min(1, base[0] * 1.15 + 0.05), Math.min(1, base[1] * 1.15 + 0.05), Math.min(1, base[2] * 1.15 + 0.05), base[3]] : base;
  visuals[id] = { background: FLAT, backgroundColor: bg }; visuals[id + '.t'] = { text, font: font!, fontSize: size, textColor: opts.fg ?? (opts.on || !opts.bg ? C.navy : C.white), textAlign: 'center' };
  return { id: uniq(id), role: 'button', style: { width: w, height: h, align: 'center', justify: 'center', ...style }, children: [{ id: uniq(id + '.t'), role: 'text', intrinsicSize: [typeof w === 'number' ? w - 4 : 10, size * 1.15], style: { width: 'fill', height: size * 1.15 } }] };
}
export function image(id: string, sprite: SpriteAsset, w: number, h: number, style: UiStyle = {}, tint: RGBA = C.white): UiNodeDefinition { visuals[id] = { background: sprite, backgroundColor: tint }; return { id: uniq(id), role: 'image', intrinsicSize: [w, h], style: { width: w, height: h, ...style } }; }
export const gap = (id: string, w: number, h: number): UiNodeDefinition => ({ id: uniq(id), role: 'panel', style: { width: w, height: h } });
export const clicked = (id: string) => clickedIds.has(id);
export const hovered = (id: string) => hoverId === id;
/** Drawn after layout with the node's rectangle (bars, highlights, custom fills). */
export const after = (fn: (doc: UiDocument, sprites: SpriteBatch2D) => void) => { post.push(fn); };
export function fill(sprites: SpriteBatch2D, r: UiRect, color: RGBA, layer = 50, sprite: SpriteAsset = FLAT) {
  if (r.width <= 0 || r.height <= 0) return;
  sprites.add({ sprite, position: [(r.x + r.width / 2 - W / 2) / PPU, (H / 2 - r.y - r.height / 2) / PPU], size: [r.width / PPU, r.height / PPU], color, sortingLayer: layer });
}
/** A slider the pointer can drag; returns the (possibly updated) value. */
export function slider(id: string, value: number, min: number, max: number, step: number, w = 220): { def: UiNodeDefinition; value: number } {
  let v = value;
  if (pressId === id && prevDoc) { const r = prevDoc.rect(id); if (r.width > 0) { v = min + Math.max(0, Math.min(1, (mouse.x - r.x) / r.width)) * (max - min); v = Math.round(v / step) * step; } }
  visuals[id] = { background: FLAT, backgroundColor: [0.1, 0.2, 0.4, 1] };
  const frac = (v - min) / (max - min);
  after((doc, s) => { const r = doc.rect(id); fill(s, { x: r.x, y: r.y + r.height / 2 - 3, width: r.width, height: 6 }, [0.2, 0.35, 0.6, 1], 51); fill(s, { x: r.x, y: r.y + r.height / 2 - 3, width: r.width * frac, height: 6 }, C.cyan, 52); fill(s, { x: r.x + r.width * frac - 7, y: r.y + r.height / 2 - 9, width: 14, height: 18 }, C.yellow, 53); });
  return { def: { id: uniq(id), role: 'slider', style: { width: w, height: 24 }, value: v, minimum: min, maximum: max, step }, value: v };
}
export function toggle(id: string, on: boolean): { def: UiNodeDefinition; value: boolean } {
  const v = clickedIds.has(id) ? !on : on;
  visuals[id] = { background: FLAT, backgroundColor: v ? C.cyan : [0.2, 0.3, 0.5, 1] };
  after((doc, s) => { const r = doc.rect(id); fill(s, { x: v ? r.x + r.width - 22 : r.x + 2, y: r.y + 2, width: 20, height: r.height - 4 }, C.white, 52); });
  return { def: { id: uniq(id), role: 'toggle', style: { width: 46, height: 24 }, value: v }, value: v };
}
/** Single-line text entry; call every frame with the current value and store what comes back. */
export function textField(id: string, value: string, placeholder: string, maxLen: number, focused: boolean, w = 160): { def: UiNodeDefinition; value: string; focused: boolean } {
  let v = value, f = focused;
  if (mouse.justDown && prevDoc) f = prevDoc.hitTest(mouse.x, mouse.y) === id;
  if (f) for (const k of takeTyped()) { if (k === 'Backspace') v = v.slice(0, -1); else if (k.length === 1 && v.length < maxLen) v += k; }
  visuals[id] = { background: FLAT, backgroundColor: f ? [0.12, 0.25, 0.5, 1] : [0.08, 0.16, 0.34, 1], text: v || placeholder, font: font!, fontSize: 20, textColor: v ? C.white : [0.5, 0.6, 0.8, 1], textPadding: 8 };
  return { def: { id: uniq(id), role: 'button', style: { width: w, height: 38 } }, value: v, focused: f };
}

let W = 1, H = 1; const meshIds = new Set<string>();
export const UI_PROF = { doc: 0, compose: 0, upload: 0, n: 0, verts: 0, batches: 0, nodes: 0 };
/** Lays out and draws the frame's tree. Returns the document for hit queries. */
export function render(roots: UiNodeDefinition[], layer = 0): UiDocument | null {
  const g = game; if (!g || !font) { visuals = {}; post = []; nodeIds = []; return null; }
  W = g.width; H = g.height;
  const p0 = performance.now();
  const doc = new UiDocument({ id: 'root', role: 'panel', style: { width: W, height: H, padding: 0 }, children: roots });
  doc.layout(W, H);
  const p1 = performance.now(); UI_PROF.doc += p1 - p0;
  const sprites = new SpriteBatch2D('ui:dyn' + layer); for (const fn of post) fn(doc, sprites);
  const batches = [...composeUi2D(doc, visuals, [W, H], PPU, 'ui' + layer), ...sprites.build().map((b, i) => ({ id: `ui${layer}:dyn${i}`, material: b.material, mesh: b.mesh }))];
  const p2 = performance.now(); UI_PROF.compose += p2 - p1; UI_PROF.verts = batches.reduce((a, b) => a + b.mesh.positions.length / 3, 0); UI_PROF.batches = batches.length; UI_PROF.nodes = doc.nodes().length;
  if (layer === 0) { g.overlay.setOrthographicCamera(CAM, H / PPU, 0.1, 100); g.overlay.lights.addAmbient([1, 1, 1], 2); }
  for (const b of batches) { g.uploadMesh(b.id, b.mesh); meshIds.add(b.id); g.overlay.draw(b.id, IDENT, { material: b.material, roughness: 1 }); }
  UI_PROF.upload += performance.now() - p2; UI_PROF.n++;
  // pointer resolution for next frame
  const hit = doc.hitTest(mouse.x, mouse.y);
  clickedIds.clear();
  if (mouse.justDown) pressId = hit;
  if (mouse.justUp) { if (pressId && hit === pressId) clickedIds.add(pressId); pressId = undefined; }
  hoverId = hit; prevDoc = doc;
  mouse.justDown = mouse.justUp = false; mouse.wheel = 0;
  visuals = {}; post = []; nodeIds = [];
  return doc;
}
/** True when the pointer is over any UI node this frame (so gameplay ignores the click). */
export const uiHot = () => !!hoverId && hoverId !== 'root';
export const uiPressed = () => pressId;
