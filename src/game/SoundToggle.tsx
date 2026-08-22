// The one visible audio control.
//
// A single mute button rather than separate music and effects switches. The
// game has no settings screen and no accounts, and a menu card is not the place
// to grow a mixing desk — one button that means "quiet, please" is what a
// player actually reaches for. The two buses exist underneath it (see
// shared/audio.ts), so splitting the control later is a change to this file and
// nothing else.

import { useSyncExternalStore } from "react";
import { beaconSound } from "../api";
import { isMuted, playSfx, subscribe, toggleMuted } from "../audio";
import { currentSurface } from "../discord/bootstrap";
import { peekPlayerId } from "./storage";

/**
 * A line-drawn speaker, in the shape the emoji uses so it reads instantly, but
 * drawn to match the toolbar rather than the system font: stroke-only, on
 * `currentColor` so it inherits the pill's hover inversion for free, at the
 * same 1.5px weight as the button borders around it.
 *
 * The cone is one closed path in both states; only the waves change, so the
 * two states share a silhouette and the swap reads as the sound leaving rather
 * than the icon being replaced.
 */
function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      className="sound-btn__icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      {muted ? (
        <>
          <path d="M16.6 9.4l4.4 5.2" />
          <path d="M21 9.4l-4.4 5.2" />
        </>
      ) : (
        <>
          <path d="M16.2 9.2a3.6 3.6 0 0 1 0 5.6" />
          <path d="M18.8 6.6a7.2 7.2 0 0 1 0 10.8" />
        </>
      )}
    </svg>
  );
}

export function SoundToggle() {
  const muted = useSyncExternalStore(subscribe, isMuted, () => false);

  const flip = () => {
    const next = toggleMuted();
    // Only the *un*mute gets a click: going quiet confirms itself, and a sound
    // played into a gain that's already falling is a half-swallowed blip.
    if (!next.muted) playSfx("ui-click");

    const playerId = peekPlayerId();
    if (playerId) beaconSound({ playerId, surface: currentSurface(), muted: next.muted, toggles: next.toggles });
  };

  const label = muted ? "Unmute sound" : "Mute sound";
  return (
    <button className="sound-btn" onClick={flip} aria-label={label} aria-pressed={muted} title={label}>
      <SpeakerIcon muted={muted} />
    </button>
  );
}
