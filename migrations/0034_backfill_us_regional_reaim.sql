-- The beat-sheet rewrite for seven US regional dishes, re-aimed at the slugs
-- prod actually has.
--
-- These dishes were renamed in /admin between 2026-08-05 and 2026-08-23
-- ("Kansas City BBQ Ribs" -> "BBQ Ribs"), which regenerated their slugs. The
-- backfill in 0027-0032 ran on 2026-08-25 keyed on the old long slugs, matched
-- no rows, and prod has been serving the pre-beat-sheet text for all seven
-- since. seed.sql now carries the short names, so this re-applies the rewrite
-- where it can land.
--
-- UPDATEs, not INSERTs: these rows already exist. 35 clues across 7 dishes.

UPDATE clues SET text = 'A breakfast plate from the American Northeast.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'bagel-with-lox') AND order_index = 1;
UPDATE clues SET text = 'Jewish immigrant bakers brought this cured-salmon-and-bread pairing to that city''s delicatessens generations ago.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'bagel-with-lox') AND order_index = 2;
UPDATE clues SET text = 'The shops that sell it are licensed as appetizing stores, a category of their own.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'bagel-with-lox') AND order_index = 3;
UPDATE clues SET text = 'A boiled-then-baked bread ring is split and spread with cream cheese, then topped with cured salmon.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'bagel-with-lox') AND order_index = 4;
UPDATE clues SET text = 'America''s chewy boiled ring, orange fish draped over a white smear.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'bagel-with-lox') AND order_index = 5;
UPDATE clues SET text = 'A barbecue style from a Midwestern town split across a state line.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'bbq-ribs') AND order_index = 1;
UPDATE clues SET text = 'Its smokehouses built their fame on a thick, sweet tomato-and-molasses sauce.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'bbq-ribs') AND order_index = 2;
UPDATE clues SET text = 'Its barbecue competitions and sauce are considered one of America''s defining regional styles.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'bbq-ribs') AND order_index = 3;
UPDATE clues SET text = 'Pork bones smoke for hours, then take a sweet, sticky tomato glaze.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'bbq-ribs') AND order_index = 4;
UPDATE clues SET text = 'America''s sticky glazed bones, dark red and pulling clean away.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'bbq-ribs') AND order_index = 5;
UPDATE clues SET text = 'Smoked meat from the American Southwest.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'beef-brisket') AND order_index = 1;
UPDATE clues SET text = 'German and Czech immigrant butchers in that state''s hill country began smoking this tough cut low and slow.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'beef-brisket') AND order_index = 2;
UPDATE clues SET text = 'Its bark-crusted slices are judged by pitmasters on how cleanly they pull apart with just a little tug.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'beef-brisket') AND order_index = 3;
UPDATE clues SET text = 'A tough beef cut rubbed with pepper and salt smokes for hours until fork-tender with a dark crust.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'beef-brisket') AND order_index = 4;
UPDATE clues SET text = 'America''s dark-crusted smoked slab, sliced against the grain.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'beef-brisket') AND order_index = 5;
UPDATE clues SET text = 'A starter from a mid-Atlantic American state famous for its bay.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'crab-cakes') AND order_index = 1;
UPDATE clues SET text = 'Watermen along that state''s bay have pan-fried lump patties for generations.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'crab-cakes') AND order_index = 2;
UPDATE clues SET text = 'Purists judge one by how little filler it uses, letting the meat show.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'crab-cakes') AND order_index = 3;
UPDATE clues SET text = 'Lump shellfish meat is bound lightly with egg and breadcrumbs, then pan-fried golden.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'crab-cakes') AND order_index = 4;
UPDATE clues SET text = 'America''s Chesapeake patty, lump meat barely held together.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'crab-cakes') AND order_index = 5;
UPDATE clues SET text = 'A deep-panned bake from a windy Midwestern American city.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'deep-dish-pizza') AND order_index = 1;
UPDATE clues SET text = 'A downtown restaurant near that city''s river baked it in a buttery pan in 1943.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'deep-dish-pizza') AND order_index = 2;
UPDATE clues SET text = 'Its inches-thick crust makes tourists wait an hour just for one pie to bake.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'deep-dish-pizza') AND order_index = 3;
UPDATE clues SET text = 'Buttery crust lines a deep pan, then gets layered with cheese first and chunky tomato sauce on top.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'deep-dish-pizza') AND order_index = 4;
UPDATE clues SET text = 'America''s deep-panned slice, standing two inches tall on the plate.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'deep-dish-pizza') AND order_index = 5;
UPDATE clues SET text = 'A fried chicken dish from a Southern American music city.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'hot-chicken-sandwich') AND order_index = 1;
UPDATE clues SET text = 'Legend says a jilted lover''s revenge recipe, doused in fiery spice, became that city''s signature dish.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'hot-chicken-sandwich') AND order_index = 2;
UPDATE clues SET text = 'Fans rank their order by heat level, with the hottest tier warning diners in advance.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'hot-chicken-sandwich') AND order_index = 3;
UPDATE clues SET text = 'Fried chicken is coated in a cayenne-lard paste hot enough to leave a red crust.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'hot-chicken-sandwich') AND order_index = 4;
UPDATE clues SET text = 'America''s fried bird under a red crust that stains the paper.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'hot-chicken-sandwich') AND order_index = 5;
UPDATE clues SET text = 'A baked minced-meat supper from northwestern Europe.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'shepherd-s-pie') AND order_index = 1;
UPDATE clues SET text = 'Invented to stretch Sunday-roast leftovers in frugal farm kitchens.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'shepherd-s-pie') AND order_index = 2;
UPDATE clues SET text = 'Swap the lamb for beef and the name changes, which is reliable pub-quiz gold.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'shepherd-s-pie') AND order_index = 3;
UPDATE clues SET text = 'Minced lamb and vegetables under a browned mashed-potato roof.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'shepherd-s-pie') AND order_index = 4;
UPDATE clues SET text = 'Britain''s browned potato roof over a dish of dark minced meat.'
 WHERE dish_id = (SELECT id FROM dishes WHERE slug = 'shepherd-s-pie') AND order_index = 5;
