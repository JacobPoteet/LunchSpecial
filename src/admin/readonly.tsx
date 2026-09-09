import { createContext, useContext } from "react";

/**
 * Whether this back office is being *looked at* rather than run.
 *
 * A read-only session (worker/adminsession.ts) is what the public demo hands a
 * visitor, and the server is what enforces it: every non-GET in the admin
 * router is refused by method, in one middleware, whatever this context says.
 *
 * So this is presentation, not security. It exists because a demo whose buttons
 * all answer with an error banner is a worse demo than one whose buttons aren't
 * there — and because the few genuinely destructive controls (a dish delete, an
 * analytics wipe) should not be things a visitor discovers by pressing them.
 * The rest of the interface is left exactly as it is: the point of showing
 * somebody the back office is showing them the back office.
 */
export const ReadOnlyContext = createContext(false);

export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}

/**
 * What a surface the demo withholds looks like.
 *
 * A card rather than a disabled tab, and the tab stays clickable, because a
 * greyed-out control is a dead end that tells a visitor nothing. This dashboard
 * already refuses to show things and says why — `pending`, `untracked`, "too
 * early to tell", a rate that carries its own interval — so a withheld panel
 * that names what is behind it and why reads as part of that design instead of
 * as a redaction bolted onto it.
 *
 * Every one of these points somewhere the visitor CAN go, since half the reason
 * a surface is withheld is that its aggregate is on another tab.
 */
export function Withheld({
  title,
  what,
  why,
  instead,
}: {
  /** The panel's own heading, so the tab still looks like the tab. */
  title: string;
  /** What is behind it, in one line. */
  what: string;
  /** Why the demo does not show it. */
  why: string;
  /** Where the same ground is covered, or what is visible instead. */
  instead?: string;
}) {
  return (
    <section className="panel withheld">
      <h2 className="withheld__title">
        {title}
        <span className="withheld__tag">Not in the demo</span>
      </h2>
      <p className="withheld__what">{what}</p>
      <p className="withheld__why">{why}</p>
      {instead && <p className="withheld__instead">{instead}</p>}
    </section>
  );
}

/**
 * The copy for every withheld surface, in one place.
 *
 * Two reasons run through all of it, and they are different reasons. The
 * schedule and the bar's board name Specials nobody has played, which the game
 * itself refuses to serve (`isAllowedRequestDate`); publishing them from the
 * back office would undo that rule from the other end. Requests, notices and
 * experiment notes are words people wrote, which is nobody else's business.
 */
export const WITHHELD_COPY = {
  schedule: {
    title: "Schedule",
    what: "The specials board: one row per day, six weeks out, with the dish booked on each.",
    why: "It names Specials nobody has played yet. The game refuses to serve a future date for the same reason, and publishing the board here would undo that from the other end.",
    instead: "The Menu tab shows what the kitchen has actually served, and the Dishes list shows the catalogue it draws from.",
  },
  bar: {
    title: "Bar",
    what: "The drink catalogue and the nightly board behind After Dark.",
    why: "Same as the schedule, plus every drink's three coasters. One drink a night with no archive means a spoiler here cannot be replayed past.",
    instead: "The dashboard's After Dark tab reports on nights already poured.",
  },
  requests: {
    title: "Dish requests",
    what: "Dishes players suggested for the menu, in their own words.",
    why: "Anonymous, but written by somebody who was not expecting an audience.",
    instead: "The ★ fan badge in the Dishes list marks the ones that made it onto the menu.",
  },
  announcements: {
    title: "Announcements",
    what: "Notices written for players, with their windows and how many devices each reached.",
    why: "Unpublished copy, and the reach figures are per-device.",
  },
  activity: {
    title: "Activity",
    what: "The raw feed: one row per round, grouped into visits by device and ET day.",
    why: "Every row carries an anonymous device id, and following one device across a day is the whole point of the screen.",
    instead: "Everything it feeds is aggregated on Today, Players and Trends, which is where the interesting part lives anyway.",
  },
  experiments: {
    title: "Experiments",
    what: "Before-and-after comparisons on a named metric, with the verdict each one earned.",
    why: "The notes are written for an audience of one.",
    instead: "The folds behind it — pooled rates, Wilson intervals, \u201ctoo early to tell\u201d and how many more days it would take — are on show wherever a rate appears.",
  },
} as const;
