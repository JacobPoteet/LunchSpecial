-- Two dishes from the player suggestion form, plus credits on two that were
-- already on the menu.
--
-- Haggis came in through this batch but has been dish 167 since migration 0002,
-- so it takes the credit and no row. The stamp follows the suggestion, not the
-- INSERT: a player who asks for a dish that turns out to already be there
-- suggested it just the same. Migration 0036 did this for three dishes that
-- were in the catalogue from the start.
--
-- Halo-Halo is the same case from an earlier batch. Migration 0038 refused it
-- the credit and that was the wrong call, so it is backported here. There is a
-- drink by that name too; this UPDATE is on dishes and cannot reach it.

INSERT INTO dishes (name, slug, country, region, course, temperature, protein, ingredients) VALUES
('Zurek','zurek','Poland','europe','appetizer','hot','pork','["rye flour","sausage","egg","potato","marjoram","garlic","sour cream"]'),
('Blooming Onion','blooming-onion','United States','north-america','appetizer','hot','vegetarian','["onion","flour","buttermilk","paprika","cayenne pepper","mayonnaise","horseradish"]');

INSERT INTO clues (dish_id, order_index, text) VALUES
((SELECT id FROM dishes WHERE slug='zurek'), 1, 'A pale sour soup from central Europe.'),
((SELECT id FROM dishes WHERE slug='zurek'), 2, 'Peasant households soured rye flour in a crock because it cost nothing, and ate the soup right through Lent.'),
((SELECT id FROM dishes WHERE slug='zurek'), 3, 'Some villages bury a pot of it on Holy Saturday, a mock funeral for forty days of Lent.'),
((SELECT id FROM dishes WHERE slug='zurek'), 4, 'You stir the soured rye starter into stock with marjoram and garlic, then drop in sausage and half a boiled egg.'),
((SELECT id FROM dishes WHERE slug='zurek'), 5, 'Poland''s cloudy white bowl, sometimes served in a round loaf with its top sliced off.'),
((SELECT id FROM dishes WHERE slug='blooming-onion'), 1, 'A fried starter meant for sharing, from the American South.'),
((SELECT id FROM dishes WHERE slug='blooming-onion'), 2, 'A Tampa chain put it on the opening menu in 1988 and dressed its dining rooms up as Australian.'),
((SELECT id FROM dishes WHERE slug='blooming-onion'), 3, 'One vegetable feeds a whole table, and diners tear it apart with their fingers rather than a fork.'),
((SELECT id FROM dishes WHERE slug='blooming-onion'), 4, 'You soak the cut onion in buttermilk, dredge it in flour spiked with paprika and cayenne, and fry it whole.'),
((SELECT id FROM dishes WHERE slug='blooming-onion'), 5, 'America''s steakhouse starter, a fried bulb splayed open into petals around a cup of dipping sauce.');

UPDATE dishes SET is_fan_submission = 1
 WHERE slug IN ('zurek', 'blooming-onion', 'haggis', 'halo-halo');
