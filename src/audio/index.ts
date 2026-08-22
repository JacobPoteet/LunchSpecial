// The game's audio API. Everything outside src/audio/ imports from here.
//
// Deliberately small and total: every function is safe to call at any time,
// from any surface, before or after the context exists, with or without any
// audio files on disk. Nothing here throws and nothing here returns a promise
// the caller has to think about — sound is a flourish on top of a game that has
// to keep working when it's absent.

import { guessArc, type ArcInput, type SfxName } from "../../shared/audio";
import type { Surface } from "../../shared/types";
import {
  audioAvailable,
  initAudio,
  onUnlock,
  play,
  playArc,
  preloadSfx,
  setEngineMuted,
  setMuffled,
  unlock,
} from "./engine";
import { startMusic, stopMusic } from "./music";
import { loadPrefs, storeMuted } from "./prefs";

export type { SfxName };
export { setMuffled, audioAvailable };

let prefs = { muted: false, music: false };
let ready = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

/** Subscribe to mute changes. Returns an unsubscribe, for useSyncExternalStore. */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isMuted(): boolean {
  return prefs.muted;
}

/**
 * Bring audio up for this surface.
 *
 * Called once from the game's mount. The context is built immediately but
 * starts suspended, so this costs a player nothing until they interact; the
 * listeners below are what turn it on, and they're attached in the capture
 * phase so a click that also stops propagation still counts as the gesture
 * that unlocked the page.
 */
export function setupAudio(surface: Surface): void {
  // A build with no licensed assets makes no sound, so it doesn't get a graph,
  // doesn't resume a context on the player's first tap, and doesn't show a mute
  // button. See `audioAvailable`.
  if (ready || !audioAvailable()) return;
  ready = true;

  prefs = loadPrefs(surface);
  initAudio();
  setEngineMuted(prefs.muted);
  preloadSfx();

  const kick = () => unlock();
  const opts = { capture: true, passive: true } as const;
  window.addEventListener("pointerdown", kick, opts);
  window.addEventListener("keydown", kick, opts);
  window.addEventListener("touchstart", kick, opts);

  // The bed can only start once the browser has let the context run, and only
  // if this surface's policy (or this device's choice) says it should.
  onUnlock(() => {
    window.removeEventListener("pointerdown", kick, opts);
    window.removeEventListener("keydown", kick, opts);
    window.removeEventListener("touchstart", kick, opts);
    if (prefs.music && !prefs.muted) startMusic();
  });
}

/**
 * Flip the mute state and report how many times this device has now done so.
 *
 * The count is returned rather than sent from here so the caller owns the
 * beacon: this module has no business knowing about analytics, and audio must
 * never be a reason a network call happens.
 */
export function toggleMuted(): { muted: boolean; toggles: number } {
  prefs = { ...prefs, muted: !prefs.muted };
  const toggles = storeMuted(prefs.muted);
  setEngineMuted(prefs.muted);

  // Mute holds the bed in place (the master gain is what fell), so unmuting
  // resumes mid-phrase. The only case needing a start is a player who muted
  // before the bed had ever been started.
  if (!prefs.muted && prefs.music) startMusic();

  notify();
  return { muted: prefs.muted, toggles };
}

/** Turn the ambient bed on or off without touching the mute state. No UI yet. */
export function setMusicEnabled(on: boolean): void {
  prefs = { ...prefs, music: on };
  if (on && !prefs.muted) startMusic();
  else stopMusic();
  notify();
}

/** Play one sound. See shared/audio.ts for what each name marks. */
export function playSfx(name: SfxName, opts?: { delayMs?: number; rate?: number }): void {
  play(name, opts);
}

/**
 * Sound one whole guess landing.
 *
 * The arc is computed as data and handed to the engine in a single burst so it
 * can be scheduled against the audio clock — see the note in shared/audio.ts.
 * Call it on the same render that sets the round, which is the origin every
 * offset is measured from.
 */
export function playGuessArc(input: ArcInput): void {
  playArc(guessArc(input));
}
