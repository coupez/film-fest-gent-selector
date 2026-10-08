import { AnimatePresence, animate, motion, motionValue, useTransform, type MotionValue, type PanInfo } from "motion/react";
import { Img } from "./Img";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { Vote } from "../../shared/types";
import { posterOf, type FilmView } from "../lib/deck";
import { useStore } from "../lib/store";
import { FilmDetails, KIND_LABEL, LanguageLine, Ratings, ScreeningChips, metaLine } from "./FilmParts";
import { Icon } from "./Icon";

const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 550;

type Dir = -1 | 1;

type Custom = { dir: Dir; back?: Dir; undo?: boolean };

const cardVariants = {
  enter: (d: Custom) => (d.back ? { x: d.back * 560, opacity: 0 } : { scale: 0.9, y: 40, opacity: 0 }),
  exit: (d: Custom) =>
    d.undo
      ? { opacity: 0, scale: 0.9, transition: { duration: 0.2 } }
      : {
          x: d.dir * (Math.max(window.innerWidth, 480) + 160),
          opacity: 0.4,
          transition: { duration: 0.45, ease: [0.25, 0.7, 0.35, 1] as const },
        },
};

export function Deck({ onOpenMatches, onOpenFilters }: { onOpenMatches: () => void; onOpenFilters: () => void }) {
  const store = useStore();
  const { deck, views, vote, undo, canUndo, me, partner, room } = store;
  const xs = useRef(new Map<string, MotionValue<number>>());
  const exitDir = useRef<Dir>(1);
  const [backDir, setBackDir] = useState<Dir | undefined>();
  const scroller = useRef<HTMLDivElement | null>(null);
  const getX = (id: string) => {
    let v = xs.current.get(id);
    if (!v) xs.current.set(id, (v = motionValue(0)));
    return v;
  };

  const top = deck[0];
  const visible = deck.slice(0, 3);

  const decide = useCallback(
    (v: Vote) => {
      if (!top) return;
      exitDir.current = v === "like" ? 1 : -1;
      setBackDir(undefined);
      vote(top.film.id, v);
    },
    [top, vote],
  );

  const doUndo = useCallback(() => {
    const id = undo();
    if (!id) return;
    const prevVote = room.votes[me.id]?.[id]?.vote;
    xs.current.get(id)?.set(0);
    setBackDir(prevVote === "nope" ? -1 : 1);
  }, [undo, room.votes, me.id]);

  const showInfo = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollTop > 40 ? 0 : el.clientHeight * 0.82, behavior: "smooth" });
  }, []);

  // Keyboard: ← nope, → like, ↑ / space details, backspace undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea")) return;
      if (e.key === "ArrowRight") decide("like");
      else if (e.key === "ArrowLeft") decide("nope");
      else if (e.key === "Backspace" || e.key.toLowerCase() === "z") doUndo();
      else if (e.key === "ArrowUp" || e.key === " ") {
        e.preventDefault();
        showInfo();
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide, doUndo, showInfo]);

  const voted = views.length - deck.length;
  const partnerVotes = Object.keys(room.votes[partner.id] || {}).filter((id) => views.some((v) => v.film.id === id)).length;

  // Warm the image cache for the next few cards.
  useEffect(() => {
    deck.slice(3, 7).forEach((v) => {
      const img = new Image();
      img.src = posterOf(v.film).src;
    });
  }, [deck]);

  return (
    <div className="deck-screen">
      <div className="progress">
        <div className="progress-bar">
          <motion.i animate={{ width: `${views.length ? (voted / views.length) * 100 : 0}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
        </div>
        <div className="progress-text">
          <span>
            {voted} / {views.length} rated
          </span>
          <span className="muted">
            {partner.name}: {partnerVotes}
          </span>
        </div>
      </div>

      <div className="deck">
        {top ? (
          <AnimatePresence initial={false} custom={{ dir: exitDir.current, undo: backDir !== undefined }}>
            {visible
              .map((v, i) => (
                <SwipeCard
                  key={v.film.id}
                  view={v}
                  index={i}
                  x={getX(v.film.id)}
                  custom={{ dir: exitDir.current, back: i === 0 ? backDir : undefined }}
                  onDecide={decide}
                  scrollerRef={i === 0 ? scroller : undefined}
                />
              ))
              .reverse()}
          </AnimatePresence>
        ) : (
          <EmptyDeck onOpenMatches={onOpenMatches} onOpenFilters={onOpenFilters} />
        )}
      </div>

      <div className="actions">
        <motion.button whileTap={{ scale: 0.88 }} className="act small" onClick={doUndo} disabled={!canUndo} aria-label="Undo">
          <Icon name="undo" size={20} />
        </motion.button>
        <motion.button whileTap={{ scale: 0.86 }} whileHover={{ scale: 1.05 }} className="act nope" onClick={() => decide("nope")} disabled={!top} aria-label="Pass">
          <Icon name="x" size={30} stroke={3} />
        </motion.button>
        <motion.button whileTap={{ scale: 0.86 }} whileHover={{ scale: 1.05 }} className="act like" onClick={() => decide("like")} disabled={!top} aria-label="Like">
          <Icon name="heart" size={30} fill stroke={0} />
        </motion.button>
        <motion.button whileTap={{ scale: 0.88 }} className="act small" onClick={showInfo} disabled={!top} aria-label="Details">
          <Icon name="info" size={20} />
        </motion.button>
      </div>
    </div>
  );
}

interface CardProps {
  view: FilmView;
  index: number;
  x: MotionValue<number>;
  custom: Custom;
  onDecide: (v: Vote) => void;
  scrollerRef?: React.MutableRefObject<HTMLDivElement | null>;
}

const SwipeCard = memo(function SwipeCard({ view, index, x, custom, onDecide, scrollerRef }: CardProps) {
  const isTop = index === 0;
  const rotate = useTransform(x, [-400, 0, 400], [-16, 0, 16]);
  const likeOpacity = useTransform(x, [20, SWIPE_DISTANCE], [0, 1]);
  const nopeOpacity = useTransform(x, [-SWIPE_DISTANCE, -20], [1, 0]);
  const { film } = view;
  const poster = posterOf(film);
  const [scrolled, setScrolled] = useState(false);
  const localRef = useRef<HTMLDivElement>(null);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const { offset, velocity } = info;
    if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) onDecide("like");
    else if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) onDecide("nope");
    else animate(x, 0, { type: "spring", stiffness: 500, damping: 32 });
  };

  return (
    <motion.article
      className={`card ${isTop ? "top" : ""}`}
      style={isTop ? { x, rotate, zIndex: 10 } : { zIndex: 10 - index }}
      custom={custom}
      variants={cardVariants}
      initial="enter"
      animate={{
        opacity: 1,
        x: 0,
        scale: 1 - index * 0.04,
        y: index * 11,
        transition: { type: "spring", stiffness: 300, damping: 30 },
      }}
      exit="exit"
      drag={isTop ? "x" : false}
      dragDirectionLock
      dragMomentum={false}
      onDragEnd={onDragEnd}
      aria-hidden={!isTop}
    >
      <div
        className="card-scroll"
        ref={(el) => {
          (localRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
          if (scrollerRef) scrollerRef.current = el;
        }}
        onScroll={(e) => setScrolled((e.currentTarget as HTMLDivElement).scrollTop > 30)}
      >
        <div className="poster" onClick={() => localRef.current?.scrollTo({ top: localRef.current.clientHeight * 0.82, behavior: "smooth" })}>
          {!poster.portrait && <Img className="poster-blur" srcs={poster.srcs} alt="" />}
          <Img className={`poster-img ${poster.portrait ? "portrait" : "landscape"}`} srcs={poster.srcs} alt="" decoding="async" />
          <div className="poster-shade" />
          <motion.div className="stamp like" style={{ opacity: likeOpacity }}>
            Want to see
          </motion.div>
          <motion.div className="stamp nope" style={{ opacity: nopeOpacity }}>
            Pass
          </motion.div>
          <div className="poster-info">
            <div className="kicker">
              <span className="tag">{KIND_LABEL[film.kind]}</span>
              {film.sections[0] && <span className="tag ghost">{film.sections[0]}</span>}
            </div>
            <h2 className="title">{film.title}</h2>
            <div className="meta">{metaLine(film)}</div>
            <LanguageLine film={film} info={view.eligible[0]} />
            <Ratings film={film} compact />
            <ScreeningChips view={view} />
            {isTop && (
              <motion.div className="scroll-hint" animate={{ opacity: scrolled ? 0 : 1, y: [0, 4, 0] }} transition={{ y: { repeat: Infinity, duration: 1.8 } }}>
                <Icon name="chevronDown" size={16} /> Scroll for story, stills & times
              </motion.div>
            )}
          </div>
        </div>
        {isTop && <FilmDetails view={view} />}
      </div>
    </motion.article>
  );
});

function EmptyDeck({ onOpenMatches, onOpenFilters }: { onOpenMatches: () => void; onOpenFilters: () => void }) {
  const { room, views, partner } = useStore();
  const partnerLeft = views.filter((v) => !room.votes[partner.id]?.[v.film.id]).length;
  return (
    <motion.div className="empty" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
      <div className="empty-icon">
        <Icon name="sparkle" size={34} />
      </div>
      <h2>{views.length ? "You're all caught up" : "Nothing matches these filters"}</h2>
      <p>
        {views.length
          ? partnerLeft
            ? `${partner.name} still has ${partnerLeft} to go — matches will pop up here as they come in.`
            : `You both went through all ${views.length}. Time to pick some tickets.`
          : "Try including more days, sections or languages."}
      </p>
      <div className="row">
        <button className="btn primary" onClick={onOpenMatches}>
          <Icon name="heart" size={16} fill stroke={0} /> See matches ({room.matches.length})
        </button>
        <button className="btn" onClick={onOpenFilters}>
          <Icon name="sliders" size={16} /> Filters
        </button>
      </div>
    </motion.div>
  );
}
