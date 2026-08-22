// What this device has decided about sound.
//
// One localStorage key, alongside the eight the game already keeps. Same
// anonymous, no-accounts model as everything else: this is a browser's
// preference, not a person's, and it doesn't follow you to your phone.
//
// The stored fields are deliberately *optional*. An absent field means "this
// device has never said", which is what lets AUDIO_DEFAULTS in shared/audio.ts
// stay the single source of a default — a player on the web who has never
// touched the toggle picks up a policy change for free, and one who has
// touched it keeps their answer. Writing a resolved snapshot at first run
// instead would silently freeze today's defaults onto every existing device.

import { defaultPrefs, type AudioPrefs } from "../../shared/audio";
import type { Surface } from "../../shared/types";

const KEY = "lunch-special:sound";

interface StoredPrefs {
  /** Set only by the mute button. Absent until the player touches it. */
  muted?: boolean;
  /** No UI yet; the surface default decides. Here so splitting the control later is a UI change. */
  music?: boolean;
  /** How many times the toggle has been pressed on this device. See below. */
  toggles?: number;
}

function read(): StoredPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const { muted, music, toggles } = parsed as StoredPrefs;
    return {
      muted: typeof muted === "boolean" ? muted : undefined,
      music: typeof music === "boolean" ? music : undefined,
      toggles: typeof toggles === "number" && toggles >= 0 ? toggles : undefined,
    };
  } catch {
    // Storage blocked (private mode) or corrupt JSON — fall back to defaults
    // rather than letting a preference read break the game.
    return {};
  }
}

function write(next: StoredPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* nothing to do; the choice just won't survive the session */
  }
}

/** This device's effective preferences: what it chose, else what the surface starts with. */
export function loadPrefs(surface: Surface): AudioPrefs {
  const stored = read();
  const base = defaultPrefs(surface);
  return {
    muted: stored.muted ?? base.muted,
    music: stored.music ?? base.music,
  };
}

/**
 * Record an explicit mute choice and return the running toggle count.
 *
 * The count is the whole of the "for fun" tracking: it separates a device that
 * muted once and left it from one that keeps reaching for the button, which is
 * a different and more interesting thing to know. It is not a measurement of
 * anyone's audio experience and isn't treated as one anywhere.
 */
export function storeMuted(muted: boolean): number {
  const stored = read();
  const toggles = (stored.toggles ?? 0) + 1;
  write({ ...stored, muted, toggles });
  return toggles;
}
