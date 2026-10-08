import { DEFAULT_SETTINGS, type Settings } from "../../shared/types";
import type { Film, Screening } from "../types";

let n = 0;

export function screening(over: Partial<Screening> = {}): Screening {
  n++;
  return {
    id: `s${n}`,
    date: "2026-10-12",
    time: "20:00",
    venue: "Kinepolis 1",
    subtitles: [],
    soldOut: false,
    ticketUrl: "https://example.com/tickets",
    guests: null,
    ...over,
  };
}

export function film(over: Partial<Film> = {}): Film {
  n++;
  return {
    id: `f${n}`,
    slug: `film-${n}`,
    url: `https://www.filmfestival.be/en/film/film-${n}`,
    kind: "film",
    model: "film",
    title: `Film ${n}`,
    directors: [],
    cast: [],
    composers: [],
    screenplay: [],
    photography: [],
    year: 2026,
    runtime: 100,
    genres: [],
    countries: [],
    spokenLanguages: ["English"],
    subtitles: [],
    format: null,
    sections: ["Official Competition"],
    tags: [],
    intro: [],
    description: [],
    image: "https://example.com/image.jpg",
    thumb: "https://example.com/thumb.jpg",
    gallery: [],
    parts: [],
    screenings: [screening()],
    ratings: {},
    ...over,
  };
}

export const imdb = (rating: number | null) => ({
  id: "tt0000001",
  url: "https://www.imdb.com/title/tt0000001/",
  title: null,
  rating,
  votes: 1000,
  metascore: null,
  plot: null,
  poster: null,
  posterRatio: null,
});

/** Defaults (Lucas: English + Dutch, Margarita: English + Italian) with optional overrides. */
export const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over });

/** Before every screening in the fixtures, so nothing counts as past unless a test says so. */
export const NOW = new Date("2026-10-10T12:00:00+02:00");
