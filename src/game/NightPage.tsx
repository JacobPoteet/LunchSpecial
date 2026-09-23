// After Dark: the bar board.
//
// Deliberately its own page rather than GamePage with a flag. It shares the
// components, the CSS classes, the end-of-round choreography and the beacons,
// and it shares none of the things that make GamePage 1,200 lines: no archive,
// no Chef's Choice, no announcements, no how-to, no rollover banner. What it
// has instead is a door, and most of the code below is about that door.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  beaconComplete,
  beaconShare,
  beaconStart,
  fetchDrinks,
  fetchNightcap,
  fetchNightcapReveal,
  newAnalyticsId,
  postDrinkGuess,
} from "../api";
import type { DrinkPoolEntry, NightcapInfo, NightcapReveal, Surface } from "../../shared/types";
import { useCheckOpening } from "./roundLifecycle";
import { useRoundTelemetry } from "./useRoundTelemetry";
import { useShare } from "./useShare";
import { DRINK_CLUE_COUNT, DRINK_MAX_GUESSES } from "../../shared/types";
import { Coaster, DrinkGuessRow, GuessInput, Modal, PunchCard, StoryDetails } from "./components";
import { Icon } from "./Icon";
import { FanStamp, RequestForm } from "./RequestForm";
import { BuildTag } from "./BuildTag";
import { SoundToggle } from "./SoundToggle";
import { currentSurface } from "../discord/bootstrap";
import { coasterAnnouncement, drinkGuessAnnouncement } from "../../shared/announce";
import { TICKET_MS } from "../../shared/audio";
import { buildNightScorecard } from "../../shared/scorecard";
import { playGuessArc, playSfx, setupAudio } from "../audio";
import { buildNightShareText, buildShareText, joinShareBlocks, shareMessage } from "./share";
import {
  emptyNightRound,
  getPlayerId,
  loadNightStats,
  loadRound,
  loadNightRound,
  recordNightResult,
  saveNightRound,
  type NightRoundState,
  type NightStats,
} from "./storage";
import { currentNight, isBarOpen, nightDateLabel, tzOffsetMinutes, untilLastCall, untilOpen } from "./night";
import { puzzleNumberFor } from "./archive";
import { devIgnoresBarHours } from "./devHarness";
import { localToday } from "../api";
import { hms } from "../../shared/time";

const SURFACE: Surface = currentSurface();

/** The bar's answer to WIN_TOASTS. Shorter list — there are only four rungs. */
const POUR_TOASTS = ["Smooth.", "Nice call.", "Got there.", "Last sip, hon."];

/**
 * A countdown that ticks once a second, for the closed sign and for last call.
 *
 * Its own tiny hook rather than the game's Countdown component: that one counts
 * to midnight ET, which is not a moment the bar cares about at all.
 */
function useCountdown(msLeft: () => number): number {
  const [ms, setMs] = useState(msLeft);
  useEffect(() => {
    const t = setInterval(() => setMs(msLeft()), 1000);
    return () => clearInterval(t);
  }, [msLeft]);
  return ms;
}

/** The sign on the door outside opening hours. */
function ClosedSign({ onLeave }: { onLeave: () => void }) {
  const ms = useCountdown(untilOpen);
  const { h, m, s } = hms(ms);
  useEffect(() => {
    // The doors opening under someone who is already looking at the sign. The
    // board replaces this the same second (see the latch in NightPage), so the
    // sound is the handover rather than a thing that happens on its own.
    if (ms <= 0) playSfx("lights-out");
  }, [ms]);
  return (
    <div className="closed closed--bar" role="status">
      <p className="closed__sign">The bar's closed</p>
      <p className="closed__body">
        After Dark runs from 8pm to 3am, your time. One drink a night, four guesses, and it's gone in
        the morning.
      </p>
      <p className="bar-countdown">
        Opens in <b>{h}</b>:<b>{m}</b>:<b>{s}</b>
      </p>
      <button className="replay-btn" onClick={() => { playSfx("ui-click"); onLeave(); }}>
        ← Back to the diner
      </button>
    </div>
  );
}

/**
 * The sign for someone who found the bar without eating.
 *
 * The gate is finishing today's Special, which is also what makes the crossover
 * figure on the dashboard exact. It says so plainly rather than just refusing:
 * a locked door with no reason on it is the most annoying screen in any game.
 */
function DoorSign({ onLeave }: { onLeave: () => void }) {
  return (
    <div className="closed closed--bar" role="status">
      <p className="closed__sign">Kitchen first</p>
      <p className="closed__body">
        The bar's open, but you'll want to settle today's Special before you start a tab. Finish
        lunch and the door's yours.
      </p>
      <button className="replay-btn" onClick={() => { playSfx("ui-click"); onLeave(); }}>
        ← Take me to today's Special
      </button>
    </div>
  );
}

/** The bar's stats panel. Four rungs, never six. */
function NightStatsPanel({ stats, highlight }: { stats: NightStats; highlight?: number }) {
  const winPct = stats.played === 0 ? 0 : Math.round((stats.wins / stats.played) * 100);
  const maxDist = Math.max(1, ...stats.dist);
  useEffect(() => {
    if (highlight === undefined) return;
    playSfx("stat-pop", { delayMs: 560 });
  }, [highlight]);
  return (
    <>
      <div className="stats-grid">
        <div><span className="stat__num">{stats.played}</span><span className="stat__label">Nights</span></div>
        <div><span className="stat__num">{winPct}%</span><span className="stat__label">Win rate</span></div>
        <div><span className="stat__num">{stats.currentStreak}</span><span className="stat__label">Streak</span></div>
        <div><span className="stat__num">{stats.maxStreak}</span><span className="stat__label">Best</span></div>
      </div>
      <div className="dist">
        {stats.dist.map((n, i) => (
          <div
            className={highlight === i + 1 ? "dist__row dist__row--current" : "dist__row"}
            key={i}
            style={{ "--i": i, "--w": `${8 + (n / maxDist) * 80}%` } as React.CSSProperties}
          >
            <span>{i + 1}</span>
            <span className="dist__bar">{n}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default function NightPage({ onLeave }: { onLeave: () => void }) {
  const search = useMemo(() => new URLSearchParams(window.location.search), []);
  // A showcase link is a preview token by another name, so it rides the same
  // parameter from here down and every gate, every `ephemeral` and every
  // `tracked` below reads it without a second branch. The two are kept apart in
  // the URL because the diner needs to tell them apart — a `?preview=` there is
  // a *dish* token and would be rejected by the kitchen's resolver.
  //
  // What the Worker does with it differs: a drink preview names one pour, a
  // showcase names none and gets the night's real one. See worker/showcase.ts.
  const preview = useMemo(() => search.get("preview") ?? search.get("s") ?? undefined, [search]);
  const isPreview = preview !== undefined;
  // The one place the two are told apart. Everything else about a showcase is a
  // preview — untracked, ephemeral, past the clock — but the banner is written
  // for whoever is reading it, and "admin test pour" is addressed to you. The
  // person holding a showcase link has never seen this game.
  const isShowcase = useMemo(() => search.has("s") && !search.has("preview"), [search]);
  // `?nightcap=<slug>` pins the pour, dev only on the client for the same
  // reason `?special=` is: the slugs are public, but the entrance isn't.
  const pinned = useMemo(() => {
    if (isPreview || !import.meta.env.DEV) return undefined;
    return search.get("nightcap") ?? undefined;
  }, [isPreview, search]);
  // Dev harness: ignore the clock and the door. Never available in production,
  // where the only way past either is a signed preview token.
  const ignoreHours = devIgnoresBarHours() || (import.meta.env.DEV && !!pinned);

  /**
   * `?nightcap=random` rolls a different pour on every load.
   *
   * "random" is not a slug, so it is resolved to one against the pool below and
   * then handed to the ordinary pin path. The Worker never learns a random
   * branch: one drink a night with no archive is the shape of the mode, and a
   * branch that exists for testing is a branch that eventually ships. It is
   * also why this needs no new endpoint — a rolled pin is ephemeral like any
   * other, so nothing is saved and a restarted dev server starts clean.
   */
  const wantsRoll = pinned === "random";
  const [rolled, setRolled] = useState<string | undefined>(undefined);
  const effectivePin = wantsRoll ? rolled : pinned;

  // Fixed at entry and never recomputed. A player who starts at 02:55 and
  // finishes at 03:10 played THIS night: recomputing would hand them tomorrow's
  // board mid-round, and recomputing at midnight would do it to everybody.
  const [night] = useState(() => currentNight());

  const ephemeral = isPreview || !!pinned;
  const tracked = !isPreview && !pinned;

  const [drinks, setDrinks] = useState<DrinkPoolEntry[]>([]);
  const [info, setInfo] = useState<NightcapInfo | null>(null);
  const [round, setRound] = useState<NightRoundState>(() =>
    ephemeral ? emptyNightRound(night) : loadNightRound(night),
  );
  const [reveal, setReveal] = useState<NightcapReveal | null>(null);
  const [stats, setStats] = useState<NightStats>(() => loadNightStats());
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<DrinkPoolEntry | null>(null);
  // The tab opens on the same beat as the check (roundLifecycle.ts): a beat
  // after a loss, a toast then a beat after a win, instantly for a round that
  // was already settled when the page loaded.
  const check = useCheckOpening(round.status, round.guesses.length, (n) => POUR_TOASTS[n - 1] ?? POUR_TOASTS[0]);
  const { toast, showCheck: showTab, setShowCheck: setShowTab } = check;
  const [openedAt] = useState(() => Date.now());

  // The two gates, read once at mount. `barOpen` is deliberately not live: a
  // player admitted at 02:59 keeps their round, because last call is a door and
  // not a timer. The countdown on the closed sign is the live half.
  const [barOpen, setBarOpen] = useState(() => ignoreHours || isPreview || isBarOpen());

  /**
   * The doors opening while someone waits at them.
   *
   * One-way on purpose: this can turn the bar ON and can never turn it off.
   * Last call is a door, not a timer — a round in progress at 03:00 runs to
   * completion, and a latch that closed would take a live board away from
   * whoever was mid-guess. It only runs while the bar is shut, so an open bar
   * costs nothing.
   */
  useEffect(() => {
    if (barOpen) return;
    const t = setInterval(() => {
      if (isBarOpen()) setBarOpen(true);
    }, 1000);
    return () => clearInterval(t);
  }, [barOpen]);
  // Deliberately NOT bypassed by `?barhours=off`, which is about the clock. It
  // used to be, and the cost was that the "Kitchen first" door could not be
  // reached in dev at all — a state nobody can look at is a state nobody
  // checks. `npm run lastcall` and `npm run afterdark` both seed a won Special,
  // so the common case still lands on the board; clearing the lunch round is
  // how you go and look at the door.
  const [lunchDone] = useState(() => isPreview || loadRound(localToday()).status !== "playing");

  const lastCall = useCountdown(untilLastCall);

  useEffect(() => {
    setupAudio(SURFACE);
  }, []);

  const persist = useCallback(
    (next: NightRoundState) => {
      if (!ephemeral) saveNightRound(next);
    },
    [ephemeral],
  );

  useEffect(() => {
    if (!barOpen || !lunchDone) return;
    let cancelled = false;
    setLoadError(null);
    // The pool is fetched first when a roll is wanted, because the pin has to
    // come out of it. Everywhere else the two are independent.
    (async () => {
      const list = await fetchDrinks();
      if (cancelled) return;
      setDrinks(list);
      const pin = wantsRoll ? list[Math.floor(Math.random() * list.length)]?.slug : pinned;
      if (wantsRoll) setRolled(pin);
      const nightcap = await fetchNightcap(night, preview, pin);
      if (!cancelled) setInfo(nightcap);
    })().catch((e: Error) => {
      if (!cancelled) setLoadError(e.message);
    });
    return () => {
      cancelled = true;
    };
  }, [night, preview, pinned, wantsRoll, barOpen, lunchDone]);

  useEffect(() => {
    if (round.status !== "playing" && !reveal) {
      fetchNightcapReveal(night, preview, effectivePin).then(setReveal).catch(() => {});
    }
  }, [round.status, reveal, night, preview, effectivePin]);

  // The analytics id, the seated beacon, Rich Presence and the Discord
  // progress message, shared with the diner (useRoundTelemetry.ts). The card
  // it publishes never names the drink, and "After Dark" is the mode label
  // the presence fold already carries.
  useRoundTelemetry({
    tracked,
    surface: SURFACE,
    ready: info !== null,
    round: { status: round.status, guesses: round.guesses.length, analyticsId: round.analyticsId },
    kind: "nightcap",
    puzzleNumber: info?.nightNumber ?? 0,
    openedAt,
    boardKey: `${night}|${pinned ?? ""}`,
    buildCard: () =>
      buildNightScorecard(info?.nightNumber ?? 0, round.guesses, round.status === "won", info?.ingredientCount ?? 0),
    assignId: (id) => {
      const started = { ...round, analyticsId: id };
      setRound(started);
      persist(started);
    },
  });

  const [liveGuess, setLiveGuess] = useState("");
  const [liveCoaster, setLiveCoaster] = useState("");
  const coasterTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(coasterTimer.current), []);

  const submitGuess = useCallback(
    async (drink: DrinkPoolEntry) => {
      if (!info || busy || round.status !== "playing") return;
      setBusy(true);
      setError(null);
      setPending(drink);
      playSfx("guess-submit");
      try {
        const guessNumber = round.guesses.length + 1;
        const feedback = await postDrinkGuess({
          night,
          drinkId: drink.id,
          guessNumber,
          preview,
          nightcap: effectivePin,
        });
        const next: NightRoundState = {
          ...round,
          guesses: [...round.guesses, feedback],
          coasters: feedback.coaster ? [...round.coasters, feedback.coaster] : round.coasters,
          status: feedback.correct ? "won" : guessNumber >= DRINK_MAX_GUESSES ? "lost" : "playing",
        };
        setRound(next);
        setPending(null);
        playGuessArc({
          correct: feedback.correct,
          lost: next.status === "lost",
          hasClue: Boolean(feedback.coaster),
          night: true,
        });
        setLiveGuess(
          drinkGuessAnnouncement({
            guess: feedback,
            ingredientCount: info.ingredientCount,
            guessNumber,
            maxGuesses: DRINK_MAX_GUESSES,
          }),
        );
        const coaster = feedback.coaster;
        window.clearTimeout(coasterTimer.current);
        if (coaster) {
          coasterTimer.current = window.setTimeout(
            () => setLiveCoaster(coasterAnnouncement(coaster.index, coaster.text)),
            TICKET_MS,
          );
        }
        persist(next);
        if (tracked) {
          const roundId = next.analyticsId ?? newAnalyticsId();
          // `date` carries the LOCAL night key on a nightcap beacon, and
          // tzOffset is what makes the hour profile readable. See 0041.
          const base = {
            roundId,
            puzzleNumber: info.nightNumber,
            date: night,
            kind: "nightcap" as const,
            surface: SURFACE,
            tzOffset: tzOffsetMinutes(),
          };
          if (guessNumber === 1) beaconStart({ ...base, playerId: getPlayerId() });
          if (next.status !== "playing") {
            setStats(recordNightResult(night, next.status === "won", next.guesses.length));
            beaconComplete({
              ...base,
              guesses: next.guesses.length,
              solved: next.status === "won",
            });
          }
        } else if (next.status !== "playing") {
          // A preview or a playtest still shows the panel; it just shows the
          // numbers you walked in with.
          setStats(loadNightStats());
        }
      } catch (e) {
        setError((e as Error).message);
        setPending(null);
      } finally {
        setBusy(false);
      }
    },
    [info, busy, round, night, preview, effectivePin, tracked, persist],
  );

  const guessedIds = useMemo(() => new Set(round.guesses.map((g) => g.drink.id)), [round.guesses]);
  const remaining = DRINK_MAX_GUESSES - round.guesses.length;

  if (!barOpen) return <BarScene><ClosedSign onLeave={onLeave} /></BarScene>;
  if (!lunchDone) return <BarScene><DoorSign onLeave={onLeave} /></BarScene>;

  return (
    <BarScene>
      <p className="sr-only" role="status" aria-live="polite">{liveGuess}</p>
      <p className="sr-only" role="status" aria-live="polite">{liveCoaster}</p>
      {toast && (
        <div className="win-toast win-toast--bar" role="status" aria-live="polite">
          <span className="win-toast__bell" aria-hidden="true">
            <Icon name="glass" />
          </span>
          {toast}
        </div>
      )}

      <main className="menu-card menu-card--bar">
        {isPreview && (
          <p className="preview-banner">
            {isShowcase
              ? "Preview link — the bar's normally open 8pm to 3am. Nothing here is saved."
              : "Admin test pour — nothing is saved, counted or shown to players"}
          </p>
        )}
        {pinned && (
          <p className="preview-banner">
            Playtest — {wantsRoll ? "a random pour" : `pinned to “${pinned}”`}, nothing is saved
          </p>
        )}

        {/* The way out, as its own band rather than a pill among the toolbar's.
            It mirrors `.archive-bar`, which is the diner's existing pattern for
            "you are somewhere other than today, here is the way back" — and it
            is here because the toolbar pill it replaces read as a filter rather
            than as a door. */}
        <div className="bar-return">
          <span className="bar-return__tag">
            <Icon name="glass" /> After Dark
          </span>
          <button className="bar-return__btn" onClick={() => { playSfx("ui-click"); onLeave(); }}>
            Back to the diner
          </button>
        </div>

        <div className="menu-card__header">
          <h2 className="menu-card__title">Libations</h2>
          <p className="menu-card__meta">
            {info && info.nightNumber > 0 ? <>Night No. {info.nightNumber} — </> : null}
            {nightDateLabel(night)}
          </p>
          <div className="menu-card__toolbar">
            {round.status !== "playing" && (
              <button className="icon-btn" onClick={() => { playSfx("ui-click"); setShowTab(true); }}>
                Your tab
              </button>
            )}
            <SoundToggle />
          </div>
        </div>

        {/* Only inside the last hour, and only while a round is live. Earlier
            than that it is a clock nobody asked for, and after the round ends
            there is nothing left to hurry for. */}
        {lastCall > 0 && lastCall < 3_600_000 && round.status === "playing" && (
          <div className="lastcall-bar" role="status" aria-live="polite">
            <span className="lastcall-bar__tag">
              <Icon name="clock" /> Last call in {hms(lastCall).m}:{hms(lastCall).s}</span>
          </div>
        )}

        {loadError && !info ? (
          <div className="closed" role="alert">
            <p className="closed__sign">Nothing on tap</p>
            <p className="closed__body">{loadError}</p>
            <button className="replay-btn" onClick={() => { playSfx("ui-click"); onLeave(); }}>
              ← Back to the diner
            </button>
          </div>
        ) : (
          <>
            <div className="special-line special-line--bar">
              <span className="special-line__glass" aria-hidden="true">
                <Icon name="glass" />
              </span>
              <div className="special-line__body">
                <p className="special-line__label">
                  <span>Tonight's Nightcap</span>
                  <span className="leader" aria-hidden="true" />
                  <span className="special-line__price">on the house</span>
                </p>
                <p className="special-line__hint">
                  {info ? (
                    <>A mystery pour with <strong>{info.ingredientCount} ingredients</strong>. What's it going to be?</>
                  ) : (
                    "Wiping down the bar…"
                  )}
                </p>
              </div>
            </div>

            {round.status === "playing" && (
              <>
                <GuessInput
                  dishes={drinks}
                  excludeIds={guessedIds}
                  disabled={!info || busy}
                  onGuess={submitGuess}
                  placeholder="Order a drink… (type to search)"
                  label="Guess a drink"
                  hint={(d) => d.country}
                />
                <PunchCard used={DRINK_MAX_GUESSES - remaining} total={DRINK_MAX_GUESSES} />
              </>
            )}
          </>
        )}

        {error && <p className="error-note">{error}</p>}

        <div className="guesses">
          {[
            ...(pending
              ? [<DrinkGuessRow key={pending.id} drink={pending} ingredientCount={info?.ingredientCount ?? 0} />]
              : []),
            ...[...round.guesses]
              .reverse()
              .map((g) => (
                <DrinkGuessRow key={g.drink.id} guess={g} ingredientCount={info?.ingredientCount ?? 0} />
              )),
          ]}
        </div>

        {round.coasters.length > 0 && (
          <div className="tickets">
            {[...round.coasters].reverse().map((c) => (
              <Coaster key={c.index} index={c.index} text={c.text} />
            ))}
          </div>
        )}

        <footer className="menu-card__thanks">
          <p className="menu-card__thanks-script">Last call at three</p>
          <p className="menu-card__thanks-fine">
            One pour a night · {DRINK_CLUE_COUNT} coasters · Please drink responsibly
          </p>
        </footer>
      </main>

      {showTab && info && round.status !== "playing" && (
        <TabModal
          round={round}
          info={info}
          reveal={reveal}
          stats={stats}
          tracked={tracked}
          onLeave={onLeave}
          onClose={() => setShowTab(false)}
        />
      )}
    </BarScene>
  );
}

/** The room. Sets the theme attribute for as long as the bar is on screen. */
function BarScene({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.afterDark = "1";
    return () => {
      delete document.documentElement.dataset.afterDark;
    };
  }, []);
  return (
    <div className="scene scene--bar">
      <header className="marquee marquee--bar">
        <h1 className="marquee__script">After Dark</h1>
        <p className="marquee__sub">One drink. Four guesses. Gone by morning.</p>
      </header>
      {children}
      {/* The same footer the diner carries, byline included. The bar is a room
          in this place, not a second product, so the credit under it doesn't
          change when the lights do. */}
      <footer className="footer-note">
        <p>Created by <b>Jacob Poteet</b></p>
        <p className="footer-note__links">
          <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/press">Press</a>
        </p>
        <BuildTag />
      </footer>
    </div>
  );
}

function TabModal({
  round,
  info,
  reveal,
  stats,
  tracked,
  onLeave,
  onClose,
}: {
  round: NightRoundState;
  info: NightcapInfo;
  reveal: NightcapReveal | null;
  stats: NightStats;
  tracked: boolean;
  onLeave: () => void;
  onClose: () => void;
}) {
  const won = round.status === "won";

  /**
   * Both grids, in one message.
   *
   * The lunch block is read from storage at click time rather than passed in,
   * because the door to this screen is finishing lunch: by the time anyone can
   * press this, that round exists. If it somehow doesn't, joinShareBlocks drops
   * the empty block and the night's grid goes on its own.
   *
   * The share beacon fires against the NIGHTCAP round only. A share is
   * attributed to the card you pressed it on; marking the lunch round shared
   * too would inflate a figure the dashboard already reads, from an action
   * taken hours later on a different screen.
   */
  const sharing = useShare({
    surface: SURFACE,
    idle: "Share the night",
    message: () => {
      const lunch = loadRound(localToday());
      const lunchBlock =
        lunch.status !== "playing" && lunch.guesses.length > 0
          ? buildShareText(
              puzzleNumberFor(lunch.date),
              lunch.guesses,
              lunch.status === "won",
              // Stamped on the round when it was played (storage.ts). A round
              // saved before that shipped has none, and 0 makes buildShareText
              // drop the pantry column rather than print "2/0" — a grid claiming
              // two of nothing is worse than one that just shows its tiles.
              lunch.ingredientCount ?? 0,
            )
          : null;
      const nightBlock = buildNightShareText(info.nightNumber, round.guesses, won, info.ingredientCount);
      return shareMessage(joinShareBlocks([lunchBlock, nightBlock]));
    },
    card: () => buildNightScorecard(info.nightNumber, round.guesses, won, info.ingredientCount),
    onShare: () => {
      if (tracked && round.analyticsId) {
        beaconShare({
          roundId: round.analyticsId,
          puzzleNumber: info.nightNumber,
          date: round.night,
          kind: "nightcap",
          surface: SURFACE,
        });
      }
    },
  });

  // Coaster 3 is the near-giveaway, so it doubles as the one-line definition
  // under the answer — the same job beat 5 does on the check.
  const definition = reveal?.coasters.at(-1);

  const actions = (
    <>
      <div className="check-actions">
        <button className="share-btn share-btn--primary" onClick={sharing.share} disabled={sharing.busy}>
          <span className="share-btn__label" key={sharing.state}>
            {sharing.state === "idle" && <Icon name="share" />} {sharing.label}
          </span>
        </button>
      </div>
      <div className="replay-actions">
        <button className="replay-btn" onClick={() => { playSfx("ui-click"); onLeave(); }}>
          ← Back to the diner
        </button>
      </div>
    </>
  );

  return (
    <Modal onClose={onClose} variant="receipt" footer={actions} label="Your tab">
      <div className="receipt__head">
        <p className="receipt__title">After Dark — your tab</p>
        <p className="receipt__verdict">{won ? "That one's on us" : "Better luck tomorrow night"}</p>
      </div>
      {reveal && (
        <>
          <p className="receipt__dish">{reveal.name}</p>
          {!won && (
            <>
              <p className="receipt__facts">
                {reveal.country} · {reveal.spirit === "none" ? "no base spirit" : reveal.spirit} · served{" "}
                {reveal.temperature} · {reveal.profile}
                {!reveal.isAlcoholic && " · alcohol-free"}
              </p>
              {reveal.ingredients.length > 0 && (
                <p className="receipt__ingredients">{reveal.ingredients.join(" · ")}</p>
              )}
            </>
          )}
          {definition && <p className="receipt__definition">{definition}</p>}
          <StoryDetails clues={reveal.coasters} noun="coasters" />
        </>
      )}
      <NightStatsPanel stats={stats} highlight={won ? round.guesses.length : undefined} />
      {/* The same suggestion box the check carries, asking for a drink. The
          credit above it was on the reveal from the day the bar opened and
          never drawn; a fan's pour deserves the stamp as much as a fan's dish. */}
      {reveal?.isFanSubmission && <FanStamp name={reveal.name} kind="drink" />}
      <RequestForm kind="drink" promoted={reveal?.isFanSubmission === true} />
    </Modal>
  );
}
