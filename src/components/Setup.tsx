import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { DEFAULT_SETTINGS, type Kind, type Order, type Settings } from "../../shared/types";
import { USERS } from "../../shared/users";
import { festivalDays, viewFilm } from "../lib/deck";
import { dayNumber, fmtWeekday } from "../lib/format";
import { LANGUAGE_CHOICES } from "../lib/languages";
import { useStore } from "../lib/store";
import { Avatar, Icon } from "./Icon";
import { Switch } from "./Matches";

const KINDS: [Kind, string][] = [
  ["film", "Films"],
  ["concert", "Film concerts"],
  ["short", "Short films"],
  ["talk", "Talks"],
  ["other", "Events"],
];

const ORDERS: [Order, string, string][] = [
  ["shuffle", "Shuffle", "Same random order for both of you"],
  ["date", "Soonest first", "Earliest screening first"],
  ["rating", "Best rated", "IMDb + Rotten Tomatoes"],
];

export function Setup({ onStart, firstRun }: { onStart: () => void; firstRun: boolean }) {
  const { room, programme, updateSettings, now, views, deck, me, room: { online }, partner, resetVotes } = useStore();
  const s = room.settings;
  const [showAllSections, setShowAllSections] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const days = useMemo(() => festivalDays(programme.films), [programme]);
  const sections = useMemo(() => {
    const c = new Map<string, number>();
    for (const f of programme.films) for (const x of f.sections) c.set(x, (c.get(x) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [programme]);

  // How many items each kind would add with the current other filters.
  const kindCounts = useMemo(() => {
    const all = { ...s, kinds: KINDS.map(([k]) => k) };
    const c: Record<string, number> = {};
    for (const f of programme.films) if (viewFilm(f, all, now).passes) c[f.kind] = (c[f.kind] || 0) + 1;
    return c;
  }, [programme, s, now]);

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(now);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const set = (patch: Partial<Settings>) => updateSettings(patch);

  return (
    <div className="page setup">
      <header className="page-head">
        {firstRun && <p className="eyebrow">Film Fest Gent {programme.edition}</p>}
        <h1>{firstRun ? `Hi ${me.name}, let's set the stage` : "Filters"}</h1>
        <p className="muted">
          Shared with {partner.name}
          {online.includes(partner.id) ? " — they're online now" : ""}. Changes apply to both decks.
        </p>
      </header>

      <section className="panel">
        <h2>
          <Icon name="speech" size={18} /> Languages you understand
        </h2>
        <p className="hint">A screening makes the cut when each of you understands the spoken language — or the subtitles.</p>
        {USERS.map((u) => (
          <div key={u.id} className="lang-person">
            <div className="lang-person-head">
              <Avatar name={u.name} color={u.color} size={28} />
              <b>{u.name}</b>
            </div>
            <div className="chips">
              {[...new Set([...LANGUAGE_CHOICES, ...s.langs[u.id]])].map((l) => {
                const on = s.langs[u.id].includes(l);
                return (
                  <motion.button
                    key={l}
                    whileTap={{ scale: 0.92 }}
                    className={`chip toggle ${on ? "on" : ""}`}
                    style={on ? { ["--c" as string]: u.color } : undefined}
                    onClick={() => set({ langs: { ...s.langs, [u.id]: toggle(s.langs[u.id], l) } })}
                  >
                    {on && <Icon name="check" size={12} stroke={3} />}
                    {l}
                  </motion.button>
                );
              })}
            </div>
          </div>
        ))}
        <label className="switch-row">
          <span>
            Include when language info is missing
            <small>Talks, events and some programmes don't list it</small>
          </span>
          <Switch on={s.includeUnknownLanguage} onChange={(v) => set({ includeUnknownLanguage: v })} />
        </label>
      </section>

      <section className="panel">
        <h2>
          <Icon name="film" size={18} /> What to show
        </h2>
        <div className="chips">
          {KINDS.map(([k, label]) => (
            <motion.button whileTap={{ scale: 0.92 }} key={k} className={`chip toggle ${s.kinds.includes(k) ? "on" : ""}`} onClick={() => set({ kinds: toggle(s.kinds, k) })}>
              {label}
              <small>{kindCounts[k] || 0}</small>
            </motion.button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>
          <Icon name="calendar" size={18} /> Days
        </h2>
        <div className="days">
          <button className={`day-chip all ${s.days.length === 0 ? "on" : ""}`} onClick={() => set({ days: [] })}>
            <span>All</span>
            <b>∞</b>
          </button>
          {days.map((d) => (
            <motion.button
              whileTap={{ scale: 0.92 }}
              key={d}
              className={`day-chip ${s.days.includes(d) ? "on" : ""} ${d < today ? "past" : ""} ${d === today ? "today" : ""}`}
              onClick={() => set({ days: toggle(s.days, d) })}
            >
              <span>{d === today ? "Today" : fmtWeekday(d)}</span>
              <b>{dayNumber(d)}</b>
            </motion.button>
          ))}
        </div>
        <label className="switch-row">
          <span>Hide screenings that already started</span>
          <Switch on={s.hidePast} onChange={(v) => set({ hidePast: v })} />
        </label>
        <label className="switch-row">
          <span>Hide sold-out screenings</span>
          <Switch on={s.hideSoldOut} onChange={(v) => set({ hideSoldOut: v })} />
        </label>
      </section>

      <section className="panel">
        <h2>
          <Icon name="sparkle" size={18} /> Sections
        </h2>
        <div className="chips">
          <button className={`chip toggle ${s.sections.length === 0 ? "on" : ""}`} onClick={() => set({ sections: [] })}>
            All sections
          </button>
          {(showAllSections ? sections : sections.slice(0, 8)).map((x) => (
            <motion.button whileTap={{ scale: 0.92 }} key={x} className={`chip toggle ${s.sections.includes(x) ? "on" : ""}`} onClick={() => set({ sections: toggle(s.sections, x) })}>
              {x}
            </motion.button>
          ))}
          {sections.length > 8 && (
            <button className="chip ghost" onClick={() => setShowAllSections((v) => !v)}>
              {showAllSections ? "Less" : `+${sections.length - 8} more`}
            </button>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>
          <Icon name="cards" size={18} /> Deck
        </h2>
        <div className="slider-row">
          <span>Minimum IMDb rating</span>
          <b>{s.minImdb ? s.minImdb.toFixed(1) : "Any"}</b>
        </div>
        <input type="range" min={0} max={8} step={0.5} value={s.minImdb} onChange={(e) => set({ minImdb: Number(e.target.value) })} />
        <p className="hint">Unrated festival premieres are always kept.</p>
        <div className="order">
          {ORDERS.map(([k, label, hint]) => (
            <button key={k} className={`order-opt ${s.order === k ? "on" : ""}`} onClick={() => set({ order: k })}>
              <b>{label}</b>
              <small>{hint}</small>
            </button>
          ))}
        </div>
        <button className="link-btn" onClick={() => set({ ...DEFAULT_SETTINGS, langs: s.langs })}>
          <Icon name="refresh" size={14} /> Reset filters to defaults
        </button>
      </section>

      <section className="panel subtle">
        {confirmReset ? (
          <div className="row">
            <span className="grow">Clear all your votes? Matches will be recalculated.</span>
            <button className="btn small" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
            <button
              className="btn small danger"
              onClick={async () => {
                await resetVotes();
                setConfirmReset(false);
              }}
            >
              Clear
            </button>
          </div>
        ) : (
          <button className="link-btn" onClick={() => setConfirmReset(true)}>
            Start over — clear my votes
          </button>
        )}
      </section>

      <div className="cta-bar">
        <motion.button className="btn primary big" whileTap={{ scale: 0.97 }} onClick={onStart} disabled={!deck.length && !views.length}>
          <span>{deck.length ? "Start swiping" : views.length ? "Back to the deck" : "No films match"}</span>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={deck.length} className="cta-count" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }}>
              {deck.length} to rate · {views.length} total
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  );
}
