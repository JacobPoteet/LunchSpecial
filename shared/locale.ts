// Which language the game speaks — PURE.
//
// One fold decides it, the way shared/occasions.ts decides the costume. The
// inputs are read by the client (src/i18n/store.ts) and handed in; nothing here
// touches `navigator`, localStorage or Discord. First hit wins:
//
//   1. the player's own pick (`lunch-special:locale`, written by the picker),
//   2. Discord's language setting, inside the Activity,
//   3. the browser's `navigator.languages`, in the player's order,
//   4. English.
//
// A locale that hasn't had its native-speaker review is in the list and can be
// picked, but is never auto-detected: steps 2 and 3 skip it. A player who
// chose a draft asked for it; one who merely has a Spanish browser did not.
//
// `/admin` stays English and never asks.

export interface LocaleInfo<T extends string = string> {
  /** BCP 47 tag, as `<html lang>` and every `Intl` constructor take it. */
  tag: T;
  /** The language in its own words, as the picker prints it ("Español"). */
  name: string;
  /** Reviewed by a native speaker. Unreviewed locales are picker-only. */
  autoDetect: boolean;
}

/**
 * Every language the game ships, English first. A locale is one entry here and
 * one file in shared/i18n/locales/ named for its tag; catalog.test.ts holds the
 * two together.
 */
export const LOCALES = [
  { tag: "en", name: "English", autoDetect: true },
  // A draft: picker and ?locale=es only until a native speaker has read it.
  { tag: "es", name: "Español", autoDetect: false },
] as const satisfies readonly LocaleInfo[];

export type LocaleTag = (typeof LOCALES)[number]["tag"];

export const DEFAULT_LOCALE: LocaleTag = "en";

/**
 * Accented, padded English (shared/i18n/pseudo.ts), for finding leaked English
 * and overflow before a real translation exists. Only ever reached through
 * `?locale=pseudo`, never stored, never detected.
 */
export const PSEUDO_LOCALE = "pseudo";

/** What the page can be speaking: a shipped locale, or the pseudo-locale. */
export type Speaking = LocaleTag | typeof PSEUDO_LOCALE;

/** localStorage key the picker writes. */
export const LOCALE_KEY = "lunch-special:locale";

/**
 * The picker's record. `at` is when it was chosen (ms), so two copies of the
 * player's storage (Discord's saved copy and the phone's) can agree on the
 * newer pick rather than whichever arrived second.
 */
export interface PickedLocale {
  locale: string;
  at: number;
}

/** The stored pick, or null when there isn't a well-formed one. */
export function parsePicked(raw: string | null | undefined): PickedLocale | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { locale, at } = value as Record<string, unknown>;
    if (typeof locale !== "string" || typeof at !== "number" || !Number.isFinite(at)) return null;
    return { locale, at };
  } catch {
    return null;
  }
}

const primary = (tag: string) => tag.split("-")[0];
const normalize = (tag: string) => tag.trim().replace(/_/g, "-").toLowerCase();

/**
 * The shipped locale a language tag asks for, or null.
 *
 * The exact tag first (`pt-BR` → `pt-BR`), then the language alone
 * (`es-MX` → `es`, `pt-PT` → `pt-BR`), so a regional browser setting still
 * lands on the one variant we have.
 */
export function matchLocale<T extends string>(
  tag: string | null | undefined,
  locales: readonly LocaleInfo<T>[],
): T | null {
  if (!tag) return null;
  const want = normalize(tag);
  if (!want) return null;
  const exact = locales.find((l) => normalize(l.tag) === want);
  if (exact) return exact.tag;
  const lang = primary(want);
  return locales.find((l) => primary(normalize(l.tag)) === lang)?.tag ?? null;
}

export interface LocaleInputs {
  /** The picker's choice, already parsed. */
  picked: PickedLocale | null;
  /** Discord's language setting (`userSettingsGetLocale`), inside the Activity only. */
  discord: string | null;
  /** `navigator.languages`, in the player's order. */
  browser: readonly string[];
}

/**
 * The reviewed locale a setting nobody chose for this game asks for, or null:
 * a browser's language, Discord's, or a guild's (the Worker's progress
 * message). An unreviewed locale is never the answer.
 */
export function detectLocale<T extends string>(
  tag: string | null | undefined,
  locales: readonly LocaleInfo<T>[],
): T | null {
  return matchLocale(
    tag,
    locales.filter((l) => l.autoDetect),
  );
}

/** The language the page speaks. Always one of `locales`; the first is the fallback. */
export function resolveLocale<T extends string>(input: LocaleInputs, locales: readonly LocaleInfo<T>[]): T {
  const picked = matchLocale(input.picked?.locale, locales);
  if (picked) return picked;
  for (const tag of [input.discord, ...input.browser]) {
    const hit = detectLocale(tag, locales);
    if (hit) return hit;
  }
  return locales[0].tag;
}

/**
 * A client-sent language, as the Worker stores it: one of LOCALES' tags
 * exactly, or null (the pseudo-locale, a retired tag, anything malformed).
 */
export function shippedLocale(raw: unknown): LocaleTag | null {
  return LOCALES.find((l) => l.tag === raw)?.tag ?? null;
}

/**
 * `?locale=<tag>|pseudo` on this page load. Cosmetic and honoured in
 * production, like `?occasion=`: it dresses one page load and is never written
 * back as the player's pick. Any shipped locale is accepted, reviewed or not,
 * so a draft can be looked at (and scanned by `npm run a11y`) by link.
 */
export function localeOverride<T extends string>(
  search: string,
  locales: readonly LocaleInfo<T>[],
): T | typeof PSEUDO_LOCALE | null {
  const value = new URLSearchParams(search).get("locale");
  if (value === PSEUDO_LOCALE) return PSEUDO_LOCALE;
  return matchLocale(value, locales);
}

/**
 * What `<html lang>` and `Intl` are told. The pseudo-locale is English under
 * the accents, and `en-XA` is the tag pseudo-localisation conventionally uses.
 */
export function langAttribute(speaking: Speaking): string {
  return speaking === PSEUDO_LOCALE ? "en-XA" : speaking;
}

/** The tag `Intl` formatters take. Pseudo formats as English. */
export function intlLocale(speaking: Speaking): string {
  return speaking === PSEUDO_LOCALE ? DEFAULT_LOCALE : speaking;
}
