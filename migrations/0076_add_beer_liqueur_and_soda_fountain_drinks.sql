-- Stocking the bar, part 5 of 5 (#278): the beer taps, the liqueur shelf
-- and the soda fountain. Recognisable to a US player first.
--
-- Pool only. No `INSERT INTO drink_schedule` rows; nights are booked in
-- /admin and an unbooked night runs on the fallback pour.
--
-- Keyed by slug throughout, never by id. Three coasters each, checked by
-- worker/data-integrity.test.ts.

INSERT INTO drinks (name, slug, country, region, spirit, temperature, profile, is_alcoholic, ingredients) VALUES
('IPA','ipa','United Kingdom','europe','beer','cold','bitter',1,'["barley","hops","water","yeast"]'),
('Shandy','shandy','United Kingdom','europe','beer','cold','sweet',1,'["beer","lemonade","lemon"]'),
('Witbier','witbier','Belgium','europe','beer','cold','sour',1,'["wheat","barley","hops","orange","coriander","yeast"]'),
('Snakebite','snakebite','United Kingdom','europe','beer','cold','sweet',1,'["beer","cider","blackcurrant"]'),
('Amaretto Sour','amaretto-sour','United States','north-america','other','cold','sour',1,'["amaretto","lemon","sugar","egg white","cherry","ice"]'),
('Grasshopper','grasshopper','United States','north-america','other','cold','creamy',1,'["creme de menthe","creme de cacao","cream"]'),
('Irish Cream','irish-cream','Ireland','europe','other','cold','creamy',1,'["whiskey","cream","sugar","cocoa","vanilla"]'),
('Jägerbomb','jagerbomb','Germany','europe','other','cold','sweet',1,'["jagermeister","energy drink","ice"]'),
('Fuzzy Navel','fuzzy-navel','United States','north-america','other','cold','sweet',1,'["peach schnapps","orange","ice"]'),
('Midori Sour','midori-sour','United States','north-america','other','cold','sour',1,'["melon liqueur","vodka","lemon","lime","soda water"]'),
('Americano','americano','Italy','europe','other','cold','bitter',1,'["campari","vermouth","soda water","orange","ice"]'),
('Cherry Phosphate','cherry-phosphate','United States','north-america','none','cold','sour',0,'["cherry","acid phosphate","soda water","sugar"]'),
('Roy Rogers','roy-rogers','United States','north-america','none','cold','sweet',0,'["cola","grenadine","cherry","ice"]'),
('Italian Soda','italian-soda','United States','north-america','none','cold','sweet',0,'["soda water","fruit syrup","ice"]'),
('Cream Soda','cream-soda','United States','north-america','none','cold','sweet',0,'["soda water","vanilla","sugar"]');

INSERT INTO drink_clues (drink_id, order_index, text) VALUES
((SELECT id FROM drinks WHERE slug='ipa'), 1, 'Ordered by its hop varieties, the way wine is ordered by grape.'),
((SELECT id FROM drinks WHERE slug='ipa'), 2, 'Bow brewer George Hodgson shipped strong, heavily hopped beer to East India Company traders, and the hops kept it sound.'),
((SELECT id FROM drinks WHERE slug='ipa'), 3, 'Golden and sharp with piney, citrus hops, the English export pint that craft brewers adopted.'),
((SELECT id FROM drinks WHERE slug='shandy'), 1, 'Half a pint of one thing, topped up with something sweet.'),
((SELECT id FROM drinks WHERE slug='shandy'), 2, 'Pubs cut bitter or lager with lemonade to soften the strength, and some places sell it as low as a children''s drink.'),
((SELECT id FROM drinks WHERE slug='shandy'), 3, 'Pale gold and fizzy with citrus, the low-strength British pub order for a hot afternoon.'),
((SELECT id FROM drinks WHERE slug='witbier'), 1, 'Cloudy and pale as lemonade, with an orange wheel on the rim.'),
((SELECT id FROM drinks WHERE slug='witbier'), 2, 'Hoegaarden brewers spiked raw wheat with coriander and orange peel, and Pierre Celis later revived the style at his brewery.'),
((SELECT id FROM drinks WHERE slug='witbier'), 3, 'Hazy straw-gold and peppery-sweet in a thick tumbler, the Belgian wheat pint from Flemish Brabant.'),
((SELECT id FROM drinks WHERE slug='snakebite'), 1, 'A pint some pubs refuse to pour, though no law clearly forbids it.'),
((SELECT id FROM drinks WHERE slug='snakebite'), 2, 'A Harrogate pub refused one to Bill Clinton in 2001. Barmen pour lager and cider half and half, and some add blackcurrant.'),
((SELECT id FROM drinks WHERE slug='snakebite'), 3, 'Hazy gold, or purple with a splash of cordial, a British pint of malt and orchard fruit.'),
((SELECT id FROM drinks WHERE slug='amaretto-sour'), 1, 'Nutty and bright under a cap of foam, dotted with bitters.'),
((SELECT id FROM drinks WHERE slug='amaretto-sour'), 2, 'An almond liqueur''s importer devised it in 1974, and in 2012 Jeffrey Morgenthaler added bourbon to its lemon and egg white.'),
((SELECT id FROM drinks WHERE slug='amaretto-sour'), 3, 'Golden over ice with a cocktail cherry, the American eighties sour once made with bottled mix.'),
((SELECT id FROM drinks WHERE slug='grasshopper'), 1, 'Pale mint green, an after-dinner glass that tastes of chocolate mints.'),
((SELECT id FROM drinks WHERE slug='grasshopper'), 2, 'Tujague''s in New Orleans credits its owner with it: equal parts green crème de menthe, cream and white crème de cacao.'),
((SELECT id FROM drinks WHERE slug='grasshopper'), 3, 'Pastel green in a coupe, or blended with mint ice cream, the American South''s dessert drink.'),
((SELECT id FROM drinks WHERE slug='irish-cream'), 1, 'Poured over ice, into coffee, or layered into a shot.'),
((SELECT id FROM drinks WHERE slug='irish-cream'), 2, 'A London team led by Tom Jago invented the first brand for Gilbeys, blending whiskey, cream, sugar and cocoa into a liqueur.'),
((SELECT id FROM drinks WHERE slug='irish-cream'), 3, 'Pale coffee-coloured and thick in a tumbler, the whiskey liqueur of Ireland.'),
((SELECT id FROM drinks WHERE slug='jagerbomb'), 1, 'A small glass dropped whole into a larger one, then downed fast.'),
((SELECT id FROM drinks WHERE slug='jagerbomb'), 2, 'Bartenders drop a shot of a German herbal liqueur into energy drink, a habit said to have begun in Northern California.'),
((SELECT id FROM drinks WHERE slug='jagerbomb'), 3, 'Dark herbal liqueur sinking into a fizzing yellow glass, Germany''s stag-logo bottle at the party.'),
((SELECT id FROM drinks WHERE slug='fuzzy-navel'), 1, 'Ordered by people who want the glass to taste like juice.'),
((SELECT id FROM drinks WHERE slug='fuzzy-navel'), 2, 'A distiller launched the first American peach schnapps in 1984, and its ad agency named the mix with orange juice.'),
((SELECT id FROM drinks WHERE slug='fuzzy-navel'), 3, 'Soft peach-orange over ice, the American eighties highball of schnapps and juice.'),
((SELECT id FROM drinks WHERE slug='midori-sour'), 1, 'Bright green as a highlighter pen, served over ice.'),
((SELECT id FROM drinks WHERE slug='midori-sour'), 2, 'A Japanese distiller launched its melon liqueur at a Studio 54 party, and bars shook it with vodka, lemon, lime and soda.'),
((SELECT id FROM drinks WHERE slug='midori-sour'), 3, 'Neon green over ice with a cherry, the American disco-era sour of melon and citrus.'),
((SELECT id FROM drinks WHERE slug='americano'), 1, 'An early-evening order, long enough to last through a plate of snacks.'),
((SELECT id FROM drinks WHERE slug='americano'), 2, 'Gaspare Campari''s Milan bar added sweet vermouth and soda to its bitter after an American visitor ordered it and hated it.'),
((SELECT id FROM drinks WHERE slug='americano'), 3, 'Long and bitter over ice with an orange slice, the Italian aperitivo James Bond orders first.'),
((SELECT id FROM drinks WHERE slug='cherry-phosphate'), 1, 'Sour without a squeeze of citrus, pulled at a drugstore counter.'),
((SELECT id FROM drinks WHERE slug='cherry-phosphate'), 2, 'Drugstore fountains mixed red fruit syrup into soda water with a few drops of acidic mineral salts, sour as lime juice.'),
((SELECT id FROM drinks WHERE slug='cherry-phosphate'), 3, 'A tart ruby fizz in a fountain glass, the American drugstore drink of cherry syrup and soda.'),
((SELECT id FROM drinks WHERE slug='roy-rogers'), 1, 'The kids'' order for boys who didn''t want the pink one.'),
((SELECT id FROM drinks WHERE slug='roy-rogers'), 2, 'Named for a film cowboy who did not drink alcohol, it pours cola over grenadine with a cherry dropped in.'),
((SELECT id FROM drinks WHERE slug='roy-rogers'), 3, 'Dark cola tinted red with grenadine and a maraschino cherry, the American diner''s mocktail for kids.'),
((SELECT id FROM drinks WHERE slug='italian-soda'), 1, 'Flavoured from a wall of syrup bottles behind the counter.'),
((SELECT id FROM drinks WHERE slug='italian-soda'), 2, 'Rinaldo and Ezilda Torre carried syrup recipes from Lucca to San Francisco''s North Beach and stirred them into soda water.'),
((SELECT id FROM drinks WHERE slug='italian-soda'), 3, 'Raspberry-red or any colour you pick, cream floated on request, the American café cooler.'),
((SELECT id FROM drinks WHERE slug='cream-soda'), 1, 'Clear, golden or pink depending on where you buy it.'),
((SELECT id FROM drinks WHERE slug='cream-soda'), 2, 'A Michigan farm paper printed a recipe in 1852 as a temperance drink; bottlers settled on vanilla, sugar and fizzy water.'),
((SELECT id FROM drinks WHERE slug='cream-soda'), 3, 'Vanilla-sweet and fizzy in a frosted bottle, the American soda-fountain pop.');
