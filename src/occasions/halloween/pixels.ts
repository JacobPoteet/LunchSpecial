// The score card's jack-o'-lantern, as pixels.
//
// The card is drawn in rects and never emoji (src/game/scorecard.ts), so its
// one piece of Halloween is too. One character per pixel; `.` is paper.
// Static and tiny, so the drawing imports it directly rather than waiting on
// the costume's chunk.

export const JACK_PIXELS = [
  "......ss....",
  ".....ss.....",
  "..dooooood..",
  ".doooooooood",
  "doyyooooyyod",
  "dooyooooyood",
  "dooooooooood",
  "doyoyyyyoyod",
  "dooyyyyyyood",
  ".doooooooood",
  "..dooooood..",
];

export const JACK_COLORS: Record<string, string> = {
  s: "#5d6b2b",
  o: "#e9782a",
  d: "#b9501a",
  y: "#ffd45c",
};
