// Admin view for notices posted to players: what's running, what's booked,
// what already ran — and how many people each one actually reached.

import { useEffect, useMemo, useState } from "react";
import type {
  AdminAnnouncement,
  AnnouncementAudience,
  AnnouncementInput,
  AnnouncementReach,
  AnnouncementStatus,
} from "../../shared/types";
import { ANNOUNCEMENT_LIMITS } from "../../shared/types";
import { gameToday } from "../../shared/time";
import { NoticeCard } from "../game/AnnouncementModal";
import Markdown from "../game/Markdown";
import { Modal } from "../game/components";
import { shortDate } from "./analyticsUi";
import * as api from "./api";

/** Display order for the groups — what's live first, history last. */
const STATUS_META: { key: AnnouncementStatus; label: string; blurb: string }[] = [
  { key: "active", label: "On the board", blurb: "Running right now — players are seeing these." },
  { key: "upcoming", label: "Booked", blurb: "Waiting on their start date." },
  { key: "past", label: "Served", blurb: "Their window has closed." },
  { key: "retired", label: "Pulled", blurb: "Switched off by hand, whatever the dates say." },
];

/** Also used by the dashboard's Overview tab to label a live notice. */
export const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  all: "Everyone",
  returning: "Returning players",
};

/** Today + n days as YYYY-MM-DD, in the game's own timezone. */
function etDay(offset: number): string {
  return gameToday(new Date(Date.now() + offset * 86_400_000));
}

function blankInput(): AnnouncementInput {
  return {
    header: "",
    body: "",
    audience: "all",
    startDate: etDay(0),
    // A week is the shape most notices want; it's two clicks to change.
    endDate: etDay(6),
    isActive: true,
  };
}

/**
 * Who a notice reached. The bar strip is per-ET-day, and every bar is the same
 * hue on purpose — the days are a sequence, not categories, so height already
 * carries the only value there is.
 */
function Reach({ reach }: { reach: AnnouncementReach }) {
  const peak = Math.max(1, ...reach.daily.map((d) => d.players));
  return (
    <div className="reach">
      <p className="reach__total">
        <strong>{reach.players}</strong> player{reach.players === 1 ? "" : "s"} reached
      </p>
      {reach.players > 0 && (
        <p className="reach__surfaces">
          <span className="badge">web {reach.bySurface.web}</span>
          <span className="badge badge--off">discord {reach.bySurface.discord}</span>
        </p>
      )}
      {reach.daily.length > 0 && (
        <div
          className="reach__spark"
          role="img"
          aria-label={reach.daily.map((d) => `${shortDate(d.date)}: ${d.players}`).join(", ")}
        >
          {reach.daily.map((d) => (
            <span
              key={d.date}
              className="reach__bar"
              style={{ height: `${Math.max(8, Math.round((d.players / peak) * 100))}%` }}
              title={`${shortDate(d.date)} — ${d.players} player${d.players === 1 ? "" : "s"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Create/edit form with a live preview of the real notice card — the preview
 * reuses the game's own markup and stylesheet, so what it shows is what the
 * player gets, down to the typeface.
 */
function Editor({
  initial,
  onCancel,
  onSaved,
}: {
  /** The notice being edited, or null for a new one. */
  initial: AdminAnnouncement | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<AnnouncementInput>(() =>
    initial
      ? {
          header: initial.header,
          body: initial.body,
          audience: initial.audience,
          startDate: initial.startDate,
          endDate: initial.endDate,
          isActive: initial.isActive,
        }
      : blankInput(),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof AnnouncementInput>(key: K, value: AnnouncementInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Mirrors the server's rules (worker/announcements.ts) so the Save button can
  // say why it's disabled instead of round-tripping to find out.
  const problem =
    !form.header.trim()
      ? "Give it a header."
      : !form.body.trim()
        ? "Write a message."
        : form.endDate < form.startDate
          ? "The end date is before the start date."
          : null;

  const save = async () => {
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      if (initial) await api.updateAnnouncement(initial.id, form);
      else await api.createAnnouncement(form);
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
        <h2 style={{ margin: 0 }}>{initial ? "Edit notice" : "New notice"}</h2>
        <button className="btn btn--ghost" onClick={onCancel}>
          Back to notices
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="announce-editor">
        <div className="announce-editor__form">
          <div className="field">
            <label>
              Header ({form.header.length}/{ANNOUNCEMENT_LIMITS.header})
            </label>
            <input
              value={form.header}
              maxLength={ANNOUNCEMENT_LIMITS.header}
              placeholder="Sixty new dishes on the menu"
              onChange={(e) => set("header", e.target.value)}
            />
          </div>

          <div className="field">
            <label>
              Message ({form.body.length}/{ANNOUNCEMENT_LIMITS.body})
            </label>
            <textarea
              rows={6}
              value={form.body}
              maxLength={ANNOUNCEMENT_LIMITS.body}
              placeholder={
                "The kitchen's been busy. **Sixty** new Specials just went on the board.\n\nBlank line = new paragraph."
              }
              onChange={(e) => set("body", e.target.value)}
            />
            <p className="field-hint">
              <code>**bold**</code>, <code>*italic*</code>, <code>[label](/link)</code>. Nothing else, and no HTML.
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
            Both days included, and both are game days — a notice ending today runs until midnight ET.
          </p>

          <div className="field">
            <label>Show to</label>
            <select value={form.audience} onChange={(e) => set("audience", e.target.value as AnnouncementAudience)}>
              <option value="all">Everyone</option>
              <option value="returning">Returning players only</option>
            </select>
            <p className="field-hint">
              A returning player is one who has finished at least one game. New players meet the how-to first, then
              anything marked for everyone.
            </p>
          </div>

          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
                style={{ width: "auto", marginRight: 8 }}
              />
              Live — uncheck to pull it off the board without deleting it
            </label>
          </div>

          {problem && <p className="dash-note">{problem}</p>}

          <div className="btn-row">
            <button className="btn btn--red" disabled={busy || !!problem} onClick={() => void save()}>
              {busy ? "Saving…" : initial ? "Save changes" : "Post it"}
            </button>
            <button className="btn btn--ghost" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>

        {/* The card is the game's own <NoticeCard>, and the wrapper repeats the
            shape Modal gives it when it has a footer: modal--paneled, the
            scrolling body, the pinned button, the close ×. Drop any of those and
            the preview's padding, dashed footer rule and card height all stop
            matching what the player gets. The button and × are inert on purpose
            — nothing here to close. */}
        <div className="announce-editor__preview">
          <p className="dash-note" style={{ marginTop: 0 }}>What the player sees</p>
          <div className="modal modal--paneled modal--notice announce-preview">
            <span className="modal__close" aria-hidden="true">
              ×
            </span>
            <div className="modal__scroll">
              <NoticeCard
                header={form.header || "Your header"}
                body={form.body || "_Your message will show up here._"}
              />
            </div>
            <div className="modal__footer">
              {/* A real <button>: .btn sets no display, so a <span> would lay
                  out inline and .notice__ok's full width would do nothing. */}
              <button className="btn btn--red notice__ok" type="button" tabIndex={-1} aria-hidden="true">
                Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function AnnouncementsPanel() {
  const [rows, setRows] = useState<AdminAnnouncement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // undefined = list; null = new notice; a row = editing that one.
  const [editing, setEditing] = useState<AdminAnnouncement | null | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<AdminAnnouncement | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = () => {
    api.getAnnouncements().then(setRows, (e: Error) => setError(e.message));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const grouped = useMemo(() => {
    const out = new Map<AnnouncementStatus, AdminAnnouncement[]>();
    for (const meta of STATUS_META) out.set(meta.key, []);
    for (const row of rows ?? []) out.get(row.status)?.push(row);
    return out;
  }, [rows]);

  const remove = async (row: AdminAnnouncement) => {
    setConfirmDelete(null);
    setBusyId(row.id);
    setError(null);
    try {
      await api.deleteAnnouncement(row.id);
      setRows((prev) => (prev ?? []).filter((r) => r.id !== row.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  if (editing !== undefined) {
    return (
      <Editor
        initial={editing}
        onCancel={() => setEditing(undefined)}
        onSaved={() => {
          setEditing(undefined);
          load();
        }}
      />
    );
  }

  if (error && !rows) return <p className="form-error">{error}</p>;
  if (!rows) return <p style={{ color: "var(--cream)" }}>Reading the board…</p>;

  return (
    <section className="panel">
      <div className="btn-row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Announcements ({rows.length})</h2>
        <button className="btn btn--red" onClick={() => setEditing(null)}>
          + New notice
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      <p className="dash-note" style={{ marginTop: 0 }}>
        Notices appear on Today's Special, after the how-to, once per player. Reach counts anonymous devices, the same
        way the engagement panel does — one per player, however many times they see it.
      </p>

      {rows.length === 0 && (
        <p className="dash-note">Nothing posted yet. A notice is how the diner tells players what's changed.</p>
      )}

      {STATUS_META.map((meta) => {
        const group = grouped.get(meta.key) ?? [];
        if (group.length === 0) return null;
        return (
          <div key={meta.key} className="announce-group">
            <h3 className="announce-group__title">
              {meta.label} <span className="announce-group__count">{group.length}</span>
            </h3>
            <p className="dash-note" style={{ marginTop: 0 }}>{meta.blurb}</p>
            <div className="announce-list">
              {group.map((row) => (
                <article key={row.id} className={`announce-card announce-card--${row.status}`}>
                  <div className="announce-card__main">
                    <h4 className="announce-card__header">{row.header}</h4>
                    <div className="announce-card__body">
                      <Markdown source={row.body} />
                    </div>
                    <p className="announce-card__meta">
                      <span className="badge">{AUDIENCE_LABEL[row.audience]}</span>
                      <span>
                        {shortDate(row.startDate)} – {shortDate(row.endDate)}
                      </span>
                    </p>
                    <div className="btn-row">
                      <button className="btn" onClick={() => setEditing(row)}>
                        Edit
                      </button>
                      <button
                        className="btn btn--ghost"
                        disabled={busyId === row.id}
                        onClick={() => setConfirmDelete(row)}
                      >
                        {busyId === row.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                  <Reach reach={row.reach} />
                </article>
              ))}
            </div>
          </div>
        );
      })}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)}>
          <h3 style={{ marginTop: 0 }}>Delete "{confirmDelete.header}"?</h3>
          <p>
            This removes the notice and the {confirmDelete.reach.players} view
            {confirmDelete.reach.players === 1 ? "" : "s"} recorded against it. To stop showing it but keep the
            numbers, edit it and uncheck <strong>Live</strong> instead.
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
