// Everything a board reports about itself while it is played, in one hook.
//
// Four effects the diner and the bar used to carry a copy of each: the
// anonymous analytics id, the seated beacon, Rich Presence, and the live
// Discord progress message. None of them is mode-specific beyond the inputs
// taken here, and two of the copies carried an ordering rule in a comment
// ("declared above the publisher") that this hook now enforces by being one
// function with its effects in one order.
//
// The start/complete/share beacons are NOT here. They fire from the guess
// handler and the share button, on an event rather than a render, and the
// bar's carry a tz offset the diner's don't.

import { useEffect, useRef } from "react";
import { beaconSeated, localToday, newAnalyticsId } from "../api";
import { buildPresence } from "../../shared/presence";
import type { Scorecard } from "../../shared/scorecard";
import type { RoundKind, Surface } from "../../shared/types";
import { setPresence } from "../discord/presence";
import { publishProgress, resetProgress } from "../discord/progress";
import { visitSource } from "./attribution";
import { getPlayerId, markSeated } from "./storage";

export interface TelemetryInput {
  /** Beacons, presence and the progress message all ride this one gate. */
  tracked: boolean;
  surface: Surface;
  /** True once the board is playable: the daily or the nightcap has loaded. */
  ready: boolean;
  /** The bit of the round these effects read. Guesses as a COUNT, on purpose. */
  round: { status: "playing" | "won" | "lost"; guesses: number; analyticsId?: string };
  kind: RoundKind;
  /** The puzzle or night number. 0 when the round isn't numbered. */
  puzzleNumber: number;
  /** Epoch ms this sitting opened, for the presence timer. */
  openedAt: number;
  /**
   * Identifies the board. When it changes, the Discord progress loop starts a
   * new message rather than editing the last one's into the new round's score.
   */
  boardKey: string;
  /** The board as a picture, for the channel. Never names the answer. */
  buildCard: () => Scorecard;
  /** Store the id on the round (and persist it where the round lives). */
  assignId: (id: string) => void;
}

export function useRoundTelemetry(input: TelemetryInput): void {
  const { tracked, surface, ready, round, kind, puzzleNumber, openedAt, boardKey, buildCard, assignId } = input;

  // One anonymous id per round so start/complete/share can be linked. Every
  // tracked kind gets one; the test modes never do. The "start" beacon itself
  // fires on the first guess, not here — opening a page isn't a started game.
  // Keyed on readiness: reads the round as it stands when the puzzle resolves.
  const assignRef = useRef(assignId);
  // eslint-disable-next-line react/refs -- the "latest ref" pattern; the write is the point
  assignRef.current = assignId;
  useEffect(() => {
    if (!tracked || !ready || round.analyticsId) return;
    assignRef.current(newAnalyticsId());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tracked]);

  // The funnel's top: this device opened a real, playable board. Arriving IS
  // the event. Once per browser session per ET day (markSeated), and the
  // server deduplicates by (day, device) on top of that. Carries where the
  // arrival came from, the only beacon that does.
  useEffect(() => {
    if (!tracked || !ready) return;
    if (!markSeated(localToday())) return;
    const source = visitSource();
    beaconSeated({ playerId: getPlayerId(), surface, ...(source ? { source } : {}) });
  }, [ready, tracked, surface]);

  // Rich Presence: a no-op off Discord. The copy never names the answer
  // (shared/presence.ts): a profile is read by people who haven't played.
  useEffect(() => {
    if (!tracked || !ready) return;
    setPresence(
      buildPresence({ kind, puzzleNumber, status: round.status, guesses: round.guesses, startedAt: openedAt }),
    );
  }, [tracked, ready, kind, puzzleNumber, round.status, round.guesses, openedAt]);

  // A new board is a new message. This runs BEFORE the publisher below because
  // effects fire in declaration order: a board restored from localStorage
  // publishes on mount, and resetting afterwards would orphan that post.
  useEffect(() => {
    resetProgress();
  }, [boardKey]);

  // The live message in the channel: posted on the first guess, edited on
  // every one after, past-tensed when the round ends. Not awaited and with no
  // error path: the module retires itself on the first failure.
  const cardRef = useRef(buildCard);
  // eslint-disable-next-line react/refs -- as above
  cardRef.current = buildCard;
  useEffect(() => {
    if (!tracked || !ready || surface !== "discord") return;
    publishProgress({ card: cardRef.current(), puzzleNumber, live: round.status === "playing" });
  }, [tracked, ready, surface, puzzleNumber, round.status, round.guesses]);
}
