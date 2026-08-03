// A note from the kitchen: the modal an announcement is delivered in.
//
// Dressed as a card hung on the order wheel — it swings down from the top on
// open and swings back up on close (the `notice` Modal variant in game.css),
// which is deliberately NOT the slide-up every other modal uses. A player who
// has finished a hundred rounds should be able to tell at a glance that this
// one isn't the check.

import type { Announcement } from "../../shared/types";
import { Modal } from "./components";
import Markdown from "./Markdown";

export default function AnnouncementModal({
  announcement,
  /** 1-based place in the queue, and how long the queue is. */
  position,
  total,
  onClose,
}: {
  announcement: Announcement;
  position: number;
  total: number;
  onClose: () => void;
}) {
  const remaining = total - position;
  return (
    <Modal
      variant="notice"
      onClose={onClose}
      footer={
        <button className="btn btn--red notice__ok" onClick={onClose}>
          {remaining > 0 ? "Next note" : "Thanks, hon"}
        </button>
      }
    >
      <div className="notice">
        <p className="notice__eyebrow">
          A note from the kitchen
          {/* Only worth saying when there's actually a stack. */}
          {total > 1 && (
            <span className="notice__count">
              {position} of {total}
            </span>
          )}
        </p>
        <h2 className="notice__title">{announcement.header}</h2>
        <div className="notice__body">
          <Markdown source={announcement.body} />
        </div>
      </div>
    </Modal>
  );
}
