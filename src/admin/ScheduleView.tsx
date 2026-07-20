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
    try {
      await api.setSchedule(date, value === "" ? null : Number(value));
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
        Past days are locked. Only dishes marked <span className="badge">ready</span> can be scheduled. Dates roll over
        at midnight Eastern Time (America/New_York).
      </p>
      <ul className="sched-list">
        {entries.map((entry) => {
          const isPast = entry.date < today;
          const isToday = entry.date === today;
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
                    disabled={busyDate === entry.date}
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
                  {entry.dishId !== null && (
                    <span className="btn-row">
                      <button className="btn btn--ghost" onClick={() => onOpenDish(entry.dishId)}>
                        Edit
                      </button>
                      <button className="btn btn--ghost" onClick={() => void testPlay(entry.dishId!)}>
                        Test ▶
                      </button>
                    </span>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
