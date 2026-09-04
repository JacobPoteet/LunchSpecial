// Automated accessibility pass over the player-facing game (GitHub #130).
//
// Every accessibility finding in this game so far was found by reading source
// by hand, and at least two of them, the two contrast failures, are exactly what
// a tool reports for free. Automated checks catch roughly a third of WCAG, so
// this closes one specific gap rather than the whole problem: it stops the
// mechanical regressions, and it costs nothing per run now that it exists.
//
// Four things are load-bearing:
//
// 1. **It plays.** A bare page load has no guess column, no attribute tiles and
//    no ingredient chips, so it misses every element the contrast and
//    colour-encoding issues were about — a scan of an empty board is a scan
//    that passes because there is nothing on it. Each state below is reached by
//    driving the real UI, which is also why this is Playwright rather than the
//    @axe-core/cli the issue first sketched: the CLI can load a URL and nothing
//    else.
// 2. **The round is pinned, so the run is deterministic.** ?special=<slug>
//    fixes the target (dev-only on the client, and this only ever runs against
//    the dev server), so "guess a dish that is not the answer" is a fact rather
//    than a 1-in-366 bet. The daily would drift with the schedule and the date.
// 3. **serious + critical only**, at least to begin with, so the check doesn't
//    go red on the day it lands over a moderate finding nobody has triaged.
//    Everything below that threshold is still printed, just not fatal.
// 4. **/admin is out of scope** — a password-gated single-user back office.
//    Nothing here logs in.
// 5. **The browser asks for reduced motion**, and that is not incidental. Axe
//    samples the pixels that are actually painted, so a card caught mid-entrance
//    reports the colour of a half-faded element — cherry at 60% opacity on
//    cream is a real 3.4:1 and a completely useless finding. The game disables
//    ~40 animations under prefers-reduced-motion already, so asking for it is
//    both the cheapest way to hold the page still and a free check that the
//    reduced-motion path renders what everyone else eventually sees.

import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright-core";

const BASE = process.env.A11Y_BASE_URL ?? "http://localhost:5173";
/** Fatal levels. Anything below is reported and doesn't fail the run. */
const FATAL = new Set(["serious", "critical"]);
/** The dish the board is pinned to, and one that is definitely not it. */
const TARGET_SLUG = "ramen";
const WRONG_GUESS = "Spaghetti Carbonara";

/** The same, for After Dark. `?barhours=off` is what makes it reachable at noon. */
const TARGET_DRINK = "negroni";
const WRONG_POUR = "Margarita";

const INPUT = 'input[aria-label="Guess a dish"]';
const BAR_INPUT = 'input[aria-label="Guess a drink"]';

/**
 * The scans, in the order a player meets them. Each returns after leaving the
 * page in the state it wants measured; the runner scans whatever is on screen.
 */
const SCANS = [
  {
    name: "how-to modal (first visit)",
    async setup(page) {
      // A fresh browser context has never seen the how-to, so the game opens it
      // for us — which is the state a first-time player actually lands in.
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[role="dialog"]');
    },
  },
  {
    name: "board, before a guess",
    async setup(page) {
      // Dismiss everything, not just the how-to. A live notice from the kitchen
      // queues up behind it, so closing exactly one dialog leaves a dialog on
      // screen and the wait below never resolves — which is a scan that fails
      // on any day somebody has posted a note, and passes in CI because CI's
      // database has none.
      await closeAllModals(page);
      await page.waitForSelector(INPUT);
    },
  },
  {
    name: "board, mid-round (tiles, chips, clue ticket)",
    async setup(page) {
      await page.goto(`${BASE}/?special=${TARGET_SLUG}`, { waitUntil: "domcontentloaded" });
      await guess(page, WRONG_GUESS);
      // The row lands optimistically; wait for the filled tiles and the ticket
      // the miss prints, or the scan races the thing it came to look at.
      await page.waitForSelector(".attr-tile--revealed");
      await page.waitForSelector(".ticket");
    },
  },
  {
    name: "the check (game over)",
    async setup(page) {
      // Guessing the pinned dish ends the round in one move. The check prints
      // on a delay, so wait for the dialog rather than for the guess.
      await guess(page, "Ramen");
      await page.waitForSelector(".modal--receipt");
    },
  },
  // After Dark runs the SAME components under a different palette, which is
  // exactly why it has to be scanned rather than assumed: the whole night theme
  // is a token swap, so every contrast pair in the game changes value at once
  // and the only cheap way to know they all still clear is to measure them on
  // the painted page.
  {
    name: "bar, mid-round (night palette, tiles, coaster)",
    async setup(page) {
      await page.goto(`${BASE}/?bar=1&barhours=off&nightcap=${TARGET_DRINK}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForSelector(BAR_INPUT);
      await pour(page, WRONG_POUR);
      await page.waitForSelector(".attr-tile--revealed");
      await page.waitForSelector(".ticket--coaster");
    },
  },
  {
    name: "the tab (night game over)",
    async setup(page) {
      await pour(page, "Negroni");
      await page.waitForSelector(".modal--receipt");
    },
  },
  {
    name: "the bar's closed sign",
    async setup(page) {
      // Without the dev override, and outside opening hours this is what a
      // player meets. It carries a live countdown and two colours of its own.
      await page.goto(`${BASE}/?bar=1`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".closed--bar");
    },
  },
  {
    name: "menu archive calendar",
    async setup(page) {
      // Back to the diner, and only reachable once a round is settled — which
      // it is, since the pinned round above finished it.
      await page.goto(`${BASE}/?special=${TARGET_SLUG}`, { waitUntil: "domcontentloaded" });
      await guess(page, "Ramen");
      await page.waitForSelector(".modal--receipt");
      await page.click(".modal__close");
      await page.waitForSelector(".modal--receipt", { state: "detached" });
      await page.click('button:has-text("Menu archive")');
      await page.waitForSelector(".archive-cal__day");
    },
  },
];

/**
 * Close every open modal, in order, until none is left.
 *
 * The game queues them deliberately (the how-to, then any unseen notices, then
 * an auto-opened check), so "close the dialog" is not a single action. Bounded
 * rather than a while(true): if a modal ever fails to close, a hung scan is a
 * worse failure than a loud one.
 */
async function closeAllModals(page) {
  for (let i = 0; i < 6; i++) {
    const open = await page.locator('[role="dialog"]').count();
    if (open === 0) return;
    await page.click(".modal__close");
    await page.waitForTimeout(400); // the exit animation, plus the next one's entrance
  }
  throw new Error("modals kept reopening — something is queueing them without end");
}

/** Type a dish name, take the first autocomplete option, submit. */
async function guess(page, name) {
  await page.fill(INPUT, name);
  await page.waitForSelector(".guess-input__option");
  await page.click(".guess-input__option >> nth=0");
}

/** The same at the bar. Different pool, same input. */
async function pour(page, name) {
  await page.fill(BAR_INPUT, name);
  await page.waitForSelector(".guess-input__option");
  await page.click(".guess-input__option >> nth=0");
}

function describe(violation) {
  const where = violation.nodes
    .slice(0, 4)
    .map((n) => `      ${n.target.join(" ")}\n        ${n.failureSummary?.split("\n").join("\n        ")}`)
    .join("\n");
  const more = violation.nodes.length > 4 ? `\n      …and ${violation.nodes.length - 4} more\n` : "";
  return `  [${violation.impact}] ${violation.id} — ${violation.help}\n    ${violation.helpUrl}\n${where}${more}`;
}

async function main() {
  const browser = await chromium.launch();
  // The game's main surface is a phone, and the narrow layout is where the
  // toolbar wraps and the tiles are tightest — so that's what gets measured.
  // An explicit context (rather than browser.newPage) is what axe needs to
  // inject itself into frames.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  const failures = [];
  let advisory = 0;

  try {
    for (const scan of SCANS) {
      await scan.setup(page);
      // Anything still moving after that is a JS-driven delay (the check waits
      // a beat before it prints), not a CSS animation.
      await page.waitForTimeout(150);
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const fatal = violations.filter((v) => FATAL.has(v.impact));
      const rest = violations.filter((v) => !FATAL.has(v.impact));
      advisory += rest.length;

      const mark = fatal.length === 0 ? "ok  " : "FAIL";
      console.log(`${mark} ${scan.name}${fatal.length ? ` — ${fatal.length} serious/critical` : ""}`);
      for (const v of fatal) {
        console.log(describe(v));
        failures.push(`${scan.name}: ${v.id}`);
      }
      // Printed, never fatal. A check that fails on everything gets muted, and
      // a muted check is worth less than no check.
      for (const v of rest) console.log(`  (advisory, ${v.impact}) ${v.id} — ${v.help}`);
    }
  } finally {
    await browser.close();
  }

  console.log("");
  if (failures.length > 0) {
    console.log(`${failures.length} serious/critical violation(s):`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log(`No serious or critical violations across ${SCANS.length} states.`);
  if (advisory > 0) console.log(`${advisory} advisory finding(s) above — worth a look, not a failure.`);
}

await main();
