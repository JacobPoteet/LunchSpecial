// The build marker: which bundle is on screen, stamped on every page.
//
// It exists for screenshots and screen recordings. A bug report, a clip of a
// round, a press-kit shot six months old — each of them should say for itself
// which build it happened on, and that only works if nobody has to remember to
// switch it on first. So it is always on, everywhere, the way a game's build ID
// sits in the corner of the title screen.
//
// It used to be a fixed badge in the bottom-right corner, above the modals, so
// that a screenshot of the check carried it too. On a phone that badge covered
// the bottom of the check and a third of the footer's width, so it is now the
// last line of the page footer, under the links (the byline is the author's
// line and stays theirs), and prints the version rather than the sha (shared/build.ts, `buildVersion`). The full label with the
// commit lives on the admin's own footer, where "did that deploy land" is asked.

import { buildTitle, buildVersion } from "../../shared/build";

export function BuildTag() {
  return (
    <p className="footer-note__build" title={buildTitle(__BUILD__)}>
      {buildVersion(__BUILD__)}
    </p>
  );
}
