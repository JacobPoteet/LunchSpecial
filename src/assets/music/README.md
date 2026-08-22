# Ambient bed

One licensed loop, named `diner-ambience.m4a` (or change `MUSIC.file` in
[`shared/audio.ts`](../../../shared/audio.ts) to match what you have). Empty is a
supported state: with no file the bed never plays and nothing else changes.

Unlike the effects, this is fetched **only after the player's first gesture** —
a visitor who bounces never downloads it.

Two things matter more than they look, both covered in
[ASSETS.md](../../../ASSETS.md):

- **It must loop seamlessly.** Most stock tracks sold as "loops" don't. If yours
  has real loop points, set `MUSIC.loopStart` / `loopEnd` in the registry and the
  player will use them instead of the buffer edges — that's the escape hatch for
  an imperfect trim, and it costs no re-encoding.
- **Keep it to 45–90 seconds.** It's decoded to a Float32 buffer, so a 60s
  stereo track at 48kHz is ~23MB resident on the player's device.

Mix it restrained (−20 to −18 LUFS) and free of sharp transients — anything
percussive in the bed gets mistaken for game feedback.
