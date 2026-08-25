import { useEffect, useMemo, useRef, useState } from "react";
import type { AdminDishInput, GuessFeedback } from "../../shared/types";
import { COURSES, PROTEINS, REGIONS, TEMPERATURES } from "../../shared/types";
import { ClueTicket, GuessRow, Modal } from "../game/components";
import * as api from "./api";

// The five beats, and the only guidance anyone writing a clue in /admin ever
// sees. The full beat sheet is CLUES.md; these are its headlines plus the
// character budget, because a budget nobody can see is a budget nobody keeps —
// clue sets inflated 2.5x across 26 batches while this array said "broad hint".
// [beat name, what it must do, target lo, target hi, hard max]
const CLUE_BEATS: [string, string, number, number, number][] = [
  ["Broad geography", "The region. Never the country.", 35, 70, 85],
  ["Origin and history", "Who made it, when, why.", 60, 110, 130],
  ["What makes it unmistakable", "True of this dish and almost no other.", 55, 105, 120],
  ["A key ingredient or technique", "You or the cook doing the cooking.", 60, 120, 130],
  ["Near-giveaway", "The country, and what it looks like.", 45, 100, 115],
];

const emptyForm: AdminDishInput = {
  name: "",
  country: "",
  region: "europe",
  course: "entree",
  temperature: "hot",
  protein: "vegetarian",
  ingredients: [],
  isActive: true,
  isFanSubmission: false,
  clues: ["", "", "", "", ""],
};

function TagInput({
  value,
  vocabulary,
  onChange,
}: {
  value: string[];
  vocabulary: string[];
  onChange: (next: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    return vocabulary.filter((v) => v.includes(q) && !value.includes(v)).slice(0, 6);
  }, [text, vocabulary, value]);

  const cleaned = text.trim().toLowerCase();
  const isNew = cleaned.length > 0 && !vocabulary.includes(cleaned) && !value.includes(cleaned);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const add = (ing: string) => {
    if (!ing || value.includes(ing)) return;
    if (!vocabulary.includes(ing) && !window.confirm(`"${ing}" is a brand-new ingredient. Add it to the pantry?`)) {
      return;
    }
    onChange([...value, ing]);
    setText("");
  };

  return (
    <div className="tag-suggest" ref={rootRef}>
      <div className="tags">
        {value.map((ing) => (
          <span key={ing} className="tag">
            {ing}
            <button type="button" aria-label={`Remove ${ing}`} onClick={() => onChange(value.filter((v) => v !== ing))}>
              ×
            </button>
          </span>
        ))}
        <input
          value={text}
          placeholder={value.length === 0 ? "Type an ingredient…" : "Add another…"}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(suggestions[0] && !isNew ? suggestions[0] : cleaned);
            } else if (e.key === "Backspace" && !text && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
        />
      </div>
      {open && cleaned && (suggestions.length > 0 || isNew) && (
        <ul className="tag-suggest__list">
          {suggestions.map((s) => (
            <li key={s} onClick={() => add(s)}>
              {s}
            </li>
          ))}
          {isNew && (
            <li className="tag-suggest__new" onClick={() => add(cleaned)}>
              + add new ingredient "{cleaned}"
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export default function DishEditor({
  dishId,
  prefill,
  requestId,
  onRequestConsumed,
  onDone,
}: {
  dishId: number | null;
  /** Seed a new dish (name/country) from a player request. */
  prefill?: { name: string; country: string };
  /** The request this dish came from — removed from the inbox on first save. */
  requestId?: number;
  onRequestConsumed?: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState<AdminDishInput>(() =>
    // A prefilled new dish came from the request inbox, so it *is* a fan
    // submission — pre-tick it rather than making the reviewer remember.
    dishId === null && prefill
      ? { ...emptyForm, name: prefill.name, country: prefill.country, isFanSubmission: true }
      : emptyForm,
  );
  const [vocabulary, setVocabulary] = useState<string[]>([]);
  const [loading, setLoading] = useState(dishId !== null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(dishId);

  useEffect(() => {
    api.getIngredients().then(setVocabulary, () => {});
    if (dishId !== null) {
      api.getDish(dishId).then(
        (d) => {
          setForm({
            name: d.name,
            country: d.country,
            region: d.region,
            course: d.course,
            temperature: d.temperature,
            protein: d.protein,
            ingredients: d.ingredients,
            isActive: d.isActive,
            isFanSubmission: d.isFanSubmission,
            clues: [...d.clues, "", "", "", "", ""].slice(0, 5),
          });
          setLoading(false);
        },
        (e: Error) => {
          setError(e.message);
          setLoading(false);
        },
      );
    }
  }, [dishId]);

  const set = <K extends keyof AdminDishInput>(key: K, value: AdminDishInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setOkMsg(null);
  };

  const filledClues = form.clues.filter((c) => c.trim());
  const schedulable = form.ingredients.length >= 3 && filledClues.length === 5;

  const save = async (): Promise<number | null> => {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const wasCreate = savedId === null;
      const payload = { ...form, clues: filledClues };
      const res = wasCreate ? await api.createDish(payload) : await api.updateDish(savedId, payload);
      setSavedId(res.id);
      setOkMsg("Saved. Order's in the window!");
      // First save of a dish created from a player request — clear it from the inbox.
      if (wasCreate && requestId != null) {
        api.deleteRequest(requestId).then(() => onRequestConsumed?.(), () => {});
      }
      return res.id;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const testPlay = async () => {
    const id = await save();
    if (id === null) return;
    try {
      const { url } = await api.createPreview(id);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async () => {
    if (savedId === null) return;
    setConfirmingDelete(false);
    setBusy(true);
    try {
      await api.deleteDish(savedId);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  // The live preview shows the dish exactly as players see it: a fully
  // matching guess row plus its clue tickets.
  const previewFeedback: GuessFeedback = {
    correct: true,
    dish: { id: 0, name: form.name || "New Dish" },
    matchedIngredients: form.ingredients,
    unmatchedIngredients: [],
    attributes: {
      country: { value: form.country || "—", match: "hit" },
      course: { value: form.course, match: "hit" },
      temperature: { value: form.temperature, match: "hit" },
      protein: { value: form.protein, match: "hit" },
    },
  };

  if (loading) return <p style={{ color: "var(--cream)" }}>Pulling the recipe card…</p>;

  return (
    <section className="panel">
      <div className="btn-row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{savedId === null ? "New dish" : `Edit: ${form.name}`}</h2>
        <button className="btn btn--ghost" onClick={onDone}>
          ← Back to dishes
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}
      {okMsg && <p className="form-ok">{okMsg}</p>}

      <div className="editor-grid">
        <div>
          <div className="field">
            <label>Dish name</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Spaghetti Carbonara" />
          </div>
          <div className="attr-row">
            <div className="field">
              <label>Country</label>
              <input value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="e.g. Italy" />
            </div>
            <div className="field">
              <label>Region (for yellow "close" matches)</label>
              <select value={form.region} onChange={(e) => set("region", e.target.value as AdminDishInput["region"])}>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="attr-row">
            <div className="field">
              <label>Course</label>
              <select value={form.course} onChange={(e) => set("course", e.target.value as AdminDishInput["course"])}>
                {COURSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Served</label>
              <select
                value={form.temperature}
                onChange={(e) => set("temperature", e.target.value as AdminDishInput["temperature"])}
              >
                {TEMPERATURES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Protein</label>
              <select value={form.protein} onChange={(e) => set("protein", e.target.value as AdminDishInput["protein"])}>
                {PROTEINS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Ingredients ({form.ingredients.length} — need at least 3)</label>
            <TagInput value={form.ingredients} vocabulary={vocabulary} onChange={(v) => set("ingredients", v)} />
            <p className="field-hint">
              Stick to the pantry's canonical names ("tomato", not "tomatoes") so matches line up across dishes.
            </p>
          </div>

          {form.clues.map((clue, i) => {
            const [beat, job, lo, hi, max] = CLUE_BEATS[i];
            const len = clue.trim().length;
            // Three states, not two: empty says nothing, inside the target is
            // quiet, outside it warns, past the ceiling is an error. The count
            // only judges a clue somebody has started writing.
            const state = len === 0 ? "" : len > max ? " clue-count--over" : len < lo || len > hi ? " clue-count--warn" : "";
            return (
              <div className="field" key={i}>
                <label>
                  Beat {i + 1} — {beat}
                </label>
                <p className="field-hint">
                  Shown after miss {i + 1}. {job}
                </p>
                <textarea
                  value={clue}
                  onChange={(e) => set("clues", form.clues.map((c, j) => (j === i ? e.target.value : c)))}
                />
                <p className={`clue-count${state}`}>
                  {len} / {lo}–{hi} chars{len > max ? ` — over the ${max} ceiling` : ""}
                </p>
              </div>
            );
          })}

          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
                style={{ width: "auto", marginRight: 8 }}
              />
              On the menu (guessable by players)
            </label>
          </div>

          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={form.isFanSubmission}
                onChange={(e) => set("isFanSubmission", e.target.checked)}
                style={{ width: "auto", marginRight: 8 }}
              />
              Fan submission (a player asked for this one)
            </label>
            <p className="field-hint">
              Stamps the check with a credit whenever this dish is the Special, and promotes the "Suggest a dish"
              button underneath it. Changes nothing about scheduling or the game itself.
            </p>
          </div>

          {!schedulable && (
            <p className="field-hint">
              ⚠ Needs {form.ingredients.length < 3 ? "at least 3 ingredients" : ""}
              {form.ingredients.length < 3 && filledClues.length !== 5 ? " and " : ""}
              {filledClues.length !== 5 ? `all 5 clues (${filledClues.length}/5)` : ""} before it can be scheduled as a
              Special.
            </p>
          )}

          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn btn--red" disabled={busy || !form.name.trim()} onClick={() => void save()}>
              {busy ? "Saving…" : "Save dish"}
            </button>
            <button className="btn" disabled={busy || !form.name.trim()} onClick={() => void testPlay()}>
              Save + test play ▶
            </button>
            {savedId !== null && (
              <button className="btn btn--ghost" disabled={busy} onClick={() => setConfirmingDelete(true)}>
                Delete
              </button>
            )}
          </div>
        </div>

        <div className="preview-pane">
          <h3>Player preview</h3>
          <GuessRow guess={previewFeedback} ingredientCount={form.ingredients.length} />
          <div className="tickets" style={{ marginTop: 12 }}>
            {filledClues.map((text, i) => (
              <ClueTicket key={i} index={i + 1} text={text} />
            ))}
          </div>
        </div>
      </div>

      {confirmingDelete && (
        <Modal onClose={() => setConfirmingDelete(false)}>
          <h3 style={{ marginTop: 0 }}>Delete this dish?</h3>
          <p>
            Delete <strong>{form.name || "this dish"}</strong> from the recipe box? This also removes its clues and
            can't be undone.
          </p>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn btn--red" disabled={busy} onClick={() => void remove()}>
              {busy ? "Deleting…" : "Delete dish"}
            </button>
            <button className="btn btn--ghost" disabled={busy} onClick={() => setConfirmingDelete(false)}>
              Keep it
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
