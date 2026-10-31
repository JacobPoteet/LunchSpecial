-- Stocking the bar, part 2 of 5 (#278): the vodka shelf, two teas and
-- the slushie. Recognisable to a US player first.
--
-- Pool only. No `INSERT INTO drink_schedule` rows; nights are booked in
-- /admin and an unbooked night runs on the fallback pour.
--
-- Keyed by slug throughout, never by id. Three coasters each, checked by
-- worker/data-integrity.test.ts.

INSERT INTO drinks (name, slug, country, region, spirit, temperature, profile, is_alcoholic, ingredients) VALUES
('Screwdriver','screwdriver','United States','north-america','vodka','cold','sweet',1,'["vodka","orange","ice"]'),
('Lemon Drop','lemon-drop','United States','north-america','vodka','cold','sour',1,'["vodka","lemon","orange liqueur","sugar"]'),
('Sex on the Beach','sex-on-the-beach','United States','north-america','vodka','cold','sweet',1,'["vodka","peach schnapps","orange","cranberry","ice"]'),
('Black Russian','black-russian','Belgium','europe','vodka','cold','strong',1,'["vodka","coffee liqueur","ice"]'),
('Caesar','caesar','Canada','north-america','vodka','cold','sour',1,'["vodka","clamato","hot sauce","worcestershire","celery salt","lime","ice"]'),
('Appletini','appletini','United States','north-america','vodka','cold','sour',1,'["vodka","apple schnapps","apple","ice"]'),
('Mudslide','mudslide','Cayman Islands','latin-america','vodka','cold','creamy',1,'["vodka","coffee liqueur","irish cream","cream","ice"]'),
('Greyhound','greyhound','United States','north-america','vodka','cold','sour',1,'["vodka","grapefruit","ice"]'),
('Harvey Wallbanger','harvey-wallbanger','United States','north-america','vodka','cold','sweet',1,'["vodka","orange","galliano","ice"]'),
('Blue Lagoon','blue-lagoon','France','europe','vodka','cold','sweet',1,'["vodka","blue curacao","lemonade","ice"]'),
('London Fog','london-fog','Canada','north-america','none','hot','creamy',0,'["tea","bergamot","milk","vanilla"]'),
('Earl Grey','earl-grey','United Kingdom','europe','none','hot','bitter',0,'["tea","bergamot","water"]'),
('Slushie','slushie','United States','north-america','none','cold','sweet',0,'["shaved ice","fruit syrup","sugar","food coloring"]');

INSERT INTO drink_clues (drink_id, order_index, text) VALUES
((SELECT id FROM drinks WHERE slug='screwdriver'), 1, 'The breakfast juice glass that someone has quietly topped up.'),
((SELECT id FROM drinks WHERE slug='screwdriver'), 2, 'American airmen interned in Turkey spread it during the war, and by 1949 Time had noticed the vodka and orange juice.'),
((SELECT id FROM drinks WHERE slug='screwdriver'), 3, 'Orange juice over ice, a wheel of fruit hooked on the glass, America''s two-ingredient highball.'),
((SELECT id FROM drinks WHERE slug='lemon-drop'), 1, 'A fern-bar order that later went down the hatch as a party shooter.'),
((SELECT id FROM drinks WHERE slug='lemon-drop'), 2, 'Norman Jay Hobday shook it at Henry Africa''s in San Francisco, citron vodka with orange liqueur and fresh lemon juice.'),
((SELECT id FROM drinks WHERE slug='lemon-drop'), 3, 'Pale yellow under a crust of sugar on a stemmed glass''s rim, the American citrus sour.'),
((SELECT id FROM drinks WHERE slug='sex-on-the-beach'), 1, 'Ordered with a grin, mostly for the sake of saying its name out loud.'),
((SELECT id FROM drinks WHERE slug='sex-on-the-beach'), 2, 'Bartenders build it in a highball over ice: vodka, peach schnapps, then orange and cranberry juice poured in turn.'),
((SELECT id FROM drinks WHERE slug='sex-on-the-beach'), 3, 'Peach-sweet and coral-pink over ice, a half-wheel of orange perched on top, an American party highball.'),
((SELECT id FROM drinks WHERE slug='black-russian'), 1, 'Short and nearly black over ice, parent of a paler, creamier drink.'),
((SELECT id FROM drinks WHERE slug='black-russian'), 2, 'Gustave Tops poured it at a Brussels hotel in 1949 for Perle Mesta, an American envoy: two of vodka to one of coffee liqueur.'),
((SELECT id FROM drinks WHERE slug='black-russian'), 3, 'Two bottles over ice in an old-fashioned glass and no dairy at all, a Belgian hotel bar''s nightcap.'),
((SELECT id FROM drinks WHERE slug='caesar'), 1, 'Rimmed with celery salt, and it smells faintly of the sea.'),
((SELECT id FROM drinks WHERE slug='caesar'), 2, 'A Calgary hotel manager built it in 1969 from memories of Venetian clam spaghetti: vodka, Clamato, hot sauce, Worcestershire.'),
((SELECT id FROM drinks WHERE slug='caesar'), 3, 'Brick red in a tall glass with a lime wedge and a celery stalk, Canada''s answer to brunch.'),
((SELECT id FROM drinks WHERE slug='appletini'), 1, 'Neon green in a stemmed glass, with a thin fan of fruit on the rim.'),
((SELECT id FROM drinks WHERE slug='appletini'), 2, 'A bartender at Lola''s in West Hollywood shook the first and called it Adam''s Apple, vodka with sour apple schnapps.'),
((SELECT id FROM drinks WHERE slug='appletini'), 3, 'Tart as a sour candy and served up, an American nineties order a TV hospital comedy made a joke of.'),
((SELECT id FROM drinks WHERE slug='mudslide'), 1, 'Thick and tan as a milkshake, ordered at a beach bar after sunset.'),
((SELECT id FROM drinks WHERE slug='mudslide'), 2, 'Legend says a beach bar out of cream for a White Russian swapped in Irish cream, alongside the vodka and coffee liqueur.'),
((SELECT id FROM drinks WHERE slug='mudslide'), 3, 'Frozen or on the rocks, chocolate swirled down the glass, the dessert pour of Grand Cayman''s Rum Point.'),
((SELECT id FROM drinks WHERE slug='greyhound'), 1, 'Two pours, and a salted rim changes the name.'),
((SELECT id FROM drinks WHERE slug='greyhound'), 2, 'A bus company''s terminal restaurants served it by the war''s end, one part vodka or gin to four of grapefruit juice.'),
((SELECT id FROM drinks WHERE slug='greyhound'), 3, 'Pale pink-gold and sharp over ice, the American juice highball with a bite of bitter peel.'),
((SELECT id FROM drinks WHERE slug='harvey-wallbanger'), 1, 'Tall and orange with a yellow liqueur floated over the top.'),
((SELECT id FROM drinks WHERE slug='harvey-wallbanger'), 2, 'An importer dreamed up a cartoon surfer to sell Galliano, floating it over a screwdriver of vodka and orange juice.'),
((SELECT id FROM drinks WHERE slug='harvey-wallbanger'), 3, 'The seventies American party highball, orange juice crowned with a sweet vanilla-anise float.'),
((SELECT id FROM drinks WHERE slug='blue-lagoon'), 1, 'Turquoise as a hotel swimming pool, in a tall glass over ice.'),
((SELECT id FROM drinks WHERE slug='blue-lagoon'), 2, 'Harry''s New York Bar in Paris claims it: vodka and curaçao shaken, strained over ice and topped up with lemonade.'),
((SELECT id FROM drinks WHERE slug='blue-lagoon'), 3, 'Electric aqua with citrus on the brim, a French bar''s tall, sweet vodka cooler.'),
((SELECT id FROM drinks WHERE slug='london-fog'), 1, 'The coffee-shop order for someone who does not drink coffee.'),
((SELECT id FROM drinks WHERE slug='london-fog'), 2, 'A pregnant ceramicist, Mary Loria, came up with it in Vancouver: Earl Grey with vanilla and steamed milk.'),
((SELECT id FROM drinks WHERE slug='london-fog'), 3, 'Pale tan under foam with a citrus note of bergamot, a Canadian West Coast café cup.'),
((SELECT id FROM drinks WHERE slug='earl-grey'), 1, 'A teabag that smells of citrus peel before the water goes in.'),
((SELECT id FROM drinks WHERE slug='earl-grey'), 2, 'Named for a prime minister who probably never cared for it, the blend scents black tea with oil from a bitter citrus rind.'),
((SELECT id FROM drinks WHERE slug='earl-grey'), 3, 'Amber and perfumed in the cup and drunk black, Britain''s bergamot-scented teapot blend.'),
((SELECT id FROM drinks WHERE slug='slushie'), 1, 'Comes in colours no fruit has ever been, swirled from a spinning drum.'),
((SELECT id FROM drinks WHERE slug='slushie'), 2, 'A Kansas Dairy Queen owner kept his soda in the freezer when the fountain failed, and customers asked for it half-frozen.'),
((SELECT id FROM drinks WHERE slug='slushie'), 3, 'Icy syrup in a domed plastic cup with a spoon-straw, the American convenience-store treat.');
