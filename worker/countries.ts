// Pure country-mix fold for the admin Trends tab (GitHub #92): where the game is
// actually being played, all time. DB-free so it stays unit-testable; the route
// in routes/admin.ts feeds it one grouped row per (country, player).
//
// What it measures is narrower than "traffic", and deliberately so. The country
// is stamped on the round's beacon (migrations/0018), which only fires from a
// browser that ran the game's JS — so a country busy in Cloudflare's request
// analytics and quiet here is traffic that never played a round. That gap is the
// question the metric exists to answer.
//
// Two folds happen here that SQL can't do in one pass:
//
// 1. **Devices are partitioned, not double-counted.** A device that played from
//    two countries (travel, VPN, a phone on a foreign carrier) appears in two
//    grouped rows. Summing distinct player ids per country would then total more
//    than the audience, and slices that add up to more than the whole can't be a
//    pie. Each device is assigned to the single country it played most from.
// 2. **Untracked rounds are held out.** Rows predating the country column carry
//    NULL, which is "not measured", not an unknown country — counting them as a
//    slice would invent a place, and dropping them silently would overstate every
//    real slice's share.

import type { CountryMix, CountryUsage } from "../shared/types";

/**
 * Cloudflare returns ISO 3166-1 alpha-2 plus two non-country answers — `T1`
 * (Tor exit node) and `XX` (couldn't be determined) — so the shape is two
 * uppercase alphanumerics, not two letters.
 */
const CODE = /^[A-Z0-9]{2}$/;

/** One grouped row: how many rounds this player started from this country. */
export interface CountryRow {
  /** ISO 3166-1 alpha-2 (or T1/XX); NULL on rounds recorded before migrations/0018. */
  country: string | null;
  /** Anonymous device id; NULL on rounds from clients that predate migrations/0008. */
  player_id: string | null;
  n: number;
}

/**
 * Normalise a stored code, or null if there isn't one. The write path already
 * validates, so this only guards against hand-edited or backfilled rows — but a
 * stray value would otherwise show up as its own slice of the pie.
 */
function codeOf(country: string | null): string | null {
  const code = country?.trim().toUpperCase();
  return code && CODE.test(code) ? code : null;
}

/**
 * Fold (country, player) rows into the all-time country mix.
 *
 * Rounds are exact — a round has one country. Players are attributed to the
 * country they started the most rounds from, ties broken by code so the result
 * is stable across query orderings rather than dependent on row order. A device
 * whose rounds all predate country tracking is in no country at all and simply
 * isn't counted; its rounds show up in `untracked`.
 *
 * Sorted by players, then rounds, then code: the pie is about how the audience
 * splits, and a country with one very busy device shouldn't outrank one with ten
 * casual players.
 */
export function foldCountries(rows: Iterable<CountryRow>): CountryMix {
  const roundsByCode = new Map<string, number>();
  const roundsByPlayer = new Map<string, Map<string, number>>();
  let untracked = 0;
  let rounds = 0;

  for (const r of rows) {
    const n = Number(r.n) || 0;
    const code = codeOf(r.country);
    if (!code) {
      untracked += n;
      continue;
    }
    rounds += n;
    roundsByCode.set(code, (roundsByCode.get(code) ?? 0) + n);
    if (!r.player_id) continue;
    let byCode = roundsByPlayer.get(r.player_id);
    if (!byCode) {
      byCode = new Map();
      roundsByPlayer.set(r.player_id, byCode);
    }
    byCode.set(code, (byCode.get(code) ?? 0) + n);
  }

  // One country per device — see the header note on why this can't be a SQL
  // COUNT(DISTINCT player_id) GROUP BY country.
  const playersByCode = new Map<string, number>();
  for (const byCode of roundsByPlayer.values()) {
    let home = "";
    let best = -1;
    for (const [code, n] of byCode) {
      if (n > best || (n === best && code < home)) {
        home = code;
        best = n;
      }
    }
    playersByCode.set(home, (playersByCode.get(home) ?? 0) + 1);
  }

  const entries: CountryUsage[] = [...roundsByCode.entries()]
    .map(([code, n]) => ({ code, players: playersByCode.get(code) ?? 0, rounds: n }))
    .sort((a, b) => b.players - a.players || b.rounds - a.rounds || a.code.localeCompare(b.code));

  return { entries, rounds, players: roundsByPlayer.size, untracked };
}
