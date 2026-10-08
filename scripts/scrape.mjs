#!/usr/bin/env node
// Scrapes the Film Fest Gent programme and enriches it with IMDb + Rotten Tomatoes data.
// Output: public/data/films.json (served as a static asset by the Worker).
//
//   npm run scrape            # uses .cache for HTTP responses younger than 6h
//   npm run scrape -- --fresh # ignore the cache
import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = join(ROOT, ".cache");
const OUT = join(ROOT, "public", "data", "films.json");
const FRESH = process.argv.includes("--fresh");
const CACHE_TTL_MS = 6 * 3600 * 1000;

const SITE = "https://www.filmfestival.be";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ---------------------------------------------------------------------------
// HTTP with a small on-disk cache
// ---------------------------------------------------------------------------
async function cached(key, ttl, fn) {
  const file = join(CACHE_DIR, createHash("sha1").update(key).digest("hex") + ".json");
  if (!FRESH) {
    try {
      const s = await stat(file);
      if (Date.now() - s.mtimeMs < ttl) return JSON.parse(await readFile(file, "utf8")).v;
    } catch {}
  }
  const v = await fn();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(file, JSON.stringify({ key, v }));
  return v;
}

async function http(url, opts = {}, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { ...opts, headers: { "User-Agent": UA, ...(opts.headers || {}) } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.text();
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 800 * 2 ** i));
    }
  }
}

const getText = (url, opts, ttl = CACHE_TTL_MS) =>
  cached(url + JSON.stringify(opts?.body || ""), ttl, () => http(url, opts));

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        try {
          out[i] = await fn(items[i], i);
        } catch (e) {
          console.warn(`  ! ${e.message}`);
          out[i] = null;
        }
        done++;
        if (done % 20 === 0 || done === items.length) process.stdout.write(`  ${done}/${items.length}\n`);
      }
    }),
  );
  return out;
}

// ---------------------------------------------------------------------------
// 1. Programme index (the site's own public Elasticsearch search index)
// ---------------------------------------------------------------------------
async function fetchIndex() {
  const page = await getText(`${SITE}/en/full-program`);
  const host = page.match(/host:\s*"([^"]+)"/)?.[1];
  const index = page.match(/index:\s*"([^"]+)"/)?.[1];
  const key = page.match(/searchKey:\s*"([^"]+)"/)?.[1];
  const year = page.match(/editionInfo:\s*\{"year":"(\d{4})"/)?.[1] || String(new Date().getFullYear());
  if (!host || !key) throw new Error("Could not find search config on programme page");
  const body = JSON.stringify({ size: 1000, query: { term: { edition_year: Number(year) } } });
  const json = await getText(`${host}/${index}/_search`, {
    method: "POST",
    headers: { Authorization: `ApiKey ${key}`, "Content-Type": "application/json" },
    body,
  });
  return { year: Number(year), records: JSON.parse(json).hits.hits.map((h) => h._source) };
}

// ---------------------------------------------------------------------------
// 2. Detail pages
// ---------------------------------------------------------------------------
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
const splitList = (s) =>
  clean(s)
    .split(/\s*,\s*/)
    .filter(Boolean);

function paragraphs($, el) {
  const ps = $(el)
    .find("p")
    .map((_, p) => clean($(p).text()))
    .get()
    .filter(Boolean);
  if (ps.length) return ps;
  const t = clean($(el).text());
  return t ? [t] : [];
}

function parseDetail(html, year) {
  const $ = cheerio.load(html);
  const main = $("main").first();
  const d = { meta: {} };

  d.heroImage = main.find("img").first().attr("data-src") || null;
  d.kicker = clean(main.find(".t-alpha--hero h2").first().text()) || null;

  // "105' - 1969 - Drama, Comedy - Format: Digital file - Dialogue: French"
  const metaBox = main.find(".border-b.border-black").first();
  metaBox.find("span").each((_, s) => {
    const strong = clean($(s).children("strong").text());
    const txt = clean($(s).text());
    if (strong) {
      d.meta[strong.replace(/:$/, "").toLowerCase()] = clean(txt.slice(strong.length));
    } else if (/^\d+'$/.test(txt)) d.runtime = parseInt(txt);
    else if (/^\d{4}$/.test(txt)) d.year = parseInt(txt);
    else if (txt && txt !== "-" && !$(s).find("strong").length) d.meta.genres = txt;
  });

  d.intro = paragraphs($, main.find(".t-intro").first());

  // Credits sidebar: <strong>Director</strong> Name
  d.credits = {};
  main.find("span.inline-block").each((_, s) => {
    const label = clean($(s).children("strong").first().text());
    if (!label) return;
    const val = clean($(s).text().slice($(s).children("strong").first().text().length));
    if (val && label.length < 40) d.credits[label.toLowerCase()] = val;
  });

  // Screenings
  d.screenings = [];
  main.find("[data-tickets] > div").each((_, row) => {
    const r = $(row);
    const day = parseInt(r.find(".font-azeret").first().text());
    const monthName = clean(r.find(".text-gray-300").first().text()).toLowerCase();
    const month = MONTHS.indexOf(monthName);
    const info = r.find(".flex-grow").first();
    const bits = info.find("> div").first().children("span");
    const time = clean(bits.eq(0).text());
    const venue = clean(bits.eq(2).text());
    let subtitles = [];
    info.find("strong").each((_, st) => {
      if (/subtitles/i.test($(st).text()))
        subtitles = clean($(st).next("span").text())
          .split(/\s*(?:,| - |\/)\s*/)
          .filter(Boolean);
    });
    const ticket = r.find("a[href*='ticketmatic']").first();
    const btnText = clean(ticket.text()).toLowerCase();
    const guests = r.find("[data-guests-tooltip]").first().attr("data-guests-tooltip") || null;
    const tmId = r.find("[data-tm-id]").attr("data-tm-id") || null;
    const labels = r
      .find(".bg-theme-primary")
      .map((_, x) => clean($(x).text()))
      .get()
      .filter((x) => x && !/guest/i.test(x));
    if (!day || month < 0 || !/^\d{1,2}:\d{2}$/.test(time)) return;
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    d.screenings.push({
      id: tmId || `${date}T${time}-${venue}`,
      date,
      time,
      venue,
      subtitles,
      soldOut: /sold\s*out|soldout|uitverkocht/.test(btnText),
      ticketUrl: ticket.attr("href") || null,
      guests,
      labels: [...new Set(labels)],
    });
  });

  // Long description: the block right after the tickets
  const ticketsBlock = main.find("[data-tickets]").first();
  d.description = paragraphs($, ticketsBlock.next());

  // Components of a composition (e.g. a film + live concert, a shorts programme)
  d.parts = [];
  main
    .find("a[href*='/film/']")
    .filter((_, a) => $(a).find("h3").length > 0)
    .each((_, a) => {
      const el = $(a);
      const title = clean(el.find("h3").text());
      if (!title || d.parts.some((p) => p.url === el.attr("href"))) return;
      d.parts.push({
        url: el.attr("href"),
        title,
        director: clean(el.find("h3").next().children("span").first().text()) || null,
        runtime: parseInt(el.find("em").first().text()) || null,
        image: el.find("img").attr("data-src") || null,
      });
    });
  if (!d.description.length && d.parts.length === 0) {
    d.description = paragraphs($, main.find(".prose, .rich-text").first());
  }

  // Gallery
  d.gallery = main
    .find("[data-movie-gallery-item]")
    .map((_, g) => {
      const el = $(g);
      return {
        src: el.find("img").attr("data-src") || el.find("img").attr("src"),
        full: el.attr("data-fullsize-src"),
        w: Number(el.attr("data-fullsize-width")) || null,
        h: Number(el.attr("data-fullsize-height")) || null,
      };
    })
    .get()
    .filter((g) => g.src);
  if (!d.gallery.length) {
    $("[data-movie-gallery-item]").each((_, g) => {
      const el = $(g);
      const src = el.find("img").attr("data-src");
      if (src) d.gallery.push({ src, full: el.attr("data-fullsize-src"), w: null, h: null });
    });
  }
  return d;
}

// ---------------------------------------------------------------------------
// 3. IMDb + Rotten Tomatoes enrichment (personal, non-commercial use)
// ---------------------------------------------------------------------------
const norm = (s) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function titleVariants(title) {
  const out = new Set([title]);
  const m = title.match(/^(.*?)\s*\((.+)\)\s*$/);
  if (m) {
    out.add(m[1]);
    out.add(m[2]);
  }
  for (const t of [...out]) out.add(t.replace(/^(the|a|an|le|la|les|de|het|een|el|il)\s+/i, ""));
  return [...out].filter((t) => t.length > 1);
}

async function imdbGraphql(query) {
  const text = await getText(
    "https://caching.graphql.imdb.com/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-imdb-client-name": "imdb-web-next-localized",
        Origin: "https://www.imdb.com",
      },
      body: JSON.stringify({ query }),
    },
    24 * 3600 * 1000,
  );
  return text ? JSON.parse(text).data : null;
}

const IMDB_FIELDS = `id titleText{text} originalTitleText{text} releaseYear{year} runtime{seconds}
  ratingsSummary{aggregateRating voteCount} metacritic{metascore{score}}
  plot{plotText{plainText}} primaryImage{url width height}
  directors: credits(first:6, filter:{categories:["director"]}){edges{node{name{nameText{text}}}}}`;

async function findImdb(film) {
  if (!film.year && !film.directors.length) return null;
  const candidates = new Map();
  for (const t of titleVariants(film.title).slice(0, 4)) {
    const q = encodeURIComponent(norm(t).slice(0, 60));
    if (!q) continue;
    const text = await getText(`https://v3.sg.media-imdb.com/suggestion/x/${q}.json?includeVideos=0`, {}, 24 * 3600 * 1000);
    for (const c of (text && JSON.parse(text).d) || []) {
      if (!c.id?.startsWith("tt")) continue;
      if (!["movie", "short", "tvMovie", "tvMiniSeries", "tvSeries", "video", "tvSpecial"].includes(c.qid)) continue;
      if (film.year && c.y && Math.abs(c.y - film.year) > 1) continue;
      candidates.set(c.id, c);
    }
  }
  if (!candidates.size) return null;
  const ids = [...candidates.keys()].slice(0, 6);
  const data = await imdbGraphql(`{ ${ids.map((id, i) => `t${i}: title(id:"${id}"){ ${IMDB_FIELDS} }`).join(" ")} }`);
  if (!data) return null;
  const wantDirectors = film.directors.map(norm);
  const wantTitles = titleVariants(film.title).map(norm);
  let best = null;
  let bestScore = 0;
  ids.forEach((id, i) => {
    const t = data[`t${i}`];
    if (!t) return;
    const dirs = (t.directors?.edges || []).map((e) => norm(e.node.name.nameText.text));
    const dirMatch = wantDirectors.some((w) => dirs.some((d) => d === w || d.includes(w) || w.includes(d)));
    const titles = [t.titleText?.text, t.originalTitleText?.text].map(norm);
    const titleMatch = titles.some((x) => wantTitles.includes(x));
    const yearMatch = film.year && t.releaseYear?.year === film.year;
    // Need a director match, or an exact title + exact year match when we have no director.
    let score = (dirMatch ? 4 : 0) + (titleMatch ? 2 : 0) + (yearMatch ? 1 : 0);
    if (!dirMatch && !(titleMatch && yearMatch && !wantDirectors.length)) score = 0;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  });
  if (!best) return null;
  return {
    id: best.id,
    url: `https://www.imdb.com/title/${best.id}/`,
    title: best.titleText?.text || null,
    rating: best.ratingsSummary?.aggregateRating ?? null,
    votes: best.ratingsSummary?.voteCount ?? 0,
    metascore: best.metacritic?.metascore?.score ?? null,
    plot: best.plot?.plotText?.plainText || null,
    poster: best.primaryImage?.url || null,
    posterRatio: best.primaryImage ? best.primaryImage.width / best.primaryImage.height : null,
  };
}

async function rtSlugs(imdbIds) {
  const out = {};
  for (let i = 0; i < imdbIds.length; i += 150) {
    const chunk = imdbIds.slice(i, i + 150);
    const query = `SELECT ?i ?rt WHERE { VALUES ?i { ${chunk.map((x) => `"${x}"`).join(" ")} } ?f wdt:P345 ?i; wdt:P1258 ?rt }`;
    const text = await getText(
      `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`,
      { headers: { Accept: "application/sparql-results+json", "User-Agent": "ffg-selector/1.0 (personal project)" } },
      24 * 3600 * 1000,
    );
    for (const b of JSON.parse(text).results.bindings) if (b.rt.value.startsWith("m/")) out[b.i.value] = b.rt.value;
  }
  return out;
}

async function rtScores(slug) {
  const html = await getText(`https://www.rottentomatoes.com/${slug}`, {}, 24 * 3600 * 1000);
  if (!html) return null;
  const critics = html.match(/"criticsScore":\{[^}]*?"score":"(\d+)"/)?.[1];
  const audience = html.match(/"audienceScore":\{[^}]*?"score":"(\d+)"/)?.[1];
  const certified = /"criticsScore":\{[^}]*?"certified":true/.test(html);
  if (!critics && !audience) return null;
  return {
    url: `https://www.rottentomatoes.com/${slug}`,
    critics: critics ? Number(critics) : null,
    audience: audience ? Number(audience) : null,
    certified,
  };
}

// ---------------------------------------------------------------------------
// 4. Assemble
// ---------------------------------------------------------------------------
const decode = (s) => cheerio.load(`<i>${s || ""}</i>`)("i").text();
const KIND = { films: "film", concerts: "concert", talks: "talk", others: "other" };

async function main() {
  console.log("→ Fetching programme index");
  const { year, records } = await fetchIndex();
  console.log(`  ${records.length} records for ${year}`);

  console.log("→ Fetching detail pages");
  const details = await pool(records, 8, async (r) => {
    const html = await getText(`${SITE}/en/${r.uri}`);
    return html ? parseDetail(html, year) : null;
  });

  let films = records.map((r, i) => {
    const d = details[i] || { screenings: [], gallery: [], intro: [], description: [], parts: [], meta: {}, credits: {} };
    const en = (o) => (o && (o.en || o.nl)) || [];
    const directors = r.directors?.length ? r.directors : d.credits.director ? splitList(d.credits.director) : [];
    return {
      id: r.id,
      slug: r.uri,
      url: `${SITE}/en/${r.uri}`,
      kind: KIND[r.collection.find((c) => c !== "all")] || "other",
      model: r.model,
      title: decode(r.title),
      directors,
      cast: r.cast || [],
      composers: r.composers || [],
      screenplay: r.screenplay || [],
      photography: r.photography || [],
      producers: r.producers || [],
      year: d.year || null,
      runtime: d.runtime || null,
      genres: en(r.genres),
      countries: en(r.countries_of_production),
      spokenLanguages: en(r.spoken_languages),
      subtitles: en(r.subtitles),
      format: d.meta.format || null,
      sections: r.sections || [],
      tags: en(r.tags),
      intro: d.intro.length ? d.intro : [decode(r.intro?.en || r.intro?.nl || "")].filter(Boolean),
      description: d.description,
      image: d.heroImage || r.image_url,
      thumb: r.image_url,
      gallery: d.gallery,
      parts: d.parts,
      screenings: d.screenings.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
      ticketsAvailable: r.tickets_available,
      ratings: {},
    };
  });

  // Individual short films get their own kind; they are mostly screened in a shorts programme.
  for (const f of films) if (f.kind === "film" && f.model === "film" && f.runtime && f.runtime < 45) f.kind = "short";

  // Language info of every record, by URL, so compositions can inherit it from their parts.
  const byUrl = new Map(films.map((f) => [f.url, f]));

  // Films that are only screened as part of a composition have no screenings of their own.
  const before = films.length;
  films = films.filter((f) => f.screenings.length > 0);
  console.log(`  dropped ${before - films.length} items without own screenings`);

  // Compositions: inherit languages from their parts, and for single-film compositions
  // (e.g. a live-score concert) also year/runtime/director of the film that is screened.
  await pool(
    films.filter((f) => f.model === "composition" && f.parts.length),
    6,
    async (f) => {
      if (f.kind !== "film" && f.kind !== "concert" && f.kind !== "short") return;
      const parts = f.parts.map((p) => byUrl.get(p.url)).filter(Boolean);
      if (!f.spokenLanguages.length) f.spokenLanguages = [...new Set(parts.flatMap((p) => p.spokenLanguages))];
      if (!f.subtitles.length && parts.length && parts.length === f.parts.length) {
        // Only subtitles every part has.
        f.subtitles = parts[0].subtitles.filter((l) => parts.every((p) => p.subtitles.includes(l)));
      }
      if (f.parts.length !== 1) return;
      const p = f.parts[0];
      const html = await getText(p.url);
      if (!html) return;
      const d = parseDetail(html, year);
      f.screenedFilm = { title: p.title, year: d.year || null, director: p.director, runtime: d.runtime || p.runtime };
      if (!f.directors.length && p.director) f.directors = [p.director];
      if (!f.description.length) f.description = d.intro.concat(d.description);
      if (!f.gallery.length) f.gallery = d.gallery;
      if (!f.spokenLanguages.length && d.meta.dialogue) f.spokenLanguages = splitList(d.meta.dialogue);
    },
  );

  console.log("→ Matching on IMDb");
  const imdb = await pool(films, 6, (f) => {
    if (f.kind === "talk" || f.kind === "other") return null;
    const target = f.screenedFilm
      ? { title: f.screenedFilm.title, year: f.screenedFilm.year, directors: f.directors }
      : f.model === "composition"
        ? null
        : f;
    return target ? findImdb(target) : null;
  });
  films.forEach((f, i) => imdb[i] && (f.ratings.imdb = imdb[i]));
  console.log(`  matched ${imdb.filter(Boolean).length}/${films.length}`);

  console.log("→ Rotten Tomatoes");
  const ids = films.map((f) => f.ratings.imdb?.id).filter(Boolean);
  const slugs = await rtSlugs(ids);
  await pool(films, 6, async (f) => {
    const slug = slugs[f.ratings.imdb?.id];
    if (!slug) return;
    const rt = await rtScores(slug);
    if (rt) f.ratings.rt = rt;
  });
  console.log(`  ${films.filter((f) => f.ratings.rt).length} with RT scores`);

  const out = { generatedAt: new Date().toISOString(), edition: year, source: `${SITE}/en/full-program`, films };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out));
  console.log(`✓ Wrote ${films.length} items to ${OUT.replace(ROOT + "/", "")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
