// The first visit.
//
// A new player used to meet a modal of rules before they had seen a board. It
// is gone. In its place three coach marks follow the round, each pointing at
// the one thing to do next and each dismissed by doing it:
//
//   order   the board is empty     a spotlight on the order bar, one sentence
//   pick    the list is open       the list pulses, one sentence
//   read    the first row landed   the three marks, one sentence about clues
//
// Which beat shows is DERIVED from the round (0 guesses, a list with matches,
// 1 guess), never from a timer or a step counter, so a reload mid-first-round
// lands on the right beat and nothing can be dismissed by an animation that
// didn't fire. The decision is the fold in shared/coach.ts; GamePage owns the
// state; this file owns the pieces.
//
// The full rules stay one press away on the toolbar's "How to play". They just
// never open themselves.

import { MATCH_MARKS } from "../../shared/announce";
import type { CoachBeat } from "../../shared/coach";
import { useT } from "../i18n/store";
import { InlineMarkdown } from "./Markdown";

/**
 * A callout beside the thing it explains. Short enough to read in the time it
 * takes to decide whether to read it; the × ends the walkthrough for a player
 * who has played a Wordle before and would rather not be taught.
 */
export function CoachMark({
  beat,
  id,
  onDismiss,
}: {
  beat: CoachBeat;
  /** So the order bar can point at its own explanation via aria-describedby. */
  id?: string;
  onDismiss: () => void;
}) {
  const t = useT();
  return (
    <div className={`coach coach--${beat}`} id={id}>
      {beat === "read" && (
        <div className="coach__legend" aria-hidden="true">
          <span className="chip chip--hit">
            {MATCH_MARKS.hit} {t.coach.legendHit}
          </span>
          <span className="chip chip--near">
            {MATCH_MARKS.near} {t.coach.legendNear}
          </span>
          <span className="chip chip--miss">
            {MATCH_MARKS.miss} {t.coach.legendMiss}
          </span>
        </div>
      )}
      <p className="coach__text">
        <InlineMarkdown source={t.coach[beat]} />
      </p>
      <button className="coach__dismiss" onClick={onDismiss} aria-label={t.coach.skip}>
        ×
      </button>
    </div>
  );
}

/**
 * The dim over everything but the order bar. It works without a cut-out
 * because `.guess-input` already outranks the rest of the card (z-index 40,
 * for its dropdown) and this sits at 35: the one thing left lit is the one
 * thing to press. It fades in a beat after the card's entrance, since the
 * card is a stacking context while it slides and would trap the input under
 * the dim for that half second.
 *
 * Purely visual, and gone on the first pointer, key or focus anywhere.
 */
export function CoachSpotlight() {
  return <div className="coach-spotlight" aria-hidden="true" />;
}
