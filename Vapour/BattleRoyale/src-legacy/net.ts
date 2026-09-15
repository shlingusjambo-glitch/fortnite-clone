// Party/match networking over the Cloudflare room relay. One member (the host) runs the authoritative
// simulation in their browser and streams snapshots; other members send their own state and actions.
// The game registers handlers through `NET.on`; everything else here is transport plumbing.
export const ROOMS_URL = 'https://fortnite-rooms.shlingusjambo.workers.dev';

export interface Member { id: number; name: string; skin: number; team: number; }
type Handler = (msg: any) => void;

export const NET = {
  ws: null as WebSocket | null, id: 0, hostId: 0, code: '', members: [] as Member[], started: null as any, rtt: 0,
  handlers: new Map<string, Handler[]>(),
  connected() { return !!this.ws && this.ws.readyState === WebSocket.OPEN; },
  isHost() { return !this.connected() || this.id === this.hostId; },
  /** true while playing with other humans (a party of one plays offline) */
  active() { return this.connected() && this.members.length > 1; },
  send(msg: Record<string, unknown>) { if (this.connected()) this.ws!.send(JSON.stringify(msg)); },
  on(type: string, fn: Handler) { const a = this.handlers.get(type) ?? []; a.push(fn); this.handlers.set(type, a); },
  emit(msg: any) { for (const fn of this.handlers.get(msg.t) ?? []) fn(msg); },
  async createRoom(): Promise<string> { const r = await fetch(ROOMS_URL + '/room', { method: 'POST' }); return (await r.json()).code; },
  join(code: string, name: string, skin: number): Promise<void> {
    this.leave();
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${ROOMS_URL.replace('https', 'wss')}/room/${code}/ws?name=${encodeURIComponent(name)}&skin=${skin}`);
      const timer = setTimeout(() => { reject(new Error('timeout')); ws.close(); }, 8000);
      ws.onmessage = ev => {
        const msg = JSON.parse(ev.data);
        if (msg.t === 'hello') { this.id = msg.id; this.hostId = msg.host; this.started = msg.started; this.code = code; clearTimeout(timer); resolve(); }
        else if (msg.t === 'members') { this.members = msg.list; this.hostId = msg.host; }
        else if (msg.t === 'host') this.hostId = msg.host;
        else if (msg.t === 'pong') this.rtt = performance.now() - msg.ts;
        this.emit(msg);
      };
      ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.members = []; this.emit({ t: 'closed' }); } };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('connect failed')); };
      this.ws = ws;
    });
  },
  leave() { if (this.ws) { const w = this.ws; this.ws = null; w.close(); } this.members = []; this.code = ''; this.id = 0; this.hostId = 0; this.started = null; },
  setSkin(skin: number) { this.send({ t: 'skin', skin }); },
  me(): Member | undefined { return this.members.find(m => m.id === this.id); },
};
setInterval(() => NET.send({ t: 'ping', ts: performance.now() }), 5000);
