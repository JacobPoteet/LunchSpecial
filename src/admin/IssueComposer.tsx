import { useEffect, useState } from "react";
import type { Issue, IssueBoard, IssueContext } from "../../shared/types";
import { ISSUE_LIMITS } from "../../shared/types";
import { Modal } from "../game/components";
import * as api from "./api";

/**
 * File a GitHub issue without leaving the back office.
 *
 * One surface, not two: the form and the open-issue list share a card, because
 * the list's only job is to stop you filing something that's already filed, and
 * the moment that matters is while you're typing. A separate nav tab would put
 * the check one click away from the thing it's meant to prevent.
 *
 * The context block is the reason this exists rather than a link to
 * github.com/…/issues/new. What an issue filed from a dashboard usually omits
 * is which dashboard — so the panel that was open, the URL (which carries the
 * dashboard's `?tab=`), the dish under edit and the viewport ride along, and the
 * checkbox lets you drop them when the issue isn't about a screen.
 */
export default function IssueComposer({
  context,
  onClose,
}: {
  context: IssueContext;
  onClose: () => void;
}) {
  const [board, setBoard] = useState<IssueBoard | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [attachContext, setAttachContext] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState<Issue | null>(null);

  useEffect(() => {
    api.getIssueBoard().then(setBoard, (e: Error) => setError(e.message));
  }, []);

  const toggleLabel = (name: string) =>
    setLabels((prev) => (prev.includes(name) ? prev.filter((l) => l !== name) : [...prev, name]));

  const file = async () => {
    setBusy(true);
    setError(null);
    try {
      const issue = await api.createIssue({
        title,
        body,
        labels,
        ...(attachContext ? { context } : {}),
      });
      setFiled(issue);
      // Straight onto the list under the form, so a second filing in the same
      // sitting can already see the first one.
      setBoard((prev) => (prev ? { ...prev, open: [issue, ...prev.open] } : prev));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const another = () => {
    setFiled(null);
    setTitle("");
    setBody("");
    setLabels([]);
  };

  const configured = board?.configured === true;
  const canFile = configured && !busy && title.trim().length > 0;

  const footer = filed ? (
    <div className="btn-row">
      <button className="btn" onClick={another}>
        File another
      </button>
      <button className="btn btn--ghost" onClick={onClose}>
        Done
      </button>
    </div>
  ) : (
    <div className="btn-row">
      <button className="btn btn--red" disabled={!canFile} onClick={() => void file()}>
        {busy ? "Filing…" : "File it"}
      </button>
      <button className="btn btn--ghost" onClick={onClose}>
        Cancel
      </button>
    </div>
  );

  return (
    <Modal label="File an issue" onClose={onClose} footer={footer}>
      <h3 className="issue-composer__title">File an issue</h3>

      {board && (
        <p className="dash-note" style={{ marginTop: 0 }}>
          {configured ? (
            <>
              Goes straight to <strong>{board.repo}</strong> on GitHub.
            </>
          ) : (
            <>Not configured on this deployment.</>
          )}
        </p>
      )}

      {error && <p className="form-error">{error}</p>}

      {!board && !error && <p className="dash-note">Checking with GitHub…</p>}

      {board && !configured && (
        <div className="panel panel--warn" style={{ marginBottom: 0 }}>
          <p className="dash-note" style={{ marginTop: 0 }}>
            No <code>GITHUB_TOKEN</code> is set, so nothing can be filed from here. Set a fine-grained personal
            access token with <strong>Issues: Read and write</strong> on{" "}
            <strong>{board.repo || "the repo named in wrangler.jsonc"}</strong>:
          </p>
          <p className="dash-note">
            <code>npx wrangler secret put GITHUB_TOKEN</code> for production, or a line in <code>.dev.vars</code>{" "}
            locally.
          </p>
        </div>
      )}

      {filed && (
        <p className="form-ok">
          Filed as{" "}
          <a href={filed.url} target="_blank" rel="noreferrer">
            #{filed.number}
          </a>{" "}
          — {filed.title}
        </p>
      )}

      {configured && !filed && (
        <>
          <div className="field">
            <label htmlFor="issue-title">Title</label>
            <input
              id="issue-title"
              value={title}
              maxLength={ISSUE_LIMITS.title}
              placeholder="What's wrong, in one line"
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="issue-body">Details</label>
            <textarea
              id="issue-body"
              rows={7}
              value={body}
              maxLength={ISSUE_LIMITS.body}
              placeholder="What you expected, what happened, how to get back to it. Markdown works."
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="field-hint">Optional — a title plus the context below is already a real issue.</p>
          </div>

          {board.labels.length > 0 && (
            <div className="field">
              <label id="issue-labels-label">Labels</label>
              <div className="facet__chips" role="group" aria-labelledby="issue-labels-label">
                {board.labels.map((l) => {
                  const on = labels.includes(l.name);
                  return (
                    <button
                      key={l.name}
                      type="button"
                      className={`chip-btn${on ? " chip-btn--on" : ""}`}
                      aria-pressed={on}
                      onClick={() => toggleLabel(l.name)}
                    >
                      {/* The tick is the non-colour channel for "selected"; the
                          dot is GitHub's own label colour and says nothing on
                          its own, so it's hidden from the reading order. */}
                      <span className="chip-btn__mark">{on ? "✓" : ""}</span>
                      <span className="issue-dot" style={{ background: `#${l.color}` }} aria-hidden="true" />
                      {l.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="field">
            <label className="issue-context__toggle">
              <input
                type="checkbox"
                checked={attachContext}
                onChange={(e) => setAttachContext(e.target.checked)}
              />
              Attach where I was
            </label>
            {attachContext && (
              <ul className="issue-context">
                <li>
                  View <code>{context.view}</code>
                </li>
                <li>
                  URL <code>{context.url}</code>
                </li>
                {context.dishId !== undefined && <li>Dish #{context.dishId}</li>}
                <li>Viewport {context.viewport}</li>
                <li className="issue-context__ua">{context.userAgent}</li>
              </ul>
            )}
          </div>
        </>
      )}

      {configured && (
        <div className="issue-open">
          <p className="dash-subhead">
            Already open ({board.open.length})
            {board.open.length > 0 && " — check before you file"}
          </p>
          {board.open.length === 0 ? (
            <p className="dash-note">Nothing open. Clean kitchen.</p>
          ) : (
            <ul className="issue-list">
              {board.open.map((i) => (
                <li key={i.number} className="issue-list__row">
                  <a href={i.url} target="_blank" rel="noreferrer">
                    #{i.number}
                  </a>{" "}
                  {i.title}
                  {i.labels.map((l) => (
                    <span key={l.name} className="badge badge--off issue-list__label">
                      {l.name}
                    </span>
                  ))}
                  <span className="issue-list__when">{i.createdAt.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

/**
 * What the composer should say about where you were standing. Read at the
 * moment the button is pressed, not on every render — the point is the screen
 * you were looking at when something looked wrong.
 */
export function currentIssueContext(view: string, dishId?: number | null): IssueContext {
  const context: IssueContext = {
    view,
    // Path plus query: the dashboard mirrors its tab in `?tab=`, so this is how
    // "the Trends tab was open" reaches the issue without plumbing state up.
    url: `${location.pathname}${location.search}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    userAgent: navigator.userAgent,
  };
  if (typeof dishId === "number") context.dishId = dishId;
  return context;
}
