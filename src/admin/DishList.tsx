import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminDishRow } from "../../shared/types";
import {
  countActiveFilters,
  DISH_FACETS,
  DISH_SORTS,
  EMPTY_DISH_FILTER,
  FACET_VALUES,
  facetCounts,
  normalizeFilter,
  REST_PRESETS,
  restDays,
  selectDishes,
  toggleFacet,
  type DishFacet,
  type DishFilter,
  type DishSort,
} from "../../shared/dishfilter";
import { gameToday } from "../../shared/time";
import * as api from "./api";

/**
 * The dish list, which is really a shortlist builder. The job it exists for
 * spans two screens: the dashboard's Menu tab says which regions and courses are
 * under-served, and this is where that turns into "show me the East Asian
 * desserts nobody has ordered yet" — which is why the Menu tab's bars link
 * straight in here with a filter attached (see MenuMixPanel).
 *
 * All the logic is the pure fold in shared/dishfilter.ts; this file is chips and
 * a table. Three presentation decisions worth keeping:
 *
 * 1. **Chips, not dropdowns.** A `<select>` holds one value and hides the other
 *    eight, so the old three-dropdown bar could never express "either of these
 *    two regions" and never showed how much of the catalogue was one click away.
 *    Every chip carries the count it would yield, so a dead end is visible
 *    before you hit it rather than after.
 * 2. **Country is the one exception, and it has to be.** It's open-ended (a
 *    hundred-odd values), so it takes a type-ahead that *adds* chips — the
 *    multi-select the others get, without a hundred-chip wall. Region covers the
 *    coarse version of the same question.
 * 3. **The filter survives opening a dish.** DishList unmounts while the editor
 *    is up, so the filter is parked in sessionStorage — losing a shortlist to
 *    a glance at one of its rows is the single most annoying thing this screen
 *    could do. sessionStorage, not local: a filter is a train of thought, not a
 *    setting.
 */

const STORE_KEY = "lunch-special:admin-dish-filter";

/** "north-america" → "North America"; single-word enums pass through capitalised. */
const titleCase = (v: string) =>
  v
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const FACET_LABELS: Record<DishFacet, string> = {
  statuses: "On the menu",
  regions: "Region",
  courses: "Course",
  proteins: "Protein",
  temperatures: "Served",
  sources: "Source",
  readiness: "Ready",
  countries: "Country",
};

/** Enum values whose bare name doesn't say what filtering on it means. */
const VALUE_LABELS: Record<string, string> = {
  never: "Never scheduled",
  served: "Served before",
  booked: "Booked ahead",
  ready: "Ready to book",
  incomplete: "Incomplete",
  inactive: "Inactive",
  fan: "★ Fan submission",
  kitchen: "Kitchen pick",
};

const valueLabel = (v: string) => VALUE_LABELS[v] ?? titleCase(v);

const SORT_LABELS: Record<DishSort, string> = {
  name: "Name A–Z",
  rested: "Longest since served",
  recent: "Most recently served",
  served: "Most served",
  added: "Recently added",
};

/** Read a parked filter, coerced — a stale blob from an older shape can't poison the list. */
function storedFilter(): DishFilter {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    return raw ? normalizeFilter(JSON.parse(raw)) : EMPTY_DISH_FILTER;
  } catch {
    return EMPTY_DISH_FILTER;
  }
}

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number | null;
  active: boolean;
  onClick: () => void;
}) {
  const empty = count === 0 && !active;
  return (
    <button
      type="button"
      className={`chip-btn${active ? " chip-btn--on" : ""}${empty ? " chip-btn--empty" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {/* Selection reads as a glyph and aria-pressed, not only as a fill. */}
      <span className="chip-btn__mark" aria-hidden="true">
        {active ? "✓" : ""}
      </span>
      {label}
      {count !== null && <span className="chip-btn__n">{count}</span>}
    </button>
  );
}

export default function DishList({
  onOpenDish,
  incomingFilter,
}: {
  onOpenDish: (id: number | null) => void;
  /** A filter handed in by a link (the Menu tab). A new object replaces what's on screen. */
  incomingFilter?: Partial<DishFilter> | null;
}) {
  const [rows, setRows] = useState<AdminDishRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DishFilter>(() =>
    incomingFilter ? normalizeFilter({ ...EMPTY_DISH_FILTER, ...incomingFilter }) : storedFilter(),
  );
  const [countryDraft, setCountryDraft] = useState("");

  const today = gameToday();

  useEffect(() => {
    api.getDishes().then(setRows, (e: Error) => setError(e.message));
  }, []);

  // A fresh object each time the Menu tab links in, so arriving twice with the
  // same filter still resets one you've since edited.
  useEffect(() => {
    if (incomingFilter) setFilter(normalizeFilter({ ...EMPTY_DISH_FILTER, ...incomingFilter }));
  }, [incomingFilter]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(filter));
    } catch {
      // Non-fatal — the filter just won't survive opening a dish.
    }
  }, [filter]);

  const toggle = useCallback((facet: DishFacet, value: string) => {
    setFilter((f) => toggleFacet(f, facet, value));
  }, []);

  const all = useMemo(() => rows ?? [], [rows]);
  const counts = useMemo(() => facetCounts(all, filter, today), [all, filter, today]);
  const shown = useMemo(() => selectDishes(all, filter, today), [all, filter, today]);
  const countries = useMemo(() => Object.keys(counts.countries).sort(), [counts]);

  const activeCount = countActiveFilters(filter);

  const addCountry = (name: string) => {
    const match = countries.find((c) => c.toLowerCase() === name.trim().toLowerCase());
    if (!match || filter.countries.includes(match)) return;
    toggle("countries", match);
    setCountryDraft("");
  };

  if (error) return <p className="form-error">{error}</p>;
  if (!rows) return <p style={{ color: "var(--cream)" }}>Reading the recipe box…</p>;

  return (
    <section className="panel">
      <div className="btn-row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>
          Dishes ({shown.length}
          {shown.length === all.length ? "" : ` of ${all.length}`})
        </h2>
        <button className="btn btn--red" onClick={() => onOpenDish(null)}>
          + New dish
        </button>
      </div>

      <div className="dish-filters">
        <div className="filter-row">
          <input
            placeholder="Search name, country or ingredient…"
            value={filter.query}
            onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
          />
          <label className="sort-picker">
            <span>Sort</span>
            <select
              value={filter.sort}
              onChange={(e) => setFilter((f) => ({ ...f, sort: e.target.value as DishSort }))}
            >
              {DISH_SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn btn--small"
            disabled={activeCount === 0}
            onClick={() => setFilter((f) => ({ ...EMPTY_DISH_FILTER, sort: f.sort }))}
          >
            Clear filters{activeCount ? ` (${activeCount})` : ""}
          </button>
        </div>

        <div className="facet-grid">
          {DISH_FACETS.filter((f) => f !== "countries").map((facet) => (
            <div key={facet} className="facet" role="group" aria-label={FACET_LABELS[facet]}>
              <span className="facet__label">{FACET_LABELS[facet]}</span>
              <div className="facet__chips">
                {FACET_VALUES[facet as Exclude<DishFacet, "countries">].map((v) => (
                  <Chip
                    key={v}
                    label={valueLabel(v)}
                    count={counts[facet][v] ?? 0}
                    active={(filter[facet] as string[]).includes(v)}
                    onClick={() => toggle(facet, v)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Open-ended, so a type-ahead that adds chips rather than a chip wall. */}
          <div className="facet" role="group" aria-label="Country">
            <span className="facet__label">Country</span>
            <div className="facet__chips">
              {filter.countries.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  count={counts.countries[c] ?? 0}
                  active
                  onClick={() => toggle("countries", c)}
                />
              ))}
              <input
                className="country-picker"
                list="dish-countries"
                placeholder="Add a country…"
                value={countryDraft}
                onChange={(e) => {
                  setCountryDraft(e.target.value);
                  // Picking from the datalist fires change with the full value.
                  if (countries.some((c) => c === e.target.value)) addCountry(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCountry(countryDraft);
                  }
                }}
              />
              <datalist id="dish-countries">
                {countries
                  .filter((c) => !filter.countries.includes(c))
                  .map((c) => (
                    <option key={c} value={c}>
                      {counts.countries[c]} dish{counts.countries[c] === 1 ? "" : "es"}
                    </option>
                  ))}
              </datalist>
            </div>
          </div>

          <div className="facet" role="group" aria-label="Rested at least">
            <span className="facet__label">Rested at least</span>
            <div className="facet__chips">
              <Chip
                label="Any"
                count={null}
                active={filter.restedDays === null}
                onClick={() => setFilter((f) => ({ ...f, restedDays: null }))}
              />
              {REST_PRESETS.map((d) => (
                <Chip
                  key={d}
                  label={`${d}+ days`}
                  count={null}
                  active={filter.restedDays === d}
                  onClick={() => setFilter((f) => ({ ...f, restedDays: f.restedDays === d ? null : d }))}
                />
              ))}
            </div>
          </div>
        </div>

        <p className="dash-note" role="status" aria-live="polite">
          {shown.length} of {all.length} dishes
          {activeCount > 0 && " match"} · sorted by {SORT_LABELS[filter.sort].toLowerCase()}. Numbers on a
          chip are what clicking it would leave you with. "Never scheduled" is the free list — nothing
          served, nothing booked ahead.
        </p>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Dish</th>
            <th>Country</th>
            <th>Course</th>
            <th>Protein</th>
            <th>Recipe</th>
            <th>Last served</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const rest = restDays(r, today);
            return (
              <tr key={r.id} onClick={() => onOpenDish(r.id)}>
                <td data-label="Dish">
                  <strong>{r.name}</strong>
                  {r.isFanSubmission && (
                    <span className="badge badge--fan" title="Came in through a player request">
                      ★ fan
                    </span>
                  )}
                </td>
                <td data-label="Country">
                  {r.country}
                  <span className="cell-sub">{titleCase(r.region)}</span>
                </td>
                <td data-label="Course">
                  {r.course}
                  <span className="cell-sub">{r.temperature}</span>
                </td>
                <td data-label="Protein">{r.protein}</td>
                <td data-label="Recipe">
                  <span className={r.clueCount === 5 ? "" : "cell-warn"}>{r.clueCount}/5 clues</span>
                  <span className={`cell-sub${r.ingredients.length >= 3 ? "" : " cell-warn"}`}>
                    {r.ingredients.length} ingredient{r.ingredients.length === 1 ? "" : "s"}
                  </span>
                </td>
                <td data-label="Last served">
                  {r.lastServed ? (
                    <>
                      {r.lastServed}
                      <span className="cell-sub">
                        {rest} day{rest === 1 ? "" : "s"} ago
                        {r.timesServed > 1 && ` · ${r.timesServed}×`}
                      </span>
                    </>
                  ) : (
                    <span className="cell-sub">never</span>
                  )}
                </td>
                <td data-label="Status">
                  {!r.isActive ? (
                    <span className="badge badge--off">inactive</span>
                  ) : r.schedulable ? (
                    <span className="badge">ready</span>
                  ) : (
                    <span className="badge badge--warn">incomplete</span>
                  )}
                  {/* A booking is the thing that makes an otherwise-free dish unavailable. */}
                  {r.nextBooked && (
                    <span className="badge badge--booked" title={`Booked for ${r.nextBooked}`}>
                      booked {r.nextBooked.slice(5)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
          {shown.length === 0 && (
            <tr>
              <td colSpan={7} className="dash-note" style={{ textAlign: "center", padding: "18px 0" }}>
                Nothing on the menu matches that.{" "}
                <button className="link-btn" onClick={() => setFilter((f) => ({ ...EMPTY_DISH_FILTER, sort: f.sort }))}>
                  Clear the filters
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
