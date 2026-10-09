// The Events page: book a costume, then read what it did. Built to work exactly
// like Announcements: one card per booking, grouped by where it sits in time,
// "+ New event", an editor with dates and a Live switch, and the numbers on
// the card.
//
// "Events" because that is what you call them; "occasions" in the code and on
// the wire, because ad blockers match "event" in a URL (see
// shared/conventions.test.ts). Each costume is handcrafted in
// src/occasions/<id>/; this page only books it and reads it back.
//
// No booking, no costume. Live bookings can't overlap (the Worker answers 409),
// so one card is exactly one run. Static like the rest of the back office:
// nothing here animates.

import { useEffect, useMemo, useState } from "react";
import {
  OCCASIONS,
  nextSuggested,
  shareVerdict,
  type AdminOccasion,
  type AdminOccasions,
  type OccasionBooking,
  type OccasionId,
  type OccasionImpact,
  type OccasionReach,
  type OccasionStatus,
  type OccasionTally,
} from "../../shared/occasions";
import { countChange, rangeLabel, rate } from "../../shared/sample";
import { Modal } from "../game/components";
import { Reach } from "./AnnouncementsPanel";
import { shortDate } from "./analyticsUi";
import * as api from "./api";

/** Display order for the groups, as on Announcements: what's live first, history last. */
const STATUS_META: { key: OccasionStatus; label: string; blurb: string }[] = [
  { key: "active", label: "On now", blurb: "Players are seeing this costume today." },
  { key: "upcoming", label: "Booked", blurb: "Waiting on its first day." },
  { key: "past", label: "Ran", blurb: "Finished. Its numbers are final." },
  { key: "retired", label: "Pulled", blurb: "Switched off by hand, whatever the dates say. Keeps the numbers it earned." },
];

const span = (b: { startDate: string; endDate: string }) =>
  b.startDate === b.endDate ? shortDate(b.startDate) : `${shortDate(b.startDate)} – ${shortDate(b.endDate)}`;

/** A percentage of `of`, with its interval when `of` is thin. "—" when there's nothing to divide by. */
function Pct({ n, of }: { n: number; of: number }) {
  const r = rate(n, of);
  if (!r) return <>—</>;
  const range = rangeLabel(r);
  return (
    <>
      {r.pct}%{range && <span className="rate-range"> {range}</span>}
    </>
  );
}

/** The card's reach strip, in the notices' shape so it draws the same way. */
function ReachStrip({ reach }: { reach: OccasionReach }) {
  if (reach.measuredFrom === null) {
    return (
      <div className="reach">
        <p className="reach__total">Unmeasured</p>
        <p className="dash-note">It ran before sightings were recorded.</p>
      </div>
    );
  }
  return (
    <Reach
      reach={{
        players: reach.devices,
        bySurface: reach.bySurface,
        daily: reach.daily.map((d) => ({ date: d.date, players: d.devices })),
      }}
    />
  );
}

function ImpactRows({ label, run, before }: { label: string; run: OccasionTally; before: OccasionTally }) {
  if (run.started === 0 && before.started === 0) return null;
  const change = countChange(run.started, before.started);
  return (
    <>
      <tr>
        <th scope="row" rowSpan={2}>
          {label}
        </th>
        <td>In costume</td>
        <td>
          {run.started}
          {change.pct !== null && (
            <span className="rate-range">
              {" "}
              ({change.pct > 0 ? "+" : ""}
              {change.pct}%{change.clear ? "" : ", within the noise"})
            </span>
          )}
        </td>
        <td>
          <Pct n={run.completed} of={run.started} />
        </td>
        <td>
          <Pct n={run.shared} of={run.completed} />
        </td>
      </tr>
      <tr>
        <td>Weeks before</td>
        <td>{before.started}</td>
        <td>
          <Pct n={before.completed} of={before.started} />
        </td>
        <td>
          <Pct n={before.shared} of={before.completed} />
        </td>
      </tr>
    </>
  );
}

/** Everything past the strip, folded: who came back, who found the ghost, and what it moved. */
function Details({ reach, impact }: { reach: OccasionReach; impact: OccasionImpact }) {
  const firsts = countChange(impact.firstTimers.run, impact.firstTimers.baseline);
  return (
    <details className="dash-details occasion-details">
      <summary>Reach and impact</summary>
      {reach.measuredFrom !== null && reach.daily.length > 0 && reach.measuredFrom > reach.daily[0].date && (
        <p className="dash-note">Reach measured from {shortDate(reach.measuredFrom)}; the days before it are unmeasured.</p>
      )}
      {reach.measuredFrom !== null && (
        <div className="metric-row">
          <div className="metric">
            <span className="metric__num">{reach.byRoom.diner}</span>
            <span className="metric__label">In the diner</span>
          </div>
          <div className="metric">
            <span className="metric__num">{reach.byRoom.bar}</span>
            <span className="metric__label">At the bar</span>
            <span className="occasion-metric__sub">
              <Pct n={reach.byRoom.bar} of={reach.devices} />
            </span>
          </div>
          <div className="metric">
            <span className="metric__num">{reach.returned}</span>
            <span className="metric__label">Came back another day</span>
            <span className="occasion-metric__sub">
              <Pct n={reach.returned} of={reach.devices} />
            </span>
          </div>
          <div className="metric">
            <span className="metric__num">{reach.knocked}</span>
            <span className="metric__label">Found the ghost</span>
            <span className="occasion-metric__sub">
              <Pct n={reach.knocked} of={reach.byRoom.diner} />
            </span>
          </div>
          <div className="metric">
            <span className="metric__num">{reach.after}</span>
            <span className="metric__label">Replayed it later</span>
          </div>
        </div>
      )}
      <p className="dish-report__headline">{shareVerdict(impact.lunch.run, impact.lunch.baseline, impact.pending)}</p>
      <div className="day-table-wrap">
        <table className="day-table">
          <thead>
            <tr>
              <th />
              <th />
              <th>Started</th>
              <th>Finished</th>
              <th>Shared</th>
            </tr>
          </thead>
          <tbody>
            <ImpactRows label="Lunch" run={impact.lunch.run} before={impact.lunch.baseline} />
            <ImpactRows label="Nightcap" run={impact.night.run} before={impact.night.baseline} />
          </tbody>
        </table>
      </div>
      <p className="occasion-first">
        <strong>{impact.firstTimers.run}</strong> first-time player{impact.firstTimers.run === 1 ? "" : "s"} in
        costume against <strong>{impact.firstTimers.baseline}</strong> the weeks before
        {firsts.pct !== null && (
          <>
            {" "}
            ({firsts.pct > 0 ? "+" : ""}
            {firsts.pct}%{firsts.clear ? "" : ", within the noise"})
          </>
        )}
        .
      </p>
      <p className="dash-note">
        Reach counts devices, once each. "Found the ghost" is out of devices that saw the diner; "replayed it later"
        is a Leftover from one of these days opened after it ended. Impact compares{" "}
        {shortDate(impact.baseline.start)} – {shortDate(impact.baseline.end)}, the same weekdays; finished is per round
        started, shared per round finished.
      </p>
    </details>
  );
}

/** Create or edit one booking. Mirrors the Worker's checks so Save can say why it's off. */
function Editor({
  initial,
  occasions,
  onCancel,
  onSaved,
}: {
  /** The booking being edited (with an id), or a prefilled new one. */
  initial: OccasionBooking & { id?: number };
  occasions: AdminOccasions["occasions"];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<OccasionBooking>({
    occasionId: initial.occasionId,
    startDate: initial.startDate,
    endDate: initial.endDate,
    isActive: initial.isActive,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof OccasionBooking>(key: K, value: OccasionBooking[K]) => setForm((f) => ({ ...f, [key]: value }));

  const problem = form.endDate < form.startDate ? "The end date is before the start date." : null;
  const suggested = OCCASIONS[form.occasionId].suggested;

  const save = async () => {
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      if (initial.id !== undefined) await api.updateOccasionBooking(initial.id, form);
      else await api.createOccasionBooking(form);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <div className="btn-row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{initial.id !== undefined ? "Edit event" : "New event"}</h2>
        <button className="btn btn--ghost" onClick={onCancel}>
          Back to events
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="announce-editor__form">
        <div className="field">
          <label>Costume</label>
          <select value={form.occasionId} onChange={(e) => set("occasionId", e.target.value as OccasionId)}>
            {occasions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.billing})
              </option>
            ))}
          </select>
          <p className="field-hint">
            Each costume is built in code. It usually runs {suggested.from.replace("-", "/")} –{" "}
            {suggested.to.replace("-", "/")}.
          </p>
        </div>

        <div className="announce-editor__row">
          <div className="field">
            <label>Starts</label>
            <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </div>
          <div className="field">
            <label>Ends</label>
            <input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
          </div>
        </div>
        <p className="field-hint">
          Both days included. Lunch goes by the Special's ET date, the bar by its night. Can't overlap another live
          event.
        </p>

        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
              style={{ width: "auto", marginRight: 8 }}
            />
            Live (uncheck to pull it without deleting it or its numbers)
          </label>
        </div>

        {problem && <p className="dash-note">{problem}</p>}

        <div className="btn-row">
          <button className="btn btn--red" disabled={busy || !!problem} onClick={() => void save()}>
            {busy ? "Saving…" : initial.id !== undefined ? "Save changes" : "Book it"}
          </button>
          <button className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </section>
  );
}

export default function OccasionsView() {
  const [data, setData] = useState<AdminOccasions | null>(null);
  const [error, setError] = useState<string | null>(null);
  // undefined = list; otherwise the booking being edited or created.
  const [editing, setEditing] = useState<(OccasionBooking & { id?: number }) | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<AdminOccasion | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = () => {
    api.getOccasions().then(setData, (e: Error) => setError(e.message));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const grouped = useMemo(() => {
    const out = new Map<OccasionStatus, AdminOccasion[]>();
    for (const meta of STATUS_META) out.set(meta.key, []);
    for (const row of data?.events ?? []) out.get(row.status)?.push(row);
    return out;
  }, [data]);

  // A costume whose usual season is coming up with nothing live booked on it.
  const unbooked = useMemo(() => {
    if (!data) return [];
    return data.occasions
      .map((o) => ({ o, season: nextSuggested(o.id, data.today) }))
      .filter(
        ({ o, season }) =>
          !data.events.some(
            (e) => e.occasionId === o.id && e.isActive && e.startDate <= season.end && season.start <= e.endDate,
          ),
      );
  }, [data]);

  const remove = async (row: AdminOccasion) => {
    setConfirmDelete(null);
    setBusyId(row.id);
    setError(null);
    try {
      await api.deleteOccasionBooking(row.id);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  if (editing && data) {
    return (
      <Editor
        initial={editing}
        occasions={data.occasions}
        onCancel={() => setEditing(undefined)}
        onSaved={() => {
          setEditing(undefined);
          load();
        }}
      />
    );
  }

  if (error && !data) return <p className="form-error">{error}</p>;
  if (!data) return <p style={{ color: "var(--cream)" }}>Counting the costumes…</p>;

  const blank = (): OccasionBooking => {
    const id = data.occasions[0].id;
    const season = nextSuggested(id, data.today);
    return { occasionId: id, startDate: season.start, endDate: season.end, isActive: true };
  };

  return (
    <section className="panel">
      <div className="btn-row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Events ({data.events.length})</h2>
        <button className="btn btn--red" onClick={() => setEditing(blank())}>
          + New event
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      <p className="dash-note" style={{ marginTop: 0 }}>
        A costume the whole game wears while its event runs. Reach counts devices that saw it, once each; "Try it
        on" is never counted.
      </p>

      {unbooked.map(({ o, season }) => (
        <div className="occasion-suggest" key={o.id}>
          <p>
            <strong>{o.name}</strong> usually runs {span({ startDate: season.start, endDate: season.end })} and
            isn't booked{season.start.slice(0, 4) !== data.today.slice(0, 4) ? ` for ${season.start.slice(0, 4)}` : ""}.
          </p>
          <button
            className="btn"
            onClick={() => setEditing({ occasionId: o.id, startDate: season.start, endDate: season.end, isActive: true })}
          >
            Book these dates
          </button>
        </div>
      ))}

      {data.events.length === 0 && unbooked.length === 0 && <p className="dash-note">Nothing booked yet.</p>}

      {STATUS_META.map((meta) => {
        const group = grouped.get(meta.key) ?? [];
        if (group.length === 0) return null;
        return (
          <div key={meta.key} className="announce-group">
            <h3 className="announce-group__title">
              {meta.label} <span className="announce-group__count">{group.length}</span>
            </h3>
            <p className="dash-note" style={{ marginTop: 0 }}>
              {meta.blurb}
            </p>
            <div className="announce-list">
              {group.map((row) => (
                <article key={row.id} className={`announce-card announce-card--${row.status}`}>
                  <div className="announce-card__main">
                    <h4 className="announce-card__header">
                      {OCCASIONS[row.occasionId].name}{" "}
                      <small className="occasion-billing">“{OCCASIONS[row.occasionId].billing}”</small>
                    </h4>
                    <p className="announce-card__meta">
                      <span>{span(row)}</span>
                      {row.startDate.slice(0, 4) !== data.today.slice(0, 4) && <span>{row.startDate.slice(0, 4)}</span>}
                    </p>
                    <div className="btn-row">
                      <button className="btn" onClick={() => setEditing(row)}>
                        Edit
                      </button>
                      {/* Cosmetic only, so it works on the live site and is never counted. */}
                      <a className="btn btn--ghost" href={`/?occasion=${row.occasionId}`} target="_blank" rel="noopener">
                        Try it on
                      </a>
                      <button
                        className="btn btn--ghost"
                        disabled={busyId === row.id}
                        onClick={() => setConfirmDelete(row)}
                      >
                        {busyId === row.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                  {row.reach ? (
                    <ReachStrip reach={row.reach} />
                  ) : (
                    <div className="reach">
                      <p className="reach__total">Starts {shortDate(row.startDate)}</p>
                    </div>
                  )}
                  {row.reach && row.impact && <Details reach={row.reach} impact={row.impact} />}
                </article>
              ))}
            </div>
          </div>
        );
      })}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)}>
          <h3 style={{ marginTop: 0 }}>Delete {OCCASIONS[confirmDelete.occasionId].name} {span(confirmDelete)}?</h3>
          <p>
            This removes the booking, and the Events page stops showing its numbers. To take the costume off but keep
            the numbers, edit it and uncheck <strong>Live</strong> instead.
          </p>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn btn--red" onClick={() => void remove(confirmDelete)}>
              Delete it
            </button>
            <button className="btn btn--ghost" onClick={() => setConfirmDelete(null)}>
              Keep it
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
