import { describe, expect, it } from "vitest";
import {
  AUDIO_DEFAULTS,
  CHIP_LAND_MS,
  FLIP_RATE_STEP,
  MUSIC,
  ROUND_LOST_MS,
  SFX,
  TICKET_MS,
  TILE_COUNT,
  TILE_FLIP_START_MS,
  TILE_FLIP_STEP_MS,
  WIN_BELL_MS,
  DEDUPE_MS,
  type AudioPrefs,
  type SfxName,
  defaultPrefs,
  flipRate,
  guessArc,
  isDuplicateSchedule,
  shouldPlay,
} from "./audio";
import { SURFACES } from "./types";

const NAMES = Object.keys(SFX) as SfxName[];

describe("the SFX registry", () => {
  it("gives every sound a file and a gain inside the mix", () => {
    expect(NAMES.length).toBeGreaterThan(0);
    for (const name of NAMES) {
      expect(SFX[name].file).toMatch(/^[a-z0-9-]+\.(wav|m4a|opus|mp3)$/);
      expect(SFX[name].gain).toBeGreaterThan(0);
      expect(SFX[name].gain).toBeLessThanOrEqual(1);
    }
  });

  // The two most frequent sounds in the game. A click you notice is a click
  // you'll come to hate, so they must stay under everything they punctuate.
  it("keeps the sounds heard most often quietest", () => {
    const loudest = Math.max(...NAMES.map((n) => SFX[n].gain));
    expect(SFX["ui-click"].gain).toBeLessThan(loudest);
    expect(SFX["option-tick"].gain).toBeLessThanOrEqual(SFX["ui-click"].gain);
    expect(SFX["tile-flip"].gain).toBeLessThan(SFX["win-bell"].gain);
  });

  // Ducking the bed is for moments, not for punctuation: if everything ducks,
  // the music is just permanently quieter and the dip stops meaning anything.
  it("reserves ducking for the moments that matter", () => {
    const ducks = NAMES.filter((n) => SFX[n].duck);
    // Five, and each one ends a round or changes the room: the check printing,
    // running out, the bell, the pour that is the bar's bell, and the lights
    // going down on the way to it. Anything smaller than that stays out —
    // a list that grows is the bed getting permanently quieter.
    expect(ducks.sort()).toEqual(["lights-out", "pour", "receipt-print", "round-lost", "win-bell"]);
  });

  // The one deliberate alias: the call site says what happened, the loader
  // keys its cache on the filename so the shared file is still fetched once.
  it("points the new-day bell at the same file as the win bell", () => {
    expect(SFX["new-day-bell"].file).toBe(SFX["win-bell"].file);
  });

  it("gives the music bed a file and a restrained gain", () => {
    expect(MUSIC.file).toMatch(/\.(m4a|opus|mp3|wav)$/);
    // It's a bed under the effects, not a second foreground voice.
    expect(MUSIC.gain).toBeLessThan(Math.min(...NAMES.map((n) => SFX[n].gain)) + 0.2);
  });
});

describe("AUDIO_DEFAULTS", () => {
  it("covers every surface", () => {
    for (const surface of SURFACES) {
      expect(AUDIO_DEFAULTS[surface]).toBeDefined();
      expect(typeof AUDIO_DEFAULTS[surface].muted).toBe("boolean");
      expect(typeof AUDIO_DEFAULTS[surface].music).toBe("boolean");
    }
  });

  // The current policy. This assertion exists to be *edited* — it's the
  // tripwire that says a default moved on purpose rather than by accident.
  it("starts the bed inside Discord and not on the web", () => {
    expect(AUDIO_DEFAULTS.discord.music).toBe(true);
    expect(AUDIO_DEFAULTS.web.music).toBe(false);
  });

  // SFX are feedback, not atmosphere — they only ever answer something the
  // player just did, so there is nowhere it makes sense to start silent.
  it("never starts muted anywhere", () => {
    for (const surface of SURFACES) expect(AUDIO_DEFAULTS[surface].muted).toBe(false);
  });

  it("hands back a copy, so a caller can't edit the table through it", () => {
    const prefs = defaultPrefs("web");
    prefs.music = true;
    expect(AUDIO_DEFAULTS.web.music).toBe(false);
  });
});

describe("shouldPlay", () => {
  const on: AudioPrefs = { muted: false, music: true };

  it("stays silent until the context is unlocked", () => {
    expect(shouldPlay("sfx", on, false)).toBe(false);
    expect(shouldPlay("music", on, false)).toBe(false);
  });

  it("lets the mute button silence both buses", () => {
    const muted: AudioPrefs = { muted: true, music: true };
    expect(shouldPlay("sfx", muted, true)).toBe(false);
    expect(shouldPlay("music", muted, true)).toBe(false);
  });

  // The music preference is the bed's alone: turning the ambience off must
  // not take the game's feedback with it.
  it("silences the bed without silencing the effects", () => {
    const quiet: AudioPrefs = { muted: false, music: false };
    expect(shouldPlay("music", quiet, true)).toBe(false);
    expect(shouldPlay("sfx", quiet, true)).toBe(true);
  });

  it("plays both when everything is on", () => {
    expect(shouldPlay("sfx", on, true)).toBe(true);
    expect(shouldPlay("music", on, true)).toBe(true);
  });
});

describe("flipRate", () => {
  it("steps up once per tile", () => {
    expect(flipRate(0)).toBeCloseTo(1);
    expect(flipRate(1)).toBeCloseTo(1 + FLIP_RATE_STEP);
    expect(flipRate(3)).toBeCloseTo(1 + FLIP_RATE_STEP * 3);
  });

  it("rises with every tile, so the run always reads upward", () => {
    for (let i = 1; i < TILE_COUNT; i++) expect(flipRate(i)).toBeGreaterThan(flipRate(i - 1));
  });

  // A fifth tile is a bug; it should sound like the fourth rather than chirp.
  it("clamps instead of extrapolating", () => {
    expect(flipRate(9)).toBeCloseTo(flipRate(TILE_COUNT - 1));
    expect(flipRate(-3)).toBeCloseTo(1);
  });
});

describe("guessArc", () => {
  const miss = guessArc({ correct: false, lost: false, hasClue: true });

  it("schedules one flip per attribute tile, staggered and pitched", () => {
    const flips = miss.filter((s) => s.sfx === "tile-flip");
    expect(flips).toHaveLength(TILE_COUNT);
    expect(flips[0].delayMs).toBe(TILE_FLIP_START_MS);
    expect(flips[3].delayMs).toBe(TILE_FLIP_START_MS + TILE_FLIP_STEP_MS * 3);
    expect(flips[3].rate).toBeGreaterThan(flips[0].rate);
  });

  // One sound for the whole burst. The chips are 35ms apart, which is below
  // the point where separate sounds stop being separate and start being buzz.
  it("lands the ingredient chips once, not once per chip", () => {
    expect(miss.filter((s) => s.sfx === "chip-land")).toHaveLength(1);
    expect(miss.find((s) => s.sfx === "chip-land")?.delayMs).toBe(CHIP_LAND_MS);
  });

  it("prints the ticket on the same beat the CSS does", () => {
    expect(miss.find((s) => s.sfx === "ticket-print")?.delayMs).toBe(TICKET_MS);
  });

  it("has nothing to print when no clue follows the guess", () => {
    const arc = guessArc({ correct: false, lost: false, hasClue: false });
    expect(arc.some((s) => s.sfx === "ticket-print")).toBe(false);
  });

  it("rings the bell over the tile run on a win", () => {
    const arc = guessArc({ correct: true, lost: false, hasClue: false });
    expect(arc.find((s) => s.sfx === "guess-correct")?.delayMs).toBe(0);
    const bell = arc.find((s) => s.sfx === "win-bell");
    expect(bell?.delayMs).toBe(WIN_BELL_MS);
    // Over the flips, not after them.
    expect(bell!.delayMs).toBeLessThan(TILE_FLIP_START_MS + TILE_FLIP_STEP_MS * (TILE_COUNT - 1));
  });

  // GamePage opens the check 800ms after a loss; the sting has to get in first
  // or the receipt prints over the top of it.
  it("sounds a loss before the check can open over it", () => {
    const arc = guessArc({ correct: false, lost: true, hasClue: false });
    const lost = arc.find((s) => s.sfx === "round-lost");
    expect(lost?.delayMs).toBe(ROUND_LOST_MS);
    expect(lost!.delayMs).toBeLessThan(800);
  });

  it("never sounds a win and a loss in the same arc", () => {
    const arc = guessArc({ correct: true, lost: false, hasClue: false });
    expect(arc.some((s) => s.sfx === "round-lost")).toBe(false);
  });

  it("comes back in the order it will be heard", () => {
    const arc = guessArc({ correct: true, lost: false, hasClue: true });
    const delays = arc.map((s) => s.delayMs);
    expect([...delays].sort((a, b) => a - b)).toEqual(delays);
  });

  it("only names sounds that exist in the registry", () => {
    for (const step of guessArc({ correct: true, lost: true, hasClue: true })) {
      expect(SFX[step.sfx]).toBeDefined();
    }
  });
});

describe("isDuplicateSchedule", () => {
  it("allows the first firing of a sound", () => {
    expect(isDuplicateSchedule(1.5, undefined)).toBe(false);
  });

  // Two identical buffers on the same instant sum to one sound 6dB louder with
  // a click on the front. It is never what anyone meant.
  it("refuses the same sound landing on the same instant", () => {
    expect(isDuplicateSchedule(1.5, 1.5)).toBe(true);
  });

  it("refuses a near-simultaneous repeat in either direction", () => {
    expect(isDuplicateSchedule(1.5, 1.5 + (DEDUPE_MS - 5) / 1000)).toBe(true);
    expect(isDuplicateSchedule(1.5, 1.5 - (DEDUPE_MS - 5) / 1000)).toBe(true);
  });

  it("allows a repeat once it is clearly its own event", () => {
    expect(isDuplicateSchedule(1.5, 1.5 - (DEDUPE_MS + 5) / 1000)).toBe(false);
  });

  // The whole point of the window being small: four flips 90ms apart are a run,
  // not a double-fire, and must survive untouched.
  it("never eats the tile-flip run", () => {
    expect(DEDUPE_MS).toBeLessThan(TILE_FLIP_STEP_MS);
    const flips = guessArc({ correct: false, lost: false, hasClue: false }).filter((s) => s.sfx === "tile-flip");
    for (let i = 1; i < flips.length; i++) {
      const previous = flips[i - 1].delayMs / 1000;
      expect(isDuplicateSchedule(flips[i].delayMs / 1000, previous)).toBe(false);
    }
  });
});
