-- Stocking the bar, part 4 of 5 (#278): the whiskey shelf, the wine
-- shelf and hot apple cider. Recognisable to a US player first.
--
-- Pool only. No `INSERT INTO drink_schedule` rows; nights are booked in
-- /admin and an unbooked night runs on the fallback pour.
--
-- Keyed by slug throughout, never by id. Three coasters each, checked by
-- worker/data-integrity.test.ts.

INSERT INTO drinks (name, slug, country, region, spirit, temperature, profile, is_alcoholic, ingredients) VALUES
('Rob Roy','rob-roy','United States','north-america','whiskey','cold','strong',1,'["scotch","vermouth","bitters","cherry"]'),
('Boulevardier','boulevardier','France','europe','whiskey','cold','bitter',1,'["whiskey","campari","vermouth","orange"]'),
('Penicillin','penicillin','United States','north-america','whiskey','cold','sour',1,'["scotch","lemon","honey","ginger","ice"]'),
('Rusty Nail','rusty-nail','United States','north-america','whiskey','cold','strong',1,'["scotch","drambuie","orange","ice"]'),
('Highball','highball','Japan','east-asia','whiskey','cold','strong',1,'["whiskey","soda water","ice","lemon"]'),
('Paper Plane','paper-plane','United States','north-america','whiskey','cold','sour',1,'["whiskey","aperol","amaro","lemon"]'),
('Vieux Carré','vieux-carre','United States','north-america','whiskey','cold','strong',1,'["whiskey","cognac","vermouth","benedictine","bitters","cherry"]'),
('Godfather','godfather','United States','north-america','whiskey','cold','strong',1,'["scotch","amaretto","ice"]'),
('Moonshine','moonshine','United States','north-america','whiskey','cold','strong',1,'["corn","sugar","yeast","water"]'),
('Wine Spritzer','wine-spritzer','Austria','europe','wine','cold','sour',1,'["white wine","soda water","ice"]'),
('Frosé','frose','United States','north-america','wine','cold','sweet',1,'["rose wine","strawberry","lemon","sugar"]'),
('Champagne Cocktail','champagne-cocktail','United States','north-america','wine','cold','sweet',1,'["champagne","sugar","bitters","orange","cherry"]'),
('Hugo Spritz','hugo-spritz','Italy','europe','wine','cold','sweet',1,'["prosecco","elderflower","mint","soda water","ice"]'),
('Hot Apple Cider','hot-apple-cider','United States','north-america','none','hot','sweet',0,'["apple","cinnamon","clove","orange","nutmeg"]');

INSERT INTO drink_clues (drink_id, order_index, text) VALUES
((SELECT id FROM drinks WHERE slug='rob-roy'), 1, 'Two cherries on a skewer laid across a stemmed glass.'),
((SELECT id FROM drinks WHERE slug='rob-roy'), 2, 'A Waldorf Astoria bartender named it in 1894 for an operetta about a Scottish outlaw: Scotch, sweet vermouth, bitters.'),
((SELECT id FROM drinks WHERE slug='rob-roy'), 3, 'Dark amber and stirred cold, the American Manhattan''s Highland cousin.'),
((SELECT id FROM drinks WHERE slug='boulevardier'), 1, 'Ruby-brown and stirred, a cold-weather cousin of a brighter aperitif.'),
((SELECT id FROM drinks WHERE slug='boulevardier'), 2, 'Harry MacElhone''s 1927 book credited a regular, the writer Erskine Gwynne: whiskey, Campari and sweet vermouth, equal parts.'),
((SELECT id FROM drinks WHERE slug='boulevardier'), 3, 'Bitter and garnet-dark under an orange twist, the whiskey aperitif of an American bar in France.'),
((SELECT id FROM drinks WHERE slug='penicillin'), 1, 'A cube of candied ginger balanced on the rim of a short glass.'),
((SELECT id FROM drinks WHERE slug='penicillin'), 2, 'Sam Ross built it at New York''s Milk & Honey in 2005: blended Scotch, lemon, honey and ginger, with smoky Islay floated over.'),
((SELECT id FROM drinks WHERE slug='penicillin'), 3, 'Pale gold over ice under a smoky top layer, a twenty-first-century American sour.'),
((SELECT id FROM drinks WHERE slug='rusty-nail'), 1, 'Burnished copper over ice, just two bottles poured into a short glass.'),
((SELECT id FROM drinks WHERE slug='rusty-nail'), 2, 'It began as a London trade-fair drink, Manhattan''s 21 Club takes credit and the Rat Pack adopted it: Scotch with Drambuie.'),
((SELECT id FROM drinks WHERE slug='rusty-nail'), 3, 'Honeyed and herbal over ice, orange peel twisted over it, the American Scotch nightcap of the sixties.'),
((SELECT id FROM drinks WHERE slug='highball'), 1, 'Tall, pale gold and fizzing, ordered by the round after work.'),
((SELECT id FROM drinks WHERE slug='highball'), 2, 'Occupation troops brought whisky and soda over, and a Suntory campaign aimed at young women made it fashionable again.'),
((SELECT id FROM drinks WHERE slug='highball'), 3, 'Whisky and cold soda filling a tall glass packed with ice, the Japanese bar''s lighter pour.'),
((SELECT id FROM drinks WHERE slug='paper-plane'), 1, 'Pale orange in a coupe, and named after a rap track.'),
((SELECT id FROM drinks WHERE slug='paper-plane'), 2, 'Sam Ross built it for a colleague''s Chicago bar and swapped the Campari for Aperol: equal bourbon, Aperol, amaro and lemon.'),
((SELECT id FROM drinks WHERE slug='paper-plane'), 3, 'Bittersweet, tangerine-coloured and served up with no garnish, an American sour of the craft revival.'),
((SELECT id FROM drinks WHERE slug='vieux-carre'), 1, 'Ordered at a bar that turns slowly like a carousel.'),
((SELECT id FROM drinks WHERE slug='vieux-carre'), 2, 'Walter Bergeron of a New Orleans hotel bar gets the credit: rye, cognac, sweet vermouth, a spoon of Bénédictine and bitters.'),
((SELECT id FROM drinks WHERE slug='vieux-carre'), 3, 'Mahogany and stirred under a cherry and orange zest, the American drink named for the French Quarter.'),
((SELECT id FROM drinks WHERE slug='godfather'), 1, 'Two pours over ice in a short glass, one of them smelling of marzipan.'),
((SELECT id FROM drinks WHERE slug='godfather'), 2, 'An amaretto maker says Marlon Brando drank it, and the name may nod to the liqueur''s Italian roots: Scotch and amaretto, iced.'),
((SELECT id FROM drinks WHERE slug='godfather'), 3, 'Smoky and almond-sweet over ice in a short tumbler, an American after-dinner pour.'),
((SELECT id FROM drinks WHERE slug='moonshine'), 1, 'Sold out of the back door, never with a tax stamp on it.'),
((SELECT id FROM drinks WHERE slug='moonshine'), 2, 'Appalachian distillers ran corn mash through hidden stills at night to dodge revenue men, and its drivers went on to NASCAR.'),
((SELECT id FROM drinks WHERE slug='moonshine'), 3, 'Clear as water, shaken to read its strength from the bubbles, the American hill-country corn spirit.'),
((SELECT id FROM drinks WHERE slug='wine-spritzer'), 1, 'A long, pale glass ordered by the ratio, not the name.'),
((SELECT id FROM drinks WHERE slug='wine-spritzer'), 2, 'Hungarian bars name dozens of versions by the ratio of soda to the pour, and Austrians call it by a word for a squirt.'),
((SELECT id FROM drinks WHERE slug='wine-spritzer'), 3, 'A dry white stretched with soda water over ice, the Austrian tavern''s long summer glass.'),
((SELECT id FROM drinks WHERE slug='frose'), 1, 'Pink and spoonable, a summer brunch order that came out of a machine.'),
((SELECT id FROM drinks WHERE slug='frose'), 2, 'A Manhattan restaurant bought a frozen-drink machine for negronis, then tried rosé in it, blended with strawberry and lemon.'),
((SELECT id FROM drinks WHERE slug='frose'), 3, 'Blush-pink slush in a stemmed glass, the American summer wine of the 2010s.'),
((SELECT id FROM drinks WHERE slug='champagne-cocktail'), 1, 'Raised at midnight in a flute, with a twist of orange and a cherry.'),
((SELECT id FROM drinks WHERE slug='champagne-cocktail'), 2, 'Jerry Thomas printed it in his bar guide: a sugar cube soaked in bitters, then cold sparkling wine poured over it.'),
((SELECT id FROM drinks WHERE slug='champagne-cocktail'), 3, 'Pale gold and bubbling with bitters bleeding off a sugar cube, the classic American toast.'),
((SELECT id FROM drinks WHERE slug='hugo-spritz'), 1, 'Mint leaves and ice crowding a big wine glass, a pale green tint.'),
((SELECT id FROM drinks WHERE slug='hugo-spritz'), 2, 'Roland Gruber of a Naturns bar built it to rival the Venetian aperitif, first with lemon balm syrup, then elderflower.'),
((SELECT id FROM drinks WHERE slug='hugo-spritz'), 3, 'Prosecco, elderflower and soda over ice with mint, the alpine Italian aperitif from South Tyrol.'),
((SELECT id FROM drinks WHERE slug='hot-apple-cider'), 1, 'Sold by the cup at orchard stands beside a bag of doughnuts.'),
((SELECT id FROM drinks WHERE slug='hot-apple-cider'), 2, 'Orchards grind the whole fruit, cores and all, and press the mash through cloth, then mull the juice with cinnamon and clove.'),
((SELECT id FROM drinks WHERE slug='hot-apple-cider'), 3, 'Cloudy amber and steaming with orange peel and spice, America''s mug from Halloween to Thanksgiving.');
