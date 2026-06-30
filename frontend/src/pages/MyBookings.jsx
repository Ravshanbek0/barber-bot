import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../store/auth";
import { useSocket } from "../hooks/useSocket";
import { haptic } from "../lib/telegram";

const STATUS = {
  pending: { label: "Tasdiq kutilmoqda", cls: "badge" },
  confirmed: { label: "Tasdiqlangan", cls: "badge badge-brass" },
  in_progress: { label: "Jarayonda", cls: "badge badge-brass" },
  completed: { label: "Bajarildi", cls: "badge badge-success" },
  cancelled: { label: "Bekor qilingan", cls: "badge badge-danger" },
  no_show: { label: "Kelmadi", cls: "badge badge-danger" },
};

// Master's next-step action per status.
const NEXT = {
  pending: { status: "confirmed", label: "Tasdiqlash" },
  confirmed: { status: "in_progress", label: "Boshlash" },
  in_progress: { status: "completed", label: "Yakunlash" },
};

const money = (n) => (n == null ? "—" : new Intl.NumberFormat("uz-UZ").format(n) + " so'm");
const fmtDate = (s) =>
  new Date(s).toLocaleString("uz-UZ", {
    weekday: "short", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit",
  });
// Time-only label shown on each card (sana endi guruh sarlavhasida).
const fmtTime = (s) =>
  new Date(s).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });

// Local day key (yil-oy-kun) — bir kun ichidagi bronlarni guruhlash uchun.
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

// Guruh sarlavhasi: "Bugun", "Kecha" yoki to'liq sana.
const fmtDayHeader = (s) => {
  const d = new Date(s);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return "Bugun";
  if (dayKey(d) === dayKey(yest)) return "Kecha";
  return d.toLocaleDateString("uz-UZ", { weekday: "long", day: "2-digit", month: "long" });
};

// Bronlarni sana bo'yicha guruhlaydi; yangi kunlar va yangi bronlar eng tepada.
const groupByDay = (list) => {
  const groups = new Map();
  for (const b of list) {
    const k = dayKey(new Date(b.start_at));
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(b);
  }
  return Array.from(groups.values())
    .map((items) => items.sort((a, b) => new Date(b.start_at) - new Date(a.start_at)))
    .sort((a, b) => new Date(b[0].start_at) - new Date(a[0].start_at));
};

export default function MyBookings() {
  const userId = useAuth((s) => s.user?.id);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null); // booking opened in detail
  const [review, setReview] = useState(null);

  const load = () => {
    setLoading(true);
    api.get("/bookings/")
      .then(({ data }) => setBookings(data.results || data))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  // Live updates: refresh when a booking is created or its status changes.
  useSocket("/ws/notifications/", (d) => {
    if (d.event === "booking.created" || d.event === "booking.updated") load();
  });

  const setStatus = async (id, status) => {
    try {
      const { data } = await api.post(`/bookings/${id}/set_status/`, { status });
      haptic("light");
      setActive(data);
      load();
    } catch (e) {
      // Backend ham vaqtni tekshiradi (masalan, vaqtidan oldin boshlash) — xabarini ko'rsatamiz.
      alert(e?.response?.data?.detail || "Amalni bajarib bo'lmadi.");
    }
  };

  return (
    <div className="page">
      {loading ? (
        <div className="stack gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 88, borderRadius: 16 }} />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji">🗓️</div>
          <p>Hali bronlaringiz yo'q.</p>
          <Link className="btn btn-primary mt-4" to="/">Usta tanlash</Link>
        </div>
      ) : (
        <div className="stack gap-5">
          {groupByDay(bookings).map((group) => (
            <div key={dayKey(new Date(group[0].start_at))} className="stack gap-3">
              <div className="date-label">{fmtDayHeader(group[0].start_at)}</div>
              {group.map((b) => {
                const st = STATUS[b.status] || STATUS.pending;
                const iAmMaster = b.client !== userId;
                return (
                  <button key={b.id} className="card card-pad booking-card" onClick={() => setActive(b)}>
                    <div className="row between gap-2">
                      <strong>{iAmMaster ? b.client_name : b.master_name}</strong>
                      <span className={st.cls}>{st.label}</span>
                    </div>
                    <p className="muted mt-1" style={{ fontSize: "var(--fs-sm)" }}>
                      {b.service_name || "Xizmat"} · {fmtTime(b.start_at)}
                      {b.is_overdue && <span style={{ color: "var(--danger)" }}> · ⏰ vaqti o'tdi</span>}
                    </p>
                    <div className="row between mt-2">
                      <span className="faint" style={{ fontSize: "var(--fs-xs)" }}>
                        {iAmMaster ? "Sizga so'rov" : "Sizning broningiz"}
                        {b.queue_position ? ` · navbat #${b.queue_position}` : ""}
                      </span>
                      <span className="faint" style={{ fontSize: "var(--fs-xs)" }}>Batafsil ›</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {active && (
        <BookingDetail
          booking={active}
          iAmMaster={active.client !== userId}
          onClose={() => setActive(null)}
          onSetStatus={setStatus}
          onReview={(b) => { setActive(null); setReview(b); }}
        />
      )}
      {review && <ReviewSheet booking={review} onClose={() => { setReview(null); load(); }} />}
    </div>
  );
}

function BookingDetail({ booking: b, iAmMaster, onClose, onSetStatus, onReview }) {
  const st = STATUS[b.status] || STATUS.pending;
  const next = NEXT[b.status];
  const [askStart, setAskStart] = useState(false);

  // "Boshlash" qadami — bron belgilangan vaqtidan oldin boshlanmasligi kerak.
  const isStartStep = next?.status === "in_progress";
  const notYet = isStartStep && Date.now() < new Date(b.start_at).getTime();

  const handleNext = () => {
    // Vaqt kelgan/o'tgan bo'lsa, boshlashdan oldin ustadan so'raymiz.
    if (isStartStep) { haptic("light"); setAskStart(true); return; }
    onSetStatus(b.id, next.status);
  };

  const Row = ({ k, v }) => (
    <div className="row between" style={{ padding: "10px 0", borderBottom: "1px solid var(--border-soft)" }}>
      <span className="muted">{k}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
    </div>
  );

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <button className="sheet-x" onClick={onClose} aria-label="Yopish">✕</button>
        <div className="sheet-grab" />
        <div className="row between">
          <h3>Bron tafsilotlari</h3>
          <span className={st.cls}>{st.label}</span>
        </div>

        <div className="mt-3">
          <Row k={iAmMaster ? "Mijoz" : "Usta"} v={iAmMaster ? b.client_name : b.master_name} />
          {iAmMaster && b.client_phone && !b.client_phone.startsWith("tg") && (
            <div className="row between" style={{ padding: "10px 0", borderBottom: "1px solid var(--border-soft)" }}>
              <span className="muted">Telefon</span>
              <a className="price" href={`tel:${b.client_phone}`}>{b.client_phone}</a>
            </div>
          )}
          <Row k="Xizmat" v={b.service_name || "—"} />
          {b.service_duration ? <Row k="Davomiyligi" v={`${b.service_duration} daqiqa`} /> : null}
          <Row k="Sana / vaqt" v={fmtDate(b.start_at)} />
          {b.queue_position ? <Row k="Navbat" v={`#${b.queue_position}`} /> : null}
          <Row k="Narx" v={money(b.price_snapshot)} />
        </div>

        <div className="stack gap-2 mt-4">
          {iAmMaster ? (
            askStart && isStartStep ? (
              <>
                <p className="muted" style={{ textAlign: "center" }}>
                  Belgilangan vaqt: <strong>{fmtDate(b.start_at)}</strong>.<br />Hozir boshlaysizmi?
                </p>
                <button className="btn btn-primary btn-block btn-lg" onClick={() => onSetStatus(b.id, "in_progress")}>
                  Ha, boshlash
                </button>
                <button className="btn btn-ghost btn-block" onClick={() => setAskStart(false)}>
                  Yo'q
                </button>
              </>
            ) : (
              <>
                {next && (
                  <>
                    <button
                      className="btn btn-primary btn-block btn-lg"
                      disabled={notYet}
                      onClick={handleNext}
                    >
                      {next.label}
                    </button>
                    {notYet && (
                      <span className="faint" style={{ textAlign: "center", fontSize: "var(--fs-xs)" }}>
                        Belgilangan vaqt {fmtDate(b.start_at)} — hali boshlab bo'lmaydi.
                      </span>
                    )}
                  </>
                )}
                {!["completed", "cancelled", "no_show"].includes(b.status) && (
                  <>
                    <button className="btn btn-ghost btn-block" onClick={() => onSetStatus(b.id, "no_show")}>
                      Kelmadi
                    </button>
                    <button className="btn btn-danger btn-block" onClick={() => onSetStatus(b.id, "cancelled")}>
                      Bekor qilish
                    </button>
                  </>
                )}
              </>
            )
          ) : (
            <>
              {b.status === "completed" && !b.reviewed && (
                <button className="btn btn-outline btn-block btn-lg" onClick={() => onReview(b)}>
                  Baholash
                </button>
              )}
              {b.status === "completed" && b.reviewed && (
                <span className="badge badge-success" style={{ alignSelf: "center" }}>
                  ★ Baholangan
                </span>
              )}
              {["pending", "confirmed"].includes(b.status) && (
                <button className="btn btn-danger btn-block" onClick={() => onSetStatus(b.id, "cancelled")}>
                  Bekor qilish
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewSheet({ booking, onClose }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await api.post(`/masters/${booking.master_handle}/review/`, { rating, comment });
      haptic("medium");
      setDone(true);
      setTimeout(onClose, 1200);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <button className="sheet-x" onClick={onClose} aria-label="Yopish">✕</button>
        <div className="sheet-grab" />
        {done ? (
          <div className="center" style={{ padding: "12px 0" }}>
            <div style={{ fontSize: 40 }}>🙏</div>
            <h3 className="mt-2">Rahmat!</h3>
            <p className="muted mt-1">Sharhingiz qabul qilindi.</p>
          </div>
        ) : (
          <>
            <h3>{booking.master_name} ni baholang</h3>
            <div className="stars mt-4">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className={`star ${n <= rating ? "on" : ""}`} onClick={() => setRating(n)}>★</button>
              ))}
            </div>
            <div className="field mt-4">
              <label>Izoh (ixtiyoriy)</label>
              <textarea className="textarea" rows={3} value={comment}
                placeholder="Xizmat haqida fikringiz…" onChange={(e) => setComment(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-block btn-lg" disabled={saving} onClick={submit}>
              {saving ? "Yuborilmoqda…" : "Sharh yuborish"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
