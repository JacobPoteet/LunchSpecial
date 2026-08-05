import { useEffect, useMemo, useState } from "react";
import type { AdminDishRow } from "../../shared/types";
import { COURSES } from "../../shared/types";
import * as api from "./api";

export default function DishList({ onOpenDish }: { onOpenDish: (id: number | null) => void }) {
  const [rows, setRows] = useState<AdminDishRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState("");
  const [country, setCountry] = useState("");
  // "" = any. Backfilling the fan tag across an existing catalogue is much
  // easier when you can see what's already been marked.
  const [source, setSource] = useState<"" | "fan" | "kitchen">("");

  useEffect(() => {
    api.getDishes().then(setRows, (e: Error) => setError(e.message));
  }, []);

  const countries = useMemo(() => [...new Set((rows ?? []).map((r) => r.country))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        (!q || r.name.toLowerCase().includes(q)) &&
        (!course || r.course === course) &&
        (!country || r.country === country) &&
        (!source || (source === "fan") === r.isFanSubmission),
    );
  }, [rows, query, course, country, source]);

  if (error) return <p className="form-error">{error}</p>;
  if (!rows) return <p style={{ color: "var(--cream)" }}>Reading the recipe box…</p>;

  return (
    <section className="panel">
      <div className="btn-row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Dishes ({filtered.length})</h2>
        <button className="btn btn--red" onClick={() => onOpenDish(null)}>
          + New dish
        </button>
      </div>
      <div className="filter-row">
        <input placeholder="Search dishes…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={course} onChange={(e) => setCourse(e.target.value)}>
          <option value="">All courses</option>
          {COURSES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value as "" | "fan" | "kitchen")}>
          <option value="">Any source</option>
          <option value="fan">Fan submissions</option>
          <option value="kitchen">Kitchen picks</option>
        </select>
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Dish</th>
            <th>Country</th>
            <th>Course</th>
            <th>Ingredients</th>
            <th>Clues</th>
            <th>Last served</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id} onClick={() => onOpenDish(r.id)}>
              <td data-label="Dish">
                <strong>{r.name}</strong>
                {r.isFanSubmission && (
                  <span className="badge badge--fan" title="Came in through a player request">
                    ★ fan
                  </span>
                )}
              </td>
              <td data-label="Country">{r.country}</td>
              <td data-label="Course">{r.course}</td>
              <td data-label="Ingredients">{r.ingredients.length}</td>
              <td data-label="Clues">{r.clueCount}/5</td>
              <td data-label="Last served">{r.lastServed ?? "never"}</td>
              <td data-label="Status">
                {!r.isActive ? (
                  <span className="badge badge--off">inactive</span>
                ) : r.schedulable ? (
                  <span className="badge">ready</span>
                ) : (
                  <span className="badge badge--warn">incomplete</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
