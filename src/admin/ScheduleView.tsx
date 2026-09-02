import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminDishRow, ScheduleEntry } from "../../shared/types";
import { gameToday } from "../../shared/time";
import * as api from "./api";

function weekday(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The specials board. Every unlocked day carries the same three ways to change
 * it, because which one you reach for depends on how much you already know:
 *
 * - the **select**, when you have a dish in mind;
 * - **🎲**, when you don't. It rolls a dish that has never been the Special onto
 *   that day, in place, and is meant to be pressed repeatedly until something
 *   appealing turns up — the same pick as the Today tab's shuffle, so
 *   worker/shuffle.ts holds what "never" means and why consecutive clicks can't
 *   land on the dish already showing;
 * - **Clear**, when the answer is "not this one". It deletes the schedule row,
 *   which is a booking decision rather than a hole: an unbooked day runs on the
 *   deterministic fallback pick and never 404s.
 *
 * All three write immediately. There is no accept step on the shuffle, because a
 * roll that only proposed would need a second button to commit it and a third to
 * discard it, and the loop it exists for is roll, look, roll again.
 */
export default function ScheduleView({ onOpenDish }: { onOpenDish: (id: number | null) => void }) {
  const [entries, setEntries] = useState<ScheduleEntry[] | null>(null);
  const [dishes, setDishes] = useState<AdminDishRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busyDate, setBusyDate] = useState<string | null>(null);
  const today = gameToday();

  const reload = useCallback(() => {
    api.getSchedule().then(setEntries, (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    reload();
    api.getDishes().then(setDishes, () => {});
  }, [reload]);

  const schedulable = useMemo(() => dishes.filter((d) => d.isActive && d.schedulable), [dishes]);

  const assign = async (date: string, value: string) => {
    setBusyDate(date);
    setError(null);
    setOkMsg(null);
    try {
      await api.setSchedule(date, value === "" ? null : Number(value));
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyDate(null);
    }
  };

  // The count the roll reports is how much of the never-served catalogue is left
  // to roll through. Worth printing: it is the only place that number is
  // visible, and it is what says when clicking again has stopped being useful.
  const shuffleDay = async (date: string) => {
    setBusyDate(date);
    setError(null);
    setOkMsg(null);
    try {
      const picked = await api.shuffleSchedule(date);
      setOkMsg(
        `${weekday(date)} → ${picked.dishName}. Rolled from ${picked.remaining} dish${
          picked.remaining === 1 ? "" : "es"
        } that have never been the Special.`,
      );
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyDate(null);
    }
  };

  const clearDay = async (date: string) => {
    setBusyDate(date);
    setError(null);
    setOkMsg(null);
    try {
      await api.setSchedule(date, null);
      setOkMsg(`${weekday(date)} cleared — it will run on the automatic fallback pick.`);
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyDate(null);
    }
  };

  const autofill = async () => {
    setError(null);
    setOkMsg(null);
    try {
      const { filled } = await api.autofillSchedule();
      setOkMsg(filled === 0 ? "Nothing to fill — the board is full." : `Filled ${filled} empty day${filled === 1 ? "" : "s"}.`);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const testPlay = async (dishId: number) => {
    try {
      const { url } = await api.createPreview(dishId);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (error && !entries) return <p className="form-error">{error}</p>;
  if (!entries) return <p style={{ color: "var(--cream)" }}>Checking the specials board…</p>;

  return (
    <section className="panel">
      <div className="btn-row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Specials board</h2>
        <button className="btn" onClick={() => void autofill()}>
          Auto-fill next 30 days
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {okMsg && <p className="form-ok">{okMsg}</p>}
      <p className="dash-note" style={{ marginBottom: 10 }}>
        Past days are locked. Only dishes marked <span className="badge">ready</span> can be scheduled. 🎲 rolls a dish
        that has never been the Special onto a day; Clear hands the day back to the automatic fallback pick. Dates roll
        over at midnight Eastern Time (America/New_York).
      </p>
      <ul className="sched-list">
        {entries.map((entry) => {
          const isPast = entry.date < today;
          const isToday = entry.date === today;
          const busy = busyDate === entry.date;
          const classes = [
            "sched-row",
            isPast ? "sched-row--past" : "",
            isToday ? "sched-row--today" : "",
            entry.dishId === null ? "sched-row--empty" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <li key={entry.date} className={classes}>
              <span className="sched-date">
                {weekday(entry.date)}
              </span>
              {isPast ? (
                <span className="sched-dish">{entry.dishName ?? "— nothing served —"}</span>
              ) : (
                <>
                  <select
                    className="sched-dish"
                    value={entry.dishId ?? ""}
                    disabled={busy}
                    onChange={(e) => void assign(entry.date, e.target.value)}
                  >
                    <option value="">— empty (fallback dish) —</option>
                    {schedulable.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                    {entry.dishId !== null && !schedulable.some((d) => d.id === entry.dishId) && (
                      <option value={entry.dishId}>{entry.dishName}</option>
                    )}
                  </select>
                  <span className="btn-row">
                    {/* Offered on an empty day too, where it is the fastest way to
                        fill the gap — the pool is the same either way. */}
                    <button
                      className="btn btn--ghost"
                      disabled={busy}
                      title="Roll a dish that has never been the Special onto this day"
                      aria-label={`Shuffle ${weekday(entry.date)}`}
                      onClick={() => void shuffleDay(entry.date)}
                    >
                      🎲
                    </button>
                    {entry.dishId !== null && (
                      <>
                        <button
                          className="btn btn--ghost"
                          disabled={busy}
                          title="Unbook this day — it runs on the automatic fallback pick"
                          aria-label={`Clear ${weekday(entry.date)}`}
                          onClick={() => void clearDay(entry.date)}
                        >
                          Clear
                        </button>
                        <button className="btn btn--ghost" onClick={() => onOpenDish(entry.dishId)}>
                          Edit
                        </button>
                        <button className="btn btn--ghost" onClick={() => void testPlay(entry.dishId!)}>
                          Test ▶
                        </button>
                      </>
                    )}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
