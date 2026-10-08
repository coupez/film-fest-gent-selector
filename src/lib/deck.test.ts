import { describe, expect, it } from "vitest";
import { NOW, film, imdb, screening, settings } from "../test/fixtures";
import { DEFAULT_SETTINGS } from "../../shared/types";
import { festivalDays, posterOf, score, sortViews, viewFilm } from "./deck";

const view = (f: ReturnType<typeof film>, over = {}) => viewFilm(f, settings(over), NOW);

describe("viewFilm: screenings", () => {
  it("passes an English film with an upcoming screening", () => {
    const v = view(film());
    expect(v.passes).toBe(true);
    expect(v.eligible).toHaveLength(1);
  });

  it("rejects a film when no screening works language-wise", () => {
    const v = view(film({ spokenLanguages: ["German"], screenings: [screening({ subtitles: ["Dutch", "French"] })] }));
    expect(v.passes).toBe(false);
    expect(v.screenings[0]).toMatchObject({ fit: "no", eligible: false });
  });

  it("keeps a film when only one of its screenings has subtitles both can read", () => {
    const f = film({
      spokenLanguages: ["German"],
      screenings: [screening({ subtitles: ["Dutch"] }), screening({ date: "2026-10-14", subtitles: ["English"] })],
    });
    const v = view(f);
    expect(v.passes).toBe(true);
    expect(v.eligible.map((x) => x.s.id)).toEqual([f.screenings[1].id]);
  });

  it("hides past screenings unless hidePast is off", () => {
    const f = film({ screenings: [screening({ date: "2026-10-09", time: "21:00" })] });
    const hidden = view(f);
    expect(hidden.screenings[0].past).toBe(true);
    expect(hidden.passes).toBe(false);
    expect(view(f, { hidePast: false }).passes).toBe(true);
  });

  it("counts a screening as past once it has started", () => {
    const f = film({ screenings: [screening({ date: "2026-10-10", time: "11:59" }), screening({ date: "2026-10-10", time: "12:01" })] });
    expect(view(f).screenings.map((x) => x.past)).toEqual([true, false]);
  });

  it("hides sold-out screenings by default, unless hideSoldOut is off", () => {
    const f = film({ screenings: [screening({ soldOut: true })] });
    expect(view(f).passes).toBe(false);
    expect(view(f, { hideSoldOut: false }).passes).toBe(true);
  });

  it("keeps a film when only some of its screenings are sold out", () => {
    const f = film({ screenings: [screening({ soldOut: true }), screening({ date: "2026-10-14" })] });
    expect(view(f).eligible.map((x) => x.s.date)).toEqual(["2026-10-14"]);
  });

  it("filters by day", () => {
    const f = film({ screenings: [screening({ date: "2026-10-12" }), screening({ date: "2026-10-15" })] });
    expect(view(f, { days: ["2026-10-15"] }).eligible.map((x) => x.s.date)).toEqual(["2026-10-15"]);
    expect(view(f, { days: ["2026-10-13"] }).passes).toBe(false);
    expect(view(f, { days: [] }).eligible).toHaveLength(2);
  });

  it("includes films with missing language info only when asked", () => {
    const f = film({ kind: "talk", spokenLanguages: [], subtitles: [], screenings: [screening({ subtitles: [] })] });
    expect(view(f, { kinds: ["talk"] }).passes).toBe(false);
    expect(view(f, { kinds: ["talk"], includeUnknownLanguage: true }).passes).toBe(true);
  });
});

describe("viewFilm: film filters", () => {
  it("shows only films by default", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ kinds: ["film"], hidePast: true, hideSoldOut: true });
    expect(view(film({ kind: "film" })).passes).toBe(true);
    expect(view(film({ kind: "concert" })).passes).toBe(false);
    expect(view(film({ kind: "talk" })).passes).toBe(false);
  });

  it("filters by kind", () => {
    expect(view(film({ kind: "concert" }), { kinds: ["film", "concert"] }).passes).toBe(true);
    expect(view(film({ kind: "film" }), { kinds: ["concert"] }).passes).toBe(false);
  });

  it("filters by section; empty means all", () => {
    const f = film({ sections: ["Classics", "Focus"] });
    expect(view(f, { sections: [] }).passes).toBe(true);
    expect(view(f, { sections: ["Focus"] }).passes).toBe(true);
    expect(view(f, { sections: ["Official Competition"] }).passes).toBe(false);
  });

  it("applies the minimum IMDb rating but keeps unrated films", () => {
    expect(view(film({ ratings: { imdb: imdb(6.4) } }), { minImdb: 6.5 }).passes).toBe(false);
    expect(view(film({ ratings: { imdb: imdb(6.5) } }), { minImdb: 6.5 }).passes).toBe(true);
    expect(view(film({ ratings: { imdb: imdb(null) } }), { minImdb: 6.5 }).passes).toBe(true);
    expect(view(film({ ratings: {} }), { minImdb: 6.5 }).passes).toBe(true);
    expect(view(film({ ratings: { imdb: imdb(3) } }), { minImdb: 0 }).passes).toBe(true);
  });
});

describe("sortViews", () => {
  const a = film({ id: "a", ratings: { imdb: imdb(6) }, screenings: [screening({ date: "2026-10-15" })] });
  const b = film({ id: "b", ratings: { imdb: imdb(8) }, screenings: [screening({ date: "2026-10-11" })] });
  const c = film({ id: "c", ratings: { rt: { url: "", critics: 70, audience: null, certified: false } }, screenings: [screening({ date: "2026-10-13" })] });
  const views = [a, b, c].map((f) => view(f));
  const ids = (vs: typeof views) => vs.map((v) => v.film.id);

  it("orders by soonest eligible screening", () => {
    expect(ids(sortViews(views, "date"))).toEqual(["b", "c", "a"]);
  });

  it("orders by combined rating", () => {
    expect(ids(sortViews(views, "rating"))).toEqual(["b", "c", "a"]);
  });

  it("shuffles the same way every time, whatever the input order", () => {
    const one = ids(sortViews(views, "shuffle"));
    expect(ids(sortViews([...views].reverse(), "shuffle"))).toEqual(one);
  });

  it("does not mutate its input", () => {
    const copy = [...views];
    sortViews(views, "date");
    expect(views).toEqual(copy);
  });
});

describe("helpers", () => {
  it("score averages IMDb and Rotten Tomatoes on a 10-point scale", () => {
    expect(score(film({ ratings: { imdb: imdb(8), rt: { url: "", critics: 60, audience: null, certified: false } } }))).toBe(7);
    expect(score(film({ ratings: { imdb: imdb(7) } }))).toBe(7);
    expect(score(film({ ratings: {} }))).toBe(0);
  });

  it("festivalDays lists every screening date once, sorted", () => {
    const fs = [film({ screenings: [screening({ date: "2026-10-12" }), screening({ date: "2026-10-09" })] }), film({ screenings: [screening({ date: "2026-10-12" })] })];
    expect(festivalDays(fs)).toEqual(["2026-10-09", "2026-10-12"]);
  });

  it("posterOf prefers a portrait IMDb poster and falls back to the festival stills", () => {
    const portrait = film({ ratings: { imdb: { ...imdb(7), poster: "https://m.media-amazon.com/images/M/x._V1_.jpg", posterRatio: 0.67 } } });
    const p = posterOf(portrait, 300);
    expect(p.portrait).toBe(true);
    expect(p.src).toBe("https://m.media-amazon.com/images/M/x._V1_QL80_UX300_.jpg");
    expect(p.srcs.slice(1)).toEqual([portrait.image, portrait.thumb]);
    const landscape = posterOf(film());
    expect(landscape.portrait).toBe(false);
    expect(landscape.srcs).toHaveLength(2);
  });
});
