// The game's sound — PURE.
//
// Everything here is data and arithmetic: which sounds exist, how loud each one
// sits in the mix, when the guess sequence fires them, and whether a given bus
// is allowed to make noise right now. The Web Audio graph that acts on it lives
// in src/audio/, the same split as shared/presence.ts vs src/discord/presence.ts.
//
// Two things are deliberate about that split. The mix lives *here*, in `gain`,
// rather than being baked into the files: a licensed sound arrives peak
// normalised, and the only way to balance a click against a bell is a dial you
// can turn without re-encoding anything. And the guess arc lives here rather
// than as a chain of setTimeouts at the call site, because it's a timing
// *table* — the audio counterpart of the animation dial at the top of game.css,
// and just as much a thing you retune in one place.
//
// The files this names do not exist yet. That is a supported state, not a
// placeholder: the loader treats a missing asset as "this sound is silent" and
// everything else carries on. Dropping the licensed files into src/assets/sfx/
// under these names is the whole of turning sound on — there is no flag.

import type { Surface } from "./types";

/** Which bus a sound rides. The two are muted, ducked and defaulted separately. */
export type Bus = "sfx" | "music";

/**
 * Every sound the game can make.
 *
 * `new-day-bell` is a name rather than a call to `win-bell` even though the two
 * share a file: the call site should say what happened, not what it sounds
 * like, or the day the two stop sharing a file becomes a hunt. The loader keys
 * its cache on the filename, so the shared file is still fetched once.
 */
export type SfxName =
  | "guess-submit" // an order is sent to the kitchen and its row drops in
  | "tile-flip" // one attribute tile turning over; fires four times, pitched up
  | "chip-land" // the ingredient chips settling — once, not once per chip
  | "ticket-print" // a clue chatters out of the order-ticket printer
  | "guess-correct" // the winning order lands
  | "win-bell" // ...and the service bell rings over it
  | "round-lost" // out of guesses
  | "receipt-print" // the check prints (replaces modal-open on that modal)
  | "fan-stamp" // the fan-submission seal thuds onto the check
  | "stat-pop" // the player's own bar in the guess distribution
  | "modal-open" // a card slides up from the bottom
  | "modal-close" // ...and slides back down
  | "notice-drop" // a notice drops in from *above* and bounces
  | "ui-click" // any button press
  | "option-tick" // arrow-keying through the dish list
  | "new-day-bell" // a new Special went up while the tab sat open
  | "share-success" // the check went to the clipboard or the channel
  | "error" // the kitchen is closed, or a guess failed
  // After Dark. Named for what happens, not what it sounds like, exactly as
  // above -- `coaster-slide` shares a file with `ticket-print` today and the
  // day it stops sharing one is the day the call sites need to already be
  // saying different things.
  | "lights-out" // the diner dims and the neon comes up
  | "coaster-slide" // a coaster comes across the bar
  | "pour"; // the winning drink goes into the glass

export interface SfxSpec {
  /** Filename inside `src/assets/sfx/`. */
  file: string;
  /**
   * Where this sound sits in the mix, 0..1, applied on top of the bus gain.
   * Not a volume knob for the player — that's the mute button. This is the
   * balance between sounds, and it's the dial to turn when one of them starts
   * poking through.
   */
  gain: number;
  /** Whether this sound dips the music bed under itself. Reserve for the big ones. */
  duck?: boolean;
}

/**
 * The registry. Gains are a first mix, set by what each sound *does* rather
 * than measured — expect to retune them once real files land.
 *
 * The shape of that first mix: `ui-click` and `option-tick` are the quietest
 * things in the game because they're the most frequent, and a click you notice
 * is a click you'll come to hate. The bells are the loudest because they mark
 * the only two moments that matter. `tile-flip` is held down because it fires
 * four times inside 400ms and the run has to read as texture, not as four
 * separate events competing with the bell over the top of them.
 */
export const SFX: Record<SfxName, SfxSpec> = {
  "guess-submit": { file: "guess-submit.wav", gain: 0.7 },
  "tile-flip": { file: "tile-flip.wav", gain: 0.45 },
  "chip-land": { file: "chip-land.wav", gain: 0.5 },
  "ticket-print": { file: "ticket-print.wav", gain: 0.65 },
  "guess-correct": { file: "guess-correct.wav", gain: 0.8 },
  "win-bell": { file: "win-bell.wav", gain: 0.9, duck: true },
  "round-lost": { file: "round-lost.wav", gain: 0.7, duck: true },
  "receipt-print": { file: "receipt-print.wav", gain: 0.7, duck: true },
  "fan-stamp": { file: "fan-stamp.wav", gain: 0.75 },
  "stat-pop": { file: "stat-pop.wav", gain: 0.4 },
  "modal-open": { file: "modal-open.wav", gain: 0.45 },
  "modal-close": { file: "modal-close.wav", gain: 0.4 },
  "notice-drop": { file: "notice-drop.wav", gain: 0.6 },
  "ui-click": { file: "ui-click.wav", gain: 0.3 },
  "option-tick": { file: "option-tick.wav", gain: 0.25 },
  "new-day-bell": { file: "win-bell.wav", gain: 0.8 },
  "share-success": { file: "share-success.wav", gain: 0.6 },
  "lights-out": { file: "lights-out.wav", gain: 0.7, duck: true },
  "coaster-slide": { file: "ticket-print.wav", gain: 0.6 },
  "pour": { file: "pour.wav", gain: 0.85, duck: true },
  error: { file: "error.wav", gain: 0.5 },
};

/**
 * The ambient bed. One file, looped forever.
 *
 * `loopStart`/`loopEnd` are what make the loop gapless — a plain `loop = true`
 * wraps at the buffer's edges, which is only seamless if the file was trimmed
 * to the exact sample. Licensed "loops" routinely aren't, so these exist to
 * take up the slack without re-encoding. Zero and zero means "use the whole
 * buffer" and is the right value until a real file says otherwise.
 *
 * Length matters more than it looks: a decoded AudioBuffer is Float32, so a
 * 60s stereo track at 48kHz is ~23MB resident. Streaming it through a media
 * element would avoid that, but gives up sample-accurate looping — and an
 * audible seam every minute is worse than the memory.
 */
export const MUSIC = {
  file: "diner-ambience.m4a",
  gain: 0.35,
  loopStart: 0,
  loopEnd: 0,
} as const;

/** How far the music dips under a ducking sound, as a multiplier (~-6 dB). */
export const DUCK_GAIN = 0.5;
/** Time constant for the dip going down, and for the recovery coming back. */
export const DUCK_ATTACK_MS = 80;
export const DUCK_RELEASE_MS = 400;

/** Cutoff the music bed is low-passed to while a modal is open — "the next room". */
export const MUFFLE_HZ = 800;
/** Effectively open. Above the audible band, so the filter is a no-op when parked here. */
export const OPEN_HZ = 20000;

/** How long the master gain takes to reach silence on mute. Instant would click. */
export const MUTE_RAMP_MS = 120;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export interface AudioPrefs {
  /** The one visible control. Silences everything, both buses. */
  muted: boolean;
  /** Whether the ambient bed plays at all. Defaulted per surface, see below. */
  music: boolean;
}

/**
 * What sound does before the player has said anything about it.
 *
 * **This table is the only place a default lives.** Nothing else may assume a
 * value for either bus — the whole point is that flipping the policy is an edit
 * here and nowhere else.
 *
 * Why the two surfaces differ: a Discord Activity is a room someone chose to
 * sit down in, and a quiet bed is part of the furniture there. A web visitor
 * arrived from a link, possibly onto a phone at a table with other people, and
 * a page that starts playing music at them is the fastest way to lose them. SFX
 * are on in both places because they're feedback rather than atmosphere — they
 * only ever answer something the player just did.
 *
 * An explicit choice always outranks this: once the player touches the toggle,
 * the stored value wins forever and the defaults stop being consulted.
 */
export const AUDIO_DEFAULTS: Record<Surface, AudioPrefs> = {
  web: { muted: false, music: false },
  discord: { muted: false, music: true },
};

/** The starting prefs for a device that has never touched the toggle. */
export function defaultPrefs(surface: Surface): AudioPrefs {
  return { ...AUDIO_DEFAULTS[surface] };
}

/**
 * Whether a bus is allowed to make a sound right now.
 *
 * `unlocked` is not a preference — it's whether the browser has let us start an
 * AudioContext yet, which needs a user gesture. It gates both buses because
 * playing into a suspended context isn't silence, it's a sound that arrives
 * late and all at once when the context wakes up.
 */
export function shouldPlay(bus: Bus, prefs: AudioPrefs, unlocked: boolean): boolean {
  if (!unlocked || prefs.muted) return false;
  if (bus === "music") return prefs.music;
  return true;
}

// ---------------------------------------------------------------------------
// The guess arc
// ---------------------------------------------------------------------------

/* Every offset below is measured from the moment the feedback lands and the row
   re-renders with its real tiles — the same origin the CSS animations take. The
   values mirror the timing dial at the top of game.css:

     --tile-flip-start: 0.12s   --tile-flip-step: 90ms
     --chip-pop-start:  0.42s
     --ticket-start:    1.14s

   If you re-time the animations, retime these, or the sound drifts off the
   picture. TICKET_MS in particular is the same literal as `--ticket-start` and
   the CSS block explains how to recompute it. */

export const TILE_FLIP_START_MS = 120;
export const TILE_FLIP_STEP_MS = 90;
/** Attribute tiles per guess: country, course, temperature, protein. */
export const TILE_COUNT = 4;
export const CHIP_LAND_MS = 420;
export const TICKET_MS = 1140;

/**
 * The bell rings over the tile run rather than after it, matching `toast-bell`'s
 * own 0.15s delay in game.css. Overlapping the flips is the point: the win
 * should interrupt the readout, not queue politely behind it.
 */
export const WIN_BELL_MS = 150;

/**
 * A loss lands in the gap between the chips settling and the check opening
 * (`LOSS_CHECK_DELAY_MS` = 800 in GamePage). Late enough to be its own beat,
 * early enough that the receipt doesn't print over the top of it.
 */
export const ROUND_LOST_MS = 600;

/** How much each successive tile is pitched up, so four taps read as a run. */
export const FLIP_RATE_STEP = 0.04;

/**
 * Playback rate for the nth attribute tile. Clamped rather than extrapolated:
 * a fifth tile is a bug, and a bug should sound like the fourth one rather
 * than chirping.
 */
export function flipRate(index: number): number {
  const i = Math.min(Math.max(Math.trunc(index), 0), TILE_COUNT - 1);
  return 1 + FLIP_RATE_STEP * i;
}

/**
 * How close two firings of the *same* sound have to be before the second is
 * refused. Comfortably under {@link TILE_FLIP_STEP_MS}, so a real run of one
 * sound is never touched.
 */
export const DEDUPE_MS = 40;

/**
 * Whether a sound scheduled for `when` should be dropped because the same one
 * is already going off at `previous` (both in audio-clock seconds).
 *
 * Two identical buffers starting together don't sound like two of anything —
 * they sum to one sound 6dB louder, usually with a click on the front. It is
 * never what anyone meant, so the engine refuses it centrally rather than
 * asking every call site to defend against it.
 *
 * The concrete case is React StrictMode, which deliberately runs every effect
 * twice in development: the modals, the fan stamp and the stats pop all sound
 * from mount effects, so each would double — in exactly the build you'd be
 * sitting in while judging whether a licensed sound is any good.
 */
export function isDuplicateSchedule(when: number, previous: number | undefined): boolean {
  if (previous === undefined) return false;
  return Math.abs(when - previous) * 1000 < DEDUPE_MS;
}

/** One scheduled sound: what to play, how far after the origin, and at what pitch. */
export interface ArcStep {
  sfx: SfxName;
  delayMs: number;
  rate: number;
}

export interface ArcInput {
  /** Whether this guess won the round. */
  correct: boolean;
  /** Whether the round ended in a loss on this guess. */
  lost: boolean;
  /** Whether a clue ticket prints after this guess. */
  hasClue: boolean;
  /** Overridable only so the tests don't have to track {@link TILE_COUNT}. */
  tiles?: number;
  /**
   * The bar's arc rather than the diner's. Same shape and the same timings --
   * the tiles flip on the same dial, because it is the same board with the
   * lights off -- swapping only the two sounds that name a piece of the
   * fiction: a coaster slides where a ticket prints, and a drink is poured
   * where the service bell rings.
   */
  night?: boolean;
}

/**
 * The whole sound of one guess landing, as a list to be scheduled in a single
 * burst on the audio clock.
 *
 * Returned as data rather than played directly for the reason every fold in
 * this project is: it can be asserted on. But it also matters at the call site
 * — handing the engine the entire arc at once lets it schedule against
 * `AudioContext.currentTime`, so a React re-render or a slow network reply in
 * the middle can't shuffle the ticket off the beat the way a chain of
 * setTimeouts would.
 */
export function guessArc(input: ArcInput): ArcStep[] {
  const tiles = input.tiles ?? TILE_COUNT;
  const steps: ArcStep[] = [];

  const night = input.night === true;

  if (input.correct) steps.push({ sfx: "guess-correct", delayMs: 0, rate: 1 });

  for (let i = 0; i < tiles; i++) {
    steps.push({
      sfx: "tile-flip",
      delayMs: TILE_FLIP_START_MS + TILE_FLIP_STEP_MS * i,
      rate: flipRate(i),
    });
  }

  if (input.correct) steps.push({ sfx: night ? "pour" : "win-bell", delayMs: WIN_BELL_MS, rate: 1 });

  steps.push({ sfx: "chip-land", delayMs: CHIP_LAND_MS, rate: 1 });

  if (input.lost) steps.push({ sfx: "round-lost", delayMs: ROUND_LOST_MS, rate: 1 });
  if (input.hasClue) steps.push({ sfx: night ? "coaster-slide" : "ticket-print", delayMs: TICKET_MS, rate: 1 });

  return steps.sort((a, b) => a.delayMs - b.delayMs);
}
