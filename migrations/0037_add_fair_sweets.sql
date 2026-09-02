-- Fair-sweet batch: decoys for Funnel Cake, so the country tile stops being a
-- free discriminator on an American fairground dessert. Corn Dog (240) already
-- covers the stick-food end and is untouched.

INSERT INTO dishes (name, slug, country, region, course, temperature, protein, ingredients) VALUES
('Deep-Fried Oreo','deep-fried-oreo','United States','north-america','dessert','hot','vegetarian','["chocolate","flour","egg","milk","sugar","powdered sugar","baking powder"]'),
('Elephant Ear','elephant-ear','United States','north-america','dessert','hot','vegetarian','["flour","yeast","butter","sugar","cinnamon","milk"]'),
('Cotton Candy','cotton-candy','United States','north-america','dessert','cold','vegetarian','["sugar","food coloring","vanilla"]'),
('Fried Ice Cream','fried-ice-cream','Mexico','latin-america','dessert','cold','vegetarian','["ice cream","cornflakes","cinnamon","egg","honey","sugar"]'),
('Caramel Apple','caramel-apple','United States','north-america','dessert','cold','vegetarian','["apple","caramel","sugar","butter","cream","peanuts"]');

INSERT INTO clues (dish_id, order_index, text) VALUES
((SELECT id FROM dishes WHERE slug='deep-fried-oreo'), 1, 'A battered sweet sold at American fairgrounds.'),
((SELECT id FROM dishes WHERE slug='deep-fried-oreo'), 2, 'Fair vendors in California and Texas both claim they battered the first one.'),
((SELECT id FROM dishes WHERE slug='deep-fried-oreo'), 3, 'You bite through the batter and find the cookie has gone soft, closer to warm cake than to a snap.'),
((SELECT id FROM dishes WHERE slug='deep-fried-oreo'), 4, 'The cook drops a chocolate sandwich cookie into pancake batter, fries it, and buries it in powdered sugar.'),
((SELECT id FROM dishes WHERE slug='deep-fried-oreo'), 5, 'America''s fairground cookie under a golden shell, three to a stick and dusted white.'),
((SELECT id FROM dishes WHERE slug='elephant-ear'), 1, 'A flat fried pastry from the American Midwest.'),
((SELECT id FROM dishes WHERE slug='elephant-ear'), 2, 'Fried flat dough is older than any fairground, and Midwestern vendors are the ones who put a price on it.'),
((SELECT id FROM dishes WHERE slug='elephant-ear'), 3, 'Vendors named it after an animal, and cross into Canada and the animal changes.'),
((SELECT id FROM dishes WHERE slug='elephant-ear'), 4, 'You stretch a ball of yeasted dough thin with your hands, drop it flat into hot oil, and shake cinnamon sugar over it.'),
((SELECT id FROM dishes WHERE slug='elephant-ear'), 5, 'America''s plate-sized fried sheet, chewy under a heavy dust of cinnamon sugar.'),
((SELECT id FROM dishes WHERE slug='cotton-candy'), 1, 'A spun sugar sweet sold at American fairs.'),
((SELECT id FROM dishes WHERE slug='cotton-candy'), 2, 'A dentist and a confectioner patented the machine together in 1897 and sold it at the 1904 world''s fair.'),
((SELECT id FROM dishes WHERE slug='cotton-candy'), 3, 'You get mostly air for your money, and it disappears the moment it touches your tongue.'),
((SELECT id FROM dishes WHERE slug='cotton-candy'), 4, 'The cook spins molten sugar through a drum full of pinholes and winds the dyed threads onto a paper cone.'),
((SELECT id FROM dishes WHERE slug='cotton-candy'), 5, 'America''s pink cloud on a paper cone, bigger than your head and gone in three bites.'),
((SELECT id FROM dishes WHERE slug='fried-ice-cream'), 1, 'A fried dessert from Latin America.'),
((SELECT id FROM dishes WHERE slug='fried-ice-cream'), 2, 'Chicago and Philadelphia both claimed it at their world''s fairs, and neither city is where you find it now.'),
((SELECT id FROM dishes WHERE slug='fried-ice-cream'), 3, 'The crust leaves the fryer hot while the middle stays frozen, and the cook has seconds to get it out.'),
((SELECT id FROM dishes WHERE slug='fried-ice-cream'), 4, 'You roll a frozen scoop in egg and crushed cornflakes, lower it into hot oil for seconds, and shake cinnamon over it.'),
((SELECT id FROM dishes WHERE slug='fried-ice-cream'), 5, 'Mexico''s cold scoop in a crunchy shell, drizzled with honey under a cap of whipped cream.'),
((SELECT id FROM dishes WHERE slug='caramel-apple'), 1, 'A coated fruit on a stick from North America.'),
((SELECT id FROM dishes WHERE slug='caramel-apple'), 2, 'A Kraft sales rep melted leftover Halloween sweets in the 1950s and dunked whole orchard fruit in the pot.'),
((SELECT id FROM dishes WHERE slug='caramel-apple'), 3, 'People mix it up with the red glassy one, which is a different dip and sets hard enough to crack a tooth.'),
((SELECT id FROM dishes WHERE slug='caramel-apple'), 4, 'You push a stick into the top, dunk it in melted sugar, butter and cream, then roll it in chopped peanuts.'),
((SELECT id FROM dishes WHERE slug='caramel-apple'), 5, 'America''s fall fairground stick treat, a chewy brown coat over cold fruit, cut into wedges.');
