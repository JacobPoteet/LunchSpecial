// The Kids Menu: the pill beside My stats, its one coach card, and the card.
//
// From the fourth miss the toolbar carries a pill that opens a placemat listing
// every dish that still fits the board (the Worker builds it; the rules are
// shared/kidsmenu.ts). It never opens itself. On the card a player circles a
// dish and orders it, which is an ordinary guess. Dishes already guessed print
// crossed out.
//
// Every moment is a state on an attribute, so the motion pass can hang an
// animation on any of them without touching this file's logic:
//
//   pill        data-kids="new" (appeared this sitting) | "idle"
//   card        data-kids="loading" | "ready" | "error", plus data-moment and
//               data-moment-n for the latest thing that happened on it
//               ("circled", "ordered")
//   each row    data-row="live" | "circled" | "guessed"
//
// Timings live in KIDS_MENU_MS (shared/audio.ts), mirrored by the --kids-* dial
// in game.css.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Course, GuessFeedback, KidsMenuDish, KidsMenuInfo } from "../../shared/types";
import { REGION_LABELS } from "../../shared/types";
import { filterLabel, layoutMenu } from "../../shared/kidsmenu";
import { circleAnnouncement, kidsMenuAnnouncement } from "../../shared/announce";
import { fetchKidsMenu, type KidsMenuBoard } from "../api";
import { playSfx } from "../audio";
import { Modal } from "./components";
import { Icon } from "./Icon";

/**
 * The pill. `fresh` is true when it appeared during this sitting. `pip` marks
 * the copy drawn on the board for Discord's picture-in-picture tile, where the
 * toolbar is hidden; game.css shows exactly one of the two.
 */
export function KidsMenuPill({
  fresh,
  pip,
  describedBy,
  onOpen,
  buttonRef,
}: {
  fresh: boolean;
  pip?: boolean;
  describedBy?: string;
  onOpen: () => void;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={pip ? "icon-btn kids-pill kids-pill--pip" : "icon-btn kids-pill"}
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
 * The one coach card, the first round a device could open the menu. It sits
 * under the toolbar with its caret pointing up at the pill, wherever the
 * toolbar's wrap put it. In the diner's voice and never a word about cheating:
 * it's a smaller menu, and an order off it is an order.
 */
export function KidsMenuCoach({
  id,
  anchor,
  onDismiss,
}: {
  id: string;
  anchor: RefObject<HTMLButtonElement | null>;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState<number | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const pill = anchor.current?.getBoundingClientRect();
      const card = ref.current?.getBoundingClientRect();
      if (pill && card) setCaret(pill.left + pill.width / 2 - card.left);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor]);
  return (
    <div
      ref={ref}
      className="coach coach--kids"
      id={id}
      style={caret === null ? undefined : ({ "--caret-x": `${caret}px` } as React.CSSProperties)}
    >
      <p className="coach__text">
        <strong>Two orders left?</strong> Ask for the Kids Menu. Same kitchen, smaller menu: every dish that still
        fits your board. Ordering off it still takes a guess.
      </p>
      {/* The card unmounts with its own × in it, which would drop keyboard
          focus to the page; the pill it described is where focus belongs. */}
      <button
        className="coach__dismiss"
        onClick={() => {
          anchor.current?.focus();
          onDismiss();
        }}
        aria-label="Dismiss the Kids Menu tip"
      >
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

type Moment = "circled" | "ordered";

export function KidsMenuCard({
  board,
  guesses,
  onOrder,
  onClose,
}: {
  board: KidsMenuBoard;
  guesses: ReadonlyArray<GuessFeedback>;
  onOrder: (dish: KidsMenuDish) => void;
  onClose: () => void;
}) {
  const key = boardKey(board);
  const [menu, setMenu] = useState<KidsMenuInfo | null>(() => menuCache.get(key) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [circled, setCircled] = useState<number | null>(null);
  const [live, setLive] = useState("");
  const [moment, setMoment] = useState<{ name: Moment; n: number } | null>(null);
  const mark = (name: Moment) => setMoment((m) => ({ name, n: (m?.n ?? 0) + 1 }));

  // The board is fixed for as long as the card is open: ordering closes it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const request = useMemo(() => board, [key]);
  useEffect(() => {
    const say = (info: KidsMenuInfo) =>
      setLive(kidsMenuAnnouncement(info.dishes.length, info.filters.map((f) => filterLabel(f.fact, f.value))));
    const held = menuCache.get(key);
    if (held) {
      say(held);
      return;
    }
    let alive = true;
    fetchKidsMenu(request).then(
      (info) => {
        if (!alive) return;
        menuCache.set(key, info);
        setMenu(info);
        say(info);
      },
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [key, request]);

  const guessedIds = useMemo(() => new Set(guesses.map((g) => g.dish.id)), [guesses]);
  const layout = useMemo(() => (menu ? layoutMenu(menu.dishes, menu.filters.map((f) => f.fact)) : null), [menu]);
  const picked = menu?.dishes.find((d) => d.id === circled) ?? null;

  const circle = (dish: KidsMenuDish) => {
    if (guessedIds.has(dish.id)) return;
    playSfx("ui-click");
    setCircled(dish.id);
    setLive(circleAnnouncement(dish.name));
    mark("circled");
  };

  const order = () => {
    if (!picked) return;
    mark("ordered");
    onOrder(picked);
  };

  const row = (dish: KidsMenuDish) => {
    const guessed = guessedIds.has(dish.id);
    const isCircled = circled === dish.id;
    return (
      <li key={dish.id} className="kids-row" data-row={guessed ? "guessed" : isCircled ? "circled" : "live"}>
        <button
          type="button"
          className="kids-row__dish"
          aria-pressed={isCircled}
          aria-disabled={guessed || undefined}
          onClick={() => circle(dish)}
        >
          <span className="kids-row__name">
            {dish.name}
            {guessed && <CrayonCross />}
            {isCircled && <CrayonCircle />}
          </span>
          <span className="kids-row__country">
            {dish.country}
            {guessed && <span className="kids-row__tag"> · ordered</span>}
          </span>
        </button>
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

/** A wobbly crayon line through a dish already ordered. */
function CrayonCross() {
  return (
    <svg className="kids-mark kids-mark--cross" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
      <path d="M2 7.5C14 4 24 9.5 37 6.5S60 3.5 72 7s19 1 26-1.5" />
    </svg>
  );
}

/** A crayon ring round the circled dish, not quite closed, as a hand draws one. pathLength="1" lets the CSS draw it on. */
function CrayonCircle() {
  return (
    <svg className="kids-mark kids-mark--circle" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <path d="M58 4C80 4 97 10 97 20S78 37 50 37 3 31 3 20 22 3 46 4c6 0 12 1 16 3" pathLength="1" />
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
