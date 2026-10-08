import { AnimatePresence, motion } from "motion/react";
import { Img } from "./Img";
import { useMemo } from "react";
import { findUser } from "../../shared/users";
import { posterOf, viewFilm } from "../lib/deck";
import { useStore } from "../lib/store";
import { Avatar, Icon } from "./Icon";
import { ScreeningRow, metaLine } from "./FilmParts";

const BURST = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2 + (i % 2) * 0.2;
  const dist = 120 + ((i * 37) % 70);
  return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, r: (i * 47) % 360, s: 0.6 + ((i * 13) % 10) / 14, heart: i % 3 !== 0 };
});

export function MatchModal({ onOpenMatches }: { onOpenMatches: () => void }) {
  const { matchQueue, films, dismissMatch, me, partner, room, now } = useStore();
  const event = matchQueue[0];
  const film = event ? films.get(event.filmId) : undefined;
  const view = useMemo(() => (film ? viewFilm(film, room.settings, now) : null), [film, room.settings, now]);
  const by = event ? findUser(event.by) : undefined;

  const subtitle = !event
    ? ""
    : event.missed
      ? `While you were away, you and ${partner.name} matched`
      : event.by === me.id
        ? `${partner.name} already wanted to see this one`
        : `${by?.name} just liked it too!`;

  return (
    <AnimatePresence>
      {event && film && view && (
        <motion.div
          key={event.filmId}
          className="match-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
          onClick={dismissMatch}
        >
          <Img className="match-bg" srcs={posterOf(film).srcs} alt="" />
          <motion.div
            className="match-content"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 40, scale: 0.94 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 30, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
          >
            <div className="match-hero">
              <div className="burst">
                {BURST.map((b, i) => (
                  <motion.span
                    key={i}
                    className={b.heart ? "burst-heart" : "burst-spark"}
                    initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
                    animate={{ x: b.x, y: b.y, scale: b.s, opacity: 0, rotate: b.r }}
                    transition={{ duration: 1.3, delay: 0.25 + (i % 5) * 0.03, ease: [0.15, 0.8, 0.3, 1] }}
                  >
                    <Icon name={b.heart ? "heart" : "sparkle"} size={18} fill stroke={0} />
                  </motion.span>
                ))}
              </div>
              <motion.div className="match-avatars">
                <motion.div initial={{ x: -70, rotate: -20, opacity: 0 }} animate={{ x: 0, rotate: -8, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.1 }}>
                  <Avatar name={me.name} color={me.color} size={64} />
                </motion.div>
                <motion.div
                  className="match-heart"
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.4, 1] }}
                  transition={{ delay: 0.3, duration: 0.6, times: [0, 0.6, 1] }}
                >
                  <Icon name="heart" size={26} fill stroke={0} />
                </motion.div>
                <motion.div initial={{ x: 70, rotate: 20, opacity: 0 }} animate={{ x: 0, rotate: 8, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.1 }}>
                  <Avatar name={partner.name} color={partner.color} size={64} />
                </motion.div>
              </motion.div>
              <motion.h1 className="match-title" initial={{ opacity: 0, y: 12, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.2, type: "spring", stiffness: 220, damping: 18 }}>
                It's a match
              </motion.h1>
              <p className="match-sub">{subtitle}</p>
            </div>

            <div className="match-film">
              <Img srcs={posterOf(film, 300).srcs} alt="" />
              <div>
                <h2>{film.title}</h2>
                <p>{metaLine(film)}</p>
              </div>
            </div>

            {view.eligible.length > 0 && (
              <div className="match-screenings">
                <h3>Catch it on</h3>
                {view.eligible.slice(0, 2).map((x) => (
                  <ScreeningRow key={x.s.id} film={film} info={x} />
                ))}
              </div>
            )}

            <div className="row stretch">
              <button className="btn" onClick={dismissMatch}>
                {matchQueue.length > 1 ? `Next match (${matchQueue.length - 1})` : "Keep swiping"}
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  dismissMatch();
                  onOpenMatches();
                }}
              >
                <Icon name="heart" size={16} fill stroke={0} /> All matches
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
