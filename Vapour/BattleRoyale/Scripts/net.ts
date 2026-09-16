// Party/match networking on the engine's WebSocketTransport (connect timeout, bounded send queue) over the Cloudflare
// room relay. One member (the host) runs the authoritative simulation in their browser and streams snapshots; other
// members send their own state and actions. The game registers handlers through `NET.on`.
import { WebSocketTransport } from '@vapour/engine';
export const ROOMS_URL = 'https://fortnite-rooms.shlingusjambo.workers.dev';

export interface Member { id: number; name: string; skin: number; team: number; }
type Handler = (msg: any) => void;

export const NET = {
  ws: null as WebSocketTransport | null, id: 0, hostId: 0, code: '', members: [] as Member[], started: null as any, rtt: 0,
  handlers: new Map<string, Handler[]>(),
  connected() { return !!this.ws && this.ws.state === 'connected'; },
  isHost() { return !this.connected() || this.id === this.hostId; },
  /** true while playing with other humans (a party of one plays offline) */
  active() { return this.connected() && this.members.length > 1; },
  send(msg: Record<string, unknown>) { if (this.connected()) { try { this.ws!.send(JSON.stringify(msg)); } catch { /* buffer limit: drop this update, the next snapshot supersedes it */ } } },
  on(type: string, fn: Handler) { const a = this.handlers.get(type) ?? []; a.push(fn); this.handlers.set(type, a); },
  emit(msg: any) { for (const fn of this.handlers.get(msg.t) ?? []) fn(msg); },
  async createRoom(): Promise<string> { const r = await fetch(ROOMS_URL + '/room', { method: 'POST' }); return (await r.json()).code; },
  join(code: string, name: string, skin: number): Promise<void> {
    this.leave();
    return new Promise((resolve, reject) => {
      const ws = new WebSocketTransport(`${ROOMS_URL.replace('https', 'wss')}/room/${code}/ws?name=${encodeURIComponent(name)}&skin=${skin}`, { connectTimeoutMs: 8000, maxBufferedBytes: 1 << 20 });
      let settled = false;
      ws.onMessage(ev => {
        const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data));
        if (msg.t === 'hello') { this.id = msg.id; this.hostId = msg.host; this.started = msg.started; this.code = code; if (!settled) { settled = true; resolve(); } }
        else if (msg.t === 'members') { this.members = msg.list; this.hostId = msg.host; }
        else if (msg.t === 'host') this.hostId = msg.host;
        else if (msg.t === 'pong') this.rtt = performance.now() - msg.ts;
        this.emit(msg);
      });
      ws.onDisconnect(() => { if (this.ws === ws) { this.ws = null; this.members = []; this.emit({ t: 'closed' }); } if (!settled) { settled = true; reject(new Error('connect failed')); } });
      this.ws = ws;
      ws.connect().catch(e => { if (!settled) { settled = true; reject(e instanceof Error ? e : new Error('connect failed')); } });
    });
  },
  leave() { if (this.ws) { const w = this.ws; this.ws = null; w.disconnect(); } this.members = []; this.code = ''; this.id = 0; this.hostId = 0; this.started = null; },
  setSkin(skin: number) { this.send({ t: 'skin', skin }); },
  me(): Member | undefined { return this.members.find(m => m.id === this.id); },
};
setInterval(() => NET.send({ t: 'ping', ts: performance.now() }), 5000);
