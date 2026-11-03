---
paths:
  - "shared/families.ts"
  - "shared/pack.ts"
  - "worker/data-integrity.test.ts"
  - "seed/**"
  - "migrations/**"
  - "src/admin/DishEditor.tsx"
  - "src/admin/UnplacedHint.tsx"
  - "src/admin/IngredientWebPanel.tsx"
---

# Ingredient families (amber "close" chip)

Loaded with the files above. Rules that apply everywhere stay in the root CLAUDE.md.

- A family is a **partition, never a graph**; all of it is `shared/families.ts` (`FAMILIES`, `STAPLES`, `STANDALONE`, `nearIngredients`). Staples are cousins of nobody. Spirits are `STANDALONE`. Keep a family tight ("a cook would swap one for the other").
- Only unmatched ingredients take part; each of the Special's is claimed once; the result names the *guess's* ingredient and the *family*, never the Special's partner.
- `unmatchedIngredients` stays the exact complement of `matchedIngredients`; a close one is in both it and `nearIngredients`, so counts, grids and old rounds are unchanged. The check's count is exact matches only.
- Close is never colour alone: dashed border + leading `≈` (`.chip--close`).
- CI enforces placement (`data-integrity.test.ts`, "the pantry"): every ingredient in a family, staple or `STANDALONE`; no plural twin; yellow rate under 30%. Ingredients typed in /admin bypass that test; the editors show `UnplacedHint`.
- `shared/families.ts` and `shared/pack.ts` import **only types** (`npm run docs:web` runs them under plain node; a test enforces it). The public project page ships a snapshot and a hand-picked `PLATES` list, never the catalogue (an unplayed Special could leak).
