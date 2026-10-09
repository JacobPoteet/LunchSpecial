// The Events page's schedule: when the diner dresses up.
//
// This panel books and switches costumes; it never edits one. Every costume is
// handcrafted in src/occasions/<id>/, and each comes with its own yearly window
// in code (shared/occasions.ts), so a season runs on time with nothing booked
// here. A booking is how you move, shorten, extend or switch off one season,
// or run a costume outside its season to look at it. A booking that touches a
// season speaks for all of it, so a shortened Halloween doesn't creep back to
// its full length around the edges.
//
// Static, like the rest of the back office: nothing here animates, and the
// costume itself is seen by opening the game with it on, not in a preview pane.

import { useState } from "react";
import {
  occasionRuns,
  seasonOpening,
  type AdminOccasions,
  type OccasionBooking,
  type OccasionId,
  type OccasionMeta,
  type Span,
} from "../../shared/occasions";
import { shortDate } from "./analyticsUi";
import * as api from "./api";

type Booking = AdminOccasions["bookings"][number];

function spanLabel(s: Span): string {
  return s.start === s.end ? shortDate(s.start) : `${shortDate(s.start)} – ${shortDate(s.end)}`;
}

/** What the coming season looks like right now, in one line. */
function seasonLine(meta: OccasionMeta, today: string, bookings: Booking[]): string {
  const year = Number(today.slice(0, 4));
  // This season and next, so a Halloween that has just finished points at the next one.
  const runs = occasionRuns(today, `${year + 1}-12-31`, bookings).filter((r) => r.occasionId === meta.id);
  const next = runs[0];
  const opening = seasonOpening(meta.id, year);
  if (!next) return "Not on the calendar.";
  if (next.start <= today) return `On now, through ${shortDate(next.end)}.`;
  const offThisYear = today <= opening.end && next.start > opening.end;
  return `${offThisYear ? "Off this year. " : ""}Next: ${spanLabel(next)}.`;
}

function BookingForm({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: OccasionBooking;
  busy: boolean;
  onSave: (input: OccasionBooking) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const problem = form.endDate < form.startDate ? "The end date is before the start date." : null;
  return (
    <div className="occasion-form">
      <div className="field">
        <label>Starts</label>
        <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
      </div>
      <div className="field">
        <label>Ends</label>
        <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
      </div>
      <div className="field occasion-form__live">
        <label>
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            style={{ width: "auto", marginRight: 8 }}
          />
          In costume (uncheck to switch these days off)
        </label>
      </div>
      {problem && <p className="dash-note">{problem}</p>}
      <div className="btn-row">
        <button className="btn btn--red" disabled={busy || !!problem} onClick={() => onSave(form)}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function OccasionsPanel({
  data,
  error,
  onChanged,
}: {
  data: AdminOccasions | null;
  error: string | null;
  /** Reload the bookings; the Specials board below reads the same list. */
  onChanged: () => void;
}) {
  /** Which form is open: a booking id, "new:<occasion>", or nothing. */
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return null;
  const { today, occasions, bookings } = data;
  const year = Number(today.slice(0, 4));

  const run = async (job: () => Promise<unknown>) => {
    setBusy(true);
    setProblem(null);
    try {
      await job();
      setEditing(null);
      onChanged();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** The season a quick action acts on: this year's, or next year's once this one is over. */
  const comingSeason = (id: OccasionId): Span => {
    const now = seasonOpening(id, year);
    return today > now.end ? seasonOpening(id, year + 1) : now;
  };

  return (
    <section className="panel">
      <h2 style={{ marginTop: 0 }}>Schedule</h2>
      <p className="dash-note" style={{ marginTop: 0 }}>
        Each costume is built in code and runs in its own window every year, booked or not. Book here to move,
        shorten or switch off a season. Lunch keys on the Special's ET date, the bar on its night. "Try it on" is
        never counted.
      </p>
      {problem && <p className="form-error">{problem}</p>}

      {occasions.map((meta) => {
        const own = bookings.filter((b) => b.occasionId === meta.id);
        const season = comingSeason(meta.id);
        const codeWindow = seasonOpening(meta.id, year);
        return (
          <div className="occasion-card" key={meta.id}>
            <div className="occasion-card__head">
              <h3 className="occasion-card__name">
                {meta.name} <small>“{meta.billing}”</small>
              </h3>
              <p className="occasion-card__line">{seasonLine(meta, today, own)}</p>
              <p className="dash-note occasion-card__window">
                Window in code: {spanLabel(codeWindow)} every year.
              </p>
            </div>

            {own.length > 0 && (
              <ul className="occasion-bookings">
                {own.map((b) =>
                  editing === String(b.id) ? (
                    <li key={b.id}>
                      <BookingForm
                        initial={b}
                        busy={busy}
                        onCancel={() => setEditing(null)}
                        onSave={(input) => void run(() => api.updateOccasionBooking(b.id, input))}
                      />
                    </li>
                  ) : (
                    <li key={b.id} className="occasion-bookings__row">
                      <span className="occasion-bookings__span">{spanLabel({ start: b.startDate, end: b.endDate })}</span>
                      <span className={b.isActive ? "badge" : "badge badge--off"}>{b.isActive ? "in costume" : "off"}</span>
                      <span className="occasion-bookings__actions">
                        <button className="btn btn--ghost" disabled={busy} onClick={() => setEditing(String(b.id))}>
                          Edit
                        </button>
                        <button
                          className="btn btn--ghost"
                          disabled={busy}
                          onClick={() => void run(() => api.deleteOccasionBooking(b.id))}
                        >
                          Remove
                        </button>
                      </span>
                    </li>
                  ),
                )}
              </ul>
            )}

            {editing === `new:${meta.id}` ? (
              <BookingForm
                initial={{ occasionId: meta.id, startDate: season.start, endDate: season.end, isActive: true }}
                busy={busy}
                onCancel={() => setEditing(null)}
                onSave={(input) => void run(() => api.createOccasionBooking(input))}
              />
            ) : (
              <div className="btn-row occasion-card__actions">
                <button className="btn" disabled={busy} onClick={() => setEditing(`new:${meta.id}`)}>
                  + Book dates
                </button>
                <button
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      api.createOccasionBooking({
                        occasionId: meta.id,
                        startDate: season.start,
                        endDate: season.end,
                        isActive: false,
                      }),
                    )
                  }
                >
                  Switch off {season.start.slice(0, 4)}
                </button>
                {/* The costume is cosmetic, so the override works on the live
                    site: it changes what this tab looks like and nothing that
                    is counted. The Worker stamps a round's occasion from its
                    date and never hears about the param. */}
                <a className="btn btn--ghost" href={`/?occasion=${meta.id}`} target="_blank" rel="noopener">
                  Try it on
                </a>
                <a className="btn btn--ghost" href={`/?bar=1&occasion=${meta.id}`} target="_blank" rel="noopener">
                  At the bar
                </a>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
