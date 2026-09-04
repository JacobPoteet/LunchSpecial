import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  beaconComplete,
  beaconSeated,
  beaconShare,
  beaconStart,
  fetchAnnouncements,
  fetchDaily,
  fetchDishes,
  fetchReveal,
  localToday,
  markAnnouncementSeen,
  newAnalyticsId,
  postGuess,
  submitDishRequest,
} from "../api";
import type { Announcement, DailyInfo, DishSummary, RevealInfo, RoundKind, Surface } from "../../shared/types";
import { DISH_REQUEST_LIMITS, MAX_GUESSES } from "../../shared/types";
import { ClueTicket, Countdown, GuessInput, GuessRow, Modal, useNewDayAvailable } from "./components";
import AnnouncementModal from "./AnnouncementModal";
import ArchiveModal from "./ArchiveModal";
import { BuildTag } from "./BuildTag";
import { dateLabel, isPastPuzzleDate } from "./archive";
import { currentNight, useBarInvite, type BarInvite } from "./night";
import { useCheckOpening } from "./roundLifecycle";
import { visitSource } from "./attribution";
import { currentSurface, surfaceUrl } from "../discord/bootstrap";
import { setPresence } from "../discord/presence";
import { publishProgress, resetProgress } from "../discord/progress";
import { canShareToChannel, shareToChannel } from "../discord/share";
import { canInvite, onParticipantCount, openInvite } from "../discord/social";
import { clueAnnouncement, guessAnnouncement } from "../../shared/announce";
import { TICKET_MS } from "../../shared/audio";
import { buildPresence } from "../../shared/presence";
import { buildScorecard } from "../../shared/scorecard";
import { playGuessArc, playSfx, setupAudio } from "../audio";
import { SoundToggle } from "./SoundToggle";
import { buildShareText, canUseNativeShare, copyShareText, shareMessage } from "./share";
import {
  emptyRound,
  getPlayerId,
  hasSeenHowTo,
  isReturningPlayer,
  loadArchiveRound,
  loadRound,
  loadStats,
  markHowToSeen,
  nightRoundFinished,
  markSeated,
  recordResult,
  rememberAnnouncementSeen,
  saveArchiveRound,
  saveRound,
  seenAnnouncements,
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

/** Wordle's "Genius / Magnificent / …", in diner. Indexed by guess count. */
const WIN_TOASTS = [
  "Chef's kiss!",
  "Order up!",
  "Nailed it, hon!",
  "Nice work!",
  "Just in time!",
  "Phew — saved it!",
];

/**
 * How many *other* people are in this Discord Activity instance right now — 0
 * everywhere else, and 0 when it's just you.
 *
 * Subtracting yourself is the whole point: "1 person here" is a worse thing to
 * read than nothing at all, because it names an empty room. The count is the
 * only fact that leaves src/discord/social.ts; who those people are never does.
 */
function useCounterCompany(): number {
  const [count, setCount] = useState(0);
  useEffect(() => onParticipantCount(setCount), []);
  return Math.max(0, count - 1);
}

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
    <Modal onClose={onClose} label="How to play">
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
        {/* The mark leads, and the colour is named second. The board draws the
            same three glyphs on every tile, so a player who can't separate the
            green from the mustard still has something here that maps onto what
            they're looking at. */}
        <div className="legend">
          <span className="chip" style={{ background: "var(--hit)", color: "var(--on-hit)" }}>✓ match (green)</span>
          <span className="chip" style={{ background: "var(--near)" }}>~ close — same region (yellow)</span>
          <span className="chip" style={{ background: "var(--miss-soft)", color: "var(--ink-soft)" }}>
            × miss (gray)
          </span>
        </div>
        <p>
          After each wrong order, the kitchen slips you a <strong>clue ticket</strong> - where it's from, who made it,
          the one thing that could only be this dish. Five clues in total. Good luck, hon.
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

  // One accent, on the bar that is *yours* — the row `dist__row--current`
  // highlights after a fresh win. Sounding every bar as it grows would turn the
  // panel into a xylophone and say nothing; there's no highlight on the "My
  // stats" modal or after a loss, and correspondingly no sound.
  useEffect(() => {
    if (highlight === undefined) return;
    // Rides the stats grid's own entrance (0.48s) plus the bars' stagger.
    playSfx("stat-pop", { delayMs: 560 });
  }, [highlight]);

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
 * The credit a fan-submitted Special carries on the check. It sits directly on
 * top of the suggest form — not up by the dish name — because the two are one
 * argument (somebody typed this dish into that form, and here it is), and
 * because the check has to stay short enough to read on a phone: down here the
 * stamp doubles as the form's header instead of costing a separate band of
 * height above the fold.
 *
 * Unrotated on purpose. The tilt read as a sticker but forced extra vertical
 * padding to keep its corners off the neighbouring text, which is exactly the
 * height this modal can't spare.
 */
function FanStamp({ dishName }: { dishName: string }) {
  // Lands with `fan-stamp-press`, whose 0.5s delay in game.css is the beat the
  // receipt's own lines have finished rising on. Rare enough to be a treat and
  // cheap enough to be worth it — the whole reason it's a separate sound is
  // that a credited dish should feel like something happened.
  useEffect(() => {
    playSfx("fan-stamp", { delayMs: 500 });
  }, []);

  return (
    <div className="fan-stamp">
      <span className="fan-stamp__seal" aria-hidden="true">
        ★
      </span>
      <div>
        <p className="fan-stamp__title">Off a customer's ticket</p>
        <p className="fan-stamp__body">A regular asked for {dishName}. Yours could be next.</p>
      </div>
    </div>
  );
}

/**
 * "Suggest a dish for the menu" — shown on the receipt after a round. Collapsed
 * to a single line until the player opens it; on submit it POSTs an anonymous
 * request to the admin inbox (surface + device id, same model as analytics).
 *
 * `promoted` is set when the Special itself came from a request: the same
 * control, styled loud instead of quiet, because that's the one round where the
 * ask has just proved itself.
 */
function RequestDishForm({ promoted = false }: { promoted?: boolean }) {
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
      <button
        className={`dish-request__toggle${promoted ? " dish-request__toggle--promoted" : ""}`}
        onClick={() => setOpen(true)}
      >
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

/**
 * Shown in place of the board when the *initial* load fails — no dish list, no
 * puzzle, nothing to play. Distinct from the inline `error-note`, which is for a
 * single guess that didn't land while the game is otherwise fine: without this,
 * an outage renders as a working-looking search box that matches nothing, which
 * reads as "my dish isn't in the game" rather than "the site is down".
 */
function KitchenClosed({ detail, onRetry }: { detail: string | null; onRetry: () => void }) {
  useEffect(() => {
    playSfx("error");
  }, []);

  return (
    <div className="closed" role="alert">
      <p className="closed__sign">Sorry — we're closed</p>
      <p className="closed__body">
        The kitchen isn't answering, so today's Special is staying under the cloche. Check your connection and give the
        bell another ring.
      </p>
      {detail && <p className="closed__detail">{detail}</p>}
      <button className="replay-btn" onClick={() => { playSfx("ui-click"); onRetry(); }}>
        🛎️ Ring the bell again
      </button>
    </div>
  );
}

/**
 * The door to After Dark, on the check.
 *
 * Three rules it exists to obey, all of them about not shoving anyone through:
 *
 * 1. **It is never a fourth button in the replay row.** The check is the tallest
 *    card in the game at 375px and that row already holds up to three. This is
 *    its own band underneath, and it is quiet.
 * 2. **It fades in a beat after the check settles**, not with it. Someone
 *    reading their result should get to finish reading it; the animation's
 *    delay is what makes this an offer rather than an interruption.
 * 3. **It never navigates on its own.** Nothing about the bar happens until
 *    this is pressed.
 *
 * `soon` is deliberately not a button. There is nothing to press yet, and a
 * disabled control that becomes enabled in two hours is worse than a sentence.
 */
function BarBand({ invite, onEnter }: { invite: BarInvite; onEnter: () => void }) {
  if (invite === "none") return null;
  if (invite === "soon") {
    return (
      <p className="bar-band bar-band--soon">🍸 After Dark opens at 8, your time.</p>
    );
  }
  const settled = invite === "settled";
  return (
    <div className="bar-band">
      <button
        className="bar-band__btn"
        onClick={() => {
          playSfx("ui-click");
          onEnter();
        }}
      >
        <span className="bar-band__tag">🍸 {settled ? "Your tab is at the bar" : "The bar's open"}</span>
        <span className="bar-band__sub">
          {settled ? "Go back and take another look" : "One drink, four guesses, gone by morning"}
        </span>
      </button>
    </div>
  );
}

type ShareState = "idle" | "working" | "channel" | "sent" | "copied" | "failed";

/**
 * What the share button says.
 *
 * The idle label never names a destination, and that rule now holds on every
 * surface rather than only inside Discord, because which path runs is only
 * settled at click time everywhere. In the Activity, posting to the channel
 * rides on the authorization presence takes and a player who declined it gets
 * the clipboard; on the web, a phone gets the native share sheet and a desktop
 * gets the clipboard — see canUseNativeShare(). A button that promised one and
 * then quietly did the other would be lying about where the round went, so the
 * button offers to share and the *result* says where it ended up.
 */
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
      return "📤 Share";
  }
}

function ResultModal({
  round,
  daily,
  reveal,
  stats,
  asDaily,
  isRandom,
  kind,
  canShare,
  canArchive,
  barInvite,
  onEnterBar,
  onNewGame,
  onArchive,
  onClose,
}: {
  round: RoundState;
  daily: DailyInfo;
  reveal: RevealInfo | null;
  stats: Stats;
  /**
   * Wear the daily's finish: countdown, share button, stats panel. True for the
   * real daily and for the two rehearsal modes — an admin preview and a
   * playtest — which exist to try this screen before players reach it.
   */
  asDaily: boolean;
  isRandom: boolean;
  kind: RoundKind;
  canShare: boolean;
  canArchive: boolean;
  /** Whether, and how, to offer After Dark. Hidden outside the daily. */
  barInvite: BarInvite;
  onEnterBar: () => void;
  onNewGame: () => void;
  onArchive: () => void;
  onClose: () => void;
}) {
  const [shareState, setShareState] = useState<ShareState>("idle");
  // Resolved once as the check opens: off Discord, or in a DM where there's no
  // channel to invite anyone to, there's no button.
  const [showInvite] = useState(() => SURFACE === "discord" && canInvite());
  const won = round.status === "won";
  const share = async () => {
    setShareState("idle");
    const message = shareMessage(buildShareText(daily.puzzleNumber, round.guesses, won, daily.ingredientCount));
    // The daily and leftover replays both carry an analytics id; the test modes
    // (preview, playtest) never get one, so their share stays untracked.
    if (round.analyticsId) {
      beaconShare({ roundId: round.analyticsId, puzzleNumber: daily.puzzleNumber, date: round.date, kind, surface: SURFACE });
    }
    // Inside the Activity, put the check straight into the channel as an image.
    // The Web Share sheet doesn't exist in the iframe, so the fallback below is
    // the old behaviour — copy the grid and ask the player to paste it — which
    // is what every Discord player got before the share dialog existed. Trying
    // and failing therefore costs nothing.
    if (SURFACE === "discord") {
      if (canShareToChannel()) {
        setShareState("working");
        const card = buildScorecard(daily.puzzleNumber, round.guesses, won, daily.ingredientCount);
        if (await shareToChannel(card)) {
          setShareState("channel");
          return;
        }
      }
      setShareState((await copyShareText(message)) ? "copied" : "failed");
      return;
    }
    // On a phone or tablet, raise the native share sheet so the result can go
    // straight to a messaging app. Everywhere else — including the desktop
    // browsers that *have* `navigator.share` — the clipboard is the answer; see
    // canUseNativeShare(). The whole message travels in one field, never split
    // across `text` and `url`, because a target that reads only one of them
    // drops the grid and posts a bare link.
    if (canUseNativeShare(message)) {
      try {
        await navigator.share({ text: message });
        setShareState("sent");
        return;
      } catch (err) {
        // User dismissed the share sheet — leave the button as-is, don't copy.
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Any other failure: fall through to the clipboard path below.
      }
    }
    setShareState((await copyShareText(message)) ? "copied" : "failed");
  };
  // Clue 5 is the near-giveaway — everything about the dish but its name — so it
  // doubles as a one-line definition under the answer. The collapsed story below
  // still lists all five in order: a panel that stopped at 4 read as a bug, and
  // seeing the trail run 1 -> 5 is the part players actually come back for.
  const definition = reveal?.clues.at(-1);

  // Sounded off the resulting state rather than inside `share`, which has five
  // exits (channel, clipboard, native sheet, dismissal, failure) and would
  // otherwise need the same two lines in each. "idle" and "working" are
  // in-flight, and a dismissed native share sheet returns to idle — correctly
  // silent, since nothing was shared.
  useEffect(() => {
    if (shareState === "channel" || shareState === "sent" || shareState === "copied") playSfx("share-success");
    else if (shareState === "failed") playSfx("error");
  }, [shareState]);
  // Actions live in the card's pinned footer so they stay on screen no matter
  // how far the body scrolls. Countdown + share share one row (Wordle's shape).
  const actions = (
    <>
      {(asDaily || canShare) && (
        <div className="check-actions">
          {asDaily && <Countdown compact />}
          {canShare && (
            <button className="share-btn share-btn--primary" onClick={share} disabled={shareState === "working"}>
              {/* Keyed on the state so the label remounts and cross-fades
                  instead of hot-swapping text under the player's thumb. */}
              <span className="share-btn__label" key={shareState}>
                {shareLabel(shareState, SURFACE)}
              </span>
            </button>
          )}
        </div>
      )}
      {(isRandom || canArchive || showInvite) && (
        <div className="replay-actions">
          {isRandom && (
            <button className="replay-btn" onClick={() => { playSfx("ui-click"); onNewGame(); }}>
              🎲 New random dish
            </button>
          )}
          {canArchive && (
            <button className="replay-btn" onClick={() => { playSfx("ui-click"); onArchive(); }}>
              📅 Play again
            </button>
          )}
          {/* The check is where an invite belongs — Discord's own guidance is
              that it goes at the moment the experience wants company, not on
              the start screen where nobody has anything to invite anyone to
              yet. You've just finished; who else should be doing this? */}
          {showInvite && (
            <button className="replay-btn" onClick={openInvite}>
              🍽️ Invite the table
            </button>
          )}
        </div>
      )}
      <BarBand invite={barInvite} onEnter={onEnterBar} />
    </>
  );
  return (
    <Modal onClose={onClose} variant="receipt" footer={actions} label="Your check">
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
      {/* A rehearsal round (preview, playtest) shows the panel but hasn't been
          folded into it — the numbers are the ones you walked in with, since
          nothing was recorded. */}
      {asDaily && <StatsPanel stats={stats} highlight={won ? round.guesses.length : undefined} />}
      {reveal?.isFanSubmission && <FanStamp dishName={reveal.name} />}
      <RequestDishForm promoted={reveal?.isFanSubmission === true} />
    </Modal>
  );
}

export default function GamePage({ onEnterBar }: { onEnterBar: () => void }) {
  const search = useMemo(() => new URLSearchParams(window.location.search), []);
  const preview = useMemo(() => search.get("preview") ?? undefined, [search]);
  const isPreview = preview !== undefined;
  const today = useMemo(() => localToday(), []);

  // Archive: ?date=<past puzzle> replays an earlier Special (saved on its own,
  // separate from the daily streak). Only genuine past puzzle dates qualify.
  const archiveDateParam = useMemo(() => search.get("date") ?? undefined, [search]);

  // Playtest: ?special=<dish slug> pins the round to one named dish, so a
  // specific board can be replayed on demand (`npm run ramen`). A dev-only
  // entrance like /play, and the most throwaway mode there is — nothing saved,
  // nothing tracked, no puzzle number.
  const playtest = useMemo(() => {
    if (isPreview || !import.meta.env.DEV) return undefined;
    return search.get("special") ?? undefined;
  }, [isPreview, search]);

  const isArchive =
    !isPreview && !playtest && !!archiveDateParam && isPastPuzzleDate(archiveDateParam, today);

  // Random recipe ("chef's choice"): ?random serves a random dish, nothing
  // saved. Available to everyone. Dev keeps the legacy /play and ?freeplay
  // entrances too.
  const isRandom = useMemo(() => {
    if (isPreview || isArchive || playtest) return false;
    if (search.has("random")) return true;
    if (!import.meta.env.DEV) return false;
    return window.location.pathname.startsWith("/play") || search.has("freeplay");
  }, [isPreview, isArchive, playtest, search]);

  const isDaily = !isPreview && !isArchive && !isRandom && !playtest;
  const date = isArchive ? (archiveDateParam as string) : today;

  // The kind of round for analytics (preview is never tracked). Daily = Today's
  // Special, archive = a Leftover, random = a Chef's Choice.
  const analyticsKind: RoundKind = isArchive ? "leftover" : isRandom ? "random" : "daily";

  // A random round is keyed by a random seed; a new seed = a new random dish.
  const [seed, setSeed] = useState(() => newSeed());
  const random = isRandom ? seed : undefined;
  // Preview, random and playtest are throwaway: no localStorage or stats.
  const ephemeral = isPreview || isRandom || !!playtest;
  // Preview and playtest are test tools rather than games — they record no
  // analytics at all (a random round still does, as a chef's special).
  const tracked = !isPreview && !playtest;
  // Preview and playtest both exist to rehearse the real finish, so they're
  // *dressed* as the daily wherever that shows: puzzle number, countdown, share
  // button, stats panel. Only the banner up top gives either away. Underneath
  // they stay throwaway — nothing written, nothing counted. That dressing is the
  // point of the admin's test play: the check, the share and the stats panel are
  // the parts of the daily you'd most want to try before players do, and a
  // preview that couldn't reach them could only rehearse the board.
  const dressedAsDaily = isDaily || isPreview || !!playtest;

  const [dishes, setDishes] = useState<DishSummary[]>([]);
  const [daily, setDaily] = useState<DailyInfo | null>(null);
  const [round, setRound] = useState<RoundState>(() =>
    isDaily ? loadRound(date) : isArchive ? loadArchiveRound(date) : emptyRound(date),
  );
  const [reveal, setReveal] = useState<RevealInfo | null>(null);
  const [stats, setStats] = useState<Stats>(() => loadStats());
  const [error, setError] = useState<string | null>(null);
  // Initial-load failure, kept apart from `error` (a single guess that didn't
  // land): only this one replaces the board with the closed sign.
  const [loadError, setLoadError] = useState<string | null>(null);
  // Bumped by the retry button to re-run the load effect on unchanged inputs.
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  // The dish just ordered, shown as an optimistic row while the kitchen replies.
  const [pending, setPending] = useState<DishSummary | null>(null);
  const [showHowTo, setShowHowTo] = useState(() => !hasSeenHowTo());
  const [showStats, setShowStats] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  // Unseen notices from the kitchen, oldest first, shown one after another.
  const [notices, setNotices] = useState<Announcement[]>([]);
  const [noticeIndex, setNoticeIndex] = useState(0);
  // The end-of-round choreography — the beat before the check prints, the win
  // toast over it, and the instant open for a round restored from storage.
  // Shared with the bar; see src/game/roundLifecycle.ts.
  const check = useCheckOpening(round.status, round.guesses.length, (n) => WIN_TOASTS[n - 1] ?? WIN_TOASTS[0]);
  const { toast, showCheck: showResult, setShowCheck: setShowResult } = check;
  // When this sitting started, for the elapsed timer on a Discord profile. This
  // sitting, not the round: a board restored from localStorage was begun on a
  // page load we no longer have, and dating the timer to it would report hours.
  const openedAt = useRef(Date.now());

  // Bring the audio graph up. Cheap and silent until the player interacts: the
  // context is built suspended, the effects decode during idle time, and the
  // bed isn't even fetched until a gesture has unlocked playback. Mounted here
  // rather than in main.tsx so /admin never pays for any of it.
  useEffect(() => {
    setupAudio(SURFACE);
  }, []);

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
  // A playtest round stands in for it, so finishing one unlocks the archive the
  // same way (its own status, since it was never written to localStorage).
  const dailyStatus: GameStatus = useMemo(
    () => (dressedAsDaily ? round.status : loadRound(today).status),
    [dressedAsDaily, round.status, today],
  );
  const dailyDone = dailyStatus !== "playing";
  const canArchive = !isPreview && (dailyDone || isArchive || isRandom);

  // After Dark. Read once at mount — whether tonight's Nightcap is settled can
  // only change by going to the bar, which unmounts this page.
  const playedTonight = useMemo(() => nightRoundFinished(currentNight()), []);
  const invite = useBarInvite(playedTonight);
  // Only ever offered off a finished daily. Not on a Leftover, a Chef's Choice
  // or a preview: those are side doors, and the bar's own door is the check.
  const barInvite: BarInvite = isDaily && dailyDone ? invite : "none";

  // ---- Notices from the kitchen ----
  //
  // Only Today's Special carries them. An archive replay, a Chef's Choice, a
  // preview or a playtest are all side doors into the game, and a notice
  // interrupting one of those is noise rather than news.
  //
  // Fetched the moment the page opens but held back until the how-to closes, so
  // a brand-new player meets the game itself before the diner's announcements.
  useEffect(() => {
    if (!isDaily) return;
    let cancelled = false;
    fetchAnnouncements(isReturningPlayer()).then(
      (list) => {
        if (cancelled) return;
        const seen = new Set(seenAnnouncements());
        setNotices(list.filter((a) => !seen.has(a.id)));
      },
      () => {
        // A note that won't load costs the player nothing — the board is the
        // product, and it never waits on this.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [isDaily]);

  // One at a time, and never stacked on another modal: the check that auto-opens
  // for an already-finished round gets to go first, then the notice.
  const activeNotice =
    !showHowTo && !showResult && !showStats && !showArchive ? (notices[noticeIndex] ?? null) : null;

  // Counted the moment it's on screen, not when it's dismissed — someone who
  // reads a note and closes the tab still read it. localStorage is what stops it
  // coming back; the POST is what the admin panel's reach numbers count. Both
  // are idempotent, so a notice re-shown after another modal closes is still one
  // player reached.
  useEffect(() => {
    if (!activeNotice) return;
    rememberAnnouncementSeen(activeNotice.id);
    markAnnouncementSeen({ id: activeNotice.id, playerId: getPlayerId(), surface: SURFACE });
  }, [activeNotice]);

  const dismissNotice = useCallback(() => setNoticeIndex((i) => i + 1), []);

  // Midnight ET landed while this tab sat open, so everything below is keyed to
  // yesterday. Suppressed in preview, which has no "today" to go stale.
  const rolledOver = useNewDayAvailable(today);
  const newDayAvailable = rolledOver && !isPreview;

  // The service bell, for the one thing in the game that happens without the
  // player doing anything. Reuses the win bell's file (see the alias in
  // shared/audio.ts) because it is the same bell — a new Special going up is
  // the kitchen calling the room, which is what that sound already means.
  useEffect(() => {
    if (newDayAvailable) playSfx("new-day-bell");
  }, [newDayAvailable]);
  const company = useCounterCompany();

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
    openedAt.current = Date.now(); // a fresh dish is a fresh sitting
    setReveal(null);
    setError(null);
    // The next round is played fresh in this session, so it earns the full
    // toast-then-check treatment again.
    check.reset();
    setDaily(null); // triggers a reload below with the new seed
    // `check` is a stable bag of setters; keying on it would rebuild newGame
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    Promise.all([fetchDishes(), fetchDaily(date, preview, random, playtest)])
      .then(([dishList, dailyInfo]) => {
        if (cancelled) return;
        setDishes(dishList);
        setDaily(dailyInfo);
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [date, preview, random, playtest, reloadKey]);

  // A finished round (including one restored from localStorage) needs the reveal.
  // Fetched the moment the round ends, so it's already in hand by the time the
  // delayed check below actually opens.
  useEffect(() => {
    if (round.status !== "playing" && !reveal) {
      fetchReveal(date, preview, random, playtest).then(setReveal).catch(() => {});
    }
  }, [round.status, reveal, date, preview, random, playtest]);

  // Assign an anonymous analytics id once per round so start/complete/share
  // beacons can be linked. Every tracked kind gets one — daily, leftover, and
  // chef's special — but the test modes (admin preview, playtest) never do. The
  // "start" beacon itself doesn't fire here — merely opening the page (or
  // closing the how-to modal) isn't a started game. It fires on the first guess
  // (see submitGuess). A new random seed makes a fresh round, hence a fresh id.
  useEffect(() => {
    if (!tracked || !daily || round.analyticsId) return;
    const started = { ...round, analyticsId: newAnalyticsId() };
    setRound(started);
    // Persist the id where the round lives (daily/archive); random keeps it in
    // memory only, which is enough to link its own beacons this session.
    persist(started);
    // Intentionally keyed on round load — reads the round as it stands when the puzzle resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily, tracked]);

  // The funnel's top: this device opened a real, playable board. Unlike the
  // "start" beacon above, merely arriving *is* the event here — that's the whole
  // point, since everyone who loads and never guesses was otherwise invisible.
  //
  // Fires once per browser session per ET day (markSeated), and the server
  // deduplicates by (day, device) on top of that, so mode switches — which
  // navigate by assigning a URL and remount this whole page — cost nothing. The
  // test modes are excluded by the same `tracked` flag as every other beacon.
  //
  // It also carries where the arrival came from (migrations/0024) — the only
  // beacon that does, because a visit is the arrival and a round isn't.
  useEffect(() => {
    if (!tracked || !daily) return;
    if (!markSeated(localToday())) return;
    const source = visitSource();
    beaconSeated({ playerId: getPlayerId(), surface: SURFACE, ...(source ? { source } : {}) });
  }, [daily, tracked]);

  // Discord Rich Presence: which mode they're in and how they're doing, on their
  // own Discord profile. A no-op everywhere else — on the open web there's no
  // SDK to hand it to, so this costs a function call and nothing more.
  //
  // Gated on `tracked` for the same reason the beacons are: admin preview and
  // playtest aren't rounds anyone is playing. Note that the copy never names the
  // dish (shared/presence.ts) — a profile is read by people who haven't played
  // today, and the answer is exactly what they'd be reading.
  useEffect(() => {
    if (!tracked || !daily) return;
    setPresence(
      buildPresence({
        kind: analyticsKind,
        puzzleNumber: daily.puzzleNumber,
        status: round.status,
        guesses: round.guesses.length,
        startedAt: openedAt.current,
      }),
    );
  }, [tracked, daily, analyticsKind, round.status, round.guesses.length]);

  // A new board is a new message. Without this, starting a second round in the
  // same tab would edit the first round's message into the second round's score.
  //
  // Declared *above* the publisher so it runs first: effects fire in order, and a
  // board restored from localStorage mid-round publishes on mount. Reset it
  // afterwards and that first post would be orphaned, with the next guess posting
  // a second message for the same round.
  useEffect(() => {
    resetProgress();
  }, [date, random, playtest]);

  // The live message in the Discord channel: posted on the first guess, rewritten
  // on every one after it, past-tensed when the round ends. Same trigger as
  // presence and the same `tracked` gate — a preview or a playtest is nobody's
  // round and has no business in a channel.
  //
  // Deliberately not awaited and deliberately without an error path: the module
  // retires itself on the first failure, so the worst case is a channel that
  // doesn't hear about this round.
  useEffect(() => {
    if (!tracked || !daily || SURFACE !== "discord") return;
    publishProgress({
      card: buildScorecard(daily.puzzleNumber, round.guesses, round.status === "won", daily.ingredientCount),
      puzzleNumber: daily.puzzleNumber,
      live: round.status === "playing",
    });
    // Keyed on the guess *count*, like presence: the array's identity changes on
    // renders that didn't add a guess, and each one would be another upload.
  }, [tracked, daily, round.status, round.guesses.length]);

  /**
   * What a screen reader hears when a guess lands (GitHub #127). Submitting an
   * order changes the board in three places and used to announce none of them,
   * so the only way to find out what the kitchen said was to go and read the
   * guess column.
   *
   * Two regions rather than one, because the clue ticket is deliberately
   * staggered ~1.14s behind the row (--ticket-start in game.css, TICKET_MS in
   * shared/audio.ts) and one region written twice in quick succession drops the
   * first message. The wording is a pure fold in shared/announce.ts.
   */
  const [liveGuess, setLiveGuess] = useState("");
  const [liveClue, setLiveClue] = useState("");
  const clueTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(clueTimer.current), []);

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
        const feedback = await postGuess({
          date,
          dishId: dish.id,
          guessNumber,
          preview,
          random,
          special: playtest,
        });
        const next: RoundState = {
          ...round,
          guesses: [...round.guesses, feedback],
          clues: feedback.clue ? [...round.clues, feedback.clue] : round.clues,
          status: feedback.correct ? "won" : guessNumber >= MAX_GUESSES ? "lost" : "playing",
          // Stamped on every save so the grid can be redrawn from storage alone
          // — the After Dark tab shares today's lunch grid beside its own.
          ingredientCount: daily.ingredientCount,
        };
        setRound(next);
        setPending(null);
        // The whole sound of this guess landing, handed over in one burst so it
        // can be scheduled on the audio clock rather than a chain of timers:
        // the tiles flipping, the chips settling, the bell or the sting, and
        // the ticket printing a full 1.14s later. See guessArc in
        // shared/audio.ts — every offset in it mirrors the animation dial at
        // the top of game.css.
        playGuessArc({
          correct: feedback.correct,
          lost: next.status === "lost",
          hasClue: Boolean(feedback.clue),
        });
        // Said, not just drawn. The clue rides the same delay as its ticket and
        // its printer, so the three arrive together rather than the sentence
        // landing a second before the paper.
        setLiveGuess(
          guessAnnouncement({
            guess: feedback,
            ingredientCount: daily.ingredientCount,
            guessNumber,
            maxGuesses: MAX_GUESSES,
          }),
        );
        const clue = feedback.clue;
        window.clearTimeout(clueTimer.current);
        if (clue) {
          clueTimer.current = window.setTimeout(
            () => setLiveClue(clueAnnouncement(clue.index, clue.text)),
            TICKET_MS,
          );
        }
        // Daily + leftover persist to localStorage; the throwaway modes don't.
        if (!ephemeral) persist(next);
        // Real play counts toward analytics (daily, leftover, chef) — the test
        // modes don't.
        if (tracked) {
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
    [daily, busy, round, date, preview, random, playtest, ephemeral, tracked, isDaily, analyticsKind, persist],
  );

  const guessedIds = useMemo(() => new Set(round.guesses.map((g) => g.dish.id)), [round.guesses]);
  const remaining = MAX_GUESSES - round.guesses.length;

  return (
    <div className="scene">
      {/* Off-screen, and the only two things on the page that speak. Kept up
          here at the top of the scene so nothing about where they sit in the
          DOM can be mistaken for layout. */}
      <p className="sr-only" role="status" aria-live="polite">
        {liveGuess}
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {liveClue}
      </p>
      {toast && <WinToast text={toast} />}
      <header className="marquee">
        <h1 className="marquee__script">Lunch Special</h1>
        <p className="marquee__sub">The daily dish guessing game</p>
      </header>

      <main className="menu-card">
        {isPreview && (
          <p className="preview-banner">Admin test play — nothing is saved, counted or shown to players</p>
        )}
        {playtest && <p className="preview-banner">Playtest — pinned to “{playtest}”, nothing is saved</p>}
        {/* Sits above every other bar: if the day has turned, that reframes
            whatever mode the player is in, so it needs to be read first. */}
        {newDayAvailable && (
          <div className="newday-bar" role="status" aria-live="polite">
            <span className="newday-bar__tag">🛎️ A new Special is up</span>
            <button className="newday-bar__btn" onClick={() => { playSfx("ui-click"); goToday(); }}>
              Serve it
            </button>
          </div>
        )}
        {isArchive && (
          <div className="archive-bar">
            <span className="archive-bar__tag">📅 From the archive</span>
            <button className="archive-bar__btn" onClick={() => { playSfx("ui-click"); goToday(); }}>Back to today</button>
          </div>
        )}
        {isRandom && (
          <div className="freeplay-bar">
            <span className="freeplay-bar__tag">🎲 Random recipe — nothing saved</span>
            <button className="freeplay-bar__btn" onClick={() => { playSfx("ui-click"); newGame(); }}>New random dish</button>
          </div>
        )}
        {/* Last of the bars: the others are about what you're playing, this is
            just who else is in the room. Absent on the web, and absent inside
            Discord until somebody else actually turns up. */}
        {company > 0 && (
          <div className="counter-bar" role="status" aria-live="polite">
            <span className="counter-bar__tag">
              🍽️ {company} {company === 1 ? "other is" : "others are"} at the counter
            </span>
          </div>
        )}
        <div className="menu-card__header">
          <h2 className="menu-card__title">{isArchive ? "From the Archive" : "Today's Menu"}</h2>
          <p className="menu-card__meta">
            {daily && (!ephemeral || dressedAsDaily) ? <>Special No. {daily.puzzleNumber} — </> : null}
            {dateLabel(date)}
          </p>
          <div className="menu-card__toolbar">
            <button className="icon-btn" onClick={() => { playSfx("ui-click"); setShowHowTo(true); }}>How to play</button>
            <button className="icon-btn" onClick={() => { playSfx("ui-click"); setShowStats(true); }}>My stats</button>
            {canArchive && (
              <button className="icon-btn" onClick={() => { playSfx("ui-click"); setShowArchive(true); }}>Menu archive</button>
            )}
            {round.status !== "playing" && (
              <button className="icon-btn" onClick={() => { playSfx("ui-click"); setShowResult(true); }}>Your check</button>
            )}
            {/* A returning player who finished lunch at noon shouldn't have to
                reopen their check to find the bar. Only while it's actually
                open — a pill that explains itself is a band, not a pill. */}
            {(barInvite === "open" || barInvite === "settled") && (
              <button
                className="icon-btn icon-btn--bar"
                onClick={() => { playSfx("ui-click"); onEnterBar(); }}
              >
                🍸 After Dark
              </button>
            )}
            <SoundToggle />
          </div>
        </div>

        {/* No dish list and no puzzle means there's nothing to order from, so
            the closed sign takes the board's place rather than sitting above a
            search box that can't match anything. */}
        {loadError && !daily ? (
          <KitchenClosed detail={loadError} onRetry={() => setReloadKey((k) => k + 1)} />
        ) : (
          <>
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
        <p>Created by <b>Jacob Poteet</b></p>
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
      {activeNotice && (
        <AnnouncementModal
          key={activeNotice.id}
          announcement={activeNotice}
          position={noticeIndex + 1}
          total={notices.length}
          onClose={dismissNotice}
        />
      )}
      {showStats && (
        <Modal onClose={() => setShowStats(false)} label="My stats">
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
          asDaily={dressedAsDaily}
          isRandom={isRandom}
          kind={analyticsKind}
          canShare={dressedAsDaily || isArchive}
          canArchive={canArchive}
          barInvite={barInvite}
          onEnterBar={onEnterBar}
          onNewGame={newGame}
          onArchive={() => {
            setShowResult(false);
            setShowArchive(true);
          }}
          onClose={() => setShowResult(false)}
        />
      )}

      {/* Last in the scene and fixed to a corner, so a screenshot of the check
          carries it too. */}
      <BuildTag />
    </div>
  );
}
