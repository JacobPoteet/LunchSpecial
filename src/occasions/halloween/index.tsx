// Halloween: the graveyard shift.
//
// The whole diner changes, not just its corners. The menu goes orange and black
// (its own token swap, like the bar's), the neon is re-tubed in pumpkin and
// ultraviolet with a C in SPECIAL that won't stay lit, the room's lights brown
// out, and the diner is dark enough that your pointer carries a flashlight
// across it. String lights hang over the card; fog lies along the floor.
//
// Loaded only while it is worn (src/occasions/store.ts). Everything here is
// decoration: aria-hidden, behind or beside the type, never under it. The one
// thing you can press is the cloche, and it says what it did.
//
// The lights loop, the way the bar band's halo does: no flash faster than
// three a second, never over text, and all of it stops under reduced motion
// (the block at the bottom of halloween.css).

import { useEffect, useRef, useState } from "react";
import { playSfx } from "../../audio";
import type { OccasionKit, Room } from "../kit";
import { noteOccasionMoment } from "../store";
import jackUrl from "./art/ai-jack.svg";
import "./halloween.css";

const BAT_PATH =
  "M16,5.4 L15.1,5 L14.5,3.2 L13.7,5.5 L12.1,5.6 L9.2,3.7 L5.2,3.2 L1.2,5.6 L3.9,6.3 L5.1,8.4 L7.3,7.5 L8.7,9.8 L10.9,8.9 L12.5,11.3 L14.3,10.1 L16,12.6 L17.7,10.1 L19.5,11.3 L21.1,8.9 L23.3,9.8 L24.7,7.5 L26.9,8.4 L28.1,6.3 L30.8,5.6 L26.8,3.2 L22.8,3.7 L19.9,5.6 L18.3,5.5 L17.5,3.2 L16.9,5Z";

const WEB_PATH =
  "M0,0 L62,0 M0,0 L57.5,23.2 M0,0 L43.8,43.8 M0,0 L23.2,57.5 M0,0 L0,62 " +
  "M13,0 Q10.5,2 12.1,4.9 Q8.9,5.9 9.2,9.2 Q5.9,8.9 4.9,12.1 Q2,10.5 0,13 " +
  "M26,0 Q20.9,4.1 24.1,9.7 Q17.8,11.8 18.4,18.4 Q11.8,17.8 9.7,24.1 Q4.1,20.9 0,26 " +
  "M39,0 Q31.4,6.1 36.2,14.6 Q26.7,17.7 27.6,27.6 Q17.7,26.7 14.6,36.2 Q6.1,31.4 0,39 " +
  "M52,0 Q41.9,8.1 48.2,19.5 Q35.6,23.5 36.8,36.8 Q23.5,35.6 19.5,48.2 Q8.1,41.9 0,52";

function Bat({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 16" aria-hidden="true" focusable="false">
      <path d={BAT_PATH} fill="currentColor" />
    </svg>
  );
}

function Ghost({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 28" aria-hidden="true" focusable="false">
      <path
        d="M12 2C7 2 4 6 4 11v14l2.7-2.2 2.6 2.2 2.7-2.2 2.7 2.2 2.6-2.2L20 25V11c0-5-3-9-8-9z"
        fill="var(--hw-ghost)"
        stroke="var(--hw-ghost-edge)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <ellipse cx="9.4" cy="11.4" rx="1.4" ry="1.9" fill="var(--hw-ghost-edge)" />
      <ellipse cx="14.6" cy="11.4" rx="1.4" ry="1.9" fill="var(--hw-ghost-edge)" />
      <ellipse cx="12" cy="16.4" rx="1.5" ry="1.9" fill="var(--hw-ghost-edge)" />
    </svg>
  );
}

/**
 * Which letter of each sign has a bad tube. One per sign: the C of SPECIAL,
 * which still reads as SPECIAL in the dark beat, and the A of DARK.
 */
const BAD_TUBE: Record<string, number> = {
  "Lunch Special": "Lunch Spe".length,
  "After Dark": "After D".length,
};

function Sign({ text }: { text: string; room: Room }) {
  const at = BAD_TUBE[text];
  return (
    <span className="hw-sign">
      {/* The words are said once, whole: a split word reads letter by letter. */}
      <span className="sr-only">{text}</span>
      <span className="hw-sign__tube" aria-hidden="true">
        {at === undefined ? (
          text
        ) : (
          <>
            {text.slice(0, at)}
            <span className="hw-sign__flicker">{text[at]}</span>
            {text.slice(at + 1)}
          </>
        )}
      </span>
    </span>
  );
}

/**
 * The room with its lights down. In the diner a pointer carries a flashlight
 * beam across the backdrop; on a touch screen there is no pointer, so the beam
 * rests on the sign. The bar is dark already and keeps only the fog.
 *
 * The beam is the player's own motion, not an animation, so it follows under
 * reduced motion too. The brownouts are animation, and stop.
 */
function Room({ room }: { room: Room }) {
  const dark = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = dark.current;
    if (!el || matchMedia("(pointer: coarse)").matches) return;
    let frame = 0;
    let x = 0;
    let y = 0;
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        el.style.setProperty("--beam-x", `${x}px`);
        el.style.setProperty("--beam-y", `${y}px`);
      });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(frame);
    };
  }, [room]);
  return (
    <>
      {room === "diner" && <div ref={dark} className="hw-dark" aria-hidden="true" />}
      <div className={`hw-fog hw-fog--${room}`} aria-hidden="true">
        <span className="hw-fog__bank hw-fog__bank--back" />
        <span className="hw-fog__bank hw-fog__bank--front" />
      </div>
    </>
  );
}

/**
 * Party lights strung across the top of the card in two swags. Each bulb sits
 * on the wire's curve: the wire is a quadratic with its control point at twice
 * the sag, so a bulb at t along a swag hangs at 4 + 72·t·(1 − t) px.
 */
const BULBS = Array.from({ length: 16 }, (_, i) => {
  const u = (i + 0.5) / 16;
  const t = (u % 0.5) / 0.5;
  return { left: u * 100, top: 4 + 72 * t * (1 - t), hue: i % 2 === 0 ? "orange" : "violet", bad: i === 11 };
});

function Lights() {
  return (
    <span className="hw-lights" aria-hidden="true">
      <svg className="hw-lights__wire" viewBox="0 0 100 30" preserveAspectRatio="none" focusable="false">
        <path d="M0,4 Q25,40 50,4 Q75,40 100,4" vectorEffect="non-scaling-stroke" />
      </svg>
      {BULBS.map((b, i) => (
        <span
          key={i}
          className={`hw-bulb hw-bulb--${b.hue}${b.bad ? " hw-bulb--bad" : ""}`}
          style={{ left: `${b.left}%`, top: `${b.top}px`, animationDelay: `${i * 0.175}s` }}
        />
      ))}
    </span>
  );
}

/** String lights across the top, cobwebs in the bottom corners. */
function Card() {
  return (
    <>
      <Lights />
      <span className="hw-webs" aria-hidden="true">
      <svg className="hw-web hw-web--left" viewBox="0 0 62 62" focusable="false">
        <path d={WEB_PATH} />
      </svg>
      <svg className="hw-web hw-web--right" viewBox="0 0 62 62" focusable="false">
        <path d={WEB_PATH} />
      </svg>
      </span>
    </>
  );
}

/** How many knocks, and how quickly, before something knocks back. */
const KNOCKS = 3;
const KNOCK_WINDOW_MS = 1600;
const PEEK_MS = 2400;

/**
 * Knock three times on the cloche and something under it looks out.
 *
 * A real button, so a keyboard gets the joke too. Its label says what it is
 * ("Knock on the cloche"), and the reply is said as well as drawn: the live
 * region below speaks "Boo." on the third knock. That is not a gag at the
 * expense of the rule that every change after an action is announced; it IS
 * the rule, and the joke is that it has to be.
 */
function Cloche({ src }: { src: string }) {
  // A ref, not state: three quick knocks land before React has re-rendered
  // between them, and each must see the one before it.
  const knocks = useRef<number[]>([]);
  const [peeking, setPeeking] = useState(false);
  const [said, setSaid] = useState("");
  const [shake, setShake] = useState(0);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const knock = () => {
    playSfx("knock");
    setShake((n) => n + 1);
    if (peeking) return;
    const now = Date.now();
    knocks.current = [...knocks.current.filter((t) => now - t < KNOCK_WINDOW_MS), now];
    if (knocks.current.length < KNOCKS) return;
    knocks.current = [];
    // Who found it: the Events page counts devices that knocked.
    noteOccasionMoment("knock");
    setPeeking(true);
    setSaid("Boo.");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setPeeking(false);
      setSaid("");
    }, PEEK_MS);
  };

  return (
    <span className="hw-cloche">
      <button
        type="button"
        className={peeking ? "hw-cloche__btn hw-cloche__btn--peek" : "hw-cloche__btn"}
        aria-label="Knock on the cloche"
        onClick={knock}
      >
        <img key={shake} className={shake ? "hw-cloche__img hw-cloche__img--knocked" : "hw-cloche__img"} src={src} alt="" />
        {peeking && <Ghost className="hw-cloche__ghost" />}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {said}
      </span>
    </span>
  );
}

/** Candy falls once over the win toast, and is gone with it. */
const CANDY = Array.from({ length: 16 }, (_, i) => ({
  // Spread across the width by a fixed scatter, not Math.random, so a re-render
  // never reshuffles a piece mid-fall.
  left: (i * 37 + 11) % 100,
  delay: (i * 83) % 700,
  spin: (i % 2 === 0 ? 1 : -1) * (160 + ((i * 47) % 200)),
  corn: i % 3 !== 0,
}));

function Win() {
  return (
    <div className="hw-candy" aria-hidden="true">
      {CANDY.map((c, i) => (
        <span
          key={i}
          className={c.corn ? "hw-candy__piece hw-candy__piece--corn" : "hw-candy__piece hw-candy__piece--wrap"}
          style={
            {
              left: `${c.left}%`,
              animationDelay: `${c.delay}ms`,
              "--spin": `${c.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Beside the verdict: a lit jack-o'-lantern on a win, the one that got away on a loss. */
function Verdict({ won }: { won: boolean }) {
  return won ? (
    <img className="hw-verdict hw-verdict--jack" src={jackUrl} alt="" aria-hidden="true" />
  ) : (
    <Ghost className="hw-verdict hw-verdict--ghost" />
  );
}

/** The walk to the bar: one flash of lightning, and the bats leave the sign. */
function LightsOut() {
  useEffect(() => {
    // On the flash, which lands 40% into the sweep (see hw-lightning).
    playSfx("thunder", { delayMs: 560 });
  }, []);
  return (
    <>
      <div className="hw-lightning" />
      <div className="hw-flock">
        {[0, 1, 2, 3, 4].map((i) => (
          <Bat key={i} className={`hw-flock__bat hw-flock__bat--${i}`} />
        ))}
      </div>
    </>
  );
}

const halloween: OccasionKit = {
  Sign,
  Room,
  Card,
  Cloche,
  Win,
  Verdict,
  LightsOut,
  copy: {
    sub: "Open for the graveyard shift",
    thanks: "Best food in town, if you dare",
    fine: "No substitutions on the Special · Ask about our pumpkin pie",
    barSub: "One drink. Four guesses. Gone by the witching hour.",
  },
};

export default halloween;
