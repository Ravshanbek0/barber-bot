import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../store/auth";
import { haptic } from "../lib/telegram";
import { buildSlots } from "../lib/slots";
import PhoneVerify from "../components/PhoneVerify.jsx";
import "./MasterDetail.css";

const fmt = (n) => new Intl.NumberFormat("uz-UZ").format(n) + " so'm";
const DAYS = ["Yak", "Dush", "Sesh", "Chor", "Pay", "Jum", "Shan"];
const DAYS_FULL = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];

// Pre-visit confirmation consent: asked once, then remembered — defaults to
// checked so it's not a per-booking chore. Anyone who unchecks it keeps that
// choice remembered too.
const CONSENT_KEY = "barber_confirm_consent";
const loadConsent = () => {
  const v = localStorage.getItem(CONSENT_KEY);
  return v === null ? true : v === "1";
};
const saveConsent = (v) => localStorage.setItem(CONSENT_KEY, v ? "1" : "0");

export default function MasterDetail() {
  const { handle } = useParams();
  const navigate = useNavigate();
  const [master, setMaster] = useState(null);
  const [sheet, setSheet] = useState(false);
  const [selected, setSelected] = useState([]); // multiple services per booking
  const [dayIdx, setDayIdx] = useState(0);
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState([]); // [{start: Date, end: Date}] already booked
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bookError, setBookError] = useState("");
  const [needPhone, setNeedPhone] = useState(false);
  const [agreed, setAgreed] = useState(loadConsent); // pre-visit confirmation consent
  const isRegistered = useAuth((s) => !!s.user?.is_registered);

  useEffect(() => {
    api.get(`/masters/${handle}/`).then(({ data }) => setMaster(data));
  }, [handle]);

  // Bookable window: today + up to 2 days ahead (max 2 kun erta).
  const days = useMemo(
    () =>
      Array.from({ length: 3 }).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return d;
      }),
    []
  );

  // Total length of the visit = sum of every chosen service's duration.
  const totalDur = useMemo(
    () => selected.reduce((s, x) => s + (x.duration_min || 30), 0) || 30,
    [selected]
  );

  // Fetch already-booked intervals for the selected day so taken slots show as busy.
  const loadBusy = () => {
    if (!master) return Promise.resolve();
    const d = days[dayIdx];
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return api
      .get("/bookings/taken/", { params: { master: master.id, date } })
      .then(({ data }) =>
        setBusy(data.map((b) => ({ start: new Date(b.start_at), end: new Date(b.end_at) })))
      )
      .catch(() => setBusy([]));
  };
  useEffect(() => {
    if (sheet) loadBusy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [master, dayIdx, sheet]);

  const slots = useMemo(() => {
    if (!master) return [];
    return buildSlots(master.working_hours, days[dayIdx], totalDur, busy);
  }, [master, days, dayIdx, totalDur, busy]);

  const toggleService = (svc) =>
    setSelected((cur) => {
      const next = cur.find((x) => x.id === svc.id)
        ? cur.filter((x) => x.id !== svc.id)
        : [...cur, svc];
      setTime(""); // duration changed → previously picked slot may no longer fit
      return next;
    });

  const openBooking = (svc) => {
    setSelected(svc ? [svc] : []);
    setTime("");
    setBookError("");
    setNeedPhone(false);
    setAgreed(loadConsent());
    setSheet(true);
    haptic("light");
  };

  const createBooking = async () => {
    setSubmitting(true);
    setBookError("");
    try {
      const d = days[dayIdx];
      const [hh, mm] = time.split(":").map(Number);
      const startAt = new Date(d);
      startAt.setHours(hh, mm, 0, 0);
      // All chosen services go into ONE booking starting at the picked time;
      // the backend sums their durations and prices.
      await api.post("/bookings/", {
        master: master.id,
        service_ids: selected.map((s) => s.id),
        start_at: startAt.toISOString(),
      });
      haptic("medium");
      setSheet(false);
      setNeedPhone(false);
      setDone(true);
    } catch (e) {
      // Slot taken in the meantime (or any rejection): tell the user and
      // refresh the busy list so the taken time greys out.
      setBookError(e.response?.data?.detail || "Bron qilinmadi. Boshqa vaqt tanlang.");
      setTime("");
      await loadBusy();
      haptic("light");
    } finally {
      setSubmitting(false);
    }
  };

  // Guests must add a phone (one-time) to become a real user before booking.
  const submit = () => {
    if (isRegistered) return createBooking();
    setNeedPhone(true);
  };

  const onMessage = async () => {
    const { data } = await api.post("/conversations/start/", { handle });
    navigate(`/chat/${data.id}`);
  };

  if (!master) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 140, borderRadius: 20 }} />
        <div className="skeleton mt-4" style={{ height: 80, borderRadius: 16 }} />
      </div>
    );
  }

  const initials = (master.display_name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("");

  return (
    <div className="md">
      <div className="md-header page-pad">
        <div className="md-avatar">{initials}</div>
        <div className="row between wrap gap-2" style={{ width: "100%" }}>
          <div>
            <h1 className="md-name">{master.display_name}</h1>
            <p className="muted">@{master.handle} · {master.city}</p>
          </div>
          <div className="row gap-2">
            <span className="badge badge-brass">★ {Number(master.avg_rating).toFixed(1)} ({master.reviews_count})</span>
            {master.accepts_walkins && <span className="badge badge-success">Navbatsiz</span>}
          </div>
        </div>
        {master.bio && <p className="md-bio">{master.bio}</p>}
        <div className="row gap-2 mt-3">
          <button className="btn btn-ghost btn-sm grow" onClick={onMessage}>Xabar yozish</button>
          {master.instagram && (
            <a className="btn btn-ghost btn-sm" href={`https://instagram.com/${master.instagram}`} target="_blank" rel="noreferrer">
              Instagram
            </a>
          )}
        </div>
      </div>

      {master.discounts?.length > 0 && (
        <div className="rail page-pad mt-5">
          {master.discounts.map((d) => (
            <div key={d.id} className="discount-pill">
              <strong>−{d.percent}%</strong>
              <span>{d.title}</span>
            </div>
          ))}
        </div>
      )}

      <section className="page-pad mt-6">
        <h2 className="section-title">Xizmatlar</h2>
        <div className="stack gap-2">
          {master.services.map((s) => (
            <div key={s.id} className="service-row card">
              <div className="stack">
                <strong>{s.name}</strong>
                <span className="faint" style={{ fontSize: "var(--fs-sm)" }}>{s.duration_min} daqiqa</span>
              </div>
              <div className="row gap-3">
                <span className="price">{fmt(s.price)}</span>
                <button className="btn btn-primary btn-sm" onClick={() => openBooking(s)}>Bron</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="page-pad mt-6">
        <h2 className="section-title">Ish vaqtlari</h2>
        <div className="card card-pad stack gap-2">
          {master.working_hours.map((h) => (
            <div key={h.id} className="row between">
              <span>{DAYS_FULL[(h.weekday + 1) % 7]}</span>
              <span className={h.is_day_off ? "faint" : "muted"}>
                {h.is_day_off ? "Dam olish" : `${h.start_time.slice(0, 5)} – ${h.end_time.slice(0, 5)}`}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="page-pad mt-6">
        <h2 className="section-title">Sharhlar ({master.reviews_count})</h2>
        {master.reviews?.length ? (
          <div className="stack gap-3">
            {master.reviews.map((r) => (
              <div key={r.id} className="card card-pad">
                <div className="row gap-2">
                  <span className="badge badge-brass">★ {r.rating}</span>
                  <strong>{r.author_name}</strong>
                </div>
                {r.comment && <p className="muted mt-2">{r.comment}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Hali sharhlar yo'q.</p>
        )}
      </section>

      {/* Sticky book bar */}
      {!done && (
        <div className="book-bar">
          <button className="btn btn-primary btn-block btn-lg" onClick={() => openBooking(master.services[0])}>
            Bron qilish
          </button>
        </div>
      )}

      {/* Booking bottom sheet */}
      {sheet && !needPhone && (
        <div className="sheet-overlay" onClick={() => setSheet(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <button className="sheet-x" onClick={() => setSheet(false)} aria-label="Yopish">✕</button>
            <div className="sheet-grab" />
            <h3>Bron qilish</h3>

                <div className="field mt-4">
                  <label>Xizmat <span className="faint">(bir nechtasini tanlash mumkin)</span></label>
                  <div className="rail">
                    {master.services.map((s) => (
                      <button
                        key={s.id}
                        className={`chip ${selected.find((x) => x.id === s.id) ? "active" : ""}`}
                        onClick={() => toggleService(s)}
                      >
                        {s.name} · {fmt(s.price)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label>Sana</label>
                  <div className="rail">
                    {days.map((d, i) => (
                      <button
                        key={i}
                        className={`day-chip ${dayIdx === i ? "active" : ""}`}
                        onClick={() => { setDayIdx(i); setTime(""); setBookError(""); }}
                      >
                        <span className="day-dow">{i === 0 ? "Bugun" : DAYS[d.getDay()]}</span>
                        <span className="day-num">{d.getDate()}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label>Vaqt</label>
                  {slots.length ? (
                    <div className="slots">
                      {slots.map((s) => (
                        <button
                          key={s.label}
                          className={`chip ${time === s.label ? "active" : ""}`}
                          onClick={() => setTime(s.label)}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="faint" style={{ fontSize: "var(--fs-sm)" }}>Bu kun bo'sh vaqt yo'q.</p>
                  )}
                </div>

                {bookError && (
                  <p className="mt-2" style={{ color: "var(--danger)", fontSize: "var(--fs-sm)" }}>{bookError}</p>
                )}

                {/* Pre-visit confirmation consent (#6) — a single-line checkbox,
                    pre-checked and remembered (loadConsent/saveConsent) so it's
                    not a per-booking chore. */}
                <label className="consent-check mt-3">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => {
                      setAgreed(e.target.checked);
                      saveConsent(e.target.checked);
                    }}
                  />
                  <span>Navbat vaqtiga yaqin tasdiqlash so'roviga javob beraman</span>
                </label>

                <button
                  className="btn btn-primary btn-block btn-lg mt-3"
                  disabled={!selected.length || !time || !agreed || submitting}
                  onClick={submit}
                >
                  {submitting ? "Yuborilmoqda…" : !agreed ? "Roziligingizni belgilang" : time ? `${time} ga bron qilish` : "Vaqtni tanlang"}
                </button>
          </div>
        </div>
      )}

      {/* Phone verification before booking (guest -> real user) */}
      {sheet && needPhone && (
        <PhoneVerify
          onVerified={() => { setNeedPhone(false); createBooking(); }}
          onClose={() => setNeedPhone(false)}
        />
      )}

      {/* Success sheet */}
      {done && (
        <div className="sheet-overlay" onClick={() => navigate("/bookings")}>
          <div className="sheet center" onClick={(e) => e.stopPropagation()}>
            <button className="sheet-x" onClick={() => navigate("/bookings")} aria-label="Yopish">✕</button>
            <div className="sheet-grab" />
            <div className="book-check">✓</div>
            <h3 className="mt-3">So'rovingiz yuborildi!</h3>
            <p className="muted mt-2">Usta tasdiqlagach xabar beramiz. Holatini "Bronlarim"da kuzating.</p>
            <button className="btn btn-primary btn-block btn-lg mt-5" onClick={() => navigate("/bookings")}>
              Bronlarim
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
