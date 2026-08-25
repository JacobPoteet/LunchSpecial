import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminDishRow } from "../../shared/types";
import {
  countActiveFilters,
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
 * a table. The layout rules, learned by getting them wrong first:
 *
 * 1. **One facet per full-width row, on a fixed label column.** The first cut
 *    laid the facets out in an auto-fit grid, which was the whole reason the
 *    panel looked broken: nine groups holding between two and nine chips each,
 *    in a grid whose every row is as tall as its tallest cell, so the short
 *    groups sat over holes. Rows can't do that, and they buy a hard left edge
 *    all nine labels line up on.
 * 2. **Chips are one size.** Fixed height, a reserved tick slot so selecting one
 *    doesn't reflow the row, and a right-aligned count with a minimum width so
 *    a 3 and a 128 don't make two different chips out of the same word.
 * 3. **Five facets start folded.** Status, rested, region and course are what
 *    the booking question is actually asked in; the rest are refinements. All
 *    nine on screen at once is a wall of forty buttons above the data they
 *    filter, and the toggle carries a count so a folded-away filter can never
 *    be silently on.
 * 4. **Every table cell is one line.** Mixing one- and two-line cells down a
 *    column makes even a well-aligned table look lumpy. Where a second fact
 *    matters it goes in the same line (region as its own column, the shortfall
 *    inside the "incomplete" badge) or into a title.
 * 5. **Country is the one facet that isn't chips.** It's open-ended (a
 *    hundred-odd values), so it takes a type-ahead that *adds* chips. Region is
 *    the coarse version of the same question.
 * 6. **The filter survives opening a dish.** DishList unmounts while the editor
 *    is up, so the filter is parked in sessionStorage — losing a shortlist to a
 *    glance at one of its rows is the single most annoying thing this screen
 *    could do. sessionStorage, not local: a filter is a train of thought, not a
 *    setting.
 */

const STORE_KEY = "lunch-special:admin-dish-filter";

/** The facets the booking question gets asked in. The rest fold away. */
const PRIMARY_FACETS: DishFacet[] = ["statuses", "regions", "courses"];
const SECONDARY_FACETS: DishFacet[] = ["proteins", "temperatures", "sources", "readiness"];

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
  fan: "Fan submission",
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

/** How many of the folded-away facets are switched on, so the toggle can say so. */
const hiddenActive = (f: DishFilter) =>
  [...SECONDARY_FACETS, "countries" as DishFacet].filter((k) => (f[k] as string[]).length > 0).length;

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
      {/* Selection reads as a glyph and aria-pressed, not only as a fill. The
          slot holds its width when empty so a row doesn't reflow on click. */}
      <span className="chip-btn__mark" aria-hidden="true">
        {active ? "✓" : ""}
      </span>
      <span className="chip-btn__label">{label}</span>
      {count !== null && <span className="chip-btn__n">{count}</span>}
    </button>
  );
}

/** One labelled row of controls. The label column is what every row lines up on. */
function FacetRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="facet" role="group" aria-label={label}>
      <span className="facet__label">{label}</span>
      <div className="facet__chips">{children}</div>
    </div>
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
  // Folded by default, but never folded over something switched on.
  const [showMore, setShowMore] = useState(() => hiddenActive(filter) > 0);
  const [countryDraft, setCountryDraft] = useState("");

  const today = gameToday();

  useEffect(() => {
    api.getDishes().then(setRows, (e: Error) => setError(e.message));
  }, []);

  // A fresh object each time the Menu tab links in, so arriving twice with the
  // same filter still resets one you've since edited.
  useEffect(() => {
    if (!incomingFilter) return;
    const next = normalizeFilter({ ...EMPTY_DISH_FILTER, ...incomingFilter });
    setFilter(next);
    if (hiddenActive(next) > 0) setShowMore(true);
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
  const folded = hiddenActive(filter);

  const clear = () => setFilter((f) => ({ ...EMPTY_DISH_FILTER, sort: f.sort }));

  const addCountry = (name: string) => {
    const match = countries.find((c) => c.toLowerCase() === name.trim().toLowerCase());
    if (!match || filter.countries.includes(match)) return;
    toggle("countries", match);
    setCountryDraft("");
  };

  const chipsFor = (facet: DishFacet) =>
    FACET_VALUES[facet as Exclude<DishFacet, "countries">].map((v) => (
      <Chip
        key={v}
        label={valueLabel(v)}
        count={counts[facet][v] ?? 0}
        active={(filter[facet] as string[]).includes(v)}
        onClick={() => toggle(facet, v)}
      />
    ));

  if (error) return <p className="form-error">{error}</p>;
  if (!rows) return <p style={{ color: "var(--cream)" }}>Reading the recipe box…</p>;

  return (
    <section className="panel">
      <div className="btn-row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Dishes</h2>
        <button className="btn btn--red" onClick={() => onOpenDish(null)}>
          + New dish
        </button>
      </div>

      <div className="dish-filters">
        {/* Grid, not flex: the search box grows and the two controls to its
            right stay put, instead of sliding as the window changes. */}
        <div className="dish-filters__bar">
          <input
            className="dish-filters__search"
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
          <button className="btn btn--small" disabled={activeCount === 0} onClick={clear}>
            Clear{activeCount ? ` (${activeCount})` : ""}
          </button>
        </div>

        <FacetRow label={FACET_LABELS.statuses}>{chipsFor("statuses")}</FacetRow>

        <FacetRow label="Rested">
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
        </FacetRow>

        {PRIMARY_FACETS.filter((f) => f !== "statuses").map((facet) => (
          <FacetRow key={facet} label={FACET_LABELS[facet]}>
            {chipsFor(facet)}
          </FacetRow>
        ))}

        {showMore && (
          <>
            {SECONDARY_FACETS.map((facet) => (
              <FacetRow key={facet} label={FACET_LABELS[facet]}>
                {chipsFor(facet)}
              </FacetRow>
            ))}

            {/* Open-ended, so a type-ahead that adds chips rather than a chip
                wall. The input leads so it doesn't move as chips accumulate. */}
            <FacetRow label={FACET_LABELS.countries}>
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
              {filter.countries.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  count={counts.countries[c] ?? 0}
                  active
                  onClick={() => toggle("countries", c)}
                />
              ))}
            </FacetRow>
          </>
        )}

        {/* Sits on the chip column so the fold lines up with what it opens. */}
        <div className="facet">
          <span className="facet__label" />
          <div className="facet__chips">
            <button
              type="button"
              className="facet-more"
              aria-expanded={showMore}
              onClick={() => setShowMore((v) => !v)}
            >
              {showMore ? "− Fewer filters" : "+ More filters"}
              {!showMore && folded > 0 && <span className="chip-btn__n">{folded} on</span>}
            </button>
            <span className="facet-count" role="status" aria-live="polite">
              {shown.length} of {all.length} dishes · {SORT_LABELS[filter.sort].toLowerCase()}
            </span>
          </div>
        </div>
      </div>

      <table className="admin-table admin-table--dishes">
        <thead>
          <tr>
            <th>Dish</th>
            <th>Country</th>
            <th>Region</th>
            <th>Course</th>
            <th>Served</th>
            <th>Protein</th>
            <th>Last served</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const rest = restDays(r, today);
            // What a not-yet-schedulable dish is missing, short enough for the
            // badge and spelled out in its title.
            const short: string[] = [];
            const shortLong: string[] = [];
            if (r.clueCount !== 5) {
              short.push(`${r.clueCount}/5 clues`);
              shortLong.push(`${r.clueCount} of 5 clues written`);
            }
            if (r.ingredients.length < 3) {
              short.push(`${r.ingredients.length} ingr`);
              shortLong.push(`${r.ingredients.length} ingredients, needs 3`);
            }
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
                <td data-label="Country">{r.country}</td>
                <td data-label="Region">{titleCase(r.region)}</td>
                <td data-label="Course">{r.course}</td>
                <td data-label="Served">{r.temperature}</td>
                <td data-label="Protein">{r.protein}</td>
                <td data-label="Last served" className="nowrap">
                  {r.lastServed ? (
                    <span title={`Served ${r.timesServed}×`}>
                      {r.lastServed} <span className="cell-dim">{rest}d</span>
                    </span>
                  ) : (
                    <span className="cell-dim">never</span>
                  )}
                </td>
                <td data-label="Status" className="nowrap">
                  {!r.isActive ? (
                    <span className="badge badge--off">inactive</span>
                  ) : r.schedulable ? (
                    <span className="badge">ready</span>
                  ) : (
                    // The shortfall rides in the badge rather than in two
                    // columns that read "5/5 · 7" on every healthy row.
                    <span className="badge badge--warn" title={shortLong.join(" · ")}>
                      {short.join(" · ")}
                    </span>
                  )}
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
              <td colSpan={8} className="dash-note" style={{ textAlign: "center", padding: "18px 0" }}>
                Nothing on the menu matches that.{" "}
                <button className="link-btn" onClick={clear}>
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
