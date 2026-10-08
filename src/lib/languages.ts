import type { Settings } from "../../shared/types";
import type { UserId } from "../../shared/users";
import type { Film, Screening } from "../types";

const ALIASES: Record<string, string> = {
  Flemish: "Dutch",
  Nederlands: "Dutch",
  Farsi: "Persian",
  "Punjabi (Panjabi)": "Punjabi",
  Pushto: "Pashto",
};

export const LANGUAGE_CHOICES = [
  "English", "Dutch", "French", "Italian", "German", "Spanish", "Portuguese", "Arabic", "Russian", "Persian", "Japanese", "Mandarin",
];

export const normLang = (l: string) => ALIASES[l.trim()] || l.trim();
const isNoDialogue = (l: string) => /no dialogue/i.test(l);
const isNoSubs = (l: string) => /no subtitles/i.test(l);

export type Fit = "yes" | "no" | "unknown";

export interface ScreeningLanguages {
  spoken: string[];
  subs: string[];
  noDialogue: boolean;
}

export function screeningLanguages(film: Film, s?: Screening): ScreeningLanguages {
  const rawSpoken = film.spokenLanguages;
  // A screening lists its own subtitles; fall back to the film's when it doesn't say.
  const rawSubs = s && s.subtitles.length ? s.subtitles : film.subtitles;
  const noDialogue =
    (rawSpoken.length > 0 && rawSpoken.every(isNoDialogue)) || rawSubs.some(isNoDialogue);
  return {
    spoken: rawSpoken.filter((l) => !isNoDialogue(l)).map(normLang),
    subs: rawSubs.filter((l) => !isNoDialogue(l) && !isNoSubs(l)).map(normLang),
    noDialogue,
  };
}

/** Can someone who understands `langs` follow this? Either every spoken language is theirs, or the subtitles are. */
export function understands(langs: string[], l: ScreeningLanguages): Fit {
  if (l.noDialogue) return "yes";
  if (l.subs.some((s) => langs.includes(s))) return "yes";
  if (l.spoken.length === 0) return "unknown";
  return l.spoken.every((s) => langs.includes(s)) ? "yes" : "no";
}

export function screeningFit(settings: Settings, film: Film, s?: Screening): { fit: Fit; perUser: Record<string, Fit> } {
  const l = screeningLanguages(film, s);
  const perUser = Object.fromEntries(
    (Object.keys(settings.langs) as UserId[]).map((u) => [u, understands(settings.langs[u], l)]),
  ) as Record<string, Fit>;
  const fits = Object.values(perUser);
  const fit: Fit = fits.includes("no") ? "no" : fits.includes("unknown") ? "unknown" : "yes";
  return { fit, perUser };
}
