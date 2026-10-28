// English: the source of truth for every player-facing string.
//
// Every other locale is typed `Messages` (the shape of this object), so tsc
// fails on a missing or misspelled key. A message is a string, or a function
// for anything with a value in it; keep functions to plain arguments so the
// catalog can still be exported for an outside translation tool.
//
// New strings land here first. `/admin` stays English and has no entries.

const en = {
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
