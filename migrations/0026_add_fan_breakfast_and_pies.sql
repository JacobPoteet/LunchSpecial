-- Additive migration: 15 fan-submitted dishes — a breakfast run (yogurt
-- parfait, oatmeal, cream of wheat, frittata, cinnamon rolls), five one-offs
-- (focaccia, foie gras, spotted dick, coddle, sisig) and five pies chosen to
-- spread across course, temperature, protein and country rather than to pile
-- up another shelf of American fruit pies.
--
-- Two of the suggestions were already on the menu — Quiche Lorraine (99) and
-- Lumpia (95) — and name/slug are UNIQUE, so they get the fan flag at the
-- bottom instead of a duplicate row. Cinnamon Rolls is filed under United
-- States rather than Sweden because Kanelbulle (178) already holds the Swedish
-- cinnamon bun; this is the frosted American one, and it differs from its
-- neighbour on both the country tile and the course tile.
--
-- Pool only, no schedule rows. INSERTs only, dish keyed by slug; safe to run
-- once on the live DB.

INSERT INTO dishes (name, slug, country, region, course, temperature, protein, ingredients) VALUES
('Yogurt Parfait','yogurt-parfait','United States','north-america','breakfast','cold','vegetarian','["yogurt","granola","strawberry","honey","oats"]'),
('Oatmeal','oatmeal','United States','north-america','breakfast','hot','vegetarian','["oats","milk","brown sugar","butter","cinnamon","salt"]'),
('Cream of Wheat','cream-of-wheat','United States','north-america','breakfast','hot','vegetarian','["semolina","milk","butter","sugar","salt","cinnamon"]'),
('Frittata','frittata','Italy','europe','breakfast','hot','vegetarian','["egg","parmesan","potato","onion","zucchini","olive oil","black pepper"]'),
('Cinnamon Rolls','cinnamon-rolls','United States','north-america','breakfast','hot','vegetarian','["flour","yeast","butter","cinnamon","brown sugar","milk","cream cheese","powdered sugar"]'),
('Focaccia','focaccia','Italy','europe','appetizer','hot','vegetarian','["flour","yeast","olive oil","salt","rosemary"]'),
('Foie Gras','foie-gras','France','europe','appetizer','cold','poultry','["duck liver","salt","black pepper","butter","bread"]'),
('Spotted Dick','spotted-dick','United Kingdom','europe','dessert','hot','vegetarian','["flour","suet","currants","sugar","milk","lemon"]'),
('Coddle','coddle','Ireland','europe','entree','hot','pork','["sausage","bacon","potato","onion","parsley","black pepper"]'),
('Sisig','sisig','Philippines','southeast-asia','entree','hot','pork','["pork","onion","chili","calamansi","egg","soy sauce","black pepper"]'),
('Cherry Pie','cherry-pie','United States','north-america','dessert','hot','vegetarian','["cherry","flour","butter","sugar","cornstarch","lemon"]'),
('Pumpkin Pie','pumpkin-pie','United States','north-america','dessert','cold','vegetarian','["pumpkin","flour","butter","egg","condensed milk","cinnamon","nutmeg","ginger"]'),
('Lemon Meringue Pie','lemon-meringue-pie','United States','north-america','dessert','cold','vegetarian','["lemon","egg","sugar","flour","butter","cornstarch"]'),
('Banoffee Pie','banoffee-pie','United Kingdom','europe','dessert','cold','vegetarian','["banana","condensed milk","cream","butter","flour","chocolate"]'),
('Fish Pie','fish-pie','United Kingdom','europe','entree','hot','seafood','["cod","salmon","potato","milk","butter","parsley","peas"]');

INSERT INTO clues (dish_id, order_index, text) VALUES
((SELECT id FROM dishes WHERE slug='yogurt-parfait'),1,'North American, served cold, and it is the one virtuous-looking thing in the breakfast case.'),
((SELECT id FROM dishes WHERE slug='yogurt-parfait'),2,'The name is French and once meant a frozen dessert set in a mould; American cafeterias borrowed the word in the twentieth century for something built in layers in a tall glass instead.'),
((SELECT id FROM dishes WHERE slug='yogurt-parfait'),3,'McDonald''s put one on the breakfast menu in the 1990s, and it has been the standard healthy-choice order at every airport and hotel buffet since.'),
((SELECT id FROM dishes WHERE slug='yogurt-parfait'),4,'Thick strained cultured milk is spooned into a clear cup in alternating layers with toasted oat clusters and sliced fruit, so the stripes show through the side of the glass.'),
((SELECT id FROM dishes WHERE slug='yogurt-parfait'),5,'The tall clear cup built in stripes of thick cultured dairy, crunchy oat clusters and sliced strawberries, eaten cold with a long spoon.'),
((SELECT id FROM dishes WHERE slug='oatmeal'),1,'North American, served hot, and about the least glamorous thing anyone eats before work.'),
((SELECT id FROM dishes WHERE slug='oatmeal'),2,'Scottish and Irish households lived on a version of this for centuries, stirred with a wooden stick called a spurtle; American cereal companies put it in a round cardboard canister in the late 1800s and it has stayed there.'),
((SELECT id FROM dishes WHERE slug='oatmeal'),3,'A man in a wide-brimmed Quaker hat has smiled off that canister for over a century, and the instant packets in maple and brown sugar are a fixture of every dorm room in the country.'),
((SELECT id FROM dishes WHERE slug='oatmeal'),4,'A rolled and steamed cereal grain is simmered in milk or water until it thickens into porridge, then finished with brown sugar, a knob of butter and a shake of cinnamon.'),
((SELECT id FROM dishes WHERE slug='oatmeal'),5,'The plain hot breakfast porridge of rolled grain, served in a bowl with a spoonful of brown sugar melting into the middle.'),
((SELECT id FROM dishes WHERE slug='cream-of-wheat'),1,'North American, served hot, and it sits on the shelf directly beside the round canister of the other breakfast porridge.'),
((SELECT id FROM dishes WHERE slug='cream-of-wheat'),2,'A flour mill in Grand Forks, North Dakota was left with a milling by-product nobody wanted in 1893; the head miller cooked it into a breakfast cereal and took it to the Chicago World''s Fair, where it sold out.'),
((SELECT id FROM dishes WHERE slug='cream-of-wheat'),3,'The box has carried a smiling chef in a white toque for over a century, and generations of American children were fed it for everything from a cold morning to an upset stomach.'),
((SELECT id FROM dishes WHERE slug='cream-of-wheat'),4,'Finely milled semolina is rained into hot milk and whisked constantly until it thickens into a smooth, lump-free porridge, then eaten with butter, sugar and sometimes cinnamon.'),
((SELECT id FROM dishes WHERE slug='cream-of-wheat'),5,'The pale, silky breakfast porridge with no grain you can see in it, sold in a yellow box with a smiling chef on the front.'),
((SELECT id FROM dishes WHERE slug='frittata'),1,'From the boot-shaped country in southern Europe, served hot, and it is what that country does with eggs.'),
((SELECT id FROM dishes WHERE slug='frittata'),2,'It began as the thrifty way to use up whatever was left in the kitchen, and the name comes straight from the Italian verb for frying.'),
((SELECT id FROM dishes WHERE slug='frittata'),3,'Italian-American households treat it as the reliable Sunday dish, and it is the standard answer to half a pan of vegetables left from the night before.'),
((SELECT id FROM dishes WHERE slug='frittata'),4,'Beaten eggs are poured over vegetables already softening in a heavy pan of olive oil, cooked slowly without stirring, then finished under the broiler until set right through and cut into wedges.'),
((SELECT id FROM dishes WHERE slug='frittata'),5,'The thick, open-faced Italian egg cake full of vegetables and cheese, cooked in a skillet and served in wedges hot or at room temperature.'),
((SELECT id FROM dishes WHERE slug='cinnamon-rolls'),1,'North American in the form most people picture, served hot, and it announces itself from the far end of a shopping mall.'),
((SELECT id FROM dishes WHERE slug='cinnamon-rolls'),2,'Sweden had been baking a lighter, cardamom-scented cousin since the 1920s; American bakeries piled on the sugar and the frosting, and a chain founded in Seattle in 1985 made the outsized version famous.'),
((SELECT id FROM dishes WHERE slug='cinnamon-rolls'),3,'The smell is deliberately pumped out into the corridor to draw people in, and the cardboard tube that pops open on Christmas morning is a whole American ritual of its own.'),
((SELECT id FROM dishes WHERE slug='cinnamon-rolls'),4,'Enriched yeast dough is rolled flat, spread with butter, brown sugar and a warm brown bark spice, rolled up into a log, sliced into spirals, baked shoulder to shoulder so the sides stay soft, and finished with cream cheese frosting.'),
((SELECT id FROM dishes WHERE slug='cinnamon-rolls'),5,'The soft spiral of sweet dough under a thick cap of white frosting, pulled apart in a warm coil from the middle outward.'),
((SELECT id FROM dishes WHERE slug='focaccia'),1,'From the boot-shaped Mediterranean country, served hot, and it arrives at the table before anything else does.'),
((SELECT id FROM dishes WHERE slug='focaccia'),2,'The name descends from the Latin for hearth bread, meaning bread baked on the stones of the fire, and Liguria on the north-west coast has claimed it since Roman times.'),
((SELECT id FROM dishes WHERE slug='focaccia'),3,'Genoa eats it for breakfast dunked in coffee, it took over the sandwich shop in the 1990s, and lately people press flowers and sliced vegetables into the top to photograph it.'),
((SELECT id FROM dishes WHERE slug='focaccia'),4,'A very wet yeasted dough proves in an oiled tray and is dimpled all over with the fingertips, so the little pools hold olive oil and coarse salt, then scattered with rosemary and baked until the base crisps.'),
((SELECT id FROM dishes WHERE slug='focaccia'),5,'The thick, dimpled Italian flatbread glossy with olive oil and scattered with rosemary and coarse salt, torn into squares.'),
((SELECT id FROM dishes WHERE slug='foie-gras'),1,'From the European country that wrote most of the rules of fine dining, and it is served cold at the start of the meal.'),
((SELECT id FROM dishes WHERE slug='foie-gras'),2,'Egyptian tomb paintings show geese being fattened five thousand years ago; the practice reached Rome, then Alsace and the south-west of France, where it became the regional signature.'),
((SELECT id FROM dishes WHERE slug='foie-gras'),3,'It is the most argued-over item on any menu in the world, banned outright by some cities and written into French law in 2005 as protected national culinary heritage.'),
((SELECT id FROM dishes WHERE slug='foie-gras'),4,'The enlarged liver of a fattened duck or goose is deveined, seasoned, packed into a terrine and cooked very gently, then chilled and sliced to be eaten on toasted bread.'),
((SELECT id FROM dishes WHERE slug='foie-gras'),5,'The rich, pale, spreadable duck or goose liver terrine, sliced cold onto toast and eaten with a glass of sweet wine.'),
((SELECT id FROM dishes WHERE slug='spotted-dick'),1,'From the European island nation with the famously unadventurous reputation for food, and it is served hot.'),
((SELECT id FROM dishes WHERE slug='spotted-dick'),2,'A steamed suet pudding studded with dried fruit, in Victorian cookbooks from the 1840s; the second half of the name is thought to come from an old word for pudding, and the first from the fruit showing through.'),
((SELECT id FROM dishes WHERE slug='spotted-dick'),3,'The name causes helpless giggling wherever it is printed, and one British council renamed it on the canteen menu in 2009 and had to change it straight back after the outcry.'),
((SELECT id FROM dishes WHERE slug='spotted-dick'),4,'Flour and shredded beef suet are bound with milk and sugar, dotted through with dried currants and lemon zest, rolled in a cloth and steamed for hours until dense and light at once, then flooded with hot custard.'),
((SELECT id FROM dishes WHERE slug='spotted-dick'),5,'The hot steamed British suet pudding freckled with dried currants, served in a bowl under a pour of yellow custard.'),
((SELECT id FROM dishes WHERE slug='coddle'),1,'From the small green island in north-western Europe, served hot, and it is exactly as gentle as its name suggests.'),
((SELECT id FROM dishes WHERE slug='coddle'),2,'Dublin''s own dish, recorded from the 1700s and built to use up what was left before the Friday fast; Jonathan Swift and Seán O''Casey both put it in writing.'),
((SELECT id FROM dishes WHERE slug='coddle'),3,'It divides Dublin more sharply than anything else on a plate, and the argument is only ever about whether the sausages may be browned first, which traditionally they may not.'),
((SELECT id FROM dishes WHERE slug='coddle'),4,'Pork sausages and rashers of bacon are layered with sliced potato and onion and simmered slowly in stock until everything is pale and falling apart, with parsley stirred through at the end.'),
((SELECT id FROM dishes WHERE slug='coddle'),5,'The pale Dublin stew of whole sausages, bacon, potato and onion, simmered in stock and never once browned.'),
((SELECT id FROM dishes WHERE slug='sisig'),1,'From the South-East Asian archipelago of over seven thousand islands, served hot, and usually very late at night.'),
((SELECT id FROM dishes WHERE slug='sisig'),2,'Pampanga province claims it, and a cook named Lucia Cunanan is credited with the modern version in the 1970s, built out of the pig parts a nearby American air base was throwing away.'),
((SELECT id FROM dishes WHERE slug='sisig'),3,'Anthony Bourdain named it the dish most likely to win the world over to Filipino food, and it arrives at the table still spitting on a cast-iron plate.'),
((SELECT id FROM dishes WHERE slug='sisig'),4,'Pig''s head and ears are boiled, grilled and chopped fine, seasoned with onion, chili and the juice of a small sour citrus, then served on a sizzling metal plate with a raw egg cracked over the top and stirred through.'),
((SELECT id FROM dishes WHERE slug='sisig'),5,'The sizzling plate of finely chopped pork, sharp with chili and citrus, with an egg stirred into it at the table.'),
((SELECT id FROM dishes WHERE slug='cherry-pie'),1,'North American, served hot, and it belongs under the glass dome on a diner counter.'),
((SELECT id FROM dishes WHERE slug='cherry-pie'),2,'Colonists carried the stone-fruit trees over from Europe; orchards in Michigan and Wisconsin made the sour red variety cheap and canned, and the filling became a supermarket staple in the 1940s.'),
((SELECT id FROM dishes WHERE slug='cherry-pie'),3,'A slice of it and a cup of damn fine coffee is the standing order of an FBI agent in Twin Peaks, and young George Washington chopping down that particular fruit tree is the most famous invented story in American history.'),
((SELECT id FROM dishes WHERE slug='cherry-pie'),4,'Sour red stone fruit is thickened with sugar, cornstarch and a squeeze of lemon, poured into a butter pastry shell and covered with strips of pastry woven into a lattice so the filling bubbles up through the gaps.'),
((SELECT id FROM dishes WHERE slug='cherry-pie'),5,'The lattice-topped diner classic filled with sweet-tart red stone fruit, served warm under a melting scoop of vanilla ice cream.'),
((SELECT id FROM dishes WHERE slug='pumpkin-pie'),1,'North American, eaten cold, and it turns up on exactly one Thursday a year.'),
((SELECT id FROM dishes WHERE slug='pumpkin-pie'),2,'English colonists hollowed out the native gourd, filled it with milk and spices and baked it in the embers; by 1796 the first American cookbook had it in a pastry crust and already tied to the November holiday.'),
((SELECT id FROM dishes WHERE slug='pumpkin-pie'),3,'It is the compulsory last course of Thanksgiving dinner, and the spice blend invented for it now flavours a coffee chain''s autumn latte and roughly everything else sold between September and December.'),
((SELECT id FROM dishes WHERE slug='pumpkin-pie'),4,'The purée of a large orange autumn gourd is whisked with eggs, sweetened condensed milk, cinnamon, ginger and nutmeg, poured into a single pastry shell, baked until barely set and chilled before serving with whipped cream.'),
((SELECT id FROM dishes WHERE slug='pumpkin-pie'),5,'The chilled orange custard tart in a pastry shell, spiced with cinnamon and ginger and served under whipped cream every Thanksgiving.'),
((SELECT id FROM dishes WHERE slug='lemon-meringue-pie'),1,'North American, served cold, and the tallest thing in the bakery case.'),
((SELECT id FROM dishes WHERE slug='lemon-meringue-pie'),2,'Cooks had made sharp citrus custards and whipped egg-white toppings separately for centuries; a Philadelphia baker named Elizabeth Goodfellow is generally credited with putting the two together in the early 1800s.'),
((SELECT id FROM dishes WHERE slug='lemon-meringue-pie'),3,'It is the showpiece of every church bake sale and county fair, judged almost entirely on how high the peaks stand and whether they have wept overnight.'),
((SELECT id FROM dishes WHERE slug='lemon-meringue-pie'),4,'The juice and zest of a sharp yellow citrus are cooked with sugar, egg yolks and cornstarch into a thick curd, poured into a baked pastry shell, then crowned with whipped egg whites and sugar and browned in the oven until the peaks tip with gold.'),
((SELECT id FROM dishes WHERE slug='lemon-meringue-pie'),5,'The towering dessert of sharp yellow citrus curd in a pastry shell under a browned cloud of whipped egg white.'),
((SELECT id FROM dishes WHERE slug='banoffee-pie'),1,'From the European island nation across the Channel from France, and it is served cold.'),
((SELECT id FROM dishes WHERE slug='banoffee-pie'),2,'The Hungry Monk restaurant in Jevington, East Sussex invented and named it in 1971, adapting an American coffee dessert, and its owners spent decades correcting people who insisted it was older.'),
((SELECT id FROM dishes WHERE slug='banoffee-pie'),3,'It is the default pub dessert across Britain and Ireland, and Margaret Thatcher is said to have made one herself for a lunch at Chequers.'),
((SELECT id FROM dishes WHERE slug='banoffee-pie'),4,'A tin of sweetened condensed milk is boiled for hours until it caramelises to a thick brown paste, spread into a pastry base, layered with sliced yellow tropical fruit and covered with whipped cream and grated chocolate.'),
((SELECT id FROM dishes WHERE slug='banoffee-pie'),5,'The cold British dessert of boiled-caramel condensed milk and sliced yellow tropical fruit under a thick drift of whipped cream.'),
((SELECT id FROM dishes WHERE slug='fish-pie'),1,'From the European island nation with cold water on every side of it, and it comes out of the oven hot.'),
((SELECT id FROM dishes WHERE slug='fish-pie'),2,'A thrifty way to stretch the cheap end of the day''s catch, it became a fixture of Friday dinners and post-war school canteens, and every family cooks it slightly differently.'),
((SELECT id FROM dishes WHERE slug='fish-pie'),3,'It appears on every British comfort-food list ever printed, and on the menu of every gastropub trying to prove it takes the classics seriously.'),
((SELECT id FROM dishes WHERE slug='fish-pie'),4,'Chunks of white and smoked seafood, sometimes with prawns and peas, are folded into a thick parsley béchamel, spread in a dish, topped with mashed potato forked into ridges and baked until the peaks brown and the sauce bubbles at the edge.'),
((SELECT id FROM dishes WHERE slug='fish-pie'),5,'The British baked supper of flaked white and smoked seafood in a creamy parsley sauce under a browned mashed-potato lid.');

-- All 15 above arrived through the player suggestion form, along with two that
-- were already on the menu and so get the flag without a new row. Keyed by slug
-- so this is safe whatever ids the INSERT above happened to take. See
-- migrations/0017.
UPDATE dishes SET is_fan_submission = 1
 WHERE slug IN ('yogurt-parfait', 'oatmeal', 'cream-of-wheat', 'frittata',
                'cinnamon-rolls', 'focaccia', 'foie-gras', 'spotted-dick',
                'coddle', 'sisig', 'cherry-pie', 'pumpkin-pie',
                'lemon-meringue-pie', 'banoffee-pie', 'fish-pie',
                'quiche-lorraine', 'lumpia');
