import { describe, expect, it } from "vitest";
import {
  detectLocale,
  intlLocale,
  langAttribute,
  LOCALES,
  localeOverride,
  matchLocale,
  parsePicked,
  resolveLocale,
  shippedLocale,
  type LocaleInfo,
} from "./locale";

// A wider list than ships today, so the region and review rules have something to bite on.
const LIST: LocaleInfo[] = [
  { tag: "en", name: "English", autoDetect: true },
  { tag: "es", name: "Español", autoDetect: true },
  { tag: "pt-BR", name: "Português", autoDetect: true },
  { tag: "de", name: "Deutsch", autoDetect: false },
];

const none = { picked: null, discord: null, browser: [] };

describe("matchLocale", () => {
  it("takes the exact tag, case and underscores aside", () => {
    expect(matchLocale("pt-BR", LIST)).toBe("pt-BR");
    expect(matchLocale("pt_br", LIST)).toBe("pt-BR");
  });

  it("falls back to the language alone", () => {
    expect(matchLocale("es-MX", LIST)).toBe("es");
    expect(matchLocale("pt-PT", LIST)).toBe("pt-BR");
    expect(matchLocale("pt", LIST)).toBe("pt-BR");
  });

  it("is null for nothing or a language we don't ship", () => {
    expect(matchLocale(null, LIST)).toBeNull();
    expect(matchLocale("", LIST)).toBeNull();
    expect(matchLocale("ja-JP", LIST)).toBeNull();
  });
});

describe("detectLocale", () => {
  it("answers a guild's or a browser's setting with a reviewed locale only", () => {
    expect(detectLocale("es-ES", LIST)).toBe("es");
    expect(detectLocale("de", LIST)).toBeNull();
    expect(detectLocale(undefined, LIST)).toBeNull();
  });
});

describe("shippedLocale", () => {
  it("keeps a shipped tag exactly and nulls everything else", () => {
    expect(shippedLocale("en")).toBe("en");
    expect(shippedLocale("pseudo")).toBeNull();
    expect(shippedLocale("EN")).toBeNull();
    expect(shippedLocale(42)).toBeNull();
    expect(shippedLocale(undefined)).toBeNull();
  });
});

describe("resolveLocale", () => {
  it("is English with nothing to go on", () => {
    expect(resolveLocale(none, LIST)).toBe("en");
  });

  it("takes the first browser language it ships, in the player's order", () => {
    expect(resolveLocale({ ...none, browser: ["fr-FR", "es-419", "en"] }, LIST)).toBe("es");
  });

  it("puts Discord's setting ahead of the browser", () => {
    expect(resolveLocale({ ...none, discord: "pt-BR", browser: ["es"] }, LIST)).toBe("pt-BR");
  });

  it("puts the player's pick ahead of everything", () => {
    const picked = { locale: "en", at: 1 };
    expect(resolveLocale({ picked, discord: "es-ES", browser: ["es"] }, LIST)).toBe("en");
  });

  it("never auto-detects an unreviewed locale, but honours picking one", () => {
    expect(resolveLocale({ ...none, browser: ["de-DE"] }, LIST)).toBe("en");
    expect(resolveLocale({ ...none, picked: { locale: "de", at: 1 } }, LIST)).toBe("de");
  });

  it("ignores a pick we no longer ship", () => {
    expect(resolveLocale({ ...none, picked: { locale: "ko", at: 1 }, browser: ["es"] }, LIST)).toBe("es");
  });

  it("ships English first, so the fallback is English", () => {
    expect(LOCALES[0].tag).toBe("en");
  });
});

describe("parsePicked", () => {
  it("reads a well-formed pick", () => {
    expect(parsePicked('{"locale":"es","at":1700000000000}')).toEqual({ locale: "es", at: 1700000000000 });
  });

  it("is null for anything else", () => {
    for (const raw of [null, "", "es", "{}", '{"locale":"es"}', '{"locale":1,"at":1}', "[]", "{bad"]) {
      expect(parsePicked(raw)).toBeNull();
    }
  });
});

describe("localeOverride", () => {
  it("takes a shipped locale, reviewed or not, or pseudo", () => {
    expect(localeOverride("?locale=es-MX", LIST)).toBe("es");
    expect(localeOverride("?locale=de", LIST)).toBe("de");
    expect(localeOverride("?locale=pseudo", LIST)).toBe("pseudo");
  });

  it("is null when absent or unknown", () => {
    expect(localeOverride("", LIST)).toBeNull();
    expect(localeOverride("?locale=klingon", LIST)).toBeNull();
  });
});

describe("pseudo", () => {
  it("is en-XA on the page and English to Intl", () => {
    expect(langAttribute("pseudo")).toBe("en-XA");
    expect(intlLocale("pseudo")).toBe("en");
    expect(langAttribute("en")).toBe("en");
  });
});
