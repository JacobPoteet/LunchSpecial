// The pseudo-locale — PURE.
//
// English with every vowel accented, wrapped in brackets and padded by about
// 40%. Played at 320–430px it shows two things before any real translation
// exists: a string still hard-coded in English (no accents, no brackets), and a
// label that breaks when German makes it longer. `?locale=pseudo` turns it on.
//
// Only Latin-1 accents, which every shipped face covers, so a missing glyph is
// never mistaken for a leak.

const ACCENTS: Record<string, string> = {
  a: "á", e: "é", i: "í", o: "ó", u: "ú", y: "ý", n: "ñ", c: "ç",
  A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú", Y: "Ý", N: "Ñ", C: "Ç",
};

/** About 40% longer than English, the rule of thumb for German and French. */
const GROWTH = 0.4;

export function pseudoString(text: string): string {
  const accented = text.replace(/[aeiouyncAEIOUYNC]/g, (ch) => ACCENTS[ch]);
  const pad = "~".repeat(Math.ceil(text.length * GROWTH));
  return `[${accented}${pad ? ` ${pad}` : ""}]`;
}

/** The same catalog, every string and every function's result pseudo-localised. */
export function pseudoize<T>(messages: T): T {
  if (typeof messages === "string") return pseudoString(messages) as T;
  if (typeof messages === "function") {
    const fn = messages as (...args: unknown[]) => unknown;
    const wrapped = (...args: unknown[]) => {
      const out = fn(...args);
      return typeof out === "string" ? pseudoString(out) : out;
    };
    // Same arity, so the catalog test reads it as the same message.
    Object.defineProperty(wrapped, "length", { value: fn.length });
    return wrapped as T;
  }
  if (typeof messages === "object" && messages !== null) {
    return Object.fromEntries(Object.entries(messages).map(([k, v]) => [k, pseudoize(v)])) as T;
  }
  return messages;
}
