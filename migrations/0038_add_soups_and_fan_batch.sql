-- Three soups so the Minestrone board has somewhere to go: Pasta e Fagioli is a
-- country HIT with six shared ingredients, and the two American soups are honest
-- country misses. Plus five dishes from the player suggestion form, credited at
-- the bottom. Halo-Halo was also suggested but is already dish 303, so it gets no
-- row and no retroactive credit.

INSERT INTO dishes (name, slug, country, region, course, temperature, protein, ingredients) VALUES
('Pasta e Fagioli','pasta-e-fagioli','Italy','europe','appetizer','hot','vegetarian','["pasta","white bean","tomato","onion","carrot","celery","garlic","olive oil"]'),
('Italian Wedding Soup','italian-wedding-soup','United States','north-america','appetizer','hot','pork','["pork","beef","chicken broth","spinach","pasta","parmesan","onion"]'),
('Tomato Tortellini Soup','tomato-tortellini-soup','United States','north-america','appetizer','hot','vegetarian','["pasta","tomato","cream","spinach","garlic","basil","parmesan"]'),
('Boat Noodles','boat-noodles','Thailand','southeast-asia','entree','hot','beef','["noodles","beef","bean sprouts","fish sauce","basil","star anise","chili","garlic"]'),
('Fuqi Feipian','fuqi-feipian','China','east-asia','appetizer','cold','beef','["beef","tripe","chili","sichuan peppercorn","soy sauce","peanuts","cilantro","sesame oil"]'),
('Baked Alaska','baked-alaska','United States','north-america','dessert','cold','vegetarian','["ice cream","egg","sugar","sponge cake","vanilla"]'),
('Carrot Cake','carrot-cake','United Kingdom','europe','dessert','cold','vegetarian','["carrot","flour","sugar","egg","cream cheese","cinnamon","walnuts"]'),
('Palabok','palabok','Philippines','southeast-asia','entree','hot','seafood','["noodles","shrimp","pork","egg","garlic","annatto","fish sauce","scallion"]');

INSERT INTO clues (dish_id, order_index, text) VALUES
((SELECT id FROM dishes WHERE slug='pasta-e-fagioli'), 1, 'A bean and pasta soup from southern Europe.'),
((SELECT id FROM dishes WHERE slug='pasta-e-fagioli'), 2, 'Poor households cooked it because dried beans cost less than meat and kept all winter in a sack.'),
((SELECT id FROM dishes WHERE slug='pasta-e-fagioli'), 3, 'Dean Martin rhymed it with drool in a 1953 hit, using the Neapolitan pronunciation.'),
((SELECT id FROM dishes WHERE slug='pasta-e-fagioli'), 4, 'You simmer white beans with tomato, onion, carrot and celery, then snap dried pasta into the pot by hand.'),
((SELECT id FROM dishes WHERE slug='pasta-e-fagioli'), 5, 'Italy''s cloudy bean broth, thick with short tubes and finished with raw green oil.'),
((SELECT id FROM dishes WHERE slug='italian-wedding-soup'), 1, 'A meatball soup from the American Northeast.'),
((SELECT id FROM dishes WHERE slug='italian-wedding-soup'), 2, 'Immigrants from Naples carried the pot over, and church-hall kitchens have ladled it out ever since.'),
((SELECT id FROM dishes WHERE slug='italian-wedding-soup'), 3, 'Cooks roll the meatballs down to the size of marbles, since a full-size one would swamp the spoon.'),
((SELECT id FROM dishes WHERE slug='italian-wedding-soup'), 4, 'You drop pork and beef balls into chicken broth, then add spinach and pasta the size of grains.'),
((SELECT id FROM dishes WHERE slug='italian-wedding-soup'), 5, 'America''s church-supper bowl, greens and meat married in clear broth under grated cheese.'),
((SELECT id FROM dishes WHERE slug='tomato-tortellini-soup'), 1, 'A creamy red first course from North America.'),
((SELECT id FROM dishes WHERE slug='tomato-tortellini-soup'), 2, 'Filled pasta reached American supermarket fridges in the 1980s, and home cooks dropped it straight into the pot.'),
((SELECT id FROM dishes WHERE slug='tomato-tortellini-soup'), 3, 'You get cheese twice, sealed inside the pasta rings and grated over the bowl on top.'),
((SELECT id FROM dishes WHERE slug='tomato-tortellini-soup'), 4, 'The cook simmers crushed tomato with garlic and basil, stirs in cream, then drops the rings in for three minutes.'),
((SELECT id FROM dishes WHERE slug='tomato-tortellini-soup'), 5, 'America''s weeknight bowl, orange-pink and thick, with spinach wilted through it.'),
((SELECT id FROM dishes WHERE slug='boat-noodles'), 1, 'A bowl of noodles in dark broth from Southeast Asia.'),
((SELECT id FROM dishes WHERE slug='boat-noodles'), 2, 'Canal vendors in Ayutthaya sold it over the side of the hull, one ladle at a time to passing customers.'),
((SELECT id FROM dishes WHERE slug='boat-noodles'), 3, 'Vendors stir blood into the broth at the end, which is what turns it almost black.'),
((SELECT id FROM dishes WHERE slug='boat-noodles'), 4, 'The cook lays beef over noodles, ladles the star-anise broth on, then piles sprouts and basil on top.'),
((SELECT id FROM dishes WHERE slug='boat-noodles'), 5, 'Thailand''s near-black bowl, small enough that eaters stack ten empties beside them.'),
((SELECT id FROM dishes WHERE slug='fuqi-feipian'), 1, 'A cold sliced beef plate from East Asia.'),
((SELECT id FROM dishes WHERE slug='fuqi-feipian'), 2, 'A married couple in Chengdu sold it from a cart in the 1930s, cheaper than the stalls around them.'),
((SELECT id FROM dishes WHERE slug='fuqi-feipian'), 3, 'Cooks build it from what the butcher could not sell, the tripe and tongue and heart.'),
((SELECT id FROM dishes WHERE slug='fuqi-feipian'), 4, 'The cook slices the cold braised meat thin, then floods the plate with chili oil, ground peanuts and cilantro.'),
((SELECT id FROM dishes WHERE slug='fuqi-feipian'), 5, 'China''s cold Sichuan plate, glossy red with oil, named for a husband and wife who are not in it.'),
((SELECT id FROM dishes WHERE slug='baked-alaska'), 1, 'A showpiece dessert from North America.'),
((SELECT id FROM dishes WHERE slug='baked-alaska'), 2, 'A physicist showed in 1804 that beaten egg white blocks heat, and pastry chefs put the finding to work.'),
((SELECT id FROM dishes WHERE slug='baked-alaska'), 3, 'You send it into a hot oven and pull the middle out still frozen, which is the entire trick.'),
((SELECT id FROM dishes WHERE slug='baked-alaska'), 4, 'The cook stacks ice cream on a sponge base and seals the whole dome under whipped egg white and sugar.'),
((SELECT id FROM dishes WHERE slug='baked-alaska'), 5, 'America''s scorched white peaks, cut open at the table to show the cold middle.'),
((SELECT id FROM dishes WHERE slug='carrot-cake'), 1, 'A spiced vegetable dessert from northwestern Europe.'),
((SELECT id FROM dishes WHERE slug='carrot-cake'), 2, 'Medieval cooks sweetened puddings with carrot, since sugar cost more than most kitchens could afford.'),
((SELECT id FROM dishes WHERE slug='carrot-cake'), 3, 'Bakers ice it with soft cheese instead of buttercream, and the tang is the reason it works.'),
((SELECT id FROM dishes WHERE slug='carrot-cake'), 4, 'You fold grated carrot into a batter loose with oil, then stir in cinnamon and chopped walnuts.'),
((SELECT id FROM dishes WHERE slug='carrot-cake'), 5, 'Britain''s orange-flecked sponge under a thick white layer, walnut halves set round the rim.'),
((SELECT id FROM dishes WHERE slug='palabok'), 1, 'A saucy tangle of noodles from Southeast Asia.'),
((SELECT id FROM dishes WHERE slug='palabok'), 2, 'Chinese traders brought noodles to the islands, and cooks there thickened the sauce and dyed it orange.'),
((SELECT id FROM dishes WHERE slug='palabok'), 3, 'Cooks crush fried pork skin over the top, so the last thing you taste is crunch and not sauce.'),
((SELECT id FROM dishes WHERE slug='palabok'), 4, 'The cook pours a thick annatto gravy over rice noodles, then loads on shrimp, sliced egg and smoked fish.'),
((SELECT id FROM dishes WHERE slug='palabok'), 5, 'The Filipino party platter, a shallow tray of noodles under egg wedges and a squeeze of citrus.');

UPDATE dishes SET is_fan_submission = 1
 WHERE slug IN ('boat-noodles', 'fuqi-feipian', 'baked-alaska', 'carrot-cake', 'palabok');
