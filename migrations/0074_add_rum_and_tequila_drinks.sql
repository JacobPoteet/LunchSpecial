-- Stocking the bar, part 3 of 5 (#278): the rum shelf, the tequila shelf
-- and agua fresca. Recognisable to a US player first.
--
-- Pool only. No `INSERT INTO drink_schedule` rows; nights are booked in
-- /admin and an unbooked night runs on the fallback pour.
--
-- Keyed by slug throughout, never by id. Three coasters each, checked by
-- worker/data-integrity.test.ts.

INSERT INTO drinks (name, slug, country, region, spirit, temperature, profile, is_alcoholic, ingredients) VALUES
('Painkiller','painkiller','British Virgin Islands','latin-america','rum','cold','sweet',1,'["rum","pineapple","coconut cream","orange","nutmeg","ice"]'),
('Zombie','zombie','United States','north-america','rum','cold','strong',1,'["rum","lime","grapefruit","cinnamon","grenadine","absinthe"]'),
('Planter''s Punch','planters-punch','Jamaica','latin-america','rum','cold','sweet',1,'["rum","lime","sugar cane","orange","ice"]'),
('Blue Hawaiian','blue-hawaiian','United States','north-america','rum','cold','sweet',1,'["rum","blue curacao","pineapple","coconut cream","ice"]'),
('Bahama Mama','bahama-mama','Bahamas','latin-america','rum','cold','sweet',1,'["rum","coffee liqueur","pineapple","lemon","grenadine","ice"]'),
('Rum Runner','rum-runner','United States','north-america','rum','cold','sweet',1,'["rum","banana liqueur","blackberry liqueur","pineapple","lime","grenadine"]'),
('Bushwacker','bushwacker','US Virgin Islands','latin-america','rum','cold','creamy',1,'["rum","coffee liqueur","creme de cacao","coconut cream","milk","ice"]'),
('El Presidente','el-presidente','Cuba','latin-america','rum','cold','strong',1,'["rum","vermouth","orange liqueur","grenadine","orange"]'),
('Ranch Water','ranch-water','United States','north-america','tequila','cold','sour',1,'["tequila","lime","soda water","ice"]'),
('El Diablo','el-diablo','United States','north-america','tequila','cold','sour',1,'["tequila","blackcurrant liqueur","lime","ginger beer","ice"]'),
('Tequila Shot','tequila-shot','Mexico','latin-america','tequila','cold','strong',1,'["tequila","salt","lime"]'),
('Mexican Martini','mexican-martini','United States','north-america','tequila','cold','sour',1,'["tequila","orange liqueur","lime","olive","orange","salt"]'),
('Agua Fresca','agua-fresca','Mexico','latin-america','none','cold','sweet',0,'["watermelon","lime","sugar","water","ice"]');

INSERT INTO drink_clues (drink_id, order_index, text) VALUES
((SELECT id FROM drinks WHERE slug='painkiller'), 1, 'Grated nutmeg heaped so thick on top that it looks like sand.'),
((SELECT id FROM drinks WHERE slug='painkiller'), 2, 'A White Bay beach bar built it, credited to Daphne Henderson or the Myricks: rum with pineapple, orange and cream of coconut.'),
((SELECT id FROM drinks WHERE slug='painkiller'), 3, 'Pale yellow under brown spice, the Soggy Dollar Bar''s pour on Jost Van Dyke, British Virgin Islands.'),
((SELECT id FROM drinks WHERE slug='zombie'), 1, 'The menu once capped it at two per customer.'),
((SELECT id FROM drinks WHERE slug='zombie'), 2, 'Donn Beach built it at his Hollywood tiki bar in 1934 and wrote the recipe in code: rums, lime, grapefruit, cinnamon, absinthe.'),
((SELECT id FROM drinks WHERE slug='zombie'), 3, 'A tall tumbler of rum and fruit over cracked ice, mint on top, the American tiki bar''s heavy hitter.'),
((SELECT id FROM drinks WHERE slug='planters-punch'), 1, 'Poured straight into a little clay cup, no shaker involved.'),
((SELECT id FROM drinks WHERE slug='planters-punch'), 2, 'A London comic magazine printed the recipe as a verse, counting out lemon juice, sugar and rum by the wine glass.'),
((SELECT id FROM drinks WHERE slug='planters-punch'), 3, 'Dark rum, lime and sugar-cane juice under orange zest, the Jamaican cooler named for estate owners.'),
((SELECT id FROM drinks WHERE slug='blue-hawaiian'), 1, 'Ordered for the colour alone, the brightest thing at the pool bar.'),
((SELECT id FROM drinks WHERE slug='blue-hawaiian'), 2, 'Harry Yee built its parent at a Waikiki hotel in 1957 for a curaçao maker; this one adds cream of coconut to rum and pineapple.'),
((SELECT id FROM drinks WHERE slug='blue-hawaiian'), 3, 'Aquamarine, creamy and pineapple-sweet in a hurricane glass, an American resort drink from Honolulu.'),
((SELECT id FROM drinks WHERE slug='bahama-mama'), 1, 'Rosy and fruit-sweet, it hides how strong it is until you stand up.'),
((SELECT id FROM drinks WHERE slug='bahama-mama'), 2, 'Oswald Greenslade claimed it in his own book, though others date it earlier: rum, coffee liqueur, pineapple and grenadine.'),
((SELECT id FROM drinks WHERE slug='bahama-mama'), 3, 'Pink-orange over ice, a cherry and pineapple wedge on a pick, the Bahamian hotel-bar cooler.'),
((SELECT id FROM drinks WHERE slug='rum-runner'), 1, 'Red-orange and churned in a frozen-drink machine at a marina bar.'),
((SELECT id FROM drinks WHERE slug='rum-runner'), 2, 'Legend says a Keys tiki bar manager had surplus stock to clear, so he mixed rum, banana and blackberry liqueurs and grenadine.'),
((SELECT id FROM drinks WHERE slug='rum-runner'), 3, 'Fruity, frozen and blood orange in a tall glass, the American drink of Islamorada.'),
((SELECT id FROM drinks WHERE slug='bushwacker'), 1, 'A grown-up chocolate shake, blended thick and topped with a cherry.'),
((SELECT id FROM drinks WHERE slug='bushwacker'), 2, 'A Sapphire Village pub blended it in 1975 from dark rum, coffee liqueur, crème de cacao, cream of coconut and milk.'),
((SELECT id FROM drinks WHERE slug='bushwacker'), 3, 'Mocha-brown under whipped cream and blended thick, a pour from Saint Thomas in the US Virgin Islands.'),
((SELECT id FROM drinks WHERE slug='el-presidente'), 1, 'A Prohibition getaway order, served up with an orange twist.'),
((SELECT id FROM drinks WHERE slug='el-presidente'), 2, 'Havana bars served it to dry-law Americans, and two Cuban presidents vie to be its namesake: rum, blanc vermouth, curaçao.'),
((SELECT id FROM drinks WHERE slug='el-presidente'), 3, 'Clear amber-pink and served up with an orange twist, the Havana club drink of Cuba.'),
((SELECT id FROM drinks WHERE slug='ranch-water'), 1, 'Tall, fizzy and nearly clear, with a lime wedge pushed down inside.'),
((SELECT id FROM drinks WHERE slug='ranch-water'), 2, 'An Austin restaurant owner served it as a margarita with a bottle of Topo Chico beside it, and drinkers mixed their own.'),
((SELECT id FROM drinks WHERE slug='ranch-water'), 3, 'Tequila and lime under a hard Mexican mineral fizz, the Texas porch highball of America.'),
((SELECT id FROM drinks WHERE slug='el-diablo'), 1, 'A purple layer bleeding down through a gold highball.'),
((SELECT id FROM drinks WHERE slug='el-diablo'), 2, 'Trader Vic''s 1946 book printed it as his own, though later editions dropped the mark: tequila, cassis, lime and ginger ale.'),
((SELECT id FROM drinks WHERE slug='el-diablo'), 3, 'Red-purple over ice with ginger fizz below and lime wedged in, the agave highball of American tiki.'),
((SELECT id FROM drinks WHERE slug='tequila-shot'), 1, 'Gone in one swallow, and the face afterwards is part of it.'),
((SELECT id FROM drinks WHERE slug='tequila-shot'), 2, 'Jalisco distillers make it from blue agave, and drinkers abroad lick salt off a hand, down it in one and bite a lime wedge.'),
((SELECT id FROM drinks WHERE slug='tequila-shot'), 3, 'Sipped neat from a narrow caballito, sometimes beside a glass of sangrita, the Mexican way.'),
((SELECT id FROM drinks WHERE slug='mexican-martini'), 1, 'Three stuffed olives on a pick, and a salted rim besides.'),
((SELECT id FROM drinks WHERE slug='mexican-martini'), 2, 'Two Austin bars, the Cedar Door and Trudy''s, both claim it: tequila, orange liqueur, lime and a splash of olive brine.'),
((SELECT id FROM drinks WHERE slug='mexican-martini'), 3, 'A margarita poured into a cocktail glass with a briny edge, the Texas order of American Tex-Mex.'),
((SELECT id FROM drinks WHERE slug='agua-fresca'), 1, 'Ladled from tall glass jars lined up on a street cart.'),
((SELECT id FROM drinks WHERE slug='agua-fresca'), 2, 'Street vendors blend fruit, flowers or seeds with water and a little sugar, from watermelon to hibiscus and tamarind.'),
((SELECT id FROM drinks WHERE slug='agua-fresca'), 3, 'Pink and pulpy over ice beside a taco plate, the Mexican watermelon cooler sold by the cup.');
