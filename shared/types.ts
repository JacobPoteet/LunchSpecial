// Types shared between the Worker API and the React client.

export const COURSES = ["breakfast", "appetizer", "entree", "dessert", "drink"] as const;
export type Course = (typeof COURSES)[number];

export const TEMPERATURES = ["hot", "cold"] as const;
export type Temperature = (typeof TEMPERATURES)[number];

export const PROTEINS = ["beef", "pork", "poultry", "seafood", "lamb", "vegetarian"] as const;
export type Protein = (typeof PROTEINS)[number];

export const REGIONS = [
  "north-america",
  "latin-america",
  "europe",
  "middle-east",
  "africa",
  "south-asia",
  "east-asia",
  "southeast-asia",
  "oceania",
] as const;
export type Region = (typeof REGIONS)[number];

export type MatchLevel = "hit" | "near" | "miss";

/**
 * The kind of round, for analytics: the daily Special, a "leftover" (an archive
 * replay of a past puzzle), or a "chef's special" (a random recipe). Preview
 * (admin test play) is never tracked, so it isn't a kind here.
 */
export const ROUND_KINDS = ["daily", "leftover", "random"] as const;
export type RoundKind = (typeof ROUND_KINDS)[number];

/** Games started, split by round kind. The three always sum to `started`. */
export type StartedByKind = Record<RoundKind, number>;

/**
 * Where a round was played: the open web or the Discord Activity embed. Derived
 * client-side from Discord's `frame_id` iframe signal (see
 * src/discord/bootstrap.ts). The admin dashboard can slice engagement by surface.
 */
export const SURFACES = ["web", "discord"] as const;
export type Surface = (typeof SURFACES)[number];

export const MAX_GUESSES = 6;
/** Date of puzzle #1. */
export const EPOCH_DATE = "2026-07-17";

export interface DishSummary {
  id: number;
  name: string;
}

export interface Dish {
  id: number;
  name: string;
  slug: string;
  country: string;
  region: Region;
  course: Course;
  temperature: Temperature;
  protein: Protein;
  ingredients: string[];
  isActive: boolean;
  /**
   * Came from a player's "Suggest a dish" request rather than the kitchen's own
   * list. A credit only — it never affects scheduling, the fallback pick or
   * feedback. The check modal stamps it when the dish is the Special.
   */
  isFanSubmission: boolean;
}

export interface AttributeFeedback {
  /** Guessed dish's value + how it compares to the Special. near = same region, different country. */
  country: { value: string; match: MatchLevel };
  course: { value: Course; match: MatchLevel };
  temperature: { value: Temperature; match: MatchLevel };
  protein: { value: Protein; match: MatchLevel };
}

export interface GuessFeedback {
  correct: boolean;
  dish: DishSummary;
  /** Guess ingredients also found in the Special. */
  matchedIngredients: string[];
  /** Guess ingredients not in the Special. */
  unmatchedIngredients: string[];
  attributes: AttributeFeedback;
  /** Revealed after an incorrect guess (guesses 1–5). */
  clue?: { index: number; text: string };
}

export interface DailyInfo {
  date: string;
  puzzleNumber: number;
  maxGuesses: number;
  /** How many ingredients the Special has — printed on the menu as a hint. */
  ingredientCount: number;
}

export interface RevealInfo {
  id: number;
  name: string;
  country: string;
  region: Region;
  course: Course;
  temperature: Temperature;
  protein: Protein;
  ingredients: string[];
  clues: string[];
  /** Credited on the check as a player suggestion — see {@link Dish.isFanSubmission}. */
  isFanSubmission: boolean;
}

// ---- Admin API shapes ----

export interface AdminDishRow extends Dish {
  clueCount: number;
  lastServed: string | null;
  /** Meets scheduling requirements: >= 3 ingredients and exactly 5 clues. */
  schedulable: boolean;
}

export interface AdminDishDetail extends Dish {
  clues: string[];
}

export interface AdminDishInput {
  name: string;
  country: string;
  region: Region;
  course: Course;
  temperature: Temperature;
  protein: Protein;
  ingredients: string[];
  isActive: boolean;
  isFanSubmission: boolean;
  clues: string[];
}

export interface ScheduleEntry {
  date: string;
  dishId: number | null;
  dishName: string | null;
}

/** What a player submits when suggesting a dish for the menu. */
export interface DishRequestInput {
  /** The requested dish name (required). */
  name: string;
  /** Optional country of origin, free text. */
  country?: string;
  /** Optional free-text note from the player. */
  note?: string;
  /** Where it was submitted from (web / Discord), like analytics beacons. */
  surface: Surface;
  /** Optional anonymous per-device id (same value as the analytics player_id). */
  playerId?: string;
}

/** A player's dish suggestion, as shown in the admin review inbox. */
export interface DishRequest {
  id: number;
  name: string;
  country: string | null;
  note: string | null;
  surface: Surface;
  createdAt: string;
}

/** Field length caps for a dish request, shared by the client form + server. */
export const DISH_REQUEST_LIMITS = { name: 80, country: 60, note: 280 } as const;

// ---- Announcements (notices posted to players) ----

/**
 * Who a notice is eligible for. `returning` means a player who has finished at
 * least one game on this device — the client decides that from its own lifetime
 * stats, so a first-timer mid-first-round still counts as new.
 */
export const ANNOUNCEMENT_AUDIENCES = ["all", "returning"] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

/** Field length caps for an announcement, shared by the admin form + server. */
export const ANNOUNCEMENT_LIMITS = { header: 60, body: 600 } as const;

/**
 * What a player receives: the content, nothing else. The window and the audience
 * rule are the kitchen's business — the server has already applied them, so the
 * client never learns a notice exists that it isn't meant to see.
 */
export interface Announcement {
  id: number;
  header: string;
  /** Limited markdown — see shared/markdown.ts (bold, italic, links only). */
  body: string;
}

/**
 * Where a notice sits relative to the current ET day. `retired` is the manual
 * kill switch (is_active off) and outranks the dates — a notice pulled early
 * reads as retired even while its window is still open.
 */
export const ANNOUNCEMENT_STATUSES = ["active", "upcoming", "past", "retired"] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

/**
 * How many people a notice actually reached. Anonymous devices, not accounts:
 * one row per (announcement, player_id), so re-showing on a cleared browser
 * counts once.
 */
export interface AnnouncementReach {
  /** Distinct devices that have seen it. */
  players: number;
  /** Those devices split by where they saw it. */
  bySurface: Record<Surface, number>;
  /** Devices reached per ET day, oldest first — days with no views are omitted. */
  daily: { date: string; players: number }[];
}

/** A notice as the admin panel sees it: everything, plus status and reach. */
export interface AdminAnnouncement {
  id: number;
  header: string;
  body: string;
  audience: AnnouncementAudience;
  /** ET calendar day the window opens (inclusive). */
  startDate: string;
  /** ET calendar day the window closes (inclusive). */
  endDate: string;
  /** Manual kill switch; false = retired regardless of the dates. */
  isActive: boolean;
  status: AnnouncementStatus;
  createdAt: string;
  reach: AnnouncementReach;
}

/** What the admin form submits to create or update a notice. */
export interface AnnouncementInput {
  header: string;
  body: string;
  audience: AnnouncementAudience;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

/** What the client posts once a notice has actually been shown to a player. */
export interface AnnouncementSeenInput {
  id: number;
  /** Anonymous per-device id — the same one the round beacons carry. */
  playerId: string;
  surface: Surface;
}

/** One day of the board: the date and whatever is booked on it (null = fallback pick). */
export interface DashboardSpecial {
  date: string;
  dishId: number | null;
  dishName: string | null;
}

/** A running notice, trimmed to what the Overview tab needs to say it's live. */
export interface DashboardAnnouncement {
  id: number;
  header: string;
  audience: AnnouncementAudience;
  /** Last ET day it shows (inclusive). */
  endDate: string;
}

export interface AdminDashboard {
  today: DashboardSpecial;
  /** Tomorrow's booking — a null dishName means players would get the fallback pick. */
  tomorrow: DashboardSpecial;
  scheduledAhead: number;
  firstGap: string | null;
  /** Notices players are seeing right now, in the order the game queues them. */
  liveAnnouncements: DashboardAnnouncement[];
  /** Switched-on notices whose window hasn't opened yet. */
  upcomingAnnouncements: number;
  warnings: { kind: "missing-clues" | "few-ingredients"; dishId: number; dishName: string; detail: string }[];
}

export interface AnalyticsDay {
  /** ET calendar day the rounds were started on (YYYY-MM-DD). */
  date: string;
  started: number;
  /** `started` split by kind (daily + leftover + random === started). */
  startedByKind: StartedByKind;
  completed: number;
  solved: number;
  shared: number;
  /**
   * Distinct players whose first-ever play landed on this ET day, or **null when
   * the day predates player tracking** (see AnalyticsSummary.playerTrackingStart).
   * Null is "not measured", which is not the same claim as 0 — render it as a gap.
   */
  newPlayers: number | null;
  /** Distinct players active this ET day who had first played earlier; null as above. */
  returningPlayers: number | null;
}

/**
 * One ET day on the all-time growth series: the running total of games played
 * through the end of that day, every kind counted together, plus what that day
 * itself added.
 *
 * `cumulative` is the series that's plotted — it only ever goes up, so its
 * *shape* is the reading: steepening means the game is gaining, flattening means
 * it's stalling. `started` rides along because a point on a curve that only
 * rises can't tell you whether today was busy or dead.
 *
 * Unlike {@link AnalyticsDay}, days with no rounds are **present**. The beacon
 * has existed for every day this series covers, so a quiet day is a measured
 * flat step, not a gap — and dropping it would close up a dead week and let the
 * curve claim a steepness it never had.
 */
export interface GrowthDay {
  date: string;
  /** Games played on this ET day alone. */
  started: number;
  /** Games played from the first recorded round through the end of this day. */
  cumulative: number;
}

/**
 * The straight least-squares line through the **cumulative** curve — the
 * constant-pace reference the curve is read against (GitHub #90).
 *
 * A cumulative series always rises, so "is it going up" isn't the question;
 * whether it is *bending* is. Against a straight line at the average pace, a
 * curve pulling above it at the right is a game gaining, one sagging below is a
 * game stalling. That comparison is what `recentPerDay` states in numbers.
 *
 * `first`/`last` are *fitted* totals at the ends of the window, not real ones —
 * `first` in particular is routinely **negative** (a run that starts slow and
 * accelerates has its best-fit line crossing zero before day one). Anything
 * drawing it must clip rather than clamp, or it flattens the very slope it
 * exists to show.
 */
export interface GrowthTrend {
  /** Average games/day across the whole window — the fitted line's slope. */
  slope: number;
  /** Fitted running total on the first day of the window. Often negative; see above. */
  first: number;
  /** Fitted running total on the last day. */
  last: number;
  /** Days the fit covers — the same length as the series it was fitted to. */
  days: number;
  /** Games/day over the last {@link recentDays} — the pace "lately", against `slope`'s average. */
  recentPerDay: number;
  /** How many days `recentPerDay` averages over. */
  recentDays: number;
}

/**
 * The running total of games played per ET day since the first round ever
 * recorded, plus the constant-pace line through it (GitHub #90). All-time on
 * purpose: the 30-day `daily` series answers "what happened lately", this one
 * answers "is the game gaining or stagnating", and that question can't be asked
 * inside a window that keeps moving.
 */
export interface GameGrowth {
  /** Every ET day from the first recorded round through today, oldest first, no gaps. */
  days: GrowthDay[];
  /** Null until the window is long enough for a fit to mean anything. */
  trend: GrowthTrend | null;
}

/**
 * New vs returning player counts. A "player" is an anonymous device (a random id
 * kept in localStorage). For a day slice: `new` = devices whose first-ever play
 * was that day, `returning` = devices active that day that first played earlier.
 * For the all-time slice: `new` = total distinct players ever, `returning` = those
 * who have come back on at least one later day.
 */
export interface PlayerSplit {
  new: number;
  returning: number;
}

/**
 * One rung of the repeat-visit ladder: of the players who have made `visits`
 * visits, how many made another? A "visit" is an ET day the device played on,
 * not a round — see worker/players.ts, where all of this is folded.
 *
 * The four counts do not all sum to the same thing on purpose. `atRisk` is the
 * denominator (players whose `visits`-th visit is old enough to have been
 * answered); `returned` + `lateReturned` ≤ `atRisk`, and the remainder is the
 * players who haven't come back at all. `pending` sits **outside** `atRisk`
 * entirely — those players are still inside the return window, so counting them
 * either way would be a guess.
 */
export interface RetentionStep {
  /** Visits already made. This step asks who went on to make visit `visits + 1`. */
  visits: number;
  /** Players with at least `visits` visits whose window has closed — the denominator. */
  atRisk: number;
  /** Of `atRisk`, those who came back within the window. */
  returned: number;
  /** Of `atRisk`, those who came back but only after the window had closed. */
  lateReturned: number;
  /** Players at this many visits still inside their window — not yet counted either way. */
  pending: number;
}

/**
 * The repeat-visit curve, oldest rung first (`visits: 1` = first-timers). Null
 * when player tracking has never recorded anything, the same "unmeasured, not
 * zero" rule {@link PlayerSplit} follows.
 */
export interface PlayerRetention {
  /** Days a player gets to come back before the visit counts as their last. */
  windowDays: number;
  steps: RetentionStep[];
}

/**
 * One country in the all-time player mix (GitHub #92). `code` is ISO 3166-1
 * alpha-2 as Cloudflare's edge resolved it, plus the two non-country answers it
 * can give: `T1` (Tor exit node) and `XX` (couldn't be determined).
 */
export interface CountryUsage {
  code: string;
  /**
   * Anonymous devices attributed here. A device that played from more than one
   * country lands in exactly one — the one it played most from — so the counts
   * partition the audience and can be drawn as slices of a whole.
   */
  players: number;
  /** Rounds started from here. Exact, unlike `players`: a round has one country. */
  rounds: number;
}

/**
 * Where the game is actually being played, all time — the Trends tab's country
 * pie.
 *
 * It measures **rounds started**, not requests: the beacon only fires from a
 * browser that ran the game's JS, so a country busy in Cloudflare's request
 * analytics but quiet here is traffic that never played. That gap is the point
 * of the metric, not a shortfall in it.
 */
export interface CountryMix {
  /** Every country that started a round, most players first. */
  entries: CountryUsage[];
  /** Rounds counted across `entries` — the denominator for round shares. */
  rounds: number;
  /** Devices counted across `entries`. Each lands in exactly one country. */
  players: number;
  /**
   * Rounds carrying no country: everything recorded before migrations/0018, plus
   * any the edge couldn't resolve. Reported beside the pie rather than folded
   * into a slice — "not measured" is not a place.
   */
  untracked: number;
}

/**
 * One arrival source in the all-time mix (migrations/0024) — a `utm_source` off
 * the landing URL, or `direct` for an arrival that carried no tag.
 *
 * Every count here is **devices, not visits**: a source is credited with the
 * people it brought, once each, on the day it brought them.
 */
export interface SourceUsage {
  /** Normalised `utm_source`, or `direct`. See shared/attribution.ts. */
  source: string;
  /** Devices whose earliest recorded visit carried this source. */
  arrivals: number;
  /**
   * Of those, how many have had a full return window to come back in. The
   * denominator for the return rate — `arrivals` is not, because a device that
   * arrived this morning cannot yet have returned.
   */
  atRisk: number;
  /** Devices that came back within the window. The numerator. */
  returned: number;
  /** Came back, but after the window closed. Reported, never silently discarded. */
  lateReturned: number;
  /** Arrived too recently to judge. Held out of `atRisk` rather than scored as gone. */
  pending: number;
  /** ET day this source first brought anyone, and most recently did. */
  firstDay: string;
  lastDay: string;
}

/**
 * Where the audience came from, all time — the Players tab's arrival table.
 *
 * The question it exists for is not "how many clicks did the ad get" (the ad
 * platform says that, and says it better) but "did the people it sent come
 * back", which nothing outside this app can answer.
 */
export interface SourceMix {
  /** Every source that brought someone, most arrivals first. */
  entries: SourceUsage[];
  /** Devices with any recorded visit — the denominator for a source's share. */
  devices: number;
  /**
   * Devices whose earliest visit predates migrations/0024, so there is no
   * knowing how they arrived. Reported beside the table, never folded into
   * `direct` — "not measured" and "arrived untagged" are different facts, and
   * merging them would claim the game's whole history as organic traffic.
   */
  untracked: number;
  /** Days a device is given to come back before it counts as gone. */
  windowDays: number;
}

/**
 * How one dish actually played, folded from the rounds that were played on it.
 *
 * The catalogue half of the dashboard (menu mix) says what the kitchen served;
 * this says how it went. `dish_id` has been stamped on every round since
 * migrations/0012 and until now nothing read it, so the two halves had no way to
 * meet — you could see that the menu was Europe-heavy and separately that the win
 * rate dipped, and never that they were the same fact.
 */
export interface DishReportRow {
  dishId: number;
  name: string;
  country: string;
  region: Region;
  course: Course;
  protein: Protein;
  /** Rounds started on this dish, every kind. */
  started: number;
  /** Of those, the ones that reached game over. */
  completed: number;
  /** Of `completed`, the ones won. */
  solved: number;
  /** Of `completed`, the ones that ran out of guesses. */
  fails: number;
  /** Rounds whose result was shared. */
  shared: number;
  /** `started` split by mode, so a dish carried by replays can't pose as a hit Special. */
  byKind: StartedByKind;
  /** dist[i] = rounds solved in i+1 guesses. Length {@link MAX_GUESSES}. */
  guessDistribution: number[];
  /** Times this dish has been the scheduled Special, EPOCH through today. */
  timesServed: number;
  /** The most recent date it was the Special, or null if it never has been. */
  lastServed: string | null;
}

/**
 * Every dish players have actually played, hardest first — the Menu tab's
 * performance half.
 *
 * Counts **all three kinds**, not just the daily. A leftover or a Chef's Choice
 * is still a genuine first attempt at that dish for that device (the archive
 * shows a finished day's result rather than replaying it), and at this game's
 * volume folding them in is the difference between a dish having 30 attempts and
 * having 9. `byKind` rides along so a dish whose numbers are mostly replays is
 * visible as such.
 */
export interface DishReport {
  rows: DishReportRow[];
  /**
   * Rounds carrying no dish: everything recorded before migrations/0012, plus any
   * the beacon couldn't resolve. Reported rather than distributed — the same
   * "unmeasured is not a place" rule the country pie follows.
   */
  untracked: number;
  /** Rounds counted across `rows`. */
  rounds: number;
}

/**
 * How long a round takes, as a distribution rather than a mean.
 *
 * Derived from `completed_at - started_at`, which has been recorded since
 * migrations/0011 and never read. It's the difficulty signal guess count can't
 * give: solving in four guesses after twenty seconds and after six minutes are
 * different puzzles, and only one of them is a player thinking.
 *
 * Median and p90, never a mean — a round left open in a background tab and
 * finished after lunch is a real row, and one of those drags an average by
 * minutes.
 */
export interface SolveTimes {
  /** Rounds this was measured over (solved, with both timestamps). */
  count: number;
  /** Median minutes to solve, or null when nothing qualifies. */
  medianMinutes: number | null;
  /** 90th-percentile minutes — the slow tail, not the outlier. */
  p90Minutes: number | null;
}

/**
 * The longest a single round is allowed to contribute to total play time.
 *
 * A round is a browser tab. `completed_at - started_at` measures how long the tab
 * was open, not how long anyone was thinking about the dish, and the tail of that
 * distribution is people who wandered off mid-round and came back — the longest
 * round in prod is nearly two hours. Nobody spent two hours on a six-guess game,
 * so a round is counted at whatever it measured or fifteen minutes, whichever is
 * less. The cap only ever *reduces* the number, which is the direction a total
 * assembled from browser tabs should be wrong in.
 */
export const PLAYTIME_CAP_MINUTES = 15;

/**
 * How much time the game has taken up, all time — the one figure that answers
 * "how much of people's day is this" rather than "how many people".
 *
 * A sum, unlike {@link SolveTimes}, and therefore only defensible with the cap:
 * an average survives one four-hour tab because it divides it away, a total
 * doesn't. `capped` travels with it so the trim is stated rather than hidden.
 */
export interface PlayTime {
  /** Total minutes played, every round clamped to {@link PLAYTIME_CAP_MINUTES}. */
  minutes: number;
  /** Rounds counted — finished, with both timestamps. */
  rounds: number;
  /** How many of those ran past the cap and were counted at it. */
  capped: number;
}

/**
 * Devices that opened a playable board, and what became of them — the top of the
 * funnel (migrations/0020).
 *
 * "Started" means the first submitted guess, so before the visit beacon existed
 * the widest number on the dashboard was games started and there was nothing
 * above it. A change that doubled interest while halving conversion looked
 * exactly like no change at all.
 *
 * `visited` is **null for any day before the beacon shipped** — those days
 * recorded rounds but nobody was counting arrivals, and reporting them as 0 would
 * claim a 100% bounce rate for the whole of the game's history.
 */
export interface VisitCounts {
  /** Distinct devices that opened a board, or null when it wasn't measured. */
  visited: number | null;
  /** The ET day the visit beacon first recorded anything, or null if never. */
  since: string | null;
}

/**
 * What the funnel's last stage measures. Sharing is the end of the loop
 * *outward* (the game reaching someone else); playing again is the end of it
 * *inward* (the game holding the person it already has). They're different
 * retention questions and the panel switches between them rather than picking.
 */
export const FUNNEL_ENDINGS = ["shared", "playedAgain"] as const;
export type FunnelEnding = (typeof FUNNEL_ENDINGS)[number];

/**
 * Devices that started a game and never reached game over, split the same way
 * {@link OpenRounds} splits rounds — but counted in **people**, because that's
 * the funnel's unit throughout. A device is "still playing" when its most recent
 * start is inside {@link DNF_GRACE_MINUTES}; older than that and it left.
 */
export interface OpenPlayers {
  inProgress: number;
  abandoned: number;
}

/**
 * One player funnel: how many **devices** reached each stage of a single day.
 *
 * Every stage counts devices, not rounds, and that is the whole reason this can
 * be drawn as a funnel at all. A visit is one device per ET day while a "start"
 * is a round, so a player who does the Special and three Leftovers is one
 * arrival and four starts — stacking those as stages would report a 400% play
 * rate and a shape that grows as it descends. Counted in devices each stage is a
 * genuine subset of the one above it, so the width of a bar means what a funnel's
 * width is supposed to mean.
 *
 * The two endings are both computed server-side, so switching between them costs
 * no request — the same reason the Experiments tab ships raw series and windows
 * them on the client.
 */
export interface FunnelCounts {
  /** Devices that opened a board. Null before the visit beacon (migrations/0020). */
  visited: number | null;
  /** Devices that submitted a first guess — i.e. started at least one round. */
  played: number;
  /** Devices that reached game over on at least one round. */
  finished: number;
  /** Devices that shared a result. */
  shared: number;
  /**
   * Devices that started another round *after* finishing one, the same ET day.
   * Strictly ordered against the earlier round's completion, so "opened four
   * tabs at once" isn't counted as coming back for seconds.
   */
  playedAgain: number;
  /** Of the devices that played and never finished, who's still at the table. */
  open: OpenPlayers;
}

/** A funnel pooled over several days, with how many it covers. */
export interface FunnelWindow extends FunnelCounts {
  /** ET days pooled — device-days, so one device on three days counts three times. */
  days: number;
  /** Earliest ET day pooled, or null when nothing is. */
  since: string | null;
}

/**
 * The player funnel at two scopes: the selected day, and every day since the
 * visit beacon switched on.
 *
 * Both are offered because at this game's volume one day is tens of people —
 * enough to spot a catastrophe, not enough to tune anything. The pooled window
 * is deliberately clipped to days where arrivals were actually measured; pooling
 * in earlier days would keep their plays while dropping their (unmeasured)
 * visitors, which would flatter the top of the funnel exactly as much as it
 * understated the bounce.
 */
export interface PlayerFunnel {
  day: FunnelCounts;
  allTime: FunnelWindow;
}

/**
 * Rounds that started and never reported finishing, split by whether they still
 * could.
 *
 * `FinishRate` used to report the whole gap as "DNF" and clamp it at zero,
 * because start and complete are independent beacons. But a round begun four
 * minutes ago and one begun on Tuesday are not the same event, and on a live day
 * the first is most of the gap. Splitting them is the difference between "nine
 * people walked out" and "nine people are eating".
 */
export interface OpenRounds {
  /** Started recently enough to plausibly still be playing. */
  inProgress: number;
  /** Started long enough ago (see DNF_GRACE_MINUTES) that they aren't coming back. */
  abandoned: number;
}

/**
 * How long a round can stay open before the dashboard stops calling it "still
 * playing". Two hours: comfortably longer than any real game (the median is
 * minutes), short enough that a day's abandonment is legible before the day ends.
 */
export const DNF_GRACE_MINUTES = 120;

/**
 * One day of the week in the play rhythm. `perDay` — not `started` — is what the
 * chart draws: a run that began on a Friday has had more Fridays in it than
 * Thursdays, and at a few weeks of history that head start alone can invent a
 * "big day" that doesn't exist.
 */
export interface WeekdayPlay {
  /** 0 = Sunday, matching Date#getUTCDay. */
  weekday: number;
  /** Rounds started on this weekday, all time. */
  started: number;
  /**
   * How many times this weekday has come around since the first recorded round.
   * Counted over the calendar, not over active days — once the beacon is live a
   * quiet Monday is a measured zero, and dropping it would flatter every weekday
   * that happened to be busy.
   */
  days: number;
  /** `started / days` — the average this weekday actually runs at. */
  perDay: number;
}

/**
 * When people play, all time: the weekly cycle and the daily one, and the
 * interaction between them.
 *
 * Replaces the flat 24-hour bar chart, which — beside the 30-day spark — was one
 * of two one-dimensional shadows of this same two-dimensional thing. For a game
 * that resets at midnight ET, the weekly cycle is the dominant seasonality; the
 * growth curve exists partly to average it out, and this is where it gets looked
 * at instead.
 */
export interface PlayRhythm {
  /** `heat[weekday][hour]` = rounds started, raw counts. 7 × 24, ET throughout. */
  heat: number[][];
  /** Column marginal: rounds started per ET hour of day, index 0..23. */
  byHour: number[];
  /** Row marginal, as per-occurrence averages — see {@link WeekdayPlay}. */
  byWeekday: WeekdayPlay[];
  /** Calendar days covered, first recorded round through today. */
  days: number;
  /** Rounds counted across the whole grid. */
  started: number;
  /** The ET day of the first recorded round, or null if nothing has been recorded. */
  since: string | null;
}

// ---- Experiments (did the thing I shipped do anything?) ----

/**
 * The per-day metrics an experiment can be pointed at, in display order.
 *
 * Two families, and the split matters because they're compared with different
 * statistics (see shared/experiment.ts): **counts** are a quantity per day, whose
 * noise is day-to-day variance; **rates** are a proportion of a denominator,
 * whose noise is binomial. Treating a rate as a count would judge it by how much
 * traffic wobbled instead of by how many people it was measured on.
 */
export const EXPERIMENT_METRICS = [
  "visitors",
  "started",
  "playRate",
  "players",
  "newPlayers",
  "finishRate",
  "winRate",
  "shareRate",
] as const;
export type ExperimentMetric = (typeof EXPERIMENT_METRICS)[number];

/** Which metrics are proportions of a denominator rather than a daily quantity. */
export const RATE_METRICS: readonly ExperimentMetric[] = ["playRate", "finishRate", "winRate", "shareRate"];

export const EXPERIMENT_LIMITS = { label: 80, hypothesis: 500 } as const;

/** A deliberate change, with what it was supposed to do. */
export interface Experiment {
  id: number;
  label: string;
  hypothesis: string;
  metric: ExperimentMetric;
  /** ET day it went live. The day itself counts as "after". */
  shippedOn: string;
  createdAt: string;
}

/** What the admin form submits to create or update one. */
export interface ExperimentInput {
  label: string;
  hypothesis: string;
  metric: ExperimentMetric;
  shippedOn: string;
}

/**
 * One ET day of every raw number an experiment comparison might need.
 *
 * Deliberately raw counts, never pre-computed rates: a rate has to be pooled
 * across a whole period (total solved / total completed), and averaging daily
 * percentages instead would weight a 1-of-1 day the same as a 40-of-60 one.
 *
 * Zero-filled across the whole span like {@link GrowthDay}, for the same reason —
 * a quiet day inside a comparison window is a real zero and dropping it would
 * shorten the window without saying so.
 */
export interface ExperimentDay {
  date: string;
  started: number;
  completed: number;
  solved: number;
  shared: number;
  /** Distinct devices active that ET day, or null before player tracking existed. */
  players: number | null;
  /** Devices whose first-ever play was that day, or null as above. */
  newPlayers: number | null;
  /**
   * Devices that opened a board that day — the funnel's top, and the denominator
   * of `playRate`. Null before the visit beacon shipped (migrations/0020), which
   * is why an experiment from before then simply can't be read on those metrics
   * rather than being read as a catastrophe.
   */
  visitors: number | null;
}

/** Everything the Experiments tab needs, in one response. */
export interface ExperimentReport {
  experiments: Experiment[];
  /** All-time daily series, oldest first, no gaps — windowed client-side. */
  series: ExperimentDay[];
}

/** Public engagement totals for the README badges. Aggregate-only, no guess content. */
export interface PublicStats {
  /** Rounds started. */
  rounds: number;
  /** Rounds that reached game over (win or loss). */
  completed: number;
  /** Rounds solved. */
  solved: number;
  /** Rounds whose result was shared. */
  shared: number;
  /** Dishes in the catalogue. */
  dishes: number;
  /** Mean guesses over solved rounds (0 when nothing has been solved yet). */
  avgGuesses: number;
}

/**
 * One consolidated, aggregate-only payload for the public project-breakdown page
 * (GitHub Pages). Everything the page's live charts need in a single response, so
 * the page makes one cross-origin fetch. Served edge-cached from
 * `GET /api/stats/breakdown` — no per-player or guess content, same trust model
 * as {@link PublicStats}.
 */
export interface PublicBreakdown {
  /** The four headline totals + catalogue size + mean guesses. */
  headline: PublicStats;
  /** Distinct anonymous devices all-time (rows predating the player id are excluded). */
  devices: number;
  /** dist[i] = rounds solved in i+1 guesses (length {@link MAX_GUESSES}). */
  guessDistribution: number[];
  /** Completed rounds that ran out of guesses (completed and not solved). */
  fails: number;
  /** Rounds started and completed, split by mode — drives the "rounds by mode" chart. */
  modes: Record<RoundKind, { started: number; completed: number }>;
  /** Rounds and distinct devices per surface — drives the surface table. */
  surfaces: Record<Surface, { rounds: number; devices: number }>;
  /**
   * The device-based player funnel, pooled over every ET day arrivals have been
   * measured on. Null before the visit beacon (migrations/0020) recorded
   * anything — an unmeasured top of the funnel is reported as absent rather than
   * as a zero, exactly as the admin dashboard does, because "nobody arrived" and
   * "nobody counted" render identically and mean opposite things.
   */
  funnel: PublicFunnel | null;
  /**
   * `daysPlayed[i]` = devices that have played on **at least** i+1 distinct ET
   * days, so index 0 is every tracked device and the curve only falls.
   *
   * Deliberately a survival curve and not the dashboard's retention *rate*:
   * that one censors players whose window hasn't closed yet, which is the right
   * answer to "did they come back" and needs an explanation beside it. This
   * answers the smaller question "how many days does a device play", which needs
   * none and can't be misread as a rate.
   */
  daysPlayed: number[];
  /** Running total of rounds per ET day + the constant-pace reference line. */
  growth: GameGrowth;
  /**
   * Where the audience is, all time: one country per device, most players first.
   *
   * The same {@link CountryMix} the admin dashboard's pie reads, from the same
   * `foldCountries`, so the public map and the private pie cannot drift into
   * disagreeing about how many countries have played. Aggregate-only, like every
   * other field here: a country code and two counts, never a round, a device id
   * or anything that could be tied back to a person.
   */
  countries: CountryMix;
}

/**
 * The public funnel: the admin's pooled {@link FunnelWindow} minus the in-progress
 * / abandoned split, which is a live-service read for whoever is on shift and
 * means nothing on a page someone opens three weeks later.
 */
export type PublicFunnel = Omit<FunnelWindow, "open">;

// ---- Menu mix (what has actually been on the menu) ----

/** The three menu slices the mix panel can chart, in display order. */
export const MENU_SLICES = ["served", "upcoming", "pool"] as const;
export type MenuSliceKey = (typeof MENU_SLICES)[number];

/** The dish attributes the mix panel breaks down, in display order. */
export const MENU_MIX_KEYS = ["region", "course", "protein", "temperature"] as const;
export type MenuMixKey = (typeof MENU_MIX_KEYS)[number];

/**
 * One slice of the menu, counted by dish attribute. Every enum member is present
 * (zeros included) so the charts keep a stable order and never grow a row when
 * an obscure category finally shows up.
 */
export interface MenuMixSlice {
  /**
   * Servings counted: scheduled days for `served`/`upcoming`, dishes for `pool`.
   * The per-attribute counts sum to this unless a dish carries a value outside
   * the enum (only possible for `region`, which has no DB CHECK).
   */
  servings: number;
  /** Distinct dishes behind those servings. */
  dishes: number;
  region: Record<Region, number>;
  course: Record<Course, number>;
  protein: Record<Protein, number>;
  temperature: Record<Temperature, number>;
}

/** One Special that was (or will be) served, for the cadence strip. */
export interface MenuServing {
  date: string;
  dishId: number;
  name: string;
  country: string;
  region: Region;
  course: Course;
  protein: Protein;
  temperature: Temperature;
}

/**
 * What the kitchen has actually been serving — the admin dashboard's menu-mix
 * panel. Pure catalogue/schedule data (no player analytics): the ratios of
 * regions, courses, proteins and temperatures across past Specials, the booked
 * days ahead, and the active pool they're drawn from as a baseline.
 */
export interface MenuMix {
  /** Specials already served — schedule rows from EPOCH_DATE through today. */
  served: MenuMixSlice;
  /** Specials booked for future dates. */
  upcoming: MenuMixSlice;
  /** The active dish pool — everything that *could* be served. */
  pool: MenuMixSlice;
  /** Countries served, most-served first. */
  countries: { country: string; region: Region; servings: number; lastServed: string }[];
  /** Most common ingredients across served Specials, most-common first (capped). */
  ingredients: { name: string; servings: number }[];
  /** Dishes served more than once, most-served first. */
  repeats: { dishId: number; name: string; servings: number; lastServed: string }[];
  /** Active pool dishes that have never been the Special. */
  neverServed: number;
  /**
   * Days since EPOCH_DATE with no schedule row. Those ran on the deterministic
   * fallback pick, which isn't recoverable after the fact (the pool moves), so
   * they're counted but not folded into `served`.
   */
  unscheduledDays: number;
  /** The most recent Specials served, oldest first (capped) — the cadence strip. */
  timeline: MenuServing[];
  /** The ET day the served/upcoming split was made on. */
  today: string;
}

/** Totals + guess distribution for one slice of rounds (today, or all time). */
export interface AnalyticsPeriod {
  totals: { started: number; completed: number; solved: number; shared: number };
  /**
   * Games started split by kind. `started` counts all kinds; this breaks it into
   * Today's Special (daily) / Leftovers (leftover) / Chef's Choice (random).
   * The three sum to `totals.started`.
   */
  startedByKind: StartedByKind;
  /** dist[i] = rounds solved in i+1 guesses. */
  guessDistribution: number[];
  /** Completed rounds that ran out of guesses. */
  fails: number;
  /**
   * New vs returning player counts for this slice (see PlayerSplit), or null when
   * the slice predates player tracking — a day before instrumentation has no
   * player split, and reporting it as zeros would be a measurement it never made.
   */
  players: PlayerSplit | null;
}

/**
 * One ET hour of a day's service — games started in it, split by kind. The
 * overview's hourly chart is an array of 24 of these, index === `hour`.
 */
export interface AnalyticsHour {
  /** Hour of day in ET (the daily-rollover zone), 0..23. */
  hour: number;
  startedByKind: StartedByKind;
}

/**
 * A day's whole service across every kind, not just its Special. {@link
 * AnalyticsPeriod.totals} for a day slice deliberately narrows to `kind='daily'`
 * so replays can't dilute the puzzle's win rate — but "how busy was the diner"
 * and "how many rounds are still open" need every kind, so they come from here.
 *
 * All four count the rounds *started* that ET day, so a round begun at 11:58pm
 * and finished after midnight still lands on the day it started (the same cohort
 * rule the daily-breakdown table uses).
 */
export interface DayServiceTotals {
  started: number;
  completed: number;
  solved: number;
  shared: number;
}

/**
 * How a day's pace compares to the days before it, so a raw count part-way
 * through a service means something. Null when there aren't enough earlier days
 * to average.
 */
export interface AnalyticsPace {
  /** How many earlier active ET days were averaged (at most {@link PACE_LOOKBACK_DAYS}). */
  days: number;
  /**
   * `typical[h]` = mean games started from midnight ET *through the end of* hour
   * `h`, across those days. Cumulative, so comparing today's running total at
   * the current hour to `typical[currentHour]` is apples to apples.
   */
  typical: number[];
}

/** How many earlier active days the pace baseline averages over. */
export const PACE_LOOKBACK_DAYS = 7;

/** The three things a round can report, in the order they happen. */
export const ANALYTICS_EVENT_TYPES = ["start", "complete", "share"] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

/**
 * One entry in the admin's recent-activity feed — a single beacon a round fired,
 * derived from the analytics_rounds row (see migrations/0011). Still anonymous:
 * no guess content, and `playerId` is a random per-device id, not an account.
 */
export interface AnalyticsEvent {
  type: AnalyticsEventType;
  /** When it happened, as an ISO-8601 UTC instant ("2026-07-20T14:32:07Z"). */
  at: string;
  /** The round this belongs to — a start/complete/share trio shares one id. */
  roundId: string;
  puzzleNumber: number;
  /** The puzzle's date (YYYY-MM-DD) — not necessarily the day it was played. */
  date: string;
  kind: RoundKind;
  surface: Surface;
  /** Anonymous per-device id, or null for rounds from clients that omit it. */
  playerId: string | null;
  /** Scheduled dish for `date`; null for random rounds (they ignore the schedule). */
  dishName: string | null;
  /** Guesses used — `complete` events only. */
  guesses: number | null;
  /** Whether the round was won — `complete` events only. */
  solved: boolean | null;
}

/** How many events the admin feed asks for at a time, and its server-side cap. */
export const ANALYTICS_EVENTS_PAGE = 50;
export const ANALYTICS_EVENTS_MAX = 200;

/**
 * Everything one anonymous device has written into the analytics tables — the
 * *review* half of "delete my own play-testing out of the numbers".
 *
 * It exists because the admin is also a player: every dev round, every `/admin`
 * visit that started a board, every "does the modal still open" reload lands in
 * the same tables the dashboard reads, and at tens of rounds a day one person
 * testing is a visible fraction of every rate on it. The device is identified
 * exactly the way the Activity feed's "mine" filter identifies it — the
 * localStorage player id — so what this summarises is precisely what that
 * filter shows.
 *
 * Counts, never rows: the rows themselves are the Activity feed set to "Only
 * mine", which is a better review surface than a second table would be. This is
 * the part the feed can't answer — *how much* of the dashboard is you.
 */
export interface DeviceDataSummary {
  /** Echoed back so the client can be sure it reviewed what it's about to delete. */
  playerId: string;
  rounds: {
    total: number;
    completed: number;
    shared: number;
    /** Zero-filled, so a kind this device never played reads 0 rather than absent. */
    byKind: StartedByKind;
    bySurface: Record<Surface, number>;
    /** ISO-8601 UTC instants, or null when there are no rounds at all. */
    firstAt: string | null;
    lastAt: string | null;
  };
  /**
   * Arrival rows — one per ET day this device opened the game (migrations/0020).
   * The reason this feature exists: opening the game without guessing writes
   * *only* this, so a testing habit of "load it and look" is invisible in the
   * round counts and inflates nothing but the bounce rate.
   */
  visits: { total: number; firstDay: string | null; lastDay: string | null };
  /** Notice-reach rows this device counts toward (announcement_views). */
  noticeViews: number;
}

/** What a device wipe actually removed, per table — reported back, never assumed. */
export interface DeviceDataDeleted {
  rounds: number;
  visits: number;
  noticeViews: number;
}

/** Anonymous engagement aggregates for the admin dashboard. No guess content. */
export interface AnalyticsSummary extends AnalyticsPeriod {
  /**
   * One ET day's slice — today unless `?date=` asked for an earlier one.
   * `totals`/`guessDistribution`/`fails` cover that day's Special only
   * (play_date = the day AND kind = daily) — that's the puzzle's difficulty, so
   * replays/random never dilute it. `startedByKind` instead counts every game
   * *started* that ET day split by kind, so the dashboard can headline "Today's
   * Special started" alongside leftovers + chef's specials.
   */
  day: AnalyticsPeriod & {
    date: string;
    dishName: string | null;
    /** The day's whole service, every kind — see {@link DayServiceTotals}. */
    allKinds: DayServiceTotals;
    /** Games started per ET hour, split by kind. Always length 24, index === hour. */
    hourly: AnalyticsHour[];
    /**
     * The most recent round start on this day, as an ISO-8601 UTC instant, or
     * null if nothing was started. Drives the "last order N minutes ago"
     * liveness read — a quiet dashboard and a broken beacon look identical
     * without it.
     */
    lastStartedAt: string | null;
    /** This day's pace against the days before it, or null with too little history. */
    pace: AnalyticsPace | null;
    /**
     * The started-but-unfinished gap, split into people who might still be
     * playing and people who left. See {@link OpenRounds} — reporting the whole
     * gap as walkouts made every live afternoon look like a disaster.
     */
    open: OpenRounds;
    /**
     * Devices that opened a board this day. Null before the visit beacon shipped
     * — see {@link VisitCounts}; "not counted" is not a 100% bounce rate.
     */
    visited: number | null;
  };
  /** The server's current ET day. `day.date` equals it unless a past day was asked for. */
  today: string;
  /**
   * Every ET day that recorded any activity, oldest first — the set the admin's
   * day picker offers. Surface-filtered like everything else, so switching to
   * Discord narrows it to days Discord players actually showed up.
   */
  activeDates: string[];
  /** Last 30 days with activity, oldest first. */
  daily: AnalyticsDay[];
  /** Games played per day since the first round ever, with a trend line. See {@link GameGrowth}. */
  growth: GameGrowth;
  /**
   * The earliest ET day any round carried a `player_id` — i.e. when new-vs-returning
   * tracking actually started (migrations/0008, shipped after launch). Derived from
   * the data, not hardcoded, and deliberately **not** surface-filtered: it marks when
   * the instrument was switched on, not when a given surface first had players.
   * Null when nothing has ever been tracked. Days before it have null player counts.
   */
  playerTrackingStart: string | null;
  /**
   * The repeat-visit curve — how often a player who has visited N times comes
   * back for an N+1th. All-time and surface-filtered like `players`; null before
   * player tracking existed. See {@link PlayerRetention}.
   */
  retention: PlayerRetention | null;
  /**
   * Where rounds were started from, all time and surface-filtered like `players`.
   * Empty entries with a non-zero `untracked` is the expected state right after
   * country tracking ships. See {@link CountryMix}.
   */
  countries: CountryMix;
  /**
   * How the audience arrived, all time and surface-filtered — and whether each
   * source's arrivals came back. Every entry `untracked` with none in `entries`
   * is the expected state right after source tracking ships, the same as
   * `countries` above. See {@link SourceMix}.
   */
  sources: SourceMix;
  /**
   * When people play, all time and surface-filtered: the weekday × hour grid and
   * both its marginals. Replaces the bare `hourly: number[]` this used to carry —
   * that array is now `rhythm.byHour`, and the weekday axis it was missing is the
   * dominant cycle in a game that resets every midnight. See {@link PlayRhythm}.
   */
  rhythm: PlayRhythm;
  /**
   * How long a solved round takes, all time and surface-filtered. Derived from
   * timestamps recorded since migrations/0011 that nothing has read until now —
   * the difficulty signal guess count can't give. See {@link SolveTimes}.
   */
  solveTimes: SolveTimes;
  /**
   * Total time spent playing, all time and surface-filtered, off the same rows
   * as `solveTimes` — no extra query. Deliberately all-time only: a day's total
   * is just its round count wearing a different unit, where the accumulated
   * figure is the one nothing else on the dashboard says. See {@link PlayTime}.
   */
  playTime: PlayTime;
  /**
   * All-time devices that opened a board, and when that started being counted.
   * The funnel's top — see {@link VisitCounts}.
   */
  visits: VisitCounts;
  /**
   * Where players fall out between opening the game and coming back for
   * seconds, counted in devices at every stage. Surface-filtered, and its `day`
   * slice follows the day picker like the rest of the day reads.
   * See {@link PlayerFunnel}.
   */
  funnel: PlayerFunnel;
}
