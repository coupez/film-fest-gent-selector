import type { RoomState, ServerMessage, Settings, Vote } from "../../shared/types";
import type { User, UserId } from "../../shared/users";
import type { Programme } from "../types";

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  if (!res.ok) throw Object.assign(new Error(`${res.status} ${path}`), { status: res.status });
  return res.json();
}

export const api = {
  me: () => call<{ user: UserId | null; users: User[] }>("/api/me"),
  login: (user: UserId) => call<{ user: UserId }>("/api/login", { user }),
  logout: () => call("/api/logout", {}),
  state: () => call<RoomState>("/api/state"),
  vote: (filmId: string, vote: Vote | null) =>
    call<Extract<ServerMessage, { type: "vote" }>>("/api/vote", { filmId, vote }),
  settings: (settings: Partial<Settings>) => call<Settings>("/api/settings", { settings }),
  seen: (filmIds: string[]) => call("/api/seen", { filmIds }),
  reset: () => call<RoomState>("/api/reset", {}),
  programme: () =>
    fetch("/data/films.json").then((r) => {
      if (!r.ok) throw new Error("Could not load the programme");
      return r.json() as Promise<Programme>;
    }),
};

/** A self-healing WebSocket to the room. */
export function connectRoom(onMessage: (m: ServerMessage) => void, onStatus: (connected: boolean) => void) {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let ping: ReturnType<typeof setInterval> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const open = () => {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}/api/ws`);
    ws.onopen = () => {
      retry = 0;
      onStatus(true);
      ping = setInterval(() => ws?.readyState === 1 && ws.send("ping"), 25000);
    };
    ws.onmessage = (e) => {
      if (e.data === "pong") return;
      try {
        onMessage(JSON.parse(e.data));
      } catch {}
    };
    ws.onclose = () => {
      clearInterval(ping);
      onStatus(false);
      if (!closed) timer = setTimeout(open, Math.min(10000, 500 * 2 ** retry++));
    };
  };
  open();
  const wake = () => {
    if (!closed && ws && ws.readyState > 1) {
      clearTimeout(timer);
      open();
    }
  };
  document.addEventListener("visibilitychange", wake);
  return () => {
    closed = true;
    clearTimeout(timer);
    clearInterval(ping);
    document.removeEventListener("visibilitychange", wake);
    ws?.close();
  };
}
