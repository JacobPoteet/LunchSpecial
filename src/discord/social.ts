// The three things that make the Activity feel like an Activity.
//
// Grouped in one module because they're the same kind of thing — small runtime
// facts about the room the game is being played in, none of which exist on the
// open web and none of which take an OAuth scope:
//
//   • an invite button, for the moment the player might want company
//   • how many people are in this Activity instance right now
//   • which layout Discord is drawing us in (focused, picture-in-picture, grid)
//
// Everything is best-effort and silent. Off Discord every export is a no-op that
// reports "nothing to show", so callers need no surface check of their own.

import type { DiscordSDK } from "@discord/embedded-app-sdk";

let sdk: DiscordSDK | null = null;

/**
 * Hand the live SDK instance over once the Activity handshake completes.
 * Registered on the handshake's own resolution, like presence and share.
 */
export function attachSocial(instance: DiscordSDK): void {
  sdk = instance;
  watchParticipants();
  watchLayout();
}

// ---------------------------------------------------------------------------
// Invite
// ---------------------------------------------------------------------------

/**
 * True when there's an invite worth offering: we're embedded, and in a guild
 * channel. `openInviteDialog` throws `INVALID_CHANNEL` in DMs and group DMs,
 * where there's nothing to invite anyone to.
 */
export function canInvite(): boolean {
  return sdk !== null && sdk.guildId !== null;
}

/**
 * Open Discord's own invite UI.
 *
 * The documented belt-and-braces version checks `CREATE_INSTANT_INVITE` first
 * via `getChannelPermissions` — but that command costs a `guilds.members.read`
 * scope, and a third scope on the consent sheet of a game with no accounts is a
 * bad trade for pre-empting one error. So: call it, and swallow the refusal.
 * The cost of being wrong is a dialog that doesn't open, which is what checking
 * would have produced anyway.
 */
export function openInvite(): void {
  if (!sdk || !canInvite()) return;
  sdk.commands.openInviteDialog().catch((err: unknown) => {
    console.warn("[discord] openInviteDialog failed (likely no invite permission):", err);
  });
}

// ---------------------------------------------------------------------------
// Who else is here
// ---------------------------------------------------------------------------

type CountListener = (count: number) => void;

let participants = 0;
const countListeners = new Set<CountListener>();

/**
 * Subscribe to the number of people connected to this Activity instance.
 * Returns an unsubscribe function; fires immediately with what we know.
 *
 * **The count is all that ever leaves this module.** Discord's payload carries
 * full user objects — usernames, avatars, nicknames — and reading any of them
 * would put identity into a game that deliberately has none. `.length` says the
 * diner is busy without saying who's in it.
 */
export function onParticipantCount(listener: CountListener): () => void {
  countListeners.add(listener);
  listener(participants);
  return () => countListeners.delete(listener);
}

function setParticipants(count: number): void {
  if (count === participants) return;
  participants = count;
  for (const listener of countListeners) listener(count);
}

function watchParticipants(): void {
  if (!sdk) return;
  sdk.commands
    .getActivityInstanceConnectedParticipants()
    .then((res) => setParticipants(res.participants.length))
    .catch((err: unknown) => console.warn("[discord] participant count unavailable:", err));
  void sdk.subscribe("ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE", (event) => {
    setParticipants(event.participants.length);
  });
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** From the SDK's `LayoutModeTypeObject`. 1 is the small floating tile. */
const LAYOUT_PIP = 1;

/**
 * Mirror Discord's layout mode onto `<html data-discord-layout>` so the
 * stylesheet can respond to it.
 *
 * An attribute rather than React state on purpose: picture-in-picture is a
 * property of the window the game is drawn in, not of the round, and every part
 * of the board that has to shrink is CSS. Routing it through a provider would
 * mean re-rendering the whole game to change a layout the player can flip back
 * a second later.
 */
function watchLayout(): void {
  if (!sdk) return;
  const apply = (mode: number) => {
    document.documentElement.dataset.discordLayout = mode === LAYOUT_PIP ? "pip" : "focused";
  };
  apply(0);
  void sdk.subscribe("ACTIVITY_LAYOUT_MODE_UPDATE", (event) => apply(event.layout_mode));
}
