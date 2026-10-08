import { describe, expect, it } from "vitest";
import { film, screening, settings } from "../test/fixtures";
import { normLang, screeningFit, screeningLanguages, understands } from "./languages";

const fitOf = (f: ReturnType<typeof film>, s = f.screenings[0], st = settings()) => screeningFit(st, f, s);

describe("screeningLanguages", () => {
  it("uses the screening's own subtitles over the film's", () => {
    const f = film({ subtitles: ["Dutch"], screenings: [screening({ subtitles: ["English"] })] });
    expect(screeningLanguages(f, f.screenings[0]).subs).toEqual(["English"]);
  });

  it("falls back to the film's subtitles when the screening lists none", () => {
    const f = film({ subtitles: ["Dutch", "French"], screenings: [screening({ subtitles: [] })] });
    expect(screeningLanguages(f, f.screenings[0]).subs).toEqual(["Dutch", "French"]);
  });

  it("drops 'No subtitles' and normalises aliases", () => {
    const f = film({ spokenLanguages: ["Flemish", "Farsi"], screenings: [screening({ subtitles: ["No subtitles"] })] });
    expect(screeningLanguages(f, f.screenings[0])).toEqual({ spoken: ["Dutch", "Persian"], subs: [], noDialogue: false });
  });

  it("detects no dialogue in either the spoken languages or the subtitles", () => {
    expect(screeningLanguages(film({ spokenLanguages: ["no dialogue"] })).noDialogue).toBe(true);
    expect(screeningLanguages(film({ spokenLanguages: [], subtitles: ["no dialogue"] })).noDialogue).toBe(true);
  });
});

describe("normLang", () => {
  it("maps known aliases and trims", () => {
    expect(normLang(" Nederlands ")).toBe("Dutch");
    expect(normLang("Punjabi (Panjabi)")).toBe("Punjabi");
    expect(normLang("Italian")).toBe("Italian");
  });
});

describe("understands", () => {
  const l = (spoken: string[], subs: string[] = [], noDialogue = false) => ({ spoken, subs, noDialogue });

  it("needs every spoken language when there are no usable subtitles", () => {
    expect(understands(["English", "Italian"], l(["English", "Italian"]))).toBe("yes");
    expect(understands(["English", "Dutch"], l(["English", "Italian"]))).toBe("no");
  });

  it("accepts any subtitle language the person reads", () => {
    expect(understands(["English"], l(["Korean"], ["French", "English"]))).toBe("yes");
  });

  it("is unknown when nothing about the language is known", () => {
    expect(understands(["English"], l([]))).toBe("unknown");
    expect(understands(["English"], l([], ["Dutch"]))).toBe("unknown");
  });
});

describe("screeningFit", () => {
  it("English film without subtitles works for both", () => {
    const r = fitOf(film({ spokenLanguages: ["English"], screenings: [screening({ subtitles: ["No subtitles"] })] }));
    expect(r).toEqual({ fit: "yes", perUser: { lucas: "yes", margarita: "yes" } });
  });

  it("French film with English subtitles works for both", () => {
    const r = fitOf(film({ spokenLanguages: ["French"], screenings: [screening({ subtitles: ["English"] })] }));
    expect(r).toEqual({ fit: "yes", perUser: { lucas: "yes", margarita: "yes" } });
  });

  it("German film with only Dutch/French subtitles fails for Margarita", () => {
    const r = fitOf(film({ spokenLanguages: ["German"], screenings: [screening({ subtitles: ["Dutch", "French"] })] }));
    expect(r).toEqual({ fit: "no", perUser: { lucas: "yes", margarita: "no" } });
  });

  it("checks each screening separately", () => {
    const f = film({
      spokenLanguages: ["German"],
      screenings: [screening({ subtitles: ["Dutch"] }), screening({ subtitles: ["English", "Dutch"] })],
    });
    expect(fitOf(f, f.screenings[0]).fit).toBe("no");
    expect(fitOf(f, f.screenings[1]).fit).toBe("yes");
  });

  it("Dutch film without subtitles fails for Margarita only", () => {
    const r = fitOf(film({ spokenLanguages: ["Flemish"], screenings: [screening({ subtitles: ["No subtitles"] })] }));
    expect(r.perUser).toEqual({ lucas: "yes", margarita: "no" });
  });

  it("films without dialogue always work", () => {
    const r = fitOf(film({ spokenLanguages: ["no dialogue"], screenings: [screening({ subtitles: [] })] }));
    expect(r.fit).toBe("yes");
  });

  it("missing language info is unknown, not a fit", () => {
    const r = fitOf(film({ spokenLanguages: [], subtitles: [], screenings: [screening({ subtitles: [] })] }));
    expect(r).toEqual({ fit: "unknown", perUser: { lucas: "unknown", margarita: "unknown" } });
  });

  it("a yes and an unknown add up to unknown", () => {
    // Spoken unknown, Dutch subs: Lucas reads them, Margarita can't tell.
    const r = fitOf(film({ spokenLanguages: [], screenings: [screening({ subtitles: ["Dutch"] })] }));
    expect(r).toEqual({ fit: "unknown", perUser: { lucas: "yes", margarita: "unknown" } });
  });

  it("follows the languages in the shared settings", () => {
    const f = film({ spokenLanguages: ["German"], screenings: [screening({ subtitles: ["Dutch", "French"] })] });
    const st = settings({ langs: { lucas: ["English", "Dutch"], margarita: ["English", "Italian", "French"] } });
    expect(fitOf(f, f.screenings[0], st).fit).toBe("yes");
  });
});
