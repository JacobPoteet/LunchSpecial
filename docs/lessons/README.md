# Lessons

Long-form technical walkthroughs of one subsystem each, written to be read start
to finish rather than referred to. They sit here because they are **pages**, not
notes: self-contained HTML published with the rest of `docs/` on GitHub Pages,
next to the project breakdown they link back to.

The split against the wiki is by format and audience, not by topic. A wiki note
is a reference someone already inside the project looks something up in. A
lesson teaches the subsystem to someone who has never seen it, from first
principles, and can be handed to anybody. Where the two overlap, the wiki note
stays the source of truth for *what is currently true*, and the lesson explains
*why it is shaped that way*.

| Page | Subject |
|---|---|
| [`analytics-pipeline.html`](analytics-pipeline.html) | Anonymous beacons from the browser to the admin dashboard: the three countable units, the seven beacons, the trust boundary, idempotent writes, the UTC-to-ET fold, and the honesty rules |
| [`admin-dashboard.html`](admin-dashboard.html) | The read side: one question per tab, counting the right unit, tracks instead of funnels, four colour meanings, Wilson intervals drawn selectively, and the thresholds a prose headline has to clear |
| [`discord-activity.html`](discord-activity.html) | The game inside Discord with no second build: iframe detection, the handshake race, two measured OAuth scopes, the self-editing progress message, and why nothing may wait on any of it |

The three read in that order, and each stands alone.

## House rules for a new lesson

- **One subsystem, one page.** If it needs two subjects to make sense, the
  boundary is in the wrong place.
- **Start at the constraint.** Every one of these systems is shaped by something
  it was not allowed to do. Name that first and the rest of the design explains
  itself.
- **Quote the real code**, from the file it lives in, unedited apart from
  trimmed comments. A lesson that paraphrases the code goes stale silently.
- **Self-contained.** No build step and no shared stylesheet: each page carries
  its own `<style>` block, its own tokens for both colour schemes, and Google
  Fonts as the only external request. Copying a page is how you start the next
  one.
- **Palette comes from `src/styles/base.css`.** Same cream, teal, cherry and
  mustard as the game, so the collection reads as one thing.
- **Excluded from CI** by the `docs/**` path filter in `ci.yml` and
  `codeql.yml`, like everything else in this directory.
