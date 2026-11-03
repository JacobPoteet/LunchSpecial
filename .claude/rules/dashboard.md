---
paths:
  - "src/admin/**"
  - "src/styles/admin.css"
  - "worker/routes/admin/**"
  - "worker/routes/stats.ts"
  - "worker/routes/analytics.ts"
  - "worker/audience.ts"
  - "worker/funnel.ts"
  - "worker/growth.ts"
  - "worker/regulars.ts"
  - "worker/devicecheck.ts"
  - "worker/dishstats.ts"
  - "worker/guessstats.ts"
  - "worker/nightstats.ts"
  - "worker/players.ts"
  - "worker/rhythm.ts"
  - "worker/stats.ts"
  - "worker/experiments.ts"
  - "worker/locales.ts"
  - "worker/countries.ts"
  - "worker/attribution.ts"
  - "worker/menu.ts"
  - "shared/activity.ts"
  - "shared/sample.ts"
  - "shared/experiment.ts"
  - "shared/dishfilter.ts"
  - "shared/schedule.ts"
  - "shared/playtime.ts"
---

# Rules the dashboard obeys

Loaded with the files above. Rules that apply everywhere stay in the root CLAUDE.md.

- **Never report "unmeasured" as zero.** NULL `visited`, `country`, `dish_id`, `source` mean pre-feature rows: `untracked`, never a slice or a dish.
- Every rate off a denominator under `SMALL_SAMPLE_MIN` (30) carries its Wilson 95% interval, and nothing else does. A headline refuses to compare when it can't (`separated()`); undecided verdicts carry `daysNeeded`.
- Censored denominators: return rates only count a device after `RETENTION_WINDOW_DAYS` (7); the rest are `pending`, never no-shows. Prose headlines wait for their floors (`RETENTION_MIN_COHORT`, `DISH_MIN_COMPLETED`, `GROWTH_TREND_MIN_DAYS`, `WEEKDAY_MIN_OCCURRENCES`).
- Rates are **pooled over a period, never averaged across days**; experiment series ship raw counts.
- Broken measurements are dropped, never clamped (negative durations). `PLAYTIME_CAP_MINUTES` only reduces and says so. A duration needs both ends measured; never COALESCE `completedAt`/`sharedAt` onto `updated_at`. Median and p90, never a mean. Weekday figures are per-occurrence averages.
- Devices are partitioned, one country each (`foldCountries`). Count the right unit and name it: the funnel counts devices, `FinishRate` counts games; don't merge them. "Played again" needs the day's last `started_at` after its first completion.
- `DNF_GRACE_MINUTES` (2h) splits "still eating" from "walked out". The activity feed's row is a round, grouped by device × `playedDay`, never `play_date`. Retention and the funnel fold against the real `today`, never the picked day.
- **Chart axis ticks and value labels are absolutely positioned**, never in the flow of a fixed-height column.
- **Unserved dishes/drinks are veiled** (`src/admin/Veil.tsx`): real name absent from the DOM until the eye button is pressed, no timers. Any new spot printing a later name uses it.
- **Nothing on the dashboard animates**; `admin.css` declares no keyframes.
- `sound_prefs` is not a measurement; nothing may quote a rate off it.
- Colour has four taken meanings (kind: mustard/teal/cherry; event: start teal/complete cherry/share mustard; rank: teal ramp; annotation: dashed ink). Don't add a fifth. No colour is ever assigned to a player.
- Seven tabs, each one question: Today · Menu · Players · After Dark · Trends · Experiments · Activity (`?tab=`). Puzzle reads live on Menu; the 📅 `DayPicker` lives on Menu only and resets on leaving. `/api/admin/audience` is the one definition of "active" (a device that started a round). The KPI compares the last 7 complete days with the 7 before (`countChange`); today is never in it. Cohort cells and the weekly chart never print a zero for an unfinished week.
- **The regulars** (Players tab, `/api/admin/regulars`, `worker/regulars.ts`): the top tenth of devices by distinct ET days played, ties at the line kept in, never a one-day device. It is a two-group table with no colour and no new meaning. Guess counts are Today's Special only; "first Special" is there because regulars have had more practice. Rates ship as n-of-m and carry Wilson ranges; the headline waits for `REGULARS_MIN_GROUP`. "Everyone else" is non-regulars past `RETENTION_WINDOW_DAYS`; newer ones are `pending`, counted apart. The group is chosen on days played, so its attendance rows describe the line and "ever tried" gaps are mostly tenure: only day-one and first-Special gaps are called out.
- **The device check** (Activity tab, click a device id; `/api/admin/device-check`, `worker/devicecheck.ts`): one device's history as a guest check. "Regular" comes from `regularsCutoff` only, so it and the Players tab never disagree. On screen the comparison group is "Others" (never "the house"): every *other* device past `RETENTION_WINDOW_DAYS`, every surface, with a footnote saying whether it was pooled (Special rates) or a median (the measures). `rank` is "3rd of 23" with this device counted, ties shared and printed ("tied with 19"), null inside the device's own first week, no interval; one rank per measure, never a second "days played" rank with a different denominator; n-of-m rates carry Wilson ranges. Fixed-column tables, never dotted-leader lines (a value plus its range won't fit one). Ink only, no keyframes (it wears `.dcheck`, never `.modal--receipt`). Counts per kind, never dish names: it is not a per-device guess trail. The feed has no spotlight.
- **Admin Dishes filter** (`shared/dishfilter.ts`): within a facet OR, across AND; every chip's count drops its own facet; "never scheduled" means past *and* future; parked in sessionStorage through `normalizeFilter()`.
- **Admin Schedule board** (`shared/schedule.ts`): the picker is a hand-drawn listbox, never `<select>` or `<datalist>`; `matchDishes` searches names only; a name two dishes share resolves to neither; a close repeat is stated, never blocked; writes patch one entry and never refetch the window; nothing in a row changes size/colour/weight in flight (no `disabled`, use `aria-busy`); all four row buttons always render, hidden with `visibility`; the route owns the default window. Autofill and its balance line are informational.
- **Menu mix** takes no `surface` or `date` filter; one hue per bar.
- **What people order** (`/picks`, `worker/guessstats.ts`) reads `analytics_guesses`: dishes only, counts never rates, no `surface` filter (the ledger has none). Menu mix and Ingredient families are `Fold`s that mount, and fetch, only once opened. The dish report opens on 5 rows and keeps only Recently served (the default) and Hardest; all-time difficulty and "Served more than once" are folded. Players folds Repeat visits, arrival sources and countries the same way (`Fold`), each bar carrying its panel's headline sentence as the hint. Activity folds "This device's data"; Trends folds the growth chart; Today shows one "Housekeeping is clear" line instead of the schedule-health and content-warning cards until either has something to fix. **What people pour** is the same `GuessPanel` on After Dark over `/picks/drinks`: the dish and drink ledgers never meet, and `foldGuessStats` takes generic ids.

## Dashboard and a Nightcap

(`kind = 'nightcap'`, a fourth `RoundKind`; `play_date` is the LOCAL night key and `guesses` is out of four)
- Never pool a Nightcap with a Special on a guess distribution or guesses-average. Counts pool fine.
- Never join `play_date` against `schedule`, never name a Nightcap from a dish; its target comes off `drink_id`. Exclude Nightcaps from the dish report outright.
- Write lists of kinds off `ROUND_KINDS` / `KIND_META`. A guess count beside another kind's carries its ceiling (`maxGuessesFor`).
- `tz_offset` is the one beacon field about the player's clock; the server drops impossible values to NULL. Compute the local hour in SQL from `started_at` + `tz_offset`, never from a UTC hour bucket (half-hour zones). The bar's hour axis opens at 20:00 and draws all 24 hours. The tab has no day picker.
- Crossover denominator is devices that *finished* a Special on a night `>= NIGHT_EPOCH_DATE`; nights from ET today forward are `pending`, outside the rate. `barOnly` devices and `outsideHours` rounds are counted apart, never dropped.
- After Dark takes `--plum` in the kind palette (not `--neon-pink`).
