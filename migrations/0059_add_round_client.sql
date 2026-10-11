-- Why Discord device ids reset (#251). Two facts about a round, stamped by
-- /start only, both closed sets checked by the Worker:
--
--   client       Discord rounds only: 'desktop' (installed app), 'browser'
--                (discord.com in a web browser) or 'mobile'. NULL on the web,
--                and on every Discord round before this shipped (unmeasured).
--   device_from  Which store the page load found its device id in: 'storage'
--                (localStorage), 'cookie' (the new mirror restored it) or
--                'new' (minted). NULL before this shipped.
--
-- Neither identifies a player. Additive only.

ALTER TABLE analytics_rounds ADD COLUMN client TEXT;
ALTER TABLE analytics_rounds ADD COLUMN device_from TEXT;
