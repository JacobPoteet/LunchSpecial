// Ingredient families: the "close" state of the ingredient chips.
//
// An ingredient chip has always been a match or it wasn't, and a player who
// ordered Pad Thai against shrimp scampi saw "noodles" miss when the Special
// was built on pasta. A family is a partition of the pantry into cousins: two
// DIFFERENT ingredients of one family are close. It is the country tile's
// near-match applied to ingredients, and like regions it is a partition rather
// than a graph, so there is no "how far apart" to argue about and no edge to
// maintain when an ingredient is added. See the wiki's Ingredient Families.
//
// This module is pure and imports types only, so the Worker, the app, the
// dashboard and the docs generator (plain node, no bundler) all read one copy.

import type { NearIngredient } from "./types";

/**
 * Family -> members. Every member is a canonical ingredient (lowercase,
 * singular, the catalogue's spelling). One family per ingredient: a second home
 * would make "same family" depend on which way round you ask.
 *
 * Keep families TIGHT. The measured question is "how often does a guess turn
 * yellow", and the answer (about 14% of pairs on both menus) holds
 * only while a family means "a cook would swap one for the other". Dairy, spice,
 * herb, pepper and sweetener are each already split for that reason.
 */
export const FAMILIES: Readonly<Record<string, readonly string[]>> = {
  "noodle & pasta": ["noodles", "pasta", "spaghetti", "macaroni", "vermicelli", "konjac"],
  "grain": ["rice", "barley", "bulgur", "wheat", "sorghum", "teff"],
  "cereal": ["oats", "granola", "cornflakes", "rice cereal"],
  "corn": ["corn", "hominy", "corn husk", "corn chips", "cornmeal", "grits"],
  "bread & wrapper": ["bread", "bread roll", "roll", "hoagie roll", "bagel", "english muffin", "pita", "flatbread", "tortilla", "rye bread", "phyllo", "rice paper"],
  "breadcrumb": ["breadcrumbs", "crouton"],
  "cookie & cake base": ["graham cracker", "gingersnap", "ladyfingers", "sponge cake", "vanilla wafer"],
  "flour & starch": ["rye flour", "rice flour", "glutinous rice flour", "cornstarch", "tapioca", "tapioca pearl", "semolina"],
  "leavener": ["yeast", "baking powder", "cream of tartar"],
  "canned milk": ["condensed milk", "evaporated milk"],
  "cream & yogurt": ["cream", "whipped cream", "sour cream", "yogurt", "buttermilk"],
  "cheese": ["cheese", "blue cheese", "cheddar", "parmesan", "pecorino", "gruyere", "emmental", "reblochon", "mozzarella", "ricotta", "feta", "mascarpone", "cream cheese", "cheese curds"],
  "cooking fat": ["ghee", "lard", "suet", "duck fat"],
  "cooking oil": ["olive oil", "vegetable oil"],
  "egg": ["egg white", "meringue"],
  "allium": ["scallion", "leek", "fried onion"],
  "celery": ["celery", "celery salt"],
  "chili": ["chili", "green chili", "jalapeno", "cayenne pepper", "chili powder"],
  "sweet pepper": ["bell pepper", "pimento pepper", "paprika"],
  "chili sauce": ["gochujang", "chili bean paste", "hot sauce"],
  "mustard": ["mustard", "mustard seeds"],
  "pungent root": ["horseradish", "wasabi"],
  "pepper": ["black pepper", "white pepper"],
  "baking spice": ["cinnamon", "nutmeg", "clove", "allspice", "cardamom"],
  "anise": ["anise", "star anise", "five spice", "fennel"],
  "ground spice": ["cumin", "coriander", "garam masala", "curry powder", "caraway"],
  "colouring spice": ["saffron", "turmeric", "achiote", "annatto"],
  "soft herb": ["basil", "parsley", "cilantro", "mint", "dill"],
  "woody herb": ["thyme", "oregano", "rosemary", "marjoram", "bay leaf"],
  "ginger root": ["ginger", "galangal"],
  "fragrant leaf": ["lemongrass", "lime leaves", "pandan", "curry leaf"],
  "citrus": ["lemon", "lime", "orange", "grapefruit", "yuzu", "calamansi", "candied peel"],
  "berry": ["strawberry", "raspberry", "cranberry", "lingonberry"],
  "stone fruit": ["cherry", "plum", "peach"],
  "dried fruit": ["raisins", "dates", "prunes", "currants"],
  "orchard fruit": ["apple", "pear", "pomegranate", "persimmon"],
  "tropical fruit": ["pineapple", "mango", "papaya", "guava", "passion fruit", "banana", "plantain", "kiwifruit"],
  "coconut": ["coconut", "coconut milk", "coconut cream"],
  "nut": ["peanuts", "walnuts", "pistachio", "almond", "pecan", "pine nut", "marzipan", "peanut butter"],
  "sesame": ["sesame", "black sesame", "tahini", "sesame oil"],
  "chocolate": ["chocolate", "cocoa", "chocolate chip", "chocolate syrup"],
  "sugar": ["brown sugar", "powdered sugar", "palm sugar"],
  "syrup": ["honey", "maple syrup", "molasses", "corn syrup", "agave", "caramel"],
  "jam": ["jam", "strawberry jam"],
  "beef": ["beef", "veal", "beef heart", "tripe", "kidney", "beef broth"],
  "pork": ["pork", "bacon", "ham", "sausage", "pork sausage", "pork ribs", "hot dog", "guanciale", "pepperoni"],
  "poultry": ["chicken", "duck", "duck liver", "chicken broth"],
  "fish": ["salmon", "tuna", "white fish", "cod", "salt cod", "smoked haddock", "herring", "anchovy", "fish cake"],
  "shellfish": ["shrimp", "crab", "lobster", "crawfish", "mussels", "clam", "octopus", "snails"],
  "sea": ["seaweed", "dashi"],
  "bean & legume": ["chickpeas", "lentils", "beans", "white bean", "black bean", "red bean", "peas", "baked beans"],
  "soy": ["tofu", "miso"],
  "umami sauce": ["soy sauce", "sweet soy sauce", "hoisin sauce", "fish sauce", "worcestershire", "shrimp paste"],
  "tomato": ["tomato", "tomato juice", "salsa", "ketchup"],
  "briny": ["olive", "caper", "pickle", "sauerkraut"],
  "salad leaf": ["lettuce", "romaine lettuce", "spinach"],
  "brassica": ["cabbage", "cauliflower", "broccoli", "radish", "daikon", "collard greens", "mustard greens"],
  "root": ["carrot", "beetroot"],
  "tuber": ["potato", "sweet potato", "ube", "cassava"],
  "squash": ["pumpkin", "zucchini"],
  "aperitif": ["campari", "aperol", "vermouth", "bitters"],
  "liqueur": ["orange liqueur", "coffee liqueur", "blackcurrant liqueur"],
  "wine": ["white wine", "red wine", "champagne", "prosecco"],
  "beer": ["beer", "hops"],
  "mixer": ["soda water", "seltzer", "tonic water", "cola", "ginger ale", "ginger beer", "lemonade"],
  "coffee": ["coffee", "espresso"],
  "tea & infusion": ["tea", "red bush", "yerba mate", "jasmine", "hibiscus"],
};

/**
 * Ingredients too common to be cousins with anyone. Onion is in a quarter of
 * the kitchen's dishes; if it shared a family with scallion and garlic, one
 * guess in ten would light up on allium alone and the signal would stop
 * meaning anything. They still match EXACTLY, as ever. Measured: with these
 * in their families the kitchen turns yellow on 26% of guesses instead of 14%.
 */
export const STAPLES: readonly string[] = [
  "onion", "garlic", "sugar", "flour", "butter", "milk", "egg", "water", "ice", "salt",
];

/**
 * Ingredients that have no cousin, written down so that having none is a
 * decision rather than an omission. `worker/data-integrity.test.ts` fails when
 * a catalogue ingredient is in no family, not a staple and not listed here,
 * which is the whole maintenance cost of this feature: one line per new
 * ingredient, at the moment it first appears.
 *
 * The spirits sit here on purpose. The Spirit tile already says whether two
 * drinks share a base, and a second yellow for the same fact would double-count
 * it (the bar's yellow rate would be 23% with them instead of 14%).
 */
export const STANDALONE: readonly string[] = [
  "absinthe", "ackee", "aguardiente", "artichoke", "avocado", "bamboo shoot", "basil seed",
  "bean sprouts", "brandy", "cachaca", "chimichurri", "cognac", "cucumber", "eggplant",
  "food coloring", "gelatin", "gesho", "gin", "grain alcohol", "grape", "grape leaves", "gravy", "grenadine",
  "green bean", "hot water", "ice cream", "kava root", "kirsch", "koji", "lamb", "marshmallow",
  "mayonnaise", "mirin", "mushroom", "naranjilla", "okra", "orchid root", "palm sap", "pisco",
  "rose water", "rum", "sassafras", "shaved ice", "sichuan peppercorn", "sprinkles", "sugar cane",
  "sumac", "tamarind", "tejocote", "tequila", "vanilla", "vinegar", "vodka", "whiskey", "wormwood",
  "yeast extract",
];

const FAMILY_OF = new Map<string, string>();
for (const [family, members] of Object.entries(FAMILIES)) {
  for (const m of members) FAMILY_OF.set(m, family);
}
const STAPLE_SET = new Set(STAPLES);
const STANDALONE_SET = new Set(STANDALONE);

export type IngredientClass = "family" | "staple" | "standalone" | "unclassified";

/** What the game knows about one ingredient. "unclassified" is the only one a person has to act on. */
export function classify(ingredient: string): IngredientClass {
  if (STAPLE_SET.has(ingredient)) return "staple";
  if (FAMILY_OF.has(ingredient)) return "family";
  if (STANDALONE_SET.has(ingredient)) return "standalone";
  return "unclassified";
}

/** The family an ingredient may be close through, or null (staple, standalone, or not yet classified). */
export function familyOf(ingredient: string): string | null {
  return STAPLE_SET.has(ingredient) ? null : (FAMILY_OF.get(ingredient) ?? null);
}

/**
 * The guess's ingredients that are close to the Special's.
 *
 * Only ingredients that did NOT match exactly take part, on both sides: an
 * exact match has already been scored and must not also be somebody's cousin.
 * Each of the Special's ingredients can be claimed once (Wordle's duplicate
 * rule), so a guess holding noodles AND pasta against a Special holding one
 * pasta shows one yellow, not two. Order follows the guess, so the chip order
 * is stable.
 *
 * What it returns is the GUESS's side only, with the family. The Special's own
 * ingredient is never named: the family is the hint, and naming the partner
 * would hand over the answer's pantry one chip at a time.
 */
export function nearIngredients(guess: readonly string[], target: readonly string[]): NearIngredient[] {
  const targetSet = new Set(target);
  const guessSet = new Set(guess);
  const unclaimed = new Map<string, number>();
  for (const t of target) {
    if (guessSet.has(t)) continue;
    const family = familyOf(t);
    if (family) unclaimed.set(family, (unclaimed.get(family) ?? 0) + 1);
  }
  const out: NearIngredient[] = [];
  for (const g of guess) {
    if (targetSet.has(g)) continue;
    const family = familyOf(g);
    const left = family ? (unclaimed.get(family) ?? 0) : 0;
    if (family && left > 0) {
      unclaimed.set(family, left - 1);
      out.push({ ingredient: g, family });
    }
  }
  return out;
}

/**
 * How the board and the dashboard colour a family. Eight groups, each only a
 * hue for the picture: nothing in the game reads a group, and a family belongs
 * to exactly one.
 */
export const FAMILY_GROUPS: Readonly<Record<string, readonly string[]>> = {
  Starch: ["noodle & pasta", "grain", "cereal", "corn", "bread & wrapper", "breadcrumb", "flour & starch", "leavener", "tuber"],
  "Dairy & egg": ["canned milk", "cream & yogurt", "cheese", "cooking fat", "cooking oil", "egg"],
  Produce: ["allium", "celery", "sweet pepper", "salad leaf", "brassica", "root", "squash", "tomato", "briny", "coconut"],
  "Fruit & nut": ["citrus", "berry", "stone fruit", "dried fruit", "orchard fruit", "tropical fruit", "nut", "sesame"],
  "Spice & sauce": ["chili", "chili sauce", "mustard", "pungent root", "pepper", "baking spice", "anise", "ground spice", "colouring spice", "soft herb", "woody herb", "ginger root", "fragrant leaf", "umami sauce", "soy", "bean & legume", "sea"],
  "Meat & sea": ["beef", "pork", "poultry", "fish", "shellfish"],
  Sweet: ["sugar", "syrup", "jam", "chocolate", "cookie & cake base"],
  Bar: ["aperitif", "liqueur", "wine", "beer", "mixer", "coffee", "tea & infusion"],
};

const GROUP_OF = new Map<string, string>();
for (const [group, families] of Object.entries(FAMILY_GROUPS)) {
  for (const f of families) GROUP_OF.set(f, group);
}

export function groupOf(family: string): string | null {
  return GROUP_OF.get(family) ?? null;
}

/** An item as the rate and the web read it: just a name and its ingredients. */
export interface PantryItem {
  name: string;
  ingredients: readonly string[];
}

export interface NearRate {
  /** Ordered guess/Special pairs examined. */
  pairs: number;
  /** Pairs where at least one ingredient turns yellow. */
  withNear: number;
  /** Pairs sharing no exact ingredient at all. */
  noOverlap: number;
  /** Of those, the ones a yellow would have rescued. */
  noOverlapRescued: number;
}

/**
 * How often a guess would turn an ingredient yellow, over every guess against
 * every other item. Players don't guess uniformly, so this is a measure of the
 * pantry's shape and not a forecast; it is what tells you a family has grown
 * too broad (the rate climbs) before a player says the game feels easy.
 */
export function nearRate(items: readonly PantryItem[]): NearRate {
  let pairs = 0;
  let withNear = 0;
  let noOverlap = 0;
  let noOverlapRescued = 0;
  for (let a = 0; a < items.length; a++) {
    for (let b = 0; b < items.length; b++) {
      if (a === b) continue;
      pairs++;
      const target = new Set(items[b].ingredients);
      const overlap = items[a].ingredients.some((i) => target.has(i));
      const near = nearIngredients(items[a].ingredients, items[b].ingredients).length > 0;
      if (near) withNear++;
      if (!overlap) {
        noOverlap++;
        if (near) noOverlapRescued++;
      }
    }
  }
  return { pairs, withNear, noOverlap, noOverlapRescued };
}
