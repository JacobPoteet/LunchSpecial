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
import type { DailyInfo, DishSummary, RevealInfo } from "../../shared/types";
import { MAX_GUESSES } from "../../shared/types";
import { ClueTicket, Countdown, GuessInput, GuessRow, Modal } from "./components";
import { buildShareText } from "./share";
import {
  emptyRound,
  hasSeenHowTo,
  loadRound,
  loadStats,
  markHowToSeen,
  recordResult,
  saveRound,
  type RoundState,
  type Stats,
} from "./storage";
import clocheUrl from "../assets/art/ai-cloche.svg";

function HowToModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div className="howto">
        <h2>How to play</h2>
        <p>
          Every day this diner runs one <strong>Special</strong> — a famous dish from somewhere in the world. You have{" "}
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
          After each wrong order, the kitchen slips you a <strong>clue ticket</strong> — country of origin, history, the
          moment that made the dish famous. Five clues in total. Good luck, hon.
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
  isPreview,
  onClose,
}: {
  round: RoundState;
  daily: DailyInfo;
  reveal: RevealInfo | null;
  stats: Stats;
  isPreview: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const won = round.status === "won";
  const share = async () => {
    const text = buildShareText(daily.puzzleNumber, round.guesses, won, daily.ingredientCount);
    if (!isPreview && round.analyticsId) {
      beaconShare({ roundId: round.analyticsId, puzzleNumber: daily.puzzleNumber, date: round.date });
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
        <p className="receipt__title">Lunch Special — your check</p>
        <p className="receipt__verdict">{won ? "On the house!" : "Better luck tomorrow"}</p>
      </div>
      {reveal && (
        <>
          <p className="receipt__dish">{reveal.name}</p>
          <p className="receipt__facts">
            {reveal.country} · {reveal.course} · served {reveal.temperature} · {reveal.protein}
          </p>
          <div className="receipt__story">
            {reveal.clues.slice(1).map((clue) => (
              <p key={clue}>{clue}</p>
            ))}
          </div>
        </>
      )}
      {!isPreview && (
        <>
          <button className="share-btn" onClick={share}>
            {copied ? "Copied to clipboard!" : "Share your order"}
          </button>
          <StatsPanel stats={stats} />
          <Countdown />
        </>
      )}
    </Modal>
  );
}

export default function GamePage() {
  const isPreview = useMemo(() => new URLSearchParams(window.location.search).has("preview"), []);
  const preview = useMemo(() => new URLSearchParams(window.location.search).get("preview") ?? undefined, []);
  const date = useMemo(() => localToday(), []);

  const [dishes, setDishes] = useState<DishSummary[]>([]);
  const [daily, setDaily] = useState<DailyInfo | null>(null);
  const [round, setRound] = useState<RoundState>(() => (isPreview ? emptyRound(date) : loadRound(date)));
  const [reveal, setReveal] = useState<RevealInfo | null>(null);
  const [stats, setStats] = useState<Stats>(() => loadStats());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHowTo, setShowHowTo] = useState(() => !hasSeenHowTo());
  const [showStats, setShowStats] = useState(false);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    Promise.all([fetchDishes(), fetchDaily(date, preview)])
      .then(([dishList, dailyInfo]) => {
        setDishes(dishList);
        setDaily(dailyInfo);
      })
      .catch((e: Error) => setError(e.message));
  }, [date, preview]);

  // A finished round (including one restored from localStorage) needs the reveal.
  useEffect(() => {
    if (round.status !== "playing" && !reveal) {
      fetchReveal(date, preview).then(setReveal).catch(() => {});
      setShowResult(true);
    }
  }, [round.status, reveal, date, preview]);

  // Analytics "start": once per puzzle, when the board first opens. Fires only for
  // a fresh round; a mid-play round from before analytics shipped just adopts an id.
  useEffect(() => {
    if (isPreview || !daily || round.analyticsId) return;
    const started = { ...round, analyticsId: newAnalyticsId() };
    setRound(started);
    saveRound(started);
    if (round.status === "playing" && round.guesses.length === 0) {
      beaconStart({ roundId: started.analyticsId!, puzzleNumber: daily.puzzleNumber, date });
    }
    // Intentionally keyed on daily load — reads the round as it stands when the puzzle resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily, isPreview]);

  const submitGuess = useCallback(
    async (dish: DishSummary) => {
      if (!daily || busy || round.status !== "playing") return;
      setBusy(true);
      setError(null);
      try {
        const guessNumber = round.guesses.length + 1;
        const feedback = await postGuess({ date, dishId: dish.id, guessNumber, preview });
        const next: RoundState = {
          ...round,
          guesses: [...round.guesses, feedback],
          clues: feedback.clue ? [...round.clues, feedback.clue] : round.clues,
          status: feedback.correct ? "won" : guessNumber >= MAX_GUESSES ? "lost" : "playing",
        };
        setRound(next);
        if (!isPreview) {
          saveRound(next);
          if (next.status !== "playing") {
            setStats(recordResult(date, next.status === "won", next.guesses.length));
            const roundId = next.analyticsId ?? newAnalyticsId();
            beaconComplete({
              roundId,
              puzzleNumber: daily.puzzleNumber,
              date,
              guesses: next.guesses.length,
              solved: next.status === "won",
            });
          }
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [daily, busy, round, date, preview, isPreview],
  );

  const guessedIds = useMemo(() => new Set(round.guesses.map((g) => g.dish.id)), [round.guesses]);
  const remaining = MAX_GUESSES - round.guesses.length;
  const dateLabel = useMemo(
    () =>
      new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    [date],
  );

  return (
    <div className="scene">
      <header className="marquee">
        <h1 className="marquee__script">Lunch Special</h1>
        <p className="marquee__sub">The daily dish guessing game</p>
      </header>

      <main className="menu-card">
        {isPreview && <p className="preview-banner">Admin test play — nothing is saved</p>}
        <div className="menu-card__header">
          <h2 className="menu-card__title">Today's Menu</h2>
          <p className="menu-card__meta">
            {daily && !isPreview ? <>Special No. {daily.puzzleNumber} — </> : null}
            {dateLabel}
          </p>
          <div className="menu-card__toolbar">
            <button className="icon-btn" onClick={() => setShowHowTo(true)}>How to play</button>
            <button className="icon-btn" onClick={() => setShowStats(true)}>My stats</button>
            {round.status !== "playing" && (
              <button className="icon-btn" onClick={() => setShowResult(true)}>Your check</button>
            )}
          </div>
        </div>

        <div className="special-line">
          <img src={clocheUrl} alt="" aria-hidden="true" />
          <div>
            <p className="special-line__label">Special of the day</p>
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
          {[...round.guesses].reverse().map((g) => (
            <GuessRow key={g.dish.id} guess={g} ingredientCount={daily?.ingredientCount ?? 0} />
          ))}
        </div>

        {round.clues.length > 0 && (
          <div className="tickets">
            {[...round.clues].reverse().map((c) => (
              <ClueTicket key={c.index} index={c.index} text={c.text} />
            ))}
          </div>
        )}
      </main>

      <p className="footer-note">A new Special every midnight.</p>

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
      {showResult && daily && round.status !== "playing" && (
        <ResultModal
          round={round}
          daily={daily}
          reveal={reveal}
          stats={stats}
          isPreview={isPreview}
          onClose={() => setShowResult(false)}
        />
      )}
    </div>
  );
}
