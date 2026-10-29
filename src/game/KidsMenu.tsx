// The Kids' Menu: the pill beside the order bar, its one coach card, and the card.
//
// From the fourth miss the order bar carries a pill that opens a placemat listing
// every dish that still fits the board (the Worker builds it; the rules are
// shared/kidsmenu.ts). It never opens itself. On the card a player circles a
// dish and orders it, which is an ordinary guess. A guessed dish stays on the
// menu only when every one of its tiles hit (it fits the board as well as the
// Special does), and prints crossed out.
//
// Every moment is a state on an attribute, so the motion pass can hang an
// animation on any of them without touching this file's logic:
//
//   pill        data-kids="new" (appeared this sitting) | "idle", plus
//               data-coach while its tip is up; its slot and the tip's
//               carry the same data-kids, and the entrance hangs on those
//   card        data-kids="loading" | "ready" | "error", plus data-moment and
//               data-moment-n for the latest thing that happened on it
//               ("circled", "ordered")
//   each row    data-row="live" | "circled" | "guessed"
//
// Timings live in KIDS_MENU_MS (shared/audio.ts), mirrored by the --kids-* dial
// in game.css.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { GuessFeedback, KidsMenuDish, KidsMenuInfo } from "../../shared/types";
import { filterLabel, layoutMenu, menuBlurb } from "../../shared/kidsmenu";
import { useT } from "../i18n/store";
import { circleAnnouncement, kidsMenuAnnouncement } from "../../shared/announce";
import { crayonRing } from "../../shared/crayon";
import { fetchKidsMenu, type KidsMenuBoard } from "../api";
import { playSfx } from "../audio";
import { Modal } from "./components";
import { Icon } from "./Icon";
import { InlineMarkdown } from "./Markdown";

/**
 * The pill, in the order bar's row beside the field (GuessInput's `trail`),
 * where the Order button used to be. It used to sit in the toolbar beside My
 * stats, and by the fourth miss the toolbar is above the fold on a phone. The
 * order bar is in every layout, Discord's picture-in-picture tile included, so
 * there is one pill. `fresh` is true when it appeared during this sitting;
 * `coached` while its tip is up, which rings it.
 *
 * The slot around it is the entrance: a one-column grid whose track grows from
 * 0fr to 1fr, which is zero to the pill's own width in any language, with the
 * gap inside it so that opens too. The pill sits at the slot's far end, so the
 * field draws back and uncovers it rather than the pill flying in.
 */
export function KidsMenuPill({
  fresh,
  coached,
  describedBy,
  onOpen,
  buttonRef,
}: {
  fresh: boolean;
  coached?: boolean;
  describedBy?: string;
  onOpen: () => void;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  const t = useT();
  return (
    <span className="kids-slot" data-kids={fresh ? "new" : "idle"}>
      <span className="kids-slot__inner">
        <button
          ref={buttonRef}
          type="button"
          className="icon-btn kids-pill"
          data-kids={fresh ? "new" : "idle"}
          data-coach={coached || undefined}
          aria-haspopup="dialog"
          aria-describedby={describedBy}
          onClick={() => {
            playSfx("ui-click");
            onOpen();
          }}
        >
          <Icon name="crayon" /> {t.kidsMenu.name}
        </button>
      </span>
    </span>
  );
}

/**
 * The one coach card, the first round a device could open the menu. It sits
 * above the order bar, like the first visit's marks, with its caret pointing
 * down at the pill at the end of the row. `fresh` (the pill appeared this
 * sitting) holds it until the pill has landed, and its space opens rather than
 * the order bar jumping down under it. In the diner's voice and never a word about cheating:
 * it's a smaller menu, and an order off it is an order.
 */
export function KidsMenuCoach({
  id,
  fresh,
  anchor,
  onDismiss,
}: {
  id: string;
  fresh: boolean;
  anchor: RefObject<HTMLButtonElement | null>;
  onDismiss: () => void;
}) {
  const t = useT();
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
    <div className="kids-tip" data-kids={fresh ? "new" : "idle"}>
      <div className="kids-tip__inner">
        <div
          ref={ref}
          className="coach coach--kids"
          id={id}
          style={caret === null ? undefined : ({ "--caret-x": `${caret}px` } as React.CSSProperties)}
        >
          <p className="coach__text">
            <InlineMarkdown source={t.kidsMenu.coach} />
          </p>
          {/* The card unmounts with its own × in it, which would drop keyboard
              focus to the page; the pill it described is where focus belongs. */}
          <button
            className="coach__dismiss"
            onClick={() => {
              anchor.current?.focus();
              onDismiss();
            }}
            aria-label={t.kidsMenu.dismissCoach}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const t = useT();
  const [moment, setMoment] = useState<{ name: Moment; n: number } | null>(null);
  const mark = (name: Moment) => setMoment((m) => ({ name, n: (m?.n ?? 0) + 1 }));

  // The board is fixed for as long as the card is open: ordering closes it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const request = useMemo(() => board, [key]);
  useEffect(() => {
    const say = (info: KidsMenuInfo) =>
      setLive(kidsMenuAnnouncement(info.dishes.length, info.filters.map((f) => filterLabel(f.fact, f.value, t)), t));
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
  }, [key, request, t]);

  const guessedIds = useMemo(() => new Set(guesses.map((g) => g.dish.id)), [guesses]);
  const layout = useMemo(() => (menu ? layoutMenu(menu.dishes, menu.filters.map((f) => f.fact)) : null), [menu]);
  const picked = menu?.dishes.find((d) => d.id === circled) ?? null;

  const circle = (dish: KidsMenuDish) => {
    if (guessedIds.has(dish.id)) return;
    playSfx("ui-click");
    setCircled(dish.id);
    setLive(circleAnnouncement(dish.name, t));
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
          <span className="kids-row__entry">
            <span className="kids-row__name">
              {dish.name}
              {guessed && <CrayonCross />}
            </span>
            <span className="kids-row__country">
              {dish.country}
              {guessed && <span className="kids-row__tag"> · {t.kidsMenu.ordered}</span>}
            </span>
            {isCircled && <CrayonCircle seed={dish.id} />}
          </span>
        </button>
      </li>
    );
  };

  return (
    <Modal
      onClose={onClose}
      label={t.kidsMenu.name}
      variant="kids"
      footer={
        <div className="kids__foot">
          <p className="kids__picked">
            {picked ? (
              <>
                {t.kidsMenu.circled} <strong>{picked.name}</strong>
              </>
            ) : (
              t.kidsMenu.tapToCircle
            )}
          </p>
          <button type="button" className="share-btn share-btn--primary kids__order" disabled={!picked} onClick={order}>
            {t.kidsMenu.order}
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
          <h2 className="kids__title">{t.kidsMenu.name}</h2>
          <p className="kids__fine">{t.kidsMenu.fine}</p>
        </header>

        {error && <p className="kids__note">{t.kidsMenu.error}</p>}
        {!menu && !error && <p className="kids__note">{t.kidsMenu.loading}</p>}

        {menu && layout && (
          <>
            <p className="kids__blurb">{menuBlurb(menu.dishes.length, t)}</p>
            {/* The stamps are what a tile confirmed. A board of misses has
                none to show: its misses narrowed the list without a stamp. */}
            {menu.filters.length > 0 && (
              <p className="kids__chips">
                <span className="kids__chips-label">{t.kidsMenu.confirmed}</span>
                {menu.filters.map((f) => (
                  <span key={f.fact} className="kids-chip">
                    {filterLabel(f.fact, f.value, t)}
                  </span>
                ))}
              </p>
            )}
            {layout.sections.map((section) => (
              <div key={section.course ?? "all"} className="kids-sec">
                {section.course && (
                  <h3 className="kids-sec__head">
                    {t.kidsMenu.courses[section.course]} <span className="kids-sec__count">{section.count}</span>
                  </h3>
                )}
                {section.groups.map((g) => (
                  <div key={g.region ?? "all"} className="kids-sec__group">
                    {g.region && <h4 className="kids-sec__sub">{t.regions[g.region]}</h4>}
                    <ul className="kids-list">{g.dishes.map(row)}</ul>
                  </div>
                ))}
              </div>
            ))}
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

/**
 * A crayon ring round the circled dish, name and country, in that dish's own
 * hand (shared/crayon.ts). It is drawn at the entry's measured size rather than
 * stretched, so a long name is as fully ringed as a short one; pathLength="1"
 * lets the CSS draw it on.
 */
function CrayonCircle({ seed }: { seed: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const entry = ref.current?.parentElement;
    if (!entry) return;
    const measure = () => {
      const w = entry.offsetWidth;
      const h = entry.offsetHeight;
      setBox((b) => (b && b.w === w && b.h === h ? b : { w, h }));
    };
    measure();
    // Zoom, rotation or a font arriving late changes the box; the path is
    // redrawn in place and the draw-on does not replay.
    const watch = new ResizeObserver(measure);
    watch.observe(entry);
    return () => watch.disconnect();
  }, []);

  return (
    <svg ref={ref} className="kids-mark kids-mark--circle" viewBox={box ? `0 0 ${box.w} ${box.h}` : undefined} aria-hidden="true">
      {box && <path d={crayonRing(box.w, box.h, seed)} pathLength="1" />}
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
