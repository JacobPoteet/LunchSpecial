// A note from the kitchen: the modal an announcement is delivered in.
//
// It drops in from above and bounces to a stop, then lifts back out — the
// `notice` Modal variant in game.css, and deliberately NOT the slide-up every
// other modal uses. A player who has finished a hundred rounds should be able
// to tell at a glance that this one isn't the check.

import type { Announcement } from "../../shared/types";
import { Modal } from "./components";
import Markdown from "./Markdown";
import { playSfx } from "../audio";

/**
 * The card itself, without the modal around it. Exported because the admin's
 * "what the player sees" preview renders THIS — not a copy of it. Two hand-kept
 * copies of the same markup is exactly how a preview stops matching.
 */
export function NoticeCard({
  header,
  body,
  /** 1-based place in the queue, and how long the queue is. */
  position = 1,
  total = 1,
}: {
  header: string;
  body: string;
  position?: number;
  total?: number;
}) {
  return (
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
      <h2 className="notice__title">{header}</h2>
      <div className="notice__body">
        <Markdown source={body} />
      </div>
    </div>
  );
}

export default function AnnouncementModal({
  announcement,
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
        <button className="btn btn--red notice__ok" onClick={() => { playSfx("ui-click"); onClose(); }}>
          {remaining > 0 ? "Next note" : "Continue"}
        </button>
      }
    >
      <NoticeCard
        header={announcement.header}
        body={announcement.body}
        position={position}
        total={total}
      />
    </Modal>
  );
}
