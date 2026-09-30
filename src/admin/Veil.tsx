// A spoiler veil for the back office: the name of a dish or drink that hasn't
// been served yet, blurred until the eye beside it is pressed.
//
// The real text is NOT in the DOM while hidden. A CSS blur alone would leave the
// answer in View Source, in Ctrl+F and in a copy-paste. What is blurred is a
// same-shaped filler, so the card keeps its height and the row of cards keeps its
// shared bottom edge.
//
// Hidden on every load and never persisted. It also re-hides itself as soon
// as the tab loses the screen. No timer: a reveal stays up until you press the
// eye or leave the window.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Icon } from "../game/Icon";

export interface VeilState {
  shown: boolean;
  show: () => void;
  toggle: () => void;
}

export function useVeil(): VeilState {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!shown) return;
    const hide = () => setShown(false);
    const onVisibility = () => {
      if (document.hidden) hide();
    };
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", hide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [shown]);

  const show = useCallback(() => setShown(true), []);
  const toggle = useCallback(() => setShown((s) => !s), []);
  return { shown, show, toggle };
}

/** Same word lengths and spaces as the real text, none of the letters. */
function filler(text: string): string {
  return text.replace(/\S/g, (_, i: number) => "noodlesoup"[i % 10]);
}

export function VeilText({ veil, text }: { veil: VeilState; text: string }) {
  return veil.shown ? (
    <>{text}</>
  ) : (
    <span className="veil__text" aria-hidden="true">
      {filler(text)}
    </span>
  );
}

export function VeilEye({ veil, what }: { veil: VeilState; what: string }) {
  return (
    <button
      type="button"
      className="btn btn--ghost veil__eye"
      onClick={veil.toggle}
      aria-pressed={veil.shown}
      aria-label={veil.shown ? `Hide ${what}` : `Show ${what}`}
    >
      <Icon name={veil.shown ? "eye-off" : "eye"} />
    </button>
  );
}

/**
 * Name and eye on one line. Screen readers hear "hidden" in place of the name
 * while the veil is up.
 */
export function Veiled({
  veil,
  text,
  what,
  children,
}: {
  veil: VeilState;
  text: string;
  what: string;
  children?: (shownText: ReactNode) => ReactNode;
}) {
  const name = <VeilText veil={veil} text={text} />;
  return (
    <span className="veil">
      <span className="veil__name">
        {!veil.shown && <span className="sr-only">Hidden until revealed</span>}
        {children ? children(name) : name}
      </span>
      <VeilEye veil={veil} what={what} />
    </span>
  );
}
