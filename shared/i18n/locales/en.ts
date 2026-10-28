// English: the source of truth for every player-facing string.
//
// Every other locale is typed `Messages` (the shape of this object), so tsc
// fails on a missing or misspelled key. A message is a string, or a function
// for anything with a value in it; keep functions to plain arguments so the
// catalog can still be exported for an outside translation tool.
//
// New strings land here first. `/admin` stays English and has no entries.

import type { OccasionId } from "../../occasions";
import type { Course, MatchLevel, Profile, Protein, Region, Spirit, Temperature } from "../../types";
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
  spirits: {
    gin: "gin",
    whiskey: "whiskey",
    rum: "rum",
    tequila: "tequila",
    vodka: "vodka",
    brandy: "brandy",
    wine: "wine",
    beer: "beer",
    none: "none",
    other: "other",
  } satisfies Record<Spirit, string>,
  profiles: {
    sweet: "sweet",
    sour: "sour",
    bitter: "bitter",
    strong: "strong",
    creamy: "creamy",
  } satisfies Record<Profile, string>,
  /** Every dialog's × button. */
  close: "Close",

  // ---- The board's pieces (src/game/components.tsx) ---------------------------

  /** The tiles' own labels, as printed over each value. */
  tiles: {
    country: "Country",
    course: "Course",
    served: "Served",
    protein: "Protein",
    spirit: "Spirit",
    profile: "Profile",
    noSpirit: "no spirit",
  },
  row: {
    askingKitchen: "asking the kitchen…",
    askingBar: "asking the bar…",
    ingredients: (matched: number, of: number) => `${matched}/${of} ingredients`,
    close: (n: number) => ` · ${n} close`,
    /** Hidden after a close chip: the family is content and stays English until phase 2. */
    closeChip: (family: string) => `, close: something in the Special is in the ${family} family`,
  },
  story: {
    hideClues: "Hide the clues",
    hideCoasters: "Hide the coasters",
    allClues: (n: number) => `All ${n} clues`,
    allCoasters: (n: number) => `All ${n} coasters`,
  },
  punchCard: {
    last: "Last order",
    left: (n: number) => `${guesses(n)} left`,
  },
  ticket: {
    clue: (n: number) => `Order up — clue #${n}`,
    coaster: (n: number) => `On the house — coaster #${n}`,
  },
  input: {
    placeholder: "Order a dish…",
    label: "Guess a dish",
    order: "Order",
    matches: (label: string) => `Matches for ${label.toLowerCase()}`,
    empty: "Not on the menu — try another dish",
  },
  countdown: {
    label: "Next Special",
    inline: "Next Special in",
  },
  /** The share button's states (src/game/useShare.ts). */
  shareButton: {
    idle: "Share",
    working: "Plating up…",
    channel: "Sent to the channel!",
    sent: "Shared!",
    copiedDiscord: "Copied — paste it in chat!",
    copied: "Copied!",
    failed: "Tap to retry",
  },
  byline: {
    createdBy: "Created by",
    newTab: " (LinkedIn, opens in a new tab)",
  },

  // ---- Notes, Leftovers, requests --------------------------------------------

  notice: {
    eyebrow: "A note from the kitchen",
    count: (position: number, total: number) => `${position} of ${total}`,
    next: "Next note",
    done: "Continue",
  },
  archive: {
    title: "Leftovers",
    lede: "Replay any Special you missed.",
    won: "solved",
    lost: "missed",
    playing: "in progress",
    unplayed: "not played",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    chefsChoice: "Chef's Choice",
    chefsChoiceNote: "A dish at random — won't touch your streak.",
    cookMe: "Cook me something",
    /** A calendar day's accessible name. Leads with the number the cell shows (WCAG 2.5.3). */
    day: (day: number, puzzle: number) => `${day}, Special No. ${puzzle}`,
    today: " (today)",
    recovered: (n: number) => ` on the day in ${guesses(n)}`,
  },
  requests: {
    dish: {
      toggle: "Suggest a dish for the menu",
      title: "Suggest a dish for the menu",
      namePlaceholder: "Dish name (required)",
      submit: "Send to the kitchen",
      thanks: "Thanks, hon — the cook's got your request!",
      stampTitle: "Off a customer's ticket",
      stampBody: (name: string) => `A regular asked for ${name}. Yours could be next.`,
      served: (name: string, day: string) => `Good taste, hon: ${name} was the Special on ${day}.`,
    },
    drink: {
      toggle: "Suggest a drink for the bar",
      title: "Suggest a drink for the bar",
      namePlaceholder: "Drink name (required)",
      submit: "Send to the bar",
      thanks: "Thanks — the bartender's got your request!",
      stampTitle: "Off a regular's tab",
      stampBody: (name: string) => `Somebody at the bar asked for ${name}. Yours could be next.`,
      served: (name: string, day: string) => `Good taste: ${name} was poured on ${day}.`,
    },
    orderFromLeftovers: "Order it from Leftovers",
    countryPlaceholder: "Country of origin (optional)",
    notePlaceholder: "Anything else? (optional)",
    error: "Couldn't send that — try again.",
    sending: "Sending…",
    cancel: "Never mind",
  },

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
    /** Printed in the pantry column of the winning row. */
    winDay: "ORDER UP",
    winNight: "POURED",
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
    name: "Kids' Menu",
    coach: "**Stuck?** Open the Kids' Menu to see every dish that could still be the answer.",
    dismissCoach: "Dismiss the Kids' Menu tip",
    ordered: "ordered",
    circled: (name: string) => `Circled: **${name}**`,
    tapToCircle: "Tap a dish to circle it.",
    order: "Order it",
    fine: "For diners 12 and under. We won't check.",
    error: "The kitchen lost the crayons. Close this and try again.",
    loading: "Fetching the crayons…",
    confirmed: "Confirmed",
    /** Section heads, by course. */
    courses: {
      breakfast: "Breakfast",
      appetizer: "Appetizers",
      entree: "Entrees",
      dessert: "Desserts",
      drink: "Drinks",
    } satisfies Record<Course, string>,
  },
  /** The three first-visit coach marks (src/game/Coach.tsx). */
  coach: {
    legendHit: "match",
    legendNear: "close",
    legendMiss: "miss",
    order: "**Guess today's mystery dish.** Type any dish to start.",
    pick: "**Pick one, then hit Order.**",
    read: "**Green is right, yellow is close.** Each miss also gets you a clue.",
    skip: "Skip the walkthrough",
  },

  // ---- Occasions --------------------------------------------------------------
  // A costume's words, by occasion. The kit (src/occasions/<id>/) points here.

  occasions: {
    halloween: {
      /** Said on a calendar day that wore the costume. */
      name: "Halloween",
      shareLine: "🎃 Graveyard shift at Lunch Special",
      knock: "Knock on the cloche",
      boo: "Boo.",
      copy: {
        sub: "Open for the graveyard shift",
        thanks: "Best food in town, if you dare",
        fine: "No substitutions on the Special · Ask about our pumpkin pie",
        barSub: "One drink. Four guesses. Gone by the witching hour.",
      },
    },
  } satisfies Record<OccasionId, { name: string; shareLine: string; knock: string; boo: string; copy: Record<string, string> }>,

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

  // ---- The diner (src/game/GamePage.tsx) ---------------------------------------
  // `**bold**` in a message renders as <strong> (InlineMarkdown).

  /** The toast on a win, by guess count: Wordle's "Genius / Magnificent / …", in diner. */
  winToasts: ["Chef's kiss!", "Order up!", "Nailed it, hon!", "Nice work!", "Just in time!", "Phew — saved it!"],
  howTo: {
    goal: (tries: number) => `Guess the **Special**, a mystery dish from somewhere in the world. You get ${tries} tries.`,
    feedback: "Each guess shows which ingredients you got right, and how close its country, course, temperature and protein are:",
    legendHit: "✓ right (green)",
    legendNear: "~ close (yellow)",
    legendMiss: "× wrong (gray)",
    yellow: "A yellow country is in the same region. A yellow ingredient (≈) is a near swap, like lemon for lime.",
    clues:
      "Every miss gets you a **clue**. Stuck after four misses? The **Kids' Menu** lists every dish that could still be the answer.",
    leftovers: "Finish today's Special to unlock **Leftovers**, every past Special.",
  },
  stats: {
    title: "My stats",
    played: "Played",
    winRate: "Win rate",
    streak: "Streak",
    best: "Best",
    empty: "No orders yet.",
  },
  board: {
    sub: "The daily dish guessing game",
    previewAdmin: "Admin test play — nothing is saved, counted or shown to players",
    playtest: (slug: string) => `Playtest — pinned to “${slug}”, nothing is saved`,
    showcase: "Preview: this Special is already solved so you can look around. Nothing is saved.",
    newDay: "A new Special is up",
    serveIt: "Serve it",
    archive: "From the archive",
    backToToday: "Back to today",
    random: "Random recipe — nothing saved",
    newRandom: "New random dish",
    company: (n: number) =>
      plural("en", n, { one: "1 other is at the counter", other: `${n} others are at the counter` }),
    titleArchive: "From the Archive",
    titleToday: "Today's Menu",
    specialNo: (n: number) => `Special No. ${n} — `,
    leftovers: "Leftovers",
    yourCheck: "Your check",
    specialRandom: "Chef's choice",
    specialDaily: "Daily Special",
    onTheHouse: "on the house",
    hint: (n: number) =>
      `A mystery dish with **${plural("en", n, { one: "1 ingredient", other: `${n} ingredients` })}**. What'll it be?`,
    loading: "Firing up the grill…",
    guessFailed: "The kitchen didn't catch that order. Check your connection and try again.",
  },
  barBand: {
    soon: "After Dark opens at 8, your time.",
    open: "The bar's open",
    openSub: "One drink, four guesses, gone by morning",
    settled: "Your tab is at the bar",
    settledSub: "Go back and take another look",
  },
  check: {
    number: "No.",
    date: "Date",
    orders: "Orders",
    ordersOf: (n: number, max: number) => `${n} of ${max}`,
    menu: "Menu",
    menuRandom: "Chef's Choice",
    menuDaily: "Daily Special",
    menuLeftover: "Leftovers",
    won: "On the house!",
    lostDaily: "Better luck tomorrow",
    lostOther: "Better luck next time",
    served: (temperature: string) => `served ${temperature}`,
    playAgain: "Play again",
    invite: "Invite the table",
  },

  // ---- After Dark (src/game/NightPage.tsx) --------------------------------------

  pourToasts: ["Smooth.", "Nice call.", "Got there.", "Last sip, hon."],
  bar: {
    sub: "One drink. Four guesses. Gone by morning.",
    closedSign: "The bar's closed",
    closedBody: "Open 8pm to 3am, your time. One drink a night, four guesses.",
    opensIn: "Opens in",
    backToDiner: "Back to the diner",
    doorSign: "Kitchen first",
    doorBody: "Finish today's Special to open the bar.",
    doorBack: "Take me to today's Special",
    intro: "**Same game, two new tiles.** Spirit and Profile replace Course and Protein.",
    nights: "Nights",
    previewShowcase: "Preview link — the bar's normally open 8pm to 3am. Nothing here is saved.",
    previewAdmin: "Admin test pour — nothing is saved, counted or shown to players",
    playtestRandom: "Playtest — a random pour, nothing is saved",
    title: "Libations",
    nightNo: (n: number) => `Night No. ${n} — `,
    yourTab: "Your tab",
    lastCall: "Last call in",
    nothingOnTap: "Nothing on tap",
    special: "Tonight's Nightcap",
    hint: (n: number) =>
      `A mystery pour with **${plural("en", n, { one: "1 ingredient", other: `${n} ingredients` })}**. What's it going to be?`,
    loading: "Wiping down the bar…",
    placeholder: "Order a drink…",
    inputLabel: "Guess a drink",
    guessFailed: "The bar didn't catch that order. Check your connection and try again.",
    thanks: "Last call at three",
    fine: (coasters: number) => `One pour a night · ${coasters} coasters · Please drink responsibly`,
    shareIdle: "Share the night",
    tabTitle: "After Dark — your tab",
    won: "That one's on us",
    lost: "Better luck tomorrow night",
    noSpirit: "no base spirit",
    alcoholFree: "alcohol-free",
  },
};

export default en;
