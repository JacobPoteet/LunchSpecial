// Where an arrival came from — the `utm_source` on the landing URL, normalised.
//
// Shared by both halves on purpose: the client reads the param and stashes it,
// the Worker re-normalises whatever the client sends. The Worker's pass is the
// authoritative one — this value is the only field on any beacon that originates
// in a URL the player controls, so it is never stored without being checked
// here, no matter what the client claims to have already done.
//
// Deliberately just `utm_source`. The other four utm_* params answer questions
// the ad platform's own dashboard already answers (which ad, which creative);
// what this game cannot otherwise know is whether a stranger arriving from
// somewhere came back the next day, and the source alone answers that. Adding a
// second param means a second column and a second thing to keep honest.

/**
 * The source recorded for an arrival that carried no usable `utm_source` — the
 * ordinary case of somebody typing the address or following a plain link.
 *
 * A sentinel rather than NULL, because NULL already means something else and
 * more important: *recorded before this shipped*. Conflating "arrived
 * untagged" with "we weren't measuring yet" would let a pre-launch day look
 * like a day of organic arrivals, which is the same mistake as reporting an
 * unmeasured visit count as zero.
 *
 * A literal `?utm_source=direct` is indistinguishable from an untagged arrival.
 * That is a fair trade for not needing a value outside the charset.
 */
export const SOURCE_DIRECT = "direct";

/** Longest source we'll store. Comfortably past every real ad-platform value. */
export const SOURCE_MAX_LENGTH = 32;

/**
 * Lowercase alphanumerics plus `_ . -`, starting on an alphanumeric.
 *
 * Narrow on purpose. This is the one player-supplied string that reaches a
 * table, and every real value (`reddit`, `facebook`, `newsletter`,
 * `product-hunt`) fits inside it — so anything that doesn't is a mangled URL or
 * someone poking at the endpoint, and is better dropped than stored.
 */
const SOURCE_PATTERN = /^[a-z0-9][a-z0-9_.-]*$/;

/**
 * Normalise a raw `utm_source` to what gets stored, or null if there isn't a
 * usable one.
 *
 * Case-folded so `Reddit` and `reddit` are one source rather than two slices of
 * the same traffic — ad platforms and hand-typed links disagree about case
 * constantly, and the dashboard should not.
 *
 * Null means "no usable tag", which the write path turns into
 * {@link SOURCE_DIRECT}. Rejecting rather than truncating an over-long or
 * malformed value is deliberate: a truncated source is a plausible-looking
 * label for traffic nobody can account for.
 */
export function normalizeSource(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const source = raw.trim().toLowerCase();
  if (source.length === 0 || source.length > SOURCE_MAX_LENGTH) return null;
  return SOURCE_PATTERN.test(source) ? source : null;
}
