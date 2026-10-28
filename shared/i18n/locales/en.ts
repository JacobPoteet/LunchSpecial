// English: the source of truth for every player-facing string.
//
// Every other locale is typed `Messages` (the shape of this object), so tsc
// fails on a missing or misspelled key. A message is a string, or a function
// for anything with a value in it; keep functions to plain arguments so the
// catalog can still be exported for an outside translation tool.
//
// New strings land here first. `/admin` stays English and has no entries.

import type { OccasionId } from "../../occasions";
import type { Course, MatchLevel, Protein, Region, Temperature } from "../../types";
import { list, plural } from "../format";

const guesses = (n: number) => plural("en", n, { one: `${n} guess`, other: `${n} guesses` });
const dishes = (n: number) => plural("en", n, { one: `${n} dish`, other: `${n} dishes` });

const en = {
  /**
   * "Japan, pork and hot". House style has no serial comma, which is the
   * British list form; the words are the same.
   */
  and: (items: readonly string[]) => list("en-GB", items),

  // ---- The board's closed vocabularies --------------------------------------
  // The tile values a dish can take. Country names and ingredients are content
  // and stay English until phase 2.

  regions: {
    "north-america": "North America",
    "latin-america": "Latin America",
    europe: "Europe",
    "middle-east": "Middle East",
    africa: "Africa",
    "south-asia": "South Asia",
    "east-asia": "East Asia",
    "southeast-asia": "Southeast Asia",
    oceania: "Oceania",
  } satisfies Record<Region, string>,
  courses: {
    breakfast: "breakfast",
    appetizer: "appetizer",
    entree: "entree",
    dessert: "dessert",
    drink: "drink",
  } satisfies Record<Course, string>,
  temperatures: { hot: "hot", cold: "cold" } satisfies Record<Temperature, string>,
  proteins: {
    beef: "beef",
    pork: "pork",
    poultry: "poultry",
    seafood: "seafood",
    lamb: "lamb",
    vegetarian: "vegetarian",
  } satisfies Record<Protein, string>,

  // ---- What a screen reader hears (shared/announce.ts) ----------------------

  announce: {
    /** Also the tile's own hidden text, so the two can't describe one square two ways. */
    match: { hit: "match", near: "close", miss: "no match" } satisfies Record<MatchLevel, string>,
    dishTiles: { country: "country", course: "course", temperature: "served", protein: "protein" },
    drinkTiles: { country: "country", spirit: "base spirit", temperature: "served", profile: "profile" },
    tile: (label: string, verdict: string) => `${label} ${verdict}`,
    /** The region a near country tile names. */
    region: (region: string) => ` (${region})`,
    head: (guess: number, max: number, name: string) => `Guess ${guess} of ${max}: ${name}.`,
    ingredients: (matched: number, of: number) => `${matched} of ${of} ingredients match`,
    close: (n: number) => `, ${n} close`,
    left: (n: number) => (n === 0 ? "No guesses left." : `${guesses(n)} left.`),
    solved: (name: string, n: number) => `${name} is the Special. Solved in ${guesses(n)}.`,
    solvedNightcap: (name: string, n: number) => `${name} is tonight's Nightcap. Solved in ${guesses(n)}.`,
    clue: (index: number, text: string) => `Clue ${index}: ${text}`,
    coaster: (index: number, text: string) => `Coaster ${index}: ${text}`,
    kidsMenuAll: (n: number) => `Kids' Menu: ${dishes(n)} still on the menu.`,
    kidsMenu: (n: number, narrowed: string) => `Kids' Menu: ${dishes(n)}, ${narrowed}.`,
    circled: (name: string) => `Circled ${name}. Order it from the foot of the menu.`,
  },

  // ---- Share text, score card, Discord ---------------------------------------
  // Never the dish or the drink, in any language. The tests run every catalog.

  share: {
    lunchTitle: (puzzle: number, score: string) => `Lunch Special #${puzzle} — ${score}`,
    nightTitle: (night: number, score: string) => `After Dark · Night #${night} — ${score}`,
    nightTitleUnnumbered: (score: string) => `After Dark — ${score}`,
  },
  scorecard: {
    lunchSubtitle: (puzzle: number, score: string) => `No. ${puzzle} · ${score}`,
    nightSubtitle: (night: number, score: string) => `Night ${night} · ${score}`,
    /** The line above the card in the channel. `what` is the bolded game name and number. */
    progress: (live: boolean, what: string) => `${live ? "is" : "was"} playing ${what}`,
    lunchNumber: (puzzle: number) => `No. ${puzzle}`,
    nightNumber: (night: number) => `Night ${night}`,
  },
  presence: {
    modes: {
      daily: "Today's Special",
      leftover: "Leftovers",
      random: "Chef's Choice",
      nightcap: "After Dark",
    },
    numbered: (mode: string, puzzle: number) => `${mode} · No. ${puzzle}`,
    won: (n: number) => `Solved it in ${guesses(n)}`,
    lost: "Out of guesses",
    reading: "Reading the menu",
    on: (guess: number, max: number) => `Guess ${guess} of ${max}`,
  },

  // ---- The check and the board's small print ---------------------------------

  streak: {
    mark: (n: number) => `${n}-day streak`,
    lost: "Tomorrow's Special starts a new streak.",
    keep: (n: number) => `Come back tomorrow to keep your ${n}-day streak going.`,
    start: "Come back tomorrow to start a streak.",
  },
  tally: {
    room: (pct: number) => `${pct}% of diners got today's Special`,
    mostIn: (n: number) => `most in ${n}`,
  },
  stuck: "Nothing close yet. Try the clue ticket.",
  kidsMenu: {
    blurb: (n: number) =>
      plural("en", n, { one: "Only 1 dish could still be the answer.", other: `${n} dishes could still be the answer.` }),
  },

  // ---- Occasions --------------------------------------------------------------
  // A costume's words, by occasion. The kit (src/occasions/<id>/) points here.

  occasions: {
    halloween: {
      shareLine: "🎃 Graveyard shift at Lunch Special",
      copy: {
        sub: "Open for the graveyard shift",
        thanks: "Best food in town, if you dare",
        fine: "No substitutions on the Special · Ask about our pumpkin pie",
        barSub: "One drink. Four guesses. Gone by the witching hour.",
      },
    },
  } satisfies Record<OccasionId, { shareLine: string; copy: Record<string, string> }>,

  // ---- Screens ------------------------------------------------------------------

  sound: {
    mute: "Mute sound",
    unmute: "Unmute sound",
  },
  menuCard: {
    thanks: "Best food in town!",
    fine: "No substitutions on the Special · Ask about our pie",
    howToPlay: "How to play",
  },
  footer: {
    privacy: "Privacy",
    terms: "Terms",
    press: "Press",
  },
  closed: {
    sign: "Sorry — we're closed",
    body: "The kitchen isn't answering. Check your connection and try again.",
    retry: "Ring the bell again",
  },
};

export default en;
