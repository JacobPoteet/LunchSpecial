// The score card's slice of pie, as pixels.
//
// The card is drawn in rects and never emoji (src/game/scorecard.ts), so its
// one piece of Thanksgiving is too. One character per pixel; `.` is paper.
// Static and tiny, so the drawing imports it directly rather than waiting on
// the costume's chunk. A wedge of pumpkin pie seen from the side, the point to
// the left, the crust standing up at the back, cream on top.

export const PIE_PIXELS = [
  "........ee..",
  ".......wwwe.",
  "......wwwwwe",
  ".....ffeeeff",
  "...ffffffffc",
  ".fffffffffcc",
  "gggggggggccc",
  "gggggggggccc",
  "ccccccccccdd",
  ".ddddddddddd",
];

export const PIE_COLORS: Record<string, string> = {
  w: "#fffaf0",
  e: "#e6d3ae",
  f: "#d9782f",
  g: "#b85f22",
  c: "#d9a35a",
  d: "#a8702f",
};
