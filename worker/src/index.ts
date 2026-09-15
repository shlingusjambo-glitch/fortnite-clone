// Game rooms: one Durable Object per party/match code. It is a lobby + WebSocket relay: the first member is the
// host and runs the authoritative simulation in their browser; the room fans host snapshots out to everyone and
// forwards each client's inputs/events to the host. Host migration promotes the next member if the host drops.
export interface Env { ROOMS: DurableObjectNamespace; }

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
const code = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname === '/room' && req.method === 'POST') { const c = code(); return json({ code: c }); }
    const m = url.pathname.match(/^\/room\/([A-Z0-9]{5})(\/ws)?$/);
    if (!m) return json({ error: 'not found' }, 404);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]!));
    return stub.fetch(req);
  },
};

interface Member { id: number; name: string; skin: number; team: number; }
type Attach = { id: number; name: string; skin: number };

export class Room implements DurableObject {
  private nextId = 1; private hostId = 0; private started: unknown = null;
  constructor(private state: DurableObjectState, _env: Env) {}

  private sockets(): WebSocket[] { return this.state.getWebSockets(); }
  private info(ws: WebSocket): Attach { return ws.deserializeAttachment() as Attach; }
  private members(): Member[] { return this.sockets().map((ws, i) => { const a = this.info(ws); return { id: a.id, name: a.name, skin: a.skin, team: i }; }); }
  private broadcast(msg: unknown, except?: WebSocket) { const s = JSON.stringify(msg); for (const ws of this.sockets()) if (ws !== except) { try { ws.send(s); } catch { /* closing */ } } }
  private hostSocket(): WebSocket | undefined { return this.sockets().find(ws => this.info(ws).id === this.hostId); }
  private roster() { this.broadcast({ t: 'members', host: this.hostId, list: this.members(), started: this.started }); }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.endsWith('/ws')) return json({ members: this.members(), host: this.hostId, started: !!this.started });
    if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected websocket' }, 426);
    if (this.sockets().length >= 16) return json({ error: 'room full' }, 403);
    const pair = new WebSocketPair(); const [client, server] = [pair[0], pair[1]];
    const id = this.nextId++, name = (url.searchParams.get('name') || 'Player').slice(0, 16), skin = +(url.searchParams.get('skin') || 0);
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ id, name, skin } satisfies Attach);
    if (!this.hostId || !this.hostSocket()) this.hostId = id;
    server.send(JSON.stringify({ t: 'hello', id, host: this.hostId, started: this.started }));
    this.roster();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string') return;
    const me = this.info(ws); let msg: { t: string; to?: number; [k: string]: unknown };
    try { msg = JSON.parse(raw); } catch { return; }
    msg['from'] = me.id;
    switch (msg.t) {
      case 'start': if (me.id === this.hostId) { this.started = msg; this.broadcast(msg); } break;          // host launches the match (seed, mode, teams)
      case 'snap': case 'ev': case 'piece': case 'item': case 'dmg': case 'feed':                            // host → everyone (or one target)
        if (me.id !== this.hostId) return;
        if (msg.to) { const tgt = this.sockets().find(s => this.info(s).id === msg.to); tgt?.send(JSON.stringify(msg)); } else this.broadcast(msg, ws);
        break;
      case 'in': case 'act': { const h = this.hostSocket(); if (h && h !== ws) h.send(JSON.stringify(msg)); break; }   // client → host
      case 'chat': this.broadcast(msg); break;
      case 'skin': ws.serializeAttachment({ ...me, skin: msg['skin'] as number }); this.roster(); break;
      case 'ping': ws.send(JSON.stringify({ t: 'pong', ts: msg['ts'] })); break;
    }
  }
  async webSocketClose(ws: WebSocket) { this.drop(ws); }
  async webSocketError(ws: WebSocket) { this.drop(ws); }
  private drop(ws: WebSocket) {
    const me = this.info(ws); try { ws.close(); } catch { /* already closed */ }
    const left = this.sockets().filter(s => s !== ws);
    if (me.id === this.hostId) { this.hostId = left.length ? this.info(left[0]!).id : 0; if (this.hostId) this.broadcast({ t: 'host', host: this.hostId }); else this.started = null; }
    this.broadcast({ t: 'left', id: me.id });
    this.roster();
  }
}
