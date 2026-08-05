import { useEffect, useMemo, useState } from "react";
import type { DishRequest } from "../../shared/types";
import type { DishDraft } from "./AdminApp";
import { Modal } from "../game/components";
import * as api from "./api";

/**
 * Build the exact "add dishes:" line the CLAUDE.md workflow understands, so the
 * whole inbox can be pasted into a chat with Claude to generate them at once.
 * Each entry is `Name (Country)`, country dropped when unknown.
 *
 * The fan-submission note rides along because everything in this inbox came from
 * a player: pasting the line without it produces dishes that are silently
 * untagged, and the credit then has to be added by hand, dish by dish. The
 * "add dishes:" prefix stays at the front — that's the phrase the workflow keys
 * on — so the note goes after the list.
 */
function buildCopyText(requests: DishRequest[]): string {
  const list = requests
    .map((r) => (r.country ? `${r.name} (${r.country})` : r.name))
    .join(", ");
  return `add dishes: ${list}\n\nThese are all fan submissions — tag them (is_fan_submission = 1).`;
}

export default function RequestsView({
  onAddAsDish,
  onCountChange,
}: {
  onAddAsDish: (draft: DishDraft) => void;
  onCountChange: (count: number) => void;
}) {
  const [rows, setRows] = useState<DishRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

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

  const copyText = useMemo(() => (rows && rows.length > 0 ? buildCopyText(rows) : ""), [rows]);

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

  const clearAll = async () => {
    setConfirmingClear(false);
    const current = rows ?? [];
    setError(null);
    try {
      await Promise.all(current.map((r) => api.deleteRequest(r.id)));
      setRows([]);
      onCountChange(0);
    } catch (e) {
      setError((e as Error).message);
      load();
    }
  };

  const copy = () => {
    if (!copyText) return;
    navigator.clipboard.writeText(copyText).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setError("Couldn't copy to clipboard"),
    );
  };

  if (error && !rows) return <p className="form-error">{error}</p>;
  if (!rows) return <p style={{ color: "var(--cream)" }}>Checking the suggestion box…</p>;

  return (
    <section className="panel">
      <div className="btn-row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Dish requests ({rows.length})</h2>
        {rows.length > 0 && (
          <div className="btn-row">
            <button className="btn" onClick={copy}>
              {copied ? "Copied!" : "📋 Copy all for Claude"}
            </button>
            <button className="btn btn--ghost" onClick={() => setConfirmingClear(true)}>
              Clear all
            </button>
          </div>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      <p className="dash-note" style={{ marginTop: 0 }}>
        Player-submitted from the receipt after a round. "Copy all for Claude" gives you an{" "}
        <code>add dishes:</code> line you can paste into a chat to generate them in one go.
      </p>

      {rows.length === 0 ? (
        <p className="dash-note">The suggestion box is empty. Requests show up here as players send them in.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Dish</th>
              <th>Country</th>
              <th>Note</th>
              <th>From</th>
              <th>When</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td data-label="Dish">
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
                        onAddAsDish({ prefill: { name: r.name, country: r.country ?? "" }, requestId: r.id })
                      }
                    >
                      Add as dish
                    </button>
                    <button className="btn btn--ghost" disabled={busyId === r.id} onClick={() => void remove(r.id)}>
                      {busyId === r.id ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {confirmingClear && (
        <Modal onClose={() => setConfirmingClear(false)}>
          <h3 style={{ marginTop: 0 }}>Clear all requests?</h3>
          <p>
            Remove all {rows.length} request{rows.length === 1 ? "" : "s"} from the inbox? This can't be undone —
            copy them first if you want to keep them.
          </p>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn btn--red" onClick={() => void clearAll()}>
              Clear all
            </button>
            <button className="btn btn--ghost" onClick={() => setConfirmingClear(false)}>
              Keep them
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
