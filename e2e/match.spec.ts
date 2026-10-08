import { expect, test, type Browser, type Page } from "@playwright/test";
import { DEFAULT_SETTINGS } from "../shared/types";

// Log in through the UI as one person, in a separate browser context (= a separate phone).
async function phone(browser: Browser, name: "Lucas" | "Margarita") {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(`\\b${name}\\b`) }).click();
  await expect(page.locator(".topbar")).toBeVisible();
  return page;
}

// The swiped card keeps its "top" class while it animates out, so wait until only one is left.
const topTitle = async (page: Page) => {
  await expect(page.locator(".card.top")).toHaveCount(1);
  return (await page.locator(".card.top .title").textContent())!;
};
const expectTop = (page: Page) => expect.poll(() => topTitle(page));
const votesOf = async (page: Page, user: string) => (await (await page.request.get("/api/state")).json()).votes[user] as Record<string, { vote: string }>;
const matchesOf = async (page: Page) => (await (await page.request.get("/api/state")).json()).matches as { filmId: string }[];

let lucas: Page;
let margarita: Page;

test.beforeEach(async ({ browser }) => {
  lucas = await phone(browser, "Lucas");
  margarita = await phone(browser, "Margarita");
  // Start from a clean room: reset clears the logged-in person's votes (and every match).
  await lucas.request.post("/api/reset");
  await margarita.request.post("/api/reset");
  await lucas.request.post("/api/settings", { data: { settings: DEFAULT_SETTINGS } });
  await Promise.all([lucas.reload(), margarita.reload()]);
});

test.afterEach(async () => {
  await lucas?.context().close();
  await margarita?.context().close();
});

test("first run shows the filters, then both decks start on the same film", async () => {
  await expect(lucas.getByRole("heading", { name: "Hi Lucas, let's set the stage" })).toBeVisible();
  // The count shrinks as screenings start or sell out, so just check nothing is rated yet.
  await expect(lucas.locator(".cta-count")).toHaveText(/^(\d+) to rate · \1 total$/);
  await lucas.getByRole("button", { name: /Start swiping/ }).click();
  await margarita.getByRole("button", { name: /Start swiping/ }).click();
  await expectTop(margarita).toBe(await topTitle(lucas));
});

test("a like from both shows a live match on both phones, and undo takes it back", async () => {
  for (const p of [lucas, margarita]) await p.getByRole("button", { name: /Start swiping/ }).click();
  const film = await topTitle(lucas);

  // Lucas likes first with the button; nothing happens on Margarita's phone yet.
  await lucas.getByRole("button", { name: "Like" }).click();
  await expectTop(lucas).not.toBe(film);
  await expect(margarita.locator(".match-overlay")).toHaveCount(0);

  // Margarita completes the match with the keyboard.
  await margarita.keyboard.press("ArrowRight");
  for (const p of [lucas, margarita]) {
    await expect(p.locator(".match-overlay")).toBeVisible();
    await expect(p.locator(".match-title")).toHaveText("It's a match");
    await expect(p.locator(".match-film h2")).toHaveText(film);
  }
  await expect(lucas.locator(".match-sub")).toHaveText("Margarita just liked it too!");
  await expect(margarita.locator(".match-sub")).toHaveText("Lucas already wanted to see this one");
  expect(await matchesOf(lucas)).toHaveLength(1);

  // Shortcuts are ignored while the match screen is up.
  await margarita.keyboard.press("ArrowLeft");
  expect(Object.keys(await votesOf(margarita, "margarita"))).toHaveLength(1);

  // Lucas dismisses; the "new match" badge is cleared once he has seen it.
  await lucas.getByRole("button", { name: "Keep swiping" }).click();
  await expect(lucas.locator(".match-overlay")).toHaveCount(0);
  await expect(lucas.locator(".tab-badge")).toHaveCount(0);

  // Margarita still has the match screen open. Lucas undoes his like: the match is gone,
  // the film is back on top of his deck, and Margarita's match screen disappears.
  await lucas.getByRole("button", { name: "Undo" }).click();
  await expectTop(lucas).toBe(film);
  await expect.poll(() => matchesOf(lucas)).toHaveLength(0);
  expect(await votesOf(lucas, "lucas")).toEqual({});
  await expect(margarita.locator(".match-overlay")).toHaveCount(0);

  // Liking it again brings the match back for both.
  await lucas.keyboard.press("ArrowRight");
  await expect(lucas.locator(".match-sub")).toHaveText("Margarita already wanted to see this one");
  await expect(margarita.locator(".match-sub")).toHaveText("Lucas just liked it too!");
});

test("drag, arrow keys and undo move through the deck", async () => {
  await lucas.getByRole("button", { name: /Start swiping/ }).click();
  const first = await topTitle(lucas);

  // Drag the card to the left.
  const box = (await lucas.locator(".card.top").boundingBox())!;
  const y = box.y + box.height / 3;
  await lucas.mouse.move(box.x + box.width / 2, y);
  await lucas.mouse.down();
  for (let i = 1; i <= 12; i++) await lucas.mouse.move(box.x + box.width / 2 - i * 20, y + i);
  await lucas.mouse.up();
  await expectTop(lucas).not.toBe(first);
  await expect.poll(async () => Object.keys(await votesOf(lucas, "lucas")).length).toBe(1);
  const second = await topTitle(lucas);
  const votes = await votesOf(lucas, "lucas");
  expect(Object.values(votes).map((v) => v.vote)).toEqual(["nope"]);

  // Arrow right likes; Backspace undoes it.
  await lucas.keyboard.press("ArrowRight");
  await expectTop(lucas).not.toBe(second);
  await expect.poll(async () => Object.keys(await votesOf(lucas, "lucas")).length).toBe(2);
  await lucas.keyboard.press("Backspace");
  await expectTop(lucas).toBe(second);
  await expect.poll(async () => Object.keys(await votesOf(lucas, "lucas")).length).toBe(1);
  await lucas.keyboard.press("Backspace");
  await expectTop(lucas).toBe(first);
  await expect(lucas.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("a filter change on one phone updates the other", async () => {
  await lucas.getByRole("button", { name: /Start swiping/ }).click();
  const total = (await lucas.locator(".progress-text").textContent())!.match(/0 \/ (\d+) rated/)![1];
  await margarita.locator(".day-chip:not(.all)").last().click();
  await expect(lucas.locator(".progress-text")).not.toContainText(`/ ${total} rated`);
  await expect(lucas.locator(".toast", { hasText: "Margarita tweaked the filters" })).toBeVisible();
  await margarita.locator(".day-chip.all").click();
  await expect(lucas.locator(".progress-text")).toContainText(`0 / ${total} rated`);
});

// Real touch input (Chromium's touch emulation): scrolling a card must not swipe it.
test("scrolling a card vertically by touch doesn't swipe it; a horizontal touch swipe does", async () => {
  await lucas.getByRole("button", { name: /Start swiping/ }).click();
  const first = await topTitle(lucas);
  const cdp = await lucas.context().newCDPSession(lucas);
  const box = (await lucas.locator(".card.top").boundingBox())!;
  const touch = async (from: [number, number], to: [number, number]) => {
    const steps = 12;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from[0], y: from[1] }] });
    for (let i = 1; i <= steps; i++) {
      const x = from[0] + ((to[0] - from[0]) * i) / steps;
      const y = from[1] + ((to[1] - from[1]) * i) / steps;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const cx = box.x + box.width / 2;

  // Mostly vertical, with a little sideways drift like a real thumb.
  await touch([cx, box.y + box.height * 0.75], [cx + 30, box.y + box.height * 0.2]);
  await expect.poll(() => lucas.locator(".card.top .card-scroll").evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  await lucas.waitForTimeout(500);
  expect(await topTitle(lucas)).toBe(first);
  expect(await votesOf(lucas, "lucas")).toEqual({});

  // Back to the top, then a horizontal swipe to the right likes the film.
  await lucas.locator(".card.top .card-scroll").evaluate((el) => el.scrollTo(0, 0));
  await touch([cx - 100, box.y + box.height * 0.4], [cx + 250, box.y + box.height * 0.42]);
  await expectTop(lucas).not.toBe(first);
  await expect.poll(async () => Object.values(await votesOf(lucas, "lucas")).map((v) => v.vote)).toEqual(["like"]);
});

test("picking a screening in the schedule hides the film's other screenings on both phones", async () => {
  for (const p of [lucas, margarita]) await p.getByRole("button", { name: /Start swiping/ }).click();
  const film = await topTitle(lucas);
  await lucas.getByRole("button", { name: "Like" }).click();
  await margarita.getByRole("button", { name: "Like" }).click();
  for (const p of [lucas, margarita]) {
    await p.getByRole("button", { name: "Keep swiping" }).click();
    await p.locator(".tabbar button", { hasText: "Matches" }).click();
    await p.getByRole("button", { name: "Schedule" }).click();
  }
  const slots = (p: Page) => p.locator(".slot", { hasText: film });
  const total = await slots(lucas).count();
  test.skip(total < 2, `"${film}" has only ${total} upcoming screening; nothing to hide`);
  await expect(slots(margarita)).toHaveCount(total);
  await expect(lucas.getByRole("button", { name: "To decide · 1" })).toBeVisible();

  // Lucas picks the second screening: every other screening of the film disappears, live on both phones.
  const chosen = slots(lucas).nth(1);
  const time = await chosen.locator(".slot-time b").textContent();
  await chosen.getByRole("button", { name: /Pick this screening/ }).click();
  for (const p of [lucas, margarita]) {
    await expect(slots(p)).toHaveCount(1);
    await expect(slots(p).locator(".slot-time b")).toHaveText(time!);
    await expect(slots(p)).toHaveClass(/picked/);
    await expect(p.getByRole("button", { name: "Picked · 1" })).toBeVisible();
    await expect(p.getByRole("button", { name: "To decide · 0" })).toBeVisible();
  }
  await expect(slots(margarita).locator(".going")).toHaveText("Going · picked by Lucas");
  await expect(margarita.locator(".toast", { hasText: `Lucas picked ${film}` })).toBeVisible();
  expect(Object.keys((await (await lucas.request.get("/api/state")).json()).picks)).toHaveLength(1);

  // The pick survives a reload, and Margarita can undo it: all screenings come back.
  await margarita.reload();
  await margarita.locator(".tabbar button", { hasText: "Matches" }).click();
  await margarita.getByRole("button", { name: "Schedule" }).click();
  await expect(slots(margarita)).toHaveCount(1);
  await slots(margarita).getByRole("button", { name: /Unpick/ }).click();
  for (const p of [lucas, margarita]) await expect(slots(p)).toHaveCount(total);
});
