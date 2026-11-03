---
paths:
  - "src/discord/**"
  - "worker/routes/discord.ts"
  - "worker/playerid.ts"
  - "worker/discordsig.ts"
  - "worker/avatar.ts"
  - "worker/device.ts"
  - "shared/progress.ts"
  - "shared/device.ts"
  - "shared/presence.ts"
  - "shared/scorecard.ts"
  - "src/game/ResultModal.tsx"
  - "src/game/Byline.tsx"
---

# Discord Activity

Loaded with the files above. Rules that apply everywhere stay in the root CLAUDE.md.

Runs as an embedded iframe with **no separate build**: Discord proxies `lunchspecial.app`. Client code is `src/discord/`, activated by the `frame_id` query param; off Discord the SDK is never downloaded.

- **The 5s `ready()` cap gates only the React mount.** `attachPresence`/`attachShare`/`attachSocial` run inside the handshake's own `.then()`, never on the race-winning branch.
- **Never name the dish** in presence copy or the score card. Progress and guess counts are safe; answer, guessed dishes and clues are not. A test pins this.
- **Two OAuth scopes, `identify` + `rpc.activities.write`, both required.** Don't add a third; don't re-run the experiment. The user object from `authenticate()` is dropped by the browser: never read, stored, sent or persisted there. **Only the Worker reads the user `id`, once, at `/token`** (`worker/playerid.ts`): it keeps `d-` + a keyed hash (`PLAYER_ID_SECRET`, its own secret so rotating `SESSION_SECRET` resets nobody) and nothing else Discord returned. Rotating `PLAYER_ID_SECRET` resets every Discord player.
- **Token exchange is server-side**; the client secret never reaches the browser. Unconfigured → 503, and nothing may wait on a Discord feature.
- **Authorize once per page load** (`prompt: "none"`); a refusal sets `unavailable`, never retried. **Nothing fails loudly**: presence throttles to one update per 4s with a trailing send, the progress loop retires on one failure, a 410 retires silently.
- **Presence elapsed timer measures this sitting** and is dropped when the round ends. Preview/playtest publish nothing (same `tracked` flag as the beacons).
- **Sharing:** `shareToChannel()` never throws and returns a boolean; `ResultModal.share()` copies on false. `openShareMomentDialog` accepts only a Discord CDN URL, hence the PNG score card (rects, not emoji; palette hard-coded from base.css). The upload goes through the Worker, which stores nothing. Sharing never raises a consent sheet (`peekToken()`, not `ensureAuthorized()`). `copyShareText()` falls back to `execCommand("copy")` because `navigator.clipboard` is blocked in the iframe. Don't use `sdk.commands.shareLink`.
- **Progress message:** Discord creates it via a signed interaction; identity comes off the signed payload, never the client. Edits never re-send `embeds`. `discord_messages` holds only `{opaque client-minted handle, interaction token, created_at, the server's locale tag}`; the interaction token never reaches the browser. Verify the Ed25519 signature on the **raw** body or 401 (a 401 on Discord's bad-signature probe is a pass). Avatar indices use **BigInt**; animated `a_` hashes need `.gif`. Updates are trailing, not queued. `resetProgress()` must run before the publisher inside `useRoundTelemetry`; don't call either from a page. `shareInteraction` is undocumented: if it breaks, only the loop is lost.
- **Social (`social.ts`, no scopes):** only the participant *count* leaves the module (never usernames/avatars); you are subtracted and the bar hides at zero. Invite hidden when `sdk.guildId === null`. PIP layout is scoped to `<html data-discord-layout="pip">`, never a width query.
- `/privacy`, `/terms`, `/press` are plain same-origin links with no `target="_blank"`. The game's one outbound link is the footer byline (`src/game/Byline.tsx`, LinkedIn, new tab), web surface only; inside Discord it renders as plain text.
- localStorage inside Discord is sandboxed to `discordsays.com`, so Activity players have separate history.
- **Discord mobile drops the Activity's storage when the app is quit** (measured: 0 of 40 mobile devices ever returned on a second day; closing and reopening the Activity keeps it). So a player who authorizes is remembered by the hash, not the device: `src/discord/restore.ts` runs before the mount (own 3s cap), adopts the id (`device_from = discord`), folds the Worker's saved copy into localStorage and saves back (debounced, via `Storage.prototype.setItem` watching the keys). The keys that travel, and how a collision resolves, live in `shared/progress.ts` (`PROGRESS_KEYS`; whole records, unions, never sums). A new synced key is added there and in its test. `/api/discord/progress` takes a signed `player:<id>` claim minted at `/token`, never a client-supplied id; PUT merges, so an empty phone cannot erase a streak. Unconfigured secret, a decline or a failure leaves the game on its own storage. Authorization now happens at launch, so a first-time player may see the consent sheet before the walkthrough.
- **The device id lives in two stores** (#251): `lunch-special:player` and the `ls_device` cookie (`shared/device.ts`, Partitioned + SameSite=None for the browser client's third-party iframe). Whichever survives refills the other. The Worker never reads the cookie. `/start` stamps `client` (desktop/browser/mobile, Discord rounds only) and `device_from` (storage/cookie/new); both NULL before 0059, which is unmeasured. `navigator.storage.persist()` runs in the installed apps only (Firefox prompts).
