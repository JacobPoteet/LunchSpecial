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
  beaconSeated,
  beaconShare,
  beaconStart,
  fetchDrinks,
  fetchNightcap,
  fetchNightcapReveal,
  newAnalyticsId,
  postDrinkGuess,
} from "../api";
import type { DrinkSummary, NightcapInfo, NightcapReveal, Surface } from "../../shared/types";
import { DRINK_CLUE_COUNT, DRINK_MAX_GUESSES } from "../../shared/types";
import { Coaster, DrinkGuessRow, GuessInput, Modal } from "./components";
import { BuildTag } from "./BuildTag";
import { SoundToggle } from "./SoundToggle";
import { currentSurface } from "../discord/bootstrap";
import { setPresence } from "../discord/presence";
import { publishProgress, resetProgress } from "../discord/progress";
import { canShareToChannel, shareToChannel } from "../discord/share";
import { coasterAnnouncement, drinkGuessAnnouncement } from "../../shared/announce";
import { TICKET_MS } from "../../shared/audio";
import { buildPresence } from "../../shared/presence";
import { buildNightScorecard } from "../../shared/scorecard";
import { playGuessArc, playSfx, setupAudio } from "../audio";
import {
  buildNightShareText,
  buildShareText,
  canUseNativeShare,
  copyShareText,
  joinShareBlocks,
  shareMessage,
} from "./share";
import {
  emptyNightRound,
  getPlayerId,
  loadNightStats,
  loadRound,
  loadNightRound,
  markSeated,
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
    // The doors just opened while someone sat on this screen. Nothing reloads
    // itself; the sign simply stops being true, and the copy below changes.
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

type ShareState = "idle" | "working" | "channel" | "sent" | "copied" | "failed";

function shareLabel(state: ShareState, surface: Surface): string {
  switch (state) {
    case "working":
      return "Plating up…";
    case "channel":
      return "Sent to the channel!";
    case "sent":
      return "Shared!";
    case "copied":
      return surface === "discord" ? "Copied — paste it in chat!" : "Copied!";
    case "failed":
      return "Tap to retry";
    default:
      return "📤 Share the night";
  }
}

export default function NightPage({ onLeave }: { onLeave: () => void }) {
  const search = useMemo(() => new URLSearchParams(window.location.search), []);
  const preview = useMemo(() => search.get("preview") ?? undefined, [search]);
  const isPreview = preview !== undefined;
  // `?nightcap=<slug>` pins the pour, dev only on the client for the same
  // reason `?special=` is: the slugs are public, but the entrance isn't.
  const pinned = useMemo(() => {
    if (isPreview || !import.meta.env.DEV) return undefined;
    return search.get("nightcap") ?? undefined;
  }, [isPreview, search]);
  // Dev harness: ignore the clock and the door. Never available in production,
  // where the only way past either is a signed preview token.
  const ignoreHours = devIgnoresBarHours() || (import.meta.env.DEV && !!pinned);

  // Fixed at entry and never recomputed. A player who starts at 02:55 and
  // finishes at 03:10 played THIS night: recomputing would hand them tomorrow's
  // board mid-round, and recomputing at midnight would do it to everybody.
  const [night] = useState(() => currentNight());

  const ephemeral = isPreview || !!pinned;
  const tracked = !isPreview && !pinned;

  const [drinks, setDrinks] = useState<DrinkSummary[]>([]);
  const [info, setInfo] = useState<NightcapInfo | null>(null);
  const [round, setRound] = useState<NightRoundState>(() =>
    ephemeral ? emptyNightRound(night) : loadNightRound(night),
  );
  const [reveal, setReveal] = useState<NightcapReveal | null>(null);
  const [stats, setStats] = useState<NightStats>(() => loadNightStats());
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<DrinkSummary | null>(null);
  const [showTab, setShowTab] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [checkOpened, setCheckOpened] = useState(false);
  const restoredFinished = useRef(round.status !== "playing");
  const openedAt = useRef(Date.now());

  // The two gates, read once at mount. `barOpen` is deliberately not live: a
  // player admitted at 02:59 keeps their round, because last call is a door and
  // not a timer. The countdown on the closed sign is the live half.
  const [barOpen] = useState(() => ignoreHours || isPreview || isBarOpen());
  const [lunchDone] = useState(
    () => ignoreHours || isPreview || loadRound(localToday()).status !== "playing",
  );

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
    Promise.all([fetchDrinks(), fetchNightcap(night, preview, pinned)])
      .then(([list, nightcap]) => {
        if (cancelled) return;
        setDrinks(list);
        setInfo(nightcap);
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [night, preview, pinned, barOpen, lunchDone]);

  useEffect(() => {
    if (round.status !== "playing" && !reveal) {
      fetchNightcapReveal(night, preview, pinned).then(setReveal).catch(() => {});
    }
  }, [round.status, reveal, night, preview, pinned]);

  // One analytics id per round, exactly as the diner does it. The start beacon
  // fires on the first guess, not here.
  useEffect(() => {
    if (!tracked || !info || round.analyticsId) return;
    const started = { ...round, analyticsId: newAnalyticsId() };
    setRound(started);
    persist(started);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, tracked]);

  // The funnel's top. Same beacon and the same per-day ledger as the diner's —
  // a player who came at noon and again at nine is one visit, and markSeated
  // already knows that, so this costs nothing on the common path.
  useEffect(() => {
    if (!tracked || !info) return;
    if (!markSeated(localToday())) return;
    beaconSeated({ playerId: getPlayerId(), surface: SURFACE });
  }, [info, tracked]);

  // Rich Presence. The copy never names the drink, and "After Dark" is the mode
  // label the fold already carries.
  useEffect(() => {
    if (!tracked || !info) return;
    setPresence(
      buildPresence({
        kind: "nightcap",
        puzzleNumber: info.nightNumber,
        status: round.status,
        guesses: round.guesses.length,
        startedAt: openedAt.current,
      }),
    );
  }, [tracked, info, round.status, round.guesses.length]);

  // A new board is a new message. Declared ABOVE the publisher so it runs
  // first: effects fire in order, and a board restored from localStorage
  // publishes on mount — resetting afterwards would orphan that post. Same rule
  // as GamePage, and the same bug if it moves.
  useEffect(() => {
    resetProgress();
  }, [night, pinned]);

  // The live message in the launch channel. Same trigger and the same `tracked`
  // gate as presence; the card it publishes never names the drink.
  useEffect(() => {
    if (!tracked || !info || SURFACE !== "discord") return;
    publishProgress({
      card: buildNightScorecard(info.nightNumber, round.guesses, round.status === "won", info.ingredientCount),
      puzzleNumber: info.nightNumber,
      live: round.status === "playing",
    });
    // Keyed on the guess count, like presence: the array's identity changes on
    // renders that added no guess, and each one would be another upload.
  }, [tracked, info, round.status, round.guesses.length]);

  // The tab opens on the same beat as the check. Written out rather than taken
  // from useCheckOpening because the bar's toast list is its own and the hook
  // takes it as an argument — see roundLifecycle.ts.
  useEffect(() => {
    if (round.status === "playing" || checkOpened) return;
    if (restoredFinished.current) {
      setCheckOpened(true);
      setShowTab(true);
      return;
    }
    const won = round.status === "won";
    if (won) setToast(POUR_TOASTS[round.guesses.length - 1] ?? POUR_TOASTS[0]);
    const t = setTimeout(
      () => {
        setToast(null);
        setCheckOpened(true);
        setShowTab(true);
      },
      won ? 1700 : 800,
    );
    return () => clearTimeout(t);
  }, [round.status, round.guesses.length, checkOpened]);

  const [liveGuess, setLiveGuess] = useState("");
  const [liveCoaster, setLiveCoaster] = useState("");
  const coasterTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(coasterTimer.current), []);

  const submitGuess = useCallback(
    async (drink: DrinkSummary) => {
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
          nightcap: pinned,
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
    [info, busy, round, night, preview, pinned, tracked, persist],
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
          <span className="win-toast__bell" aria-hidden="true">🍸</span>
          {toast}
        </div>
      )}

      <main className="menu-card menu-card--bar">
        {isPreview && (
          <p className="preview-banner">Admin test pour — nothing is saved, counted or shown to players</p>
        )}
        {pinned && <p className="preview-banner">Playtest — pinned to “{pinned}”, nothing is saved</p>}

        <div className="menu-card__header">
          <h2 className="menu-card__title">Libations</h2>
          <p className="menu-card__meta">
            {info && info.nightNumber > 0 ? <>Night No. {info.nightNumber} — </> : null}
            {nightDateLabel(night)}
          </p>
          <div className="menu-card__toolbar">
            <button className="icon-btn" onClick={() => { playSfx("ui-click"); onLeave(); }}>
              ← The diner
            </button>
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
            <span className="lastcall-bar__tag">🕒 Last call in {hms(lastCall).m}:{hms(lastCall).s}</span>
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
              <span className="special-line__glass" aria-hidden="true">🍸</span>
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
                />
                <p className="tally">
                  {"•".repeat(remaining)}
                  {"◦".repeat(DRINK_MAX_GUESSES - remaining)} {remaining}{" "}
                  {remaining === 1 ? "guess" : "guesses"} left
                </p>
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
      <BuildTag />
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
      <footer className="footer-note">
        <p className="footer-note__links">
          <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/press">Press</a>
        </p>
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
  const [shareState, setShareState] = useState<ShareState>("idle");
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
  const share = async () => {
    setShareState("idle");
    const lunch = loadRound(localToday());
    const lunchBlock =
      lunch.status !== "playing" && lunch.guesses.length > 0
        ? buildShareText(
            puzzleNumberFor(lunch.date),
            lunch.guesses,
            lunch.status === "won",
            // Stamped on the round when it was played (storage.ts). A round
            // saved before that shipped has none, and prints 0 rather than a
            // denominator nobody measured.
            lunch.ingredientCount ?? 0,
          )
        : null;
    const nightBlock = buildNightShareText(info.nightNumber, round.guesses, won, info.ingredientCount);
    const message = shareMessage(joinShareBlocks([lunchBlock, nightBlock]));

    if (tracked && round.analyticsId) {
      beaconShare({
        roundId: round.analyticsId,
        puzzleNumber: info.nightNumber,
        date: round.night,
        kind: "nightcap",
        surface: SURFACE,
      });
    }
    if (SURFACE === "discord") {
      if (canShareToChannel()) {
        setShareState("working");
        const card = buildNightScorecard(info.nightNumber, round.guesses, won, info.ingredientCount);
        if (await shareToChannel(card)) {
          setShareState("channel");
          return;
        }
      }
      setShareState((await copyShareText(message)) ? "copied" : "failed");
      return;
    }
    if (canUseNativeShare(message)) {
      try {
        await navigator.share({ text: message });
        setShareState("sent");
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    setShareState((await copyShareText(message)) ? "copied" : "failed");
  };

  useEffect(() => {
    if (shareState === "channel" || shareState === "sent" || shareState === "copied") playSfx("share-success");
    else if (shareState === "failed") playSfx("error");
  }, [shareState]);

  // Coaster 3 is the near-giveaway, so it doubles as the one-line definition
  // under the answer — the same job beat 5 does on the check.
  const definition = reveal?.coasters.at(-1);

  const actions = (
    <>
      <div className="check-actions">
        <button className="share-btn share-btn--primary" onClick={share} disabled={shareState === "working"}>
          <span className="share-btn__label" key={shareState}>
            {shareLabel(shareState, SURFACE)}
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
        </>
      )}
      <NightStatsPanel stats={stats} highlight={won ? round.guesses.length : undefined} />
    </Modal>
  );
}
