// Which links leave the game, and what their real address is.
//
// Two surfaces ask this, for different reasons. On the open web a link is just a
// link. Inside the Discord Activity the app is an iframe on a
// `<client-id>.discordsays.com` origin, and a plain `target="_blank"` there does
// nothing at all — the embed is sandboxed, so anything that wants to leave has
// to be handed to the Discord client (`openExternalLink`), which needs an
// absolute URL pointing at the real site rather than at Discord's proxy.
//
// So the fold answers two questions: does this href stay inside the running app,
// and if it doesn't, what does it look like as an absolute lunchspecial.app URL.

/**
 * The canonical public origin. Deliberately hard-coded rather than read off
 * `window.location`: inside Discord the page's own origin is the proxy, which is
 * exactly the address we must NOT send a player's browser to.
 */
export const SITE_ORIGIN = "https://lunchspecial.app";

/**
 * The paths the React app itself serves. Everything else under the domain —
 * /privacy, /terms, /press — is a separate static document, so following one
 * unloads the game. That distinction is the whole point of this module: inside
 * an Activity, unloading the game means unloading the Activity.
 */
const IN_APP_PATHS = new Set(["/", "/play"]);

/**
 * True when following `href` keeps the player on the board they're looking at.
 * Query and hash are ignored — `/?date=2026-07-20` is the same page.
 *
 * Anything unparseable is treated as leaving, which is the safe answer: the
 * worst case is a link that opens in a browser tab instead of in place.
 */
export function staysInTheGame(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href, SITE_ORIGIN);
  } catch {
    return false;
  }
  return url.origin === SITE_ORIGIN && IN_APP_PATHS.has(url.pathname);
}

/**
 * `href` as an absolute public URL. Relative paths resolve against
 * {@link SITE_ORIGIN}, never against the current page — see the note there.
 * An unparseable href degrades to the site's front door rather than throwing.
 */
export function siteUrl(href: string): string {
  try {
    return new URL(href, SITE_ORIGIN).toString();
  } catch {
    return SITE_ORIGIN;
  }
}
