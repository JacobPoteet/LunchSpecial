-- Additive migration: 5 sandwiches (Cuban-American, Japanese, and three US diner/BBQ classics)
-- Pool only, no schedule rows. INSERTs only, dish keyed by slug; safe to run once on the live DB.

INSERT INTO dishes (name, slug, country, region, course, temperature, protein, ingredients) VALUES
('Cubano','cubano','Cuba','latin-america','entree','hot','pork','["bread","pork","ham","cheese","pickle","mustard","butter"]'),
('Katsu Sando','katsu-sando','Japan','east-asia','entree','cold','pork','["bread","pork","breadcrumbs","cabbage","butter","mustard"]'),
('Patty Melt','patty-melt','United States','north-america','entree','hot','beef','["beef","rye bread","cheese","onion","butter"]'),
('Peanut Butter and Jelly Sandwich','peanut-butter-and-jelly-sandwich','United States','north-america','appetizer','cold','vegetarian','["bread","peanut butter","jam"]'),
('Pulled Pork Sandwich','pulled-pork-sandwich','United States','north-america','entree','hot','pork','["pork","bread roll","vinegar","brown sugar","paprika","cabbage"]');

INSERT INTO clues (dish_id, order_index, text) VALUES
((SELECT id FROM dishes WHERE slug='cubano'),1,'It carries the name of a Caribbean island, but the sandwich itself was assembled on the American mainland.'),
((SELECT id FROM dishes WHERE slug='cubano'),2,'Cigar-factory workers in Key West and Ybor City built it for lunch, borrowing from the Cuban, Spanish, Italian and German shops that shared their street.'),
((SELECT id FROM dishes WHERE slug='cubano'),3,'Tampa and Miami have argued over it for a century — Tampa insists on a layer of Genoa salami, Miami calls that heresy.'),
((SELECT id FROM dishes WHERE slug='cubano'),4,'Roast pork and ham are layered with Swiss cheese, yellow mustard and dill pickles, then buttered and flattened in a hot press until the bread crackles.'),
((SELECT id FROM dishes WHERE slug='cubano'),5,'A pressed, griddled pork-and-ham sandwich with pickles and mustard, named for the island its makers left behind.'),
((SELECT id FROM dishes WHERE slug='katsu-sando'),1,'From an East Asian island nation — the one where an excellent lunch is often bought at a convenience store.'),
((SELECT id FROM dishes WHERE slug='katsu-sando'),2,'A Tokyo cutlet restaurant put its fried pork between bread in the 1930s, reportedly so geishas could eat one-handed without ruining their lipstick.'),
((SELECT id FROM dishes WHERE slug='katsu-sando'),3,'Convenience stores sell them by the million from a chilled shelf, while luxury versions built on wagyu now cost as much as a steak dinner.'),
((SELECT id FROM dishes WHERE slug='katsu-sando'),4,'A panko-breaded pork cutlet is pressed with shredded cabbage between crustless slices of soft, buttered milk bread.'),
((SELECT id FROM dishes WHERE slug='katsu-sando'),5,'A crustless white-bread sandwich built around a deep-fried breaded cutlet, eaten cold straight from the wrapper.'),
((SELECT id FROM dishes WHERE slug='patty-melt'),1,'North American, and it never leaves the flat-top griddle.'),
((SELECT id FROM dishes WHERE slug='patty-melt'),2,'Los Angeles diner lore credits Tiny Naylor in the 1940s; within a decade every coffee shop in the country had one on the board.'),
((SELECT id FROM dishes WHERE slug='patty-melt'),3,'Ordering it is the tell of a regular — not on every menu, but never missing from the ones that matter.'),
((SELECT id FROM dishes WHERE slug='patty-melt'),4,'A beef patty goes on with a heap of slowly browned onions and melting cheese, all of it griddled between buttered slices until the outside is dark and crisp.'),
((SELECT id FROM dishes WHERE slug='patty-melt'),5,'Half burger and half grilled cheese, built on rye instead of a bun, with sweet griddled onions inside.'),
((SELECT id FROM dishes WHERE slug='peanut-butter-and-jelly-sandwich'),1,'North American, requires no cooking whatsoever, and is usually made for somebody under the age of twelve.'),
((SELECT id FROM dishes WHERE slug='peanut-butter-and-jelly-sandwich'),2,'A US cooking magazine printed the pairing in 1901, and the wartime ration kit of the 1940s put both spreads in the same box, which sealed the habit.'),
((SELECT id FROM dishes WHERE slug='peanut-butter-and-jelly-sandwich'),3,'The average American child is said to get through a thousand or so before finishing high school.'),
((SELECT id FROM dishes WHERE slug='peanut-butter-and-jelly-sandwich'),4,'Two spreads on soft white bread — one ground from a roasted legume, the other boiled down from fruit and sugar.'),
((SELECT id FROM dishes WHERE slug='peanut-butter-and-jelly-sandwich'),5,'The lunchbox sandwich of two sweet spreads, one nutty and one fruity, on plain white bread.'),
((SELECT id FROM dishes WHERE slug='pulled-pork-sandwich'),1,'From the American South, where this is cooked in hours rather than minutes.'),
((SELECT id FROM dishes WHERE slug='pulled-pork-sandwich'),2,'The Carolinas have cooked whole hogs over coals since the colonial era, at community gatherings that fed entire towns at once.'),
((SELECT id FROM dishes WHERE slug='pulled-pork-sandwich'),3,'It reliably starts an argument about sauce: vinegar in the east, mustard in the middle of South Carolina, sweet tomato further west.'),
((SELECT id FROM dishes WHERE slug='pulled-pork-sandwich'),4,'A pork shoulder is rubbed with paprika and brown sugar and smoked low and slow until it shreds by hand, then piled on a soft roll under a tangle of vinegar slaw.'),
((SELECT id FROM dishes WHERE slug='pulled-pork-sandwich'),5,'Smoked, hand-shredded pork heaped on a soft bun and crowned with coleslaw.');
