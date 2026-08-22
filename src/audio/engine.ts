// The Web Audio graph. Everything that actually makes noise.
//
//                                        ┌──────────┐   ┌──────────┐
//   music source ──▶ lowpass ──▶ duck ──▶│ musicGain│──▶│          │
//                                        └──────────┘   │masterGain│──▶ speakers
//   sfx source ──▶ (per-sound gain) ─────────────────▶  │  (mute)  │
//                                                       └──────────┘
//
// No library. What a library would give us here — a buffer cache, a gesture
// unlock, volume — is the easy half; the half we actually need is the bus
// graph above, which is native to Web Audio and something Howler doesn't model
// at all. See CLAUDE.md.
//
// Three things about this file are load-bearing:
//
//  1. **The context is created at mount and left suspended**, then resumed on
//     the first gesture. Creating it lazily *inside* the gesture would be
//     simpler, but nothing would be decoded yet, so the first sound in a
//     session — the one that tells the player this game has sound at all —
//     would be the one that's missed.
//  2. **SFX are scheduled on the audio clock**, never with setTimeout. The
//     guess arc hands us five to seven sounds spanning 1.14s and the main
//     thread is busy with React for most of it; `start(when)` is sample
//     accurate and doesn't care.
//  3. **A missing file is a supported state, not an error.** The registry names
//     files that may not exist; the glob below simply won't have them and those
//     sounds stay silent. That is what lets the whole system ship and be
//     reviewed before a single asset has been licensed.

import {
  DUCK_ATTACK_MS,
  DUCK_GAIN,
  DUCK_RELEASE_MS,
  MUFFLE_HZ,
  MUSIC,
  MUTE_RAMP_MS,
  OPEN_HZ,
  SFX,
  isDuplicateSchedule,
  type ArcStep,
  type SfxName,
} from "../../shared/audio";

/**
 * Every audio file actually present in the source tree, as built URLs.
 *
 * `import.meta.glob` rather than a list of `import` statements because the
 * registry names files that don't exist yet, and a static import of a missing
 * file is a build error. A glob of an empty directory is an empty object, so
 * the game builds, runs and is fully reviewable with no assets at all — and
 * dropping the licensed files in is the entire installation step.
 *
 * `eager` + `?url` costs nothing at runtime: it resolves to a string per file,
 * and the bytes are only fetched when we ask for them below.
 */
const SFX_URLS = import.meta.glob<string>("../assets/sfx/*.{wav,m4a,opus,mp3}", {
  eager: true,
  query: "?url",
  import: "default",
});
const MUSIC_URLS = import.meta.glob<string>("../assets/music/*.{m4a,opus,mp3,wav}", {
  eager: true,
  query: "?url",
  import: "default",
});

function sfxUrl(file: string): string | undefined {
  return SFX_URLS[`../assets/sfx/${file}`];
}
function musicUrl(file: string): string | undefined {
  return MUSIC_URLS[`../assets/music/${file}`];
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let duckGain: GainNode | null = null;
let muffle: BiquadFilterNode | null = null;

/** Decoded buffers, keyed by *filename* so an aliased sound is fetched once. */
const buffers = new Map<string, AudioBuffer>();
/** Files we've tried and failed to load. Prevents a 404 being retried per play. */
const missing = new Set<string>();
/** In-flight loads, so two call sites can't fetch the same file twice. */
const loading = new Map<string, Promise<AudioBuffer | null>>();

let unlocked = false;
let muted = false;

/** Guards overlapping ducks: a second dip must not cut the first one's recovery short. */
let duckUntil = 0;

/**
 * The last audio-clock time each sound was scheduled for. The decision itself
 * is `isDuplicateSchedule` in shared/audio.ts, where it can be unit-tested;
 * this is just the memory it reads.
 */
const lastScheduled = new Map<SfxName, number>();

export function audioContext(): AudioContext | null {
  return ctx;
}
export function isUnlocked(): boolean {
  return unlocked;
}

/**
 * Build the graph. Safe to call more than once; the second call is a no-op.
 *
 * The context starts suspended on every browser that enforces autoplay policy,
 * which is all of them. That's fine and expected — {@link unlock} resumes it.
 */
export function initAudio(): void {
  if (ctx) return;
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return; // No Web Audio: the whole system stays silent, nothing breaks.

  try {
    ctx = new Ctor();
  } catch {
    return;
  }

  masterGain = ctx.createGain();
  masterGain.gain.value = muted ? 0 : 1;
  masterGain.connect(ctx.destination);

  sfxGain = ctx.createGain();
  sfxGain.gain.value = 1;
  sfxGain.connect(masterGain);

  musicGain = ctx.createGain();
  musicGain.gain.value = MUSIC.gain;
  musicGain.connect(masterGain);

  duckGain = ctx.createGain();
  duckGain.gain.value = 1;
  duckGain.connect(musicGain);

  muffle = ctx.createBiquadFilter();
  muffle.type = "lowpass";
  muffle.frequency.value = OPEN_HZ;
  muffle.connect(duckGain);

  unlocked = ctx.state === "running";
}

/** Where a music source connects. Null until {@link initAudio} has run. */
export function musicInput(): AudioNode | null {
  return muffle;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function load(file: string, url: string | undefined): Promise<AudioBuffer | null> {
  if (buffers.has(file)) return Promise.resolve(buffers.get(file)!);
  if (missing.has(file) || !url || !ctx) return Promise.resolve(null);

  const inFlight = loading.get(file);
  if (inFlight) return inFlight;

  const job = fetch(url)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((bytes) => ctx!.decodeAudioData(bytes))
    .then((buffer) => {
      buffers.set(file, buffer);
      return buffer;
    })
    .catch(() => {
      // A file that is absent, 404s, or won't decode is simply a silent sound.
      missing.add(file);
      return null;
    })
    .finally(() => {
      loading.delete(file);
    });

  loading.set(file, job);
  return job;
}

/**
 * Decode every SFX during idle time so the first click is instant.
 *
 * The music bed is deliberately *not* here — it's the one big file, and a
 * visitor who bounces without interacting should never pay for it. It loads on
 * the first gesture instead, from src/audio/music.ts.
 */
export function preloadSfx(): void {
  if (!ctx) return;
  const files = new Set(Object.values(SFX).map((s) => s.file));
  const run = () => {
    for (const file of files) void load(file, sfxUrl(file));
  };
  const idle = (window as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (idle) idle(run);
  else setTimeout(run, 200);
}

/** Fetch + decode the music bed. Called after the first gesture, never before. */
export function loadMusic(): Promise<AudioBuffer | null> {
  return load(MUSIC.file, musicUrl(MUSIC.file));
}

// ---------------------------------------------------------------------------
// Unlock
// ---------------------------------------------------------------------------

const unlockHandlers: (() => void)[] = [];

/** Run `fn` once the context is live. Immediately if it already is. */
export function onUnlock(fn: () => void): void {
  if (unlocked) fn();
  else unlockHandlers.push(fn);
}

/**
 * Resume the context. Must be called from inside a user gesture.
 *
 * Idempotent, and harmless to call when already running — which matters
 * because the listener that calls it fires on every early interaction until it
 * succeeds rather than exactly once. A `{ once: true }` listener that fired
 * during a failed resume would leave the game permanently silent.
 */
export function unlock(): void {
  if (!ctx || unlocked) return;
  void ctx.resume().then(() => {
    if (!ctx || ctx.state !== "running") return;
    unlocked = true;
    for (const fn of unlockHandlers.splice(0)) {
      try {
        fn();
      } catch {
        /* one bad listener must not strand the others */
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

export interface PlayOptions {
  /** Milliseconds from now, scheduled on the audio clock rather than a timer. */
  delayMs?: number;
  /** Playback rate; doubles as pitch. Used by the tile-flip ladder. */
  rate?: number;
}

/**
 * Play one sound. Never throws, and does nothing at all when the context is
 * locked, the game is muted, or the file doesn't exist.
 *
 * The buffer is looked up synchronously: a sound that hasn't finished decoding
 * is skipped rather than awaited, because a sound arriving 300ms after the
 * thing it was meant to punctuate is worse than no sound. `preloadSfx` is what
 * makes that a non-issue after the first moments of a session.
 */
export function play(name: SfxName, opts: PlayOptions = {}): void {
  if (!ctx || !unlocked || muted || !sfxGain) return;
  const spec = SFX[name];
  if (!spec) return;

  const when = ctx.currentTime + Math.max(0, opts.delayMs ?? 0) / 1000;

  if (isDuplicateSchedule(when, lastScheduled.get(name))) return;
  lastScheduled.set(name, when);

  const buffer = buffers.get(spec.file);

  if (!buffer) {
    if (!missing.has(spec.file)) void load(spec.file, sfxUrl(spec.file));
    if (import.meta.env.DEV) devBlip(name, spec.gain, when, opts.rate ?? 1);
    return;
  }

  try {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = opts.rate ?? 1;

    const gain = ctx.createGain();
    gain.gain.value = spec.gain;

    source.connect(gain);
    gain.connect(sfxGain);
    source.start(when);
    // AudioBufferSourceNode is one-shot and cheap, so there's no pool: the node
    // is disposable and the graph edge goes with it.
    source.onended = () => gain.disconnect();
  } catch {
    /* nothing here is worth breaking a round over */
  }

  if (spec.duck) duck(when);
}

/** Schedule a whole guess arc in one burst, so nothing can drift off the beat. */
export function playArc(steps: ArcStep[]): void {
  for (const step of steps) play(step.sfx, { delayMs: step.delayMs, rate: step.rate });
}

// ---------------------------------------------------------------------------
// Bed shaping
// ---------------------------------------------------------------------------

/** Dip the bed under a sound starting at `when` (audio-clock seconds). */
export function duck(when: number): void {
  if (!ctx || !duckGain) return;
  const release = when + DUCK_ATTACK_MS / 1000;
  // An overlapping duck extends the dip rather than restarting the recovery
  // mid-fall, which would sound like a pump.
  const until = release + DUCK_RELEASE_MS / 1000;
  if (until < duckUntil) return;
  duckUntil = until;

  const g = duckGain.gain;
  g.cancelScheduledValues(when);
  g.setValueAtTime(g.value, when);
  g.linearRampToValueAtTime(DUCK_GAIN, release);
  g.linearRampToValueAtTime(1, until);
}

/**
 * Low-pass the bed while a modal is open — the music "goes into the next room".
 *
 * A count rather than a boolean because modals can stack (the how-to closes
 * into a notice, the notice into the check), and a close that unmuffled while
 * another card was still up would pop the music back mid-conversation.
 */
let muffleDepth = 0;
export function setMuffled(on: boolean): void {
  muffleDepth = Math.max(0, muffleDepth + (on ? 1 : -1));
  if (!ctx || !muffle) return;
  const target = muffleDepth > 0 ? MUFFLE_HZ : OPEN_HZ;
  const f = muffle.frequency;
  f.cancelScheduledValues(ctx.currentTime);
  f.setValueAtTime(f.value, ctx.currentTime);
  f.exponentialRampToValueAtTime(target, ctx.currentTime + 0.18);
}

// ---------------------------------------------------------------------------
// Mute
// ---------------------------------------------------------------------------

/**
 * Silence or restore everything.
 *
 * Ramped rather than switched, because a gain step to zero mid-waveform is an
 * audible click — the one sound in the game nobody licensed. The music source
 * keeps running underneath, so unmuting resumes the bed in place instead of
 * restarting the loop from the top of a phrase.
 */
export function setEngineMuted(next: boolean): void {
  muted = next;
  if (!ctx || !masterGain) return;
  const g = masterGain.gain;
  const now = ctx.currentTime;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(next ? 0 : 1, now + MUTE_RAMP_MS / 1000);
}

// ---------------------------------------------------------------------------
// Dev-only fallback
// ---------------------------------------------------------------------------

/**
 * A synthesised blip standing in for a sound whose file hasn't been licensed
 * yet. **Development only** — `import.meta.env.DEV` is statically false in a
 * production build, so this function and its call are dropped entirely.
 *
 * It exists because the thing most likely to be wrong about this system is its
 * *timing* — whether the ticket lands on the print, whether the four flips read
 * as a run — and no unit test can hear that. A distinct pitch per sound makes
 * the whole guess arc audible as a sequence months before there's anything to
 * license. Delete it once real assets land, or keep it as a canary for a
 * filename that stopped matching the registry.
 */
function devBlip(name: SfxName, gain: number, when: number, rate: number): void {
  if (!ctx || !sfxGain) return;
  // Deterministic pitch per name, spread over two octaves from ~220Hz.
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const freq = 220 * Math.pow(2, (hash % 24) / 12) * rate;

  try {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const env = ctx.createGain();
    // Short, with a fast decay: enough to place the event in time, not enough
    // to be mistaken for a design decision.
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(gain * 0.25, when + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
    osc.connect(env);
    env.connect(sfxGain);
    osc.start(when);
    osc.stop(when + 0.14);
    osc.onended = () => env.disconnect();
  } catch {
    /* dev nicety; never worth an error */
  }
}
