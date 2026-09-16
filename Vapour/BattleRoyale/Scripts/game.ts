import { V3, M4, add, sub, scale, norm, len, clamp, lerp, rand, mul, perspective, lookAt, trs, translate, rotY, rotX, rotZ, transformPoint, scaleM } from './math';
import { Renderer, Mesh } from './renderer';
import { buildModels, buildCharacter, editedPiece, CharMesh, SKINS, Skin, BIND } from './models';
import { World, terrainH, Piece, PieceType, Mat, Box, Prop, POIS, SIZE, TILES, ISLAND } from './world';
import { NET, Member } from './net';
import { setSeed } from './math';
import { IN, REBINDABLE, bindLabel, rebind } from './input';

// ---------------- setup ----------------
export const canvas = document.getElementById('vapour-game') as HTMLCanvasElement;
const R = new Renderer(canvas), M = buildModels(R); let W = new World(R); let matchSeed = 1;
const MAT_STYLE: Record<Mat, number> = { wood: 2, stone: 3, metal: 4 };
const editCache = new Map<string, ReturnType<typeof editedPiece>>();
const editedMesh = (type: 'wall' | 'floor', mat: Mat, mask: number) => { const k = `${type}_${mat}_${mask}`; let m = editCache.get(k); if (!m) { m = editedPiece(R, type, mat, mask); editCache.set(k, m); } return m; };
const CHARS: CharMesh[] = SKINS.map(s => buildCharacter(R, s));
const LOBBY_CHAR = buildCharacter(R, SKINS[0]!, 1.35);
const $ = (id: string) => document.getElementById(id)!;
const H = { fade: $('fade'), lobby: $('lobby'), hud: $('hud'), hp: $('hp'), sh: $('sh'), mats: $('mats'), bld: $('bld'), ammo: $('ammo'), wname: $('wname'), hotbar: $('hotbar'), info: $('info'), fx: $('fx'), cross: $('cross'), weak: $('weak'), hitm: $('hitm'), prog: $('prog'), flash: $('flash'), scope: $('scope'), pause: $('pause'), comp: $('comp'), fps: $('fps'), mm: $('mm'), stats: $('stats'), feed: $('feed'), banner: $('banner'), elim: $('elim'), bigmap: $('bigmap'), pl: $('pl'), end: $('end'), dbg: $('dbg'), tgt: $('tgt') };
const mapCv = document.createElement('canvas'); mapCv.width = mapCv.height = 600;
function drawMaps() { W.drawMap(mapCv); const big = H.bigmap.querySelector('canvas') as HTMLCanvasElement; big.getContext('2d')!.drawImage(mapCv, 0, 0); W.drawLabels(big); }
drawMaps();
// lobby crystal background
{ const svg = $('lobbybg'); let s = ''; const pts: [number, number][] = []; for (let i = 0; i < 60; i++) pts.push([rand(-10, 110), rand(-10, 70)]); for (let i = 0; i < 60; i++) { const a = pts[i], b = pts[(i * 7 + 3) % 60], c = pts[(i * 13 + 5) % 60]; const l = 35 + rand(0, 35); s += `<polygon points="${a![0]},${a![1]} ${b![0]},${b![1]} ${c![0]},${c![1]}" fill="hsl(${198 + rand(-6, 6)},${60 + rand(0, 20)}%,${l}%)" opacity="0.7"/>`; } svg.innerHTML = `<rect width="100" height="60" fill="#3b8fc4"/>` + s + `<ellipse cx="50" cy="52" rx="40" ry="10" fill="#e8f6ff" opacity="0.55"/>`; }

// ---------------- baked static clutter ----------------
// Small indestructible street/yard props (hedges, fences, dashes, crates, benches...) are merged per 48m cell into one
// mesh each: ~600 draw calls become ~40. Cars, houses and lamps stay individual (they can be harvested / shake).
const BAKE = new Set(['dash', 'hedge', 'fence', 'mailbox', 'bench', 'crate', 'dumpster', 'fountain', 'bridge', 'curb', 'sign', 'bush', 'rock', 'pole', 'flowers']);
const baked: { mesh: Mesh; c: V3 }[] = [];
function bakeStatics() {
  baked.length = 0;
  const cells = new Map<string, { data: number[]; c: V3 }>();
  for (const s of W.statics) {
    if (!BAKE.has(s.mesh) || !M[s.mesh]?.data) continue;
    const key = Math.floor(s.pos[0] / 48) + ',' + Math.floor(s.pos[2] / 48);
    let cell = cells.get(key); if (!cell) { cell = { data: [], c: [(Math.floor(s.pos[0] / 48) + 0.5) * 48, 0, (Math.floor(s.pos[2] / 48) + 0.5) * 48] }; cells.set(key, cell); }
    const src = M[s.mesh]!.data!, m = trs(s.pos, s.yaw), c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
    for (let i = 0; i < src.length; i += 9) {
      const p = transformPoint(m, [src[i]!, src[i + 1]!, src[i + 2]!]), nx = src[i + 3]!, nz = src[i + 5]!;
      cell.data.push(p[0], p[1], p[2], nx * c + nz * sn, src[i + 4]!, -nx * sn + nz * c, src[i + 6]!, src[i + 7]!, src[i + 8]!);
    }
    s.baked = true;
  }
  for (const cell of cells.values()) baked.push({ mesh: R.upload(new Float32Array(cell.data)), c: cell.c });
}
bakeStatics();
/** Regenerates the whole map from a seed so every party member plays the identical world. */
function rebuildWorld(seed: number) {
  if (seed === matchSeed) return; matchSeed = seed; setSeed(seed);
  W = new World(R); bakeStatics(); propCells.clear(); drawMaps(); hookWorld();
}
function hookWorld() { W.onRemove = p => { if (matchLive && NET.active() && NET.isHost()) NET.send({ t: 'piece', op: 'del', key: p.key }); }; }
hookWorld();
// trees/rocks/bushes baked per 48m cell too; a cell is rebuilt when one of its props is felled or regrows
const PC = 48, propCells = new Map<string, { mesh: Mesh; c: V3 } | null>();
const propKey = (q: Prop) => Math.floor(q.pos[0] / PC) + ',' + Math.floor(q.pos[2] / PC);
const dirtyProp = (q: Prop) => propCells.delete(propKey(q));
function propCell(key: string) {
  let cell = propCells.get(key); if (cell !== undefined) return cell;
  const data: number[] = []; let cx = 0, cz = 0;
  for (const q of W.props) { if (q.dead || propKey(q) !== key) continue; const src = M[q.type].data!, m = trs(q.pos, q.yaw, 0, q.s), c = Math.cos(q.yaw), sn = Math.sin(q.yaw); cx = (Math.floor(q.pos[0] / PC) + 0.5) * PC; cz = (Math.floor(q.pos[2] / PC) + 0.5) * PC;
    for (let i = 0; i < src.length; i += 9) { const p = transformPoint(m, [src[i]!, src[i + 1]!, src[i + 2]!]), nx = src[i + 3]!, nz = src[i + 5]!; data.push(p[0], p[1], p[2], nx * c + nz * sn, src[i + 4]!, -nx * sn + nz * c, src[i + 6]!, src[i + 7]!, src[i + 8]!); } }
  cell = data.length ? { mesh: R.upload(new Float32Array(data)), c: [cx, 0, cz] } : null; propCells.set(key, cell); return cell;
}

// ---------------- audio ----------------
import { beep, unlockAudio, setVolumes, voiceAt, setListener } from './audio';
const BOT_VOICES = ['smak-mouth.mp3','ninjalaughing.mp3','ninja-your-trash-kid.mp3','ninja_zkaek6l.mp3','ninja-why-you-getting-so-mad.mp3'];
function botVoice(b: Bot) { if (b.voiceCd > 0 || len(sub(b.pos, P.pos)) > 55) return; b.voiceCd = rand(12, 25); voiceAt(BOT_VOICES[Math.floor(rand(0, BOT_VOICES.length))]!, b.pos, 0.6); }

// ---------------- items & weapons ----------------
type Kind = 'ar' | 'burst' | 'smg' | 'shotgun' | 'sniper' | 'pistol' | 'tac' | 'hunting' | 'scar' | 'rpg' | 'revolver' | 'silenced' | 'shieldPot' | 'miniShield' | 'chug' | 'grenade' | 'boogie' | 'impulse' | 'launchpad' | 'bushItem' | 'medkit' | 'bandage' | 'fish' | 'rod' | 'ammo';
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const RAR_MULT = [0.85, 0.93, 1, 1.08, 1.16];
type Ammo = 'light' | 'medium' | 'heavy' | 'shells';
interface WeaponDef { name: string; dmg: number; rpm: number; mag: number; reload: number; spread: number; pellets: number; ammo: Ammo; auto: boolean; hs: number; range: number; rarity: string; burst?: number; bloom: number; kick: number; }
const WEAPONS: Record<string, WeaponDef> = {
  ar: { name: 'Assault Rifle', dmg: 33, rpm: 330, mag: 30, reload: 2.3, spread: 0.008, pellets: 1, ammo: 'medium', auto: true, hs: 1.5, range: 300, rarity: 'rare', bloom: 0.012, kick: 0.012 },
  burst: { name: 'Burst Assault Rifle', dmg: 33, rpm: 900, mag: 30, reload: 2.6, spread: 0.006, pellets: 1, ammo: 'medium', auto: true, hs: 1.5, range: 300, rarity: 'uncommon', burst: 3, bloom: 0.006, kick: 0.01 },
  smg: { name: 'Submachine Gun', dmg: 18, rpm: 720, mag: 30, reload: 2, spread: 0.02, pellets: 1, ammo: 'light', auto: true, hs: 1.5, range: 150, rarity: 'uncommon', bloom: 0.02, kick: 0.006 },
  shotgun: { name: 'Pump Shotgun', dmg: 11, rpm: 62, mag: 5, reload: 3.5, spread: 0.055, pellets: 10, ammo: 'shells', auto: false, hs: 1.5, range: 40, rarity: 'rare', bloom: 0, kick: 0.035 },
  pistol: { name: 'Pistol', dmg: 24, rpm: 400, mag: 16, reload: 1.5, spread: 0.012, pellets: 1, ammo: 'light', auto: false, hs: 2, range: 120, rarity: 'common', bloom: 0.01, kick: 0.01 },
  tac: { name: 'Tactical Shotgun', dmg: 7, rpm: 90, mag: 8, reload: 4.5, spread: 0.07, pellets: 10, ammo: 'shells', auto: false, hs: 1.5, range: 35, rarity: 'uncommon', bloom: 0, kick: 0.03 },
  hunting: { name: 'Hunting Rifle', dmg: 86, rpm: 40, mag: 1, reload: 1.9, spread: 0.002, pellets: 1, ammo: 'heavy', auto: false, hs: 2.5, range: 500, rarity: 'uncommon', bloom: 0, kick: 0.045 },
  scar: { name: 'SCAR', dmg: 36, rpm: 330, mag: 30, reload: 2.1, spread: 0.006, pellets: 1, ammo: 'medium', auto: true, hs: 1.5, range: 320, rarity: 'legendary', bloom: 0.01, kick: 0.011 },
  revolver: { name: 'Revolver', dmg: 54, rpm: 55, mag: 6, reload: 2.4, spread: 0.008, pellets: 1, ammo: 'medium', auto: false, hs: 2, range: 150, rarity: 'uncommon', bloom: 0.012, kick: 0.03 },
  silenced: { name: 'Suppressed Pistol', dmg: 26, rpm: 380, mag: 16, reload: 1.4, spread: 0.01, pellets: 1, ammo: 'light', auto: false, hs: 2, range: 130, rarity: 'epic', bloom: 0.008, kick: 0.008 },
  rpg: { name: 'Rocket Launcher', dmg: 110, rpm: 45, mag: 1, reload: 3.2, spread: 0, pellets: 1, ammo: 'heavy', auto: false, hs: 1, range: 200, rarity: 'epic', bloom: 0, kick: 0.06 },
  sniper: { name: 'Bolt-Action Sniper Rifle', dmg: 105, rpm: 34, mag: 1, reload: 2.8, spread: 0, pellets: 1, ammo: 'heavy', auto: false, hs: 2.5, range: 600, rarity: 'epic', bloom: 0, kick: 0.05 },
};
const CONS: Record<string, { name: string; dur: number; rarity: string; use: () => boolean }> = {
  shieldPot: { name: 'Shield Potion', dur: 5, rarity: 'rare', use: () => P.shield < 100 && ((P.shield = Math.min(100, P.shield + 50)), true) },
  miniShield: { name: 'Small Shield Potion', dur: 2, rarity: 'uncommon', use: () => P.shield < 50 && ((P.shield = Math.min(50, P.shield + 25)), true) },
  chug: { name: 'Chug Jug', dur: 15, rarity: 'legendary', use: () => (P.hp < 100 || P.shield < 100) && ((P.hp = 100), (P.shield = 100), true) },
  grenade: { name: 'Grenade', dur: 0, rarity: 'uncommon', use: () => false },
  bushItem: { name: 'Bush', dur: 1, rarity: 'legendary', use: () => { P.bush = true; return true; } },
  launchpad: { name: 'Launch Pad', dur: 0, rarity: 'epic', use: () => false },
  boogie: { name: 'Boogie Bomb', dur: 0, rarity: 'rare', use: () => false },
  impulse: { name: 'Impulse Grenade', dur: 0, rarity: 'rare', use: () => false },
  medkit: { name: 'Med Kit', dur: 10, rarity: 'uncommon', use: () => P.hp < 100 && ((P.hp = 100), true) },
  bandage: { name: 'Bandages', dur: 4, rarity: 'common', use: () => P.hp < 75 && ((P.hp = Math.min(75, P.hp + 15)), true) },
  fish: { name: 'Flopper', dur: 1, rarity: 'epic', use: () => P.hp < 100 && ((P.hp = Math.min(100, P.hp + 40)), true) },
  rod: { name: 'Fishing Rod', dur: 2.5, rarity: 'uncommon', use: () => false },
  ammo: { name: 'Ammo Box', dur: 0, rarity: 'common', use: () => false },
};
interface Item { kind: Kind; mag: number; count: number; rar: number; }
const isWeapon = (k: Kind) => k in WEAPONS;
const mkItem = (kind: Kind, count = 1, rar = -1): Item => ({ kind, mag: isWeapon(kind) ? WEAPONS[kind]!.mag : 0, count, rar: rar >= 0 ? rar : isWeapon(kind) ? Math.min(4, Math.floor(Math.pow(Math.random(), 1.6) * 5)) : RARITIES.indexOf(CONS[kind]!.rarity) });
interface GroundItem { item: Item; pos: V3; id: number; }
let nextItemId = 1, matchLive = false;
type BotMode = 'loot' | 'rotate' | 'hunt' | 'fight' | 'box' | 'crank' | 'heal' | 'rush';
interface Crank { c: V3; L: number; d: number; t: number; steps: number; }
interface Bot { name: string; pos: V3; vel: V3; yaw: number; pitch: number; hp: number; shield: number; skin: number; state: 'island' | 'bus' | 'sky' | 'glide' | 'ground'; dead: boolean; joinT: number; joinedFeed?: boolean; anim: number; weapon: Kind | null; weapons: Kind[]; heals: number; mats: number; target: V3 | null; retarget: number; fireCd: number; buildCd: number; lastHit: number; grounded: boolean; dropT: number; land: V3; enemy: Bot | 'player' | null; strafe: number; mode: BotMode; profile: string; skill: number; aggression: number; accuracy: number; reaction: number; seenAt: number; lastSeen: number; memory: V3 | null; memoryT: number; crank: Crank | null; healT: number; stuckT: number; lastPos: V3; voiceCd: number; interactT: number; interactRef: any; aimDrift: V3; peekT: number; peekWall: Piece | null; wanderT: number; boxAt: V3 | null; lootT: number; emoteT: number; emote: number; probeT: number; probeDir: V3 | null; nades: number; stunT: number; shots: number; remote: number; team: number; netPos: V3; netYaw: number; netPitch: number; netHeld: string | null; netPose: number; cracked: boolean; ammo: Record<Ammo, number>; farmT: number; farmRef: Prop | null; ignore: Set<any>; tryRef: any; tryT: number; }
interface Fx { kind: 'dmg' | 'tracer' | 'puff'; t: number; pos: V3; text?: string; head?: boolean; to?: V3; col?: V3; }
const ICON: Record<string, string> = {
  pickaxe: '<svg viewBox="0 0 64 64"><path d="M14 52 L44 22" stroke="#7a5a3a" stroke-width="6" stroke-linecap="round"/><path d="M30 12 Q46 8 56 26" stroke="#dfe6ee" stroke-width="8" fill="none" stroke-linecap="round"/></svg>',
  ar: '<svg viewBox="0 0 64 64"><path d="M6 34h40l8-6h6v6h-8l-4 6h-8v10h-6v-10h-8l-4 8h-6l3-8h-13z" fill="#e8ecef"/><rect x="26" y="26" width="10" height="4" fill="#e8ecef"/></svg>',
  burst: '<svg viewBox="0 0 64 64"><path d="M6 34h40l8-6h6v6h-8l-4 6h-8v10h-6v-10h-8l-4 8h-6l3-8h-13z" fill="#e8ecef"/><rect x="22" y="24" width="18" height="4" fill="#e8ecef"/></svg>',
  smg: '<svg viewBox="0 0 64 64"><path d="M10 32h34l6-4h6v6h-6l-4 4h-10v12h-6v-12h-6l-2 6h-6l2-6h-8z" fill="#e8ecef"/></svg>',
  shotgun: '<svg viewBox="0 0 64 64"><path d="M4 36l14-6h38v4h-30v4h-8l-6 8h-8z" fill="#e8ecef"/><rect x="22" y="30" width="26" height="3" fill="#c9a56b"/></svg>',
  sniper: '<svg viewBox="0 0 64 64"><path d="M4 36l12-6h46v4h-34v4h-8l-6 8h-8z" fill="#e8ecef"/><rect x="26" y="22" width="16" height="5" fill="#e8ecef"/><rect x="24" y="24" width="3" height="4" fill="#e8ecef"/></svg>',
  pistol: '<svg viewBox="0 0 64 64"><path d="M12 28h40v8h-22l-4 14h-8l3-14h-9z" fill="#e8ecef"/></svg>',
  tac: '<svg viewBox="0 0 64 64"><path d="M4 36l14-6h38v5h-28v4h-10l-6 8h-8z" fill="#e8ecef"/><rect x="24" y="31" width="22" height="3" fill="#ff8a1e"/></svg>',
  hunting: '<svg viewBox="0 0 64 64"><path d="M4 36l12-6h46v4h-36v4h-6l-6 8h-8z" fill="#e8ecef"/><rect x="40" y="26" width="3" height="5" fill="#e8ecef"/></svg>',
  revolver: '<svg viewBox="0 0 64 64"><path d="M10 28h44v7h-24l-4 14h-8l3-14h-11z" fill="#e8ecef"/><circle cx="30" cy="31" r="5" fill="#aaa"/></svg>',
  silenced: '<svg viewBox="0 0 64 64"><path d="M20 28h32v8h-16l-4 14h-8l3-14h-7z" fill="#e8ecef"/><rect x="4" y="27" width="18" height="10" rx="3" fill="#666"/></svg>',
  rpg: '<svg viewBox="0 0 64 64"><rect x="4" y="28" width="52" height="10" rx="3" fill="#8a9a6a"/><path d="M56 26l6 7-6 7z" fill="#d83030"/><rect x="22" y="38" width="8" height="10" fill="#444"/></svg>',
  scar: '<svg viewBox="0 0 64 64"><path d="M6 34h40l8-6h6v6h-8l-4 6h-8v10h-6v-10h-8l-4 8h-6l3-8h-13z" fill="#ffd23a"/><rect x="24" y="24" width="14" height="5" fill="#ffd23a"/></svg>',
  miniShield: '<svg viewBox="0 0 64 64"><rect x="27" y="18" width="10" height="6" fill="#fff"/><path d="M24 26h16v20a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z" fill="#3aa2ff"/></svg>',
  grenade: '<svg viewBox="0 0 64 64"><ellipse cx="32" cy="38" rx="14" ry="16" fill="#4a6a3a"/><rect x="26" y="14" width="12" height="10" fill="#888"/><rect x="36" y="12" width="12" height="5" fill="#ccc"/></svg>',
  bushItem: '<svg viewBox="0 0 64 64"><circle cx="32" cy="36" r="18" fill="#45a932"/><circle cx="20" cy="30" r="10" fill="#5fc944"/><circle cx="44" cy="30" r="10" fill="#76de4e"/><circle cx="32" cy="22" r="9" fill="#5fc944"/></svg>',
  launchpad: '<svg viewBox="0 0 64 64"><ellipse cx="32" cy="44" rx="24" ry="8" fill="#2c88f5"/><ellipse cx="32" cy="42" rx="14" ry="5" fill="#8cd5ff"/><path d="M32 10l10 14h-6v10h-8v-10h-6z" fill="#ffe22e"/></svg>',
  boogie: '<svg viewBox="0 0 64 64"><circle cx="32" cy="36" r="16" fill="#c9c9d8"/><circle cx="26" cy="30" r="3" fill="#ff3ec9"/><circle cx="38" cy="40" r="3" fill="#3ddcf5"/><circle cx="36" cy="28" r="2" fill="#ffe22e"/><rect x="28" y="14" width="8" height="8" fill="#888"/></svg>',
  impulse: '<svg viewBox="0 0 64 64"><circle cx="32" cy="36" r="15" fill="#2c88f5"/><circle cx="32" cy="36" r="8" fill="#8cd5ff"/><rect x="28" y="14" width="8" height="8" fill="#888"/></svg>',
  chug: '<svg viewBox="0 0 64 64"><path d="M18 20h28v30a6 6 0 0 1-6 6h-16a6 6 0 0 1-6-6z" fill="#3aa2ff"/><rect x="26" y="10" width="12" height="10" fill="#2c6fb0"/><rect x="24" y="30" width="16" height="10" fill="#fff"/></svg>',
  bandage: '<svg viewBox="0 0 64 64"><rect x="8" y="26" width="48" height="12" rx="4" fill="#f4f4f4"/><rect x="26" y="26" width="12" height="12" fill="#e33"/><rect x="8" y="34" width="48" height="4" fill="#ddd"/></svg>',
  medkit: '<svg viewBox="0 0 64 64"><rect x="10" y="18" width="44" height="32" rx="4" fill="#f4f4f4"/><rect x="28" y="24" width="8" height="20" fill="#e33"/><rect x="22" y="30" width="20" height="8" fill="#e33"/></svg>',
  rod: '<svg viewBox="0 0 64 64"><path d="M10 56 L50 10" stroke="#c9a56b" stroke-width="4" stroke-linecap="round"/><path d="M50 10 q4 20 -8 30" stroke="#fff" stroke-width="1.5" fill="none"/><circle cx="22" cy="42" r="5" fill="#555"/></svg>',
  ammo: '<svg viewBox="0 0 64 64"><rect x="12" y="22" width="40" height="26" fill="#4a8f3a"/><rect x="12" y="18" width="40" height="6" fill="#2f5f25"/></svg>',
  shieldPot: '<svg viewBox="0 0 64 64"><rect x="26" y="10" width="12" height="8" fill="#fff"/><path d="M22 20h20v28a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8z" fill="#3aa2ff"/></svg>',
  fish: '<svg viewBox="0 0 64 64"><path d="M10 32q16-16 34-6l10-10v32l-10-10q-18 10-34-6z" fill="#3f8fe8"/><circle cx="22" cy="30" r="2.5" fill="#fff"/><path d="M26 40q8 4 16-2" stroke="#1f5fb0" stroke-width="2" fill="none"/></svg>',
};

// ---------------- player ----------------
type State = 'lobby' | 'island' | 'bus' | 'sky' | 'glide' | 'play';
const P = {
  state: 'lobby' as State, pos: [0, 6.5, 0] as V3, vel: [0, 0, 0] as V3, yaw: Math.PI, pitch: -0.1, skin: 0,
  hp: 100, shield: 0, grounded: false, crouch: false, sprint: false,
  mats: { wood: 0, stone: 0, metal: 30 } as Record<Mat, number>, mat: 'wood' as Mat,
  ammo: { light: 0, medium: 0, heavy: 0, shells: 0 } as Record<Ammo, number>,
  inv: [null, null, null, null, null] as (Item | null)[], slot: -1,
  build: false, piece: 'wall' as PieceType, fireCd: 0, reload: 0, swing: 0, useT: 0, useDur: 0,
  scoped: false, ads: false, thirdPerson: true, anim: 0, hurtCd: 0, kills: 0, alive: 100, matchT: 0, thanked: false, dmg: 0, dead: false, over: false,
  bloom: 0, burstLeft: 0, equipT: 0, swim: false, emote: 0, emoteT: 0, stunT: 0, bush: false, islandT: 0, dyingT: 0, editing: null as Piece | null, editMask: 0, rampRot: 0, fishing: 0, nextDrop: 90, weakPos:null as V3|null, weakRef:null as any, weakT:0,
};
const SDEF = { sensX: 1, sensY: 1, adsSens: 0.7, scopeSens: 0.5, invertY: false, toggleSprint: false, turbo: true, padSens: 1, rumble: true, master: 0.8, sfx: 0.8, voice: 0.7, music: 0.5, fov: 80, scale: 1, shadows: 2, grass: 1, viewDist: 1, showFps: true, streamer: false };
// low-end defaults (Chromebooks: few cores / little RAM / no discrete GPU) unless the player saved their own settings
const lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || ((navigator as any).deviceMemory || 8) <= 4;
const S: typeof SDEF = { ...SDEF, ...(lowEnd ? { shadows: 1, grass: 1, scale: 0.8, viewDist: 0 } : {}), ...JSON.parse(localStorage.getItem('fn-settings') || '{}') };
const GALLERY = new URLSearchParams(location.search).get('gallery'); if (GALLERY) { document.getElementById('lobby')!.style.display = 'none'; document.getElementById('lobbybg')!.style.display = 'none'; }
const D = { aimbot: false, esp: false, invuln: false, infMats: false, infAmmo: false, fly: false, lowGrav: false, pauseBots: false };
// persistent local profile: progression, wallet, unlocks, stats
let lastEmote = 0;
const PROF_DEF = { name: 'Player', xp: 0, vbucks: 2765, wins: 0, matches: 0, kills: 0, dmg: 0, builds: 0, chests: 0, discovered: [] as string[], unlocked: [0, 1, 2, 3] as number[], claimed: [] as number[], emote: 0, mode: 0 };
const PR: typeof PROF_DEF = { ...PROF_DEF, ...JSON.parse(localStorage.getItem('fn-profile') || '{}') };
const saveProfile = () => localStorage.setItem('fn-profile', JSON.stringify(PR));
const level = () => Math.floor(PR.xp / 1000) + 1;
const MODES = [['SOLO', 'BATTLE ROYALE'], ['PETERBOT GAUNTLET', 'ALL 32 BOTS ARE PETERBOTS'], ['FORTRESS SIEGE', 'DEFEND OR RAID A STONE FORT'], ['STORM TRIAL', 'FAST STORM · NO LOOT WASTED'], ['DUOS', 'TEAMS OF TWO · PARTY UP'], ['SQUADS', 'TEAMS OF FOUR · PARTY UP']];
const teamSize = () => (PR.mode === 4 ? 2 : PR.mode === 5 ? 4 : PR.mode === 2 ? 16 : 1);
const teamOf = (id: number) => { const i = NET.members.findIndex(m => m.id === id); return i < 0 ? -1 : Math.floor(i / teamSize()); };
const sameTeam = (a: number, b: number) => teamSize() > 1 && a >= 0 && teamOf(a) === teamOf(b);
function updateWallet() { $('wallet').textContent = 'Ⓥ ' + PR.vbucks.toLocaleString(); saveProfile(); }
function refreshLobby() {
  updateWallet(); const lv = level(), into = PR.xp % 1000;
  $('lpanel').querySelector('.lvl')!.textContent = 'LEVEL ' + lv; ($('lpanel').querySelector('.xp i') as HTMLElement).style.width = into / 10 + '%';
  $('nametag').querySelector('small')!.textContent = String(lv); ($('nametag').children[1] as HTMLElement).innerHTML = `${PR.name}<div class="nr">${PR.matches ? PR.wins + ' wins · ' + PR.kills + ' elims' : 'Not Ready'}</div>`;
  const ms = $('lpanel').querySelectorAll<HTMLElement>('.mission');
  const m1 = Math.min(POIS.length, PR.discovered.length), m2 = Math.min(3, PR.kills);
  ms[0]!.innerHTML = `Discover Named Locations<div class="bar"><i style="width:${m1 / POIS.length * 100}%"></i><b>${m1} / ${POIS.length}</b></div>`;
  ms[1]!.innerHTML = `Eliminate 3 opponents<div class="bar"><i style="width:${m2 / 3 * 100}%"></i><b>${m2} / 3</b></div>`;
  $('lpanel').querySelector('.sub')!.textContent = `${Math.floor(PR.matches * 4 / 60)}H ${(PR.matches * 4) % 60}M`;
  const md = $('lpanel').querySelectorAll<HTMLElement>('.medal'); md.forEach((m, i) => m.classList.toggle('gold', i < Math.min(10, Math.floor(PR.kills / 5))));
  document.querySelector('#rpanel .solo')!.textContent = MODES[PR.mode]![0]!; document.querySelector('#rpanel .br')!.textContent = MODES[PR.mode]![1]!;
  $('lbot').firstChild!.textContent = 'CHAPTER 1 · SEASON 1';
}
function toast(msg: string) { const e = $('toast'); e.textContent = msg; e.style.display = 'block'; clearTimeout((e as any)._t); (e as any)._t = setTimeout(() => (e.style.display = 'none'), 2200); }
const height = () => (P.crouch ? 1.2 : 1.75);
const eyeH = () => height() - 0.15;
const fwd = (): V3 => [Math.sin(P.yaw), 0, Math.cos(P.yaw)];
const right = (): V3 => [-Math.cos(P.yaw), 0, Math.sin(P.yaw)];
const look = (): V3 => [Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), Math.cos(P.yaw) * Math.cos(P.pitch)];
const curItem = () => (P.slot < 0 ? null : P.inv[P.slot]);

// ---------------- match content ----------------
const items: GroundItem[] = [], bots: Bot[] = [], fx: Fx[] = [], feed: { html: string; t: number }[] = [];
const chests: { pos: V3; yaw: number; open: boolean; drop?: boolean }[] = [];
const nades: { pos: V3; vel: V3; t: number; by: string; rocket?: boolean; kind?: Kind; visual?: boolean }[] = [];
const dying: { skin: number; pos: V3; yaw: number; t: number }[] = [];   // eliminated characters keeling over before they vanish
const pads: { pos: V3; t: number }[] = [];
const drops: { pos: V3; landed: boolean }[] = [], meteors: { pos: V3; vel: V3 }[] = []; let event: 'meteor' | null = null, eventT = 0;
const bus = { a: [0, 0, 0] as V3, b: [0, 0, 0] as V3, t: 0, dur: 55, pos: [0, 0, 0] as V3, yaw: 0 };
const storm = { c: [0, 0] as [number, number], r: 520, phaseT: 120, phase: 0, shrinking: false, from: { c: [0, 0] as [number, number], r: 380 }, to: { c: [0, 0] as [number, number], r: 380 }, shrinkT: 0 };
const PHASES = [[100, 50, 230], [70, 45, 140], [60, 40, 80], [50, 35, 40], [40, 30, 15], [30, 30, 3]];   // [wait, shrink, radius]
function nextStormPhase() {
  for (const b of bots) if (!b.dead) { b.skill = Math.min(1, b.skill + 0.06); b.accuracy = Math.min(0.75, b.accuracy + 0.03); b.reaction = Math.max(0.12, b.reaction - 0.05); }
  const ph = PHASES[Math.min(storm.phase, PHASES.length - 1)]; storm.from = { c: [storm.c[0], storm.c[1]], r: storm.r };
  const a = rand(0, 6.28), d = rand(0, Math.max(0, storm.r - ph![2]!) * 0.6); storm.to = { c: [storm.c[0] + Math.cos(a) * d, storm.c[1] + Math.sin(a) * d], r: ph![2]! };
  const fast = PR.mode === 3 ? 0.45 : 1; storm.shrinking = true; storm.shrinkT = ph![1]! * fast; storm.phaseT = ph![1]! * fast; storm.phase++; banner('STORM EYE SHRINKING', '', 4);
}
let siegeUp = false;
let fadeT = 0, fadeDur = 1; function fade(d: number) { fadeT = d; fadeDur = d; H.fade.style.opacity = '1'; }
let bannerT = 0; function banner(h: string, p: string, t: number) { H.banner.querySelector('h1')!.textContent = h; (H.banner.querySelector('p') as HTMLElement).textContent = p; (H.banner.querySelector('p') as HTMLElement).style.display = p ? 'block' : 'none'; H.banner.style.display = 'block'; bannerT = t; }
const NAMES1 = ['Misty', 'Coastal', 'Storm', 'Quiet', 'Frenzy', 'Slurp', 'Salty', 'Lazy', 'Sweaty', 'Dusty'], NAMES2 = ['Runner', 'Scout', 'Ranger', 'Nomad', 'Camper', 'Hunter', 'Rider', 'Drifter'];
const botName = () => NAMES1[Math.floor(rand(0, 10))]! + NAMES2[Math.floor(rand(0, 8))]! + Math.floor(rand(10, 99));
function addFeed(html: string, fromNet = false) { feed.push({ html, t: 12 }); if (feed.length > 5) feed.shift(); if (!fromNet && matchLive && NET.active() && NET.isHost()) NET.send({ t: 'feed', html }); }
const dropItem = (item: Item, pos: V3, spread = 0, id = nextItemId++) => { const g: GroundItem = { item, pos: [pos[0] + rand(-spread, spread), pos[1], pos[2] + rand(-spread, spread)], id }; items.push(g); if (matchLive && NET.active() && NET.isHost()) NET.send({ t: 'item', op: 'add', id, kind: item.kind, count: item.count, rar: item.rar, pos: g.pos }); return g; };

function startMatch(seed = Math.floor(Math.random() * 1e9), remoteStart = false) {
  rebuildWorld(seed); setSeed(seed ^ 0x5bd1e995); matchLive = false; nextItemId = 1;
  P.state = 'island'; P.islandT = 0; P.dyingT = 0; siegeUp = false; P.hp = 100; P.shield = 0; P.bush = false; P.kills = 0; P.alive = 1; P.matchT = 0; P.thanked = false; P.slot = -1; P.inv.fill(null); P.build = false;
  P.mats = { wood: 0, stone: 0, metal: 30 }; P.ammo = { light: 0, medium: 0, heavy: 0, shells: 0 };
  items.length = 0; bots.length = 0; chests.length = 0; feed.length = 0; W.clearPieces(); pads.length = 0; nades.length = 0; dying.length = 0;
  // bus path: random heading, random side offset (so it can skim an edge), random altitude; never the same twice
  const a = rand(0, 6.28), off = rand(-160, 160), alt = rand(115, 150), nx = -Math.sin(a), nz = Math.cos(a);
  bus.a = [Math.cos(a) * 470 + nx * off, alt, Math.sin(a) * 470 + nz * off]; bus.b = [-Math.cos(a) * 470 + nx * off, alt, -Math.sin(a) * 470 + nz * off]; bus.t = -1; bus.pos = [...bus.a] as V3;
  bus.yaw = Math.atan2(bus.b[0] - bus.a[0], bus.b[2] - bus.a[2]);
  // everyone starts on the spawn island: free mats, practice guns, no damage
  P.pos = [ISLAND[0] + rand(-10, 10), 8, ISLAND[2] + rand(-10, 10)]; P.vel = [0, 0, 0]; P.yaw = rand(0, 6.28); P.pitch = -0.1; P.mats = { wood: 999, stone: 999, metal: 999 }; P.ammo = { light: 999, medium: 999, heavy: 99, shells: 99 };
  P.inv[0] = mkItem('ar', 1, 2); P.inv[1] = mkItem('shotgun', 1, 2); P.slot = -1;
  for (let i = 0; i < 6; i++) { const aa = i / 6 * 6.283; dropItem(mkItem((['ar', 'shotgun', 'sniper', 'smg', 'pistol', 'burst'] as Kind[])[i]!, 1, 2), [ISLAND[0] + Math.cos(aa) * 12, 6, ISLAND[2] + Math.sin(aa) * 12]); }
  storm.c = [rand(-80, 80), rand(-80, 80)]; storm.r = 520; storm.phaseT = PR.mode === 3 ? 35 : 120;
  // loot + bots per POI
  // loot lives inside buildings (kit spawn points) plus a little floor loot outdoors
  const pool: Kind[] = ['ar', 'burst', 'smg', 'shotgun', 'sniper', 'pistol', 'pistol', 'tac', 'hunting', 'scar', 'rpg', 'revolver', 'silenced', 'bandage', 'shieldPot', 'miniShield', 'miniShield', 'chug', 'medkit', 'grenade', 'boogie', 'impulse', 'launchpad', 'bushItem', 'ammo', 'ammo'];
  for (const l of W.lootSpots) if (rand() < 0.75) dropItem(mkItem(pool[Math.floor(rand(0, pool.length))]!, 1), l);
  for (const c of W.chestSpots) if (rand() < 0.7) chests.push({ pos: [...c] as V3, yaw: rand(0, 6.28), open: false });
  for (const p of POIS) for (let i = 0; i < 9; i++) { const x = p.x + rand(-p.r, p.r) * 0.7, z = p.z + rand(-p.r, p.r) * 0.7, y = terrainH(x, z); if (y > 1) dropItem(mkItem(pool[Math.floor(rand(0, 14))]!, 1), [x, y, z]); }
  for (let i = 0; i < 32; i++) { const b = spawnBot(undefined, PR.mode === 1 || i < 15 ? (i % 2 ? 4 : 5) : Math.floor(rand(0, 4))); b.joinT = rand(1, 18); b.state = 'island'; b.pos = [ISLAND[0] + rand(-25, 25), 8, ISLAND[2] + rand(-25, 25)]; const ab = sub(bus.b, bus.a), k = clamp(((b.land[0] - bus.a[0]) * ab[0] + (b.land[2] - bus.a[2]) * ab[2]) / (ab[0] * ab[0] + ab[2] * ab[2]), 0.08, 0.95); b.dropT = k * bus.dur + rand(-3, 3) - (1 - b.skill) * 4; }   // jump when the bus passes closest to the chosen POI
  P.nextDrop = 90; drops.length = 0;
  for (const p of POIS) for (let i = 0; i < 3; i++) { const x = p.x + rand(-p.r, p.r) * 0.6, z = p.z + rand(-p.r, p.r) * 0.6, y = terrainH(x, z); if (y > 1) dropItem(mkItem('ammo'), [x, y, z]); }
  P.dead = false; P.over = false; P.dmg = 0; storm.phase = 0; storm.shrinking = false; H.end.style.display = 'none';
  H.lobby.style.display = 'none'; H.hud.style.display = 'block'; try { canvas.requestPointerLock(); } catch {}
  fade(1.2); banner('SPAWN ISLAND', 'WAITING FOR PLAYERS · PRACTICE WHILE THE LOBBY FILLS', 5);
  // multiplayer: other party members are player entities (moved by the network, never by AI); the host announces the match
  if (NET.active()) { for (const m of NET.members) if (m.id !== NET.id) addRemotePlayer(m); if (NET.isHost() && !remoteStart) NET.send({ t: 'start', seed, mode: PR.mode }); }
  matchLive = true;
}
function addRemotePlayer(m: Member): Bot {
  const b = spawnBot([ISLAND[0] + rand(-20, 20), 8, ISLAND[2] + rand(-20, 20)], 2);
  b.name = m.name; b.skin = m.skin % SKINS.length; b.remote = m.id; b.team = teamOf(m.id); b.state = 'island'; b.joinT = 0; b.weapon = null; b.weapons = []; b.mats = 0; b.netPos = [...b.pos] as V3; b.netYaw = 0;
  return b;
}
const PROFILES: { name: string; skill: [number, number]; aggro: [number, number]; loot: number }[] = [
  { name: 'cautious beginner', skill: [0.15, 0.35], aggro: [0.1, 0.35], loot: 0.6 }, { name: 'aggressive beginner', skill: [0.2, 0.4], aggro: [0.7, 0.95], loot: 0.3 },
  { name: 'average', skill: [0.4, 0.6], aggro: [0.4, 0.65], loot: 0.5 }, { name: 'loot goblin', skill: [0.35, 0.6], aggro: [0.2, 0.45], loot: 0.95 },
  { name: 'aggressive skilled', skill: [0.7, 0.95], aggro: [0.8, 1.0], loot: 0.4 }, { name: 'tactical skilled', skill: [0.7, 0.95], aggro: [0.45, 0.7], loot: 0.6 },
];
function spawnBot(at?: V3, profileIdx = -1): Bot {
  const p = POIS[Math.floor(rand(0, POIS.length))], land: V3 = [p!.x + rand(-p!.r, p!.r) * 0.8, 0, p!.z + rand(-p!.r, p!.r) * 0.8];
  const pr = PROFILES[profileIdx >= 0 ? profileIdx : Math.floor(rand(0, PROFILES.length))];
  const skill = rand(pr!.skill[0], pr!.skill[1]), aggression = rand(pr!.aggro[0], pr!.aggro[1]), pos = at ? [...at] as V3 : [0, 0, 0] as V3;
  const cracked = profileIdx >= 4 || pr!.skill[0] >= 0.7;
  const b: Bot = { name: cracked ? 'Peterbot' + Math.floor(rand(10, 99)) : botName(), pos, vel: [0, 0, 0], yaw: rand(0, 6.28), pitch: 0, hp: 100, shield: at ? 50 : 0, skin: Math.floor(rand(0, SKINS.length)), state: at ? 'ground' : 'bus', dead: false, anim: 0, weapon: at ? 'ar' : null, weapons: at ? ['ar'] : [], heals: at ? 2 : 0, mats: at ? 500 : 0, target: null, retarget: 0, fireCd: 1, buildCd: 0, lastHit: -9, grounded: false, dropT: rand(6, 50), land, enemy: null, strafe: 1, mode: 'loot', profile: pr!.name, skill, aggression, accuracy: cracked ? 0.3 + skill * 0.35 : 0.14 + skill * 0.3, reaction: lerp(0.9, 0.2, skill), seenAt: 0, lastSeen: -9, memory: null, memoryT: 0, crank: null, healT: 0, stuckT: 0, lastPos: [...pos] as V3, voiceCd: rand(0, 5), interactT: 0, interactRef: null, aimDrift: [rand(-1, 1), rand(-.5, .5), rand(-1, 1)], peekT: 0, peekWall: null, wanderT: 0, boxAt: null, lootT: 0, emoteT: 0, emote: 0, probeT: 0, probeDir: null, nades: at ? 3 : 0, stunT: 0, shots: 0, remote: 0, team: -1, netPos: [0, 0, 0], netYaw: 0, netPitch: 0, netHeld: null, netPose: 0, cracked: profileIdx >= 4 || pr!.skill[0] >= 0.7, ammo: { light: at ? 90 : 0, medium: at ? 90 : 0, heavy: at ? 10 : 0, shells: at ? 20 : 0 }, farmT: 0, farmRef: null, ignore: new Set(), tryRef: null, tryT: 0, joinT: 0 };
  bots.push(b); return b;
}
function toLobby() { refreshLobby(); P.state = 'lobby'; H.end.style.display = 'none'; P.over = false; H.lobby.style.display = 'block'; H.hud.style.display = 'none'; document.exitPointerLock(); }

// ---------------- input & controller ----------------
const mouse = { l: false, r: false, dx: 0, dy: 0 };   // filled from engine actions each frame
let gpIndex: number | null = null;

function rumble(duration: number, weak = 0.5, strong = 0.5) {
  if (!navigator.getGamepads || !S.rumble) return;
  try {
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (!gp || !gp.connected) continue;
      if (gp.vibrationActuator && typeof gp.vibrationActuator.playEffect === 'function') {
        gp.vibrationActuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: duration,
          weakMagnitude: weak,
          strongMagnitude: strong,
        }).catch(() => {});
      } else if ((gp as any).hapticActuators && (gp as any).hapticActuators[0]) {
        (gp as any).hapticActuators[0].pulse(strong, duration).catch(() => {});
      }
    }
  } catch {}
}

addEventListener('gamepadconnected', (e: GamepadEvent) => {
  gpIndex = e.gamepad.index;
  info('🎮 CONTROLLER CONNECTED');
  rumble(160, 0.4, 0.6);
});

addEventListener('gamepaddisconnected', (e: GamepadEvent) => {
  if (gpIndex === e.gamepad.index) {
    gpIndex = null;
    info('🎮 CONTROLLER DISCONNECTED');
  }
});

canvas.addEventListener('mousedown', () => { if (P.state !== 'lobby' && document.pointerLockElement !== canvas) canvas.requestPointerLock(); });
$('btnPlay').onclick = () => { if (NET.active() && !NET.isHost()) return toast('Waiting for the party leader to start'); void unlockAudio(); startMatch(); };
NET.on('members', () => { if (P.state === 'lobby' && menuPage.style.display === 'block' && menuTitle.textContent === 'PARTY') openPage('PARTY'); document.querySelector('#lnav .box')!.textContent = '👤 ' + Math.max(0, NET.members.length - 1); });
$('btnSkin').onclick = () => { PR.mode = (PR.mode + 1) % MODES.length; refreshLobby(); };
const menuPage = $('menuPage'), menuTitle = menuPage.querySelector('h1')!, menuCards = menuPage.querySelector('.cards')!;
const SHOP = [4, 5, 6, 7, 8, 9, 10, 11].map((i, k) => ({ skin: i, price: [800, 1200, 1500, 2000][k % 4] }));
const PASS = Array.from({ length: 20 }, (_, i) => ({ tier: i + 1, reward: i % 5 === 4 ? { skin: 12 + Math.floor(i / 5) } : { vbucks: 100 + (i % 5) * 50 } }));
const CHALLENGES = [['Eliminate 10 opponents', () => PR.kills, 10, 500], ['Deal 2,500 damage', () => Math.round(PR.dmg), 2500, 500], ['Place 250 structures', () => PR.builds, 250, 400], ['Open 25 chests', () => PR.chests, 25, 300], ['Discover every named location', () => PR.discovered.length, POIS.length, 800], ['Win a Victory Royale', () => PR.wins, 1, 1500], ['Play 10 matches', () => PR.matches, 10, 300]] as [string, () => number, number, number][];
const skinTile = (i: number, sub: string, cls = '') => `<div class="tile skin ${cls}" data-skin="${i}"><canvas width="64" height="64"></canvas><b>${SKINS[i]!.name}</b>${sub}</div>`;
function paintSkins() { menuCards.querySelectorAll<HTMLCanvasElement>('.tile.skin canvas').forEach(cv => { const sk = SKINS[+cv.parentElement!.dataset.skin!], c = cv.getContext('2d')!, col = (v: V3) => `rgb(${v.map(x => x * 255 | 0).join(',')})`; c.fillStyle = col(sk!.top); c.fillRect(12, 34, 40, 30); c.fillStyle = col(sk!.pants); c.fillRect(16, 56, 32, 8); c.fillStyle = col(sk!.skin); c.fillRect(18, 10, 28, 26); c.fillStyle = col(sk!.hair); c.fillRect(16, 4, 32, 10); c.fillStyle = '#000'; c.fillRect(24, 20, 4, 4); c.fillRect(36, 20, 4, 4); }); }
function openPage(name: string) {
  document.querySelectorAll('#lnav .tab').forEach(x => x.classList.toggle('on', x.textContent === name));
  if (name === 'PLAY') { menuPage.style.display = 'none'; return; }
  menuTitle.textContent = name; let html = '';
  if (name === 'BATTLE PASS') { const lv = level(); html = `<div class="tile"><b>LEVEL ${lv}</b>${PR.xp % 1000} / 1000 XP to next level · earn XP from eliminations, damage and survival</div>` + PASS.map(t => { const ok = lv >= t.tier, done = PR.claimed.includes(t.tier); const r = 'skin' in t.reward ? SKINS[t.reward.skin!]!.name : `Ⓥ ${t.reward.vbucks}`; return `<div class="tile ${ok ? '' : 'locked'}"><b>TIER ${t.tier}</b>${r}<br>${done ? '✔ CLAIMED' : ok ? `<button data-claim="${t.tier}">CLAIM</button>` : `Reach level ${t.tier}`}</div>`; }).join(''); }
  else if (name === 'CHALLENGES') html = CHALLENGES.map(([n, f, goal, xp], i) => { const v = Math.min(goal, f()), done = v >= goal; return `<div class="tile"><b>${n}</b><div class="bar"><i style="width:${v / goal * 100}%"></i><b>${v} / ${goal}</b></div>${done ? '✔ +' + xp + ' XP' : '+' + xp + ' XP'}</div>`; }).join('');
  else if (name === 'COMPETE') html = MODES.map((m, i) => `<div class="tile"><b>${m[0]}</b>${m[1]}<br><button data-mode="${i}">LAUNCH</button></div>`).join('') + `<div class="tile"><b>SPAWN BOT LOBBY</b>Practice on the spawn island with the whole lobby before the bus leaves.<br><button data-mode="0">PLAY</button></div>`;
  else if (name === 'LOCKER') html = `<div class="tile" style="grid-column:1/-1"><b>EMOTE (B)</b>${EMOTES.map((e, i) => `<button data-emote="${i}" ${PR.emote === i ? 'style="background:#ffe22e;color:#12305a"' : ''}>${e}</button>`).join(' ')}</div>` + SKINS.map((sk, i) => skinTile(i, PR.unlocked.includes(i) ? (i === P.skin ? 'EQUIPPED' : 'Click to equip') : '🔒 Item Shop / Battle Pass', i === P.skin ? 'on' : PR.unlocked.includes(i) ? '' : 'locked')).join('');
  else if (name === 'ITEM SHOP') html = SHOP.map(o => skinTile(o.skin, PR.unlocked.includes(o.skin) ? 'OWNED' : `Ⓥ ${o.price} <button data-buy="${o.skin}" data-price="${o.price}">BUY</button>`)).join('');
  else if (name === 'CAREER') html = `<div class="tile"><b>${PR.name}</b>Level ${level()} · ${PR.xp.toLocaleString()} XP</div><div class="tile"><b>${PR.matches}</b>MATCHES</div><div class="tile"><b>${PR.wins}</b>VICTORY ROYALES</div><div class="tile"><b>${PR.kills}</b>ELIMINATIONS</div><div class="tile"><b>${Math.round(PR.dmg).toLocaleString()}</b>DAMAGE</div><div class="tile"><b>${PR.builds}</b>STRUCTURES</div><div class="tile"><b>${PR.chests}</b>CHESTS</div><div class="tile"><b>${PR.discovered.length} / ${POIS.length}</b>LOCATIONS<br>${PR.discovered.join(', ') || '—'}</div><div class="tile"><b>RESET</b><button data-act="reset">Wipe local profile</button></div>`;
  else if (name === 'STORE') html = [1000, 2800, 5000, 13500].map(v => `<div class="tile"><b>Ⓥ ${v.toLocaleString()}</b>Free in this local build<br><button data-vb="${v}">GET</button></div>`).join('');
  else if (name === 'PARTY') {
    const me = NET.id;
    html = NET.connected()
      ? `<div class="tile" style="grid-column:1/-1"><b>PARTY CODE: ${NET.code}</b>Share this code — friends join from their PARTY page. ${NET.isHost() ? 'You are the party leader: your PLAY starts the match for everyone.' : 'Waiting for the party leader to press PLAY.'} Ping ${Math.round(NET.rtt)}ms<br><button data-party="leave">LEAVE PARTY</button></div>` + NET.members.map((m, i) => `<div class="tile ${m.id === me ? 'on' : ''}"><b>${m.name}${m.id === NET.hostId ? ' 👑' : ''}${m.id === me ? ' (you)' : ''}</b>${SKINS[m.skin % SKINS.length]!.name}${teamSize() > 1 ? ` · Team ${Math.floor(i / teamSize()) + 1}` : ''}</div>`).join('')
      : `<div class="tile"><b>CREATE PARTY</b>Get a 5-letter code your friends can join. The leader's mode (Solo / Duos / Squads…) applies to everyone.<br><button data-party="create">CREATE</button></div><div class="tile"><b>JOIN PARTY</b><input id="joinCode" maxlength="5" placeholder="CODE" style="text-transform:uppercase;width:90px;padding:6px;font-size:16px"> <button data-party="join">JOIN</button></div><div class="tile"><b>${PR.name} (you)</b>Level ${level()} · ${MODES[PR.mode]![0]}<br>Bots fill the rest of the lobby.</div>`;
  }
  menuCards.innerHTML = html; paintSkins(); menuPage.style.display = 'block';
  menuCards.querySelectorAll<HTMLElement>('.tile.skin').forEach(card => card.onclick = () => { const i = +card.dataset.skin!; if (name === 'LOCKER' && PR.unlocked.includes(i)) { P.skin = i; PR.mode = PR.mode; saveProfile(); openPage(name); } });
  menuCards.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(b => b.onclick = e => { e.stopPropagation(); const i = +b.dataset.buy!, pr = +b.dataset.price!; if (PR.vbucks < pr) return toast('Not enough V-Bucks'); PR.vbucks -= pr; PR.unlocked.push(i); updateWallet(); toast('Purchased ' + SKINS[i]!.name); openPage(name); });
  menuCards.querySelectorAll<HTMLButtonElement>('[data-claim]').forEach(b => b.onclick = () => { const t = PASS[+b.dataset.claim! - 1]; PR.claimed.push(t!.tier); if ('skin' in t!.reward) { PR.unlocked.push(t!.reward.skin!); toast('Unlocked ' + SKINS[t!.reward.skin!]!.name); } else { PR.vbucks += t!.reward.vbucks!; toast('+' + t!.reward.vbucks + ' V-Bucks'); } updateWallet(); openPage(name); });
  menuCards.querySelectorAll<HTMLButtonElement>('[data-vb]').forEach(b => b.onclick = () => { PR.vbucks += +b.dataset.vb!; updateWallet(); toast('+' + b.dataset.vb + ' V-Bucks'); });
  menuCards.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => b.onclick = () => { PR.mode = +b.dataset.mode!; refreshLobby(); menuPage.style.display = 'none'; $('btnPlay').click(); });
  menuCards.querySelectorAll<HTMLButtonElement>('[data-emote]').forEach(b => b.onclick = () => { PR.emote = +b.dataset.emote!; lastEmote = PR.emote; saveProfile(); openPage(name); });
  menuCards.querySelectorAll<HTMLButtonElement>('[data-party]').forEach(b => b.onclick = async () => {
    try {
      if (b.dataset.party === 'create') { const code = await NET.createRoom(); await NET.join(code, PR.name, P.skin); toast('Party ' + code + ' created'); }
      else if (b.dataset.party === 'join') { const code = (menuCards.querySelector('#joinCode') as HTMLInputElement).value.trim().toUpperCase(); if (code.length !== 5) return toast('Enter the 5-letter code'); await NET.join(code, PR.name, P.skin); toast('Joined ' + code); }
      else { NET.leave(); }
    } catch (e) { toast('Party: ' + (e as Error).message); }
    openPage('PARTY');
  });
  menuCards.querySelectorAll<HTMLButtonElement>('[data-act=reset]').forEach(b => b.onclick = () => { if (confirm('Wipe the local profile?')) { localStorage.removeItem('fn-profile'); location.reload(); } });
}
document.querySelectorAll<HTMLElement>('#lnav .tab').forEach(el => el.onclick = () => openPage(el.textContent || ''));
$('menuClose').onclick = () => openPage('PLAY');
document.querySelector<HTMLElement>('#lnav .box')!.onclick = () => openPage('PARTY');
document.querySelectorAll<HTMLElement>('#lobby .plus').forEach(el => el.onclick = () => openPage('PARTY'));
$('local').onclick = () => toast('LOCAL: everything runs in this browser. No account, no servers.');
$('nametag').onclick = () => { const n = prompt('Display name', PR.name); if (n && n.trim()) { PR.name = n.trim().slice(0, 16); saveProfile(); refreshLobby(); } };
$('lbot').querySelector('span')!.onclick = e => { const tx = (e.target as HTMLElement).textContent || ''; if (tx.includes('Controls')) { settingsOpen(true); SET.querySelector<HTMLElement>('[data-p=keys]')!.click(); } else openPage('LOCKER'); };
H.pause.onclick = () => canvas.requestPointerLock();
document.addEventListener('pointerlockchange', () => { H.pause.style.display = document.pointerLockElement === canvas || P.state === 'lobby' || SET.style.display === 'block' || EW.style.display === 'flex' || dbgOpen() || P.over ? 'none' : 'flex'; });

// ---------------- helpers ----------------
function botBoxes(): Box[] {
  const b: Box[] = [];
  for (const d of bots) if (!d.dead) { const [x, y, z] = d.pos; b.push({ min: [x - 0.35, y, z - 0.25], max: [x + 0.35, y + 1.55, z + 0.25], ref: { d, head: false } }, { min: [x - 0.25, y + 1.55, z - 0.25], max: [x + 0.25, y + 2.05, z + 0.25], ref: { d, head: true } }); }
  return b;
}
function damage(n: number, by = 'the storm') {
  if (D.invuln || P.dead || P.over || P.state === 'island') return;
  rumble(Math.min(400, n * 8 + 120), 0.7, 0.95);
  P.bush = false;
  const s = Math.min(P.shield, n); P.shield -= s; P.hp -= n - s; H.flash.style.opacity = '0.3'; setTimeout(() => (H.flash.style.opacity = '0'), 80); beep(120, 0.2, 'sawtooth', 0.1, -60);
  if (P.hp <= 0) { P.hp = 0; P.dead = true; P.dyingT = 1.5; addFeed(`${by} eliminated <span class="me">${PR.name}</span>`); banner('YOU WERE ELIMINATED', 'BY ' + by.toUpperCase(), 4); setTimeout(() => endScreen(false, by), 4000); }
}
function endScreen(win: boolean, by = '') {
  P.over = true; document.exitPointerLock();
  const xp = P.kills * 300 + Math.round(P.dmg * 2) + Math.round(P.matchT * 5) + (win ? 1500 : 0);
  PR.xp += xp; PR.matches++; PR.kills += P.kills; PR.dmg += P.dmg; if (win) { PR.vbucks += 250; PR.wins++; rumble(500, 1.0, 1.0); } else rumble(300, 0.6, 0.8); saveProfile();
  H.end.className = win ? 'win' : 'lose';
  H.end.querySelector('.title')!.innerHTML = win ? '<span class="n1">#1</span><span>VICTORY<br>ROYALE</span>' : `<span class="n1">#${P.alive}</span><span>ELIMINATED<br><small>by ${by}</small></span>`;
  H.end.querySelector('.st')!.innerHTML = `<div><b>${P.kills}</b>ELIMINATIONS</div><div><b>${Math.round(P.dmg)}</b>DAMAGE</div><div><b>${xp}</b>MATCH XP</div>`;
  H.end.style.display = 'flex';
  if (win) { const c = H.end.querySelector('.confetti')!; c.innerHTML = ''; for (let i = 0; i < 80; i++) c.innerHTML += `<i style="left:${rand(0, 100)}%;animation-delay:${rand(0, 4)}s;background:${['#ff5ab3', '#5ee0ff', '#ffe22e', '#9dff5a'][i % 4]};transform:rotate(${rand(0, 90)}deg)"></i>`; }
}
let infoT = 0; function info(t: string) { H.info.textContent = t; H.info.style.display = 'block'; infoT = 2; }
function giveMat(m: Mat, n: number) { P.mats[m] = Math.min(999, P.mats[m] + n); }
const camPos: V3 = [0, 0, 0]; let camFwd: V3 = [0, 0, 1], fov = 1.15;
let VP: M4 = perspective(1, 1, 0.1, 10);
function project(p: V3): [number, number] | null {
  const c = transformPoint(VP, p); const w = VP[3]! * p[0] + VP[7]! * p[1] + VP[11]! * p[2] + VP[15]!;
  if (w < 0.1 || Math.abs(c[0]) > 1.2 || Math.abs(c[1]) > 1.2) return null;
  return [(c[0] * 0.5 + 0.5) * innerWidth, (0.5 - c[1] * 0.5) * innerHeight];
}
function buildTarget(): { type: PieceType; pos: V3; dir: number } {
  const dir = ((Math.round(P.yaw / (Math.PI / 2)) % 4) + 4) % 4, a = dir * Math.PI / 2, f: V3 = [Math.sin(a), 0, Math.cos(a)];
  let level = Math.floor((P.pos[1] + 1) / 4) * 4;
  if (P.pitch > 0.45) level += 4;                                       // looking up: build a level higher
  let t: V3 = add(P.pos, scale(f, P.piece === 'wall' ? 2.6 : 3.2));
  if (P.pitch < -0.7 && P.piece !== 'wall') t = P.pos;
  const cx = Math.floor(t[0] / 4) * 4 + 2, cz = Math.floor(t[2] / 4) * 4 + 2;
  if (P.piece === 'wall') return { type: 'wall', pos: [cx + f[0] * 2, level, cz + f[2] * 2], dir };
  return { type: P.piece, pos: [cx, level, cz], dir: P.piece === 'ramp' ? (dir + P.rampRot) % 4 : dir };
}

// ---------------- shooting ----------------
function botDamage(dm: Bot, n: number, by: string, how = 'with a weapon') {
  if (dm.dead || dm.state === 'island') return;
  if (by === 'Player') by = PR.name;
  const sh = Math.min(dm.shield, n); dm.shield -= sh; dm.hp -= n - sh; dm.lastHit = t;
  if (dm.remote) NET.send({ t: 'dmg', to: dm.remote, hp: dm.hp, sh: dm.shield, by });
  // getting shot tells the bot where from: remember the attacker and (skill-based) snap toward them so perception can lock on
  const att = by === 'Player' ? P.pos : bots.find(x => x.name === by)?.pos;
  if (att) { dm.memory = [...att] as V3; dm.memoryT = t; if (Math.random() < 0.4 + dm.skill * 0.6) { dm.yaw = Math.atan2(att[0] - dm.pos[0], att[2] - dm.pos[2]); dm.retarget = 0; } if (!dm.enemy && dm.weapon && dm.mode !== 'heal') dm.mode = 'hunt'; }
  if (dm.hp > 0) { if (Math.random() < .22) botVoice(dm); return; }
  dm.dead = true; P.alive--; dying.push({ skin: dm.skin, pos: [...dm.pos] as V3, yaw: dm.yaw, t: 1.4 }); fx.push({ kind: 'puff', t: 0.4, pos: add(dm.pos, [0, 1, 0]), col: [0.4, 0.8, 1] });
  if (Math.random() < 0.35) { const killer = bots.find(x => x.name === by); if (killer && !killer.dead) { killer.emoteT = 3; killer.emote = Math.floor(rand(0, 4)); } }
  if (by === PR.name) { P.kills++; H.elim.querySelector('b')!.textContent = dm.name; H.elim.style.display = 'block'; setTimeout(() => (H.elim.style.display = 'none'), 2500); addFeed(`Player eliminated <span class="v">${dm.name}</span> ${how}`); beep(600, 0.3, 'square', 0.08, 300); }
  else addFeed(`${by} eliminated <span class="v">${dm.name}</span>`);
  for (const w of dm.weapons) dropItem(mkItem(w), add(dm.pos, [0, 0.2, 0]), 1.2); dropItem(mkItem('bandage', 3), add(dm.pos, [0, 0.2, 0]), 1); if (dm.heals > 1) dropItem(mkItem('shieldPot', 1), add(dm.pos, [0, 0.2, 0]), 1.3);
  if (P.alive <= 1 && !P.dead && !P.over && P.state === 'play') setTimeout(() => endScreen(true), 800);
}
let lastShot = -9;
function shoot(item: Item) {
  const w = WEAPONS[item.kind]; lastShot = t; P.bush = false;
  if (item.kind === 'rpg') { item.mag--; P.fireCd = 60 / w!.rpm; P.pitch += w!.kick; beep(80, 0.3, 'sawtooth', 0.15, -40); rumble(250, 0.9, 1); { const nd = { pos: add(camPos, scale(camFwd, 1.2)), vel: scale(camFwd, 34), t: 6, by: PR.name, rocket: true }; nades.push({ ...nd, visual: NET.active() && !NET.isHost() }); netNade(nd); } botHear(P.pos, 90, 'player'); return; }
  // Gunfire is evidence, not wall vision: nearby bots investigate the sound but do not gain a target lock.
  if (item.kind !== 'silenced') botHear(P.pos, 70, 'player');
  if (!D.infAmmo) item.mag--; P.fireCd = 60 / w!.rpm; beep(item.kind === 'sniper' ? 90 : item.kind === 'shotgun' ? 110 : item.kind === 'silenced' ? 500 : 220, 0.12, 'sawtooth', item.kind === 'silenced' ? 0.04 : 0.12, -80);
  const rDur = item.kind === 'shotgun' ? 180 : item.kind === 'sniper' ? 220 : item.kind === 'smg' ? 75 : 100;
  const rWeak = item.kind === 'shotgun' ? 0.7 : item.kind === 'sniper' ? 0.5 : item.kind === 'smg' ? 0.3 : 0.5;
  const rStrong = item.kind === 'shotgun' ? 0.9 : item.kind === 'sniper' ? 1.0 : item.kind === 'smg' ? 0.3 : 0.5;
  rumble(rDur, rWeak, rStrong);
  P.pitch += w!.kick * (P.ads ? 0.6 : 1); P.yaw += rand(-w!.kick, w!.kick) * 0.4;
  if (w!.burst) { if (P.burstLeft <= 0) P.burstLeft = w!.burst; P.burstLeft--; if (P.burstLeft <= 0) P.fireCd = 0.5; }
  const boxes = botBoxes(); let hitAny = false, headAny = false; const client = NET.active() && !NET.isHost(); const shotRays: V3[] = [];
  for (let i = 0; i < w!.pellets; i++) {
    const sp = (w!.spread + P.bloom) * (P.scoped ? 0 : P.ads ? 0.5 : 1) * (P.grounded ? 1 : 1.8) * (P.crouch ? 0.7 : 1) * (Math.hypot(P.vel[0], P.vel[2]) > 3 ? 1.5 : 1);
    let aim = camFwd;
    if (D.aimbot) { let best = 1e9, bp: V3 | null = null; for (const b of bots) if (!b.dead && b.state === 'ground') { const hp = add(b.pos, [0, 1.75, 0]), dd = len(sub(hp, camPos)); if (dd < best && dd < w!.range) { best = dd; bp = hp; } } if (bp) aim = norm(sub(bp, camPos)); }
    const d = norm(add(aim, [rand(-sp, sp), rand(-sp, sp), rand(-sp, sp)]));
    const h = W.raycast(camPos, d, w!.range, boxes);
    const end = h ? h.p : add(camPos, scale(d, w!.range)); shotRays.push(d);
    fx.push({ kind: 'tracer', t: 0.08, pos: add(add(P.pos, [0, eyeH() - 0.3, 0]), scale(right(), 0.35)), to: end });
    if (!h) continue;
    fx.push({ kind: 'puff', t: 0.22, pos: h.p, col: h.kind === 'box' ? [1, 0.3, 0.2] : h.kind === 'terrain' ? [0.7, 0.6, 0.45] : h.kind === 'prop' ? [0.5, 0.7, 0.3] : [0.9, 0.85, 0.7] });
    if (h.kind === 'box') {
      const { d: dm, head } = h.ref as { d: Bot; head: boolean }; const fall = h.t > w!.range * 0.5 ? lerp(1, 0.6, (h.t - w!.range * 0.5) / (w!.range * 0.5)) : 1; const dmg = Math.round(w!.dmg * RAR_MULT[item.rar]! * fall * (head ? w!.hs : 1));
      if (!client && !(dm.remote && sameTeam(NET.id, dm.remote))) botDamage(dm, dmg, 'Player'); P.dmg += dmg; dm.lastHit = t; dm.enemy = 'player'; hitAny = true; headAny ||= head;
      fx.push({ kind: 'dmg', t: 0.9, pos: add(h.p, [rand(-0.3, 0.3), 0.3, 0]), text: String(dmg), head });
    } else if (h.kind === 'piece') { if (!client) W.damagePiece(h.ref as Piece, w!.dmg); fx.push({ kind: 'dmg', t: 0.6, pos: h.p, text: String(w!.dmg) }); }
    else if (h.kind === 'prop') { const q = h.ref as Prop; q.hp -= w!.dmg; if (q.hp <= 0) { q.dead = 30; dirtyProp(q); } }
  }
  if (client) NET.send({ t: 'act', k: 'shot', o: camPos, d: shotRays, kind: item.kind, rar: item.rar });
  P.bloom = Math.min(P.bloom + w!.bloom, w!.bloom * 4);
  if (hitAny) { H.hitm.style.opacity = '1'; H.hitm.className = headAny ? 'head' : ''; setTimeout(() => (H.hitm.style.opacity = '0'), 60); beep(headAny ? 1400 : 1000, 0.06, 'sine', 0.1); }
}
function swingPickaxe() {
  P.swing = 0.5; beep(300, 0.08, 'triangle', 0.05);
  const h = W.raycast(add(P.pos, [0, eyeH(), 0]), camFwd, 4, botBoxes());
  if (!h) return;
  const weak=!!(P.weakRef===h.ref&&P.weakPos&&len(sub(h.p,P.weakPos))<.9), mark=()=>{P.weakRef=h.ref;P.weakPos=add(h.p,[rand(-.45,.45),rand(-.45,.45),rand(-.08,.08)]);P.weakT=4;};
  if (weak) rumble(120, 0.8, 0.85); else rumble(75, 0.45, 0.45);
  if (h.kind === 'prop') { const q = h.ref as Prop, dmg=weak?100:50; q.hp -= dmg; const m: Mat = q.type === 'rock' ? 'stone' : 'wood'; const n = q.type === 'bush' ? 3 : weak?24:10; giveMat(m, n); fx.push({ kind: 'dmg', t: 0.7, pos: h.p, text: weak?'CRITICAL +'+n:'+' + n, head: weak }); beep(weak?950:500, 0.1, 'square', 0.06); if (q.hp <= 0){q.dead = 30;P.weakT=0;dirtyProp(q);}else mark(); }
  else if (h.kind === 'static' && (h.ref as typeof W.statics[number]).baked) { const s = h.ref as typeof W.statics[number]; giveMat(s.mesh === 'crate' || s.mesh === 'fence' || s.mesh === 'bench' ? 'wood' : s.mesh === 'hedge' ? 'wood' : 'metal', 5); fx.push({ kind: 'dmg', t: 0.7, pos: h.p, text: '+5' }); beep(430, .1, 'square', .06); }
  else if (h.kind === 'static') { const s=h.ref as typeof W.statics[number], dmg=weak?100:45, mat:Mat=(s.mesh === 'car'||s.mesh==='truck'||s.mesh==='lamp')?'metal':s.mesh.startsWith('house')?'wood':'stone',n=weak?18:7;s.hp=(s.hp??300)-dmg;s.shake=.28;giveMat(mat,n);fx.push({kind:'dmg',t:.7,pos:h.p,text:weak?'CRITICAL +'+n:'+'+n,head:weak});beep(weak?900:430,.1,'square',.06);if(s.hp<=0){s.dead=true;s.boxes.length=0;P.weakT=0;}else mark(); }
  else if (h.kind === 'piece') { const p = h.ref as Piece; W.damagePiece(p, 50); giveMat(p.mat, 5); fx.push({ kind: 'dmg', t: 0.7, pos: h.p, text: '50' }); beep(400, 0.1, 'square', 0.06); }
  else if (h.kind === 'box') { const dm = (h.ref as { d: Bot }).d; botDamage(dm, 20, 'Player', 'with a pickaxe'); P.dmg += 20; fx.push({ kind: 'dmg', t: 0.7, pos: h.p, text: '20' }); }
}

// ---------------- movement ----------------
/** per-axis AABB mover shared by player and bots; returns true when it landed this step */
function moveEntity(e: { pos: V3; vel: V3; grounded: boolean }, h: number, dt: number): boolean {
  const hw = 0.35, travel=Math.max(Math.abs(e.vel[0]),Math.abs(e.vel[1]),Math.abs(e.vel[2]))*dt, steps=Math.max(1,Math.ceil(travel/.16)), sdt=dt/steps; let landedNow = false;
  for(let step=0;step<steps;step++) {
    const boxes = W.solids(e.pos[0], e.pos[2]);
    const overlaps = (p: V3) => boxes.filter(b => p[0] + hw > b.min[0] && p[0] - hw < b.max[0] && p[1] < b.max[1] && p[1] + h > b.min[1] && p[2] + hw > b.min[2] && p[2] - hw < b.max[2]);
    for (const ax of [0, 2, 1]) {
      const d = e.vel[ax]! * sdt; if (!d) continue;
      e.pos[ax]! += d;
      let ov = overlaps(e.pos);
      if (ov.length && ax !== 1) { const up: V3 = [e.pos[0], e.pos[1] + 0.7, e.pos[2]]; if (!overlaps(up).length) { e.pos[1] += 0.7; ov = []; } }
      for (const b of ov) {
        if (d > 0) e.pos[ax] = b.min[ax]! - (ax === 1 ? h : hw) - 0.001; else e.pos[ax] = b.max[ax]! + (ax === 1 ? 0 : hw) + 0.001;
        if (ax === 1) { if (d < 0) { landedNow = true; e.grounded = true; } e.vel[1] = 0; } else e.vel[ax] = 0;
      }
    }
  }
  const g = W.groundH(e.pos[0], e.pos[2], e.pos[1]);
  if (e.pos[1] <= g + 0.01 && e.vel[1] <= 0) { e.pos[1] = g; if (!e.grounded) landedNow = true; e.grounded = true; e.vel[1] = 0; }
  if (e.pos[1] < -1.6) { e.pos[1] = -1.6; e.vel[1] = 0; e.grounded = true; }
  return landedNow;
}
function moveAndCollide(dt: number) { if (moveEntity(P, height(), dt)) landed(); }
function landed() {
  if (P.state === 'glide' || P.state === 'sky') {
    P.state = 'play';
    if (PR.mode === 2 && !siegeUp) { siegeUp = true; const c = fortAt([storm.c[0], terrainH(storm.c[0], storm.c[1]), storm.c[1]], 'stone', 3); for (let i = 0; i < 6; i++) { const b = spawnBot([c[0] + rand(-3, 3), c[1] + 4.5, c[2] + rand(-3, 3)], 5); b.name = 'Defender' + (i + 1); b.weapon = i % 2 ? 'ar' : 'shotgun'; b.weapons = [b.weapon]; b.ammo = { light: 90, medium: 120, heavy: 10, shells: 30 }; b.mats = 400; } banner('FORTRESS SIEGE', 'A STONE FORT HOLDS THE CIRCLE CENTRE · TAKE IT', 5); }
    return;
  }
  if (P.vel[1] < -22) { const d = Math.round((-P.vel[1] - 22) * 4); damage(d); info(`Fall damage -${d}`); }
}

// ---------------- HUD ----------------
const plIcon = H.pl.querySelector('canvas') as HTMLCanvasElement;
function drawIcon(skin: Skin) { const c = plIcon.getContext('2d')!; const col = (v: V3) => `rgb(${v.map(x => x * 255 | 0).join(',')})`; c.clearRect(0, 0, 16, 16); c.fillStyle = col(skin.top); c.fillRect(3, 11, 10, 5); c.fillStyle = col(skin.skin); c.fillRect(4, 3, 8, 8); c.fillStyle = col(skin.hair); c.fillRect(3, 1, 10, 3); c.fillStyle = '#000'; c.fillRect(6, 6, 1, 1); c.fillRect(10, 6, 1, 1); }
const mmCtx = (H.mm.querySelectorAll('canvas')[1] as HTMLCanvasElement).getContext('2d')!;
const mmBg = (H.mm.querySelectorAll('canvas')[0] as HTMLCanvasElement).getContext('2d')!;
const HEAD = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
let fpsN = 0, fpsT = 0, fpsV = 0, lowT = 0;
let hudN = 0;
function drawHud() {
  const heavy = (++hudN % 3) === 0;   // DOM-heavy parts at 20Hz; bars/crosshair every frame
  H.hp.querySelector('i')!.style.width = P.hp + '%'; H.hp.nextElementSibling!.textContent = String(Math.ceil(P.hp));
  H.sh.querySelector('i')!.style.width = P.shield + '%'; H.sh.nextElementSibling!.textContent = String(Math.ceil(P.shield));
  (H.pl.querySelector('.b i') as HTMLElement).style.width = P.hp + '%';
  if (heavy) H.mats.innerHTML = (['wood', 'stone', 'metal'] as Mat[]).map(m => `<div class="${P.mat === m && P.build ? 'sel' : ''}">${m === 'wood' ? '<svg viewBox="0 0 40 40"><path d="M6 30 L26 8 L34 14 L14 36 Z" fill="#e6c48a" stroke="#8a6a3a" stroke-width="1.5"/></svg>' : m === 'stone' ? '<svg viewBox="0 0 40 40"><path d="M4 22 L20 12 L36 20 L20 30 Z" fill="#c9c9c9" stroke="#666" stroke-width="1.5"/><path d="M4 22 L20 30 L20 36 L4 28 Z" fill="#a0a0a0" stroke="#666" stroke-width="1.5"/><path d="M36 20 L20 30 L20 36 L36 26 Z" fill="#8a8a8a" stroke="#666" stroke-width="1.5"/></svg>' : '<svg viewBox="0 0 40 40"><path d="M8 8 L30 8 L30 14 L18 14 L32 32 L10 32 L10 26 L22 26 Z" fill="#dfe6ee" stroke="#556" stroke-width="1.5"/></svg>'}${P.mats[m]}</div>`).join('');
  if (heavy) H.bld.innerHTML = ([['wall', 'Q', '<rect x="10" y="10" width="24" height="24" transform="skewY(-10)"/>'], ['floor', 'G', '<path d="M22 12 L38 22 L22 32 L6 22 Z"/>'], ['ramp', 'F', '<path d="M8 36 L8 30 L14 30 L14 24 L20 24 L20 18 L26 18 L26 12 L32 12 L32 8 L38 8 L38 36 Z"/>'], ['pyramid', 'Alt', '<path d="M22 8 L40 26 L22 36 L4 26 Z"/><path d="M22 8 L22 36"/>']] as [PieceType, string, string][]).map(([t, k, s]) => `<div class="${P.build && P.piece === t ? 'on' : ''}"><kbd>${k}</kbd><svg viewBox="0 0 44 44">${s}</svg></div>`).join('');
  const it = curItem();
  const slots = [`<div class="slot ${P.slot < 0 ? 'sel' : ''}">${ICON.pickaxe}<span class="k">BACKQUOTE</span></div>`].concat(P.inv.map((s, i) => {
    const rar = s ? RARITIES[s.rar] : '';
    return `<div class="slot ${rar} ${P.slot === i ? 'sel ' + (s && isWeapon(s.kind) ? 'w' : '') : ''}">${s ? ICON[s.kind] + `<span class="cnt">${isWeapon(s.kind) ? s.mag : s.count}</span>` : ''}<span class="k">${['1', '2', '3', 'MOUSE4', 'MOUSE3'][i]}</span></div>`;
  }));
  if (heavy) H.hotbar.innerHTML = slots.join('');
  H.wname.textContent = P.swim ? 'Swimming' : P.editing ? 'Editing' : it ? (isWeapon(it.kind) ? WEAPONS[it.kind]!.name : CONS[it.kind]!.name) : P.slot < 0 ? 'Pickaxe' : '';
  H.ammo.innerHTML = it && isWeapon(it.kind) ? `${P.reload > 0 ? '<small>RELOADING</small>' : it.mag} <small>/ ${P.ammo[WEAPONS[it.kind]!.ammo]}</small><span class="mg"></span>` : '';
  H.cross.className = P.build ? 'build' : ''; H.cross.style.display = (P.state === 'play' || P.state === 'island') && !P.scoped ? 'block' : 'none'; H.scope.style.display = P.scoped && !P.over ? 'block' : 'none'; H.hud.style.opacity = P.over ? '0' : '1';
  H.prog.style.display = P.useT > 0 ? 'block' : 'none'; if (P.useT > 0) H.prog.querySelector('i')!.style.width = (100 - P.useT / P.useDur * 100) + '%';
  // compass
  const deg = ((-(P.yaw * 180 / Math.PI) + 180) % 360 + 360) % 360; let ch = `<div class="hd">${Math.round(deg)}</div>`;
  for (let d = -90; d <= 90; d += 15) { const a = ((Math.round(deg / 15) * 15 + d) % 360 + 360) % 360, x = 410 + (a - deg + 540) % 360 - 180; const px = 410 + ((a - deg + 540) % 360 - 180) * 4.2; if (Math.abs(px - 410) > 420) continue; const big = a % 45 === 0; ch += `<div class="tk ${big ? 'big' : ''}" style="left:${px}px">${big ? HEAD[a / 45] : a}</div>`; }
  if (heavy) H.comp.innerHTML = ch;
  // minimap: 300px window on the 600px map (world 720 → 1.2 units/px on the big map, we zoom 2x)
  const zoom = P.state === 'play' ? 1.7 : 0.5, sx = (P.pos[0] + SIZE / 2) / SIZE * 600, sz = (P.pos[2] + SIZE / 2) / SIZE * 600, vw = 300 / zoom;
  if (heavy || hudN % 3 === 1) {
  mmBg.clearRect(0, 0, 300, 300); mmBg.fillStyle = '#7bbde9'; mmBg.fillRect(0, 0, 300, 300);
  if (P.state === 'island') { mmBg.fillStyle = '#8fd44e'; mmBg.beginPath(); mmBg.arc(150 + (ISLAND[0] - P.pos[0]) * zoom * 600 / SIZE, 150 + (ISLAND[2] - P.pos[2]) * zoom * 600 / SIZE, 62 * zoom * 600 / SIZE, 0, 6.28); mmBg.fill(); } else mmBg.drawImage(mapCv, sx - vw / 2, sz - vw / 2, vw, vw, 0, 0, 300, 300);
  const g = mmCtx; g.clearRect(0, 0, 300, 300); const toMM = (x: number, z: number): [number, number] => [150 + ((x + SIZE / 2) / SIZE * 600 - sx) * zoom, 150 + ((z + SIZE / 2) / SIZE * 600 - sz) * zoom];
  g.setLineDash([6, 6]); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(...toMM(bus.a[0], bus.a[2])); g.lineTo(...toMM(bus.b[0], bus.b[2])); g.stroke(); g.setLineDash([]);
  const sc = toMM(storm.c[0], storm.c[1]), sr = storm.r / SIZE * 600 * zoom;
  if (P.state !== 'island') {
  g.fillStyle = 'rgba(150,80,200,0.45)'; g.fillRect(0, 0, 300, 300); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(sc[0], sc[1], sr, 0, 6.28); g.fill(); g.globalCompositeOperation = 'source-over';
  g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(sc[0], sc[1], sr, 0, 6.28); g.stroke();
  }
  if (P.state === 'bus') { const [bx, bz] = toMM(bus.pos[0], bus.pos[2]); g.fillStyle = '#4fa8ff'; g.strokeStyle = '#fff'; g.beginPath(); g.rect(bx - 9, bz - 6, 18, 12); g.fill(); g.stroke(); }
  g.save(); g.translate(150, 150); g.rotate(-P.yaw + Math.PI); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -9); g.lineTo(7, 7); g.lineTo(0, 3); g.lineTo(-7, 7); g.closePath(); g.fill(); g.stroke(); g.restore();
  }
  let poi = ''; for (const p of POIS) if (Math.hypot(P.pos[0] - p.x, P.pos[2] - p.z) < p.r + 20) poi = p.name; H.mm.querySelector('.poi')!.textContent = poi;
  if (poi && P.state === 'play' && !PR.discovered.includes(poi)) { PR.discovered.push(poi); banner(poi, 'DISCOVERED · +100 XP', 3); PR.xp += 100; saveProfile(); }
  H.stats.innerHTML = `<span>🕒 ${fmt(storm.phaseT)}</span><span>👤 ${P.alive}</span><span>⚔ ${P.kills}</span>`;
  if (heavy) H.feed.innerHTML = feed.map(f => `<div style="opacity:${Math.min(1, f.t)}">${f.html}</div>`).join('');
  if (P.state === 'bus' && bus.t > 4) banner('SPACE TO JUMP', `EVERYBODY OFF. LAST STOP IN ${Math.ceil(bus.dur - bus.t)}s`, 0.2);
  H.fps.textContent = S.showFps ? fpsV + ' FPS' : '';
  let html = '';
  for (const d of bots) if (d.remote && !d.dead && d.state !== 'bus') { const s = project(add(d.pos, [0, 2.4, 0])); if (s) html += `<div class="nm" style="left:${s[0]}px;top:${s[1]}px;color:${sameTeam(NET.id, d.remote) ? '#7cf23a' : '#fff'}">${d.name}</div>`; }
  if (D.esp && !S.streamer) for (const d of bots) if (!d.dead && d.state !== 'bus') { const s = project(add(d.pos, [0, 2.4, 0])); if (s) html += `<div class="nm" style="left:${s[0]}px;top:${s[1]}px;color:#ff8">${d.name} · ${Math.ceil(d.hp + d.shield)} · ${Math.round(len(sub(d.pos, P.pos)))}m</div>`; }
  const th = P.state === 'play' ? W.raycast(camPos, camFwd, 200, botBoxes()) : null;
  if (th && th.kind === 'box') { const dm = (th.ref as { d: Bot }).d; H.tgt.textContent = `${dm.name} · ${Math.ceil(dm.hp + dm.shield)} HP · ${Math.round(th.t)}m`; H.tgt.style.display = 'block'; }
  else if (th && th.kind === 'piece' && th.t < 12) { const pc = th.ref as Piece; H.tgt.innerHTML = P.editing ? 'LMB select tiles · X / RMB confirm · R reset' : `<i style="display:inline-block;width:80px;height:6px;background:#0008;vertical-align:middle;margin-right:8px"><i style="display:block;height:100%;width:${pc.hp / pc.maxHp * 100}%;background:#7cf23a"></i></i>${Math.ceil(pc.hp)} / ${pc.maxHp} · X to edit`; H.tgt.style.display = 'block'; }
  else H.tgt.style.display = 'none';
  const cs = 52 + P.bloom * 2600 * (P.ads ? 0.5 : 1); H.cross.style.width = H.cross.style.height = cs + 'px'; H.cross.style.margin = -cs / 2 + 'px';
  for (const f of fx) if (f.kind === 'dmg') { const s = project(add(f.pos, [0, (0.9 - f.t) * 1.5, 0])); if (s) html += `<div class="dmg ${f.head ? 'head' : ''}" style="left:${s[0]}px;top:${s[1]}px;opacity:${Math.min(1, f.t * 3)}">${f.text}</div>`; }
  H.fx.innerHTML = html;
  const ws=P.weakT>0&&P.weakPos?project(P.weakPos):null; H.weak.style.display=ws?'block':'none'; if(ws){H.weak.style.left=ws[0]+'px';H.weak.style.top=ws[1]+'px';}
}

// ---------------- character drawing ----------------
type Pose = 'idle' | 'aim' | 'pick' | 'sky' | 'glide' | 'lobby' | 'build' | 'crouch' | 'emote';
const BONE_BUF = new Float32Array(10 * 16);
interface AnimIn { anim: number; speed: number; grounded: boolean; pitch: number; pose: Pose; swing?: number; held?: string | undefined; sprint?: boolean; emote?: number; pitch2?: number; }
function drawChar(ch: CharMesh, root: M4, a: AnimIn) {
  const st = ch.style, ph = a.anim, sp = clamp(a.speed / 6, 0, 1.3), s1 = Math.sin(ph), c1 = Math.cos(ph), idle = sp < 0.05 && a.grounded;
  let lean = a.sprint ? 0.32 : 0.06 + sp * 0.08, bob = a.grounded ? Math.abs(Math.sin(ph)) * 0.06 * sp : 0, drop = 0, twist = s1 * 0.12 * sp;
  // legs: thigh swing + knee bend on the back swing, high knees when sprinting
  let thL = -s1 * 0.85 * sp, thR = s1 * 0.85 * sp, shL = (Math.max(0, -c1) * 1.3 + 0.1) * sp, shR = (Math.max(0, c1) * 1.3 + 0.1) * sp;
  if (!a.grounded && a.pose !== 'sky' && a.pose !== 'glide') { thL = -0.6; thR = 0.25; shL = 1.3; shR = 1.0; }
  // arms: [upper rotX, upper rotZ(out), fore rotX(bend)]
  let uL = s1 * 0.7 * sp, uR = -s1 * 0.7 * sp, fL = -0.6 - Math.max(0, s1) * 0.5 * sp, fR = -0.6 - Math.max(0, -s1) * 0.5 * sp, zL = 0.1, zR = -0.1;
  if (idle) { const br = Math.sin(t * 1.8); uL = 0.05 + br * 0.03; uR = -0.05 - br * 0.03; fL = fR = -0.35; zL = 0.12; zR = -0.12; bob = br * 0.008; thL = thR = 0; shL = shR = 0.04; }
  if (a.pose === 'aim' || a.pose === 'build') { const p = -a.pitch * 0.6; uR = -1.35 + p; fR = -0.9; zR = -0.25; uL = -1.25 + p; fL = -1.15; zL = 0.75; }   // two-handed hold, left on the foregrip
  if (a.pose === 'pick') { const sw = a.swing && a.swing > 0 ? Math.sin(a.swing * 6.3) : 0; uR = -1.3 - sw * 1.6; fR = -0.8 + sw * 0.5; zR = 0.05; uL = -0.4; fL = -0.9; zL = 0.4; }
  if (a.pose === 'sky') { uL = uR = -2.4; zL = 1.1; zR = -1.1; fL = fR = -0.3; thL = 0.3; thR = 0.3; shL = shR = 0.2; lean = 1.25; }
  if (a.pose === 'glide') { uL = uR = -2.9; zL = 0.35; zR = -0.35; fL = fR = -0.4; thL = thR = 0.2; shL = shR = 0.3; lean = 0.15; }
  if (a.pose === 'lobby') { uL = 0.1; uR = -0.1; fL = fR = -0.35; zL = 0.18; zR = -0.18; thL = thR = shL = shR = 0; lean = 0; twist = 0; }
  let yawWig = 0;
  if (a.pose === 'emote') {   // 0 dance, 1 wave, 2 floss, 3 take the L
    const e = a.emote ?? 0, w = t * 6;
    if (e === 0) { uL = -1.6 + Math.sin(w) * 0.8; uR = -1.6 - Math.sin(w) * 0.8; zL = 0.9; zR = -0.9; fL = -1.2; fR = -1.2; thL = -0.2 + Math.sin(w) * 0.3; thR = -0.2 - Math.sin(w) * 0.3; shL = shR = 0.5; bob = Math.abs(Math.sin(w)) * 0.12; yawWig = Math.sin(w * 0.5) * 0.25; }
    else if (e === 1) { uR = -2.6; fR = -0.6 + Math.sin(w * 1.3) * 0.5; zR = -0.4; uL = 0.1; fL = -0.3; thL = thR = shL = shR = 0; }
    else if (e === 2) { const f = Math.sin(w * 1.4); uL = -0.9; uR = -0.9; fL = -0.9; fR = -0.9; zL = 0.3 + f * 0.5; zR = -0.3 + f * 0.5; yawWig = f * 0.35; thL = thR = 0; shL = shR = 0; bob = Math.abs(f) * 0.05; }
    else { uL = -2.9; fL = -1.3; zL = 0.2; uR = -0.4; fR = -1.5; zR = -0.5; thL = -0.9; thR = 0.3; shL = 1.6; shR = 0.5; drop = 0.35; yawWig = Math.sin(w) * 0.1; }
  }
  if (a.pose === 'crouch') { drop = 0.5; thL = thR = -1.15; shL = shR = 1.6; lean = 0.4; uR = -1.35 - a.pitch; fR = -0.35; uL = -1.1 - a.pitch; fL = -1.0; zL = 0.55; }
  // bone palette in the instance's local space: each joint's posed matrix times the inverse of its rest position
  const local = mul(mul(translate(0, bob - drop, 0), rotY(yawWig)), scaleM(0.93, 0.93, 0.93)), m = mul(root, local);
  const hip = mul(local, translate(0, 1.0, 0));
  const upper = mul(mul(hip, rotX(lean)), rotY(twist));                                  // torso + arms + head pivot at hips
  const bones = BONE_BUF; let bi = 0;
  const put = (j: M4, bind: V3) => { const b = mul(j, translate(-bind[0], -bind[1], -bind[2])); bones.set(b, bi * 16); bi++; };
  put(upper, BIND.upper);
  put(mul(mul(upper, translate(0, 0.66, 0)), rotX(-a.pitch * 0.5 - lean * 0.7)), BIND.head);
  const armM = (side: number, u: number, z: number, f: number) => { const sh = mul(mul(mul(upper, translate(side * 0.27, 0.5, 0)), rotZ(-side * z)), rotX(u)); const el = mul(mul(sh, translate(0, -0.31, 0)), rotX(f)); put(sh, side > 0 ? BIND.shL : BIND.shR); put(el, side > 0 ? BIND.elL : BIND.elR); return el; };
  armM(1, uL, zL, fL); const handR = mul(root, armM(-1, uR, zR, fR));
  const legM = (side: number, th: number, sh: number) => { const h = mul(mul(hip, translate(side * 0.12, 0, 0)), rotX(th)); put(h, side > 0 ? BIND.hipL : BIND.hipR); put(mul(mul(h, translate(0, -0.46, 0)), rotX(sh)), side > 0 ? BIND.kneeL : BIND.kneeR); };
  legM(1, thL, shL); legM(-1, thR, shR);
  R.drawSkinned(ch.mesh, root, bones.slice(), st);   // the palette is read at frame submit, so each character needs its own copy
  const upperW = mul(root, upper);
  if (a.held === 'pickaxe') R.draw(M.pickaxe, mul(handR, mul(translate(0, 0.05, 0.04), rotX(1.4))));
  else if (a.held) { const aiming = a.pose === 'aim' || a.pose === 'crouch'; const gm = aiming ? mul(mul(upperW, translate(-0.2, 0.36, 0.34)), mul(rotY(-0.08), rotX(-a.pitch * 0.6))) : mul(mul(upperW, translate(-0.28, -0.02, 0.2)), mul(rotY(0.45), rotX(-0.95))); R.draw(M[a.held]!, mul(gm, trs([0, 0, 0], 0, 0, 1.45))); }
  if (a.pose === 'glide') R.draw(M.glider, mul(m, translate(0, 2.6, 0.15)));
}

// ---------------- settings, lobby scaling, emotes ----------------
const SET = $('settings');
function settingsOpen(on: boolean) { SET.style.display = on ? 'block' : 'none'; if (on) { document.exitPointerLock(); syncSettingsUI(); } else if (P.state !== 'lobby' && !P.over) canvas.requestPointerLock(); H.pause.style.display = 'none'; }
function syncSettingsUI() { SET.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-s]').forEach(el => { const k = el.dataset.s as keyof typeof SDEF, v = (S as any)[k]; if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = !!v; else el.value = String(v); const val = el.parentElement?.querySelector('.val'); if (val) val.textContent = typeof v === 'number' ? (v % 1 ? v.toFixed(2) : String(v)) : ''; }); }
SET.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-s]').forEach(el => el.oninput = () => { const k = el.dataset.s as keyof typeof SDEF; (S as any)[k] = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : +el.value; const val = el.parentElement?.querySelector('.val'); if (val) val.textContent = String((S as any)[k]); });
SET.querySelectorAll<HTMLElement>('.tabs div').forEach(tb => tb.onclick = () => { SET.querySelectorAll('.tabs div').forEach(x => x.classList.toggle('on', x === tb)); SET.querySelectorAll<HTMLElement>('.page').forEach(pg => pg.classList.toggle('on', pg.dataset.p === tb.dataset.p)); });
$('setApply').onclick = () => { localStorage.setItem('fn-settings', JSON.stringify(S)); localStorage.setItem('fn-binds', JSON.stringify(IN.overrides())); settingsOpen(false); info('Settings saved'); };
// key rebinding through the engine action map: click a key cap, press the new key/button; overrides persist separately from settings
try { IN.applyOverrides(JSON.parse(localStorage.getItem('fn-binds') || '{}')); } catch {}
const keysPage = SET.querySelector<HTMLElement>('.page.keys')!;
function renderKeys() {
  keysPage.querySelectorAll('div[data-a]').forEach(el => el.remove());
  for (const [a, label] of REBINDABLE) { const row = document.createElement('div'); row.dataset.a = a; row.innerHTML = `<span>${label}</span><kbd>${bindLabel(a)}</kbd>`; keysPage.append(row); }
  keysPage.querySelectorAll<HTMLElement>('kbd').forEach(k => k.onclick = () => {
    keysPage.querySelectorAll('kbd').forEach(x => x.classList.remove('wait')); k.classList.add('wait'); k.textContent = '…';
    const a = k.parentElement!.dataset.a!;
    const done = () => { removeEventListener('keydown', onKey, true); removeEventListener('mousedown', onMouse, true); renderKeys(); };
    const onKey = (e: KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); if (e.code !== 'Escape') rebind(a, { device: 'keyboard', code: e.code }); done(); };
    const onMouse = (e: MouseEvent) => { if (e.target === k) return; e.preventDefault(); e.stopPropagation(); rebind(a, { device: 'pointer', button: e.button }); done(); };
    setTimeout(() => { addEventListener('keydown', onKey, true); addEventListener('mousedown', onMouse, true); }, 50);
  });
}
$('keysReset').onclick = () => { IN.resetBindings(); renderKeys(); };
renderKeys();
$('setReset').onclick = () => { Object.assign(S, SDEF); syncSettingsUI(); };
$('setX').onclick = () => settingsOpen(false);
$('lobbySettings').onclick = () => settingsOpen(true);
$('pSettings').onclick = (e) => { e.stopPropagation(); settingsOpen(true); };
$('pResume').onclick = (e) => { e.stopPropagation(); canvas.requestPointerLock(); };
$('pLobby').onclick = (e) => { e.stopPropagation(); toLobby(); };
function fitHud() { document.documentElement.style.setProperty('--hs', String(clamp(innerWidth / 1920 * 0.9, 0.5, 0.85))); }
addEventListener('resize', fitHud); fitHud();
function fitLobby() { const ui = document.querySelector<HTMLElement>('#lobby .ui'); if (!ui) return; const sc = Math.min(innerWidth / 1600, innerHeight / 900); ui.style.transform = `scale(${sc})`; ui.style.left = (innerWidth - 1600 * sc) / 2 + 'px'; ui.style.top = (innerHeight - 900 * sc) / 2 + 'px'; }
addEventListener('resize', fitLobby); fitLobby(); refreshLobby(); lastEmote = PR.emote; if (!PR.unlocked.includes(P.skin)) P.skin = 0;
// emotes: B opens the wheel (or repeats the last emote); bots emote when idle or after a kill
const EMOTES = ['Dance', 'Wave', 'Floss', 'Take the L'];
const EW = $('emoteWheel');
EW.querySelectorAll<HTMLElement>('[data-e]').forEach(el => el.onclick = () => { startEmote(+el.dataset.e!); EW.style.display = 'none'; canvas.requestPointerLock(); });
function startEmote(i: number) { if (P.state !== 'play' || P.dead) return; lastEmote = i; P.emote = i; P.emoteT = 4.5; P.build = false; P.editing = null; emoteJingle(i); }
function emoteJingle(i: number) { const notes = [[440, 554, 659, 880], [523, 659], [392, 494, 587, 494], [330, 262]][i]; notes!.forEach((f, n) => setTimeout(() => beep(f, 0.18, 'triangle', 0.06), n * 160)); }

// ---------------- F8 local testing panel ----------------
const dbgOpen = () => H.dbg.style.display === 'block';
function toggleDbg(on = !dbgOpen()) { H.dbg.style.display = on ? 'block' : 'none'; if (on) document.exitPointerLock(); else if (P.state !== 'lobby') canvas.requestPointerLock(); H.pause.style.display = 'none'; }
$('dbgX').onclick = () => toggleDbg(false);
$('btnRet').onclick = () => toLobby();
($('dPoi') as HTMLSelectElement).innerHTML = POIS.map((p, i) => `<option value="${i}">${p.name}</option>`).join('');
H.dbg.querySelectorAll<HTMLInputElement>('input[data-f]').forEach(el => { el.onchange = () => ((D as any)[el.dataset.f!] = el.checked); });
H.dbg.querySelectorAll<HTMLButtonElement>('button[data-a]').forEach(el => el.onclick = () => dbgAction(el.dataset.a!));
function fortAt(c: V3, mat: Mat, size = 3) {
  const base = Math.floor((c[1] + 1) / 4) * 4, cx = Math.floor(c[0] / 4) * 4 + 2, cz = Math.floor(c[2] / 4) * 4 + 2, h = size === 3 ? 2 : 3;
  for (let lvl = 0; lvl < h; lvl++) for (let i = -1; i <= 1; i++) { const y = base + lvl * 4; W.place('wall', mat, [cx + i * 4, y, cz - 6], 0); W.place('wall', mat, [cx + i * 4, y, cz + 6], 0); W.place('wall', mat, [cx - 6, y, cz + i * 4], 1); W.place('wall', mat, [cx + 6, y, cz + i * 4], 1); if (lvl === 1) W.place('floor', mat, [cx + i * 4, y, cz], 0), W.place('floor', mat, [cx + i * 4, y, cz - 4], 0), W.place('floor', mat, [cx + i * 4, y, cz + 4], 0); }
  for (const k of [World.key('wall', [cx, base, cz + 6], 0), World.key('floor', [cx, base + 4, cz], 0)]) { const p = W.pieces.get(k); if (p) W.removePiece(p); } W.place('ramp', mat, [cx, base, cz], 0);
  return [cx, base, cz] as V3;
}
function dbgAction(a: string) {
  const ahead = add(P.pos, scale(fwd(), 24)); ahead[1] = terrainH(ahead[0], ahead[2]);
  switch (a) {
    case 'sethp': P.hp = clamp(+($('dHp') as HTMLInputElement).value, 1, 100); P.shield = clamp(+($('dSh') as HTMLInputElement).value, 0, 100); break;
    case 'refill': P.mats = { wood: 999, stone: 999, metal: 999 }; P.ammo = { light: 999, medium: 999, heavy: 999, shells: 999 }; break;
    case 'loadout': P.inv = [mkItem('tac', 1, 4), mkItem('scar', 1, 4), mkItem('hunting', 1, 4), mkItem('chug', 2), mkItem('miniShield', 6)]; P.slot = 0; P.ammo = { light: 999, medium: 999, heavy: 999, shells: 999 }; P.mats = { wood: 999, stone: 999, metal: 999 }; break;
    case 'give': { const k = ($('dItem') as HTMLSelectElement).value as Kind, r = ($('dRar') as HTMLSelectElement).selectedIndex; let sl = P.inv.indexOf(null); if (sl < 0) sl = Math.max(0, P.slot); P.inv[sl] = mkItem(k, isWeapon(k) ? 1 : 3, r); P.slot = sl; if (isWeapon(k)) P.ammo[WEAPONS[k]!.ammo] += 90; break; }
    case 'tp': { const p = POIS[+($('dPoi') as HTMLSelectElement).value]; P.pos = [p!.x, terrainH(p!.x, p!.z) + 2, p!.z]; P.vel = [0, 0, 0]; if (P.state !== 'play') P.state = 'play'; break; }
    case 'bus': startMatch(); P.islandT = 27.9; toggleDbg(false); return;
    case 'storm': storm.shrinking = false; nextStormPhase(); break;
    case 'bot': { const b = spawnBot(ahead); b.enemy = 'player'; break; }
    case 'peter': { const b = spawnBot(ahead, 4); b.name = 'Peterbot1'; b.hp = 400; b.ammo = { light: 999, medium: 999, heavy: 99, shells: 99 }; b.shield = 100; b.weapon = 'shotgun'; b.weapons = ['shotgun', 'ar', 'sniper']; b.heals = 5; b.mats = 999; b.enemy = 'player'; b.skill = 1; b.aggression = 1; b.accuracy = .7; b.reaction = .12; b.seenAt = t - 1; b.mode = 'fight'; break; }
    case 'alive': P.alive = clamp(+($('dAlive') as HTMLInputElement).value, 1, 100); break;
    case 'nobots': for (const b of bots) b.dead = true; bots.length = 0; break;
    case 'cosm': info('All cosmetics unlocked'); break;
    case 'xp': info('+80,000 XP'); (document.querySelector('#xp .bar') as HTMLElement).style.background = 'linear-gradient(90deg,#c46bff,#c46bff)'; break;
    case 'win': endScreen(true); toggleDbg(false); return;
    case 'die': damage(9999, 'Test'); toggleDbg(false); return;
    case 'clear': W.clearPieces(); break;
    case 'siege': { const c = fortAt(ahead, 'stone', 3); for (let i = 0; i < 4; i++) { const b = spawnBot([c[0] + rand(-3, 3), c[1] + 4.5, c[2] + rand(-3, 3)]); b.name = 'Defender' + (i + 1); b.weapon = i % 2 ? 'ar' : 'shotgun'; b.weapons = [b.weapon]; } for (let i = 0; i < 4; i++) { const a = i / 4 * 6.28; const b = spawnBot([c[0] + Math.cos(a) * 30, c[1] + 1, c[2] + Math.sin(a) * 30]); b.name = 'Raider' + (i + 1); b.weapon = 'ar'; b.weapons = ['ar']; b.target = c; } banner('FORTRESS SIEGE', 'DEFENDERS VS RAIDERS', 4); break; }
    case 'meteor': event = 'meteor'; eventT = 40; banner('METEOR SHOWER', 'TAKE COVER', 4); break;
    case 'edit': { const base = Math.floor((ahead[1] + 1) / 4) * 4, cx = Math.floor(ahead[0] / 4) * 4 + 2, cz = Math.floor(ahead[2] / 4) * 4 + 2; for (let i = 0; i < 6; i++) { W.place('floor', 'wood', [cx, base + 4 + i * 4, cz + i * 4], 0); W.place('ramp', 'wood', [cx, base + i * 4, cz + i * 4], 0); W.place('wall', 'wood', [cx - 2, base + i * 4, cz + i * 4], 1); W.place('wall', 'wood', [cx + 2, base + i * 4, cz + i * 4], 1); W.place('wall', 'wood', [cx, base + i * 4 + 4, cz + i * 4 + 2], 0); } banner('EDIT PRACTICE', 'BUILD YOUR WAY UP', 4); break; }
    case 'stop': event = null; meteors.length = 0; banner('EVENT STOPPED', '', 2); break;
    case 'supply': for (let i = 0; i < 6; i++) drops.push({ pos: [P.pos[0] + rand(-50, 50), 130 + rand(0, 30), P.pos[2] + rand(-50, 50)], landed: false }); banner('SUPPLY DROP PARTY', '6 DROPS INCOMING', 4); break;
    case 'skydive': P.pos = [P.pos[0], terrainH(P.pos[0], P.pos[2]) + 300, P.pos[2]]; P.vel = [0, 0, 0]; P.state = 'sky'; toggleDbg(false); return;
  }
  info(a.toUpperCase() + ' ✓');
}
function explode(pos: V3, by: string, kind: Kind = 'grenade', visual = false) {
  if (visual) { beep(50, 0.5, 'sawtooth', 0.25, -30, pos); fx.push({ kind: 'dmg', t: 0.8, pos: add(pos, [0, 1.5, 0]), text: 'BOOM', head: true }); return; }
  if (kind === 'boogie') {   // everyone nearby dances for 5s
    beep(600, 0.4, 'triangle', 0.1, 400); fx.push({ kind: 'dmg', t: 0.8, pos: add(pos, [0, 1.5, 0]), text: 'BOOGIE', head: true });
    if (len(sub(P.pos, pos)) < 6 && !P.dead) { P.emote = 0; P.emoteT = 5; P.stunT = 5; }
    for (const b of bots) if (!b.dead && len(sub(b.pos, pos)) < 6) { b.emote = 0; b.emoteT = 5; b.stunT = 5; }
    return;
  }
  if (kind === 'impulse') {   // knockback, no damage
    beep(300, 0.3, 'sine', 0.1, -200); fx.push({ kind: 'dmg', t: 0.6, pos: add(pos, [0, 1.5, 0]), text: 'WHOOSH', head: false });
    const push = (e: { pos: V3; vel: V3; grounded: boolean }) => { const d = sub(add(e.pos, [0, 1, 0]), pos), L = len(d); if (L < 7) { const k = 26 * (1 - L / 7) + 8; e.vel = add(e.vel, add(scale(norm(d), k), [0, k * 0.6, 0])); e.grounded = false; } };
    push(P); for (const b of bots) if (!b.dead) push(b);
    return;
  }
  beep(50, 0.5, 'sawtooth', 0.25, -30, pos); fx.push({ kind: 'dmg', t: 0.8, pos: add(pos, [0, 1.5, 0]), text: 'BOOM', head: true }); rumble(300, 0.8, 1);
  const dmg = (d: number) => Math.round(100 * clamp(1 - d / 5, 0, 1));
  const dp = len(sub(P.pos, pos)); if (dp < 5 && dmg(dp) > 0 && !(NET.active() && !NET.isHost())) damage(dmg(dp), by);
  for (const b of bots) if (!b.dead) { const d = len(sub(b.pos, pos)); if (d < 5 && dmg(d) > 0) { botDamage(b, dmg(d), by); if (by === 'Player') P.dmg += dmg(d); } }
  for (const p of [...W.pieces.values()]) if (len(sub(p.pos, pos)) < 5) W.damagePiece(p, 200);
}
function updateNades(dt: number) {
  for (let i = nades.length - 1; i >= 0; i--) {
    const n = nades[i]; n!.t -= dt;
    if (n!.rocket) {   // straight flight, detonates on anything it touches
      const L = len(n!.vel) * dt, h = W.raycast(n!.pos, norm(n!.vel), L, botBoxes().filter(b => n!.by !== (b.ref as { d: Bot }).d.name));
      const hitP = h ? h.p : null, self = n!.by === 'Player' && len(sub(n!.pos, P.pos)) < 1.5;
      if (hitP || (n!.by !== PR.name && len(sub(n!.pos, P.pos)) < 1.2) || n!.t <= 0) { explode(hitP ?? n!.pos, n!.by, 'grenade', n!.visual); nades.splice(i, 1); continue; }
      n!.pos = add(n!.pos, scale(n!.vel, dt)); if (self) {} continue;
    }
    n!.vel[1] -= 20 * dt;
    const next = add(n!.pos, scale(n!.vel, dt)), g = W.groundH(next[0], next[2], next[1]);
    if (next[1] <= g) { next[1] = g; n!.vel = [n!.vel[0] * 0.5, -n!.vel[1] * 0.35, n!.vel[2] * 0.5]; }
    else if (W.solids(next[0], next[2], 3).some(b => next[0] > b.min[0] && next[0] < b.max[0] && next[1] > b.min[1] && next[1] < b.max[1] && next[2] > b.min[2] && next[2] < b.max[2])) { n!.vel = scale(n!.vel, -0.3); }
    else n!.pos = next;
    if (next[1] <= g) n!.pos = next;
    if (n!.t <= 0) { explode(n!.pos, n!.by, n!.kind, n!.visual); nades.splice(i, 1); }
  }
}
function updateEvents(dt: number) {
  if (P.state === 'play' && !P.over) { P.nextDrop -= dt; if (P.nextDrop <= 0) { P.nextDrop = 110; const a = rand(0, 6.28), rr = rand(0, storm.r * 0.6); drops.push({ pos: [storm.c[0] + Math.cos(a) * rr, 160, storm.c[1] + Math.sin(a) * rr], landed: false }); banner('SUPPLY DROP', 'INCOMING', 4); } }
  for (const d of drops) if (!d.landed) { d.pos[1] -= 6 * dt; const g = terrainH(d.pos[0], d.pos[2]); if (d.pos[1] <= g) { d.pos[1] = g; d.landed = true; chests.push({ pos: [...d.pos] as V3, yaw: 0, open: false, drop: true }); } }
  if (event === 'meteor') { eventT -= dt; if (eventT <= 0) event = null; if (Math.random() < dt * 1.5) meteors.push({ pos: [P.pos[0] + rand(-60, 60), 140, P.pos[2] + rand(-60, 60)], vel: [rand(-8, 8), -45, rand(-8, 8)] }); }
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i]; m!.pos = add(m!.pos, scale(m!.vel, dt));
    if (m!.pos[1] <= W.groundH(m!.pos[0], m!.pos[2], m!.pos[1]) + 0.5) {
      meteors.splice(i, 1); beep(60, 0.5, 'sawtooth', 0.2, -30, m!.pos); fx.push({ kind: 'dmg', t: 1, pos: add(m!.pos, [0, 2, 0]), text: 'BOOM', head: true });
      if (len(sub(P.pos, m!.pos)) < 8) damage(40, 'A meteor');
      for (const b of bots) if (!b.dead && len(sub(b.pos, m!.pos)) < 8) botDamage(b, 60, 'A meteor');
      for (const p of [...W.pieces.values()]) if (len(sub(p.pos, m!.pos)) < 8) W.removePiece(p);
    }
  }
}

// ---------------- bot AI ----------------
// Bots perceive (FOV + LOS + reaction), remember, and pick a mode each tick; skilled/aggressive ones crank 90s,
// box up, and edit windows/doors to peek. They loot building interiors, heal, and rotate with the storm.
const BOT_W: Record<string, [number, number, number, number]> = { ar: [0.26, 21, 70, 22], scar: [0.26, 24, 75, 22], burst: [0.3, 21, 70, 22], smg: [0.11, 11, 40, 14], pistol: [0.22, 16, 45, 16], shotgun: [0.9, 58, 14, 6], tac: [0.5, 42, 14, 7], sniper: [1.8, 85, 220, 45], hunting: [1.4, 72, 180, 40], rpg: [3.0, 95, 120, 30], revolver: [1.0, 40, 50, 14], silenced: [0.24, 18, 45, 16] };  // [cooldown, dmg, effective range, preferred distance]
function los(a: V3, b: V3) { const d = sub(b, a), L = len(d); const h = W.raycast(a, norm(d), L); return !h || h.t >= L - 0.5; }
const cellOf = (x: number, z: number): V3 => [Math.floor(x / 4) * 4 + 2, 0, Math.floor(z / 4) * 4 + 2];
const dirVec = (d: number): V3 => [Math.sin(d * Math.PI / 2), 0, Math.cos(d * Math.PI / 2)];
const yawToDir = (yaw: number) => ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4;
function botMat(b: Bot): Mat { return b.mats > 260 ? 'metal' : b.mats > 120 ? 'stone' : 'wood'; }
function botPlace(b: Bot, type: PieceType, pos: V3, dir: number): Piece | null {
  if (b.mats < 10 && !D.infMats) return null;
  const p = W.place(type, botMat(b), pos, dir); if (p) { b.mats -= 10; b.buildCd = lerp(0.42, 0.09, b.skill); if (Math.random() < 0.1) botHear(pos, 40, b); }
  return p;
}
function bestWeaponFor(b: Bot, dist: number): Kind | null {
  const usable = b.weapons.filter(w => b.ammo[WEAPONS[w]!.ammo] > 0); if (!usable.length) return null;
  let best = usable[0], bs = 1e9;
  for (const w of usable) { const pref = BOT_W[w]?.[3] ?? 20, score = Math.abs(dist - pref) / pref; if (score < bs) { bs = score; best = w; } }
  return best!;
}
function botHear(pos: V3, radius: number, who: Bot | 'player') {   // gunfire: bots nearby get a fuzzy memory and investigate (aggressive) or get wary
  for (const b of bots) if (!b.dead && b.state === 'ground' && b !== who && !b.enemy && len(sub(b.pos, pos)) < radius) { if (Math.random() < 0.5 + b.aggression * 0.5) { b.memory = [pos[0] + rand(-6, 6), pos[1], pos[2] + rand(-6, 6)]; b.memoryT = t; if (b.aggression > 0.45 && b.weapon) b.mode = 'hunt'; } }
}
function updateBot(b: Bot, dt: number) {
  if (b.dead) return;
  b.anim += dt * Math.hypot(b.vel[0], b.vel[2]) * 1.6; b.fireCd -= dt; b.buildCd -= dt; b.retarget -= dt; b.voiceCd -= dt; b.peekT -= dt; b.lootT -= dt;
  if (b.stunT > 0) { b.stunT -= dt; b.emoteT = Math.max(b.emoteT, 0.1); b.vel[0] *= 0.8; b.vel[2] *= 0.8; b.vel[1] -= 26 * dt; b.grounded = false; moveEntity(b, 1.75, dt); return; }
  if (b.emoteT > 0) { b.emoteT -= dt; b.vel[0] *= 0.8; b.vel[2] *= 0.8; if (b.enemy || t - b.lastHit < 2) b.emoteT = 0; }
  if (b.state === 'island') {
    if (P.islandT < b.joinT) { b.pos[1] = -50; return; }   // not joined yet
    b.vel[1] -= 26 * dt; b.wanderT -= dt;
    if (!b.target || b.wanderT <= 0 || len(sub(b.target, b.pos)) < 2) { b.wanderT = rand(3, 8); const a = rand(0, 6.28), rr = rand(5, 35); b.target = [ISLAND[0] + Math.cos(a) * rr, 0, ISLAND[2] + Math.sin(a) * rr]; if (Math.random() < 0.25) { b.emoteT = rand(3, 6); b.emote = Math.floor(rand(0, 4)); } }
    if (b.emoteT > 0) { b.emoteT -= dt; b.vel[0] *= 0.8; b.vel[2] *= 0.8; } else { const dx = b.target[0] - b.pos[0], dz = b.target[2] - b.pos[2], L = Math.hypot(dx, dz); if (L > 0.5) { b.yaw = Math.atan2(dx, dz); b.vel[0] = lerp(b.vel[0], dx / L * 5, 0.1); b.vel[2] = lerp(b.vel[2], dz / L * 5, 0.1); } if (b.grounded && Math.random() < dt * 0.3) b.vel[1] = 9; }
    if (!b.weapon) { b.weapon = 'ar'; b.weapons = ['ar']; }
    if (Math.random() < dt * 0.4 && len(sub(b.pos, P.pos)) < 60) { const o = bots[Math.floor(rand(0, bots.length))]; if (o !== b && o!.state === 'island' && P.islandT >= o!.joinT) { fx.push({ kind: 'tracer', t: 0.06, pos: add(b.pos, [0, 1.5, 0]), to: add(o!.pos, [0, 1.2, 0]) }); beep(200, 0.08, 'sawtooth', 0.02, -60); } }
    b.grounded = false; moveEntity(b, 1.75, dt); return;
  }
  if (b.state === 'bus') { b.pos = [...bus.pos] as V3; if (bus.t > b.dropT || bus.t >= bus.dur) { b.state = 'sky'; b.vel = [Math.sin(bus.yaw) * 8, -10, Math.cos(bus.yaw) * 8]; } return; }
  const gAbove = b.pos[1] - W.groundH(b.pos[0], b.pos[2], b.pos[1]);
  const fw: V3 = [Math.sin(b.yaw), 0, Math.cos(b.yaw)], side: V3 = [-Math.cos(b.yaw), 0, Math.sin(b.yaw)];
  /** steer toward a point with obstacle avoidance; returns horizontal distance */
  const toward = (tgt: V3, spd: number, face = true) => {
    const dx = tgt[0] - b.pos[0], dz = tgt[2] - b.pos[2], L = Math.hypot(dx, dz);
    if (L < 0.5) { b.vel[0] *= 0.8; b.vel[2] *= 0.8; return L; }
    let dir: V3 = [dx / L, 0, dz / L];
    if (b.state === 'ground') {   // obstacle probe at chest height (every 0.15s); try 45° left/right, else jump
      b.probeT -= dt;
      if (b.probeT <= 0) {
        b.probeT = 0.15; b.probeDir = null;
        const eye = add(b.pos, [0, 1.0, 0]), blocked = (dv: V3) => { const h = W.raycast(eye, dv, 2.2); return h && h.kind !== 'terrain'; };
        if (blocked(dir)) { const l: V3 = norm([dir[0] * 0.7 - dir[2] * 0.7, 0, dir[2] * 0.7 + dir[0] * 0.7]), r: V3 = norm([dir[0] * 0.7 + dir[2] * 0.7, 0, dir[2] * 0.7 - dir[0] * 0.7]); if (!blocked(l)) b.probeDir = l; else if (!blocked(r)) b.probeDir = r; else if (b.grounded) b.vel[1] = 9; }
      }
      if (b.probeDir) dir = b.probeDir;
    }
    if (face) b.yaw = Math.atan2(dir[0], dir[2]);
    b.vel[0] = lerp(b.vel[0], dir[0] * spd, 0.12); b.vel[2] = lerp(b.vel[2], dir[2] * spd, 0.12); return L;
  };
  if (b.state === 'sky') { b.vel[1] = Math.max(b.vel[1] - 30 * dt, -40); toward(b.land, 18); if (gAbove < 40 + b.skill * 30) b.state = 'glide'; }
  else if (b.state === 'glide') { b.vel[1] = lerp(b.vel[1], -5.5, 0.05); toward(b.land, 11); }
  else {
    b.vel[1] -= 26 * dt;
    // ---------- perception ----------
    if (b.retarget <= 0) {
      b.retarget = lerp(0.5, 0.15, b.skill); let found: Bot | 'player' | null = null, best = 95;
      const eye = add(b.pos, [0, 1.6, 0]);
      const visible = (p: V3, d: number) => { const v = norm(sub(p, eye)); const facing = v[0] * fw[0] + v[2] * fw[2]; if (facing < 0.25 && d > 9) return false; if (Math.random() > clamp(1.4 - d / 95, 0.15, 1)) return false; return los(eye, add(p, [0, 1.2, 0])); };
      if (!P.dead && P.state === 'play') { const d = len(sub(P.pos, b.pos)); if (d < best && !(P.bush && d > 10 && t - lastShot > 3) && visible(P.pos, d)) { best = d; found = 'player'; } }
      for (const o of bots) if (o !== b && !o.dead && o.state === 'ground') { const d = len(sub(o.pos, b.pos)); if (d < best && visible(o.pos, d)) { best = d; found = o; } }
      if (found) { if (b.enemy !== found) { b.seenAt = t; if (Math.random() < .16) botVoice(b); } b.enemy = found; b.lastSeen = t; const q = found === 'player' ? P.pos : found.pos; b.memory = [...q] as V3; b.memoryT = t; if (b.mode !== 'crank' && b.mode !== 'box' && b.mode !== 'heal' && b.mode !== 'rush') b.mode = 'fight'; }
      else if (b.enemy && t - b.lastSeen > lerp(2.5, 5, b.skill)) { b.enemy = null; b.mode = b.memory && b.aggression > 0.35 ? 'hunt' : 'loot'; b.crank = null; }
      if (b.enemy && (b.enemy === 'player' ? P.dead : b.enemy.dead)) { b.enemy = null; b.mode = 'loot'; b.crank = null; }
      if (Math.random() < 0.3) b.strafe = -b.strafe;
      if (b.memory && t - b.memoryT > 14) b.memory = null;
    }
    const ep = b.enemy === 'player' ? P.pos : b.enemy ? b.enemy.pos : null;
    const hpTotal = b.hp + b.shield, underFire = t - b.lastHit < 2.5;
    // ---------- mode selection ----------
    if (b.mode !== 'heal' && hpTotal < 45 && b.heals > 0 && (!ep || len(sub(ep, b.pos)) > 14 || b.skill > 0.6)) { b.mode = 'heal'; b.healT = 0; b.boxAt = null; }
    else if (b.mode !== 'heal' && !ep && t - b.lastHit > 6 && b.heals > 1 && (b.shield < 50 || b.hp < 70) && Math.random() < dt * 0.3) { b.mode = 'heal'; b.healT = 0; b.boxAt = null; }   // top up out of combat
    if (ep && b.weapon && b.mode !== 'heal') {
      const L = len(sub(ep, b.pos)), higher = ep[1] > b.pos[1] + 2.5;
      if (b.mode === 'fight' && hpTotal < 50 && b.aggression < 0.5 && L > 25 && !underFire) { b.mode = 'loot'; b.enemy = null; const away = norm(sub(b.pos, ep)); b.target = add(b.pos, scale(away, 40)); }   // cautious and hurt: disengage before it's a fight
      const wantsCrank = b.cracked && b.skill > 0.55 && L < 46 && (b.aggression > 0.6 || higher) && (b.mats >= 60 || D.infMats);
      if (b.mode === 'fight' && wantsCrank && Math.random() < dt * (0.6 + b.aggression)) { b.mode = 'crank'; b.crank = { c: cellOf(b.pos[0], b.pos[2]), L: Math.floor((b.pos[1] + 1) / 4) * 4, d: yawToDir(Math.atan2(ep[0] - b.pos[0], ep[2] - b.pos[2])), t: 0, steps: 0 }; }
      else if (b.mode === 'fight' && underFire && b.skill > 0.35 && b.mats >= 50 && Math.random() < dt * (b.cracked ? 2.5 : 0.6)) b.mode = 'box';
      else if (b.cracked && b.mode === 'fight' && b.aggression > 0.7 && b.skill > 0.45 && L < 30 && !higher && Math.random() < dt * 0.4 && b.mats >= 40) b.mode = 'rush';
    }
    if (!ep && (b.mode === 'fight' || b.mode === 'crank' || b.mode === 'rush')) { b.mode = b.memory ? 'hunt' : 'loot'; b.crank = null; }
    const enemyArmed = b.enemy === 'player' ? (P.slot >= 0 && !!P.inv[P.slot] && isWeapon(P.inv[P.slot]!.kind)) : !!(b.enemy && b.enemy.weapon);
    const fleeing = !!(ep && !b.weapon && enemyArmed && len(sub(ep, b.pos)) < 25);
    if (fleeing) { const away = norm(sub(b.pos, ep!)); toward(add(b.pos, scale(away, 20)), 7.5); b.mode = 'loot'; }
    else if (ep && hpTotal < 30 && b.heals <= 0 && b.mode !== 'box' && b.aggression < 0.85) {   // hurt with nothing to heal: wall off and break line of sight
      if (b.buildCd <= 0 && b.mats >= 10) { const d = yawToDir(Math.atan2(ep[0] - b.pos[0], ep[2] - b.pos[2])), f = dirVec(d), c = cellOf(b.pos[0], b.pos[2]); botPlace(b, 'wall', [c[0] + f[0] * 2, Math.floor((b.pos[1] + 1) / 4) * 4, c[2] + f[2] * 2], d); }
      const away = norm(sub(b.pos, ep)); toward(add(b.pos, scale(away, 25)), 7.5); b.mode = 'loot'; b.crank = null;
    }
    // ---------- act ----------
    const [cd, dmg, rng] = (BOT_W[b.weapon ?? 'ar'] ?? BOT_W.ar)!;
    const aimAndShoot = (L: number) => {
      const d = sub(ep!, b.pos), desiredYaw = Math.atan2(d[0], d[2]), desiredPitch = Math.atan2(d[1], Math.hypot(d[0], d[2]));
      const yawErr = Math.atan2(Math.sin(desiredYaw - b.yaw), Math.cos(desiredYaw - b.yaw)), turnRate = lerp(2.4, 7, b.skill);
      b.yaw += clamp(yawErr, -turnRate * dt, turnRate * dt); b.pitch = lerp(b.pitch, desiredPitch, 1 - Math.exp(-lerp(4, 12, b.skill) * dt));
      const want = bestWeaponFor(b, L); if (want && want !== b.weapon && b.fireCd <= 0.1) { b.weapon = want; b.fireCd = 0.5; b.shots = 0; }
      if (!b.weapon || b.ammo[WEAPONS[b.weapon]!.ammo] <= 0) { if (!want) { b.mode = 'loot'; b.lootT = 0; } return; }   // dry: go find ammo
      if (t - b.seenAt < b.reaction || b.fireCd > 0 || L > rng * 1.6 || Math.abs(yawErr) > lerp(0.22, 0.05, b.skill)) return;
      if (!los(add(b.pos, [0, 1.5, 0]), add(ep!, [0, 1.2, 0])) && !los(add(b.pos, [0, 1.5, 0]), add(ep!, [0, 0.5, 0]))) return;   // no line of sight: no shot (walls are walls)
      b.fireCd = cd * rand(0.9, 1.5) * (b.enemy === 'player' ? 1 : 1.4); b.ammo[WEAPONS[b.weapon!]!.ammo]--;
      if (++b.shots >= (WEAPONS[b.weapon!]?.mag ?? 30)) { b.shots = 0; b.fireCd = (WEAPONS[b.weapon!]?.reload ?? 2.5) * lerp(1.2, 0.8, b.skill); if (b.skill > 0.5 && b.mats >= 10 && b.mode === 'fight') b.mode = 'box'; }   // reload: skilled bots wall up for it
      const acc = clamp(b.accuracy - L / (rng * 3.4) - (Math.hypot(b.vel[0], b.vel[2]) > 4 ? 0.08 : 0), 0.06, 0.7) * (b.weapon === 'sniper' ? 0.8 : 1) * (b.enemy === 'player' ? 0.85 : 0.55);
      if (Math.random() < 0.2) b.aimDrift = [rand(-1.5, 1.5), rand(-.75, .75), rand(-1.5, 1.5)];
      const from = add(b.pos, [0, 1.5, 0]), to = add(add(ep!, [0, 1.2 + rand(-0.45, 0.45), 0]), scale(b.aimDrift, clamp(L / 45, .15, 1)));
      if (L < 10 && b.cracked && !los(from, to)) {   // enemy boxed up close: chew through the piece in the way
        const h = W.raycast(from, norm(sub(to, from)), L); if (h && h.kind === 'piece') { W.damagePiece(h.ref as Piece, dmg * 2); fx.push({ kind: 'tracer', t: 0.06, pos: from, to: h.p }); fx.push({ kind: 'puff', t: 0.22, pos: h.p, col: [0.9, 0.85, 0.7] }); botHear(b.pos, 60, b); return; }
      }
      if (ep![1] > b.pos[1] + 3 && L < 22 && b.cracked && Math.random() < 0.35) {   // enemy above: shoot out the piece holding them up
        let low: Piece | null = null; for (const p of W.pieces.values()) if ((p.type === 'ramp' || p.type === 'floor') && len(sub(p.pos, ep!)) < 4.5 && (!low || p.pos[1] < low.pos[1])) low = p;
        if (low) { W.damagePiece(low, dmg * 1.5); fx.push({ kind: 'tracer', t: 0.06, pos: from, to: add(low.pos, [0, 0.5, 0]) }); botHear(b.pos, 60, b); return; }
      }
      if (b.weapon === 'rpg') { nades.push({ pos: add(from, scale(norm(sub(to, from)), 1.2)), vel: scale(norm(add(to, [rand(-2, 2) * (1 - b.accuracy), 0, rand(-2, 2) * (1 - b.accuracy)]).map((v, i) => v - from[i]!) as V3), 34), t: 6, by: b.name, rocket: true }); botHear(b.pos, 80, b); return; }
      const hit = Math.random() < acc && los(from, to);
      const tto = hit ? to : add(to, [rand(-3, 3), rand(-2, 2), rand(-3, 3)]); fx.push({ kind: 'tracer', t: 0.06, pos: from, to: tto }); if (len(sub(tto, P.pos)) < 30) { const hh = W.raycast(from, norm(sub(tto, from)), len(sub(tto, from)) + 4); if (hh) fx.push({ kind: 'puff', t: 0.22, pos: hh.p, col: [0.75, 0.65, 0.5] }); }
      if (hit) { const head = Math.random() < b.skill * 0.18, n = Math.round(dmg * rand(0.8, 1.1) * (head ? 1.5 : 1)); if (b.enemy === 'player') { damage(n, b.name); if (head) info('Headshot!'); } else botDamage(b.enemy as Bot, n, b.name); }
      else if (!hit && !los(from, to)) { const h = W.raycast(from, norm(sub(to, from)), L); if (h && h.kind === 'piece') W.damagePiece(h.ref as Piece, dmg); }
      botHear(b.pos, 60, b);
      if (len(sub(b.pos, P.pos)) < 140) beep(200, 0.08, 'sawtooth', 0.05, -60, b.pos);
    };
    if (fleeing || (ep && hpTotal < 30 && b.heals <= 0 && b.mode !== 'box' && b.aggression < 0.85)) { /* fleeing handled above */ }
    else if (b.mode === 'fight' && ep) {
      const L = len(sub(ep, b.pos)), pref = BOT_W[b.weapon ?? 'ar']?.[3] ?? 20;
      aimAndShoot(L);
      const want = add(scale(side, b.strafe * lerp(2, 4, b.skill)), scale(fw, L > pref * 1.3 ? 4.5 : L < pref * 0.6 ? -3 : 0));
      b.vel[0] = lerp(b.vel[0], want[0], 0.1); b.vel[2] = lerp(b.vel[2], want[2], 0.1);
      if (b.grounded && Math.random() < dt * b.skill * 0.6) b.vel[1] = 9;   // jump-peeks
      if (b.nades > 0 && L > 8 && L < 30 && Math.random() < dt * 0.12 * (1 + b.aggression)) { b.nades--; const to = sub(ep, b.pos), tl = len(to); nades.push({ pos: add(b.pos, [0, 1.6, 0]), vel: add(scale(norm(to), Math.min(20, tl * 0.9)), [0, 6 + tl * 0.15, 0]), t: 2.5, by: b.name }); }
      // quick reactive wall when tagged
      if (underFire && b.buildCd <= 0 && b.skill > 0.3 && b.mats >= 10 && Math.random() < dt * (b.cracked ? 4 : 0.8)) { const d = yawToDir(Math.atan2(ep[0] - b.pos[0], ep[2] - b.pos[2])), f = dirVec(d), c = cellOf(b.pos[0], b.pos[2]), L0 = Math.floor((b.pos[1] + 1) / 4) * 4; botPlace(b, 'wall', [c[0] + f[0] * 2, L0, c[2] + f[2] * 2], d); if (b.cracked) botPlace(b, 'ramp', [c[0], L0, c[2]], d); }
    }
    else if (b.mode === 'crank' && ep && b.crank) {
      // spiral 90s: floor under, ramp in the next cell (turned), side walls, climb, repeat
      const k = b.crank, f = dirVec(k.d), r = dirVec((k.d + 1) % 4), rc: V3 = [k.c[0] + f[0] * 4, k.L, k.c[2] + f[2] * 4];
      if (k.t === 0 && b.buildCd <= 0) {
        botPlace(b, 'floor', [k.c[0], k.L, k.c[2]], 0); botPlace(b, 'ramp', rc, k.d);
        botPlace(b, 'wall', [rc[0] + f[0] * 2, k.L, rc[2] + f[2] * 2], k.d); botPlace(b, 'wall', [rc[0] + r[0] * 2, k.L, rc[2] + r[2] * 2], (k.d + 1) % 4); botPlace(b, 'wall', [rc[0] - r[0] * 2, k.L, rc[2] - r[2] * 2], (k.d + 1) % 4);
        if (b.skill > 0.75) botPlace(b, 'wall', [k.c[0] - f[0] * 2, k.L, k.c[2] - f[2] * 2], k.d);
        k.t = 0.01; b.vel[1] = Math.max(b.vel[1], 8.5);
      }
      k.t += dt;
      const top: V3 = [rc[0] + f[0] * 1.6, k.L + 4, rc[2] + f[2] * 1.6];
      const L2 = toward(top, lerp(6, 9.5, b.skill), false);
      const L = len(sub(ep, b.pos)); aimAndShoot(L);
      if (b.pos[1] > k.L + 3.4 && L2 < 1.2) { k.c = rc; k.L += 4; k.d = (k.d + 1) % 4; k.t = 0; k.steps++; }
      else if (k.t > 2.6) { k.t = 0; k.c = cellOf(b.pos[0], b.pos[2]); k.L = Math.floor((b.pos[1] + 1) / 4) * 4; }   // fell off / blocked: restart from where we are
      if (b.pos[1] > ep[1] + 7 || k.steps > 6 || (b.mats < 20 && !D.infMats)) { botPlace(b, 'floor', [k.c[0], k.L, k.c[2]], 0); b.mode = 'fight'; b.crank = null; }
    }
    else if (b.mode === 'rush' && ep) {
      // ramp rush: stairs forward toward the enemy, shooting on the way
      const L = len(sub(ep, b.pos)); aimAndShoot(L);
      const d = yawToDir(Math.atan2(ep[0] - b.pos[0], ep[2] - b.pos[2])), f = dirVec(d), c = cellOf(b.pos[0] + f[0] * 2.5, b.pos[2] + f[2] * 2.5), L0 = Math.floor((b.pos[1] + 1) / 4) * 4;
      if (b.buildCd <= 0) { botPlace(b, 'ramp', [c[0], L0, c[2]], d); botPlace(b, 'floor', [c[0], L0, c[2]], 0); }
      toward([c[0] + f[0] * 1.8, L0 + 4, c[2] + f[2] * 1.8], 7, false);
      if (L < 9 || b.mats < 20 || Math.random() < dt * 0.25) b.mode = 'fight';
    }
    else if (b.mode === 'box' || b.mode === 'heal') {
      // box up: 4 walls + roof at the current cell; peek-edit the wall facing the enemy while healthy, heal while hurt
      const c = cellOf(b.pos[0], b.pos[2]), L0 = Math.floor((b.pos[1] + 1) / 4) * 4;
      if (!b.boxAt || len(sub(b.boxAt, c)) > 1) { b.boxAt = c; b.peekWall = null; }
      if (b.buildCd <= 0) { for (let d = 0; d < 4; d++) { const f = dirVec(d); botPlace(b, 'wall', [c[0] + f[0] * 2, L0, c[2] + f[2] * 2], d); } botPlace(b, 'floor', [c[0], L0 + 4, c[2]], 0); botPlace(b, 'floor', [c[0], L0, c[2]], 0); }
      toward([c[0], L0, c[2]], 4, false); b.vel[0] *= 0.7; b.vel[2] *= 0.7;
      if (b.mode === 'heal') {
        b.healT += dt; b.yaw += dt * 0.6;
        if (b.healT > 4) { b.healT = 0; b.heals--; if (b.shield < 100 && Math.random() < 0.5) b.shield = Math.min(100, b.shield + 50); else b.hp = Math.min(100, b.hp + 50); if (hpTotal + 50 >= 90 || b.heals <= 0) b.mode = ep ? 'fight' : 'loot'; }
      } else if (ep) {
        const L = len(sub(ep, b.pos)), d = yawToDir(Math.atan2(ep[0] - b.pos[0], ep[2] - b.pos[2])), f = dirVec(d);
        const wall = W.pieces.get(World.key('wall', [c[0] + f[0] * 2, L0, c[2] + f[2] * 2], d)) ?? null;
        if (wall && b.cracked && b.peekT <= 0) {   // toggle window: open to shoot, close to reset
          const open = wall.edit === 0; wall.edit = open ? 1 << 4 : 0; b.peekWall = wall; b.peekT = open ? lerp(1.2, 0.7, b.skill) : lerp(1.4, 0.5, b.skill);
          if (open && b.skill > 0.7 && Math.random() < 0.3) wall.edit = 1 << 1;   // door edit for a shotgun push
        }
        if (wall && wall.edit) aimAndShoot(L);
        if (!underFire && t - b.lastHit > 4 && Math.random() < dt * (0.3 + b.aggression * 0.6)) { if (b.peekWall) b.peekWall.edit = 0; b.mode = b.aggression > 0.6 ? 'crank' : 'fight'; if (b.mode === 'crank') b.crank = { c, L: L0, d, t: 0, steps: 0 }; }
      } else if (t - b.lastHit > 3) { if (b.peekWall) b.peekWall.edit = 0; b.mode = 'loot'; }
    }
    else {
      // ---------- non-combat: hunt / loot / rotate / roam ----------
      b.pitch = lerp(b.pitch, 0, 0.1);
      const sc = storm.shrinking ? storm.to.c : storm.c, srad = storm.shrinking ? storm.to.r : storm.r;
      const out = Math.hypot(b.pos[0] - sc[0], b.pos[2] - sc[1]) > srad * (storm.shrinking ? 0.85 : 0.9);
      let chest: typeof chests[number] | null = null, cdist = b.weapon ? 30 : 120;
      for (const c of chests) if (!c.open && !b.ignore.has(c)) { const d = len(sub(c.pos, b.pos)); if (d < cdist) { cdist = d; chest = c; } }
      // give up on a chest/item we can't reach (inside a room we can't path into) after 8s and ignore it
      const tgt = chest ?? null; if (tgt && tgt === b.tryRef) { if (len(sub(tgt.pos, b.pos)) < 14) b.tryT += dt; if (b.tryT > 8) { b.ignore.add(tgt); b.tryRef = null; b.tryT = 0; chest = null; } } else { b.tryRef = tgt; b.tryT = 0; }
      let item: GroundItem | null = null, idist = b.weapon ? 40 : 140;
      for (const g of items) { if (b.ignore.has(g)) continue; const k = g.item.kind; const need = isWeapon(k) ? (!b.weapon || (b.weapons.length < 3 && !b.weapons.includes(k)) || (b.weapon === 'smg' && k !== 'smg')) : k === 'ammo' ? b.weapon !== null && Object.values(b.ammo).reduce((a, v) => a + v, 0) < 60 : k === 'boogie' || k === 'impulse' || k === 'launchpad' || k === 'bushItem' ? false : k === 'grenade' ? b.nades < 3 : b.heals < 3; if (!need) continue; const d = len(sub(g.pos, b.pos)); if (d < idist) { idist = d; item = g; } }
      if (out) { b.mode = 'rotate'; if (!b.target || Math.hypot(b.target[0] - sc[0], b.target[2] - sc[1]) > srad * 0.5) { const a = rand(0, 6.28), rr = rand(0, srad * 0.5); b.target = [sc[0] + Math.cos(a) * rr, 0, sc[1] + Math.sin(a) * rr]; } toward(b.target, 6.5); }
      else if (b.mode === 'hunt' && b.memory && b.weapon) {
        const L = toward(b.memory, 6.5); if (L < 3) { b.memory = null; b.mode = 'loot'; }
        else if (L < 40 && b.cracked && b.buildCd <= 0 && b.mats >= 30 && Math.random() < dt * 0.5) {   // build a lookout ramp for vantage over the last-known spot
          const d = yawToDir(b.yaw), f = dirVec(d), c = cellOf(b.pos[0] + f[0] * 2.5, b.pos[2] + f[2] * 2.5), L0 = Math.floor((b.pos[1] + 1) / 4) * 4;
          botPlace(b, 'ramp', [c[0], L0, c[2]], d); botPlace(b, 'wall', [c[0] + f[0] * 2, L0 + 4, c[2] + f[2] * 2], d); b.vel[1] = Math.max(b.vel[1], 7);
        }
      }
      else if (chest && (b.lootT <= 0 || !b.weapon)) {
        const L = toward(chest.pos, 5.8);
        if (L < 2.6) { b.vel[0] *= .6; b.vel[2] *= .6; if (b.interactRef !== chest) { b.interactRef = chest; b.interactT = 1.2; } else b.interactT -= dt; if (b.interactT <= 0) { chest.open = true; const pool: Kind[] = ['ar', 'burst', 'smg', 'shotgun', 'sniper', 'tac', 'hunting', 'scar', 'pistol']; const k = pool[Math.floor(rand(0, pool.length))]; if (!b.weapons.includes(k!) && b.weapons.length < 3) b.weapons.push(k!); b.weapon = b.weapon ?? k!; b.heals = Math.min(4, b.heals + 1); b.shield = Math.min(100, b.shield + 25); b.mats = Math.min(999, b.mats + 30); b.ammo.medium += 30; b.ammo.light += 30; b.ammo.shells += 5; b.ammo.heavy += 3; b.interactRef = null; } } else { b.interactRef = null; }
      }
      else if (!b.weapon && b.lootT <= 0) {   // search the nearest building: walk to its loot spot, rummage 4s, find a common gun
        let spot: V3 | null = null, sd = 120; for (const l of W.lootSpots) { const d = len(sub(l, b.pos)); if (d < sd) { sd = d; spot = l; } }
        if (spot) { const L = toward(spot, 5.8); if (L < 7) { b.vel[0] *= 0.6; b.vel[2] *= 0.6; b.interactT += dt; if (b.interactT > 4) { b.interactT = 0; b.lootT = 20; const pool: Kind[] = ['pistol', 'smg', 'ar', 'burst', 'shotgun', 'tac', 'revolver']; const k = pool[Math.floor(rand(0, pool.length))]; b.weapons.push(k!); b.weapon = k!; const a = WEAPONS[k!]!.ammo; b.ammo[a] += a === 'heavy' ? 5 : a === 'shells' ? 12 : 40; b.heals++; } } }
      }
      else if (b.mats < 200 && !b.farmRef && b.weapon) { let best: Prop | null = null, bd = 90; for (const c of W.props) if (!c.dead && c.type !== 'bush') { const d = len(sub(c.pos, b.pos)); if (d < bd) { bd = d; best = c; } } if (best) b.farmRef = best; else b.mode = 'rotate'; }
      else if (b.farmRef) {   // harvest a tree/rock with the pickaxe like the player: 10 mats a swing
        const q = b.farmRef; if (q.dead || b.mats >= 400) { b.farmRef = null; }
        else { const L = toward(q.pos, 5.5); if (L < q.r + 2.2) { b.vel[0] *= 0.6; b.vel[2] *= 0.6; b.farmT -= dt; if (b.farmT <= 0) { b.farmT = 0.5; b.mats = Math.min(999, b.mats + 10); q.hp -= 50; if (len(sub(q.pos, P.pos)) < 40) beep(300, 0.08, 'triangle', 0.03); if (q.hp <= 0) { q.dead = 30; dirtyProp(q); b.farmRef = null; } } } }
      }
      else if (item) { if (item === b.tryRef) { if (len(sub(item.pos, b.pos)) < 14) b.tryT += dt; if (b.tryT > 8) { b.ignore.add(item); b.tryRef = null; b.tryT = 0; } } else { b.tryRef = item; b.tryT = 0; } const L = toward(item.pos, 5.8); if (L < 1.6) { const k = item.item.kind; if (isWeapon(k)) { if (!b.weapons.includes(k)) { if (b.weapons.length >= 3) b.weapons.shift(); b.weapons.push(k); } b.weapon = k; const a = WEAPONS[k]!.ammo; b.ammo[a] += a === 'heavy' ? 5 : a === 'shells' ? 10 : 30; } else if (k === 'ammo') { b.ammo.light += 18; b.ammo.medium += 12; b.ammo.shells += 4; b.ammo.heavy += 2; } else if (k !== 'grenade') b.heals++; if (k === 'grenade') b.nades += 3; items.splice(items.indexOf(item), 1); b.mats += 40; } }
      else {
        b.mode = 'rotate';
        b.wanderT -= dt;
        if (!b.target || b.wanderT <= 0 || len(sub(b.target, b.pos)) < 3) {
          b.wanderT = rand(6, 14);
          // drift toward the storm centre as the match goes on, otherwise poke around the nearest POI / loot spots
          const late = storm.phase >= 2 || P.matchT > 240;
          if (late || Math.random() < 0.3) { const a = rand(0, 6.28), rr = rand(0, storm.r * 0.55); b.target = [storm.c[0] + Math.cos(a) * rr, 0, storm.c[1] + Math.sin(a) * rr]; }
          else { const spot = W.lootSpots[Math.floor(rand(0, W.lootSpots.length))]; b.target = len(sub(spot!, b.pos)) < 90 ? [...spot!] as V3 : [b.pos[0] + rand(-40, 40), 0, b.pos[2] + rand(-40, 40)]; }
        }
        if (b.emoteT <= 0 && Math.random() < dt * 0.012) { b.emoteT = rand(3, 5); b.emote = Math.floor(rand(0, 4)); if (len(sub(b.pos, P.pos)) < 40) emoteJingle(b.emote); }
        if (b.emoteT <= 0) toward(b.target, 5.2);
      }
      if (b.heals <= 0 && Math.random() < dt * 0.02) b.heals = 1;
    }
    // live grenade nearby: skilled bots sprint away from it (rockets are too fast to react to)
    for (const n of nades) if (!n.rocket && n.t < 2 && len(sub(n.pos, b.pos)) < 6 && b.skill > 0.3) { const away = norm(sub(b.pos, n.pos)); b.vel[0] = away[0] * 8; b.vel[2] = away[2] * 8; if (b.grounded) b.vel[1] = 8; break; }
    // stuck detection → jump, then re-target
    if (Math.hypot(b.vel[0], b.vel[2]) > 1.5 && len(sub(b.pos, b.lastPos)) < 0.05 * 1) b.stuckT += dt; else b.stuckT = 0;
    if (b.stuckT > 0.6 && b.grounded) { b.vel[1] = 9; if (b.stuckT > 2) { b.target = null; b.stuckT = 0; if (b.cracked && b.buildCd <= 0 && b.mats >= 10) { const d = yawToDir(b.yaw), f = dirVec(d), c = cellOf(b.pos[0] + f[0] * 2.5, b.pos[2] + f[2] * 2.5); botPlace(b, 'ramp', [c[0], Math.floor((b.pos[1] + 1) / 4) * 4, c[2]], d); } } }
    b.lastPos = [...b.pos] as V3;
    if (Math.hypot(b.pos[0] - storm.c[0], b.pos[2] - storm.c[1]) > storm.r && Math.random() < dt) botDamage(b, storm.phase > 3 ? 5 : storm.phase > 1 ? 2 : 1, 'The storm');
  }
  b.grounded = false;
  if (moveEntity(b, 1.75, dt) && b.state !== 'ground') { b.state = 'ground'; b.mode = 'loot'; }
}

// ---------------- main loop ----------------
let last = performance.now(), t = 0;
const PROF = { bots: 0, submit: 0, flush: 0, hud: 0, frames: 0 };
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
  fpsN++; fpsT += dt; if (fpsT > 0.5) { fpsV = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0;
    // adaptive quality: step down when the match runs slow (Chromebooks); session-only, saved settings untouched
    if (P.state === 'play') { lowT = fpsV < 30 ? lowT + 0.5 : 0; if (lowT >= 3) { lowT = 0; const step = S.shadows > 1 ? (S.shadows = 1) : S.grass > 0 ? (S.grass = 0) : S.scale > 0.75 ? (S.scale = 0.75) : S.shadows > 0 ? (S.shadows = 0) : S.scale > 0.6 ? (S.scale = 0.6) : S.viewDist > 0 ? (S.viewDist = 0) : -1; if (step !== -1) info('Low FPS: quality lowered (Settings > Video)'); } }
  }
  IN.update(navigator.getGamepads ? Array.from(navigator.getGamepads()) : []);
  const key = (a: string) => IN.justPressed(a), down = (a: string) => IN.pressed(a);
  const sun = norm([0.55, 0.62, 0.35] as V3), aspect = innerWidth / innerHeight;
  const locked = document.pointerLockElement === canvas, padSens = 650 * dt * S.padSens * (P.scoped ? 0.4 : P.ads ? 0.6 : 1.0);
  mouse.dx = (locked ? IN.value('LookX') : 0) + IN.value('PadLookX') * padSens; mouse.dy = (locked ? IN.value('LookY') : 0) + IN.value('PadLookY') * padSens;
  mouse.l = down('Fire') && (locked || IN.lastDevice === 'gamepad'); mouse.r = down('Aim') && (locked || IN.lastDevice === 'gamepad');
  const fireJust = key('Fire') && mouse.l, aimJust = key('Aim') && mouse.r;
  if (IN.value('Scroll') !== 0 && !P.build && P.state === 'play') { const n = P.inv.length; let sl = P.slot; for (let i = 0; i < n + 1; i++) { sl = ((sl + 1 + (IN.value('Scroll') > 0 ? 1 : -1) + (n + 1) * 2) % (n + 1)) - 1; if (sl < 0 || P.inv[sl]) break; } P.slot = sl; }
  if (key('PrevSlot')) { if (P.build) { const pcs: PieceType[] = ['wall', 'floor', 'ramp', 'pyramid'], i = pcs.indexOf(P.piece); P.piece = pcs[(i + 3) % 4]!; } else { const n = P.inv.length; P.slot = P.slot < 0 ? 0 : (P.slot + n - 1) % n; P.build = false; } rumble(40, 0.2, 0.2); }
  if (key('NextSlot')) { if (P.build) { const pcs: PieceType[] = ['wall', 'floor', 'ramp', 'pyramid'], i = pcs.indexOf(P.piece); P.piece = pcs[(i + 1) % 4]!; } else { const n = P.inv.length; P.slot = P.slot < 0 ? 0 : (P.slot + 1) % n; P.build = false; } rumble(40, 0.2, 0.2); }
  if (key('PadTool')) { if (P.build) IN.system.setVirtualAction('Edit', 1); else if (P.state !== 'lobby') { P.slot = P.slot === -1 ? 0 : -1; P.build = false; rumble(40, 0.2, 0.2); } }
  if (key('RotateRamp') && P.build) { P.rampRot = (P.rampRot + 1) % 4; rumble(40, 0.2, 0.2); }
  if (key('Menu')) { if (P.state === 'lobby') $('btnPlay').click(); else toggleDbg(); }
  if (P.state === 'lobby' && IN.lastDevice === 'gamepad') { if (key('Jump')) { void unlockAudio(); startMatch(); rumble(180, 0.5, 0.5); } if (key('Build') || key('PadTool')) { $('btnSkin').click(); rumble(80, 0.3, 0.3); } }
  if (P.state === 'lobby' && GALLERY) {   // ?gallery=<name>,<name>... — model review lineup for art passes
    const names = GALLERY.split(','), n = names.length, sp = 6, ang = +(new URLSearchParams(location.search).get('ang') || 0.6);
    const dist = (5 + n * 2.2) / Math.min(1, aspect), cam: V3 = [Math.sin(ang) * dist, 3 + n * 0.4, Math.cos(ang) * dist];
    VP = mul(perspective(0.7, aspect, 0.1, 300), lookAt(cam, [0, 1.6, 0]));
    R.draw(M.pad, trs([0, -0.4, 0], 0, 0, [n * 1.6, 1, 2]));
    names.forEach((nm, i) => { const x = (i - (n - 1) / 2) * sp; if (nm.startsWith('skin')) drawChar(CHARS[+nm.slice(4) % CHARS.length]!, trs([x, 0, 0], ang), { anim: 0, speed: 0, grounded: true, pitch: 0, pose: 'lobby' }); else if (nm.startsWith('house')) { const idx = +nm.slice(5); R.draw(W.houseMeshes[idx % W.houseMeshes.length]!, trs([x, 0, 0], ang, 0, 0.35)); } else if (M[nm]) R.draw(M[nm]!, trs([x, 0, 0], ang * 2, 0, nm === 'bus' || nm === 'balloon' ? 0.4 : 1)); });
    R.flush({ pos: cam, fwd: norm(sub([0, 1.6, 0], cam)), fov: 0.7, aspect }, VP, norm([0.3, 0.8, 0.6] as V3), [0, 0, 0], t, true, 20 + n * 3);
    return;
  }
  if (P.state === 'lobby') {
    const a = t * 0.25, cam: V3 = [Math.sin(a) * 0.4, 1.5, 7.2];
    VP = mul(perspective(0.55, aspect, 0.1, 100), lookAt(cam, [0, 1.25, 0]));
    const ch = P.skin === 0 ? LOBBY_CHAR : CHARS[P.skin];
    R.draw(M.pad, trs([0, -0.4, 0]), [1, 1, 1]); R.draw(M.pad, trs([-4.2, -0.6, -1.5])); R.draw(M.pad, trs([4.0, -0.6, -1.5])); R.draw(M.pad, trs([6.5, -0.7, -2.5]));
    drawChar(ch!, trs([0, 0, 0], Math.sin(t * 0.5) * 0.08), { anim: 0, speed: 0, grounded: true, pitch: 0, pose: 'lobby' });
    R.flush({ pos: cam, fwd: norm(sub([0, 1.35, 0], cam)), fov: 0.55, aspect }, VP, norm([0.3, 0.8, 0.6] as V3), [0, 0, 0], t, false, 12);
    return;
  }

  // --- look ---
  // Preserve fine input while aiming: the previous 0.35 scope multiplier swallowed
  // one-pixel mouse deltas and made micro-adjustments feel like a dead zone.
  const sens = 0.0032 * (P.scoped ? S.scopeSens : P.ads ? S.adsSens : 1);
  P.yaw -= mouse.dx * sens * S.sensX; P.pitch = clamp(P.pitch - mouse.dy * sens * S.sensY * (S.invertY ? -1 : 1), -1.5, 1.5);
  if (key('Lobby')) { toLobby(); return; }
  if (key('Debug')) toggleDbg();
  if (P.over) { mouse.l = false; }
  updateEvents(dt); updateNades(dt);
  for (const pd of pads) { pd.t += dt;
    if (P.state === 'play' && !P.dead && Math.hypot(P.pos[0] - pd.pos[0], P.pos[2] - pd.pos[2]) < 1.6 && Math.abs(P.pos[1] - pd.pos[1]) < 1.2) { P.state = 'sky'; P.vel = [P.vel[0], 30, P.vel[2]]; P.pos[1] += 0.5; beep(700, 0.3, 'sine', 0.1, 600); rumble(200, 0.5, 0.8); }
    for (const b of bots) if (!b.dead && b.state === 'ground' && Math.hypot(b.pos[0] - pd.pos[0], b.pos[2] - pd.pos[2]) < 1.6 && Math.abs(b.pos[1] - pd.pos[1]) < 1.2) { b.state = 'sky'; b.vel = [b.vel[0], 30, b.vel[2]]; b.pos[1] += 0.5; b.land = b.target ?? b.land; }
  }
  if (key('Map')) H.bigmap.style.display = H.bigmap.style.display === 'flex' ? 'none' : 'flex';
  if (key('Emote') && P.state === 'play' && !P.dead) { if (EW.style.display === 'flex') { EW.style.display = 'none'; startEmote(lastEmote); } else { EW.style.display = 'flex'; document.exitPointerLock(); } }
  if (P.stunT > 0) { P.stunT -= dt; P.emoteT = Math.max(P.emoteT, 0.1); mouse.l = false; }
  if (P.emoteT > 0) { P.emoteT -= dt; if (P.stunT <= 0 && (Math.hypot(P.vel[0], P.vel[2]) > 1 || mouse.l)) P.emoteT = 0; }
  if (key('ThirdPerson')) P.thirdPerson = !P.thirdPerson;
  P.matchT += dt; storm.phaseT = Math.max(0, storm.phaseT - dt);
  if (storm.shrinking) { const k = 1 - storm.phaseT / storm.shrinkT; storm.r = lerp(storm.from.r, storm.to.r, k); storm.c = [lerp(storm.from.c[0], storm.to.c[0], k), lerp(storm.from.c[1], storm.to.c[1], k)]; if (storm.phaseT <= 0) { storm.shrinking = false; storm.phaseT = PHASES[Math.min(storm.phase, PHASES.length - 1)]![0]! * (PR.mode === 3 ? 0.45 : 1); } }
  else if (storm.phaseT <= 0 && !(NET.active() && !NET.isHost())) nextStormPhase();
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) H.banner.style.display = 'none'; }
  if (fadeT > 0) { fadeT -= dt; H.fade.style.opacity = String(clamp(fadeT / fadeDur * 1.6, 0, 1)); if (fadeT <= 0) H.fade.style.opacity = '0'; }
  if (P.matchT > 20 && Math.random() < dt * 0.12 && P.alive > bots.filter(b => !b.dead).length + 1) { P.alive--; addFeed(`${botName()} eliminated <span class="v">${botName()}</span>`); }

  // --- spawn island: bots "join" over ~18s, then a 10s countdown and everyone boards the bus ---
  if (P.state === 'island') {
    P.islandT += dt; P.hp = 100; P.shield = 100; P.mats = { wood: 999, stone: 999, metal: 999 };
    let joined = 1; for (const b of bots) { if (P.islandT >= b.joinT && !b.joinedFeed) { b.joinedFeed = true; addFeed(`${b.name} has joined`); } if (P.islandT >= b.joinT) joined++; }
    P.alive = Math.min(100, joined + Math.floor(Math.min(1, P.islandT / 18) * 68));
    const left = 28 - P.islandT;
    if (left <= 10 && left > 0) banner('BATTLE BUS LAUNCHING', `IN ${Math.ceil(left)}s`, 0.2);
    if (left <= 0) { fade(1.0); P.state = 'bus'; bus.t = 0; P.alive = 100; P.inv.fill(null); P.slot = -1; P.mats = { wood: 0, stone: 0, metal: 30 }; P.ammo = { light: 0, medium: 0, heavy: 0, shells: 0 }; P.shield = 0; W.clearPieces(); for (let i = items.length - 1; i >= 0; i--) if (items[i]!.pos[2] < -700) items.splice(i, 1); for (const b of bots) { b.state = 'bus'; b.pos = [...bus.a] as V3; b.hp = 100; b.shield = 0; } P.yaw = bus.yaw; P.pitch = -0.22; addFeed(`<span class="me">${PR.name}</span> has entered the Battle Bus`); if (NET.active() && NET.isHost()) NET.send({ t: 'ev', k: 'bus' }); }
  }
  // --- bus (clock continues after the player jumps; every bot owns its drop time) ---
  if (bus.t >= 0 && bus.t < bus.dur) { bus.t = Math.min(bus.dur, bus.t + dt); const k = bus.t / bus.dur; bus.pos = add(bus.a, scale(sub(bus.b, bus.a), k)); }
  if (P.state === 'bus') {
    P.pos = [bus.pos[0], bus.pos[1] + 3, bus.pos[2]]; P.vel = [0, 0, 0];
    if (key('Emote') && !P.thanked) { P.thanked = true; addFeed(`<span class="me">Player</span> has thanked the bus driver`); for (let i = 0; i < 3; i++) setTimeout(() => addFeed(`${botName()} has thanked the bus driver`), 400 + i * 700); }
    if ((key('Jump') && bus.t > 4) || bus.t >= bus.dur) { P.state = 'sky'; P.vel = [Math.sin(bus.yaw) * 8, -5, Math.cos(bus.yaw) * 8]; P.pos = [bus.pos[0], bus.pos[1] - 1, bus.pos[2]]; beep(300, 0.3, 'sine', 0.05, -200); }
  }
  // --- movement ---
  else {
    let wish: V3 = [0, 0, 0];
    { const mv = IN.vector('Move'); if (P.stunT <= 0) wish = add(scale(fwd(), mv.y), scale(right(), mv.x)); }
    if (len(wish) > 0) wish = norm(wish);
    P.crouch = (P.state === 'play' || P.state === 'island') && down('Crouch'); P.sprint = down('Sprint') && !P.crouch;
    const gAbove = P.pos[1] - W.groundH(P.pos[0], P.pos[2], P.pos[1]);
    if (P.state === 'sky') {
      P.vel[1] = Math.max(P.vel[1] - 30 * dt, IN.value('MoveY') > 0.5 ? -55 : -35);
      P.vel[0] = lerp(P.vel[0], wish[0] * 18, 0.03); P.vel[2] = lerp(P.vel[2], wish[2] * 18, 0.03);
      if (gAbove < 55 || key('Jump')) { P.state = 'glide'; beep(800, 0.2, 'sine', 0.06, -300); }
    } else if (P.state === 'glide') {
      P.vel[1] = lerp(P.vel[1], -5.5, 0.05);
      const f = fwd(); P.vel[0] = lerp(P.vel[0], f[0] * 11 + wish[0] * 4, 0.05); P.vel[2] = lerp(P.vel[2], f[2] * 11 + wish[2] * 4, 0.05);
    } else if (P.swim && !D.fly) {
      const spd = P.sprint ? 5 : 3.8;
      P.vel[0] = lerp(P.vel[0], wish[0] * spd, 0.08); P.vel[2] = lerp(P.vel[2], wish[2] * spd, 0.08);
      P.vel[1] = lerp(P.vel[1], (-1.25 - P.pos[1]) * 4, 0.15);                       // float with chest at the surface
      if (key('Jump')) P.vel[1] = 5;
      P.build = false; P.editing = null;
    } else {
      const spd = D.fly ? 22 : P.crouch ? 3 : P.sprint ? 8.5 : 5.5, accel = P.grounded || D.fly ? 14 : 4;
      P.vel[0] = lerp(P.vel[0], wish[0] * spd, 1 - Math.exp(-accel * dt)); P.vel[2] = lerp(P.vel[2], wish[2] * spd, 1 - Math.exp(-accel * dt));
      if (D.fly) P.vel[1] = lerp(P.vel[1], (down('Jump') ? 14 : 0) - (down('Crouch') ? 14 : 0), 0.2);
      else { P.vel[1] -= (D.lowGrav ? 8 : 26) * dt; if (key('Jump') && P.grounded) { P.vel[1] = D.lowGrav ? 7 : 9.5; P.grounded = false; } }
    }
    P.grounded = false;
    moveAndCollide(dt);
    P.swim = (P.state === 'play' || P.state === 'island') && terrainH(P.pos[0], P.pos[2]) < -1.5 && P.pos[1] < -0.9;
    P.anim += dt * (len([P.vel[0], 0, P.vel[2]]) > 0.5 && P.grounded ? Math.hypot(P.vel[0], P.vel[2]) * 1.6 : 0);
    // storm damage
    P.hurtCd -= dt; if (P.state === 'play' && Math.hypot(P.pos[0] - storm.c[0], P.pos[2] - storm.c[1]) > storm.r && P.hurtCd <= 0) { damage(storm.phase > 3 ? 5 : storm.phase > 1 ? 2 : 1, 'The storm'); P.hurtCd = 1; }
  }

  // --- camera ---
  if (P.dyingT > 0) P.dyingT -= dt;
  if (P.dead && P.dyingT <= 0) { let best: Bot | null = null, bd = 1e9; for (const b of bots) if (!b.dead && b.state === 'ground') { const d = len(sub(b.pos, P.pos)); if (d < bd) { bd = d; best = b; } } if (best) { P.pos = [...best.pos] as V3; P.yaw = best.yaw; } }
  const head = add(P.pos, [0, eyeH(), 0]); camFwd = look();
  const baseFov = 2 * Math.atan(Math.tan(S.fov * Math.PI / 360) / Math.max(1, aspect)) ; fov = P.scoped ? 0.28 : P.ads ? baseFov * 0.74 : P.sprint ? baseFov * 1.07 : baseFov;
  let want: V3;
  if (P.state === 'bus') want = add(add(bus.pos, [0, 6, 0]), scale(camFwd, -34));
  else if (P.state === 'sky' || P.state === 'glide') want = add(add(head, scale(camFwd, -7)), [0, 1.5, 0]);
  else want = P.ads ? add(add(head, scale(camFwd, -2.2)), add(scale(right(), 0.85), [0, 0.35, 0])) : add(add(head, scale(camFwd, -3.6)), add(scale(right(), 0.72), [0, 0.6, 0]));
  if ((P.thirdPerson || P.state !== 'play') && !P.scoped) {
    const d = sub(want, head), dist = len(d), hit = P.state === 'play' ? W.raycast(head, norm(d), dist) : null;
    const c = hit ? add(head, scale(norm(d), Math.max(0.3, hit.t - 0.3))) : want;
    camPos[0] = c[0]; camPos[1] = c[1]; camPos[2] = c[2];
  } else { camPos[0] = head[0]; camPos[1] = head[1]; camPos[2] = head[2]; }
  VP = mul(perspective(fov, aspect, 0.1, 1500), lookAt(camPos, add(camPos, camFwd)));

  // --- actions (only on the ground) ---
  const it = curItem();
  if ((P.state === 'play' || P.state === 'island') && !P.over && !P.dead && !dbgOpen()) {
    if (key('Build')) P.build = !P.build;
    for (const [k, p] of [['Wall', 'wall'], ['Floor', 'floor'], ['Ramp', 'ramp'], ['Pyramid', 'pyramid']] as [string, PieceType][]) if (key(k)) { P.piece = p; P.build = true; }
    if (key('Pickaxe')) { P.slot = -1; P.build = false; }
    for (let i = 0; i < 5; i++) if (key('Slot' + (i + 1)) && P.slot !== i) { P.slot = i; P.build = false; P.reload = 0; P.fireCd = 0.35; P.burstLeft = 0; }
    if ((aimJust || key('MatSwap')) && P.build && !P.editing) P.mat = P.mat === 'wood' ? 'stone' : P.mat === 'stone' ? 'metal' : 'wood';
    if (key('Reload') && P.build) P.rampRot = (P.rampRot + 1) % 4;
    P.scoped = !!(it && it.kind === 'sniper' && mouse.r && !P.build && !P.swim);
    P.ads = !!(it && isWeapon(it.kind) && it.kind !== 'sniper' && mouse.r && !P.build && !P.swim);
    P.fireCd -= dt; P.swing -= dt; P.bloom = Math.max(0, P.bloom - dt * 0.05);
    // ---- edit mode: X on an aimed wall/floor, LMB toggles tiles, X/RMB confirms, R resets ----
    if (key('Edit')) {
      if (P.editing) { P.editing.edit = P.editMask; netPiece({ op: 'edit', key: P.editing.key, mask: P.editMask }); P.editing = null; beep(900, 0.06, 'square', 0.05); }
      else { const h = W.raycast(camPos, camFwd, 10); if (h && h.kind === 'piece' && TILES((h.ref as Piece).type)) { P.editing = h.ref as Piece; P.editMask = P.editing.edit; P.build = false; } }
    }
    if (P.editing) {
      if (aimJust) { P.editing.edit = P.editMask; netPiece({ op: 'edit', key: P.editing.key, mask: P.editMask }); P.editing = null; }
      else if (key('Reload')) P.editMask = 0;
      else if (len(sub(P.editing.pos, P.pos)) > 9 || !W.pieces.has(P.editing.key)) P.editing = null;
      else if (fireJust || (mouse.l && P.fireCd <= 0)) {
        const pc = P.editing, h = pc.type === 'wall' ? World.rayBox(camPos, camFwd, { min: [pc.pos[0] - 2, pc.pos[1], pc.pos[2] - 2], max: [pc.pos[0] + 2, pc.pos[1] + 4, pc.pos[2] + 2] }, 12) : World.rayBox(camPos, camFwd, { min: [pc.pos[0] - 2, pc.pos[1] - 0.3, pc.pos[2] - 2], max: [pc.pos[0] + 2, pc.pos[1] + 0.3, pc.pos[2] + 2] }, 12);
        if (h) { const tile = W.tileAt(pc, add(camPos, scale(camFwd, h.t + 0.05))); if (tile >= 0 && (fireJust || !(P.editMask & (1 << tile)))) { P.editMask ^= 1 << tile; P.fireCd = 0.12; beep(1200, 0.03, 'square', 0.03); } }
      }
    }
    if (P.reload > 0) { P.reload -= dt; if (P.reload <= 0 && it && isWeapon(it.kind)) { const w = WEAPONS[it.kind], n = Math.min(w!.mag - it.mag, P.ammo[w!.ammo]); it.mag += n; P.ammo[w!.ammo] -= n; } }
    if (P.editing) { /* editing consumes clicks */ }
    else if (P.swim) { /* no weapons while swimming */ }
    else if (P.build) {
      const bt = buildTarget();
      if (mouse.l && P.fireCd <= 0 && (P.mats[P.mat] >= 10 || D.infMats) && !W.pieces.has(World.key(bt.type, bt.pos, bt.dir))) { W.place(bt.type, P.mat, bt.pos, bt.dir); netPiece({ op: 'add', type: bt.type, mat: P.mat, pos: bt.pos, dir: bt.dir }); PR.builds++; if (!D.infMats) P.mats[P.mat] -= 10; P.fireCd = 0.12; beep(700, 0.05, 'square', 0.04); if (Math.random() < 0.15) botHear(bt.pos, 40, 'player'); }
    } else if (P.slot < 0 || !it) { if (mouse.l && P.swing <= 0.05 && P.fireCd <= 0) { swingPickaxe(); P.fireCd = 0.45; } }
    else if (isWeapon(it.kind)) {
      const w = WEAPONS[it.kind];
      if ((w!.auto ? mouse.l : fireJust) && P.fireCd <= 0 && P.reload <= 0) { if (it.mag > 0) shoot(it); else if (P.ammo[w!.ammo] > 0) P.reload = w!.reload; else beep(900, 0.05, 'square', 0.03); }
      if (key('Reload') && it.mag < w!.mag && P.ammo[w!.ammo] > 0 && P.reload <= 0) P.reload = w!.reload;
    } else if (it.kind === 'launchpad') {
      if (fireJust && P.grounded) { const f = fwd(), pp: V3 = [P.pos[0] + f[0] * 2.5, 0, P.pos[2] + f[2] * 2.5]; pp[1] = W.groundH(pp[0], pp[2], P.pos[1]); pads.push({ pos: pp, t: 0 }); if (--it.count <= 0) P.inv[P.slot] = null; P.fireCd = 0.5; beep(900, 0.15, 'triangle', 0.06, 300); }
    } else if (it.kind === 'grenade' || it.kind === 'boogie' || it.kind === 'impulse') {
      if (fireJust) { const nd = { pos: add(camPos, scale(camFwd, 1)), vel: add(scale(camFwd, 18), [0, 5, 0]), t: it.kind === 'grenade' ? 2.5 : 1.6, by: PR.name, kind: it.kind }; nades.push({ ...nd, visual: NET.active() && !NET.isHost() }); netNade(nd); if (--it.count <= 0) P.inv[P.slot] = null; P.fireCd = 0.6; beep(500, 0.08, 'triangle', 0.05); }
    } else if (it.kind === 'rod') {
      const hw = W.raycast(camPos, camFwd, 25); const water = hw && hw.kind === 'terrain' && hw.p[1] < -0.2;
      if (fireJust && water && P.fishing <= 0) { P.fishing = 2.5; P.useT = 2.5; P.useDur = 2.5; beep(500, 0.1, 'sine', 0.05); info('Fishing…'); }
      if (P.fishing > 0) { P.fishing -= dt; P.useT = P.fishing; if (P.fishing <= 0) { const r = Math.random(); const k: Kind = r < 0.55 ? 'fish' : r < 0.75 ? 'shotgun' : r < 0.9 ? 'ar' : 'sniper'; dropItem(mkItem(k, k === 'fish' ? 2 : 1, k === 'fish' ? 3 : Math.max(2, Math.floor(rand(2, 5)))), add(P.pos, scale(fwd(), 1.5))); info('Caught a ' + (isWeapon(k) ? WEAPONS[k]!.name : 'Flopper') + '!'); beep(800, 0.3, 'sine', 0.08, 300); } }
    } else {
      const c = CONS[it.kind];
      if (mouse.l) { if (P.useT <= 0) { P.useT = c!.dur; P.useDur = c!.dur; } P.useT -= dt; if (P.useT <= 0) { if (c!.use()) { if (--it.count <= 0) P.inv[P.slot] = null; beep(500, 0.3, 'sine', 0.08, 400); if (NET.active() && !NET.isHost()) NET.send({ t: 'act', k: 'heal', hp: P.hp, sh: P.shield }); } else P.useT = 0; } }
      else P.useT = 0;
    }
    // interact
    for (let i = items.length - 1; i >= 0; i--) if (items[i]!.item.kind === 'ammo' && len(sub(items[i]!.pos, P.pos)) < 1.6) { P.ammo.light += 18; P.ammo.medium += 12; P.ammo.shells += 4; P.ammo.heavy += 2; items.splice(i, 1); beep(700, 0.06, 'sine', 0.05, 200); info('+ ammo'); }
    let near: GroundItem | null = null, nd = 2.4; for (const g of items) { if (g.item.kind === 'ammo') continue; const d = len(sub(g.pos, P.pos)); if (d < nd) { nd = d; near = g; } }
    let nearChest = null; for (const c of chests) if (!c.open && len(sub(c.pos, P.pos)) < 2.8) nearChest = c;
    if (near) { H.info.textContent = `[E] ${isWeapon(near.item.kind) ? WEAPONS[near.item.kind]!.name : CONS[near.item.kind]!.name}`; H.info.style.display = 'block'; infoT = Math.max(infoT, 0.05); }
    else if (nearChest) { H.info.textContent = '[E] Open chest'; H.info.style.display = 'block'; infoT = Math.max(infoT, 0.05); }
    if (key('Interact')) {
      if (nearChest && NET.active() && !NET.isHost()) { NET.send({ t: 'act', k: 'chest', i: chests.indexOf(nearChest) }); nearChest.open = true; PR.chests++; beep(400, 0.4, 'triangle', 0.08, 500); }
      else if (nearChest) { nearChest.open = true; PR.chests++; if (NET.active()) NET.send({ t: 'ev', k: 'chest', i: chests.indexOf(nearChest) }); beep(400, 0.4, 'triangle', 0.08, 500); const pool: Kind[] = ['ar', 'burst', 'smg', 'shotgun', 'sniper', 'tac', 'hunting', 'scar', 'pistol', 'revolver', 'silenced']; dropItem(mkItem(pool[Math.floor(rand(0, pool.length))]!, 1, nearChest.drop ? 4 : -1), add(nearChest.pos, [0, 0.3, 0]), 1); if (nearChest.drop) { dropItem(mkItem('rpg', 1, 4), add(nearChest.pos, [0, 0.3, 0]), 1.8); dropItem(mkItem('rod'), add(nearChest.pos, [0, 0.3, 0]), 1.4); dropItem(mkItem('sniper', 1, 4), add(nearChest.pos, [0, 0.3, 0]), 1.6); } dropItem(mkItem((['shieldPot', 'bandage', 'miniShield', 'chug', 'grenade', 'boogie', 'impulse'] as Kind[])[Math.floor(rand(0, 7))]!, 3), add(nearChest.pos, [0, 0.3, 0]), 1.2); P.ammo.medium += 30; P.ammo.light += 30; P.ammo.shells += 5; P.ammo.heavy += 3; P.mats.wood += 30; info('+ ammo, +30 wood'); }
      else if (near) {
        const k = near.item.kind; if (isWeapon(k)) { const a = WEAPONS[k]!.ammo; P.ammo[a] += a === 'heavy' ? 5 : a === 'shells' ? 10 : 30; }
        const same = P.inv.findIndex(s => s && !isWeapon(s.kind) && s.kind === k);
        if (same >= 0) P.inv[same]!.count += near.item.count;
        else { let s = P.inv.indexOf(null); if (s < 0) { s = Math.max(0, P.slot); dropItem(P.inv[s]!, near.pos); } P.inv[s] = near.item; if (P.slot < 0 || !P.inv[P.slot]) P.slot = s; }
        items.splice(items.indexOf(near), 1); P.build = false; beep(660, 0.08, 'sine', 0.06, 200); if (NET.active()) { if (NET.isHost()) NET.send({ t: 'item', op: 'del', id: near.id }); else NET.send({ t: 'act', k: 'pickup', id: near.id }); }
      }
    }
  }
  const pf0 = performance.now();
  // far-away bots simulate at half rate (every other frame with doubled dt); nobody can see the difference past 150m
  const netClient = NET.active() && !NET.isHost();
  if (!D.pauseBots) for (let i = 0; i < bots.length; i++) { const b = bots[i]; if (b!.dead) continue; if (b!.remote || netClient) { netInterp(b!, dt); continue; } const far = b!.state === 'ground' && len(sub(b!.pos, P.pos)) > 150; if (far && (i + hudN) % 2) continue; updateBot(b!, far ? dt * 2 : dt); }
  netTick(dt);
  if (NET.active() && NET.isHost() && P.state === 'play' && !P.over && P.matchT > 5) {
    const humans = (P.dead ? 0 : 1) + bots.filter(b => b.remote && !b.dead).length, ai = bots.filter(b => !b.remote && !b.dead).length;
    const lastHuman = P.dead ? bots.find(b => b.remote && !b.dead) : null;
    if (humans + ai <= 1 || (humans === 0)) { const winner = P.dead ? (lastHuman ? lastHuman.remote : 0) : NET.id; NET.send({ t: 'ev', k: 'end', winner, by: 'the storm' }); if (!P.dead) endScreen(true); else P.over = true; }
  }
  PROF.bots += performance.now() - pf0;
  for (const q of W.props) if (q.dead > 0) { q.dead -= dt; if (q.dead <= 0) { q.dead = 0; q.hp = 250; dirtyProp(q); } }
  for (let i = fx.length - 1; i >= 0; i--) { fx[i]!.t -= dt; if (fx[i]!.t <= 0) fx.splice(i, 1); }
  for (let i = feed.length - 1; i >= 0; i--) { feed[i]!.t -= dt; if (feed[i]!.t <= 0) feed.splice(i, 1); }
  if (infoT > 0) { infoT -= dt; if (infoT <= 0) H.info.style.display = 'none'; }
  P.weakT=Math.max(0,P.weakT-dt); if(P.weakT<=0){P.weakPos=null;P.weakRef=null;}
  for(const s of W.statics) if(s.shake&&s.shake>0)s.shake=Math.max(0,s.shake-dt);

  // ---------------- render ----------------
  const pf1 = performance.now();
  for (const tc of W.terrainChunks) { const dx = tc.c[0] - camPos[0], dz = tc.c[2] - camPos[2], dist = Math.hypot(dx, dz); if (P.state === 'play' && dist > tc.r && (dist - tc.r > [420, 600, 900][S.viewDist]! || dx * camFwd[0] + dz * camFwd[2] < -tc.r)) continue; R.draw(dist - tc.r > 160 ? tc.lod : tc.mesh, trs([0, 0, 0]), [1, 1, 1], 1, 5); }
  if (P.state === 'play' && S.grass > 0) { const cx = Math.floor(P.pos[0] / 24), cz = Math.floor(P.pos[2] / 24), gr = S.grass > 1 ? 2 : 1; for (let i = -gr; i <= gr; i++) for (let j = -gr; j <= gr; j++) R.draw(W.grassChunk(R, cx + i, cz + j), trs([0, 0, 0]), [1, 1, 1], 1, 5, false, true); }
  R.draw(M.mountains, trs([0, 0, 0]), [1, 1, 1], 1, 0, false);
  if (P.state === 'island') { R.draw(W.island, trs([0, 0, 0]), [1, 1, 1], 1, 5); R.draw(M.mountains, trs([ISLAND[0], 0, ISLAND[2]]), [1, 1, 1], 1, 0, false); R.draw(M.bus, trs([ISLAND[0] - 10, 5.6, ISLAND[2] + 36], 1.2)); R.draw(M.balloon, trs([ISLAND[0] - 10, 21.6, ISLAND[2] + 36], 1.2)); }
  R.draw(M.water, trs([0, -0.25, 0]), [1, 1, 1], 0.82, 6, false);
  const cull = P.state === 'play' ? [130, 190, 320][S.viewDist] : 900;
  const vis = (p: V3) => Math.abs(p[0] - camPos[0]) < cull! && Math.abs(p[2] - camPos[2]) < cull! && ((p[0] - camPos[0]) * camFwd[0] + (p[2] - camPos[2]) * camFwd[2] > -18);   // ponytail: half-space cull, real frustum if draw calls ever matter
  { const r = Math.ceil((cull! + PC) / PC), kx = Math.floor(camPos[0] / PC), kz = Math.floor(camPos[2] / PC);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) { const c: V3 = [(kx + i + 0.5) * PC, 0, (kz + j + 0.5) * PC]; if (Math.abs(c[0] - camPos[0]) > cull! + PC || Math.abs(c[2] - camPos[2]) > cull! + PC || (c[0] - camPos[0]) * camFwd[0] + (c[2] - camPos[2]) * camFwd[2] < -PC) continue; const cell = propCell((kx + i) + ',' + (kz + j)); if (cell) R.draw(cell.mesh, trs([0, 0, 0])); } }
  for (const bk of baked) if (Math.abs(bk.c[0] - camPos[0]) < cull! + 34 && Math.abs(bk.c[2] - camPos[2]) < cull! + 34 && (bk.c[0] - camPos[0]) * camFwd[0] + (bk.c[2] - camPos[2]) * camFwd[2] > -50) R.draw(bk.mesh, trs([0, 0, 0]), [1, 1, 1], 1, 0, true, true);
  for (const s of W.statics) if (!s.dead && !s.baked && vis(s.pos)) {const sh=s.shake||0,sp:V3=sh?[s.pos[0]+Math.sin(t*95)*sh*.12,s.pos[1],s.pos[2]+Math.cos(t*81)*sh*.12]:s.pos;R.draw((s.mesh.startsWith('house') ? W.houseMeshes[+s.mesh.slice(5)] : M[s.mesh])!, trs(sp, s.yaw), [1, 1, 1], 1, 0, s.mesh !== 'dash');}
  for (const p of W.pieces.values()) {
    if (!vis(p.pos)) continue;
    const age = performance.now() / 1000 - p.born, k = clamp(age / 0.18, 0, 1), sc = 0.6 + 0.4 * k, mesh = p.edit ? editedMesh(p.type as 'wall' | 'floor', p.mat, p.edit) : M[`${p.type}_${p.mat}`]!;
    const tint: V3 = k < 1 ? [0.6 + 0.4 * k, 0.8 + 0.2 * k, 1.3 - 0.3 * k] : p.hp < p.maxHp ? [1, 0.7 + 0.3 * p.hp / p.maxHp, 0.7 + 0.3 * p.hp / p.maxHp] : [1, 1, 1];
    R.draw(mesh, mul(trs(p.pos, p.dir * Math.PI / 2), trs([0, 0, 0], 0, 0, [sc, p.type === 'wall' ? sc : 1, sc])), tint, 1, MAT_STYLE[p.mat]);
  }
  if (P.editing) {   // tile overlay
    const pc = P.editing, n = TILES(pc.type), T = 4 / 3;
    for (let i = 0; i < n; i++) {
      const sel = !!(P.editMask & (1 << i));
      let local: V3, size: V3;
      if (pc.type === 'wall') { const row = Math.floor(i / 3), col = i % 3; local = [-2 + (col + 0.5) * T, (row + 0.5) * T, 0]; size = [T * 0.9, T * 0.9, 0.4]; }
      else { local = [i % 2 ? 1 : -1, 0.05, i > 1 ? 1 : -1]; size = [1.8, 0.3, 1.8]; }
      R.draw(M.hitbox, mul(mul(trs(pc.pos, pc.dir * Math.PI / 2), translate(local[0], local[1], local[2])), trs([0, 0, 0], 0, 0, size)), sel ? [0.3, 0.8, 1.4] : [1.2, 1.2, 1.2], sel ? 0.55 : 0.15, 7, false);
    }
  }
  for (const c of chests) { R.draw(c.open ? M.chestOpen : M.chest, trs(c.pos, c.yaw), c.open ? [1, 1, 1] : [1.15, 1.1, 0.9]); if (!c.open && len(sub(c.pos, camPos)) < 60) R.draw(M.glow, trs(c.pos, 0, 0, 1 + Math.sin(t * 3) * 0.08), [1, 0.85, 0.3], 0.16, 7, false); }
  const RAR_COL: V3[] = [[0.7, 0.7, 0.7], [0.3, 0.9, 0.3], [0.3, 0.6, 1], [0.75, 0.35, 1], [1, 0.75, 0.2]];
  for (const g of items) { if (g.item.kind === 'ammo') R.draw(M.ammo, trs(g.pos, 0.6, 0, 1.6)); else { R.draw(M[g.item.kind], trs(add(g.pos, [0, 0.6 + Math.sin(t * 3) * 0.1, 0]), t * 1.5, 0, 1.3)); if (len(sub(g.pos, camPos)) < 45) { const rc = RAR_COL[g.item.rar] ?? RAR_COL[0]; R.draw(M.glow, trs(g.pos, 0, 0, [0.7, 0.35, 0.7]), rc, 0.22, 7, false); R.draw(M.beam, trs(g.pos), rc, 0.12, 7, false); } } }
  for (const f of fx) if (f.kind === 'puff') R.draw(M.glow, trs(f.pos, 0, 0, 0.12 + (0.22 - f.t) * 2.2), f.col ?? [1, 1, 1], f.t * 2.5, 7, false);
  for (const f of fx) if (f.kind === 'tracer' && f.to) { const d = sub(f.to, f.pos), L = len(d); R.draw(M.tracer, trs(f.pos, Math.atan2(d[0], d[2]), -Math.asin(clamp(d[1] / L, -1, 1)), [1, 1, L]), [1, 1, 1], 1, 0, false); }
  for (let i = dying.length - 1; i >= 0; i--) { const d = dying[i]; d!.t -= dt; if (d!.t <= 0) { dying.splice(i, 1); continue; } const k = clamp((1.4 - d!.t) / 0.5, 0, 1); drawChar(CHARS[d!.skin]!, mul(trs(d!.pos, d!.yaw), mul(translate(0, 0, -0.3 * k), rotX(-1.45 * k * k))), { anim: 0, speed: 0, grounded: true, pitch: 0, pose: 'idle' }); }
  for (const d of bots) if (d.remote && !d.dead && d.state !== 'bus' && Math.abs(d.pos[0] - camPos[0]) < cull! && Math.abs(d.pos[2] - camPos[2]) < cull!) {   // human players: pose comes over the network
    const po = d.netPose, pose: Pose = po & 4 ? 'emote' : po & 1 ? 'build' : po & 2 ? 'crouch' : d.netHeld && d.netHeld !== 'pickaxe' ? 'aim' : 'pick';
    R.draw(M.shadow, trs([d.pos[0], W.groundH(d.pos[0], d.pos[2], d.pos[1]) + 0.03, d.pos[2]]), [1, 1, 1], 0.3, 0, false);
    drawChar(CHARS[d.skin]!, trs(d.pos, d.yaw), { anim: d.anim, speed: Math.hypot(d.vel[0], d.vel[2]), grounded: true, pitch: d.netPitch, pitch2: 0, pose, held: po & 4 || po & 1 ? undefined : d.netHeld ?? 'pickaxe', emote: d.emote } as any);
    continue;
  }
  for (const d of bots) if (!d.remote && !d.dead && d.state !== 'bus' && Math.abs(d.pos[0] - camPos[0]) < cull! && Math.abs(d.pos[2] - camPos[2]) < cull!) drawChar(CHARS[d.skin]!, trs(d.pos, d.yaw), { anim: d.anim, speed: Math.hypot(d.vel[0], d.vel[2]), grounded: d.grounded || d.state !== 'ground', pitch: d.pitch, pose: d.emoteT > 0 ? 'emote' : d.state === 'sky' ? 'sky' : d.state === 'glide' ? 'glide' : d.state === 'island' ? 'aim' : d.mode === 'crank' || d.mode === 'box' || d.mode === 'rush' ? 'build' : d.weapon && d.enemy ? 'aim' : 'idle', held: (d.state !== 'ground' && d.state !== 'island') || d.emoteT > 0 || d.mode === 'crank' || d.mode === 'box' || d.mode === 'rush' ? undefined : d.weapon ?? 'pickaxe', emote: d.emote });
  if (P.build) { const bt = buildTarget(); const ok = P.mats[P.mat] >= 10 && !W.pieces.has(World.key(bt.type, bt.pos, bt.dir)); R.draw(M[`${bt.type}_${P.mat}`]!, trs(bt.pos, bt.dir * Math.PI / 2), ok ? [0.5, 1.2, 0.6] : [1.4, 0.5, 0.5], 0.45, MAT_STYLE[P.mat], false); }
  if (P.state === 'bus' || bus.t < bus.dur + 30) { const bp = P.state === 'bus' ? bus.pos : add(bus.a, scale(sub(bus.b, bus.a), Math.min(1, (bus.t + (P.matchT - bus.t)) / bus.dur))); R.draw(M.bus, trs(bp, bus.yaw)); R.draw(M.balloon, trs(add(bp, [0, 16, 0]), bus.yaw)); }
  for (const d of drops) if (!d.landed) { R.draw(M.chest, trs(d.pos, 0, 0, 1.3)); R.draw(M.balloon, trs(add(d.pos, [0, 5.5, 0]), 0, 0, 0.32), [0.4, 0.5, 1]); }
  for (const pd of pads) { R.draw(M.launchpad, trs(pd.pos, pd.t * 2)); }
  for (const n of nades) { if (n.rocket) R.draw(M.rocket, trs(n.pos, Math.atan2(n.vel[0], n.vel[2]), -Math.asin(clamp(n.vel[1] / len(n.vel), -1, 1)))); else R.draw(M[n.kind ?? 'grenade'], trs(n.pos, n.t * 4, n.t * 3)); }
  for (const m of meteors) R.draw(M.rock, trs(m.pos, t * 3, t * 2, 1.2), [1, 0.5, 0.3]);
  if (storm.r < 480) R.draw(M.storm, trs([storm.c[0], 0, storm.c[1]], 0, 0, [storm.r, 1, storm.r]), [0.6, 0.3, 0.9], 0.25, 9, false);
  // player
  const pose: Pose = P.dyingT > 0 ? 'idle' : P.emoteT > 0 ? 'emote' : P.state === 'sky' ? 'sky' : P.state === 'glide' ? 'glide' : P.swim ? 'sky' : P.crouch ? 'crouch' : P.build || P.editing ? 'build' : P.slot >= 0 && it && it.kind !== 'ammo' ? 'aim' : 'pick';
  const held = (P.state !== 'play' && P.state !== 'island') || P.build || P.editing || P.swim || P.emoteT > 0 ? undefined : it ? it.kind : 'pickaxe';
  if (P.dead && P.dyingT > 0) { const k = clamp((1.5 - P.dyingT) / 0.5, 0, 1); drawChar(CHARS[P.skin]!, mul(trs(P.pos, P.yaw), mul(translate(0, 0, -0.3 * k), rotX(-1.45 * k * k))), { anim: 0, speed: 0, grounded: true, pitch: 0, pose: 'idle' }); }
  if (P.state !== 'bus' && !P.dead) {
    const gY = W.groundH(P.pos[0], P.pos[2], P.pos[1]);
    R.draw(M.shadow, trs([P.pos[0], gY + 0.03, P.pos[2]]), [1, 1, 1], 0.3, 0, false);
    if (P.bush && P.state === 'play') R.draw(M.bush, trs([P.pos[0], P.pos[1] - 0.1, P.pos[2]], t * 0.2, 0, 1.6));
    if ((P.thirdPerson || P.state !== 'play') && !P.scoped) {
      drawChar(CHARS[P.skin]!, trs(P.pos, P.yaw), { anim: P.anim, speed: Math.hypot(P.vel[0], P.vel[2]), grounded: P.grounded, pitch: P.pitch, pose, swing: P.swing, held, sprint: P.sprint && Math.hypot(P.vel[0], P.vel[2]) > 6, emote: P.emote });
    } else if (!P.build) {
      const hp = add(add(camPos, scale(camFwd, 0.6)), add(scale(right(), -0.3), [0, -0.3 + (P.swing > 0 ? Math.sin(P.swing * 12) * 0.1 : 0), 0]));
      if (it) R.draw(M[it.kind], trs(hp, P.yaw, -P.pitch), [1, 1, 1], 1, 0, false); else R.draw(M.pickaxe, mul(trs(hp, P.yaw, -P.pitch), rotX(1.0 + (P.swing > 0 ? Math.sin(P.swing * 6.3) * 1.2 : 0))), [1, 1, 1], 1, 0, false);
    }
  }
  R.shadows = S.shadows; R.scale = S.scale; setListener(camPos, camFwd); setVolumes(S);
  const pf2 = performance.now(); PROF.submit += pf2 - pf1;
  R.flush({ pos: camPos, fwd: camFwd, fov, aspect }, VP, sun, P.pos, t, true, P.state === 'play' ? (S.shadows > 1 ? 62 : 40) : 180);
  const pf3 = performance.now(); PROF.flush += pf3 - pf2;
  try { drawIcon(SKINS[P.skin]!); drawHud(); } catch (e) { if (!(window as any)._hudErr) { (window as any)._hudErr = e; console.error('drawHud', e); } }
  PROF.hud += performance.now() - pf3; PROF.frames++;
}
export { frame as tick, R as renderer };
// ---------------- multiplayer glue ----------------
const netPose = (build: boolean, crouch: boolean, emoteT: number, emote: number, dead: boolean) => (build ? 1 : 0) | (crouch ? 2 : 0) | (emoteT > 0 ? 4 : 0) | (dead ? 8 : 0) | (emote << 4);
function netPiece(msg: Record<string, unknown>) { if (!NET.active()) return; NET.send(NET.isHost() ? { t: 'piece', ...msg } : { t: 'act', k: 'piece', ...msg }); }
function netNade(nd: Record<string, unknown>) { if (!NET.active()) return; NET.send(NET.isHost() ? { t: 'ev', k: 'nade', nd } : { t: 'act', k: 'nade', nd }); }
function applyPiece(m: any) {
  if (m.op === 'add') W.place(m.type, m.mat, m.pos, m.dir);
  else if (m.op === 'del') { const p = W.pieces.get(m.key); if (p) W.removePiece(p); }
  else if (m.op === 'edit') { const p = W.pieces.get(m.key); if (p) p.edit = m.mask; }
  else if (m.op === 'dmg') { const p = W.pieces.get(m.key); if (p) { W.damagePiece(p, m.d); if (!W.pieces.has(m.key) && NET.isHost()) NET.send({ t: 'piece', op: 'del', key: m.key }); } }
}
/** network-driven entities glide toward their last reported position */
function netInterp(b: Bot, dt: number) {
  const k = 1 - Math.exp(-14 * dt), prev: V3 = [...b.pos] as V3;
  b.pos[0] += (b.netPos[0] - b.pos[0]) * k; b.pos[1] += (b.netPos[1] - b.pos[1]) * k; b.pos[2] += (b.netPos[2] - b.pos[2]) * k;
  const dy = Math.atan2(Math.sin(b.netYaw - b.yaw), Math.cos(b.netYaw - b.yaw)); b.yaw += dy * k; b.pitch += (b.netPitch - b.pitch) * k;
  const sp = len(sub(b.pos, prev)) / Math.max(dt, 1e-3); b.vel = [(b.pos[0] - prev[0]) / dt, 0, (b.pos[2] - prev[2]) / dt]; b.anim += dt * sp * 1.6; b.grounded = true;
  if (b.emoteT > 0) b.emoteT -= dt;
}
let netAcc = 0, snapTick = 0;
function netTick(dt: number) {
  if (!NET.active() || P.state === 'lobby') return;
  netAcc += dt; if (netAcc < 0.066) return; netAcc = 0;
  const it = curItem();
  const mine = { id: NET.id, p: P.pos.map(v => +v.toFixed(2)), yaw: +P.yaw.toFixed(3), pitch: +P.pitch.toFixed(3), held: P.build || P.editing || P.emoteT > 0 ? null : it ? it.kind : 'pickaxe', pose: netPose(P.build || !!P.editing, P.crouch, P.emoteT, P.emote, P.dead), hp: Math.ceil(P.hp), sh: Math.ceil(P.shield), skin: P.skin };
  if (!NET.isHost()) { NET.send({ t: 'in', ...mine }); return; }
  // host snapshot at 15 Hz: players (host + remote), bots, storm and match clocks
  const players = [mine, ...bots.filter(b => b.remote).map(b => ({ id: b.remote, p: b.pos.map(v => +v.toFixed(2)), yaw: +b.yaw.toFixed(3), pitch: +b.pitch.toFixed(3), held: b.netHeld, pose: b.netPose, hp: Math.ceil(b.hp), sh: Math.ceil(b.shield), skin: b.skin, dead: b.dead }))];
  const bs = bots.map((b, i) => b.remote ? null : [i, +b.pos[0].toFixed(2), +b.pos[1].toFixed(2), +b.pos[2].toFixed(2), +b.yaw.toFixed(2), Math.ceil(b.hp), Math.ceil(b.shield), b.dead ? 1 : 0, b.weapon, b.emoteT > 0 ? b.emote : -1, ['island', 'bus', 'sky', 'glide', 'ground'].indexOf(b.state), b.mode === 'crank' || b.mode === 'box' || b.mode === 'rush' ? 1 : 0]).filter(Boolean);
  NET.send({ t: 'snap', tick: snapTick++, players, bots: bs, storm: { c: storm.c, r: +storm.r.toFixed(1), phase: storm.phase, phaseT: +storm.phaseT.toFixed(1), shrinking: storm.shrinking, from: storm.from, to: storm.to, shrinkT: storm.shrinkT }, alive: P.alive, islandT: +P.islandT.toFixed(2), busT: +bus.t.toFixed(2), state: P.state, matchT: +P.matchT.toFixed(1) });
}
const remoteOf = (id: number) => bots.find(b => b.remote === id);
function applyRemote(b: Bot, m: any) { b.netPos = m.p; b.netYaw = m.yaw; b.netPitch = m.pitch; b.netHeld = m.held; b.netPose = m.pose; b.weapon = m.held && m.held !== 'pickaxe' ? m.held : null; b.emote = m.pose >> 4; b.emoteT = m.pose & 4 ? 1 : 0; if (m.skin !== undefined) b.skin = m.skin; if (m.dead && !b.dead) { b.dead = true; dying.push({ skin: b.skin, pos: [...b.pos] as V3, yaw: b.yaw, t: 1.4 }); } }
NET.on('start', m => { if (NET.isHost()) return; PR.mode = m.mode ?? PR.mode; void unlockAudio(); startMatch(m.seed, true); });
NET.on('in', m => { const b = remoteOf(m.from); if (!b) return; applyRemote(b, m); if (m.hp !== undefined && m.hp > b.hp) { b.hp = m.hp; b.shield = m.sh; } if (P.state !== 'island' && b.state === 'island') b.state = 'ground'; });   // heals are trusted; damage is ours
NET.on('snap', m => {
  if (NET.isHost()) return;
  for (const pl of m.players) { if (pl.id === NET.id) { if (!P.dead && pl.dead) {} } else { const b = remoteOf(pl.id); if (b) applyRemote(b, pl); } }
  for (const a of m.bots) { const b = bots[a[0]]; if (!b || b.remote) continue; b.netPos = [a[1], a[2], a[3]]; b.netYaw = a[4]; b.hp = a[5]; b.shield = a[6]; if (a[7] && !b.dead) { b.dead = true; dying.push({ skin: b.skin, pos: [...b.pos] as V3, yaw: b.yaw, t: 1.4 }); } b.weapon = a[8]; b.emote = a[9] >= 0 ? a[9] : b.emote; b.emoteT = a[9] >= 0 ? 1 : 0; b.state = (['island', 'bus', 'sky', 'glide', 'ground'] as const)[a[10]] ?? 'ground'; b.mode = a[11] ? 'crank' : (b.weapon ? 'fight' : 'loot'); if (b.state === 'bus') b.pos = [...bus.pos] as V3; if (Math.abs(b.pos[0] - a[1]) + Math.abs(b.pos[2] - a[3]) > 40) b.pos = [a[1], a[2], a[3]]; }
  Object.assign(storm, m.storm); P.alive = m.alive; P.matchT = m.matchT;
  if (P.state === 'island') { P.islandT = m.islandT; if (m.state !== 'island' && m.state !== 'lobby') P.islandT = 99; }
  if (P.state === 'bus' && m.busT >= 0) bus.t = m.busT;
});
NET.on('dmg', m => { if (NET.isHost()) return; const n = Math.max(0, P.hp + P.shield - (m.hp + m.sh)); if (n > 0) { P.shield = m.sh; P.hp = m.hp + 0.0001; damage(0.0001, m.by); P.hp = m.hp; if (P.hp <= 0 && !P.dead) damage(1, m.by); } else { P.hp = m.hp; P.shield = m.sh; } });
NET.on('act', m => {   // host resolves client actions
  const b = remoteOf(m.from); const by = b ? b.name : 'Player';
  if (m.k === 'shot') { const w = WEAPONS[m.kind as Kind]; if (!w) return; const boxes = botBoxes(); boxes.push({ min: [P.pos[0] - 0.35, P.pos[1], P.pos[2] - 0.25], max: [P.pos[0] + 0.35, P.pos[1] + 2.05, P.pos[2] + 0.25], ref: { host: true } }); for (const d of m.d as V3[]) { const h = W.raycast(m.o, d, w.range, boxes); if (!h) continue; if (h.kind === 'box') { const r = h.ref as any; const fall = h.t > w.range * 0.5 ? lerp(1, 0.6, (h.t - w.range * 0.5) / (w.range * 0.5)) : 1; const n = Math.round(w.dmg * RAR_MULT[m.rar]! * fall * (r.head ? w.hs : 1)); if (r.host) { if (!sameTeam(m.from, NET.id)) damage(n, by); } else if (!r.d.remote || (r.d.remote !== m.from && !sameTeam(m.from, r.d.remote))) botDamage(r.d, n, by); } else if (h.kind === 'piece') { W.damagePiece(h.ref as Piece, w.dmg); if (!W.pieces.has((h.ref as Piece).key)) NET.send({ t: 'piece', op: 'del', key: (h.ref as Piece).key }); } } }
  else if (m.k === 'piece') { applyPiece(m); NET.send({ t: 'piece', op: m.op, type: m.type, mat: m.mat, pos: m.pos, dir: m.dir, key: m.key, mask: m.mask }); }
  else if (m.k === 'pickup') { const i = items.findIndex(g => g.id === m.id); if (i >= 0) { items.splice(i, 1); NET.send({ t: 'item', op: 'del', id: m.id }); } }
  else if (m.k === 'chest') { const c = chests[m.i]; if (c && !c.open) { c.open = true; const pool: Kind[] = ['ar', 'burst', 'smg', 'shotgun', 'sniper', 'tac', 'hunting', 'scar', 'pistol', 'revolver', 'silenced']; dropItem(mkItem(pool[Math.floor(rand(0, pool.length))]!, 1, c.drop ? 4 : -1), add(c.pos, [0, 0.3, 0]), 1); dropItem(mkItem((['shieldPot', 'bandage', 'miniShield', 'chug', 'grenade'] as Kind[])[Math.floor(rand(0, 5))]!, 3), add(c.pos, [0, 0.3, 0]), 1.2); dropItem(mkItem('ammo'), add(c.pos, [0, 0.3, 0]), 1.5); NET.send({ t: 'ev', k: 'chest', i: m.i }); } }
  else if (m.k === 'nade') { nades.push({ ...m.nd, by }); NET.send({ t: 'ev', k: 'nade', nd: m.nd, from: m.from }); }
  else if (m.k === 'heal') { if (b) { b.hp = m.hp; b.shield = m.sh; } }
});
NET.on('piece', m => { if (!NET.isHost()) applyPiece(m); });
NET.on('item', m => { if (NET.isHost()) return; if (m.op === 'add') { if (!items.some(g => g.id === m.id)) items.push({ item: { kind: m.kind, mag: isWeapon(m.kind) ? WEAPONS[m.kind]!.mag : 0, count: m.count, rar: m.rar }, pos: m.pos, id: m.id }); } else { const i = items.findIndex(g => g.id === m.id); if (i >= 0) items.splice(i, 1); } });
NET.on('ev', m => {
  if (m.k === 'chest') { const c = chests[m.i]; if (c) c.open = true; }
  else if (m.k === 'nade' && m.from !== NET.id) nades.push({ ...m.nd, visual: !NET.isHost() });
  else if (m.k === 'end' && !NET.isHost() && !P.over) endScreen(m.winner === NET.id, m.by ?? '');
  else if (m.k === 'bus' && !NET.isHost()) { /* clock follows the snapshot */ }
});
NET.on('feed', m => { if (!NET.isHost()) addFeed(m.html, true); });
NET.on('left', m => { const b = remoteOf(m.id); if (b && !b.dead) { b.dead = true; addFeed(`${b.name} left the match`); } });
NET.on('closed', () => { if (P.state !== 'lobby') info('Disconnected from party'); });
// ---- URL test harness: ?auto=play&at=x,z&yaw=0.3&pitch=0.05&hud=0&bot=1 sets up a scene without console access ----
{
  const q = new URLSearchParams(location.search);
  if (q.get('auto') === 'play') setTimeout(() => {
    startMatch(); P.islandT = 99;
    setTimeout(() => {
      bus.t = 54; P.state = 'play'; D.invuln = true; H.pause.style.display = 'none'; fadeT = 0; H.fade.style.opacity = '0';
      const at = (q.get('at') || '40,125').split(',').map(Number); P.pos = [at[0]!, 0, at[1]!]; P.pos[1] = W.groundH(at[0]!, at[1]!, 0) + 0.3; P.vel = [0, 0, 0];
      P.yaw = +(q.get('yaw') || 0.3); P.pitch = +(q.get('pitch') || 0.05); P.inv[0] = mkItem('ar', 1, 2); P.slot = q.get('slot') === 'pick' ? -1 : 0;
      if (q.get('hud') === '0') H.hud.style.display = 'none';
      if (q.get('bot')) { for (const o of bots) o.dead = true; const b = spawnBot([at[0]! - 7, P.pos[1] + 1, at[1]! - 12], 2); b.state = 'ground'; b.yaw = 2.6; }
      if (q.get('fly')) { D.fly = true; P.pos[1] += +q.get('fly')!; }
    }, 600);
  }, 1500);
}
(window as any).G = { NET, H, beep, unlockAudio, IN, mmBg: () => mmBg, PROF, nades, chests, P, W, items, bots, mouse, fx, bus, storm, startMatch, D, spawnBot, nextStormPhase, endScreen, damage, dropItem, mkItem, toLobby, addFeed, banner };
