import { useEffect, useState } from "react";
import type { MenuMix, MenuMixKey, MenuMixSlice, MenuSliceKey } from "../../shared/types";
import { COURSES, MENU_MIX_KEYS, MENU_SLICES, PROTEINS, REGIONS, TEMPERATURES } from "../../shared/types";
import * as api from "./api";

/**
 * The menu-mix panel: what the kitchen has actually been serving. Everything
 * here is catalogue data (schedule × dishes), not player analytics — it answers
 * "is the menu varied?", not "are people playing?".
 *
 * Charting notes: every bar is one hue and ranked by value, because these are
 * *nominal* categories — colouring nine regions nine different ways would spend
 * the identity channel re-encoding what the bar length already says. The pool's
 * share rides along as a thin reference tick so over- and under-served
 * categories are visible without a second series.
 */

const pct = (n: number, of: number) => (of === 0 ? 0 : Math.round((n / of) * 100));

/** "north-america" → "North America"; single-word enums pass through capitalised. */
const titleCase = (v: string) =>
  v
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** Each breakdown's enum, so one renderer can walk all four in shared order. */
const MIX_VALUES: Record<MenuMixKey, readonly string[]> = {
  region: REGIONS,
  course: COURSES,
  protein: PROTEINS,
  temperature: TEMPERATURES,
};
const MIX_CATEGORIES = MENU_MIX_KEYS.map((key) => ({ key, label: titleCase(key), values: MIX_VALUES[key] }));

const SLICE_META: Record<MenuSliceKey, { label: string; noun: string }> = {
  served: { label: "Served", noun: "specials served" },
  upcoming: { label: "Booked", noun: "days booked ahead" },
  pool: { label: "Pool", noun: "dishes in the pool" },
};

/** A category's counts, keyed loosely so one renderer can walk all four enums. */
const countsOf = (slice: MenuMixSlice, key: MenuMixKey) => slice[key] as Record<string, number>;

/**
 * One category's ranked share bars. `baseline` (the active pool's counts) draws a
 * reference tick at the share that category would have if the menu matched the
 * pool — the gap between bar and tick is over/under-representation.
 */
function MixBars({
  counts,
  total,
  values,
  baseline,
  baselineTotal,
}: {
  counts: Record<string, number>;
  total: number;
  values: readonly string[];
  baseline: Record<string, number> | null;
  baselineTotal: number;
}) {
  // Ranked by value; ties keep the enum's own order (Array.sort is stable).
  const rows = [...values].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
  const max = Math.max(1, ...values.map((v) => counts[v] ?? 0));

  return (
    <div className="mix">
      {rows.map((v) => {
        const n = counts[v] ?? 0;
        const share = pct(n, total);
        const poolShare = baseline ? pct(baseline[v] ?? 0, baselineTotal) : null;
        const delta = poolShare === null ? null : share - poolShare;
        // Where the pool's share lands on this track: the count this category
        // *would* have if the slice matched the pool, scaled like the bars.
        const refLeft = poolShare === null ? null : Math.min(100, ((poolShare / 100) * total * 100) / max);
        const tip =
          poolShare === null
            ? `${titleCase(v)}: ${n} (${share}%)`
            : `${titleCase(v)}: ${n} (${share}%) · pool ${poolShare}%`;
        return (
          <div className="mix__row" key={v} title={tip}>
            <span className={`mix__label${n === 0 ? " mix__label--zero" : ""}`}>{titleCase(v)}</span>
            <span className="mix__track">
              {/* Bar length is the count against the biggest count, so a small
                  category stays visible; the % label carries the actual share. */}
              <span className="mix__bar" style={{ width: `${(n / max) * 100}%` }} />
              {refLeft !== null && <span className="mix__ref" style={{ left: `${refLeft}%` }} aria-hidden="true" />}
            </span>
            <span className="mix__val">
              {n}
              <span className="mix__pct">{share}%</span>
            </span>
            {/* Under 3 points is inside the rounding noise of a short menu. */}
            <span className={`mix__delta${delta !== null && delta > 0 ? " mix__delta--over" : ""}`}>
              {delta === null || Math.abs(delta) < 3 ? "" : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} pts`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Region cadence: one row per region, one cell per recent Special. Reads as a
 * dot path — clumps show a region served three times in a fortnight, empty rows
 * show one that hasn't come up at all.
 */
function CadenceStrip({ timeline }: { timeline: MenuMix["timeline"] }) {
  return (
    <div className="day-table-wrap">
      <div className="cadence">
        {REGIONS.map((r) => (
          <div className="cadence__row" key={r}>
            <span className="cadence__label">{titleCase(r)}</span>
            <span className="cadence__cells">
              {timeline.map((s) => (
                <span
                  key={s.date}
                  className={`cadence__cell${s.region === r ? " cadence__cell--on" : ""}`}
                  title={s.region === r ? `${s.date} · ${s.name} (${s.country})` : undefined}
                />
              ))}
            </span>
          </div>
        ))}
        <div className="cadence__row cadence__row--axis">
          <span className="cadence__label" />
          <span className="cadence__cells">
            <span className="cadence__tick">{timeline[0]?.date}</span>
            <span className="cadence__tick cadence__tick--end">{timeline.at(-1)?.date}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Plain ranked bars with no baseline — used for the pantry (top ingredients). */
function RankedBars({ rows }: { rows: { name: string; servings: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.servings));
  return (
    <div className="mix">
      {rows.map((r) => (
        <div className="mix__row mix__row--plain" key={r.name} title={`${r.name}: on ${r.servings} specials`}>
          <span className="mix__label">{r.name}</span>
          <span className="mix__track">
            <span className="mix__bar" style={{ width: `${(r.servings / max) * 100}%` }} />
          </span>
          <span className="mix__val">{r.servings}</span>
        </div>
      ))}
    </div>
  );
}

/** How many countries the table lists before folding the tail into a note. */
const COUNTRY_ROWS = 12;

export default function MenuMixPanel() {
  const [mix, setMix] = useState<MenuMix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slice, setSlice] = useState<MenuSliceKey>("served");

  useEffect(() => {
    api.getMenuMix().then(setMix, (e: Error) => setError(e.message));
  }, []);

  const header = (
    <div className="analytics-head">
      <h2>Menu mix</h2>
    </div>
  );

  if (error) {
    return (
      <section className="panel">
        {header}
        <p className="dash-note">Couldn't load the menu mix: {error}</p>
      </section>
    );
  }
  if (!mix) {
    return (
      <section className="panel">
        {header}
        <p className="dash-note">Reading back the order book…</p>
      </section>
    );
  }

  const { served, pool, countries, ingredients, repeats, timeline } = mix;
  if (pool.servings === 0 && served.servings === 0) {
    return (
      <section className="panel">
        {header}
        <p className="dash-note">No dishes in the catalogue yet — add a few and the mix shows up here.</p>
      </section>
    );
  }

  const active = mix[slice];
  // The pool is the baseline every other slice is compared against; comparing
  // the pool to itself would just draw the tick on top of every bar.
  const baseline = slice === "pool" ? null : pool;
  const coverage = pct(served.dishes, pool.dishes);

  return (
    <section className="panel">
      {header}

      <div className="metric-row">
        <div className="metric metric--primary">
          <span className="metric__num">{served.servings}</span>
          <span className="metric__label">Specials served</span>
        </div>
        <div className="metric">
          <span className="metric__num">{served.dishes}</span>
          <span className="metric__label">Distinct dishes</span>
        </div>
        <div className="metric">
          <span className="metric__num">{countries.length}</span>
          <span className="metric__label">Countries visited</span>
        </div>
        <div className="metric">
          <span className="metric__num">{coverage}%</span>
          <span className="metric__label">Of the pool served</span>
        </div>
      </div>
      <p className="dash-note">
        {mix.neverServed} of {pool.dishes} active dish{pool.dishes === 1 ? "" : "es"} ha
        {mix.neverServed === 1 ? "s" : "ve"} never been the Special · {mix.upcoming.servings} day
        {mix.upcoming.servings === 1 ? "" : "s"} booked ahead
        {mix.unscheduledDays > 0 &&
          ` · ${mix.unscheduledDays} past day${mix.unscheduledDays === 1 ? "" : "s"} ran on the fallback pick (no schedule row, so not counted above)`}
      </p>

      <hr className="analytics-rule" />

      <div className="analytics-head analytics-head--sub">
        <h3 className="analytics-sub" style={{ margin: 0 }}>
          Ratios · {active.servings} {SLICE_META[slice].noun}
        </h3>
        <div className="surface-toggle" role="tablist" aria-label="Which slice of the menu to chart">
          {MENU_SLICES.map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={slice === s}
              className={`surface-toggle__btn${slice === s ? " surface-toggle__btn--active" : ""}`}
              onClick={() => setSlice(s)}
            >
              {SLICE_META[s].label}
            </button>
          ))}
        </div>
      </div>

      {active.servings === 0 ? (
        <p className="dash-note">
          {slice === "upcoming" ? "Nothing is booked ahead yet." : "Nothing has been served yet."}
        </p>
      ) : (
        <>
          <div className="mix-grid">
            {MIX_CATEGORIES.map((cat) => (
              <div key={cat.key}>
                <h3 className="analytics-sub">{cat.label}</h3>
                <MixBars
                  counts={countsOf(active, cat.key)}
                  total={active.servings}
                  values={cat.values}
                  baseline={baseline ? countsOf(baseline, cat.key) : null}
                  baselineTotal={pool.servings}
                />
              </div>
            ))}
          </div>
          <p className="dash-note" style={{ marginTop: 10 }}>
            Bars are counts, ranked; the % is that category's share of the {SLICE_META[slice].noun}.
            {baseline &&
              " The grey tick marks the pool's share, so a bar past it is over-served — the ± figure is the gap in percentage points."}
          </p>
        </>
      )}

      {timeline.length > 0 && (
        <div className="analytics-block">
          <h3 className="analytics-sub">
            Region cadence · last {timeline.length} special{timeline.length === 1 ? "" : "s"}
          </h3>
          <CadenceStrip timeline={timeline} />
          <p className="dash-note" style={{ marginTop: 8 }}>
            One column per Special, oldest on the left. A run of marks in one row means that region came
            up repeatedly; an empty row is a region the menu hasn't visited.
          </p>
        </div>
      )}

      <div className="analytics-split" style={{ marginTop: 20 }}>
        <div>
          <h3 className="analytics-sub">Countries served</h3>
          {countries.length === 0 ? (
            <p className="dash-note">Nothing served yet.</p>
          ) : (
            <>
              <div className="day-table-wrap">
                <table className="day-table">
                  <thead>
                    <tr>
                      <th>Country</th>
                      <th>Region</th>
                      <th>Times</th>
                      <th>Last on</th>
                    </tr>
                  </thead>
                  <tbody>
                    {countries.slice(0, COUNTRY_ROWS).map((c) => (
                      <tr key={c.country}>
                        <td>{c.country}</td>
                        <td>{titleCase(c.region)}</td>
                        <td>{c.servings}</td>
                        <td>{c.lastServed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {countries.length > COUNTRY_ROWS && (
                <p className="dash-note" style={{ marginTop: 8 }}>
                  …and {countries.length - COUNTRY_ROWS} more countr
                  {countries.length - COUNTRY_ROWS === 1 ? "y" : "ies"}, each served once or twice.
                </p>
              )}
            </>
          )}
        </div>

        <div>
          <h3 className="analytics-sub">Pantry · most-served ingredients</h3>
          {ingredients.length === 0 ? (
            <p className="dash-note">Nothing served yet.</p>
          ) : (
            <>
              <RankedBars rows={ingredients} />
              <p className="dash-note" style={{ marginTop: 8 }}>
                Counted once per serving — a dish served twice puts its ingredients on the menu twice.
              </p>
            </>
          )}
        </div>
      </div>

      {repeats.length > 0 && (
        <div className="analytics-block">
          <h3 className="analytics-sub">Served more than once</h3>
          <div className="day-table-wrap">
            <table className="day-table">
              <thead>
                <tr>
                  <th>Dish</th>
                  <th>Times</th>
                  <th>Last on</th>
                </tr>
              </thead>
              <tbody>
                {repeats.map((r) => (
                  <tr key={r.dishId}>
                    <td>{r.name}</td>
                    <td>{r.servings}</td>
                    <td>{r.lastServed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="dash-note" style={{ marginTop: 10 }}>
        Menu composition only — schedule and catalogue, no player data. Served covers puzzle #1 through
        today ({mix.today}).
      </p>
    </section>
  );
}
