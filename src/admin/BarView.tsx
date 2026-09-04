// The back bar: the drink catalogue, the drink editor, and the nightly board.
//
// One file for all three because they are one job — you open the bar to decide
// what is being poured — and because the pieces are small: the bar holds
// dozens of drinks where the kitchen holds hundreds, so the list needs a search
// box rather than the dish list's eight-facet chip wall.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminDrinkInput, AdminDrinkRow, NightEntry, Profile, Region, Spirit } from "../../shared/types";
import {
  DRINK_CLUE_COUNT,
  PROFILES,
  REGIONS,
  SPIRITS,
  TEMPERATURES,
} from "../../shared/types";
import { COASTER_BEATS } from "../../shared/clues";
import { addDays, gameToday } from "../../shared/time";
import * as api from "./api";
import { shortDate } from "./analyticsUi";

type BarPage = { view: "list" } | { view: "editor"; id: number | null } | { view: "board" };

/** Open a preview in a new tab. The one way past the clock in production. */
function openPour(url: string) {
  window.open(url, "_blank", "noopener");
}

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

function DrinkList({ onOpen, onBoard }: { onOpen: (id: number | null) => void; onBoard: () => void }) {
  const [rows, setRows] = useState<AdminDrinkRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [spirit, setSpirit] = useState<Spirit | "">("");
  const [only, setOnly] = useState<"" | "unpourable" | "never" | "sober">("");

  const load = useCallback(() => {
    api.getDrinks().then(setRows, (e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const shown = useMemo(() => {
    if (!rows) return [];
    const needle = q.trim().toLowerCase();
    return rows.filter((d) => {
      if (needle && !d.name.toLowerCase().includes(needle) && !d.country.toLowerCase().includes(needle)) {
        return false;
      }
      if (spirit && d.spirit !== spirit) return false;
      if (only === "unpourable" && d.pourable) return false;
      // "Never poured" means never, past OR future — the same rule the shuffle
      // picks by, and the reason `nextBooked` is on the row at all.
      if (only === "never" && (d.lastPoured || d.nextBooked)) return false;
      if (only === "sober" && d.isAlcoholic) return false;
      return true;
    });
  }, [rows, q, spirit, only]);

  if (error) return <p className="form-error">{error}</p>;
  if (!rows) return <p className="dash-note">Counting the bottles…</p>;

  const boozy = rows.filter((d) => d.isAlcoholic && d.isActive).length;
  const active = rows.filter((d) => d.isActive).length;

  return (
    <section className="panel">
      <div className="btn-row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h2>The back bar</h2>
        <div className="btn-row">
          <button className="btn btn--ghost" onClick={onBoard}>
            Nightly board
          </button>
          <button className="btn btn--red" onClick={() => onOpen(null)}>
            New drink
          </button>
        </div>
      </div>

      <div className="btn-row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input
          placeholder="Search drinks or countries…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: "1 1 200px" }}
          aria-label="Search the bar"
        />
        <select value={spirit} onChange={(e) => setSpirit(e.target.value as Spirit | "")} aria-label="Base spirit">
          <option value="">Any spirit</option>
          {SPIRITS.map((s) => (
            <option key={s} value={s}>
              {s === "none" ? "no base spirit" : s}
            </option>
          ))}
        </select>
        <select value={only} onChange={(e) => setOnly(e.target.value as typeof only)} aria-label="Filter">
          <option value="">Everything</option>
          <option value="unpourable">Not pourable yet</option>
          <option value="never">Never poured</option>
          <option value="sober">Alcohol-free</option>
        </select>
      </div>

      <p className="dash-note">
        {active} on the menu, {boozy} with alcohol ({active === 0 ? 0 : Math.round((boozy / active) * 100)}%).
        Showing {shown.length}.
      </p>

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Drink</th>
              <th>Country</th>
              <th>Spirit</th>
              <th>Profile</th>
              <th>Poured</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <tr key={d.id}>
                <td>
                  <button className="link-btn" onClick={() => onOpen(d.id)}>
                    {d.name}
                  </button>
                  {d.isFanSubmission && <span className="badge"> ★ fan</span>}
                </td>
                <td>{d.country}</td>
                <td>{d.spirit === "none" ? <span className="dash-note">none</span> : d.spirit}</td>
                <td>{d.profile}</td>
                <td>{d.timesPoured}</td>
                <td>
                  {/* One line per cell, like the dish list: the coaster
                      shortfall rides inside the badge rather than taking a
                      column of its own. */}
                  {!d.isActive ? (
                    <span className="badge badge--off">off the menu</span>
                  ) : !d.pourable ? (
                    <span className="badge badge--warn">
                      {d.coasterCount}/{DRINK_CLUE_COUNT} coasters
                      {d.ingredients.length < 3 ? `, ${d.ingredients.length}/3 ingredients` : ""}
                    </span>
                  ) : !d.isAlcoholic ? (
                    <span className="badge badge--soft">alcohol-free</span>
                  ) : (
                    <span className="dash-note">ready</span>
                  )}
                </td>
                <td>
                  <button
                    className="btn btn--ghost"
                    onClick={() => api.createDrinkPreview(d.id).then((r) => openPour(r.url))}
                  >
                    Test pour
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------

const blank = (): AdminDrinkInput => ({
  name: "",
  country: "",
  region: "europe",
  spirit: "gin",
  temperature: "cold",
  profile: "strong",
  ingredients: [],
  isAlcoholic: true,
  isActive: true,
  isFanSubmission: false,
  coasters: Array.from({ length: DRINK_CLUE_COUNT }, () => ""),
});

function DrinkEditor({ id, onDone }: { id: number | null; onDone: () => void }) {
  const [form, setForm] = useState<AdminDrinkInput>(blank);
  const [vocabulary, setVocabulary] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ingredientDraft, setIngredientDraft] = useState("");

  useEffect(() => {
    api.getDrinkIngredients().then(setVocabulary, () => {});
  }, []);

  useEffect(() => {
    if (id === null) {
      setForm(blank());
      return;
    }
    api.getDrink(id).then(
      (d) =>
        setForm({
          name: d.name,
          country: d.country,
          region: d.region,
          spirit: d.spirit,
          temperature: d.temperature,
          profile: d.profile,
          ingredients: d.ingredients,
          isAlcoholic: d.isAlcoholic,
          isActive: d.isActive,
          isFanSubmission: d.isFanSubmission,
          coasters: Array.from({ length: DRINK_CLUE_COUNT }, (_, i) => d.coasters[i] ?? ""),
        }),
      (e: Error) => setError(e.message),
    );
  }, [id]);

  const set = <K extends keyof AdminDrinkInput>(key: K, value: AdminDrinkInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async (thenPour: boolean) => {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const saved = id === null ? await api.createDrink(form) : await api.updateDrink(id, form);
      setOk("Saved.");
      if (thenPour) {
        const preview = await api.createDrinkPreview(saved.id);
        openPour(preview.url);
      } else {
        onDone();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addIngredient = (raw: string) => {
    const v = raw.trim().toLowerCase();
    if (!v || form.ingredients.includes(v)) return;
    set("ingredients", [...form.ingredients, v]);
    setIngredientDraft("");
  };

  const suggestions = useMemo(() => {
    const n = ingredientDraft.trim().toLowerCase();
    if (!n) return [];
    return vocabulary.filter((v) => v.includes(n) && !form.ingredients.includes(v)).slice(0, 8);
  }, [ingredientDraft, vocabulary, form.ingredients]);

  return (
    <section className="panel">
      <div className="btn-row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h2>{id === null ? "New drink" : form.name || "Drink"}</h2>
        <button className="btn btn--ghost" onClick={onDone}>
          Back to the bar
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {ok && <p className="form-ok">{ok}</p>}

      <div className="editor-grid">
        <div>
          <div className="field">
            <label>Name</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="field">
            <label>Country</label>
            <input value={form.country} onChange={(e) => set("country", e.target.value)} />
          </div>
          <div className="attr-row">
            <div className="field">
              <label>Region</label>
              <select value={form.region} onChange={(e) => set("region", e.target.value as Region)}>
                {REGIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Base spirit</label>
              <select value={form.spirit} onChange={(e) => set("spirit", e.target.value as Spirit)}>
                {SPIRITS.map((s) => (
                  <option key={s} value={s}>
                    {s === "none" ? "none (mocktail, coffee, tea)" : s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="attr-row">
            <div className="field">
              <label>Served</label>
              <select
                value={form.temperature}
                onChange={(e) => set("temperature", e.target.value as "hot" | "cold")}
              >
                {TEMPERATURES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Profile</label>
              <select value={form.profile} onChange={(e) => set("profile", e.target.value as Profile)}>
                {PROFILES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={form.isAlcoholic}
                onChange={(e) => set("isAlcoholic", e.target.checked)}
                style={{ width: "auto", marginRight: 8 }}
              />
              Contains alcohol
            </label>
            <p className="field-hint">
              Stored, never guessed from the base spirit — a beer has no base spirit and arak has
              "other". It is not a feedback tile; it is how the Bar tab keeps the pool's mix honest.
            </p>
          </div>

          <div className="field">
            <label>Ingredients ({form.ingredients.length} — need at least 3)</label>
            <div className="tag-suggest">
              <div className="tags">
                {form.ingredients.map((ing) => (
                  <span key={ing} className="tag">
                    {ing}
                    <button
                      onClick={() => set("ingredients", form.ingredients.filter((i) => i !== ing))}
                      aria-label={`Remove ${ing}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <input
                value={ingredientDraft}
                placeholder="Add an ingredient…"
                onChange={(e) => setIngredientDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addIngredient(suggestions[0] ?? ingredientDraft);
                  }
                }}
              />
              {suggestions.length > 0 && (
                <ul className="tag-suggest__list">
                  {suggestions.map((v) => (
                    <li key={v} onClick={() => addIngredient(v)}>
                      {v}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="field-hint">
              The list is pooled with the kitchen's, because a bar and a kitchen share a pantry. Two
              spellings of one ingredient means the feedback under-reports for everything holding
              either.
            </p>
          </div>

          {form.coasters.map((text, i) => {
            const beat = COASTER_BEATS[i];
            const len = text.trim().length;
            // Same three states as the dish editor: empty says nothing, inside
            // the target is quiet, outside warns, past the ceiling is an error.
            const state =
              len === 0
                ? ""
                : len > beat.max
                  ? " clue-count--over"
                  : len < beat.lo || len > beat.hi
                    ? " clue-count--warn"
                    : "";
            return (
              <div className="field" key={i}>
                <label>
                  Coaster {i + 1} — {beat.name}
                </label>
                <p className="field-hint">
                  Slides across after miss {i + 1}. {beat.job}
                </p>
                <textarea
                  value={text}
                  onChange={(e) =>
                    set("coasters", form.coasters.map((c, j) => (j === i ? e.target.value : c)))
                  }
                />
                <p className={`clue-count${state}`}>
                  {len} / {beat.lo}–{beat.hi} chars{len > beat.max ? ` — over the ${beat.max} ceiling` : ""}
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
              On the bar (guessable by players)
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
              Suggested by a player
            </label>
          </div>

          <div className="btn-row">
            <button className="btn btn--red" disabled={busy || !form.name.trim()} onClick={() => save(false)}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button className="btn" disabled={busy || !form.name.trim()} onClick={() => save(true)}>
              Save + test pour
            </button>
            {id !== null && (
              <button
                className="btn btn--ghost"
                disabled={busy}
                onClick={async () => {
                  setError(null);
                  try {
                    await api.deleteDrink(id);
                    onDone();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The nightly board
// ---------------------------------------------------------------------------

function NightlyBoard({ onDone }: { onDone: () => void }) {
  const [entries, setEntries] = useState<NightEntry[] | null>(null);
  const [drinks, setDrinks] = useState<AdminDrinkRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busyNight, setBusyNight] = useState<string | null>(null);

  // Nights are local days; `gameToday` is ET. The lock is a day looser than the
  // dish board's for that reason — locking ET-today would lock a night that has
  // not started yet for players west of it.
  const today = gameToday();
  const firstUnlocked = addDays(today, -1);

  const load = useCallback(() => {
    Promise.all([api.getNights(), api.getDrinks()]).then(
      ([n, d]) => {
        setEntries(n);
        setDrinks(d);
      },
      (e: Error) => setError(e.message),
    );
  }, []);
  useEffect(load, [load]);

  /** Patch one night in place. Rewriting the window restacks fifty rows to change one. */
  const patch = (night: string, drinkId: number | null, drinkName: string | null) =>
    setEntries((rows) => rows?.map((r) => (r.night === night ? { ...r, drinkId, drinkName } : r)) ?? rows);

  const book = async (night: string, drinkId: number | null) => {
    const before = entries?.find((r) => r.night === night);
    const drink = drinks.find((d) => d.id === drinkId);
    setBusyNight(night);
    setError(null);
    patch(night, drinkId, drink?.name ?? null); // paints before the request goes out
    try {
      await api.setNight(night, drinkId);
    } catch (e) {
      patch(night, before?.drinkId ?? null, before?.drinkName ?? null); // and rolls back
      setError((e as Error).message);
    } finally {
      setBusyNight(null);
    }
  };

  const roll = async (night: string) => {
    setBusyNight(night);
    setError(null);
    try {
      // The shuffle can't paint first — the server picks.
      const res = await api.shuffleNight(night);
      patch(night, res.drinkId, res.drinkName);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyNight(null);
    }
  };

  if (error && !entries) return <p className="form-error">{error}</p>;
  if (!entries) return <p className="dash-note">Reading the board…</p>;

  const pourable = drinks.filter((d) => d.pourable && d.isActive);

  return (
    <section className="panel">
      <div className="btn-row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h2>Nightly board</h2>
        <div className="btn-row">
          <button
            className="btn"
            onClick={async () => {
              setNote(null);
              try {
                const r = await api.autofillNights();
                setNote(`Filled ${r.filled} ${r.filled === 1 ? "night" : "nights"}.`);
                load();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Autofill
          </button>
          <button className="btn btn--ghost" onClick={onDone}>
            Back to the bar
          </button>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      {note && <p className="form-ok">{note}</p>}

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Night</th>
              <th>Pouring</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const locked = e.night < firstUnlocked;
              const busy = busyNight === e.night;
              return (
                <tr key={e.night} aria-busy={busy} style={{ opacity: busy ? 0.55 : 1 }}>
                  <td>
                    {shortDate(e.night)}
                    {e.night === today && <span className="badge"> tonight</span>}
                  </td>
                  <td>
                    {locked ? (
                      <span className="dash-note">{e.drinkName ?? "fallback pour"}</span>
                    ) : (
                      <select
                        value={e.drinkId ?? ""}
                        onChange={(ev) => book(e.night, ev.target.value === "" ? null : Number(ev.target.value))}
                        aria-label={`Drink for ${e.night}`}
                      >
                        <option value="">— fallback pour —</option>
                        {/* A plain select is fine here where the dish board
                            needed a hand-drawn listbox: that one had hundreds
                            of dishes across forty rows, and this has dozens. */}
                        {pourable.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    <div className="btn-row">
                      {!locked && (
                        <button className="btn btn--ghost" onClick={() => roll(e.night)}>
                          🎲
                        </button>
                      )}
                      <button
                        className="btn btn--ghost"
                        onClick={() => api.createNightPreview(e.night).then((r) => openPour(r.url))}
                      >
                        Test pour
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="dash-note">
        An unbooked night runs on the deterministic fallback pour and never 404s — clearing a night is
        a booking decision, not a hole. The 🎲 rolls a drink that has never been on, past or future.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------

export default function BarView() {
  const [page, setPage] = useState<BarPage>({ view: "list" });
  if (page.view === "editor") {
    return <DrinkEditor id={page.id} onDone={() => setPage({ view: "list" })} />;
  }
  if (page.view === "board") {
    return <NightlyBoard onDone={() => setPage({ view: "list" })} />;
  }
  return (
    <DrinkList onOpen={(id) => setPage({ view: "editor", id })} onBoard={() => setPage({ view: "board" })} />
  );
}
