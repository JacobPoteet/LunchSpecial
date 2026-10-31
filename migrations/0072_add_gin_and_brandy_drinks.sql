-- Stocking the bar, part 1 of 5 (#278): the gin shelf, the brandy shelf
-- and two coffees. Recognisable to a US player first.
--
-- Pool only. No `INSERT INTO drink_schedule` rows; nights are booked in
-- /admin and an unbooked night runs on the fallback pour.
--
-- Keyed by slug throughout, never by id. Three coasters each, checked by
-- worker/data-integrity.test.ts.

INSERT INTO drinks (name, slug, country, region, spirit, temperature, profile, is_alcoholic, ingredients) VALUES
('Gimlet','gimlet','United Kingdom','europe','gin','cold','sour',1,'["gin","lime","sugar","ice"]'),
('Bee''s Knees','bees-knees','United States','north-america','gin','cold','sour',1,'["gin","lemon","honey","ice"]'),
('Aviation','aviation','United States','north-america','gin','cold','sour',1,'["gin","maraschino liqueur","creme de violette","lemon","cherry"]'),
('Last Word','last-word','United States','north-america','gin','cold','sour',1,'["gin","chartreuse","maraschino liqueur","lime","ice"]'),
('Ramos Gin Fizz','ramos-gin-fizz','United States','north-america','gin','cold','creamy',1,'["gin","cream","egg white","lemon","lime","orange flower water","soda water","sugar"]'),
('Gin Rickey','gin-rickey','United States','north-america','gin','cold','sour',1,'["gin","lime","soda water","ice"]'),
('Corpse Reviver No. 2','corpse-reviver-no-2','United Kingdom','europe','gin','cold','sour',1,'["gin","orange liqueur","lillet","lemon","absinthe"]'),
('Brandy Alexander','brandy-alexander','United States','north-america','brandy','cold','creamy',1,'["cognac","creme de cacao","cream","nutmeg"]'),
('Stinger','stinger','United States','north-america','brandy','cold','strong',1,'["brandy","creme de menthe","ice"]'),
('Brandy Old Fashioned','brandy-old-fashioned','United States','north-america','brandy','cold','sweet',1,'["brandy","sugar","bitters","orange","cherry","lemon-lime soda"]'),
('Espresso','espresso','Italy','europe','none','hot','bitter',0,'["coffee","water","sugar"]'),
('Café au Lait','cafe-au-lait','France','europe','none','hot','creamy',0,'["coffee","milk","chicory","sugar"]');

INSERT INTO drink_clues (drink_id, order_index, text) VALUES
((SELECT id FROM drinks WHERE slug='gimlet'), 1, 'No ice, a stemmed glass, one wheel of lime and a faint green cast.'),
((SELECT id FROM drinks WHERE slug='gimlet'), 2, 'Navy legend credits a surgeon who cut the crew''s anti-scurvy lime ration with gin, though his obituaries never say so.'),
((SELECT id FROM drinks WHERE slug='gimlet'), 3, 'Half gin, half sweet lime cordial in Chandler''s telling, a British sour served chilled and up.'),
((SELECT id FROM drinks WHERE slug='bees-knees'), 1, 'A speakeasy order, built to hide the taste of rough bootleg spirit.'),
((SELECT id FROM drinks WHERE slug='bees-knees'), 2, 'Some credit Frank Meier of the Paris Ritz, and a 1929 paper credited Molly Brown. You shake gin with lemon and honey syrup.'),
((SELECT id FROM drinks WHERE slug='bees-knees'), 3, 'Cloudy gold in a chilled coupe with a strip of peel, an American sour sweetened from the hive.'),
((SELECT id FROM drinks WHERE slug='aviation'), 1, 'Pale lilac in a coupe, the colour a dusk sky goes before dark.'),
((SELECT id FROM drinks WHERE slug='aviation'), 2, 'Hugo Ensslin of a New York hotel bar printed it in 1916: gin, lemon, maraschino and a violet liqueur later books dropped.'),
((SELECT id FROM drinks WHERE slug='aviation'), 3, 'Grey-blue and sharp with a cherry sunk in the bowl, an American sour from before Prohibition.'),
((SELECT id FROM drinks WHERE slug='last-word'), 1, 'Four pours of the same measure, shaken and strained.'),
((SELECT id FROM drinks WHERE slug='last-word'), 2, 'A Detroit athletic club served it before Prohibition and a Seattle barman revived it: gin, Chartreuse, maraschino and lime.'),
((SELECT id FROM drinks WHERE slug='last-word'), 3, 'Herbal, sharp and pale green in a chilled coupe, an American club drink back from obscurity.'),
((SELECT id FROM drinks WHERE slug='ramos-gin-fizz'), 1, 'A drink that once kept a relay of bartenders shaking in turn.'),
((SELECT id FROM drinks WHERE slug='ramos-gin-fizz'), 2, 'A New Orleans saloon keeper created it in 1888 from gin, cream, egg white, lemon, lime, orange flower water and a soda top.'),
((SELECT id FROM drinks WHERE slug='ramos-gin-fizz'), 3, 'White as meringue and standing above the rim of a tall glass, an American drink Huey Long loved.'),
((SELECT id FROM drinks WHERE slug='gin-rickey'), 1, 'Half a lime squeezed and dropped into the glass, shell and all.'),
((SELECT id FROM drinks WHERE slug='gin-rickey'), 2, 'A bartender at Shoomaker''s saloon in Washington, DC, first made it with bourbon, and gin took it over ten years later.'),
((SELECT id FROM drinks WHERE slug='gin-rickey'), 3, 'Gin and soda water in a highball with no sugar at all, the American capital''s own cooler.'),
((SELECT id FROM drinks WHERE slug='corpse-reviver-no-2'), 1, 'A morning-after order meant to be drunk before eleven.'),
((SELECT id FROM drinks WHERE slug='corpse-reviver-no-2'), 2, 'Harry Craddock''s Savoy book warned that four in quick succession undo it. Equal gin, lemon, orange liqueur and Lillet.'),
((SELECT id FROM drinks WHERE slug='corpse-reviver-no-2'), 3, 'Pale gold in a coupe rinsed with absinthe, the British hotel bar''s cure for the night before.'),
((SELECT id FROM drinks WHERE slug='brandy-alexander'), 1, 'Ordered instead of dessert, and it arrives in a stemmed glass.'),
((SELECT id FROM drinks WHERE slug='brandy-alexander'), 2, 'Claimants run from a bartender at Rector''s in New York to a London royal wedding. You shake cognac, crème de cacao and cream.'),
((SELECT id FROM drinks WHERE slug='brandy-alexander'), 3, 'Beige and velvety under grated nutmeg, the American cream cocktail that began life with gin in it.'),
((SELECT id FROM drinks WHERE slug='stinger'), 1, 'The society nightcap of old Hollywood films, ordered and kept coming.'),
((SELECT id FROM drinks WHERE slug='stinger'), 2, 'New York society drank it as a digestif before anyone called it a cocktail: three parts brandy, one white crème de menthe.'),
((SELECT id FROM drinks WHERE slug='stinger'), 3, 'Amber with a cool mint bite, over crushed ice since Prohibition ended, an American two-bottle drink.'),
((SELECT id FROM drinks WHERE slug='brandy-old-fashioned'), 1, 'The bartender asks one question first: sweet or sour?'),
((SELECT id FROM drinks WHERE slug='brandy-old-fashioned'), 2, 'Wisconsin bars swap whiskey for brandy, a habit one story pins to the 1893 Chicago fair and another to post-war shortages.'),
((SELECT id FROM drinks WHERE slug='brandy-old-fashioned'), 3, 'Muddled orange and cherry under lemon-lime or grapefruit soda, Wisconsin''s American state cocktail.'),
((SELECT id FROM drinks WHERE slug='espresso'), 1, 'Ordered at the counter and gone in a couple of swallows.'),
((SELECT id FROM drinks WHERE slug='espresso'), 2, 'Achille Gaggia''s lever machine forced water through packed grounds at high pressure and raised a foam sold as crema.'),
((SELECT id FROM drinks WHERE slug='espresso'), 3, 'Barely two sips of near-black under a hazel skin, served in a thick-walled cup at an Italian bar.'),
((SELECT id FROM drinks WHERE slug='cafe-au-lait'), 1, 'A breakfast bowl you drink from with two hands, no handle on it.'),
((SELECT id FROM drinks WHERE slug='cafe-au-lait'), 2, 'Union blockades of New Orleans in the Civil War made locals stretch coffee with chicory, and scalded milk went in to match.'),
((SELECT id FROM drinks WHERE slug='cafe-au-lait'), 3, 'Coffee lightened with milk on a French morning table, or a chicory cup beside sugared beignets.');
