# ReelMatch · Film Fest Gent

Tinder for the [Film Fest Gent](https://www.filmfestival.be/en/full-program) programme. Two people swipe through the films on their own phones. When both like the same film, it's a match: whoever completes it sees the match screen, and the other person gets the same screen live. The Matches tab lists every film you both liked with its screenings and ticket links.

## Features

- **The full programme, scraped**: 212 films, film concerts, talks and events, with 619 screenings (date, time, venue, subtitles per screening, sold-out state, ticket link). The data also includes descriptions, stills, cast and crew, and the films that share a programme.
- **Ratings** from IMDb (score, votes, Metascore, poster) and Rotten Tomatoes (critics and audience), wherever the film could be matched.
- **Language filter that fits both of you.** Each person lists the languages they understand. A screening qualifies only when *each* of you can follow it: either every spoken language is one you understand, or the subtitles are in one of your languages. Films with no dialogue always qualify. The defaults are Lucas = English + Dutch and Margarita = English + Italian. Because subtitles differ between screenings, the check runs per screening.
- **Shared filters**, edited by either of you and synced live: languages, type (films, film concerts, shorts, talks, events), days, past and sold-out screenings, sections, minimum IMDb rating, and deck order (shuffle, soonest first, best rated). The shuffle gives you both the same order, so matches can happen while you swipe together.
- **The swipe deck**: drag left or right, use the buttons, or use the keyboard (`←` / `→`, `↑` for details, `Backspace` to undo). Scroll down a card for the description, every screening with ✓/✕ language marks for each of you, stills, credits, and links to IMDb, Rotten Tomatoes, the festival page and a trailer search.
- **Matches**: a poster grid, a day-by-day schedule that flags overlapping screenings, and *My votes*, where you can change your mind. Matches made while you were away appear when you open the app.
- **Real time** over WebSockets: matches, filter changes, and whether your partner is online.

## Stack

| Part | What |
| --- | --- |
| Frontend | React 18 + Vite, `motion` for gestures and animation, hand-written CSS |
| Backend | One Cloudflare Worker (`worker/index.ts`) serving the static assets and `/api/*` |
| State | One Durable Object (`Room`, SQLite storage) holding votes, matches, shared filters, and the WebSockets |
| Data | `scripts/scrape.mjs` → `public/data/films.json` (a static asset) |

## Running it

```bash
npm install
npm run scrape        # optional — refresh public/data/films.json (takes ~1 min, cached in .cache/)
npm run dev           # Vite on http://localhost:5173 (hot reload) + wrangler dev on :8787 (API + Durable Object)
```

Other scripts:

```bash
npm run preview       # build, then serve the production bundle via wrangler on http://localhost:8787
npm run tunnel        # expose :8787 on a temporary https://*.trycloudflare.com URL (needs `cloudflared` installed)
npm run deploy        # build + wrangler deploy
npm run typecheck
```

### Tests

```bash
npm test              # Vitest unit tests for the language rule and deck filtering (src/lib/*.test.ts)
npm run test:e2e      # Playwright: two browser contexts (Lucas + Margarita) against `npm run preview`
```

The e2e tests reuse a server already running on :8787 (otherwise they start `npm run preview`), and they reset both people's votes and the shared filters, so don't run them against a room you care about. Run `npx playwright install chromium` once first.

To test on two phones, run `npm run preview` in one terminal and `npm run tunnel` in another, then open the `trycloudflare.com` URL on both phones.

### Deploying to Cloudflare

1. `npx wrangler login`
2. `npx wrangler secret put SESSION_SECRET` (any long random string; it signs the session cookie)
3. `npm run deploy`

The Durable Object migration is already declared in `wrangler.jsonc`.

## Auth

Right now, logging in means tapping your name on the start screen. The Worker then sets a signed, HTTP-only cookie (`ffg_session`). The two people are defined in `shared/users.ts`.

The cookie is the only thing the rest of the app depends on, so email magic links only need to be added at login. The plan is a `POST /api/login/email` endpoint that stores a one-time token in the Durable Object and emails a link, for example with Cloudflare Email Workers or Resend. A `GET /api/login/verify?token=…` endpoint then calls the existing `sessionCookie()`.

## Refreshing the programme

The festival site loads its programme from a public Elasticsearch index. The scraper reads that index's configuration from the programme page and pulls every record for the current edition. It then fetches each detail page for screenings, subtitles, runtime, year and stills. Finally it matches films to IMDb by title, year and director, and looks up the Rotten Tomatoes page through Wikidata. Run `npm run scrape -- --fresh` to ignore the cache, then redeploy.

IMDb and Rotten Tomatoes data are used for personal, non-commercial purposes only.
