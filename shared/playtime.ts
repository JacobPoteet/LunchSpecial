/**
 * Total play time as a person reads it, and the steps a click walks through.
 *
 * The full reading is "3d 4h 12m 37s". Each step converts the largest unit into
 * the one below it ("76h 12m 37s", "4572m 37s", "274357s") rather than dropping
 * it, so the last step is the true total in seconds. Past seconds it wraps.
 */

const UNITS = [
  { label: "d", seconds: 86_400 },
  { label: "h", seconds: 3_600 },
  { label: "m", seconds: 60 },
  { label: "s", seconds: 1 },
] as const;

/** How many readings a total has: one per unit from its largest nonzero down to seconds. */
export function playTimeSteps(totalSeconds: number): number {
  const s = Math.max(0, Math.floor(totalSeconds));
  const top = UNITS.findIndex((u) => s >= u.seconds);
  return top === -1 ? 1 : UNITS.length - top;
}

/** The total at `step` (wraps), largest unit first, every unit below it kept. */
export function playTimeLabel(totalSeconds: number, step = 0): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const top = UNITS.findIndex((u) => s >= u.seconds);
  const first = top === -1 ? UNITS.length - 1 : top;
  const steps = UNITS.length - first;
  const start = first + (((step % steps) + steps) % steps);
  let rest = s;
  const parts: string[] = [];
  for (let i = start; i < UNITS.length; i++) {
    const u = UNITS[i];
    const n = Math.floor(rest / u.seconds);
    rest -= n * u.seconds;
    parts.push(`${n.toLocaleString("en-US")}${u.label}`);
  }
  return parts.join(" ");
}
