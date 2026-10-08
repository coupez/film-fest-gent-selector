import { DurableObject } from "cloudflare:workers";
import { USERS, findUser, type UserId } from "../shared/users";
import { DEFAULT_SETTINGS, type Pick, type RoomState, type Settings, type Vote, type ServerMessage } from "../shared/types";

export interface Env {
  ROOM: DurableObjectNamespace<Room>;
  ASSETS: Fetcher;
  SESSION_SECRET?: string;
}

const COOKIE = "ffg_session";
const ROOM_NAME = "ffg-2026";

// ---------------------------------------------------------------------------
// Session cookie: "<userId>.<hmac>". For now logging in is just picking a name;
// a magic-link flow can later issue the same cookie after verifying an email.
// ---------------------------------------------------------------------------
async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]!);
}

const secretOf = (env: Env) => env.SESSION_SECRET || "dev-secret-change-me";

async function sessionUser(req: Request, env: Env): Promise<UserId | null> {
  const raw = req.headers.get("Cookie")?.match(new RegExp(`${COOKIE}=([^;]+)`))?.[1];
  if (!raw) return null;
  const [id, sig] = decodeURIComponent(raw).split(".");
  if (!findUser(id) || sig !== (await hmac(secretOf(env), id))) return null;
  return id as UserId;
}

async function sessionCookie(env: Env, user: UserId | null, secure: boolean) {
  const flags = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${user ? 60 * 60 * 24 * 90 : 0}${secure ? "; Secure" : ""}`;
  return `${COOKIE}=${user ? encodeURIComponent(`${user}.${await hmac(secretOf(env), user)}`) : ""}; ${flags}`;
}

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...(init.headers || {}) },
  });

// ---------------------------------------------------------------------------
// Worker: API routes; everything else is served from static assets.
// ---------------------------------------------------------------------------
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);

    const room = env.ROOM.get(env.ROOM.idFromName(ROOM_NAME));
    // Behind a tunnel (cloudflared → localhost) the Worker sees http; the browser is still on https.
    const secure = url.protocol === "https:" || req.headers.get("X-Forwarded-Proto") === "https";

    if (url.pathname === "/api/login" && req.method === "POST") {
      const { user } = (await req.json().catch(() => ({}))) as { user?: string };
      if (!findUser(user)) return json({ error: "Unknown user" }, { status: 400 });
      return json({ user }, { headers: { "Set-Cookie": await sessionCookie(env, user as UserId, secure) } });
    }
    if (url.pathname === "/api/logout" && req.method === "POST") {
      return json({ ok: true }, { headers: { "Set-Cookie": await sessionCookie(env, null, secure) } });
    }

    const user = await sessionUser(req, env);
    if (url.pathname === "/api/me") return json({ user, users: USERS });
    if (!user) return json({ error: "Not logged in" }, { status: 401 });

    if (url.pathname === "/api/ws") {
      if (req.headers.get("Upgrade") !== "websocket") return json({ error: "Expected websocket" }, { status: 426 });
      const headers = new Headers(req.headers);
      headers.set("X-User", user);
      return room.fetch(new Request(req.url, { headers }));
    }

    const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {};
    switch (`${req.method} ${url.pathname}`) {
      case "GET /api/state":
        return json(await room.getState());
      case "POST /api/vote": {
        const vote = body.vote as Vote | null;
        if (typeof body.filmId !== "string" || (vote !== null && vote !== "like" && vote !== "nope"))
          return json({ error: "Bad vote" }, { status: 400 });
        return json(await room.vote(user, body.filmId, vote));
      }
      case "POST /api/settings": {
        const patch = body.settings;
        if (!patch || typeof patch !== "object" || Array.isArray(patch)) return json({ error: "Bad settings" }, { status: 400 });
        // Only accept known keys, so a stray field can't end up in everyone's shared settings.
        const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => k in DEFAULT_SETTINGS)) as Partial<Settings>;
        return json(await room.setSettings(user, clean));
      }
      case "POST /api/seen": {
        const ids = body.filmIds;
        if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string")) return json({ error: "Bad filmIds" }, { status: 400 });
        await room.markSeen(user, ids);
        return json({ ok: true });
      }
      case "POST /api/pick": {
        const { filmId, screeningId } = body;
        if (typeof filmId !== "string" || (screeningId !== null && typeof screeningId !== "string"))
          return json({ error: "Bad pick" }, { status: 400 });
        return json(await room.pick(user, filmId, screeningId));
      }
      case "POST /api/reset":
        await room.resetVotes(user);
        return json(await room.getState());
    }
    return json({ error: "Not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

// ---------------------------------------------------------------------------
// Room: one Durable Object holds both people's votes, the shared filters and the
// matches, and pushes every change to connected clients over WebSockets.
// ---------------------------------------------------------------------------
export class Room extends DurableObject<Env> {
  sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS votes (user TEXT, film_id TEXT, vote TEXT, at INTEGER, PRIMARY KEY (user, film_id));
      CREATE TABLE IF NOT EXISTS matches (film_id TEXT PRIMARY KEY, at INTEGER);
      CREATE TABLE IF NOT EXISTS seen (user TEXT, film_id TEXT, PRIMARY KEY (user, film_id));
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS picks (film_id TEXT PRIMARY KEY, screening_id TEXT, by TEXT, at INTEGER);
    `);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  private settings(): Settings {
    const row = this.sql.exec<{ value: string }>("SELECT value FROM kv WHERE key = 'settings'").toArray()[0];
    const stored = row ? (JSON.parse(row.value) as Partial<Settings>) : {};
    return { ...DEFAULT_SETTINGS, ...stored, langs: { ...DEFAULT_SETTINGS.langs, ...(stored.langs || {}) } };
  }

  private online(): UserId[] {
    return [...new Set(this.ctx.getWebSockets().flatMap((ws) => this.ctx.getTags(ws)))] as UserId[];
  }

  async getState(): Promise<RoomState> {
    const votes = Object.fromEntries(USERS.map((u) => [u.id, {}])) as RoomState["votes"];
    for (const r of this.sql.exec<{ user: UserId; film_id: string; vote: Vote; at: number }>("SELECT * FROM votes")) {
      if (votes[r.user]) votes[r.user][r.film_id] = { vote: r.vote, at: r.at };
    }
    const seen = Object.fromEntries(USERS.map((u) => [u.id, [] as string[]])) as RoomState["seen"];
    for (const r of this.sql.exec<{ user: UserId; film_id: string }>("SELECT * FROM seen")) seen[r.user]?.push(r.film_id);
    const matches = this.sql
      .exec<{ film_id: string; at: number }>("SELECT * FROM matches ORDER BY at DESC")
      .toArray()
      .map((r) => ({ filmId: r.film_id, at: r.at }));
    const picks: RoomState["picks"] = {};
    for (const r of this.sql.exec<{ film_id: string; screening_id: string; by: UserId; at: number }>("SELECT * FROM picks"))
      picks[r.film_id] = { screeningId: r.screening_id, by: r.by, at: r.at };
    return { votes, matches, seen, picks, settings: this.settings(), online: this.online() };
  }

  async vote(user: UserId, filmId: string, vote: Vote | null) {
    const at = Date.now();
    if (vote) {
      this.sql.exec(
        "INSERT INTO votes VALUES (?, ?, ?, ?) ON CONFLICT (user, film_id) DO UPDATE SET vote = excluded.vote, at = excluded.at",
        user,
        filmId,
        vote,
        at,
      );
    } else {
      this.sql.exec("DELETE FROM votes WHERE user = ? AND film_id = ?", user, filmId);
    }
    const likes = this.sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM votes WHERE film_id = ? AND vote = 'like'", filmId)
      .one().n;
    const isMatch = likes >= USERS.length;
    const wasMatch = this.sql.exec("SELECT 1 FROM matches WHERE film_id = ?", filmId).toArray().length > 0;
    if (isMatch && !wasMatch) {
      this.sql.exec("INSERT INTO matches VALUES (?, ?)", filmId, at);
      // The person completing the match sees it right away.
      this.sql.exec("INSERT OR IGNORE INTO seen VALUES (?, ?)", user, filmId);
    } else if (!isMatch && wasMatch) {
      this.sql.exec("DELETE FROM matches WHERE film_id = ?", filmId);
      this.sql.exec("DELETE FROM seen WHERE film_id = ?", filmId);
      this.sql.exec("DELETE FROM picks WHERE film_id = ?", filmId);
    }
    const msg: ServerMessage = { type: "vote", user, filmId, vote, at, match: isMatch, newMatch: isMatch && !wasMatch };
    this.broadcast(msg);
    return msg;
  }

  /** Choose the screening we'll go to for a matched film, or clear it with `null`. */
  async pick(user: UserId, filmId: string, screeningId: string | null) {
    const isMatch = this.sql.exec("SELECT 1 FROM matches WHERE film_id = ?", filmId).toArray().length > 0;
    let pick: Pick | null = null;
    if (screeningId && isMatch) {
      pick = { screeningId, by: user, at: Date.now() };
      this.sql.exec("INSERT OR REPLACE INTO picks VALUES (?, ?, ?, ?)", filmId, screeningId, user, pick.at);
    } else {
      this.sql.exec("DELETE FROM picks WHERE film_id = ?", filmId);
    }
    const msg: ServerMessage = { type: "pick", filmId, pick };
    this.broadcast(msg);
    return msg;
  }

  async setSettings(user: UserId, patch: Partial<Settings>) {
    const next = { ...this.settings(), ...patch, updatedBy: user, updatedAt: Date.now() };
    this.sql.exec("INSERT OR REPLACE INTO kv VALUES ('settings', ?)", JSON.stringify(next));
    this.broadcast({ type: "settings", settings: next });
    return next;
  }

  async markSeen(user: UserId, filmIds: string[]) {
    for (const id of filmIds) this.sql.exec("INSERT OR IGNORE INTO seen VALUES (?, ?)", user, id);
  }

  async resetVotes(user: UserId) {
    this.sql.exec("DELETE FROM votes WHERE user = ?", user);
    this.sql.exec("DELETE FROM matches");
    this.sql.exec("DELETE FROM seen");
    this.sql.exec("DELETE FROM picks");
    this.broadcast({ type: "reset", user });
  }

  private broadcast(msg: ServerMessage) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {}
    }
  }

  async fetch(req: Request) {
    const user = req.headers.get("X-User") as UserId;
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [user]);
    queueMicrotask(() => this.broadcast({ type: "presence", online: this.online() }));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage() {}

  async webSocketClose(ws: WebSocket) {
    try {
      ws.close();
    } catch {}
    this.broadcast({ type: "presence", online: this.online().filter((u) => this.ctx.getWebSockets(u).some((w) => w !== ws)) });
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }
}
