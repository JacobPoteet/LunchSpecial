import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  submitDishRequest,
} from "../api";
import type { DailyInfo, DishSummary, RevealInfo, RoundKind } from "../../shared/types";
import { DISH_REQUEST_LIMITS, MAX_GUESSES } from "../../shared/types";
import { ClueTicket, Countdown, GuessInput, GuessRow, Modal } from "./components";
import ArchiveModal from "./ArchiveModal";
import { dateLabel, isPastPuzzleDate } from "./archive";
import { currentSurface, surfaceUrl } from "../discord/bootstrap";
import { playSfx } from "./sfx";
import { buildShareText, copyShareText, SHARE_URL } from "./share";
import {
  emptyRound,
  getPlayerId,
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

// Web vs Discord Activity — stable for the page's lifetime, so resolve it once
// and stamp it on every analytics beacon.
const SURFACE = currentSurface();

/** A fresh random seed for a random recipe; the server maps it to a random dish. */
function newSeed(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// The check doesn't slam into view the moment a round ends — Wordle's trick.
// The board gets a beat to land first (the winning row's drop, the bell) with a
// toast over it, then the receipt prints. Without the toast the pause just
// reads as lag, so the two ship together. Keep WIN in sync with the
// `win-toast` animation's total run time in game.css.
const WIN_CHECK_DELAY_MS = 1700;
const LOSS_CHECK_DELAY_MS = 800;

/** Wordle's "Genius / Magnificent / …", in diner. Indexed by guess count. */
const WIN_TOASTS = [
  "Chef's kiss!",
  "Order up!",
  "Nailed it, hon!",
  "Nice work!",
  "Just in time!",
  "Phew — saved it!",
];

function WinToast({ text }: { text: string }) {
  return (
    <div className="win-toast" role="status" aria-live="polite">
      <span className="win-toast__bell" aria-hidden="true">
        🛎️
      </span>
      {text}
    </div>
  );
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

/**
 * `highlight` is the guess count that just won, so its row lights up the way
 * Wordle marks the bar you landed on. Omitted outside a fresh win (the "My
 * stats" modal, or a loss), where no single row is "yours".
 */
function StatsPanel({ stats, highlight }: { stats: Stats; highlight?: number }) {
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
          <div
            className={highlight === i + 1 ? "dist__row dist__row--current" : "dist__row"}
            key={i}
            // Drives both the bar's grown width and its stagger delay in CSS.
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

/**
 * The clues, collapsed. The check opens compact, so the players who want the
 * whole trail can open it without everyone else scrolling past it. Lists all
 * five, including the one repeated above as the definition — the numbering has
 * to run 1 -> 5 or a panel labelled "all 5 clues" looks like it dropped one.
 */
function StoryDetails({ clues }: { clues: string[] }) {
  const [open, setOpen] = useState(false);
  if (clues.length === 0) return null;
  return (
    <div className="story">
      <button
        className="story__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="receipt-story"
      >
        <span>🔍 {open ? "Hide the clues" : `All ${clues.length} clues`}</span>
        <span className={open ? "story__chevron story__chevron--open" : "story__chevron"} aria-hidden="true">
          ▾
        </span>
      </button>
      <div className={open ? "story__panel story__panel--open" : "story__panel"} id="receipt-story">
        <div className="story__inner">
          <ol className="story__list">
            {clues.map((clue, i) => (
              <li className="story__item" key={clue} style={{ "--i": i } as React.CSSProperties}>
                <span className="story__num">{i + 1}</span>
                <span className="story__text">{clue}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

/**
 * "Suggest a dish for the menu" — shown on the receipt after a round. Collapsed
 * to a single line until the player opens it; on submit it POSTs an anonymous
 * request to the admin inbox (surface + device id, same model as analytics).
 */
function RequestDishForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  if (status === "done") {
    return <p className="dish-request__thanks">🧑‍🍳 Thanks, hon — the cook's got your request!</p>;
  }

  if (!open) {
    return (
      <button className="dish-request__toggle" onClick={() => setOpen(true)}>
        🍽️ Suggest a dish for the menu
      </button>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || status === "sending") return;
    setStatus("sending");
    try {
      await submitDishRequest({
        name: name.trim(),
        country: country.trim() || undefined,
        note: note.trim() || undefined,
        surface: SURFACE,
        playerId: getPlayerId(),
      });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  return (
    <form className="dish-request" onSubmit={submit}>
      <p className="dish-request__title">Suggest a dish for the menu</p>
      <input
        className="dish-request__input"
        placeholder="Dish name (required)"
        value={name}
        maxLength={DISH_REQUEST_LIMITS.name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <input
        className="dish-request__input"
        placeholder="Country of origin (optional)"
        value={country}
        maxLength={DISH_REQUEST_LIMITS.country}
        onChange={(e) => setCountry(e.target.value)}
      />
      <textarea
        className="dish-request__input"
        placeholder="Anything else? (optional)"
        value={note}
        maxLength={DISH_REQUEST_LIMITS.note}
        rows={2}
        onChange={(e) => setNote(e.target.value)}
      />
      {status === "error" && <p className="dish-request__error">Couldn't send that — try again.</p>}
      <div className="dish-request__actions">
        <button className="replay-btn" type="submit" disabled={!name.trim() || status === "sending"}>
          {status === "sending" ? "Sending…" : "Send to the kitchen"}
        </button>
        <button className="dish-request__cancel" type="button" onClick={() => setOpen(false)}>
          Never mind
        </button>
      </div>
    </form>
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
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">("idle");
  const won = round.status === "won";
  const share = async () => {
    setShareState("idle");
    const text = buildShareText(daily.puzzleNumber, round.guesses, won, daily.ingredientCount);
    // The daily and leftover replays both carry an analytics id (only the share
    // button's kinds reach here — random has no share button, preview no id).
    if (round.analyticsId) {
      beaconShare({ roundId: round.analyticsId, puzzleNumber: daily.puzzleNumber, date: round.date, kind, surface: SURFACE });
    }
    // Inside the Activity, copy the score card and let the player paste it into
    // the channel themselves. The Web Share sheet doesn't exist in the iframe,
    // and the SDK's own share modal (`shareLink`) kept erroring out, so this is
    // the path that reliably works today — a Discord-native share is a later
    // revisit, see CLAUDE.md.
    if (SURFACE === "discord") {
      setShareState((await copyShareText(`${text}\n${SHARE_URL}`)) ? "copied" : "failed");
      return;
    }
    // On mobile (and any browser with the Web Share API) bring up the native
    // share sheet so results can go straight to other apps. Fall back to the
    // clipboard when it's unavailable.
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text, url: SHARE_URL });
        return;
      } catch (err) {
        // User dismissed the share sheet — leave the button as-is, don't copy.
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Any other failure: fall through to the clipboard path below.
      }
    }
    setShareState((await copyShareText(`${text}\n${SHARE_URL}`)) ? "copied" : "failed");
  };
  // Clue 5 is the near-giveaway — everything about the dish but its name — so it
  // doubles as a one-line definition under the answer. The collapsed story below
  // still lists all five in order: a panel that stopped at 4 read as a bug, and
  // seeing the trail run 1 -> 5 is the part players actually come back for.
  const definition = reveal?.clues.at(-1);
  // Actions live in the card's pinned footer so they stay on screen no matter
  // how far the body scrolls. Countdown + share share one row (Wordle's shape).
  const actions = (
    <>
      {(isDaily || canShare) && (
        <div className="check-actions">
          {isDaily && <Countdown compact />}
          {canShare && (
            <button className="share-btn share-btn--primary" onClick={share}>
              {shareState === "copied"
                ? SURFACE === "discord"
                  ? "Copied — paste it in chat!"
                  : "Copied!"
                : shareState === "failed"
                  ? "Tap to retry"
                  : SURFACE === "discord"
                    ? "📋 Copy results"
                    : "📋 Share"}
            </button>
          )}
        </div>
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
              📅 Play again
            </button>
          )}
        </div>
      )}
    </>
  );
  return (
    <Modal onClose={onClose} receipt footer={actions}>
      <div className="receipt__head">
        <p className="receipt__title">Lunch Special - your check</p>
        <p className="receipt__verdict">{won ? "On the house!" : "Better luck tomorrow"}</p>
      </div>
      {reveal && (
        <>
          <p className="receipt__dish">{reveal.name}</p>
          {/* On a win the guess row behind the modal already shows these as
              green tiles and matched chips, so repeating them here is ~90px of
              pure duplication. On a loss they're the payoff. */}
          {!won && (
            <>
              <p className="receipt__facts">
                {reveal.country} · {reveal.course} · served {reveal.temperature} · {reveal.protein}
              </p>
              {reveal.ingredients.length > 0 && (
                <p className="receipt__ingredients">{reveal.ingredients.join(" · ")}</p>
              )}
            </>
          )}
          {definition && <p className="receipt__definition">{definition}</p>}
          <StoryDetails clues={reveal.clues} />
        </>
      )}
      {isDaily && <StatsPanel stats={stats} highlight={won ? round.guesses.length : undefined} />}
      <RequestDishForm />
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
  // Special, archive = a Leftover, random = a Chef's Choice.
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
  // Win banner shown during the beat before the check opens.
  const [toast, setToast] = useState<string | null>(null);
  // Whether the check has already been auto-opened for this round, so closing it
  // doesn't make it spring back.
  const [checkOpened, setCheckOpened] = useState(false);
  // A round that was already finished when the page loaded (restored from
  // localStorage, or an archive day you've played) was celebrated on the day it
  // was played — reopening it should be instant, not a victory lap.
  const restoredFinished = useRef(round.status !== "playing");

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

  // Navigation between modes is URL-driven (the app has no router). Every hop
  // goes through surfaceUrl() so a Discord Activity keeps its iframe params —
  // otherwise the new URL loses `frame_id` and the round logs as a web play.
  const goToday = useCallback(() => window.location.assign(surfaceUrl("/")), []);
  const goRandom = useCallback(() => window.location.assign(surfaceUrl("/?random")), []);
  const openArchiveDate = useCallback(
    (d: string) => window.location.assign(surfaceUrl(d === today ? "/" : `/?date=${d}`)),
    [today],
  );

  // Start a fresh random round on a new random dish (no reload).
  const newGame = useCallback(() => {
    setSeed(newSeed());
    setRound(emptyRound(date));
    setReveal(null);
    setError(null);
    setShowResult(false);
    // The next round is played fresh in this session, so it earns the full
    // toast-then-check treatment again.
    setCheckOpened(false);
    setToast(null);
    restoredFinished.current = false;
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
  // Fetched the moment the round ends, so it's already in hand by the time the
  // delayed check below actually opens.
  useEffect(() => {
    if (round.status !== "playing" && !reveal) {
      fetchReveal(date, preview, random).then(setReveal).catch(() => {});
    }
  }, [round.status, reveal, date, preview, random]);

  // Open the check once per round, after a beat so the finished board is the
  // first thing you see. A win holds a toast through the pause; a loss just
  // gets enough time for the last guess row to land.
  useEffect(() => {
    if (round.status === "playing" || checkOpened) return;
    if (restoredFinished.current) {
      setCheckOpened(true);
      setShowResult(true);
      return;
    }
    const won = round.status === "won";
    if (won) setToast(WIN_TOASTS[round.guesses.length - 1] ?? WIN_TOASTS[0]);
    const t = setTimeout(
      () => {
        setToast(null);
        setCheckOpened(true);
        setShowResult(true);
      },
      won ? WIN_CHECK_DELAY_MS : LOSS_CHECK_DELAY_MS,
    );
    return () => clearTimeout(t);
  }, [round.status, round.guesses.length, checkOpened]);

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
            beaconStart({
              roundId,
              puzzleNumber: daily.puzzleNumber,
              date,
              kind: analyticsKind,
              surface: SURFACE,
              playerId: getPlayerId(),
              seed: random,
            });
          }
          if (next.status !== "playing") {
            // Lifetime player stats + streak stay daily-only (Wordle model).
            if (isDaily) setStats(recordResult(date, next.status === "won", next.guesses.length));
            beaconComplete({
              roundId,
              puzzleNumber: daily.puzzleNumber,
              date,
              kind: analyticsKind,
              surface: SURFACE,
              guesses: next.guesses.length,
              solved: next.status === "won",
              seed: random,
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
      {toast && <WinToast text={toast} />}
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

      <footer className="footer-note">
        <p>Created by Jacob Poteet</p>
        <p className="footer-note__links">
          <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/press">Press</a>
        </p>
      </footer>

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
