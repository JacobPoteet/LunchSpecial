// Which language the page speaks, and its catalog.
//
// The decision is shared/locale.ts (pure, tested). This module supplies its
// inputs and keeps the result where every component can read it, the same
// shape as src/occasions/store.ts:
//
// - **English is bundled.** Every other catalog is a lazy chunk, so an English
//   player downloads nothing extra. `primeLocale()` waits a short while for the
//   chunk before the mount; a slow one swaps in when it lands.
// - **`?locale=<tag>|pseudo`** overrides everything for this page load and is
//   never written back. See `localeOverride`.
// - **`<html lang>`** follows the catalog, never ahead of it: it drives the
//   screen reader's voice, so it must name the language actually on screen.
//
// `/admin` stays English and never primes.

import { useSyncExternalStore } from "react";
import {
  DEFAULT_LOCALE,
  intlLocale,
  langAttribute,
  LOCALE_KEY,
  LOCALES,
  localeOverride,
  parsePicked,
  PSEUDO_LOCALE,
  resolveLocale,
  type Speaking,
} from "../../shared/locale";
import en from "../../shared/i18n/locales/en";
import type { Messages } from "../../shared/i18n/messages";
import { pseudoize } from "../../shared/i18n/pseudo";

/** Every catalog but English, by file. A new locale is a new file; nothing here changes. */
const CHUNKS = import.meta.glob<Messages>(["../../shared/i18n/locales/*.ts", "!../../shared/i18n/locales/en.ts"], {
  import: "default",
});

function chunkFor(tag: string): (() => Promise<Messages>) | undefined {
  return CHUNKS[`../../shared/i18n/locales/${tag}.ts`];
}

export interface LocaleState {
  /** What the page is speaking. */
  speaking: Speaking;
  /** The tag `Intl` formatters take (pseudo formats as English). */
  intl: string;
  /** The catalog. */
  t: Messages;
}

let state: LocaleState = { speaking: DEFAULT_LOCALE, intl: DEFAULT_LOCALE, t: en };
const listeners = new Set<() => void>();
const loaded = new Map<string, Messages>();

function publish(speaking: Speaking, t: Messages): void {
  if (speaking === state.speaking && t === state.t) return;
  state = { speaking, intl: intlLocale(speaking), t };
  document.documentElement.lang = langAttribute(speaking);
  for (const fn of listeners) fn();
}

/** Switch to `speaking`, loading its catalog first. A chunk that won't load leaves the page as it was. */
function speak(speaking: Speaking): Promise<void> {
  if (speaking === DEFAULT_LOCALE) {
    publish(speaking, en);
    return Promise.resolve();
  }
  if (speaking === PSEUDO_LOCALE) {
    if (!loaded.has(PSEUDO_LOCALE)) loaded.set(PSEUDO_LOCALE, pseudoize(en));
    publish(speaking, loaded.get(PSEUDO_LOCALE)!);
    return Promise.resolve();
  }
  const cached = loaded.get(speaking);
  if (cached) {
    publish(speaking, cached);
    return Promise.resolve();
  }
  const chunk = chunkFor(speaking);
  if (!chunk) return Promise.resolve();
  return chunk().then(
    (t) => {
      loaded.set(speaking, t);
      publish(speaking, t);
    },
    () => {
      // English is a working game; a missing chunk is never worth an error.
    },
  );
}

function readPicked() {
  try {
    return parsePicked(localStorage.getItem(LOCALE_KEY));
  } catch {
    return null;
  }
}

/** The language this page load should speak, from the URL, the pick and the browser. */
function detect(): Speaking {
  const override = localeOverride(window.location.search, LOCALES);
  if (override) return override;
  return resolveLocale(
    { picked: readPicked(), discord: null, browser: typeof navigator === "undefined" ? [] : navigator.languages },
    LOCALES,
  );
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The language and its catalog. Re-renders when the catalog changes. */
export function useLocale(): LocaleState {
  return useSyncExternalStore(subscribe, () => state);
}

/** The catalog alone, for a component that only prints strings. */
export function useT(): Messages {
  return useLocale().t;
}

/**
 * Pick the language before React mounts, so the first frame already speaks it.
 * Waits for a lazy catalog a short while and no longer.
 */
export async function primeLocale(): Promise<void> {
  try {
    if (window.location.pathname.startsWith("/admin")) return;
    await Promise.race([speak(detect()), new Promise((resolve) => setTimeout(resolve, 800))]);
  } catch {
    // Never in the way of the mount.
  }
}
