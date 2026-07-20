import { useCallback, useEffect, useMemo, useState } from "react";
import {
  beaconComplete,
  beaconShare,
  beaconStart,
  fetchDaily,
  fetchDishes,
  fetchReveal,
  localToday,
  newAnalyticsId,
  postGuess,
} from "../api";
import type { DailyInfo, DishSummary, RevealInfo, RoundKind } from "../../shared/types";
import { MAX_GUESSES } from "../../shared/types";
import { ClueTicket, Countdown, GuessInput, GuessRow, Modal } from "./components";
import ArchiveModal from "./ArchiveModal";
import { dateLabel, isPastPuzzleDate } from "./archive";
import { playSfx } from "./sfx";
import { buildShareText } from "./share";
import {
  emptyRound,
  hasSeenHowTo,
  loadArchiveRound,
  loadRound,
  loadStats,
  markHowToSeen,
  recordResult,
  saveArchiveRound,
  saveRound,
  type GameStatus,
  type RoundState,
  type Stats,
} from "./storage";
import clocheUrl from "../assets/art/ai-cloche.svg";

/** A fresh random seed for a random recipe; the server maps it to a random dish. */
function newSeed(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function HowToModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div className="howto">
        <h2>How to play</h2>
        <p>
          Every day this diner runs one <strong>Special</strong>, a famous dish from somewhere in the world. You have{" "}
          {MAX_GUESSES} guesses to figure out what's under the cloche.
        </p>
        <p>
          <strong>Order any dish off the menu.</strong> The kitchen tells you which of its ingredients are also in the
          Special, and how its country, course, serving temperature, and protein compare:
        </p>
        <div className="legend">
          <span className="chip" style={{ background: "var(--hit)", color: "#fff" }}>green = match</span>
          <span className="chip" style={{ background: "var(--near)" }}>yellow = close (same region)</span>
          <span className="chip" style={{ background: "var(--miss-soft)", color: "var(--ink-soft)" }}>gray = miss</span>
        </div>
        <p>
          After each wrong order, the kitchen slips you a <strong>clue ticket</strong> - country of origin, history, the
          moment that made the dish famous. Five clues in total. Good luck, hon.
        </p>
        <p>
          Once you've settled today's check, hit <strong>Menu archive</strong> to replay any Special you missed, or
          have the cook fire a random recipe.
        </p>
      </div>
    </Modal>
  );
}

function StatsPanel({ stats }: { stats: Stats }) {
  const winPct = stats.played === 0 ? 0 : Math.round((stats.wins / stats.played) * 100);
  const maxDist = Math.max(1, ...stats.dist);
  return (
    <>
      <div className="stats-grid">
        <div><span className="stat__num">{stats.played}</span><span className="stat__label">Played</span></div>
        <div><span className="stat__num">{winPct}%</span><span className="stat__label">Win rate</span></div>
        <div><span className="stat__num">{stats.currentStreak}</span><span className="stat__label">Streak</span></div>
        <div><span className="stat__num">{stats.maxStreak}</span><span className="stat__label">Best</span></div>
      </div>
      <div className="dist">
        {stats.dist.map((n, i) => (
          <div className="dist__row" key={i}>
            <span>{i + 1}</span>
            <span className="dist__bar" style={{ width: `${8 + (n / maxDist) * 80}%` }}>{n}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ResultModal({
  round,
  daily,
  reveal,
  stats,
  isDaily,
  isRandom,
  kind,
  canShare,
  canArchive,
  onNewGame,
  onArchive,
  onClose,
}: {
  round: RoundState;
  daily: DailyInfo;
  reveal: RevealInfo | null;
  stats: Stats;
  isDaily: boolean;
  isRandom: boolean;
  kind: RoundKind;
  canShare: boolean;
  canArchive: boolean;
  onNewGame: () => void;
  onArchive: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const won = round.status === "won";
  const share = async () => {
    const text = buildShareText(daily.puzzleNumber, round.guesses, won, daily.ingredientCount);
    // The daily and leftover replays both carry an analytics id (only the share
    // button's kinds reach here — random has no share button, preview no id).
    if (round.analyticsId) {
      beaconShare({ roundId: round.analyticsId, puzzleNumber: daily.puzzleNumber, date: round.date, kind });
    }
    // On mobile (and any browser with the Web Share API) bring up the native
    // share sheet so results can go straight to other apps. Fall back to the
    // clipboard when it's unavailable.
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        // User dismissed the share sheet — leave the button as-is, don't copy.
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Any other failure: fall through to the clipboard path below.
      }
    }
    navigator.clipboard.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };
  return (
    <Modal onClose={onClose} receipt>
      <div className="receipt__head">
        <p className="receipt__title">Lunch Special - your check</p>
        <p className="receipt__verdict">{won ? "On the house!" : "Better luck tomorrow"}</p>
      </div>
      {reveal && (
        <>
          <p className="receipt__dish">{reveal.name}</p>
          <p className="receipt__facts">
            {reveal.country} · {reveal.course} · served {reveal.temperature} · {reveal.protein}
          </p>
          {reveal.ingredients.length > 0 && (
            <p className="receipt__ingredients">{reveal.ingredients.join(" · ")}</p>
          )}
          <div className="receipt__story">
            {reveal.clues.slice(1).map((clue) => (
              <p key={clue}>{clue}</p>
            ))}
          </div>
        </>
      )}
      {canShare && (
        <button className="share-btn share-btn--primary" onClick={share}>
          {copied ? "Copied to clipboard!" : "📋 Share your order"}
        </button>
      )}
      {(isRandom || canArchive) && (
        <div className="replay-actions">
          {isRandom && (
            <button className="replay-btn" onClick={onNewGame}>
              🎲 New random dish
            </button>
          )}
          {canArchive && (
            <button className="replay-btn" onClick={onArchive}>
              📅 Play another day
            </button>
          )}
        </div>
      )}
      {isDaily && (
        <>
          <StatsPanel stats={stats} />
          <Countdown />
        </>
      )}
    </Modal>
  );
}

export default function GamePage() {
  const search = useMemo(() => new URLSearchParams(window.location.search), []);
  const preview = useMemo(() => search.get("preview") ?? undefined, [search]);
  const isPreview = preview !== undefined;
  const today = useMemo(() => localToday(), []);

  // Archive: ?date=<past puzzle> replays an earlier Special (saved on its own,
  // separate from the daily streak). Only genuine past puzzle dates qualify.
  const archiveDateParam = useMemo(() => search.get("date") ?? undefined, [search]);
  const isArchive = !isPreview && !!archiveDateParam && isPastPuzzleDate(archiveDateParam, today);

  // Random recipe ("chef's choice"): ?random serves a random dish, nothing
  // saved. Available to everyone. Dev keeps the legacy /play and ?freeplay
  // entrances too.
  const isRandom = useMemo(() => {
    if (isPreview || isArchive) return false;
    if (search.has("random")) return true;
    if (!import.meta.env.DEV) return false;
    return window.location.pathname.startsWith("/play") || search.has("freeplay");
  }, [isPreview, isArchive, search]);

  const isDaily = !isPreview && !isArchive && !isRandom;
  const date = isArchive ? (archiveDateParam as string) : today;

  // The kind of round for analytics (preview is never tracked). Daily = Today's
  // Special, archive = a Leftover, random = a Chef's Special.
  const analyticsKind: RoundKind = isArchive ? "leftover" : isRandom ? "random" : "daily";

  // A random round is keyed by a random seed; a new seed = a new random dish.
  const [seed, setSeed] = useState(() => newSeed());
  const random = isRandom ? seed : undefined;
  // Preview and random are throwaway: no localStorage, stats, or analytics.
  const ephemeral = isPreview || isRandom;

  const [dishes, setDishes] = useState<DishSummary[]>([]);
  const [daily, setDaily] = useState<DailyInfo | null>(null);
  const [round, setRound] = useState<RoundState>(() =>
    isDaily ? loadRound(date) : isArchive ? loadArchiveRound(date) : emptyRound(date),
  );
  const [reveal, setReveal] = useState<RevealInfo | null>(null);
  const [stats, setStats] = useState<Stats>(() => loadStats());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The dish just ordered, shown as an optimistic row while the kitchen replies.
  const [pending, setPending] = useState<DishSummary | null>(null);
  const [showHowTo, setShowHowTo] = useState(() => !hasSeenHowTo());
  const [showStats, setShowStats] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  // Persist a round to the right place: daily → today's slot; archive → its
  // dated slot; preview/random → nowhere.
  const persist = useCallback(
    (next: RoundState) => {
      if (isDaily) saveRound(next);
      else if (isArchive) saveArchiveRound(next);
    },
    [isDaily, isArchive],
  );

  // Whether today's daily is finished — the archive unlocks only after that.
  const dailyStatus: GameStatus = useMemo(
    () => (isDaily ? round.status : loadRound(today).status),
    [isDaily, round.status, today],
  );
  const dailyDone = dailyStatus !== "playing";
  const canArchive = !isPreview && (dailyDone || isArchive || isRandom);

  // Navigation between modes is URL-driven (the app has no router).
  const goToday = useCallback(() => window.location.assign("/"), []);
  const goRandom = useCallback(() => window.location.assign("/?random"), []);
  const openArchiveDate = useCallback(
    (d: string) => window.location.assign(d === today ? "/" : `/?date=${d}`),
    [today],
  );

  // Start a fresh random round on a new random dish (no reload).
  const newGame = useCallback(() => {
    setSeed(newSeed());
    setRound(emptyRound(date));
    setReveal(null);
    setError(null);
    setShowResult(false);
    setDaily(null); // triggers a reload below with the new seed
  }, [date]);

  useEffect(() => {
    Promise.all([fetchDishes(), fetchDaily(date, preview, random)])
      .then(([dishList, dailyInfo]) => {
        setDishes(dishList);
        setDaily(dailyInfo);
      })
      .catch((e: Error) => setError(e.message));
  }, [date, preview, random]);

  // A finished round (including one restored from localStorage) needs the reveal.
  useEffect(() => {
    if (round.status !== "playing" && !reveal) {
      fetchReveal(date, preview, random).then(setReveal).catch(() => {});
      setShowResult(true);
    }
  }, [round.status, reveal, date, preview, random]);

  // Assign an anonymous analytics id once per round so start/complete/share
  // beacons can be linked. Every tracked kind gets one — daily, leftover, and
  // chef's special — but preview (admin test play) never does. The "start"
  // beacon itself doesn't fire here — merely opening the page (or closing the
  // how-to modal) isn't a started game. It fires on the first guess (see
  // submitGuess). A new random seed makes a fresh round, hence a fresh id.
  useEffect(() => {
    if (isPreview || !daily || round.analyticsId) return;
    const started = { ...round, analyticsId: newAnalyticsId() };
    setRound(started);
    // Persist the id where the round lives (daily/archive); random keeps it in
    // memory only, which is enough to link its own beacons this session.
    persist(started);
    // Intentionally keyed on round load — reads the round as it stands when the puzzle resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily, isPreview]);

  // Ticket animation is delayed until the guess row's drop finishes; its sound
  // must wait the same amount so it lands with the print, not the drop. Keep in
  // sync with the ticket `animation-delay` in game.css.
  const TICKET_STAGGER_MS = 400;

  const submitGuess = useCallback(
    async (dish: DishSummary) => {
      if (!daily || busy || round.status !== "playing") return;
      setBusy(true);
      setError(null);
      // Drop the guess row in right away (and sound the order) so the animation
      // never waits on the request; the feedback fills the same row when it lands.
      setPending(dish);
      playSfx("guess-submit");
      try {
        const guessNumber = round.guesses.length + 1;
        const feedback = await postGuess({ date, dishId: dish.id, guessNumber, preview, random });
        const next: RoundState = {
          ...round,
          guesses: [...round.guesses, feedback],
          clues: feedback.clue ? [...round.clues, feedback.clue] : round.clues,
          status: feedback.correct ? "won" : guessNumber >= MAX_GUESSES ? "lost" : "playing",
        };
        setRound(next);
        setPending(null);
        // The winning bell dings with the correct row; the clue's printer sound
        // waits for the ticket's staggered print (see TICKET_STAGGER_MS).
        if (feedback.correct) playSfx("guess-correct");
        if (feedback.clue) setTimeout(() => playSfx("ticket-print"), TICKET_STAGGER_MS);
        // Daily + leftover persist to localStorage; preview/random don't.
        if (!ephemeral) persist(next);
        // Every kind but preview counts toward analytics (daily, leftover, chef).
        if (!isPreview) {
          const roundId = next.analyticsId ?? newAnalyticsId();
          // A game counts as "started" on the first submitted guess — not on
          // page open. (GitHub #27.)
          if (guessNumber === 1) {
            beaconStart({ roundId, puzzleNumber: daily.puzzleNumber, date, kind: analyticsKind });
          }
          if (next.status !== "playing") {
            // Lifetime player stats + streak stay daily-only (Wordle model).
            if (isDaily) setStats(recordResult(date, next.status === "won", next.guesses.length));
            beaconComplete({
              roundId,
              puzzleNumber: daily.puzzleNumber,
              date,
              kind: analyticsKind,
              guesses: next.guesses.length,
              solved: next.status === "won",
            });
          }
        }
      } catch (e) {
        setError((e as Error).message);
        setPending(null); // roll the optimistic row back off the board
      } finally {
        setBusy(false);
      }
    },
    [daily, busy, round, date, preview, random, ephemeral, isPreview, isDaily, analyticsKind, persist],
  );

  const guessedIds = useMemo(() => new Set(round.guesses.map((g) => g.dish.id)), [round.guesses]);
  const remaining = MAX_GUESSES - round.guesses.length;

  return (
    <div className="scene">
      <header className="marquee">
        <h1 className="marquee__script">Lunch Special</h1>
        <p className="marquee__sub">The daily dish guessing game</p>
      </header>

      <main className="menu-card">
        {isPreview && <p className="preview-banner">Admin test play — nothing is saved</p>}
        {isArchive && (
          <div className="archive-bar">
            <span className="archive-bar__tag">📅 From the archive</span>
            <button className="archive-bar__btn" onClick={goToday}>Back to today</button>
          </div>
        )}
        {isRandom && (
          <div className="freeplay-bar">
            <span className="freeplay-bar__tag">🎲 Random recipe — nothing saved</span>
            <button className="freeplay-bar__btn" onClick={newGame}>New random dish</button>
          </div>
        )}
        <div className="menu-card__header">
          <h2 className="menu-card__title">{isArchive ? "From the Archive" : "Today's Menu"}</h2>
          <p className="menu-card__meta">
            {daily && !ephemeral ? <>Special No. {daily.puzzleNumber} — </> : null}
            {dateLabel(date)}
          </p>
          <div className="menu-card__toolbar">
            <button className="icon-btn" onClick={() => setShowHowTo(true)}>How to play</button>
            <button className="icon-btn" onClick={() => setShowStats(true)}>My stats</button>
            {canArchive && (
              <button className="icon-btn" onClick={() => setShowArchive(true)}>Menu archive</button>
            )}
            {round.status !== "playing" && (
              <button className="icon-btn" onClick={() => setShowResult(true)}>Your check</button>
            )}
          </div>
        </div>

        <div className="special-line">
          <img src={clocheUrl} alt="" aria-hidden="true" />
          <div className="special-line__body">
            <p className="special-line__label">
              <span>{isRandom ? "Chef's choice" : "Daily Special"}</span>
              <span className="leader" aria-hidden="true" />
              <span className="special-line__price">mp</span>
            </p>
            <p className="special-line__hint">
              {daily ? <>A mystery dish with <strong>{daily.ingredientCount} ingredients</strong>. What'll it be?</> : "Firing up the grill…"}
            </p>
          </div>
        </div>

        {round.status === "playing" && (
          <>
            <GuessInput dishes={dishes} excludeIds={guessedIds} disabled={!daily || busy} onGuess={submitGuess} />
            <p className="tally">
              {"•".repeat(remaining)}
              {"◦".repeat(MAX_GUESSES - remaining)} {remaining} {remaining === 1 ? "guess" : "guesses"} left
            </p>
          </>
        )}

        {error && <p className="error-note">{error}</p>}

        <div className="guesses">
          {/* One flat, keyed list so the optimistic row and its filled-in
              replacement share a key (the dish id) and React reuses the same
              DOM node — the drop-in animation plays once, not again on reply. */}
          {[
            ...(pending
              ? [<GuessRow key={pending.id} dish={pending} ingredientCount={daily?.ingredientCount ?? 0} />]
              : []),
            ...[...round.guesses]
              .reverse()
              .map((g) => <GuessRow key={g.dish.id} guess={g} ingredientCount={daily?.ingredientCount ?? 0} />),
          ]}
        </div>

        {round.clues.length > 0 && (
          <div className="tickets">
            {[...round.clues].reverse().map((c) => (
              <ClueTicket key={c.index} index={c.index} text={c.text} />
            ))}
          </div>
        )}

        <footer className="menu-card__thanks">
          <p className="menu-card__thanks-script">Best food in town!</p>
          <p className="menu-card__thanks-fine">No substitutions on the Special · Ask about our pie</p>
        </footer>
      </main>

      <p className="footer-note">Created by Jacob Poteet</p>

      {showHowTo && (
        <HowToModal
          onClose={() => {
            setShowHowTo(false);
            markHowToSeen();
          }}
        />
      )}
      {showStats && (
        <Modal onClose={() => setShowStats(false)}>
          <h2 className="receipt__title" style={{ textAlign: "center" }}>My stats</h2>
          <StatsPanel stats={stats} />
        </Modal>
      )}
      {showArchive && (
        <ArchiveModal
          today={today}
          todayStatus={dailyStatus}
          onPick={openArchiveDate}
          onRandom={goRandom}
          onClose={() => setShowArchive(false)}
        />
      )}
      {showResult && daily && round.status !== "playing" && (
        <ResultModal
          round={round}
          daily={daily}
          reveal={reveal}
          stats={stats}
          isDaily={isDaily}
          isRandom={isRandom}
          kind={analyticsKind}
          canShare={isDaily || isArchive}
          canArchive={canArchive}
          onNewGame={newGame}
          onArchive={() => {
            setShowResult(false);
            setShowArchive(true);
          }}
          onClose={() => setShowResult(false)}
        />
      )}
    </div>
  );
}
