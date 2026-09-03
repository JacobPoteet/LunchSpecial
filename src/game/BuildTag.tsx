// The build marker: which bundle is on screen, stamped on every page.
//
// It exists for screenshots and screen recordings. A bug report, a clip of a
// round, a press-kit shot six months old — each of them should say for itself
// which build it happened on, and that only works if nobody has to remember to
// switch it on first. So it is always on, everywhere, the way a game's build ID
// sits in the corner of the title screen.
//
// It is fixed rather than in the page flow (see .build-tag in game.css) so a
// screenshot of the check carries it too, and `aria-hidden` because to a player
// it is not content — it's a fact about the bundle, addressed to whoever is
// looking at the picture later.

import { buildLabel } from "../../shared/build";

export function BuildTag() {
  return (
    <p className="build-tag" aria-hidden="true">
      {buildLabel(__BUILD__)}
    </p>
  );
}
