// The ambient bed.
//
// One looping buffer, started after the first gesture and left running for the
// life of the page. It is furniture: nothing in the game ever waits on it, and
// every function here is a no-op when the file hasn't been licensed yet.
//
// Why a decoded AudioBuffer rather than a streaming media element: only a
// buffer can loop on an exact sample. A media element re-triggering at its own
// edge leaves a gap you hear every time round, and a bed with a seam in it is
// worse than no bed. The cost is memory — see the note on MUSIC in
// shared/audio.ts — which is what keeps the licensed track short.

import { MUSIC } from "../../shared/audio";
import { loadMusic, musicInput, audioContext } from "./engine";

let source: AudioBufferSourceNode | null = null;
let starting = false;

/** Whether the bed is currently playing (or about to be). */
export function isMusicPlaying(): boolean {
  return source !== null || starting;
}

/**
 * Start the bed. Safe to call repeatedly; only the first call does anything.
 *
 * Deliberately fire-and-forget — the caller is a preference change or an
 * unlock handler, and neither should be made async by a flourish.
 */
export function startMusic(): void {
  if (source || starting) return;
  starting = true;

  void loadMusic()
    .then((buffer) => {
      const ctx = audioContext();
      const input = musicInput();
      // A second call may have landed, or the player may have turned the bed
      // off again while the file was in flight.
      if (!buffer || !ctx || !input || source || !starting) return;

      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.loop = true;
      // Zero/zero means "the whole buffer"; a licensed file with real loop
      // points can name them and take up the slack of an imperfect trim
      // without being re-encoded.
      if (MUSIC.loopEnd > MUSIC.loopStart) {
        node.loopStart = MUSIC.loopStart;
        node.loopEnd = MUSIC.loopEnd;
      }
      node.connect(input);
      node.start();
      source = node;
    })
    .catch(() => {
      /* an absent or undecodable bed is simply no bed */
    })
    .finally(() => {
      starting = false;
    });
}

/**
 * Stop the bed and release it.
 *
 * Stopped rather than merely silenced: a looping source runs its own graph
 * forever, and a player who turned the music off shouldn't be paying for it.
 * Restarting re-enters at the top of the loop, which is the right behaviour for
 * a deliberate off-then-on — unlike mute, which holds the bed in place so the
 * phrase resumes where it was.
 */
export function stopMusic(): void {
  starting = false;
  if (!source) return;
  try {
    source.stop();
    source.disconnect();
  } catch {
    /* already stopped */
  }
  source = null;
}
