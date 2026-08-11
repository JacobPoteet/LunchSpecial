// Links that leave the game, inside the Discord Activity.
//
// The embed is a sandboxed iframe on a `<client-id>.discordsays.com` origin.
// `target="_blank"` there opens nothing — no tab, no error, no clue — so the
// footer's Privacy/Terms/Press links and any link an admin writes into an
// announcement are dead text for every Discord player. Handing the URL to the
// Discord client instead (`openExternalLink`, no OAuth scope required) shows its
// "you're leaving Discord" sheet and opens the player's real browser.
//
// This is an interceptor rather than a rendering rule on purpose: the markup
// stays exactly what the open web wants, and the Discord behaviour is layered on
// at click time. So a player who clicks before the handshake lands — or after it
// failed — gets the plain-web behaviour rather than a link wired to nothing.

import type { MouseEvent } from "react";
import type { DiscordSDK } from "@discord/embedded-app-sdk";
import { siteUrl, staysInTheGame } from "../../shared/links";

let sdk: DiscordSDK | null = null;

/**
 * Hand the live SDK instance over once the Activity handshake completes.
 *
 * Called from initDiscord() on the handshake's own resolution, NOT on the branch
 * that wins the mount race — same rule as attachPresence, and for the same
 * reason: a handshake landing at 5.1s is a perfectly good SDK, and gating a
 * feature on that timer is how the Discord share button silently died.
 */
export function attachLinks(instance: DiscordSDK): void {
  sdk = instance;
}

/**
 * Click handler for any anchor that might leave the app. A no-op on the open
 * web and for in-app routes; inside Discord, everything else is taken over and
 * opened in the player's browser, leaving the Activity on the board.
 *
 * Cheap and safe to attach to every link — {@link staysInTheGame} decides.
 */
export function interceptOutbound(event: MouseEvent, href: string): void {
  if (!sdk || staysInTheGame(href)) return;
  // Modifier-clicks and middle-clicks mean "open this somewhere else", which the
  // embed can't honour anyway; let them fall through to the default so nothing
  // is silently swallowed on desktop.
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }

  const url = siteUrl(href);
  event.preventDefault();
  sdk.commands.openExternalLink({ url }).catch((err: unknown) => {
    // Only a rejection is a failure. A resolved `{ opened: false }` means the
    // player read Discord's confirmation sheet and said no, which is an answer,
    // not something to route around.
    console.warn("[discord] openExternalLink failed:", err);
    window.open(url, "_blank", "noopener");
  });
}
