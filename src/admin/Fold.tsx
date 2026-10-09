import { useState, type ReactNode } from "react";

/**
 * A panel that stays a one-line bar until it is opened. Closed, its children are
 * not mounted, so a folded panel makes no request: the Menu tab's catalogue
 * halves are big, fetch their own data, and answer questions you ask rarely.
 *
 * Opening swaps the bar for the real panel, which keeps its own heading; a link
 * under it folds it away again. Not persisted: a reload starts folded.
 */
export default function Fold({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <section className="panel panel--fold">
        <button type="button" className="fold__btn" aria-expanded="false" onClick={() => setOpen(true)}>
          <span className="fold__title">{title}</span>
          <span className="fold__hint">{hint}</span>
        </button>
      </section>
    );
  }
  return (
    <>
      {children}
      <p className="dash-note fold__hide">
        <button type="button" className="link-btn" aria-expanded="true" onClick={() => setOpen(false)}>
          Fold away {title.toLowerCase()}
        </button>
      </p>
    </>
  );
}
