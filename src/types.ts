import type { Kind } from "../shared/types";

export interface Screening {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  venue: string;
  subtitles: string[];
  soldOut: boolean;
  ticketUrl: string | null;
  guests: string | null;
}

export interface Film {
  id: string;
  slug: string;
  url: string;
  kind: Kind;
  model: "film" | "composition";
  title: string;
  directors: string[];
  cast: string[];
  composers: string[];
  screenplay: string[];
  photography: string[];
  year: number | null;
  runtime: number | null;
  genres: string[];
  countries: string[];
  spokenLanguages: string[];
  subtitles: string[];
  format: string | null;
  sections: string[];
  tags: string[];
  intro: string[];
  description: string[];
  image: string;
  thumb: string;
  gallery: { src: string; full?: string; w: number | null; h: number | null }[];
  parts: { url: string; title: string; director: string | null; runtime: number | null; image: string | null }[];
  screenedFilm?: { title: string; year: number | null; director: string | null; runtime: number | null };
  screenings: Screening[];
  ratings: {
    imdb?: { id: string; url: string; title: string | null; rating: number | null; votes: number; metascore: number | null; plot: string | null; poster: string | null; posterRatio: number | null };
    rt?: { url: string; critics: number | null; audience: number | null; certified: boolean };
  };
}

export interface Programme {
  generatedAt: string;
  edition: number;
  source: string;
  films: Film[];
}
