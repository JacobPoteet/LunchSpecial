// The Kids Menu: the pill on the order bar, its one coach card, and the card.
//
// From the fourth miss the order bar carries a pill that opens a placemat
// listing every dish that still fits the board (the Worker builds it; the
// rules are shared/kidsmenu.ts). It never opens itself. On the card a player
// can circle a dish and order it (an ordinary guess), cross dishes out with
// the crayon (a scratchpad saved with the round), and spend a couple of
// "What's in it?" peeks.
//
// Every moment is a state on an attribute, so the motion pass can hang an
// animation on any of them without touching this file's logic:
//
//   pill        data-kids="new" (appeared this sitting) | "idle"
//   card        data-kids="loading" | "ready" | "error", plus data-moment and
//               data-moment-n for the latest thing that happened on it
//               ("crossed", "uncrossed", "circled", "peeked", "ordered")
//   each row    data-row="live" | "crossed" | "circled" | "guessed"
//               data-peek="hidden" | "revealed"
//
// Timings live in KIDS_MENU_MS (shared/audio.ts), mirrored by the --kids-* dial
// in game.css.

import { useEffect, useMemo, useState } from "react";
import type { GuessFeedback, KidsMenuDish, KidsMenuInfo, Course } from "../../shared/types";
import { filterLabel, layoutMenu, MENU_PEEKS, type PeekCard } from "../../shared/kidsmenu";
import {
  circleAnnouncement,
  crossAnnouncement,
  kidsMenuAnnouncement,
  PEEK_MARKS,
  PEEK_WORDS,
  peekAnnouncement,
} from "../../shared/announce";
import { REGION_LABELS } from "../../shared/types";
import { fetchKidsMenu, peekKidsMenu, type KidsMenuBoard } from "../api";
import { playSfx } from "../audio";
import { Modal } from "./components";
import { Icon } from "./Icon";
import type { KidsMenuScratch } from "./storage";

export const EMPTY_SCRATCH: KidsMenuScratch = { crossed: [], peeks: {} };

/** The pill on the order bar. `fresh` is true when it appeared during this sitting. */
export function KidsMenuPill({
  fresh,
  describedBy,
  onOpen,
}: {
  fresh: boolean;
  describedBy?: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="icon-btn kids-pill"
      data-kids={fresh ? "new" : "idle"}
      aria-haspopup="dialog"
      aria-describedby={describedBy}
      onClick={() => {
        playSfx("ui-click");
        onOpen();
      }}
    >
      <Icon name="crayon" /> Kids Menu
    </button>
  );
}

/**
 * The one coach card, the first round a device could open the menu. In the
 * diner's voice and never a word about cheating: it's a smaller menu, and an
 * order off it is an order.
 */
export function KidsMenuCoach({ id, onDismiss }: { id: string; onDismiss: () => void }) {
  return (
    <div className="coach coach--kids" id={id}>
      <p className="coach__text">
        <strong>Two orders left?</strong> Ask for the Kids Menu. Same kitchen, smaller menu: every dish that still
        fits your board. Ordering off it still takes a guess.
      </p>
      <button className="coach__dismiss" onClick={onDismiss} aria-label="Dismiss the Kids Menu tip">
        ×
      </button>
    </div>
  );
}

const COURSE_HEADS: Record<Course, string> = {
  breakfast: "Breakfast",
  appetizer: "Appetizers",
  entree: "Entrees",
  dessert: "Desserts",
  drink: "Drinks",
};

/**
 * One menu per board, held for the page's life: reopening the card without a
 * new guess shouldn't refetch it, and a new guess changes the key.
 */
const menuCache = new Map<string, KidsMenuInfo>();
const boardKey = (b: KidsMenuBoard) => JSON.stringify([b.date, b.preview, b.random, b.special, b.guessed]);

type Moment = "crossed" | "uncrossed" | "circled" | "peeked" | "ordered";

export function KidsMenuCard({
  board,
  guesses,
  scratch,
  onScratch,
  onOrder,
  onClose,
}: {
  board: KidsMenuBoard;
  guesses: ReadonlyArray<GuessFeedback>;
  scratch: KidsMenuScratch;
  onScratch: (next: KidsMenuScratch) => void;
  onOrder: (dish: KidsMenuDish) => void;
  onClose: () => void;
}) {
  const key = boardKey(board);
  const [menu, setMenu] = useState<KidsMenuInfo | null>(() => menuCache.get(key) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [circled, setCircled] = useState<number | null>(null);
  const [peeking, setPeeking] = useState<number | null>(null);
  // What the Worker last counted, for a tracked round. Null until a peek comes
  // back, and always null on a round the Worker doesn't count.
  const [serverLeft, setServerLeft] = useState<number | null>(null);
  const [live, setLive] = useState("");
  const [moment, setMoment] = useState<{ name: Moment; n: number } | null>(null);
  const mark = (name: Moment) => setMoment((m) => ({ name, n: (m?.n ?? 0) + 1 }));

  // The board is fixed for as long as the card is open: ordering closes it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const request = useMemo(() => board, [key]);
  useEffect(() => {
    const held = menuCache.get(key);
    if (held) {
      setLive(kidsMenuAnnouncement(held.dishes.length, held.filters.map((f) => filterLabel(f.fact, f.value))));
      return;
    }
    let alive = true;
    fetchKidsMenu(request).then(
      (info) => {
        if (!alive) return;
        menuCache.set(key, info);
        setMenu(info);
        setLive(kidsMenuAnnouncement(info.dishes.length, info.filters.map((f) => filterLabel(f.fact, f.value))));
      },
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [key, request]);

  const guessedIds = useMemo(() => new Set(guesses.map((g) => g.dish.id)), [guesses]);
  const crossed = useMemo(() => new Set(scratch.crossed), [scratch.crossed]);
  const peeksSpent = Object.keys(scratch.peeks).length;
  const peeksLeft = Math.max(0, Math.min(MENU_PEEKS - peeksSpent, serverLeft ?? MENU_PEEKS));
  const layout = useMemo(() => (menu ? layoutMenu(menu.dishes, menu.filters.map((f) => f.fact)) : null), [menu]);
  const picked = menu?.dishes.find((d) => d.id === circled) ?? null;

  const toggleCross = (dish: KidsMenuDish) => {
    const on = !crossed.has(dish.id);
    playSfx("ui-click");
    onScratch({
      ...scratch,
      crossed: on ? [...scratch.crossed, dish.id] : scratch.crossed.filter((id) => id !== dish.id),
    });
    setLive(crossAnnouncement(dish.name, on));
    mark(on ? "crossed" : "uncrossed");
  };

  const circle = (dish: KidsMenuDish) => {
    if (guessedIds.has(dish.id)) return;
    playSfx("ui-click");
    setCircled(dish.id);
    setLive(circleAnnouncement(dish.name));
    mark("circled");
  };

  const peek = (dish: KidsMenuDish) => {
    if (peeking !== null || peeksLeft === 0) return;
    playSfx("ui-click");
    setPeeking(dish.id);
    peekKidsMenu({ ...request, dishId: dish.id }).then(
      (p) => {
        setPeeking(null);
        const card: PeekCard = { lines: p.lines, more: p.more };
        onScratch({ ...scratch, peeks: { ...scratch.peeks, [dish.id]: card } });
        if (p.peeksLeft !== null) setServerLeft(p.peeksLeft);
        const left = p.peeksLeft ?? Math.max(0, MENU_PEEKS - peeksSpent - 1);
        setLive(peekAnnouncement(dish.name, card, left));
        mark("peeked");
      },
      () => {
        setPeeking(null);
        setLive("The kitchen didn't answer. Try that peek again.");
      },
    );
  };

  const order = () => {
    if (!picked) return;
    mark("ordered");
    onOrder(picked);
  };

  const row = (dish: KidsMenuDish) => {
    const guessed = guessedIds.has(dish.id);
    const isCrossed = guessed || crossed.has(dish.id);
    const isCircled = circled === dish.id;
    const card = scratch.peeks[dish.id];
    const state = guessed ? "guessed" : isCircled ? "circled" : isCrossed ? "crossed" : "live";
    return (
      <li key={dish.id} className="kids-row" data-row={state} data-peek={card ? "revealed" : "hidden"}>
        <div className="kids-row__line">
          <button
            type="button"
            className="kids-row__dish"
            aria-pressed={isCircled}
            aria-disabled={guessed || undefined}
            onClick={() => circle(dish)}
          >
            <span className="kids-row__name">
              {dish.name}
              {isCrossed && <CrayonCross />}
              {isCircled && <CrayonCircle />}
            </span>
            <span className="kids-row__country">{dish.country}</span>
            {guessed && <span className="kids-row__tag">Ordered</span>}
            {isCrossed && !guessed && <span className="sr-only">, crossed out</span>}
          </button>
          {!guessed && MENU_PEEKS > 0 && !card && (
            <button
              type="button"
              className="kids-row__peek"
              aria-disabled={peeksLeft === 0 || undefined}
              aria-busy={peeking === dish.id || undefined}
              aria-label={`What's in ${dish.name}?`}
              onClick={() => peek(dish)}
            >
              What's in it?
            </button>
          )}
          {!guessed && (
            <button
              type="button"
              className="kids-row__crayon"
              aria-pressed={crossed.has(dish.id)}
              aria-label={`Cross out ${dish.name}`}
              onClick={() => toggleCross(dish)}
            >
              <Icon name="crayon" />
            </button>
          )}
        </div>
        {card && <PeekList name={dish.name} card={card} />}
      </li>
    );
  };

  return (
    <Modal
      onClose={onClose}
      label="Kids Menu"
      variant="kids"
      footer={
        <div className="kids__foot">
          <p className="kids__picked">
            {picked ? (
              <>
                Circled: <strong>{picked.name}</strong>
              </>
            ) : (
              "Tap a dish to circle it."
            )}
          </p>
          <button type="button" className="share-btn share-btn--primary kids__order" disabled={!picked} onClick={order}>
            Order it
          </button>
        </div>
      }
    >
      <div
        className="kids"
        data-kids={error ? "error" : menu ? "ready" : "loading"}
        data-moment={moment?.name}
        data-moment-n={moment?.n}
      >
        <p className="sr-only" role="status" aria-live="polite">
          {live}
        </p>
        <header className="kids__head">
          <Doodle />
          <h2 className="kids__title">Kids Menu</h2>
          <p className="kids__fine">For diners 12 and under. We won't check.</p>
        </header>

        {error && <p className="kids__note">The kitchen lost the crayons. Close this and try again.</p>}
        {!menu && !error && <p className="kids__note">Fetching the crayons…</p>}

        {menu && layout && (
          <>
            <p className="kids__chips">
              <span className="sr-only">Narrowed to: </span>
              {menu.filters.length === 0 ? (
                <span className="kids-chip">The whole menu</span>
              ) : (
                menu.filters.map((f) => (
                  <span key={f.fact} className="kids-chip">
                    {filterLabel(f.fact, f.value)}
                  </span>
                ))
              )}
            </p>
            {MENU_PEEKS > 0 && <PeekTally left={peeksLeft} />}
            {layout.folded && <p className="kids__note">Nothing on the board narrows it much yet.</p>}
            {layout.sections.map((section) =>
              section.course === null ? (
                <ul key="all" className="kids-list">
                  {section.groups[0].dishes.map(row)}
                </ul>
              ) : (
                <details key={section.course} className="kids-sec" open={!layout.folded}>
                  <summary className="kids-sec__head">
                    {COURSE_HEADS[section.course]} <span className="kids-sec__count">{section.count}</span>
                  </summary>
                  {section.groups.map((g) => (
                    <div key={g.region ?? "all"} className="kids-sec__group">
                      {g.region && <h3 className="kids-sec__sub">{REGION_LABELS[g.region]}</h3>}
                      <ul className="kids-list">{g.dishes.map(row)}</ul>
                    </div>
                  ))}
                </details>
              ),
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/** "What's in it?" peeks left, as crayon checkmarks: bright while left, faint once spent. */
function PeekTally({ left }: { left: number }) {
  return (
    <p className="kids-tally">
      <span className="kids-tally__label">What's in it?</span>
      <span className="kids-tally__marks" aria-hidden="true">
        {Array.from({ length: MENU_PEEKS }, (_, i) => (
          <svg
            key={i}
            className={i < left ? "kids-tally__mark" : "kids-tally__mark kids-tally__mark--spent"}
            viewBox="0 0 24 24"
          >
            <path d="M4 13.5c2 1.2 3.6 3 4.8 5.2C11.5 12 15 7.4 20.5 4.2" />
          </svg>
        ))}
      </span>
      <span className="kids-tally__text">
        {left === 0 ? "No peeks left" : `${left} peek${left === 1 ? "" : "s"} left`}
      </span>
    </p>
  );
}

function PeekList({ name, card }: { name: string; card: PeekCard }) {
  return (
    <ul className="kids-peek" aria-label={`What's in ${name}`}>
      {card.lines.map((l) => (
        <li key={l.ingredient} className={`kids-peek__item kids-peek__item--${l.mark}`}>
          {PEEK_MARKS[l.mark] && (
            <span className="kids-peek__mark" aria-hidden="true">
              {PEEK_MARKS[l.mark]}
            </span>
          )}
          {l.ingredient}
          {PEEK_WORDS[l.mark] && <span className="sr-only">, {PEEK_WORDS[l.mark]}</span>}
        </li>
      ))}
      {card.lines.length === 0 && <li className="kids-peek__item">Nothing you've tried</li>}
      {card.more && <li className="kids-peek__item kids-peek__item--more">and more you haven't tried</li>}
    </ul>
  );
}

/** A wobbly crayon line through a name. pathLength="1" lets the CSS draw it on. */
function CrayonCross() {
  return (
    <svg className="kids-mark kids-mark--cross" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
      <path d="M2 7.5C14 4 24 9.5 37 6.5S60 3.5 72 7s19 1 26-1.5" pathLength="1" />
    </svg>
  );
}

/** A crayon ring round the circled dish, not quite closed, as a hand draws one. */
function CrayonCircle() {
  return (
    <svg className="kids-mark kids-mark--circle" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M58 4C80 4 97 10 97 20S78 37 50 37 3 31 3 20 22 3 46 4c6 0 12 1 16 3"
        pathLength="1"
      />
    </svg>
  );
}

/** The corner doodle: a crayon sun, the kind drawn on every placemat. */
function Doodle() {
  return (
    <svg className="kids__doodle" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="9" />
      <path d="M20.5 22.5h.01M27.5 22.5h.01M20 27c2.4 2.2 5.6 2.2 8 0" />
      <path d="M24 4v6M24 38v6M4 24h6M38 24h6M9.9 9.9l4.2 4.2M33.9 33.9l4.2 4.2M9.9 38.1l4.2-4.2M33.9 14.1l4.2-4.2" />
    </svg>
  );
}
