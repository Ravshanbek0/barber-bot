import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import { haptic } from "../../lib/telegram";
import { buildSlots } from "../../lib/slots";

const NEXT = {
  pending: { status: "confirmed", label: "Tasdiqlash" },
  confirmed: { status: "in_progress", label: "Boshlash" },
  in_progress: { status: "completed", label: "Yakunlash" },
};
const fmtTime = (s) => new Date(s).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
const money = (n) => new Intl.NumberFormat("uz-UZ").format(n || 0);
const pad = (n) => String(n).padStart(2, "0");

export default function QueuePanel({ profile, version }) {
  const handle = profile.handle;
  const published = profile.is_active;
  const services = profile.services || [];
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

      {published ? (
        <button className="btn btn-primary btn-block mt-4" onClick={() => { haptic("light"); setShowAdd(true); }}>
          ➕ Navbatga qo'shish
        </button>
      ) : (
        <p className="muted mt-4" style={{ fontSize: "var(--fs-sm)" }}>
          Profilingizni e'lon qilgandan so'ng qo'lda navbat qo'shasiz.
        </p>
      )}

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
                    {b.is_overdue && <span className="badge badge-danger" style={{ fontSize: "var(--fs-xs)", marginLeft: 8 }}>⏰ vaqti o'tdi</span>}
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
          master={profile}
          services={services}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); load(); }}
        />
      )}
    </div>
  );
}

// Fast offline-client entry: no name (auto "Mijoz N"), pick a service + a free
// time slot (from now onward), one button.
function WalkinSheet({ master, services, onClose, onAdded }) {
  const [picked, setPicked] = useState([]);
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState([]);
  const [saving, setSaving] = useState(false);
  const activeServices = (services || []).filter((s) => s.is_active);

  // Visit length = sum of the chosen services (min 30) — drives which slots fit.
  const totalDur = useMemo(
    () =>
      activeServices
        .filter((s) => picked.includes(s.id))
        .reduce((sum, s) => sum + (s.duration_min || 30), 0) || 30,
    [picked, activeServices]
  );

  // Today's already-booked intervals, so taken times are excluded from slots.
  useEffect(() => {
    const d = new Date();
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    api.get("/bookings/taken/", { params: { master: master.id, date } })
      .then(({ data }) => setBusy(data.map((b) => ({ start: new Date(b.start_at), end: new Date(b.end_at) }))))
      .catch(() => setBusy([]));
  }, [master.id]);

  // leadMin=0: a master adds walk-ins for now/soon, no client lead time.
  const slots = useMemo(
    () => buildSlots(master.working_hours, new Date(), totalDur, busy, 0),
    [master, totalDur, busy]
  );

  // Default to the soonest free time so adding is one tap when time doesn't matter.
  useEffect(() => {
    setTime((t) => (t && slots.some((s) => s.label === t) ? t : slots[0]?.label || ""));
  }, [slots]);

  const toggle = (id) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async () => {
    if (!time) return;
    setSaving(true);
    try {
      const [hh, mm] = time.split(":").map(Number);
      const start = new Date();
      start.setHours(hh, mm, 0, 0);
      await api.post("/bookings/walkin/", { service_ids: picked, start_at: start.toISOString() });
      haptic("medium");
      onAdded();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <button className="sheet-x" onClick={onClose} aria-label="Yopish">✕</button>
        <div className="sheet-grab" />
        <h3>Navbatga qo'shish</h3>
        <p className="muted mt-1" style={{ fontSize: "var(--fs-sm)" }}>
          Ism avtomatik beriladi (Mijoz 1, Mijoz 2 …). Xizmat va vaqtni tanlang.
        </p>

        {activeServices.length > 0 && (
          <div className="field mt-3">
            <label>Xizmat <span className="faint">(ixtiyoriy)</span></label>
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

        <div className="field">
          <label>Vaqt</label>
          {slots.length ? (
            <div className="slots">
              {slots.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  className={`chip ${time === s.label ? "active" : ""}`}
                  onClick={() => setTime(s.label)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="faint" style={{ fontSize: "var(--fs-sm)" }}>Bugun bo'sh vaqt yo'q.</p>
          )}
        </div>

        <button className="btn btn-primary btn-block btn-lg mt-3" disabled={saving || !time} onClick={submit}>
          {saving ? "Qo'shilmoqda…" : time ? `${time} ga qo'shish` : "Vaqtni tanlang"}
        </button>
      </div>
    </div>
  );
}
