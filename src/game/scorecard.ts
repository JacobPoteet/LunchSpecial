// Draws the shareable score card as a PNG.
//
// Discord's share-moment dialog posts a *picture*, not text, so a Discord player
// who wants their round in the channel needs one drawn. What it says is the pure
// fold in shared/scorecard.ts; this is the paint.
//
// Two things are deliberate about how it's drawn:
//
// 1. **Tiles are rectangles, not emoji.** The shared *text* uses 🟩🟨⬜ because
//    it has to survive being pasted anywhere. A canvas doesn't: `fillText` on an
//    emoji hands the job to whatever font the device happens to have, which is
//    exactly the part of the image that would look wrong on somebody else's
//    phone. Rects in the game's own palette can't.
// 2. **The palette is hard-coded, not read from CSS.** The card is generated
//    inside a Discord iframe and then lives in a channel forever; resolving
//    custom properties at draw time would make the artefact depend on whatever
//    stylesheet happened to be loaded. These are the values in base.css.

import type { MatchLevel } from "../../shared/types";
import type { Scorecard } from "../../shared/scorecard";

/**
 * From base.css, one palette per room. Kept in sync by eye — a drift here is a
 * wrong-coloured tile, not a crash.
 *
 * The night set is the same green and mustard against a dark card, because the
 * two grids have to stay readable as the *same game* when a channel has both
 * pasted into it. Only the ground, the ink and the miss change, which is the
 * same swap the text grid makes when it blacks out its miss square.
 */
const PALETTE = {
  day: {
    paper: "#fbf4e0",
    paperEdge: "#e6d9b8",
    ink: "#2b2320",
    inkSoft: "#5b4f45",
    accent: "#1b4f4a",
    hit: "#2e7d4f",
    near: "#e8a53a",
    miss: "#a99e8f",
    onHit: "#fbf4e0",
    /** What the winning row says instead of a pantry count. */
    winWord: "ORDER UP",
  },
  night: {
    paper: "#201a15",
    paperEdge: "#453629",
    ink: "#f2e7d5",
    inkSoft: "#b6a793",
    accent: "#ff5f7a",
    hit: "#2e7d4f",
    near: "#e8a53a",
    miss: "#3a322a",
    onHit: "#ffffff",
    winWord: "POURED",
  },
} as const;

type Palette = (typeof PALETTE)[keyof typeof PALETTE];

const tileColor = (c: Palette): Record<MatchLevel, string> => ({
  hit: c.hit,
  near: c.near,
  miss: c.miss,
});

// Laid out at 2x and drawn at 2x, so the card is crisp on a phone without any
// devicePixelRatio guesswork — it's an image file, not a live element.
const SCALE = 2;
const WIDTH = 440;
const PAD = 28;
const TILE = 34;
const TILE_GAP = 8;
const ROW_GAP = 10;
const HEAD_H = 92;
const FOOT_H = 44;

/** Height depends on the guess count: a 2-guess win shouldn't ship 4 empty rows. */
function heightFor(rows: number): number {
  return HEAD_H + rows * (TILE + ROW_GAP) - ROW_GAP + FOOT_H;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

/**
 * Paint `card` onto a canvas and hand back a PNG blob, or null if the browser
 * won't give us a 2D context or an encoder.
 *
 * Null is a real outcome rather than a throw: the caller's job is to fall back
 * to copying the text, and a share button must never surface a drawing failure
 * to the player.
 */
export async function drawScorecard(card: Scorecard): Promise<Blob | null> {
  // The room the card was folded in. Chosen by the fold, not read from the
  // document: the picture lives in a channel forever and must not depend on
  // which stylesheet happened to be loaded when it was drawn.
  const COLOR = PALETTE[card.theme];
  const TILE_COLOR = tileColor(COLOR);
  const height = heightFor(card.rows.length);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = COLOR.paper;
  ctx.fillRect(0, 0, WIDTH, height);

  // The card's own border, so it reads as a check torn off a pad rather than as
  // a screenshot with a transparent edge against whatever Discord's theme is.
  ctx.strokeStyle = COLOR.paperEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, WIDTH - 2, height - 2);

  ctx.textAlign = "center";
  ctx.fillStyle = COLOR.accent;
  ctx.font = `700 30px Georgia, "Times New Roman", serif`;
  ctx.fillText(card.title, WIDTH / 2, PAD + 26);

  ctx.fillStyle = COLOR.ink;
  ctx.font = `600 20px Georgia, "Times New Roman", serif`;
  ctx.fillText(card.subtitle, WIDTH / 2, PAD + 56);

  // Rows are centred as a block: four tiles, a gap, then the pantry count, which
  // is the shape the board itself uses.
  const pantryW = 78;
  const rowW = 4 * TILE + 3 * TILE_GAP + TILE_GAP + pantryW;
  const rowX = (WIDTH - rowW) / 2;

  card.rows.forEach((row, i) => {
    const y = HEAD_H + i * (TILE + ROW_GAP);
    row.tiles.forEach((tile, t) => {
      ctx.fillStyle = TILE_COLOR[tile];
      roundRect(ctx, rowX + t * (TILE + TILE_GAP), y, TILE, TILE, 6);
    });

    const px = rowX + 4 * (TILE + TILE_GAP);
    ctx.textAlign = "center";
    if (row.correct) {
      // The winning row's pantry count is a foregone conclusion, so it gets the
      // diner's own words instead — the board says "Order up!" here too. A pill
      // rather than the 🛎️ glyph, for the same reason the tiles aren't emoji.
      ctx.fillStyle = COLOR.hit;
      roundRect(ctx, px, y, pantryW, TILE, 6);
      // Not COLOR.paper: on the night card the paper IS dark, so the pill's
      // text would vanish into its own fill. The token that means "text on the
      // hit colour" is the one that survives the theme, exactly as --on-hit
      // does in the stylesheet.
      ctx.fillStyle = COLOR.onHit;
      ctx.font = `700 14px Georgia, "Times New Roman", serif`;
      ctx.fillText(COLOR.winWord, px + pantryW / 2, y + TILE / 2 + 5);
    } else {
      ctx.fillStyle = COLOR.inkSoft;
      ctx.font = `600 17px Georgia, "Times New Roman", serif`;
      ctx.fillText(row.pantry, px + pantryW / 2, y + TILE / 2 + 6);
    }
  });

  ctx.textAlign = "center";
  ctx.fillStyle = COLOR.inkSoft;
  ctx.font = `500 16px Georgia, "Times New Roman", serif`;
  ctx.fillText(card.footer, WIDTH / 2, height - PAD + 6);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}
