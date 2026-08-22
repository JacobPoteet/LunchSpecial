# Sound effects

Drop the licensed one-shots in here, named exactly as below. **That is the whole
installation step** — there is no flag to flip and no code to change. The
registry in [`shared/audio.ts`](../../../shared/audio.ts) names these files, and
`src/audio/engine.ts` resolves them with `import.meta.glob`; a name with no file
is simply a sound the game doesn't make, which is why this directory can sit
empty and everything still builds and runs.

| File | Marks |
|---|---|
| `guess-submit.wav` | an order is sent to the kitchen |
| `tile-flip.wav` | one attribute tile turning over (played 4×, pitched up each time) |
| `chip-land.wav` | the ingredient chips settling — one sound for the whole burst |
| `ticket-print.wav` | a clue chatters out of the printer. **~0.5s of motor**, not a click |
| `guess-correct.wav` | the winning order lands |
| `win-bell.wav` | the service bell. Also used for the new-Special bar |
| `round-lost.wav` | out of guesses. Sympathetic, *not* a fail buzzer |
| `receipt-print.wav` | the check prints — a till roll, distinct from the ticket printer |
| `fan-stamp.wav` | a rubber stamp pressing onto the check |
| `stat-pop.wav` | the player's own bar in the guess distribution |
| `modal-open.wav` / `modal-close.wav` | a card sliding up / back down |
| `notice-drop.wav` | a notice dropping in from above and bouncing |
| `ui-click.wav` | any button. The most-heard sound in the game — keep it tiny |
| `option-tick.wav` | arrow-keying through the dish list |
| `share-success.wav` | the check went to the clipboard or the channel |
| `error.wav` | the kitchen is closed, or a share failed |

`.wav` is what the registry currently names; `.m4a`, `.opus` and `.mp3` also
resolve if you change the `file` field to match. Prefer WAV for one-shots —
AAC/MP3 encoders bake in 20–45ms of silence at the head that `decodeAudioData`
won't strip, and that lands directly on the front of every sound.

**Requirements and the full spec are in [ASSETS.md](../../../ASSETS.md).** The
short version: 48kHz mono, trimmed hard to the transient with *zero* leading
silence, dry, peak-normalised to −1 dBTP. Balance between sounds is set in code
(`gain` in the registry), not in the files.
