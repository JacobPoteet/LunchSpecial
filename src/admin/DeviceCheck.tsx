import { useEffect, useState, type ReactNode } from "react";
import type { DeviceCheck as Check, DeviceDayState, DeviceStanding } from "../../shared/types";
import { MAX_GUESSES } from "../../shared/types";
import { rangeLabel, rate } from "../../shared/sample";
import * as api from "./api";
import { Modal } from "../game/components";
import { KIND_META, SAMPLE_NOTE, ago, countryName, pct } from "./analyticsUi";

/**
 * One device's history, printed as a guest check: what it played, how it
 * solves, how it compares with other devices, and the days it came in.
 *
 * Tables with fixed columns, so a value and its range never fight a label for
 * a line. "Others" is the comparison group everywhere: every other device seen
 * a week or more (worker/devicecheck.ts). The footnote under each table says
 * which way it was summed.
 *
 * Ink only. No colour is ever assigned to a player, and the dashboard's four
 * colour meanings are taken. Nothing animates.
 */

const VERDICT: Record<Check["standing"], string> = {
  regular: "A regular",
  settled: "Not a regular",
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

/** A rate as a big percentage, with "n of m" and its range when thin under it. */
function RateCell({ n, of }: { n: number; of: number }) {
  if (of === 0) return <td>—</td>;
  const range = rangeLabel(rate(n, of));
  return (
    <td>
      {pct(n, of)}%
      <span className="dcheck__sub" title={range ? SAMPLE_NOTE : undefined}>
        {n} of {of}
        {range && ` · ${range}`}
      </span>
    </td>
  );
}

function Section({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="dcheck__section">
      <h3 className="dcheck__h">{title}</h3>
      {children}
      {note && <p className="dcheck__note">{note}</p>}
    </section>
  );
}

function Rounds({ c }: { c: Check }) {
  return (
    <table className="dcheck__table dcheck__table--rounds">
      <thead>
        <tr>
          <th scope="col">
            <span className="sr-only">Game</span>
          </th>
          <th scope="col">Played</th>
          <th scope="col">Finished</th>
          <th scope="col">Solved</th>
        </tr>
      </thead>
      <tbody>
        {KIND_META.map(({ key, label }) => {
          const k = c.kinds[key];
          return (
            <tr key={key} className={k.rounds === 0 ? "dcheck__row--none" : undefined}>
              <th scope="row">{label}</th>
              <td>{k.rounds || "—"}</td>
              <td>{k.rounds ? k.finished : "—"}</td>
              <td>{k.rounds ? k.solved : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Solved-in, as shares of finished Specials: this device as a solid bar, others
 * as an outlined one under it. Both bars share one scale, stretched to the
 * largest share on the table, so equal lengths mean equal shares.
 */
function Guesses({ c }: { c: Check }) {
  const mine = [...c.special.solvedIn, c.special.finished - c.special.solved];
  const others = [...c.houseSpecial.solvedIn, c.houseSpecial.finished - c.houseSpecial.solved];
  const share = (n: number, of: number) => (of === 0 ? 0 : Math.round((n / of) * 100));
  const top = Math.max(
    1,
    ...mine.map((n) => share(n, c.special.finished)),
    ...others.map((n) => share(n, c.houseSpecial.finished)),
  );
  return (
    <table className="dcheck__table dcheck__dist">
      <thead>
        <tr>
          <th scope="col">Guesses</th>
          <th scope="col">
            <span className="sr-only">Bars</span>
          </th>
          <th scope="col">
            <span className="dcheck__swatch dcheck__swatch--mine" /> This device
          </th>
          <th scope="col">
            <span className="dcheck__swatch dcheck__swatch--others" /> Others
          </th>
        </tr>
      </thead>
      <tbody>
        {mine.map((n, i) => {
          const m = share(n, c.special.finished);
          const o = share(others[i], c.houseSpecial.finished);
          return (
            <tr key={i}>
              <th scope="row">{i < MAX_GUESSES ? i + 1 : "Lost"}</th>
              <td className="dcheck__bars" aria-hidden="true">
                <span className="dcheck__bar dcheck__bar--mine" style={{ width: `${(m / top) * 100}%` }} />
                <span className="dcheck__bar dcheck__bar--others" style={{ width: `${(o / top) * 100}%` }} />
              </td>
              <td>{m}%</td>
              <td>{c.houseSpecial.finished === 0 ? "—" : `${o}%`}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const MEASURES: { key: keyof Check["standings"]; label: string; fmt: (v: number) => string }[] = [
  { key: "daysPlayed", label: "Days played", fmt: (v) => String(v) },
  { key: "attendance", label: "Share of days since first", fmt: (v) => `${v}%` },
  { key: "gap", label: "Usual days between visits", fmt: (v) => String(v) },
  { key: "roundsPerDay", label: "Rounds per day played", fmt: (v) => v.toFixed(1) },
  { key: "longestRun", label: "Longest run of days", fmt: (v) => String(v) },
  { key: "medianGuesses", label: "Median guesses to solve", fmt: (v) => String(v) },
];

function Measure({ label, s, fmt }: { label: string; s: DeviceStanding; fmt: (v: number) => string }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{s.value === null ? "—" : fmt(s.value)}</td>
      <td>{s.house === null ? "—" : fmt(s.house)}</td>
      <td>{s.rank === null ? "—" : `${ordinal(s.rank)} of ${s.of}`}</td>
    </tr>
  );
}

const DAY_LABEL: Record<DeviceDayState, string> = {
  special: "Finished the Special",
  other: "Played, no Special finished",
  off: "Didn't play",
  before: "Before its first round",
};

function Calendar({ c }: { c: Check }) {
  const since = c.calendar.filter((d) => d.state !== "before");
  const played = since.filter((d) => d.state === "special" || d.state === "other").length;
  return (
    <>
      <div className="dcheck__calwrap">
        <div className="dcheck__weekdays" aria-hidden="true">
          <span>M</span>
          <span />
          <span>W</span>
          <span />
          <span>F</span>
          <span />
          <span>S</span>
        </div>
        <div className="dcheck__cal" role="img" aria-label={`Played ${played} of the last ${since.length} days`}>
          {c.calendar.map((d) => (
            <span key={d.day} className={`dcheck__day dcheck__day--${d.state}`} title={`${d.day}: ${DAY_LABEL[d.state]}`} />
          ))}
        </div>
      </div>
      <ul className="dcheck__legend" aria-hidden="true">
        <li>
          <span className="dcheck__day dcheck__day--special" /> Finished the Special
        </li>
        <li>
          <span className="dcheck__day dcheck__day--other" /> Other rounds only
        </li>
        <li>
          <span className="dcheck__day dcheck__day--off" /> Didn't play
        </li>
      </ul>
    </>
  );
}

function Body({ c, now }: { c: Check; now: number }) {
  const playsOn = c.surfaces.map((s) => (s === "discord" ? "Discord" : "Web")).join(" + ");
  const others = plural(c.house, "other device");

  return (
    <>
      <div className="receipt__head dcheck__head">
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
              <dt>Plays on</dt>
              <dd>{playsOn || "—"}</dd>
            </div>
          </dl>
        </div>
        <p className="receipt__verdict">{VERDICT[c.standing]}</p>
        <p className="dcheck__note">
          {c.rank !== null && `${ordinal(c.rank)} of ${c.devices} devices for days played. `}
          Regulars have played {c.cutoffDays}+ days.
        </p>
      </div>

      {c.standing === "none" ? (
        <p className="dcheck__note">Arrived, never started a round.</p>
      ) : (
        <>
          <Section title="Rounds">
            <Rounds c={c} />
          </Section>

          <Section title="Today's Special">
            <table className="dcheck__table dcheck__table--vs">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Measure</span>
                  </th>
                  <th scope="col">This device</th>
                  <th scope="col">Others</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Solved</th>
                  <RateCell n={c.special.solved} of={c.special.finished} />
                  <RateCell n={c.houseSpecial.solved} of={c.houseSpecial.finished} />
                </tr>
                <tr>
                  <th scope="row">Shared</th>
                  <RateCell n={c.special.shared} of={c.special.finished} />
                  <RateCell n={c.houseSpecial.shared} of={c.houseSpecial.finished} />
                </tr>
              </tbody>
            </table>
            <p className="dcheck__note">Others: every Special the {others} seen a week or more finished.</p>
            {c.special.finished > 0 ? (
              <>
                <h4 className="dcheck__h4">Share of finished Specials, by guesses</h4>
                <Guesses c={c} />
              </>
            ) : (
              <p className="dcheck__note">No Special finished.</p>
            )}
          </Section>

          <Section
            title="Compared with others"
            note={`Others: the median of the ${others} seen a week or more. Rank includes this device; 1st has the most days, or the fewest gap days or guesses.`}
          >
            <table className="dcheck__table dcheck__table--measures">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Measure</span>
                  </th>
                  <th scope="col">This device</th>
                  <th scope="col">Others</th>
                  <th scope="col">Rank</th>
                </tr>
              </thead>
              <tbody>
                {MEASURES.map((m) => (
                  <Measure key={m.key} label={m.label} s={c.standings[m.key]} fmt={m.fmt} />
                ))}
              </tbody>
            </table>
          </Section>

          <Section title={`Last ${Math.ceil(c.calendar.length / 7)} weeks`}>
            <Calendar c={c} />
          </Section>
        </>
      )}

      <dl className="dcheck__foot">
        <dt>Came from</dt>
        <dd>{c.source ?? "—"}</dd>
        {c.firstVisit && c.firstDay && c.firstVisit !== c.firstDay && (
          <>
            <dt>First arrived</dt>
            <dd>{padDate(c.firstVisit)}</dd>
          </>
        )}
        <dt>Last round</dt>
        <dd>{c.lastAt ? ago(Date.parse(c.lastAt), now) : "—"}</dd>
        <dt>Countries</dt>
        <dd>{c.countries.length ? c.countries.map(countryName).join(", ") : "—"}</dd>
      </dl>
      <p className="dcheck__note dcheck__id">{c.playerId}</p>
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
        <p className="dcheck__note">{error ? `Couldn't load this device: ${error}` : "Printing the check…"}</p>
      )}
    </Modal>
  );
}
