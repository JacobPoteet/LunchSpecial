import { useEffect, useState } from "react";
import type { AdminDashboard } from "../../shared/types";
import * as api from "./api";
import type { AdminView } from "./AdminApp";

export default function Dashboard({
  onNavigate,
  onOpenDish,
}: {
  onNavigate: (view: AdminView) => void;
  onOpenDish: (id: number | null) => void;
}) {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getDashboard().then(setData, (e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <p style={{ color: "var(--cream)" }}>Loading the front of house…</p>;

  const lowSchedule = data.scheduledAhead < 7;

  return (
    <>
      <div className="dash-grid">
        <section className="panel">
          <h2>Today's Special</h2>
          {data.today.dishName ? (
            <>
              <p className="dash-big">{data.today.dishName}</p>
              <p className="dash-note">Serving on {data.today.date}</p>
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button className="btn btn--ghost" onClick={() => onOpenDish(data.today.dishId)}>
                  Edit dish
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="dash-big">Nothing scheduled!</p>
              <p className="dash-note">
                Players will get an automatic fallback dish today. Assign one in the schedule.
              </p>
            </>
          )}
        </section>

        <section className={lowSchedule ? "panel panel--warn" : "panel"}>
          <h2>Schedule health</h2>
          <p className="dash-big">
            {data.scheduledAhead} day{data.scheduledAhead === 1 ? "" : "s"} ahead
          </p>
          <p className="dash-note">
            {data.firstGap ? `First empty day: ${data.firstGap}` : "Next 60 days fully booked"}
            {lowSchedule && " — time to fill the board!"}
          </p>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => onNavigate("schedule")}>
              Open schedule
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Quick actions</h2>
          <div className="btn-row">
            <button className="btn btn--red" onClick={() => onOpenDish(null)}>
              + New dish
            </button>
            <button className="btn btn--ghost" onClick={() => onNavigate("dishes")}>
              All dishes
            </button>
          </div>
        </section>
      </div>

      <section className={data.warnings.length > 0 ? "panel panel--warn" : "panel"}>
        <h2>Content warnings</h2>
        {data.warnings.length === 0 ? (
          <p className="dash-note">All dishes are complete. Sparkling clean kitchen.</p>
        ) : (
          <ul className="warning-list">
            {data.warnings.map((w) => (
              <li key={`${w.kind}-${w.dishId}`}>
                <span>
                  <strong>{w.dishName}</strong> — {w.kind === "missing-clues" ? "clues incomplete" : "too few ingredients"} ({w.detail})
                </span>
                <button className="btn btn--ghost" onClick={() => onOpenDish(w.dishId)}>
                  Fix
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
