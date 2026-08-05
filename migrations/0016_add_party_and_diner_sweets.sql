-- Additive migration: 4 dishes (Australian party food + American sweets/breakfast)
-- Pool only, no schedule rows. INSERTs only, dish keyed by slug; safe to run once on the live DB.

INSERT INTO dishes (name, slug, country, region, course, temperature, protein, ingredients) VALUES
('Fairy Bread','fairy-bread','Australia','oceania','dessert','cold','vegetarian','["bread","butter","sprinkles"]'),
('German Chocolate Cake','german-chocolate-cake','United States','north-america','dessert','cold','vegetarian','["chocolate","flour","sugar","egg","buttermilk","coconut","pecan","evaporated milk"]'),
('Funnel Cake','funnel-cake','United States','north-america','dessert','hot','vegetarian','["flour","egg","milk","sugar","baking powder","vanilla","powdered sugar"]'),
('Scrambled Eggs','scrambled-eggs','United States','north-america','breakfast','hot','vegetarian','["egg","butter","milk","salt","black pepper"]');

INSERT INTO clues (dish_id, order_index, text) VALUES
((SELECT id FROM dishes WHERE slug='fairy-bread'),1,'A children''s party staple from the southern-hemisphere country that is also a continent.'),
((SELECT id FROM dishes WHERE slug='fairy-bread'),2,'The name is thought to come from a Robert Louis Stevenson poem printed in 1885; the food itself turns up in Australian newspapers by the 1920s.'),
((SELECT id FROM dishes WHERE slug='fairy-bread'),3,'No Australian kid''s birthday party is considered properly catered without a platter of it, and there is a national day for it in late November.'),
((SELECT id FROM dishes WHERE slug='fairy-bread'),4,'Soft white sandwich bread is buttered right to the crusts, showered with tiny round sugar beads known locally as hundreds and thousands, then cut into triangles.'),
((SELECT id FROM dishes WHERE slug='fairy-bread'),5,'Buttered white bread covered edge to edge in hundreds and thousands and cut into triangles — the birthday-party plate of Australia.'),
((SELECT id FROM dishes WHERE slug='german-chocolate-cake'),1,'A rich layer cake from North America, despite a name that has sent people looking to Europe for a century.'),
((SELECT id FROM dishes WHERE slug='german-chocolate-cake'),2,'It is named for Samuel German, an English-American who developed a dark baking bar for Baker''s in 1852; a Texas homemaker''s 1957 recipe ran in a Dallas newspaper and the possessive apostrophe quietly fell off.'),
((SELECT id FROM dishes WHERE slug='german-chocolate-cake'),3,'That newspaper printing sent the recipe nationwide and sales of the chocolate bar jumped several hundred percent — and it has been fuelling "it is not actually from over there" trivia ever since.'),
((SELECT id FROM dishes WHERE slug='german-chocolate-cake'),4,'The cake layers are mild sweet chocolate, but what defines it is the frosting: egg yolks and evaporated milk cooked into a custard, then stirred full of toasted pecans and shredded coconut and spread between the layers rather than over the sides.'),
((SELECT id FROM dishes WHERE slug='german-chocolate-cake'),5,'A mild chocolate layer cake finished with a cooked custard frosting of coconut and pecan — named after a man, not a country.'),
((SELECT id FROM dishes WHERE slug='funnel-cake'),1,'A fried sweet you buy from a stand at an American state fair.'),
((SELECT id FROM dishes WHERE slug='funnel-cake'),2,'Pennsylvania Dutch settlers brought the poured-batter method over from German-speaking Europe, though medieval Persian and Arab cooks were frying similar drizzled batters far earlier.'),
((SELECT id FROM dishes WHERE slug='funnel-cake'),3,'It is the smell of a summer carnival midway or a boardwalk in July, sold from a trailer window alongside the corn dogs.'),
((SELECT id FROM dishes WHERE slug='funnel-cake'),4,'Thin batter is drizzled in overlapping loops straight into hot oil — traditionally poured through a narrow spout — then fried crisp and buried in powdered sugar.'),
((SELECT id FROM dishes WHERE slug='funnel-cake'),5,'A crisp lacy tangle of batter poured in loops through a cone-shaped spout into hot oil and snowed under with powdered sugar at the fair.'),
((SELECT id FROM dishes WHERE slug='scrambled-eggs'),1,'The most-cooked breakfast in the United States, and in a great many other countries besides.'),
((SELECT id FROM dishes WHERE slug='scrambled-eggs'),2,'The Romans beat and cooked eggs much this way; the French later codified the slow version, with Escoffier insisting on gentle heat and a great deal of butter.'),
((SELECT id FROM dishes WHERE slug='scrambled-eggs'),3,'It is the classic test a chef gives a line cook at a job trial, and Gordon Ramsay''s soft, creamy take is one of the most-watched cooking clips on the internet.'),
((SELECT id FROM dishes WHERE slug='scrambled-eggs'),4,'Eggs are beaten with a splash of milk, poured into melted butter over low heat, and pushed slowly around the pan so they set in soft folds — then pulled off before they look done.'),
((SELECT id FROM dishes WHERE slug='scrambled-eggs'),5,'Beaten eggs stirred gently in butter over low heat until they set into soft curds, seasoned with salt and pepper.');
