import { classify } from "../../shared/families";

/**
 * The editors' warning for an ingredient nobody has placed in a family.
 *
 * `worker/data-integrity.test.ts` fails CI for an unplaced ingredient in the
 * repo's catalogue, but an ingredient typed into /admin never passes through
 * that test, so this is the only place the gap can be seen. It is a warning and
 * never a block: the dish saves and the ingredient matches exactly, it just
 * can't turn another guess yellow until it is placed.
 */
export default function UnplacedHint({ ingredients }: { ingredients: string[] }) {
  const unplaced = ingredients.filter((i) => classify(i) === "unclassified");
  if (unplaced.length === 0) return null;
  return (
    <p className="field-hint field-hint--warn">
      ⚠ Not placed: {unplaced.join(", ")}. Add to a family, or STANDALONE, in shared/families.ts.
    </p>
  );
}
