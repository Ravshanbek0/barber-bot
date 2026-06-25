import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { haptic } from "../../lib/telegram";

const NEXT = {
  pending: { status: "confirmed", label: "Tasdiqlash" },
  confirmed: { status: "in_progress", label: "Boshlash" },
  in_progress: { status: "completed", label: "Yakunlash" },
};
const fmtTime = (s) => new Date(s).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
const money = (n) => new Intl.NumberFormat("uz-UZ").format(n || 0);

export default function QueuePanel({ handle, services = [], version }) {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

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

      <button className="btn btn-primary btn-block mt-4" onClick={() => { haptic("light"); setShowAdd(true); }}>
        ➕ Navbatga qo'shish
      </button>

      <div className="card mt-3">
        {queue.length === 0 ? (
          <p className="muted" style={{ padding: 20 }}>Bugun bronlar yo'q.</p>
        ) : (
          queue.map((b, i) => {
            const next = NEXT[b.status];
            return (
              <div key={b.id} className="queue-row" style={{ borderTop: i ? "1px solid var(--color-border)" : "none" }}>
                <span className="queue-pos">{b.queue_position || i + 1}</span>
                <div className="grow stack">
                  <strong>
                    {b.client_name}
                    {!b.client && <span className="badge" style={{ fontSize: "var(--fs-xs)", marginLeft: 8 }}>jonli</span>}
                  </strong>
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

      {showAdd && (
        <WalkinSheet
          services={services}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); load(); }}
        />
      )}
    </div>
  );
}

// Fast offline-client entry: optional name + tap a service + one button.
function WalkinSheet({ services, onClose, onAdded }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState([]);
  const [saving, setSaving] = useState(false);
  const activeServices = (services || []).filter((s) => s.is_active);

  const toggle = (id) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async () => {
    setSaving(true);
    try {
      await api.post("/bookings/walkin/", { name: name.trim(), service_ids: picked });
      haptic("medium");
      onAdded();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <h3>Navbatga qo'shish</h3>
        <p className="muted mt-1" style={{ fontSize: "var(--fs-sm)" }}>Hozir kelgan mijoz</p>

        <div className="field mt-3">
          <label>Ism (ixtiyoriy)</label>
          <input
            className="input"
            autoFocus
            value={name}
            placeholder="Masalan: Aziz"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {activeServices.length > 0 && (
          <div className="field">
            <label>Xizmat (ixtiyoriy)</label>
            <div className="row gap-2 wrap">
              {activeServices.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`chip ${picked.includes(s.id) ? "active" : ""}`}
                  onClick={() => toggle(s.id)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <button className="btn btn-primary btn-block btn-lg mt-3" disabled={saving} onClick={submit}>
          {saving ? "Qo'shilmoqda…" : "Navbatga qo'shish"}
        </button>
      </div>
    </div>
  );
}
