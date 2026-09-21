// Name search, shared by the order bar and the admin's schedule picker: the
// one place that decides which names a typed query offers, and in what order.

/**
 * Strip diacritics so an accented name (Crème Brûlée) is reachable from an
 * English keyboard ("creme brulee"). NFD splits a letter from its combining
 * accent, then the accent marks are dropped.
 */
export function foldAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * Items whose **name** contains the query, best first: names that start with
 * it ahead of names that merely contain it, each group keeping the order it
 * came in (the catalogue routes sort by name, so that is alphabetical). Case
 * and accents are ignored on both sides.
 *
 * Name only, on purpose. Anything else an item carries (a country, a rest
 * note) is shown beside the name and never searched, or typing a country
 * fills the list with names that have nothing to do with the query (GitHub
 * #204 was the order bar offering "Shepherd's Pie" ahead of "Pho" for "p",
 * because it filtered on contains and never ranked).
 *
 * An empty query matches nothing; a caller that wants to offer the head of
 * the catalogue on focus decides that itself.
 */
export function rankByName<T extends { name: string }>(query: string, items: T[], limit: number): T[] {
  const key = foldAccents(query.trim().toLowerCase());
  if (key === "") return [];
  const starts: T[] = [];
  const contains: T[] = [];
  for (const item of items) {
    const at = foldAccents(item.name.toLowerCase()).indexOf(key);
    if (at === 0) starts.push(item);
    else if (at > 0) contains.push(item);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}
