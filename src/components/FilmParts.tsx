import { USERS } from "../../shared/users";
import { Img } from "./Img";
import type { ScreeningInfo, FilmView } from "../lib/deck";
import { fmtRuntime, fmtVotes, fmtWeekday, dayNumber, relativeDay } from "../lib/format";
import { screeningLanguages } from "../lib/languages";
import { useStore } from "../lib/store";
import type { Film } from "../types";
import { Icon } from "./Icon";

export const KIND_LABEL: Record<string, string> = {
  film: "Film",
  short: "Short film",
  concert: "Film concert",
  talk: "Talk",
  other: "Event",
};

export function metaLine(film: Film) {
  const year = film.year ?? film.screenedFilm?.year;
  const runtime = film.runtime ?? film.screenedFilm?.runtime ?? null;
  return [film.directors.slice(0, 2).join(" & ") || null, year, fmtRuntime(runtime)].filter(Boolean).join(" · ");
}

export function Ratings({ film, compact }: { film: Film; compact?: boolean }) {
  const { imdb, rt } = film.ratings;
  const items = [];
  if (imdb?.rating)
    items.push(
      <a key="imdb" className="rating imdb" href={imdb.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
        <b>IMDb</b>
        <span>{imdb.rating.toFixed(1)}</span>
        {!compact && imdb.votes > 0 && <small>{fmtVotes(imdb.votes)}</small>}
      </a>,
    );
  if (rt?.critics != null)
    items.push(
      <a key="rt" className={`rating rt ${rt.critics >= 60 ? "fresh" : "rotten"}`} href={rt.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
        <i className="tomato" />
        <span>{rt.critics}%</span>
        {!compact && <small>critics</small>}
      </a>,
    );
  if (rt?.audience != null && !compact)
    items.push(
      <a key="rta" className="rating rt-aud" href={rt.url} target="_blank" rel="noreferrer">
        <i className="popcorn" />
        <span>{rt.audience}%</span>
        <small>audience</small>
      </a>,
    );
  if (imdb?.metascore != null && !compact)
    items.push(
      <span key="mc" className={`rating mc ${imdb.metascore >= 61 ? "good" : imdb.metascore >= 40 ? "mixed" : "bad"}`}>
        <b>{imdb.metascore}</b>
        <small>Metascore</small>
      </span>,
    );
  if (!items.length) return compact ? null : <div className="ratings muted-sm">No ratings yet — a festival discovery.</div>;
  return <div className="ratings">{items}</div>;
}

export function LanguageLine({ film, info }: { film: Film; info?: ScreeningInfo }) {
  const l = screeningLanguages(film, info?.s ?? film.screenings[0]);
  return (
    <div className="lang-line">
      <span>
        <Icon name="speech" size={14} />
        {l.noDialogue ? "No dialogue" : l.spoken.length ? l.spoken.join(", ") : "Language n/a"}
      </span>
      <span>
        <Icon name="cc" size={14} />
        {l.subs.length ? l.subs.join(", ") : "No subtitles"}
      </span>
    </div>
  );
}

export function FitDots({ info }: { info: ScreeningInfo }) {
  return (
    <span className="fit-dots" title={USERS.map((u) => `${u.name}: ${info.perUser[u.id]}`).join(" · ")}>
      {USERS.map((u) => (
        <i key={u.id} className={`fit ${info.perUser[u.id]}`} style={{ ["--c" as string]: u.color }}>
          {info.perUser[u.id] === "yes" ? "✓" : info.perUser[u.id] === "no" ? "✕" : "?"}
        </i>
      ))}
    </span>
  );
}

export function ScreeningChips({ view, max = 2 }: { view: FilmView; max?: number }) {
  const { now } = useStore();
  const list = view.eligible.slice(0, max);
  const more = view.eligible.length - list.length;
  return (
    <div className="chips">
      {list.map((x) => (
        <span key={x.s.id} className={`chip screening-chip ${x.s.soldOut ? "sold" : ""}`}>
          <b>{relativeDay(x.s.date, now)}</b> {x.s.time}
          {x.s.soldOut && <em>sold out</em>}
        </span>
      ))}
      {more > 0 && <span className="chip ghost">+{more} more</span>}
    </div>
  );
}

export function ScreeningRow({ film, info }: { film: Film; info: ScreeningInfo }) {
  const l = screeningLanguages(film, info.s);
  return (
    <div className={`screening ${info.eligible ? "" : "dimmed"} ${info.past ? "past" : ""}`}>
      <div className="screening-date">
        <span>{fmtWeekday(info.s.date)}</span>
        <b>{dayNumber(info.s.date)}</b>
      </div>
      <div className="screening-body">
        <div className="screening-top">
          <b>{info.s.time}</b>
          <span className="sep" />
          <span>{info.s.venue}</span>
        </div>
        <div className="screening-sub">
          <span className="subs">
            <FitDots info={info} />
            {l.subs.length ? `${l.subs.join(" / ")} subs` : l.noDialogue ? "No dialogue" : "No subtitles"}
          </span>
          {info.s.guests && <span className="guest">+ Guest</span>}
        </div>
      </div>
      {info.past ? (
        <span className="pill muted">Passed</span>
      ) : info.s.soldOut ? (
        <span className="pill sold">Sold out</span>
      ) : info.s.ticketUrl ? (
        <a className="pill ticket" href={info.s.ticketUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
          <Icon name="ticket" size={14} /> Tickets
        </a>
      ) : null}
    </div>
  );
}

function Credit({ label, people }: { label: string; people: string[] | string | null | undefined }) {
  const v = Array.isArray(people) ? people.slice(0, 8).join(", ") : people;
  if (!v) return null;
  return (
    <div className="credit">
      <dt>{label}</dt>
      <dd>{v}</dd>
    </div>
  );
}

/** Everything below the poster: description, screenings, gallery, credits, links. */
export function FilmDetails({ view }: { view: FilmView }) {
  const { film } = view;
  const { imdb } = film.ratings;
  const upcoming = view.screenings.filter((x) => !x.past);
  const shown = upcoming.length ? upcoming : view.screenings;
  const trailerQuery = encodeURIComponent(`${film.screenedFilm?.title || film.title} ${film.year ?? ""} trailer`);
  return (
    <div className="details">
      <Ratings film={film} />
      {film.intro.length > 0 && <p className="lead">{film.intro.join(" ")}</p>}
      {film.description.map((p, i) => (
        <p key={i} className="body">
          {p}
        </p>
      ))}
      {!film.intro.length && !film.description.length && imdb?.plot && <p className="lead">{imdb.plot}</p>}

      <h3 className="section-title">
        <Icon name="calendar" size={16} /> Screenings
        <small>{view.eligible.length} that work for you both</small>
      </h3>
      <div className="screenings">
        {shown.map((x) => (
          <ScreeningRow key={x.s.id} film={film} info={x} />
        ))}
      </div>

      {film.gallery.length > 0 && (
        <>
          <h3 className="section-title">Stills</h3>
          <div className="gallery" onPointerDownCapture={(e) => e.stopPropagation()}>
            {film.gallery.slice(0, 10).map((g, i) => (
              <a key={i} href={g.full || g.src} target="_blank" rel="noreferrer">
                <Img srcs={[g.src, g.full]} loading="lazy" alt="" style={{ aspectRatio: g.w && g.h ? `${g.w} / ${g.h}` : undefined }} />
              </a>
            ))}
          </div>
        </>
      )}

      {film.parts.length > 0 && (
        <>
          <h3 className="section-title">{film.model === "composition" ? "In this programme" : "Screened together with"}</h3>
          <div className="parts">
            {film.parts.map((p) => (
              <a key={p.url} className="part" href={p.url} target="_blank" rel="noreferrer">
                {p.image && <Img srcs={[p.image]} alt="" loading="lazy" />}
                <div>
                  <b>{p.title}</b>
                  <span>{[p.director, fmtRuntime(p.runtime)].filter(Boolean).join(" · ")}</span>
                </div>
              </a>
            ))}
          </div>
        </>
      )}

      <h3 className="section-title">Details</h3>
      <dl className="credits">
        <Credit label="Director" people={film.directors} />
        <Credit label="Cast" people={film.cast} />
        <Credit label="Screenplay" people={film.screenplay} />
        <Credit label="Music" people={film.composers} />
        <Credit label="Cinematography" people={film.photography} />
        <Credit label="Genre" people={film.genres} />
        <Credit label="Country" people={film.countries} />
        <Credit label="Dialogue" people={film.spokenLanguages} />
        <Credit label="Section" people={film.sections} />
        <Credit label="Format" people={film.format} />
      </dl>

      <div className="links">
        <a href={film.url} target="_blank" rel="noreferrer">
          Festival page <Icon name="external" size={14} />
        </a>
        {imdb && (
          <a href={imdb.url} target="_blank" rel="noreferrer">
            IMDb <Icon name="external" size={14} />
          </a>
        )}
        {film.ratings.rt && (
          <a href={film.ratings.rt.url} target="_blank" rel="noreferrer">
            Rotten Tomatoes <Icon name="external" size={14} />
          </a>
        )}
        {(film.kind === "film" || film.kind === "concert" || film.kind === "short") && (
          <a href={`https://www.youtube.com/results?search_query=${trailerQuery}`} target="_blank" rel="noreferrer">
            <Icon name="play" size={14} fill /> Trailer
          </a>
        )}
      </div>
    </div>
  );
}
