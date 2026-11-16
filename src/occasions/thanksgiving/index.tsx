// Thanksgiving: Turkey Day.
//
// Halloween turned the lights down; this turns them up. The diner at golden
// hour on the busiest day of its year: the menu reprinted in harvest colours
// (its own token swap, like the bar's), the neon re-tubed in warm amber with a
// wishbone hung off the sign, leaves drifting down the windows, a paper-leaf
// garland over the card and a kid's hand-traced turkey taped in its corner.
//
// Loaded only while it is worn (src/occasions/store.ts). Everything here is
// decoration: aria-hidden, behind or beside the type, never under it. The one
// thing you can press is the cloche, and it says what it did.
//
// Nothing flashes. The sign breathes, the leaves fall and the garland sways,
// slowly, and all of it stops under reduced motion (the block at the bottom of
// thanksgiving.css).

import { useEffect, useRef, useState } from "react";
import { playSfx } from "../../audio";
import type { OccasionKit, Room } from "../kit";
import { noteOccasionMoment } from "../store";
import { useT } from "../../i18n/store";
import pieUrl from "./art/ai-pie.svg";
import tinUrl from "./art/ai-pie-tin.svg";
import turkeyUrl from "./art/ai-hand-turkey.svg";
import "./thanksgiving.css";

const LEAF_PATH =
  "M12 2.5l1.7 3.6 2.5-1.2-.6 4.2 3.8-1.4-1.1 2.8 2.7 1-4.4 3.5.6 2-5.2-.6-5.2.6.6-2-4.4-3.5 2.7-1-1.1-2.8 3.8 1.4-.6-4.2 2.5 1.2z";

/** The four colours a leaf comes in. CSS gives each its fill. */
const HUES = ["rust", "gold", "cranberry", "olive"] as const;
type Hue = (typeof HUES)[number];

function Leaf({ className, hue }: { className: string; hue: Hue }) {
  return (
    <svg className={`${className} tg-hue--${hue}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={LEAF_PATH} />
      <path className="tg-leaf__vein" d="M12 21.5v-11M12 13.5l-3.6-2.6M12 13.5l3.6-2.6" />
    </svg>
  );
}

/** A bird in flight, for the V of geese on the walk to the bar. */
function Goose({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 10" aria-hidden="true" focusable="false">
      <path d="M0 4.2Q5.5-.2 10.6 4.6L12 5.6l1.4-1Q18.5-.2 24 4.2 18.8 2.2 14 7.2L12 8.6 10 7.2Q5.2 2.2 0 4.2z" fill="currentColor" />
    </svg>
  );
}

/**
 * A wishbone, in two halves that part at the top. Whoever gets the knob gets
 * the wish. `knob` says which half carries it; your half is always the left.
 */
function Wishbone({ className, knob }: { className: string; knob: "left" | "right" | "whole" }) {
  const Knob = <ellipse className="tg-bone__knob" cx="12" cy="4.4" rx="3.4" ry="2.6" />;
  return (
    <svg className={className} viewBox="0 0 24 28" aria-hidden="true" focusable="false">
      <g className="tg-bone__half tg-bone__half--left">
        <path className="tg-bone__arm" d="M10.8 5.8C6.6 10.2 4.2 16.8 4.2 24.6" />
        <ellipse className="tg-bone__knob" cx="4.2" cy="25.2" rx="2" ry="1.3" />
        {knob === "left" && Knob}
      </g>
      <g className="tg-bone__half tg-bone__half--right">
        <path className="tg-bone__arm" d="M13.2 5.8c4.2 4.4 6.6 11 6.6 18.8" />
        <ellipse className="tg-bone__knob" cx="19.8" cy="25.2" rx="2" ry="1.3" />
        {knob === "right" && Knob}
      </g>
      {knob === "whole" && Knob}
    </svg>
  );
}

/** The neon, re-tubed in amber, with a wishbone hung off the end of the sign. */
function Sign({ text }: { text: string; room: Room }) {
  return (
    <span className="tg-sign">
      {/* The words are said once, whole; the wishbone is a picture. */}
      <span className="sr-only">{text}</span>
      <span className="tg-sign__tube" aria-hidden="true">
        {text}
        <Wishbone className="tg-sign__bone" knob="whole" />
      </span>
    </span>
  );
}

/**
 * Leaves drifting past the windows, in the margins either side of the card so
 * none ever falls behind a word. A fixed scatter, never Math.random, so a
 * re-render never moves one. `rest` is where each sits when motion is off.
 */
const FALLING = Array.from({ length: 12 }, (_, i) => ({
  side: i % 2 === 0 ? "left" : "right",
  // Inside the outer 13% of the window on its side.
  x: (i * 29 + 3) % 13,
  size: 14 + ((i * 7) % 12),
  duration: 17 + ((i * 5) % 10),
  delay: -((i * 3.7) % 20),
  rest: 12 + ((i * 41) % 76),
  hue: HUES[i % HUES.length],
}));

/** Golden hour: a warm room, and leaves coming down outside. Both rooms; the bar's are dimmer. */
function Room({ room }: { room: Room }) {
  return (
    <div className={`tg-leaves tg-leaves--${room}`} aria-hidden="true">
      {FALLING.map((l, i) => (
        <span
          key={i}
          className="tg-fall"
          style={
            {
              [l.side]: `${l.x}%`,
              "--size": `${l.size}px`,
              "--rest": `${l.rest}vh`,
              animationDuration: `${l.duration}s`,
              animationDelay: `${l.delay}s`,
            } as React.CSSProperties
          }
        >
          <Leaf className="tg-fall__leaf" hue={l.hue} />
        </span>
      ))}
    </div>
  );
}

/**
 * Paper leaves strung on twine across the top of the card in two swags. Each
 * hangs from the twine's curve, the same quadratic Halloween's bulbs hang
 * from: at t along a swag, 4 + 64·t·(1 − t) px down.
 */
const GARLAND = Array.from({ length: 14 }, (_, i) => {
  const u = (i + 0.5) / 14;
  const t = (u % 0.5) / 0.5;
  return { left: u * 100, top: 3 + 64 * t * (1 - t), hue: HUES[(i * 3) % HUES.length], tilt: ((i * 37) % 40) - 20 };
});

/** The garland across the top, the hand turkey taped to its corner. */
function Card() {
  return (
    <>
      <span className="tg-garland" aria-hidden="true">
        <svg className="tg-garland__twine" viewBox="0 0 100 30" preserveAspectRatio="none" focusable="false">
          <path d="M0,3 Q25,35 50,3 Q75,35 100,3" vectorEffect="non-scaling-stroke" />
        </svg>
        {GARLAND.map((g, i) => (
          <span
            key={i}
            className="tg-garland__hang"
            style={{ left: `${g.left}%`, top: `${g.top}px`, animationDelay: `${-(i * 0.6)}s` }}
          >
            <span className="tg-garland__tilt" style={{ transform: `rotate(${g.tilt}deg)` }}>
              <Leaf className="tg-garland__leaf" hue={g.hue} />
            </span>
          </span>
        ))}
      </span>
      <img className="tg-turkey" src={turkeyUrl} alt="" aria-hidden="true" />
    </>
  );
}

/** How long the lid stays up after a pull, before the cloche settles. */
const PULL_MS = 2800;
/** When the bone snaps, inside the pull (see tg-snap in the CSS). */
const SNAP_MS = 900;

/**
 * Lift the cloche: a wishbone under it, and it snaps. Your half is the left.
 * Get the knob and it's the long end, and a wish.
 *
 * A real button, so a keyboard gets the wish too. Its label says what it is
 * ("Pull the wishbone"), and the result is said as well as drawn: the live
 * region below speaks the long end or the short one. Coin-flip odds, every
 * pull. It is a wishbone.
 */
function Cloche({ src }: { src: string }) {
  const t = useT();
  const [pull, setPull] = useState<{ long: boolean } | null>(null);
  const [said, setSaid] = useState("");
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const press = () => {
    if (pull) return;
    const long = Math.random() < 0.5;
    playSfx("knock", { delayMs: SNAP_MS });
    // Who found it: the Events page counts devices that pulled.
    noteOccasionMoment("wish");
    setPull({ long });
    setSaid(long ? t.occasions.thanksgiving.long : t.occasions.thanksgiving.short);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setPull(null);
      setSaid("");
    }, PULL_MS);
  };

  return (
    <span className="tg-cloche">
      <button
        type="button"
        className={pull ? `tg-cloche__btn tg-cloche__btn--pulled tg-cloche__btn--${pull.long ? "long" : "short"}` : "tg-cloche__btn"}
        aria-label={t.occasions.thanksgiving.pull}
        onClick={press}
      >
        <img className="tg-cloche__img" src={src} alt="" />
        {pull && <Wishbone className="tg-cloche__bone" knob={pull.long ? "left" : "right"} />}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {said}
      </span>
    </span>
  );
}

/** Leaves come down over the win toast, once, and are gone with it. */
const WIN_LEAVES = Array.from({ length: 18 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  delay: (i * 83) % 800,
  spin: (i % 2 === 0 ? 1 : -1) * (120 + ((i * 47) % 220)),
  sway: (i % 3 === 0 ? -1 : 1) * (14 + ((i * 13) % 30)),
  size: 14 + ((i * 5) % 10),
  hue: HUES[i % HUES.length],
}));

function Win() {
  return (
    <div className="tg-shower" aria-hidden="true">
      {WIN_LEAVES.map((l, i) => (
        <span
          key={i}
          className="tg-shower__piece"
          style={
            {
              left: `${l.left}%`,
              animationDelay: `${l.delay}ms`,
              "--spin": `${l.spin}deg`,
              "--sway": `${l.sway}px`,
              "--size": `${l.size}px`,
            } as React.CSSProperties
          }
        >
          <Leaf className="tg-shower__leaf" hue={l.hue} />
        </span>
      ))}
    </div>
  );
}

/** Beside the verdict: a whole pie on a win, an empty tin on a loss. */
function Verdict({ won }: { won: boolean }) {
  return <img className={`tg-verdict tg-verdict--${won ? "pie" : "tin"}`} src={won ? pieUrl : tinUrl} alt="" aria-hidden="true" />;
}

/** The walk to the bar: the sun goes down, and a V of geese crosses it. */
const V = [
  [0, 0],
  [-1, -1],
  [-1, 1],
  [-2, -2],
  [-2, 2],
  [-3, -3],
  [-3, 3],
] as const;

function LightsOut() {
  return (
    <>
      <div className="tg-dusk" />
      <div className="tg-geese">
        <div className="tg-geese__v">
          {V.map(([x, y], i) => (
            <span key={i} className="tg-geese__bird" style={{ left: `${x * 36}px`, top: `${y * 17}px`, animationDelay: `${i * 0.07}s` }}>
              <Goose className="tg-geese__svg" />
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

const thanksgiving: OccasionKit = {
  Sign,
  Room,
  Card,
  Cloche,
  Win,
  Verdict,
  LightsOut,
  copy: (t) => t.occasions.thanksgiving.copy,
};

export default thanksgiving;
