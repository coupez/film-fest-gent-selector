import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import type { RoomState } from "../shared/types";
import { findUser, type UserId } from "../shared/users";
import { Deck } from "./components/Deck";
import { Avatar, Icon } from "./components/Icon";
import { Login } from "./components/Login";
import { MatchModal } from "./components/MatchModal";
import { Matches } from "./components/Matches";
import { Setup } from "./components/Setup";
import { Toasts } from "./components/Toasts";
import { api } from "./lib/api";
import { posterOf } from "./lib/deck";
import { StoreProvider, useStore } from "./lib/store";
import type { Programme } from "./types";

type Boot =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "login"; programme: Programme }
  | { phase: "ready"; programme: Programme; user: UserId; room: RoomState };

export function App() {
  const [boot, setBoot] = useState<Boot>({ phase: "loading" });

  const start = useCallback(async () => {
    try {
      const [me, programme] = await Promise.all([api.me(), api.programme()]);
      if (!me.user) return setBoot({ phase: "login", programme });
      const room = await api.state();
      setBoot({ phase: "ready", programme, user: me.user, room });
    } catch (e) {
      setBoot({ phase: "error", message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    start();
  }, [start]);

  if (boot.phase === "loading") return <Splash />;
  if (boot.phase === "error")
    return (
      <div className="splash">
        <p>Something went wrong: {boot.message}</p>
        <button className="btn" onClick={start}>
          Try again
        </button>
      </div>
    );
  if (boot.phase === "login")
    return (
      <Login
        posters={boot.programme.films.filter((f) => f.ratings.imdb?.poster).map((f) => posterOf(f, 300).src)}
        onLogin={async (u) => {
          await api.login(u);
          await start();
        }}
      />
    );
  return (
    <StoreProvider me={findUser(boot.user)!} programme={boot.programme} initialRoom={boot.room} onLogout={start}>
      <Shell />
    </StoreProvider>
  );
}

function Splash() {
  return (
    <div className="splash">
      <h1 className="brand">
        Reel<em>Match</em>
      </h1>
      <span className="spinner" />
    </div>
  );
}

type Tab = "swipe" | "matches" | "filters";

function Shell() {
  const { me, partner, room, logout, connected } = useStore();
  const firstRun = Object.keys(room.votes[me.id] || {}).length === 0;
  const [tab, setTab] = useState<Tab>(firstRun ? "filters" : "swipe");
  const [menu, setMenu] = useState(false);
  const newMatches = room.matches.filter((m) => !(room.seen[me.id] || []).includes(m.filmId)).length;
  const partnerOnline = room.online.includes(partner.id);

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand small" onClick={() => setTab("swipe")}>
          Reel<em>Match</em>
        </button>
        <div className="topbar-right">
          <span className={`conn ${connected ? "on" : ""}`} title={connected ? "Live" : "Reconnecting…"} />
          <span className="partner" title={partnerOnline ? `${partner.name} is online` : `${partner.name} is offline`}>
            <Avatar name={partner.name} color={partner.color} size={26} online={partnerOnline} />
          </span>
          <button className="me" onClick={() => setMenu((v) => !v)}>
            <Avatar name={me.name} color={me.color} size={30} />
          </button>
          <AnimatePresence>
            {menu && (
              <motion.div className="menu" initial={{ opacity: 0, y: -6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.96 }}>
                <p>
                  Signed in as <b>{me.name}</b>
                </p>
                <button onClick={logout}>
                  <Icon name="logout" size={16} /> Switch person
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <main className="content" onClick={() => menu && setMenu(false)}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            className="view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {tab === "swipe" && <Deck onOpenMatches={() => setTab("matches")} onOpenFilters={() => setTab("filters")} />}
            {tab === "matches" && <Matches />}
            {tab === "filters" && <Setup firstRun={firstRun} onStart={() => setTab("swipe")} />}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="tabbar">
        {(
          [
            ["swipe", "cards", "Discover"],
            ["matches", "heart", "Matches"],
            ["filters", "sliders", "Filters"],
          ] as [Tab, string, string][]
        ).map(([k, icon, label]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {tab === k && <motion.i layoutId="tab-bg" className="tab-bg" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <span className="tab-icon">
              <Icon name={icon} size={22} fill={k === "matches" && tab === k} stroke={k === "matches" && tab === k ? 0 : 2} />
              <AnimatePresence>
                {k === "matches" && newMatches > 0 && (
                  <motion.b className="tab-badge" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                    {newMatches}
                  </motion.b>
                )}
              </AnimatePresence>
            </span>
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <MatchModal onOpenMatches={() => setTab("matches")} />
      <Toasts />
    </div>
  );
}
