// Which round the diner is serving, read off the URL — PURE.
//
// GamePage used to derive nine flags at the top of the component (isPreview,
// isShowcase, isArchive, isRandom, playtest, isDaily, ephemeral, tracked,
// dressedAsDaily) from `window.location` and `import.meta.env.DEV`, which was
// the one piece of the client with real logic and no test. The table in
// CLAUDE.md's "Round modes" section is what this fold encodes; the test beside
// it walks every row of that table and the precedence between them.
//
// Everything is taken as an argument. The page hands in the search string,
// the pathname, whether this is a dev build and today's ET day; nothing here
// reads a global.

import { EPOCH_DATE, type RoundKind } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** An earlier puzzle than today's: the archive-playable range. */
export function isPastPuzzleDate(date: string, today: string): boolean {
  return DATE_RE.test(date) && date >= EPOCH_DATE && date < today;
}

export interface ModeInput {
  /** `window.location.search`, with or without the leading `?`. */
  search: string;
  /** `window.location.pathname`. */
  pathname: string;
  /** `import.meta.env.DEV`: the two dev-only entrances only open here. */
  dev: boolean;
  /** Today's ET day (`localToday()`). */
  today: string;
}

export type ModeName = "daily" | "archive" | "random" | "preview" | "playtest" | "showcase";

export interface RoundMode {
  mode: ModeName;
  /** The date the round is keyed to: the archive date, or today. */
  date: string;
  /** The admin preview token, when this is a preview. */
  preview?: string;
  /** The pinned dish slug, when this is a playtest. */
  playtest?: string;
  isDaily: boolean;
  isArchive: boolean;
  isRandom: boolean;
  isPreview: boolean;
  isShowcase: boolean;
  /** Nothing is written to localStorage or lifetime stats. */
  ephemeral: boolean;
  /** Beacons, presence and the progress message fire. */
  tracked: boolean;
  /** Wears the daily's finish: puzzle number, countdown, share, stats panel. */
  dressedAsDaily: boolean;
  /** What the beacons call it. Untracked modes still name one for the presence copy. */
  analyticsKind: RoundKind;
}

/**
 * Precedence, highest first: preview → playtest → archive → random → showcase
 * → daily. A preview token beats everything because it was minted for one
 * dish; a playtest slug beats a date because `npm run ramen` pins a board
 * regardless of the day; an archive date beats `?random` because a dated URL
 * is a specific puzzle and a random one is none.
 *
 * A showcase link is the daily, seeded as won, with two differences the page
 * cares about (nothing written, nothing tracked). It is deliberately not folded
 * into preview: a preview is a *different* dish dressed as today's, a showcase
 * IS today's, and the puzzle number, the archive and the rollover watcher all
 * read that difference.
 */
export function resolveMode({ search, pathname, dev, today }: ModeInput): RoundMode {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const preview = params.get("preview") ?? undefined;
  const isPreview = preview !== undefined;
  const playtest = !isPreview && dev ? (params.get("special") ?? undefined) : undefined;
  const dateParam = params.get("date") ?? undefined;
  const isArchive = !isPreview && !playtest && !!dateParam && isPastPuzzleDate(dateParam, today);
  const isRandom =
    !isPreview &&
    !playtest &&
    !isArchive &&
    (params.has("random") || (dev && (pathname.startsWith("/play") || params.has("freeplay"))));
  // Read on its own rather than gated on the others: the page seeds the round
  // from the showcase before it asks which mode it is in, and the band, the
  // pill and the coach marks all read this flag directly.
  const isShowcase = params.has("s");
  const isDaily = !isPreview && !playtest && !isArchive && !isRandom;

  const mode: ModeName = isPreview
    ? "preview"
    : playtest
      ? "playtest"
      : isArchive
        ? "archive"
        : isRandom
          ? "random"
          : isShowcase
            ? "showcase"
            : "daily";

  return {
    mode,
    date: isArchive ? (dateParam as string) : today,
    ...(preview ? { preview } : {}),
    ...(playtest ? { playtest } : {}),
    isDaily,
    isArchive,
    isRandom,
    isPreview,
    isShowcase,
    ephemeral: isPreview || isRandom || !!playtest || isShowcase,
    tracked: !isPreview && !playtest && !isShowcase,
    dressedAsDaily: isDaily || isPreview || !!playtest,
    analyticsKind: isArchive ? "leftover" : isRandom ? "random" : "daily",
  };
}
