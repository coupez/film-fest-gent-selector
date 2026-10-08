import { AnimatePresence, motion } from "motion/react";
import { Img } from "./Img";
import { useMemo, useState } from "react";
import { posterOf, viewFilm, type FilmView, type ScreeningInfo } from "../lib/deck";
import { fmtDayMonth, fmtWeekdayLong, relativeDay } from "../lib/format";
import { useStore } from "../lib/store";
import type { Film } from "../types";
import { FilmDetails, KIND_LABEL, LanguageLine, Ratings, ScreeningRow, metaLine } from "./FilmParts";
import { Icon } from "./Icon";

type Tab = "matches" | "schedule" | "votes";

export function Matches() {
  const { room, films, now, me, partner } = useStore();
  const [tab, setTab] = useState<Tab>("matches");
  const [open, setOpen] = useState<string | null>(null);

  const matched = useMemo(
    () =>
      room.matches
        .map((m) => films.get(m.filmId))
        .filter((f): f is Film => !!f)
        .map((f) => viewFilm(f, room.settings, now)),
    [room.matches, films, room.settings, now],
  );
  const myVoteCount = Object.keys(room.votes[me.id] || {}).length;

  return (
    <div className="page">
      <header className="page-head">
        <h1>
          Matches <span className="count">{matched.length}</span>
        </h1>
        <p className="muted">Films you and {partner.name} both want to see.</p>
        <div className="segmented">
          {(
            [
              ["matches", "Films"],
              ["schedule", "Schedule"],
              ["votes", `My votes (${myVoteCount})`],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
              {tab === k && <motion.i layoutId="seg" className="seg-bg" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
          {tab === "matches" && <MatchGrid views={matched} onOpen={setOpen} />}
          {tab === "schedule" && <Schedule views={matched} onOpen={setOpen} />}
          {tab === "votes" && <MyVotes onOpen={setOpen} />}
        </motion.div>
      </AnimatePresence>

      <FilmSheet filmId={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function NoMatches() {
  const { partner } = useStore();
  return (
    <div className="empty small">
      <div className="empty-icon">
        <Icon name="heart" size={30} />
      </div>
      <h2>No matches yet</h2>
      <p>Keep swiping — when you and {partner.name} both like a film, it lands here with its screenings.</p>
    </div>
  );
}

function MatchGrid({ views, onOpen }: { views: FilmView[]; onOpen: (id: string) => void }) {
  const { now, room, me } = useStore();
  if (!views.length) return <NoMatches />;
  const seen = new Set(room.seen[me.id] || []);
  return (
    <div className="grid">
      {views.map((v, i) => {
        const picked = room.picks[v.film.id] && v.screenings.find((x) => x.s.id === room.picks[v.film.id].screeningId);
        const next = picked || v.eligible[0] || v.screenings.find((x) => !x.past);
        return (
          <motion.button
            key={v.film.id}
            className="tile"
            onClick={() => onOpen(v.film.id)}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 12) * 0.035 }}
            whileTap={{ scale: 0.97 }}
          >
            <div className="tile-img">
              <Img srcs={posterOf(v.film, 400).srcs} alt="" loading="lazy" />
              {!seen.has(v.film.id) && <span className="badge-new">New</span>}
              <Ratings film={v.film} compact />
            </div>
            <div className="tile-body">
              <b>{v.film.title}</b>
              <span>{metaLine(v.film)}</span>
              {next ? (
                <span className={`next ${picked ? "going" : next.eligible ? "" : "warn"}`}>
                  <Icon name={picked ? "check" : "calendar"} size={12} stroke={picked ? 3 : 2} /> {picked ? "Going " : ""}
                  {relativeDay(next.s.date, now)} · {next.s.time}
                  {!picked && !next.eligible && " (check subs)"}
                </span>
              ) : (
                <span className="next warn">No more screenings</span>
              )}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

const minutes = (f: Film) => f.runtime ?? f.screenedFilm?.runtime ?? 100;

type ScheduleFilter = "all" | "open" | "picked";

function Schedule({ views, onOpen }: { views: FilmView[]; onOpen: (id: string) => void }) {
  const { room, pick, partner } = useStore();
  const [onlyFitting, setOnlyFitting] = useState(true);
  const [filter, setFilter] = useState<ScheduleFilter>("all");
  const picks = room.picks;

  const items = useMemo(() => {
    const all: { film: Film; info: ScreeningInfo; end: Date; picked: boolean }[] = [];
    for (const v of views) {
      // Once we've picked a screening, the film's other screenings drop out: we only need to see it once.
      const chosen = picks[v.film.id] && v.screenings.find((x) => x.s.id === picks[v.film.id].screeningId);
      const list = chosen ? [chosen] : v.screenings.filter((x) => !onlyFitting || x.eligible);
      for (const info of list) {
        if (info.past) continue;
        all.push({ film: v.film, info, end: new Date(info.start.getTime() + minutes(v.film) * 60000), picked: !!chosen });
      }
    }
    all.sort((a, b) => a.info.start.getTime() - b.info.start.getTime());
    return all;
  }, [views, onlyFitting, picks]);

  if (!views.length) return <NoMatches />;
  const pickedCount = new Set(items.filter((x) => x.picked).map((x) => x.film.id)).size;
  const openCount = new Set(items.filter((x) => !x.picked).map((x) => x.film.id)).size;
  const shown = items.filter((x) => filter === "all" || (filter === "picked") === x.picked);
  const days = [...new Set(shown.map((x) => x.info.s.date))];
  return (
    <div className="schedule">
      <div className="chips center">
        {(
          [
            ["all", "All"],
            ["open", `To decide · ${openCount}`],
            ["picked", `Picked · ${pickedCount}`],
          ] as [ScheduleFilter, string][]
        ).map(([k, label]) => (
          <button key={k} className={`chip toggle ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>
      <label className="switch-row compact">
        <span>Only screenings that work language-wise</span>
        <Switch on={onlyFitting} onChange={setOnlyFitting} />
      </label>
      {!shown.length && (
        <p className="muted center">
          {filter === "picked" ? "Nothing picked yet — tap ✓ on the screening you'll go to." : filter === "open" ? "Every match has a screening picked." : "No upcoming screenings for your matches."}
        </p>
      )}
      {days.map((d) => (
        <section key={d} className="day">
          <h3>
            {fmtWeekdayLong(d)} <span>{fmtDayMonth(d)}</span>
          </h3>
          {shown
            .filter((x) => x.info.s.date === d)
            .map((x) => {
              const overlaps = items.filter((y) => y !== x && y.info.start < x.end && x.info.start < y.end);
              const clash = (x.picked && overlaps.find((y) => y.picked)) || overlaps[0];
              const by = picks[x.film.id]?.by;
              return (
                <div key={x.info.s.id + x.film.id} className={`slot ${x.picked ? "picked" : ""}`} onClick={() => onOpen(x.film.id)}>
                  <div className="slot-time">
                    <b>{x.info.s.time}</b>
                    <span>{x.end.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" })}</span>
                  </div>
                  <Img srcs={posterOf(x.film, 200).srcs} alt="" loading="lazy" />
                  <div className="slot-body">
                    <b>{x.film.title}</b>
                    <span>
                      <Icon name="pin" size={12} /> {x.info.s.venue}
                      {x.info.s.subtitles.length > 0 && ` · ${x.info.s.subtitles.join("/")} subs`}
                    </span>
                    {x.picked && <span className="going">Going{by === partner.id ? ` · picked by ${partner.name}` : ""}</span>}
                    {clash && (
                      <span className={`clash ${x.picked && clash.picked ? "hard" : ""}`}>
                        {x.picked && clash.picked ? "Clashes with your pick " : "Overlaps with "}
                        {clash.film.title}
                      </span>
                    )}
                  </div>
                  <div className="slot-actions">
                    <button
                      className={`pick-btn ${x.picked ? "on" : ""}`}
                      aria-label={x.picked ? `Unpick ${x.film.title}` : `Pick this screening of ${x.film.title}`}
                      aria-pressed={x.picked}
                      onClick={(e) => {
                        e.stopPropagation();
                        pick(x.film.id, x.picked ? null : x.info.s.id);
                      }}
                    >
                      <Icon name="check" size={16} stroke={3} />
                    </button>
                    {x.info.s.soldOut ? (
                      <span className="pill sold">Sold out</span>
                    ) : (
                      x.info.s.ticketUrl && (
                        <a className="pill ticket" href={x.info.s.ticketUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label="Tickets">
                          <Icon name="ticket" size={14} />
                        </a>
                      )
                    )}
                  </div>
                </div>
              );
            })}
        </section>
      ))}
    </div>
  );
}

function MyVotes({ onOpen }: { onOpen: (id: string) => void }) {
  const { room, me, films, vote } = useStore();
  const [filter, setFilter] = useState<"like" | "nope">("like");
  const list = Object.entries(room.votes[me.id] || {})
    .filter(([id, v]) => v.vote === filter && films.has(id))
    .sort((a, b) => b[1].at - a[1].at)
    .map(([id]) => films.get(id)!);
  return (
    <div>
      <div className="chips center pad">
        <button className={`chip toggle ${filter === "like" ? "on" : ""}`} onClick={() => setFilter("like")}>
          <Icon name="heart" size={13} fill stroke={0} /> Liked
        </button>
        <button className={`chip toggle ${filter === "nope" ? "on" : ""}`} onClick={() => setFilter("nope")}>
          <Icon name="x" size={13} stroke={3} /> Passed
        </button>
      </div>
      {!list.length && <p className="muted center">Nothing here yet.</p>}
      <div className="vote-list">
        <AnimatePresence initial={false}>
          {list.map((f) => (
            <motion.div key={f.id} className="vote-row" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: filter === "like" ? -40 : 40 }}>
              <Img srcs={posterOf(f, 160).srcs} alt="" loading="lazy" onClick={() => onOpen(f.id)} />
              <div onClick={() => onOpen(f.id)}>
                <b>{f.title}</b>
                <span>{metaLine(f)}</span>
              </div>
              <button className={`flip ${filter === "like" ? "nope" : "like"}`} onClick={() => vote(f.id, filter === "like" ? "nope" : "like")}>
                {filter === "like" ? <Icon name="x" size={16} stroke={3} /> : <Icon name="heart" size={16} fill stroke={0} />}
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`switch ${on ? "on" : ""}`} onClick={() => onChange(!on)}>
      <motion.i layout transition={{ type: "spring", stiffness: 600, damping: 34 }} />
    </button>
  );
}

export function FilmSheet({ filmId, onClose }: { filmId: string | null; onClose: () => void }) {
  const { films, room, now, me, vote } = useStore();
  const film = filmId ? films.get(filmId) : undefined;
  const view = film ? viewFilm(film, room.settings, now) : null;
  const myVote = film ? room.votes[me.id]?.[film.id]?.vote : undefined;
  return (
    <AnimatePresence>
      {film && view && (
        <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className="sheet"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => (i.offset.y > 120 || i.velocity.y > 600) && onClose()}
          >
            <div className="sheet-grip" />
            <div className="sheet-scroll" onPointerDownCapture={(e) => e.stopPropagation()}>
              <div className="sheet-hero">
                <Img srcs={posterOf(film).srcs} alt="" />
                <div className="poster-shade" />
                <div className="poster-info">
                  <div className="kicker">
                    <span className="tag">{KIND_LABEL[film.kind]}</span>
                  </div>
                  <h2 className="title">{film.title}</h2>
                  <div className="meta">{metaLine(film)}</div>
                  <LanguageLine film={film} info={view.eligible[0]} />
                </div>
                <button className="sheet-close" onClick={onClose} aria-label="Close">
                  <Icon name="x" size={18} stroke={2.5} />
                </button>
              </div>
              <FilmDetails view={view} />
              <div className="row stretch pad">
                <button className={`btn ${myVote === "nope" ? "danger-on" : ""}`} onClick={() => vote(film.id, "nope")}>
                  <Icon name="x" size={16} stroke={3} /> {myVote === "nope" ? "Passed" : "Pass"}
                </button>
                <button className={`btn ${myVote === "like" ? "primary" : ""}`} onClick={() => vote(film.id, "like")}>
                  <Icon name="heart" size={16} fill stroke={0} /> {myVote === "like" ? "Liked" : "Like"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
