import { useEffect, useMemo, useState } from "react";
import type { DishRequest, RequestKind } from "../../shared/types";
import { REQUEST_KINDS } from "../../shared/types";
import type { RequestDraft } from "./AdminApp";
import { Modal } from "../game/components";
import * as api from "./api";

/**
 * Build the exact `/create-dishes` (or `/create-drinks`) line the skill
 * understands, so a whole section of the inbox can be pasted into a chat with
 * Claude to generate them at once. Each entry is `Name (Country)`, country
 * dropped when unknown.
 *
 * The fan-submission note rides along because everything in this inbox came from
 * a player: pasting the line without it produces dishes that are silently
 * untagged, and the credit then has to be added by hand, dish by dish.
 *
 * The prefix is the slash command rather than the old "add dishes:" phrase.
 * Both land on the same workflow, but the command loads the skill outright
 * where the prose form leaves the model to notice it should. A slash command is
 * only read as one at the very start of the message, so the note goes after the
 * list and the command keeps the front.
 */
export function buildCopyText(kind: RequestKind, requests: DishRequest[]): string {
  const list = requests
    .map((r) => (r.country ? `${r.name} (${r.country})` : r.name))
    .join(", ");
  return `${SECTION[kind].command} ${list}\n\nThese are all fan submissions — tag them (is_fan_submission = 1).`;
}

/** The words each half of the inbox uses. Written off REQUEST_KINDS, never typed out. */
const SECTION: Record<
  RequestKind,
  { heading: string; noun: string; command: string; addLabel: string; where: string; empty: string }
> = {
  dish: {
    heading: "Dish requests",
    noun: "dish",
    command: "/create-dishes",
    addLabel: "Add as dish",
    where: "the check after a round",
    empty: "No dish requests. They show up here as players send them in from the check.",
  },
  drink: {
    heading: "Drink requests",
    noun: "drink",
    command: "/create-drinks",
    addLabel: "Add as drink",
    where: "the tab after a Nightcap",
    empty: "No drink requests. They show up here as players send them in from the tab.",
  },
};

export default function RequestsView({
  onAddAs,
  onCountChange,
}: {
  onAddAs: (draft: RequestDraft) => void;
  onCountChange: (count: number) => void;
}) {
  const [rows, setRows] = useState<DishRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [copied, setCopied] = useState<RequestKind | null>(null);
  const [confirmingClear, setConfirmingClear] = useState<RequestKind | null>(null);

  const load = () => {
    api.getRequests().then(
      (data) => {
        setRows(data);
        onCountChange(data.length);
      },
      (e: Error) => setError(e.message),
    );
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  // One inbox, split by kind. The nav badge counts the whole thing; each
  // section counts its own.
  const byKind = useMemo(() => {
    const out = {} as Record<RequestKind, DishRequest[]>;
    for (const k of REQUEST_KINDS) out[k] = (rows ?? []).filter((r) => r.kind === k);
    return out;
  }, [rows]);

  const remove = async (id: number) => {
    setBusyId(id);
    setError(null);
    try {
      await api.deleteRequest(id);
      setRows((prev) => {
        const next = (prev ?? []).filter((r) => r.id !== id);
        onCountChange(next.length);
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  // Clears one section, never the whole inbox: a night's worth of drink ideas
  // shouldn't go with the dishes you've just finished working through.
  const clearSection = async (kind: RequestKind) => {
    setConfirmingClear(null);
    const current = byKind[kind];
    setError(null);
    try {
      await Promise.all(current.map((r) => api.deleteRequest(r.id)));
      setRows((prev) => {
        const next = (prev ?? []).filter((r) => r.kind !== kind);
        onCountChange(next.length);
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
      load();
    }
  };

  const copy = (kind: RequestKind) => {
    const text = buildCopyText(kind, byKind[kind]);
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(kind);
        setTimeout(() => setCopied(null), 2000);
      },
      () => setError("Couldn't copy to clipboard"),
    );
  };

  if (error && !rows) return <p className="form-error">{error}</p>;
  if (!rows) return <p style={{ color: "var(--cream)" }}>Checking the suggestion box…</p>;

  return (
    <>
      {REQUEST_KINDS.map((kind) => {
        const list = byKind[kind];
        const words = SECTION[kind];
        return (
          <section className="panel" key={kind}>
            <div className="btn-row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>
                {words.heading} ({list.length})
              </h2>
              {list.length > 0 && (
                <div className="btn-row">
                  <button className="btn" onClick={() => copy(kind)}>
                    {copied === kind ? "Copied!" : "📋 Copy all for Claude"}
                  </button>
                  <button className="btn btn--ghost" onClick={() => setConfirmingClear(kind)}>
                    Clear all
                  </button>
                </div>
              )}
            </div>

            {error && <p className="form-error">{error}</p>}

            <p className="dash-note" style={{ marginTop: 0 }}>
              Player-submitted from {words.where}. "Copy all for Claude" gives you a <code>{words.command}</code>{" "}
              line you can paste into a chat to generate them in one go.
            </p>

            {list.length === 0 ? (
              <p className="dash-note">{words.empty}</p>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{kind === "dish" ? "Dish" : "Drink"}</th>
                    <th>Country</th>
                    <th>Note</th>
                    <th>From</th>
                    <th>When</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id}>
                      <td data-label={kind === "dish" ? "Dish" : "Drink"}>
                        <strong>{r.name}</strong>
                      </td>
                      <td data-label="Country">{r.country ?? "—"}</td>
                      <td data-label="Note">{r.note ?? "—"}</td>
                      <td data-label="From">
                        <span className={`badge${r.surface === "discord" ? " badge--off" : ""}`}>{r.surface}</span>
                      </td>
                      <td data-label="When">{r.createdAt.slice(0, 10)}</td>
                      <td data-label="Actions">
                        <div className="btn-row">
                          <button
                            className="btn btn--red"
                            disabled={busyId === r.id}
                            onClick={() =>
                              onAddAs({ kind, prefill: { name: r.name, country: r.country ?? "" }, requestId: r.id })
                            }
                          >
                            {words.addLabel}
                          </button>
                          <button
                            className="btn btn--ghost"
                            disabled={busyId === r.id}
                            onClick={() => void remove(r.id)}
                          >
                            {busyId === r.id ? "Removing…" : "Remove"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}

      {confirmingClear && (
        <Modal onClose={() => setConfirmingClear(null)}>
          <h3 style={{ marginTop: 0 }}>Clear all {SECTION[confirmingClear].noun} requests?</h3>
          <p>
            Remove all {byKind[confirmingClear].length} {SECTION[confirmingClear].noun} request
            {byKind[confirmingClear].length === 1 ? "" : "s"} from the inbox? This can't be undone — copy them first if
            you want to keep them.
          </p>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn btn--red" onClick={() => void clearSection(confirmingClear)}>
              Clear all
            </button>
            <button className="btn btn--ghost" onClick={() => setConfirmingClear(null)}>
              Keep them
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
