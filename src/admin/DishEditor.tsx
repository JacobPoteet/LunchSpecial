import { useEffect, useMemo, useRef, useState } from "react";
import type { AdminDishInput, GuessFeedback } from "../../shared/types";
import { COURSES, PROTEINS, REGIONS, TEMPERATURES } from "../../shared/types";
import { ClueTicket, GuessRow } from "../game/components";
import * as api from "./api";

const CLUE_HINTS = [
  "Shown after 1st miss — broad hint (region, category)",
  "Shown after 2nd miss — origin or history",
  "Shown after 3rd miss — famous moment / pop culture",
  "Shown after 4th miss — key ingredient or technique",
  "Shown after 5th miss — near-giveaway",
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

export default function DishEditor({ dishId, onDone }: { dishId: number | null; onDone: () => void }) {
  const [form, setForm] = useState<AdminDishInput>(emptyForm);
  const [vocabulary, setVocabulary] = useState<string[]>([]);
  const [loading, setLoading] = useState(dishId !== null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
      const payload = { ...form, clues: filledClues };
      const res = savedId === null ? await api.createDish(payload) : await api.updateDish(savedId, payload);
      setSavedId(res.id);
      setOkMsg("Saved. Order's in the window!");
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
    if (!window.confirm(`Delete "${form.name}" from the recipe box? This can't be undone.`)) return;
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

          {form.clues.map((clue, i) => (
            <div className="field" key={i}>
              <label>
                Clue {i + 1} — {CLUE_HINTS[i]}
              </label>
              <textarea
                value={clue}
                onChange={(e) => set("clues", form.clues.map((c, j) => (j === i ? e.target.value : c)))}
              />
            </div>
          ))}

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
              <button className="btn btn--ghost" disabled={busy} onClick={() => void remove()}>
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
    </section>
  );
}
