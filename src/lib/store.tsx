import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_SETTINGS, type Pick, type RoomState, type ServerMessage, type Settings, type Vote } from "../../shared/types";
import { USERS, otherUser, type User, type UserId } from "../../shared/users";
import type { Film, Programme } from "../types";
import { api, connectRoom } from "./api";
import { sortViews, viewFilm, type FilmView } from "./deck";
import { relativeDay } from "./format";

export interface MatchEvent {
  filmId: string;
  /** Who completed the match. */
  by: UserId;
  /** Match happened while this person was away. */
  missed?: boolean;
}

export interface Toast {
  id: number;
  text: string;
  tone?: "info" | "match";
}

interface Store {
  me: User;
  partner: User;
  programme: Programme;
  films: Map<string, Film>;
  room: RoomState;
  connected: boolean;
  now: Date;
  views: FilmView[]; // every film that passes the filters, in deck order
  deck: FilmView[]; // ...minus the ones I already voted on
  matchQueue: MatchEvent[];
  toasts: Toast[];
  canUndo: boolean;
  vote: (filmId: string, vote: Vote | null) => void;
  /** Mark the screening we're going to for a matched film (`null` to undo). */
  pick: (filmId: string, screeningId: string | null) => void;
  undo: () => string | null;
  updateSettings: (patch: Partial<Settings>) => void;
  dismissMatch: () => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
  resetVotes: () => Promise<void>;
  logout: () => Promise<void>;
}

function withPick(picks: Record<string, Pick>, filmId: string, pick: Pick | null) {
  const next = { ...picks };
  if (pick) next[filmId] = pick;
  else delete next[filmId];
  return next;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => useContext(Ctx)!;

const emptyRoom = (): RoomState => ({
  votes: Object.fromEntries(USERS.map((u) => [u.id, {}])) as RoomState["votes"],
  matches: [],
  seen: Object.fromEntries(USERS.map((u) => [u.id, []])) as unknown as RoomState["seen"],
  picks: {},
  settings: DEFAULT_SETTINGS,
  online: [],
});

export function StoreProvider({
  me,
  programme,
  initialRoom,
  onLogout,
  children,
}: {
  me: User;
  programme: Programme;
  initialRoom: RoomState;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [room, setRoom] = useState<RoomState>(() => ({ ...emptyRoom(), ...initialRoom }));
  const [connected, setConnected] = useState(false);
  const [matchQueue, setMatchQueue] = useState<MatchEvent[]>(() =>
    initialRoom.matches
      .filter((m) => !initialRoom.seen[me.id]?.includes(m.filmId))
      .map((m) => ({ filmId: m.filmId, by: otherUser(me.id).id, missed: true })),
  );
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Each vote I cast, with what it replaced, so undo can put it back.
  const [history, setHistory] = useState<{ filmId: string; prev: Vote | null }[]>([]);
  const [now, setNow] = useState(() => new Date());
  const partner = otherUser(me.id);
  const films = useMemo(() => new Map(programme.films.map((f) => [f.id, f])), [programme]);
  const roomRef = useRef(room);
  roomRef.current = room;
  const lastPresenceToast = useRef(0);
  const lastSettingsToast = useRef(0);
  const settingsTimer = useRef<ReturnType<typeof setTimeout>>();
  const pending = useRef<Partial<Settings>>({});

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const toast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const applyVote = useCallback((user: UserId, filmId: string, vote: Vote | null, at: number, match: boolean) => {
    setRoom((r) => {
      const mine = { ...r.votes[user] };
      if (vote) mine[filmId] = { vote, at };
      else delete mine[filmId];
      const has = r.matches.some((m) => m.filmId === filmId);
      const matches = match ? (has ? r.matches : [{ filmId, at }, ...r.matches]) : r.matches.filter((m) => m.filmId !== filmId);
      // The server drops the pick together with the match.
      const picks = !match && r.picks[filmId] ? withPick(r.picks, filmId, null) : r.picks;
      return { ...r, votes: { ...r.votes, [user]: mine }, matches, picks };
    });
    // A match that's gone (undo, flipped vote) must not linger in the queue: if it comes back,
    // it's a new event with a new "who completed it".
    if (!match) setMatchQueue((q) => (q.some((x) => x.filmId === filmId) ? q.filter((x) => x.filmId !== filmId) : q));
  }, []);

  // Live updates from the room.
  useEffect(() => {
    let first = true;
    return connectRoom(
      (m: ServerMessage) => {
        if (m.type === "vote") {
          applyVote(m.user, m.filmId, m.vote, m.at, m.match);
          if (m.newMatch && m.user !== me.id) {
            setMatchQueue((q) => (q.some((x) => x.filmId === m.filmId) ? q : [...q, { filmId: m.filmId, by: m.user }]));
            if (navigator.vibrate) navigator.vibrate([30, 40, 60]);
          }
        } else if (m.type === "settings") {
          // Keep my own edits that haven't been sent yet on top of what the server echoes back.
          setRoom((r) => ({ ...r, settings: { ...m.settings, ...pending.current } }));
          if (m.settings.updatedBy && m.settings.updatedBy !== me.id && Date.now() - lastSettingsToast.current > 10_000) {
            lastSettingsToast.current = Date.now();
            toast(`${partner.name} tweaked the filters`);
          }
        } else if (m.type === "presence") {
          setRoom((r) => {
            const wasOnline = r.online.includes(partner.id);
            const isOnline = m.online.includes(partner.id);
            // Reconnects flap presence; only announce once in a while.
            if (!wasOnline && isOnline && Date.now() - lastPresenceToast.current > 120_000) {
              lastPresenceToast.current = Date.now();
              toast(`${partner.name} is swiping too`);
            }
            return { ...r, online: m.online };
          });
        } else if (m.type === "pick") {
          setRoom((r) => ({ ...r, picks: withPick(r.picks, m.filmId, m.pick) }));
          if (m.pick && m.pick.by !== me.id) {
            const f = films.get(m.filmId);
            const s = f?.screenings.find((x) => x.id === m.pick!.screeningId);
            if (f && s) toast(`${partner.name} picked ${f.title} · ${relativeDay(s.date)} ${s.time}`, "match");
          }
        } else if (m.type === "reset") {
          api.state().then(setRoom);
        }
      },
      (ok) => {
        setConnected(ok);
        // Catch up on anything missed while disconnected.
        if (ok && !first) api.state().then(setRoom).catch(() => {});
        first = false;
      },
    );
  }, [me.id, partner.id, partner.name, films, applyVote, toast]);

  const views = useMemo(
    () => sortViews(programme.films.map((f) => viewFilm(f, room.settings, now)).filter((v) => v.passes), room.settings.order),
    [programme, room.settings, now],
  );
  const myVotes = room.votes[me.id] || {};
  const deck = useMemo(() => views.filter((v) => !myVotes[v.film.id]), [views, myVotes]);

  const markSeenLocally = useCallback(
    (filmId: string) =>
      setRoom((r) => {
        const mine = r.seen[me.id] || [];
        return mine.includes(filmId) ? r : { ...r, seen: { ...r.seen, [me.id]: [...mine, filmId] } };
      }),
    [me.id],
  );

  const sendVote = useCallback(
    (filmId: string, v: Vote | null) => {
      const prev = roomRef.current.votes[me.id]?.[filmId];
      const partnerLikes = roomRef.current.votes[partner.id]?.[filmId]?.vote === "like";
      const predictedMatch = v === "like" && partnerLikes;
      applyVote(me.id, filmId, v, Date.now(), predictedMatch);
      if (predictedMatch && !roomRef.current.matches.some((m) => m.filmId === filmId)) {
        // The server marks the match as seen for whoever completes it; mirror that locally.
        markSeenLocally(filmId);
        setMatchQueue((q) => [...q, { filmId, by: me.id }]);
        if (navigator.vibrate) navigator.vibrate([30, 40, 60]);
      }
      api
        .vote(filmId, v)
        .then((res) => applyVote(me.id, filmId, res.vote, res.at, res.match))
        .catch(() => {
          applyVote(me.id, filmId, prev?.vote ?? null, prev?.at ?? 0, false);
          toast("Couldn't save that vote — check your connection");
        });
    },
    [me.id, partner.id, applyVote, markSeenLocally, toast],
  );

  const vote = useCallback(
    (filmId: string, v: Vote | null) => {
      const prev = roomRef.current.votes[me.id]?.[filmId]?.vote ?? null;
      if (v && v !== prev) setHistory((h) => [...h.slice(-50), { filmId, prev }]);
      sendVote(filmId, v);
    },
    [me.id, sendVote],
  );

  const pick = useCallback(
    (filmId: string, screeningId: string | null) => {
      const prev = roomRef.current.picks[filmId] ?? null;
      const next = screeningId ? { screeningId, by: me.id, at: Date.now() } : null;
      setRoom((r) => ({ ...r, picks: withPick(r.picks, filmId, next) }));
      api
        .pick(filmId, screeningId)
        .then((res) => setRoom((r) => ({ ...r, picks: withPick(r.picks, filmId, res.pick) })))
        .catch(() => {
          setRoom((r) => ({ ...r, picks: withPick(r.picks, filmId, prev) }));
          toast("Couldn't save that pick — check your connection");
        });
    },
    [me.id, toast],
  );

  const undo = useCallback(() => {
    const last = history[history.length - 1];
    if (!last) return null;
    setHistory((h) => h.slice(0, -1));
    sendVote(last.filmId, last.prev);
    return last.filmId;
  }, [history, sendVote]);

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      setRoom((r) => ({ ...r, settings: { ...r.settings, ...patch } }));
      pending.current = { ...pending.current, ...patch };
      clearTimeout(settingsTimer.current);
      settingsTimer.current = setTimeout(() => {
        const p = pending.current;
        pending.current = {};
        api.settings(p).catch(() => toast("Couldn't save the filters"));
      }, 350);
    },
    [toast],
  );

  const dismissMatch = useCallback(() => {
    const first = matchQueue.find((m) => films.has(m.filmId) && room.matches.some((x) => x.filmId === m.filmId));
    setMatchQueue((q) => q.filter((m) => m !== first && room.matches.some((x) => x.filmId === m.filmId)));
    if (first) {
      markSeenLocally(first.filmId);
      api.seen([first.filmId]).catch(() => {});
    }
  }, [matchQueue, films, room.matches, markSeenLocally]);

  const resetVotes = useCallback(async () => {
    setRoom(await api.reset());
    setHistory([]);
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    onLogout();
  }, [onLogout]);

  const value: Store = {
    me,
    partner,
    programme,
    films,
    room,
    connected,
    now,
    views,
    deck,
    // A match can disappear again (undo, flipped vote, reset); never celebrate one that's gone.
    matchQueue: matchQueue.filter((m) => films.has(m.filmId) && room.matches.some((x) => x.filmId === m.filmId)),
    toasts,
    canUndo: history.length > 0,
    vote,
    pick,
    undo,
    updateSettings,
    dismissMatch,
    toast,
    resetVotes,
    logout,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
