import { useEffect, useState } from "react";
import { api } from "../../api/client";

const NEXT = {
  pending: { status: "confirmed", label: "Tasdiqlash" },
  confirmed: { status: "in_progress", label: "Boshlash" },
  in_progress: { status: "completed", label: "Yakunlash" },
};
const fmtTime = (s) => new Date(s).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
const money = (n) => new Intl.NumberFormat("uz-UZ").format(n || 0);

export default function QueuePanel({ handle, version }) {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.get(`/bookings/queue/${handle}/`)
      .then(({ data }) => setQueue(data))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [handle, version]);

  const setStatus = async (id, status) => {
    await api.post(`/bookings/${id}/set_status/`, { status });
    load();
  };

  const active = queue.filter((b) => !["completed", "cancelled", "no_show"].includes(b.status));
  const earned = queue
    .filter((b) => b.status === "completed")
    .reduce((sum, b) => sum + Number(b.price_snapshot || 0), 0);

  if (loading) return <div className="skeleton" style={{ height: 160 }} />;

  return (
    <div>
      <div className="kpi-grid">
        <div className="card kpi"><div className="kpi-val">{active.length}</div><div className="kpi-label">Navbatda</div></div>
        <div className="card kpi"><div className="kpi-val">{queue.filter((b) => b.status === "completed").length}</div><div className="kpi-label">Bugun yakunlangan</div></div>
        <div className="card kpi"><div className="kpi-val">{money(earned)}</div><div className="kpi-label">Bugungi kirim (so'm)</div></div>
      </div>

      <div className="card mt-4">
        {queue.length === 0 ? (
          <p className="muted" style={{ padding: 20 }}>Bugun bronlar yo'q.</p>
        ) : (
          queue.map((b, i) => {
            const next = NEXT[b.status];
            return (
              <div key={b.id} className="queue-row" style={{ borderTop: i ? "1px solid var(--color-border)" : "none" }}>
                <span className="queue-pos">{b.queue_position || i + 1}</span>
                <div className="grow stack">
                  <strong>{b.client_name}</strong>
                  <span className="muted" style={{ fontSize: "var(--fs-sm)" }}>
                    {fmtTime(b.start_at)} · {b.service_name || "Xizmat"} · {money(b.price_snapshot)} so'm
                  </span>
                </div>
                <span className="badge">{b.status_label}</span>
                <div className="row gap-2">
                  {next && <button className="btn btn-primary btn-sm" onClick={() => setStatus(b.id, next.status)}>{next.label}</button>}
                  {b.status !== "completed" && b.status !== "cancelled" && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setStatus(b.id, "no_show")}>Kelmadi</button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
