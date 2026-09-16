// Engine audio: one AudioEngine with the standard bus layout (master → sfx / voice / ui / music). The old
// one-shot synth "beeps" are rendered once into AudioBuffers and registered as clips, so they play through
// the mixer with bus volumes, distance attenuation and the listener like any authored clip.
import { AudioEngine, applyVolumeSettings, standardBusLayout, type AudioPlayOptions } from '@vapour/engine';

const ctx = new AudioContext();
export const AUDIO = new AudioEngine(ctx);
for (const bus of standardBusLayout()) if (bus.id !== "master") AUDIO.defineBus(bus);   // the engine creates master itself
export const unlockAudio = () => AUDIO.unlock().catch(() => {});
export const setVolumes = (s: { master: number; sfx: number; voice: number; music: number }) => applyVolumeSettings(AUDIO, { master: s.master, sfx: s.sfx, voice: s.voice, music: s.music, ui: s.sfx });

const clips = new Set<string>();
/** Renders a decaying oscillator tone (optionally sliding in pitch) into a clip, keyed by its parameters. */
function toneClip(f: number, dur: number, type: OscillatorType, slide: number): string {
  const id = `tone:${type}:${f}:${dur}:${slide}`;
  if (clips.has(id)) return id;
  const sr = ctx.sampleRate, n = Math.max(1, Math.floor(sr * dur)), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  let phase = 0; const f1 = Math.max(20, f + slide);
  for (let i = 0; i < n; i++) {
    const t = i / n, freq = slide ? f * Math.pow(f1 / f, t) : f; phase += freq / sr; const p = phase % 1;
    const w = type === 'sine' ? Math.sin(p * Math.PI * 2) : type === 'square' ? (p < 0.5 ? 1 : -1) : type === 'sawtooth' ? p * 2 - 1 : 1 - Math.abs(p * 4 - 2);
    d[i] = w * Math.pow(0.001, t) * (i < 64 ? i / 64 : 1);   // exponential decay to -60 dB, short attack to avoid clicks
  }
  AUDIO.registerClip(id, buf); clips.add(id); return id;
}
/** Plays a synth tone. With `at` it is positional in the world; otherwise it is a UI/player sound. */
export function beep(f: number, dur: number, type: OscillatorType = 'square', vol = 0.08, slide = 0, at?: readonly [number, number, number]) {
  if (ctx.state !== 'running') return;
  const opts: AudioPlayOptions = at ? { bus: 'sfx', volume: vol * 4, position: at, minDistance: 6, maxDistance: 120, distanceModel: 'inverse', rolloffFactor: 1.2 } : { bus: 'sfx', volume: vol * 4 };
  try { AUDIO.play(toneClip(f, dur, type, slide), opts); } catch {}
}
const loading = new Map<string, Promise<void>>();
/** Plays an authored clip (mp3 under assets/Audio) positionally on the voice bus, loading it on first use. */
export function voiceAt(file: string, at: readonly [number, number, number], vol = 1) {
  if (ctx.state !== 'running') return;
  const id = 'voice:' + file;
  let p = loading.get(id); if (!p) { p = AUDIO.loadClip(id, 'assets/Audio/' + file).catch(() => {}); loading.set(id, p); }
  void p.then(() => { try { AUDIO.play(id, { bus: 'voice', volume: vol, position: at, minDistance: 8, maxDistance: 70, distanceModel: 'linear' }); } catch {} });
}
export const setListener = (pos: readonly [number, number, number], fwd: readonly [number, number, number]) => { if (ctx.state === 'running') AUDIO.setListener(pos, fwd, [0, 1, 0]); };
