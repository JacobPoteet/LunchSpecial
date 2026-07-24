-- Additive migration: 1 dish (Soufflé) — pool only, no schedule rows.
-- INSERTs only, keyed by slug; safe to run once on the live DB.
-- (Enchiladas already exists in the catalog; only Soufflé is new.)

INSERT INTO dishes (name, slug, country, region, course, temperature, protein, ingredients) VALUES
('Soufflé','souffle','France','europe','dessert','hot','vegetarian','["egg","chocolate","butter","sugar","milk"]');

INSERT INTO clues (dish_id, order_index, text) VALUES
((SELECT id FROM dishes WHERE slug='souffle'),1,'A delicate baked dish from a country in Western Europe famed for its cuisine.'),
((SELECT id FROM dishes WHERE slug='souffle'),2,'It rose to fame in early 19th-century French kitchens; its name comes from the French for "to puff up."'),
((SELECT id FROM dishes WHERE slug='souffle'),3,'Its habit of collapsing if the oven opens too soon makes it a nerve-wracking test for cooks and a classic sitcom disaster.'),
((SELECT id FROM dishes WHERE slug='souffle'),4,'Whipped egg whites are folded into a base and baked so it towers above the ramekin — here, flavored with chocolate.'),
((SELECT id FROM dishes WHERE slug='souffle'),5,'A light, airy baked dessert that puffs high in a ramekin and must be served the moment it leaves the oven.');
