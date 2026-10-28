// Which language the game was played in, all time — PURE (migrations/0064).
//
// The Players tab's languages fold. The same two rules as worker/countries.ts:
// a device that played in two languages lands in the one it played most (ties
// by tag, so the answer doesn't hang on row order), and a round with no
// language recorded is held out as `untracked`. NULL is every round before the
// column existed and every pseudo-locale round; it is never English.

import type { LocaleMix, LocaleUsage } from "../shared/types";

/** One grouped row: how many rounds this device started in this language. */
export interface LocaleRow {
  locale: string | null;
  player_id: string | null;
  n: number;
}

const TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

export function foldLocales(rows: Iterable<LocaleRow>): LocaleMix {
  const rounds = new Map<string, number>();
  const byPlayer = new Map<string, Map<string, number>>();
  let untracked = 0;

  for (const row of rows) {
    const n = Number(row.n) || 0;
    const tag = row.locale?.trim();
    if (!tag || !TAG.test(tag)) {
      untracked += n;
      continue;
    }
    rounds.set(tag, (rounds.get(tag) ?? 0) + n);
    if (row.player_id) {
      const mine = byPlayer.get(row.player_id) ?? new Map<string, number>();
      mine.set(tag, (mine.get(tag) ?? 0) + n);
      byPlayer.set(row.player_id, mine);
    }
  }

  const players = new Map<string, number>();
  for (const mine of byPlayer.values()) {
    const [home] = [...mine].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    players.set(home, (players.get(home) ?? 0) + 1);
  }

  const entries: LocaleUsage[] = [...rounds]
    .map(([locale, n]) => ({ locale, rounds: n, players: players.get(locale) ?? 0 }))
    .sort((a, b) => b.rounds - a.rounds || a.locale.localeCompare(b.locale));

  return {
    entries,
    rounds: entries.reduce((sum, e) => sum + e.rounds, 0),
    players: entries.reduce((sum, e) => sum + e.players, 0),
    untracked,
  };
}
