import { useEffect, useState } from "react";
import type { DeviceCheck as Check, DeviceDayState, DeviceStanding } from "../../shared/types";
import { MAX_GUESSES } from "../../shared/types";
import * as api from "./api";
import { Modal } from "../game/components";
import { KIND_META, RangeHint, ago, countryName, pct } from "./analyticsUi";

/**
 * One device's history, printed as a guest check: what it ordered, how it
 * solves, where it sits against the house, and the days it came in.
 *
 * Ink only. No colour is ever assigned to a player, and the dashboard's four
 * colour meanings are taken, so the device is solid ink and the house is a
 * thin mark. Nothing animates (the receipt's print-in lives on .modal--receipt,
 * which this card doesn't wear).
 *
 * The fold and what "the house" means are in worker/devicecheck.ts.
 */

const VERDICT: Record<Check["standing"], string> = {
  regular: "A regular",
  settled: "Everyone else",
  new: "New this week",
  none: "Never played",
};

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

const padDate = (date: string) => {
  const [y, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}/${y.slice(2)}`;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A receipt line: label, dotted leader, value. */
function Line({ label, children, sub }: { label: string; children: React.ReactNode; sub?: boolean }) {
  return (
    <div className={`dcheck__line${sub ? " dcheck__line--sub" : ""}`}>
      <span>{label}</span>
      <span className="dcheck__dots" aria-hidden="true" />
      <span className="dcheck__val">{children}</span>
    </div>
  );
}

/** n of m as a percentage, its range when thin. */
function Pct({ n, of }: { n: number; of: number }) {
  if (of === 0) return <>—</>;
  return (
    <>
      {n} of {of} · {pct(n, of)}%
      <RangeHint n={n} of={of} />
    </>
  );
}

/** The house's pooled rate: the percentage alone, its range when thin. */
function HousePct({ n, of }: { n: number; of: number }) {
  if (of === 0) return <>—</>;
  return (
    <>
      {pct(n, of)}%
      <RangeHint n={n} of={of} />
    </>
  );
}

/** Solved-in bars: the device in ink, the house as a tick. Lost rounds get a row. */
function Guesses({ c }: { c: Check }) {
  const mine = [...c.special.solvedIn, c.special.finished - c.special.solved];
  const house = [...c.houseSpecial.solvedIn, c.houseSpecial.finished - c.houseSpecial.solved];
  const share = (n: number, of: number) => (of === 0 ? 0 : (n / of) * 100);
  // Scaled to the tallest bar on either side, so neither runs off the paper.
  const top = Math.max(
    1,
    ...mine.map((n) => share(n, c.special.finished)),
    ...house.map((n) => share(n, c.houseSpecial.finished)),
  );
  return (
    <div className="dcheck__dist">
      {mine.map((n, i) => {
        const h = share(house[i], c.houseSpecial.finished);
        return (
          <div className="dcheck__distrow" key={i}>
            <span className="dcheck__distlabel">{i < MAX_GUESSES ? i + 1 : "Lost"}</span>
            <span className="dcheck__track">
              <span className="dcheck__bar" style={{ width: `${(share(n, c.special.finished) / top) * 100}%` }} />
              {c.houseSpecial.finished > 0 && (
                <span
                  className="dcheck__tick"
                  style={{ left: `${(h / top) * 100}%` }}
                  title={`House: ${Math.round(h)}%`}
                />
              )}
            </span>
            <span className="dcheck__distn">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

const STANDING_ROWS: { key: keyof Check["standings"]; label: string; fmt: (v: number) => string }[] = [
  { key: "daysPlayed", label: "Days played", fmt: (v) => String(v) },
  { key: "attendance", label: "Days in since first", fmt: (v) => `${v}%` },
  { key: "gap", label: "Usual gap", fmt: (v) => plural(v, "day") },
  { key: "roundsPerDay", label: "Rounds a day", fmt: (v) => v.toFixed(1) },
  { key: "longestRun", label: "Longest run", fmt: (v) => plural(v, "day") },
  { key: "medianGuesses", label: "Median guesses", fmt: (v) => String(v) },
];

/** One measure: the value, the house median, and a diamond where it ranks. */
function Standing({ label, s, fmt }: { label: string; s: DeviceStanding; fmt: (v: number) => string }) {
  return (
    <div className="dcheck__standing">
      <Line label={label}>
        {s.value === null ? "—" : fmt(s.value)}
        <span className="dcheck__house"> · house {s.house === null ? "—" : fmt(s.house)}</span>
      </Line>
      <div className="dcheck__ruler" aria-hidden="true">
        <span className="dcheck__mid" />
        {s.ahead !== null && <span className="dcheck__diamond" style={{ left: `${s.ahead}%` }} />}
      </div>
      <p className="dcheck__fine">{s.ahead === null ? "No rank" : `Ahead of ${s.ahead}% of ${s.of}`}</p>
    </div>
  );
}

const DAY_LABEL: Record<DeviceDayState, string> = {
  special: "Finished the Special",
  other: "Played, no Special finished",
  off: "Didn't play",
  before: "Before first round",
};

function Calendar({ c }: { c: Check }) {
  const since = c.calendar.filter((d) => d.state !== "before");
  const played = since.filter((d) => d.state === "special" || d.state === "other").length;
  return (
    <>
      <div
        className="dcheck__cal"
        role="img"
        aria-label={`Played ${played} of the last ${since.length} days`}
      >
        {c.calendar.map((d) => (
          <span
            key={d.day}
            className={`dcheck__day dcheck__day--${d.state}`}
            title={`${d.day} · ${DAY_LABEL[d.state]}`}
          />
        ))}
      </div>
      <p className="dcheck__fine dcheck__legend">
        <span className="dcheck__day dcheck__day--special" /> Special
        <span className="dcheck__day dcheck__day--other" /> Other only
        <span className="dcheck__day dcheck__day--off" /> Off · Mon at top
      </p>
    </>
  );
}

function Body({ c, now }: { c: Check; now: number }) {
  const where = [
    c.countries.length > 0 ? countryName(c.countries[0]) + (c.countries.length > 1 ? ` +${c.countries.length - 1}` : "") : null,
    c.surfaces.map((s) => (s === "discord" ? "Discord" : "Web")).join(" + ") || null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <div className="receipt__head">
        <div className="guest-check">
          <div className="guest-check__top">
            <p className="guest-check__house">Lunch Special</p>
            <p className="guest-check__no">
              <small>Device</small>
              {c.playerId.slice(0, 8)}
            </p>
          </div>
          <dl className="guest-check__boxes">
            <div className="guest-check__box">
              <dt>First seen</dt>
              <dd>{c.firstDay ? padDate(c.firstDay) : c.firstVisit ? padDate(c.firstVisit) : "—"}</dd>
            </div>
            <div className="guest-check__box">
              <dt>Days played</dt>
              <dd>{c.span === null ? "0" : `${c.daysPlayed} of ${c.span}`}</dd>
            </div>
            <div className="guest-check__box">
              <dt>Where</dt>
              <dd title={c.countries.map(countryName).join(", ")}>{where || "—"}</dd>
            </div>
          </dl>
        </div>
        <p className="receipt__verdict">{VERDICT[c.standing]}</p>
        <p className="dcheck__fine">
          {c.rank !== null && `${ordinal(c.rank)} of ${c.devices} by days played · `}
          regulars {c.cutoffDays}+ days
        </p>
      </div>

      {c.standing === "none" ? (
        <p className="dcheck__fine">Arrived, never started a round.</p>
      ) : (
        <>
          <h3 className="dcheck__h">The order</h3>
          {KIND_META.map(({ key, label }) => {
            const k = c.kinds[key];
            return (
              <div key={key}>
                <Line label={label}>{k.rounds === 0 ? "—" : plural(k.rounds, "round")}</Line>
                {k.rounds > 0 && (
                  <Line label="finished · solved" sub>
                    {k.finished} · {k.solved}
                  </Line>
                )}
              </div>
            );
          })}

          <h3 className="dcheck__h">Today's Special</h3>
          <Line label="Solved">
            <Pct n={c.special.solved} of={c.special.finished} />
          </Line>
          <Line label="house" sub>
            <HousePct n={c.houseSpecial.solved} of={c.houseSpecial.finished} />
          </Line>
          <Line label="Shared">
            <Pct n={c.special.shared} of={c.special.finished} />
          </Line>
          <Line label="house" sub>
            <HousePct n={c.houseSpecial.shared} of={c.houseSpecial.finished} />
          </Line>
          {c.special.finished > 0 ? (
            <>
              <Guesses c={c} />
              <p className="dcheck__fine">Bar: this device · tick: the house</p>
            </>
          ) : (
            <p className="dcheck__fine">No Special finished.</p>
          )}

          <h3 className="dcheck__h">Against the house</h3>
          {STANDING_ROWS.map((r) => (
            <Standing key={r.key} label={r.label} s={c.standings[r.key]} fmt={r.fmt} />
          ))}
          <p className="dcheck__fine">House: {plural(c.house, "device")} past their first week.</p>

          <h3 className="dcheck__h">Last {Math.ceil(c.calendar.length / 7)} weeks</h3>
          <Calendar c={c} />
        </>
      )}

      <div className="dcheck__foot">
        <Line label="Came from">{c.source ?? "—"}</Line>
        {c.firstVisit && c.firstDay && c.firstVisit !== c.firstDay && (
          <Line label="First arrived">{padDate(c.firstVisit)}</Line>
        )}
        <Line label="Last round">{c.lastAt ? ago(Date.parse(c.lastAt), now) : "—"}</Line>
        <p className="dcheck__fine dcheck__id">{c.playerId}</p>
      </div>
    </>
  );
}

export default function DeviceCheck({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const [check, setCheck] = useState<Check | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    setCheck(null);
    setError(null);
    api.getDeviceCheck(playerId).then(
      (c) => alive && setCheck(c),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [playerId]);

  return (
    <Modal onClose={onClose} label={`Device ${playerId.slice(0, 8)}`} className="dcheck">
      {check ? (
        <Body c={check} now={now} />
      ) : (
        <p className="dcheck__fine">{error ? `Couldn't load this device: ${error}` : "Printing the check…"}</p>
      )}
    </Modal>
  );
}
