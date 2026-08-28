import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTER,
  activityFacets,
  deriveRounds,
  filterActive,
  foldActivity,
  groupActivity,
  matchesFilter,
  type ActivityFilter,
  type ActivityRoundView,
} from "./activity";
import { DNF_GRACE_MINUTES, type ActivityDayTotal, type ActivityFeed, type ActivityRound, type ActivityVisit } from "./types";

const NOW = Date.parse("2026-08-28T18:00:00Z");
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

function round(over: Partial<ActivityRound> = {}): ActivityRound {
  const startedAt = over.startedAt ?? iso(10);
  return {
    roundId: "r1",
    puzzleNumber: 26,
    date: "2026-08-28",
    playedDay: "2026-08-28",
    kind: "daily",
    surface: "web",
    playerId: "dev-a",
    country: "US",
    dishId: 51,
    dishName: "Hamburger",
    startedAt,
    completed: false,
    completedAt: null,
    shared: false,
    sharedAt: null,
    guesses: null,
    solved: null,
    lastAt: startedAt,
    ...over,
  };
}

function visit(over: Partial<ActivityVisit> = {}): ActivityVisit {
  return {
    day: "2026-08-28",
    playerId: "dev-a",
    surface: "web",
    country: "US",
    source: "direct",
    firstSeenAt: iso(20),
    ...over,
  };
}

function totals(over: Partial<ActivityDayTotal> = {}): ActivityDayTotal {
  return { day: "2026-08-28", playerId: "dev-a", rounds: 1, solved: 0, shared: 0, ...over };
}

function feed(over: Partial<ActivityFeed> = {}): ActivityFeed {
  return {
    rounds: [],
    visits: [],
    dayTotals: [],
    since: null,
    hasMore: false,
    activeDays: [],
    today: "2026-08-28",
    ...over,
  };
}

describe("deriveRounds — the four states", () => {
  it("calls a finished, won round solved and a finished, lost one lost", () => {
    const [won, lost] = deriveRounds(
      [
        round({ completed: true, solved: true, guesses: 4 }),
        round({ roundId: "r2", completed: true, solved: false, guesses: 6 }),
      ],
      NOW,
    );
    expect(won.state).toBe("solved");
    expect(lost.state).toBe("lost");
  });

  it("splits an unfinished round on the same grace window the day slice uses", () => {
    const fresh = deriveRounds([round({ startedAt: iso(DNF_GRACE_MINUTES - 1) })], NOW)[0];
    const stale = deriveRounds([round({ startedAt: iso(DNF_GRACE_MINUTES + 1) })], NOW)[0];
    expect(fresh.state).toBe("in-progress");
    expect(stale.state).toBe("abandoned");
  });

  it("counts a round exactly at the grace boundary as still playing", () => {
    expect(deriveRounds([round({ startedAt: iso(DNF_GRACE_MINUTES) })], NOW)[0].state).toBe("in-progress");
  });

  it("is decided by the completed flag, never by age — an old finished round is not a walkout", () => {
    const old = round({ startedAt: iso(60 * 24 * 3), completed: true, solved: true, guesses: 3 });
    expect(deriveRounds([old], NOW)[0].state).toBe("solved");
  });
});

describe("deriveRounds — durations", () => {
  it("measures start → finish and finish → share", () => {
    const r = deriveRounds(
      [
        round({
          startedAt: iso(10),
          completed: true,
          solved: true,
          completedAt: iso(7),
          shared: true,
          sharedAt: iso(6),
        }),
      ],
      NOW,
    )[0];
    expect(r.solveMs).toBe(3 * 60_000);
    expect(r.shareMs).toBe(60_000);
  });

  it("reports no duration for a round that finished before per-event times existed", () => {
    // Pre-migrations/0011: the fact is recorded, the time is not. Never
    // back-filled from updated_at — a fabricated stamp is a fabricated duration.
    const r = deriveRounds([round({ completed: true, solved: true, completedAt: null })], NOW)[0];
    expect(r.state).toBe("solved");
    expect(r.solveMs).toBeNull();
  });

  it("drops a backwards duration rather than clamping it to zero", () => {
    const r = deriveRounds([round({ startedAt: iso(5), completed: true, solved: true, completedAt: iso(9) })], NOW)[0];
    expect(r.solveMs).toBeNull();
  });

  it("reports no share gap when the round finished unstamped", () => {
    const r = deriveRounds([round({ completed: true, completedAt: null, shared: true, sharedAt: iso(2) })], NOW)[0];
    expect(r.shareMs).toBeNull();
  });
});

describe("groupActivity", () => {
  it("puts one device's rounds for one ET day under one visit", () => {
    const rows = deriveRounds(
      [round({ roundId: "r1", lastAt: iso(9) }), round({ roundId: "r2", kind: "leftover", lastAt: iso(3) })],
      NOW,
    );
    const [g] = groupActivity(rows, [visit()], [totals({ rounds: 2 })]);
    expect(g.playerId).toBe("dev-a");
    expect(g.rounds.map((r) => r.roundId)).toEqual(["r2", "r1"]);
    expect(g.visit?.source).toBe("direct");
    expect(g.bounced).toBe(false);
  });

  it("separates the same device on two ET days — a visit is a device-day", () => {
    const rows = deriveRounds(
      [round({ roundId: "r1", playedDay: "2026-08-28" }), round({ roundId: "r2", playedDay: "2026-08-27" })],
      NOW,
    );
    expect(groupActivity(rows, [], []).length).toBe(2);
  });

  it("groups by the day it was played, not the puzzle's date", () => {
    // A Leftover replays July's puzzle in August. It belongs to August's visit.
    const rows = deriveRounds([round({ kind: "leftover", date: "2026-07-20", playedDay: "2026-08-28" })], NOW);
    expect(groupActivity(rows, [visit()], []).length).toBe(1);
  });

  it("keeps rounds with no device id out of everyone else's visit", () => {
    const rows = deriveRounds([round({ roundId: "r1" }), round({ roundId: "r2", playerId: null })], NOW);
    const groups = groupActivity(rows, [visit()], []);
    expect(groups.length).toBe(2);
    expect(groups.find((g) => g.playerId === null)?.rounds.map((r) => r.roundId)).toEqual(["r2"]);
  });

  it("marks an arrival that never played as a bounce", () => {
    const [g] = groupActivity([], [visit({ playerId: "dev-b" })], []);
    expect(g.bounced).toBe(true);
    expect(g.rounds).toEqual([]);
  });

  it("does not call it a bounce when the device played that day off this page", () => {
    const [g] = groupActivity([], [visit({ playerId: "dev-b" })], [totals({ playerId: "dev-b", rounds: 4 })]);
    expect(g.bounced).toBe(false);
    expect(g.totals?.rounds).toBe(4);
  });

  it("carries the day's real totals so the header can say 'of'", () => {
    const rows = deriveRounds([round()], NOW);
    const [g] = groupActivity(rows, [visit()], [totals({ rounds: 9, solved: 6, shared: 2 })]);
    expect(g.rounds.length).toBe(1);
    expect(g.totals).toEqual({ rounds: 9, solved: 6, shared: 2 });
  });

  it("leaves totals null when nothing was recorded for that device-day", () => {
    expect(groupActivity(deriveRounds([round()], NOW), [], [])[0].totals).toBeNull();
  });

  it("spans from the arrival to the last beacon, and collects the surfaces seen", () => {
    const rows = deriveRounds(
      [round({ roundId: "r1", startedAt: iso(12), lastAt: iso(11) }), round({ roundId: "r2", surface: "discord", startedAt: iso(4), lastAt: iso(2) })],
      NOW,
    );
    const [g] = groupActivity(rows, [visit({ firstSeenAt: iso(30) })], []);
    expect(g.firstAt).toBe(iso(30));
    expect(g.lastAt).toBe(iso(2));
    expect(g.surfaces.sort()).toEqual(["discord", "web"]);
  });

  it("sorts groups by their most recent activity", () => {
    const rows = deriveRounds(
      [
        round({ roundId: "old", playerId: "dev-a", lastAt: iso(50) }),
        round({ roundId: "new", playerId: "dev-b", lastAt: iso(1) }),
      ],
      NOW,
    );
    expect(groupActivity(rows, [], []).map((g) => g.playerId)).toEqual(["dev-b", "dev-a"]);
  });
});

describe("filters and facets", () => {
  const rows = (): ActivityRoundView[] =>
    deriveRounds(
      [
        round({ roundId: "a", completed: true, solved: true, completedAt: iso(8), kind: "daily" }),
        round({ roundId: "b", completed: true, solved: false, completedAt: iso(8), kind: "daily" }),
        round({ roundId: "c", kind: "leftover", startedAt: iso(1) }),
        round({
          roundId: "d",
          kind: "random",
          completed: true,
          solved: true,
          completedAt: iso(8),
          shared: true,
          sharedAt: iso(7),
        }),
      ],
      NOW,
    );

  it("treats an empty facet as 'all'", () => {
    expect(filterActive(EMPTY_FILTER)).toBe(false);
    expect(rows().filter((r) => matchesFilter(r, EMPTY_FILTER)).length).toBe(4);
  });

  it("ORs within a facet and ANDs across them", () => {
    const f: ActivityFilter = { states: ["solved", "lost"], kinds: ["daily"], sharedOnly: false };
    expect(
      rows()
        .filter((r) => matchesFilter(r, f))
        .map((r) => r.roundId),
    ).toEqual(["a", "b"]);
  });

  it("counts a facet's chips with that facet's own selection dropped", () => {
    // "What if I clicked this" — so picking `solved` must not zero out `lost`.
    const f: ActivityFilter = { states: ["solved"], kinds: [], sharedOnly: false };
    const facets = activityFacets(rows(), f);
    expect(facets.states.solved).toBe(2);
    expect(facets.states.lost).toBe(1);
    // Kinds, by contrast, are counted *within* the state selection.
    expect(facets.kinds.daily).toBe(1);
    expect(facets.kinds.leftover).toBe(0);
  });

  it("counts shares against the other facets", () => {
    expect(activityFacets(rows(), EMPTY_FILTER).shared).toBe(1);
    expect(activityFacets(rows(), { states: ["lost"], kinds: [], sharedOnly: false }).shared).toBe(0);
  });
});

describe("foldActivity", () => {
  it("sorts by last activity, so a late share climbs back to the top", () => {
    const older = round({ roundId: "shared-late", startedAt: iso(90), completed: true, solved: true, completedAt: iso(88), shared: true, sharedAt: iso(1), lastAt: iso(1) });
    const newer = round({ roundId: "just-started", startedAt: iso(5), lastAt: iso(5) });
    const view = foldActivity(feed({ rounds: [newer, older] }), NOW, EMPTY_FILTER);
    expect(view.rows.map((r) => r.roundId)).toEqual(["shared-late", "just-started"]);
  });

  it("keeps bounces when nothing is filtered, and drops them when something is", () => {
    const f = feed({
      rounds: [round({ roundId: "a", completed: true, solved: true, completedAt: iso(8) })],
      visits: [visit(), visit({ playerId: "bouncer", firstSeenAt: iso(4) })],
    });
    expect(foldActivity(f, NOW, EMPTY_FILTER).groups.some((g) => g.bounced)).toBe(true);
    const filtered = foldActivity(f, NOW, { states: ["solved"], kinds: [], sharedOnly: false });
    expect(filtered.groups.some((g) => g.bounced)).toBe(false);
  });

  it("reports the unfiltered page size as the 'of' in 'N of M in view'", () => {
    const f = feed({
      rounds: [
        round({ roundId: "a", completed: true, solved: true, completedAt: iso(8) }),
        round({ roundId: "b" }),
      ],
    });
    const view = foldActivity(f, NOW, { states: ["solved"], kinds: [], sharedOnly: false });
    expect(view.rows.length).toBe(1);
    expect(view.total).toBe(2);
  });

  it("counts the rounds no visit can claim", () => {
    const f = feed({ rounds: [round({ roundId: "a", playerId: null }), round({ roundId: "b" })] });
    expect(foldActivity(f, NOW, EMPTY_FILTER).unattributed).toBe(1);
  });
});
