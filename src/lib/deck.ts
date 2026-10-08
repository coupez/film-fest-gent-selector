import type { Settings } from "../../shared/types";
import type { Film, Screening } from "../types";
import { screeningDate } from "./format";
import { screeningFit, type Fit } from "./languages";

export interface ScreeningInfo {
  s: Screening;
  start: Date;
  past: boolean;
  fit: Fit;
  perUser: Record<string, Fit>;
  /** Passes every filter (language, day, sold out, past). */
  eligible: boolean;
}

export interface FilmView {
  film: Film;
  screenings: ScreeningInfo[];
  eligible: ScreeningInfo[];
  passes: boolean;
}

const languageOk = (fit: Fit, settings: Settings) => fit === "yes" || (fit === "unknown" && settings.includeUnknownLanguage);

export function viewFilm(film: Film, settings: Settings, now: Date): FilmView {
  const screenings = film.screenings.map((s) => {
    const start = screeningDate(s.date, s.time);
    const past = start.getTime() < now.getTime();
    const { fit, perUser } = screeningFit(settings, film, s);
    const eligible =
      languageOk(fit, settings) &&
      !(settings.hidePast && past) &&
      !(settings.hideSoldOut && s.soldOut) &&
      (settings.days.length === 0 || settings.days.includes(s.date));
    return { s, start, past, fit, perUser, eligible };
  });
  const eligible = screenings.filter((x) => x.eligible);
  const rating = film.ratings.imdb?.rating;
  const passes =
    eligible.length > 0 &&
    settings.kinds.includes(film.kind) &&
    (settings.sections.length === 0 || film.sections.some((s) => settings.sections.includes(s))) &&
    (!settings.minImdb || rating == null || rating >= settings.minImdb);
  return { film, screenings, eligible, passes };
}

// Same pseudo-random order for both people, so likes can turn into matches while swiping together.
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const score = (f: Film) => {
  const imdb = f.ratings.imdb?.rating;
  const rt = f.ratings.rt?.critics;
  if (imdb == null && rt == null) return 0;
  return ((imdb ?? rt! / 10) + (rt ?? imdb! * 10) / 10) / 2;
};

export function sortViews(views: FilmView[], order: Settings["order"]) {
  const v = [...views];
  if (order === "date") v.sort((a, b) => a.eligible[0].start.getTime() - b.eligible[0].start.getTime());
  else if (order === "rating") v.sort((a, b) => score(b.film) - score(a.film) || hash(a.film.id) - hash(b.film.id));
  else v.sort((a, b) => hash(a.film.id + "ffg") - hash(b.film.id + "ffg"));
  return v;
}

export function festivalDays(films: Film[]) {
  return [...new Set(films.flatMap((f) => f.screenings.map((s) => s.date)))].sort();
}

export function posterOf(film: Film, width = 720) {
  const p = film.ratings.imdb;
  const stills = [film.image, film.thumb];
  if (p?.poster && (p.posterRatio ?? 1) < 0.85) {
    const src = p.poster.replace(/\._V1_.*\.jpg$/, `._V1_QL80_UX${width}_.jpg`);
    return { src, srcs: [src, ...stills], portrait: true };
  }
  return { src: film.image, srcs: stills, portrait: false };
}
