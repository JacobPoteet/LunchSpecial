// Every catalog at once, eagerly: for the tests that must hold in every
// language (never name the dish) and, from phase 1a, the Worker picking the
// guild's language for the progress message. The client never imports this;
// it loads one catalog at a time (src/i18n/store.ts).
//
// catalog.test.ts holds it to LOCALES, so a new locale can't be left off.

import en from "./locales/en";
import type { Messages } from "./messages";
import { pseudoize } from "./pseudo";

export const CATALOGS: Record<string, Messages> = {
  en,
  pseudo: pseudoize(en),
};
