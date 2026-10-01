import { useEffect, useMemo, useState } from "react";
import { classify, familyOf, FAMILIES, nearIngredients, nearRate } from "../../shared/families";
import { packWeb, type PackGroup } from "../../shared/pack";
import type { Pantry, PantryRow } from "../../shared/types";
import * as api from "./api";

/**
 * Ingredient families, drawn: what a guess would call "close", and how often.
 *
 * The map is the pantry as the game sees it. Each ring is a family and each dot
 * an ingredient, its area the number of dishes that use it, so a family that has
 * swallowed half the pantry is visible before it shows up as a rate. Three
 * rings are not families: the staples (in nearly everything, so cousins of
 * nobody), the ingredients that stand alone, and the ones nobody has placed yet,
 * which is the maintenance list for the one chore this feature has.
 *
 * One hue, on purpose. The dashboard's four colour meanings are taken, and a
 * family's identity is its ring and its label, not a swatch; a group colour
 * would be a fifth meaning spent on what the ring already says. Selection is
 * ink, "not yet placed" is a dashed ring.
 *
 * Catalogue data only (no player data), so it takes none of the tab's filters.
 */

type MenuKey = "kitchen" | "bar";
const MENUS: { key: MenuKey; label: string; noun: string }[] = [
  { key: "kitchen", label: "Kitchen", noun: "dishes" },
  { key: "bar", label: "The bar", noun: "drinks" },
];

const STAPLE_KEY = "__staples";
const ALONE_KEY = "__alone";
const UNPLACED_KEY = "__unplaced";
const SPECIAL_LABEL: Record<string, string> = {
  [STAPLE_KEY]: "Everywhere, no cousins",
  [ALONE_KEY]: "Stands alone",
  [UNPLACED_KEY]: "Not placed yet",
};

/** A dot's radius: area grows with use, offset so a one-dish ingredient is still a dot you can hit. */
const dotRadius = (count: number) => 4 + Math.sqrt(count) * 2.6;
const pct = (n: number, of: number) => (of === 0 ? "0%" : `${Math.round((n / of) * 1000) / 10}%`);

export default function IngredientWebPanel() {
  const [pantry, setPantry] = useState<Pantry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuKey>("kitchen");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api.getPantry().then(setPantry, (e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load the pantry."));
  }, []);

  const rows: PantryRow[] = useMemo(() => pantry?.[menu] ?? [], [pantry, menu]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) for (const i of r.ingredients) m.set(i, (m.get(i) ?? 0) + 1);
    return m;
  }, [rows]);

  const rate = useMemo(() => nearRate(rows.map((r) => ({ name: r.name ?? "", ingredients: r.ingredients }))), [rows]);

  /** Every ring, with its members, in the order they're packed: biggest family first, the three odd rings last. */
  const rings = useMemo(() => {
    const by = new Map<string, string[]>();
    const push = (key: string, ing: string) => by.set(key, [...(by.get(key) ?? []), ing]);
    for (const ing of counts.keys()) {
      const kind = classify(ing);
      if (kind === "family") push(familyOf(ing) ?? ALONE_KEY, ing);
      else push(kind === "staple" ? STAPLE_KEY : kind === "standalone" ? ALONE_KEY : UNPLACED_KEY, ing);
    }
    const total = (key: string) => (by.get(key) ?? []).reduce((n, i) => n + (counts.get(i) ?? 0), 0);
    const special = [STAPLE_KEY, ALONE_KEY, UNPLACED_KEY].filter((k) => by.has(k));
    const families = [...by.keys()].filter((k) => !special.includes(k)).sort((a, b) => total(b) - total(a) || a.localeCompare(b));
    return [...families, ...special].map((key) => ({
      key,
      members: (by.get(key) ?? []).sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b)),
    }));
  }, [counts]);

  const web = useMemo(() => {
    const groups: PackGroup[] = rings.map((r) => ({
      key: r.key,
      leaves: r.members.map((m) => ({ key: m, r: dotRadius(counts.get(m) ?? 1) })),
    }));
    return packWeb(groups);
  }, [rings, counts]);

  const unplaced = rings.find((r) => r.key === UNPLACED_KEY)?.members ?? [];
  const placed = [...counts.keys()].filter((i) => familyOf(i)).length;
  const active = rings.find((r) => r.key === selected) ?? null;
  const noun = MENUS.find((m) => m.key === menu)!.noun;

  if (error) {
    return (
      <section className="panel">
        <h2>Ingredient families</h2>
        <p className="dash-note">{error}</p>
      </section>
    );
  }
  if (!pantry) {
    return (
      <section className="panel">
        <h2>Ingredient families</h2>
        <p className="dash-note">Loading the pantry…</p>
      </section>
    );
  }

  const { x, y, width, height } = web.bounds;
  const dim = (key: string) => (selected && selected !== key ? " iw--dim" : "");

  return (
    <section className="panel">
      <div className="analytics-head">
        <h2>Ingredient families</h2>
        <div className="surface-toggle" role="tablist" aria-label="Which menu to draw">
          {MENUS.map((m) => (
            <button
              key={m.key}
              role="tab"
              aria-selected={menu === m.key}
              className={`surface-toggle__btn${menu === m.key ? " surface-toggle__btn--active" : ""}`}
              onClick={() => {
                setMenu(m.key);
                setSelected(null);
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <p className="dash-note">
        The pantry as the game sees it. A guess ingredient turns yellow when the Special holds a{" "}
        <em>different</em> ingredient of the same family, so a ring is a set of cousins. Catalogue data,
        so the tab's Web/Discord filter doesn't apply.
      </p>

      <div className="metric-row">
        <div className="metric metric--primary">
          <span className="metric__num">{pct(rate.withNear, rate.pairs)}</span>
          <span className="metric__label">Guesses with a yellow</span>
        </div>
        <div className="metric">
          <span className="metric__num">{pct(rate.noOverlapRescued, rate.noOverlap)}</span>
          <span className="metric__label">No-overlap pairs rescued</span>
        </div>
        <div className="metric">
          <span className="metric__num">{counts.size}</span>
          <span className="metric__label">Ingredients in use</span>
        </div>
        <div className="metric">
          <span className="metric__num">{placed}</span>
          <span className="metric__label">In a family</span>
        </div>
      </div>
      <p className="dash-note">
        Every {noun.slice(0, -1)} guessed against every other ({rate.pairs.toLocaleString()} pairs). Players
        guess popular {noun}, not uniformly, so read this as the pantry's shape and not a forecast. If it
        climbs past about 30% a family has grown too broad.
      </p>

      {unplaced.length > 0 && (
        <p className="dash-note iw-warn">
          ⚠ {unplaced.length} ingredient{unplaced.length === 1 ? "" : "s"} in use {unplaced.length === 1 ? "has" : "have"} no
          family and {unplaced.length === 1 ? "isn't" : "aren't"} marked as standing alone: {unplaced.join(", ")}. They match
          exactly but are cousins of nothing until they're added in shared/families.ts.{" "}
          <button className="link-btn" onClick={() => setSelected(UNPLACED_KEY)}>
            Show on the map
          </button>
        </p>
      )}

      <div className="iw-map">
        <svg viewBox={`${x} ${y} ${width} ${height}`} role="img" aria-label="Ingredients packed into family rings">
          {web.groups.map((g) => {
            const special = SPECIAL_LABEL[g.key] !== undefined;
            const label = SPECIAL_LABEL[g.key] ?? g.key;
            return (
              <g key={g.key} className={`iw-group${dim(g.key)}`}>
                <circle
                  cx={g.x}
                  cy={g.y}
                  r={g.r}
                  className={`iw-ring${special ? " iw-ring--odd" : ""}${g.key === UNPLACED_KEY ? " iw-ring--unplaced" : ""}${
                    selected === g.key ? " iw-ring--on" : ""
                  }`}
                  onClick={() => setSelected(selected === g.key ? null : g.key)}
                />
                {g.leaves.map((l) => (
                  <circle
                    key={l.key}
                    cx={l.x}
                    cy={l.y}
                    r={l.r}
                    className={`iw-dot${special ? " iw-dot--odd" : ""}`}
                    onClick={() => setSelected(selected === g.key ? null : g.key)}
                  >
                    <title>{`${l.key}: ${counts.get(l.key)} ${noun}`}</title>
                  </circle>
                ))}
                {g.r >= 26 && (
                  <text x={g.x} y={g.y} textAnchor="middle" dominantBaseline="central" className="iw-label" fontSize={Math.max(9, Math.min(17, g.r / 3.6))}>
                    {label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="iw-detail" aria-live="polite">
        {!active && <p className="dash-note">Click a ring, or a name below, to see its members.</p>}
        {active && active.key === STAPLE_KEY && (
          <p>
            <strong>Everywhere, no cousins.</strong> {active.members.map((m) => `${m} (${counts.get(m)})`).join(", ")}. Each is
            in so many {noun} that a cousin signal would light up on most guesses. They still match exactly.
          </p>
        )}
        {active && active.key === ALONE_KEY && (
          <p>
            <strong>Stands alone.</strong> {active.members.map((m) => `${m} (${counts.get(m)})`).join(", ")}. No cousin in the
            pantry yet: an exact match or a miss, nothing between. The spirits sit here because the Spirit tile already
            says whether two drinks share a base.
          </p>
        )}
        {active && active.key === UNPLACED_KEY && (
          <p>
            <strong>Not placed yet.</strong> {active.members.map((m) => `${m} (${counts.get(m)})`).join(", ")}. Add each to a
            family, or to STANDALONE, in <code>shared/families.ts</code>. CI fails on any of these that reach the repo's
            catalogue; these came in through the editor.
          </p>
        )}
        {active && !SPECIAL_LABEL[active.key] && (
          <p>
            <strong>{active.key}.</strong> {active.members.map((m) => `${m} (${counts.get(m)})`).join(", ")}
            {(FAMILIES[active.key]?.length ?? 0) > active.members.length &&
              `. ${FAMILIES[active.key].length - active.members.length} more member${FAMILIES[active.key].length - active.members.length === 1 ? " isn't" : "s aren't"} used by any active ${noun.slice(0, -1)}`}
            . Guess any of these against a Special holding a different one and the chip turns yellow.
          </p>
        )}
      </div>
      <div className="iw-chips">
        {rings.map((r) => (
          <button
            key={r.key}
            className={`iw-chip${selected === r.key ? " iw-chip--on" : ""}${r.key === UNPLACED_KEY ? " iw-chip--warn" : ""}`}
            aria-pressed={selected === r.key}
            onClick={() => setSelected(selected === r.key ? null : r.key)}
          >
            {SPECIAL_LABEL[r.key] ?? r.key}
          </button>
        ))}
      </div>

      <hr className="analytics-rule" />
      <PairExplorer rows={rows} noun={noun} />
    </section>
  );
}

/**
 * Two items, side by side: which ingredients match, which are cousins, which
 * are neither. It runs the same fold the Worker does. Items booked for a later
 * day arrive without a name (see the pantry route) and so can't be picked,
 * which is the point.
 */
function PairExplorer({ rows, noun }: { rows: PantryRow[]; noun: string }) {
  const named = useMemo(() => rows.filter((r): r is PantryRow & { name: string } => r.name !== null), [rows]);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  // A new menu is a new list: the typed names no longer exist in it.
  useEffect(() => {
    setA("");
    setB("");
  }, [rows]);
  const guess = named.find((r) => r.name === a);
  const target = named.find((r) => r.name === b);
  const result = useMemo(() => {
    if (!guess || !target) return null;
    const t = new Set(target.ingredients);
    const g = new Set(guess.ingredients);
    const near = nearIngredients(guess.ingredients, target.ingredients);
    const nearSet = new Set(near.map((n) => n.ingredient));
    return {
      exact: guess.ingredients.filter((i) => t.has(i)),
      near,
      miss: guess.ingredients.filter((i) => !t.has(i) && !nearSet.has(i)),
      theirs: target.ingredients.filter((i) => !g.has(i)),
    };
  }, [guess, target]);
  const listId = `iw-${noun}`;

  return (
    <div className="analytics-block">
      <h3 className="analytics-sub">Try a guess</h3>
      <div className="iw-pair">
        <label>
          Guess
          <input list={listId} value={a} onChange={(e) => setA(e.target.value)} placeholder={`a ${noun.slice(0, -1)}…`} />
        </label>
        <label>
          Special
          <input list={listId} value={b} onChange={(e) => setB(e.target.value)} placeholder={`another ${noun.slice(0, -1)}…`} />
        </label>
        <datalist id={listId}>
          {named.map((r) => (
            <option key={r.name} value={r.name} />
          ))}
        </datalist>
      </div>
      {result ? (
        <div className="iw-result">
          <p>
            <strong>{result.exact.length}</strong> exact ·{" "}
            <strong>{result.near.length}</strong> close · {result.miss.length} off
          </p>
          <div className="iw-tags">
            {result.exact.map((i) => (
              <span key={i} className="iw-tag iw-tag--hit">
                ✓ {i}
              </span>
            ))}
            {result.near.map((n) => (
              <span key={n.ingredient} className="iw-tag iw-tag--near">
                ≈ {n.ingredient} <small>{n.family}</small>
              </span>
            ))}
            {result.miss.map((i) => (
              <span key={i} className="iw-tag">
                {i}
              </span>
            ))}
          </div>
          <p className="dash-note">
            What the player would see after guessing the first against the second. Names booked for a later day
            aren't offered here.
          </p>
        </div>
      ) : (
        <p className="dash-note">Pick two names to see which ingredients would match and which would be cousins.</p>
      )}
    </div>
  );
}
