// The author's line at the top of the page footer, shared by the diner and the
// bar.
//
// On the open web the name opens the author's LinkedIn in a new tab. Inside the
// Discord Activity it stays plain text: the iframe blocks a new-tab link (only
// the SDK's openExternalLink gets out, behind Discord's own warning), and the
// game there carries no outbound links. `currentSurface()` rather than the URL,
// so a Leftover or Chef's Choice opened from inside Discord still counts.

import { currentSurface } from "../discord/bootstrap";
import { useT } from "../i18n/store";

const AUTHOR = "Jacob Poteet";
const AUTHOR_URL = "https://www.linkedin.com/in/jacobpoteet/";

export function Byline() {
  const t = useT();
  return (
    <p>
      {t.byline.createdBy}{" "}
      {currentSurface() === "web" ? (
        <a className="footer-note__author" href={AUTHOR_URL} target="_blank" rel="noopener noreferrer">
          {AUTHOR}
          <span className="sr-only">{t.byline.newTab}</span>
        </a>
      ) : (
        <b>{AUTHOR}</b>
      )}
    </p>
  );
}
