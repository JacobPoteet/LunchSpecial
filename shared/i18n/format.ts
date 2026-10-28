// The two pieces of grammar a catalog can't spell out by hand — PURE.
//
// Both lean on the platform's `Intl`, which every browser and workerd carry,
// so the game ships no plural tables of its own. A catalog calls these with its
// own tag (`plural("es", n, …)`), so nothing upstream threads a locale through.

const pluralRules = new Map<string, Intl.PluralRules>();
const listFormats = new Map<string, Intl.ListFormat>();

/**
 * Every form a language might use. `other` is the one every language has;
 * English adds `one`, Polish needs `few` and `many`, Japanese uses `other`
 * alone. Never `n === 1 ? … : …`, which is English-shaped.
 */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

/** The form of `forms` this locale uses for `n`, falling back to `other`. */
export function plural(locale: string, n: number, forms: PluralForms): string {
  let rules = pluralRules.get(locale);
  if (!rules) pluralRules.set(locale, (rules = new Intl.PluralRules(locale)));
  return forms[rules.select(n)] ?? forms.other;
}

/** "Japan, pork and hot", with this locale's commas and its word for "and" (or "or"). */
export function list(locale: string, items: readonly string[], type: "conjunction" | "disjunction" = "conjunction"): string {
  const key = `${locale}|${type}`;
  let format = listFormats.get(key);
  if (!format) listFormats.set(key, (format = new Intl.ListFormat(locale, { type })));
  return format.format(items);
}
