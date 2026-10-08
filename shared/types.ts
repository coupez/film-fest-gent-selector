import { USERS, type UserId } from "./users";

export type Vote = "like" | "nope";
export type Kind = "film" | "short" | "concert" | "talk" | "other";
export type Order = "shuffle" | "date" | "rating";

export interface Settings {
  /** Languages each person understands (spoken or as subtitles). */
  langs: Record<UserId, string[]>;
  kinds: Kind[];
  /** ISO dates (YYYY-MM-DD); empty means every day. */
  days: string[];
  /** Festival sections; empty means all. */
  sections: string[];
  hidePast: boolean;
  hideSoldOut: boolean;
  includeUnknownLanguage: boolean;
  minImdb: number;
  order: Order;
  updatedBy?: UserId;
  updatedAt?: number;
}

export const DEFAULT_SETTINGS: Settings = {
  langs: Object.fromEntries(USERS.map((u) => [u.id, [...u.langs]])) as Record<UserId, string[]>,
  kinds: ["film"],
  days: [],
  sections: [],
  hidePast: true,
  hideSoldOut: true,
  includeUnknownLanguage: false,
  minImdb: 0,
  order: "shuffle",
};

export interface RoomState {
  votes: Record<UserId, Record<string, { vote: Vote; at: number }>>;
  matches: { filmId: string; at: number }[];
  seen: Record<UserId, string[]>;
  /** The screening we're going to, per matched film (shared by both people). */
  picks: Record<string, Pick>;
  settings: Settings;
  online: UserId[];
}

export interface Pick {
  screeningId: string;
  by: UserId;
  at: number;
}

export type ServerMessage =
  | { type: "vote"; user: UserId; filmId: string; vote: Vote | null; at: number; match: boolean; newMatch: boolean }
  | { type: "settings"; settings: Settings }
  | { type: "presence"; online: UserId[] }
  | { type: "pick"; filmId: string; pick: Pick | null }
  | { type: "reset"; user: UserId };
