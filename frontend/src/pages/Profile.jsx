import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../store/auth";
import { isTelegram } from "../lib/telegram";
import PhoneVerify from "../components/PhoneVerify.jsx";
import ProfilePanel from "../components/dashboard/ProfilePanel.jsx";
import HoursPanel from "../components/dashboard/HoursPanel.jsx";
import "./Dashboard.css";

export default function Profile() {
  const isMaster = useAuth((s) => !!s.user?.is_master);
  return isMaster ? <MasterProfile /> : <ClientProfile />;
}

// ---------------------------------------------------------------------------
//  Master: profile fields + working hours + go-live, all on the Profil page.
// ---------------------------------------------------------------------------
const MISSING_LABELS = {
  phone: "telefon raqami (tasdiqlash)",
  display_name: "ism",
  location: "joylashuv (geolokatsiya)",
  services: "kamida 1 ta xizmat",
  hours: "ish vaqti",
};

const TABS = [
  { key: "profile", label: "Profil" },
  { key: "hours", label: "Ish vaqti" },
];

function MasterProfile() {
  const navigate = useNavigate();
  const { user, patchUser } = useAuth();
  const [tab, setTab] = useState("profile");
  const [profile, setProfile] = useState(null);
  const [publishMsg, setPublishMsg] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState(null);
  const [leaving, setLeaving] = useState(false);

  const loadProfile = () =>
    api.get("/masters/me/").then(({ data }) => setProfile(data)).catch(() => setProfile(false));
  useEffect(() => { loadProfile(); }, []);

  const publish = async () => {
    setPublishMsg(""); setPublishing(true);
    try {
      await api.post("/masters/publish/");
      setToast("✅ Profilingiz e'lon qilindi!");
      setTimeout(() => setToast(null), 4000);
      loadProfile();
    } catch (e) {
      const missing = e.response?.data?.missing || [];
      setPublishMsg(
        missing.length
          ? "To'ldiring: " + missing.map((m) => MISSING_LABELS[m] || m).join(", ")
          : "E'lon qilinmadi."
      );
    } finally {
      setPublishing(false);
    }
  };

  const leaveMaster = async () => {
    setLeaving(true);
    try {
      await api.post("/masters/leave/");
      patchUser({ is_master: false, role: "client" });
      navigate("/");
    } finally {
      setLeaving(false);
    }
  };

  if (!profile) return <div className="page"><div className="skeleton" style={{ height: 200, borderRadius: 16 }} /></div>;

  return (
    <div className="page">
      <div className="row between wrap gap-3">
        <div>
          <h2 style={{ fontFamily: "var(--font-sans)" }}>{profile.display_name}</h2>
          <p className="muted">@{profile.handle}</p>
        </div>
        <span className={`badge ${profile.is_active ? "badge-success" : "badge-danger"}`}>
          {profile.is_active ? "E'lon qilingan" : "Qoralama"}
        </span>
      </div>

      {!profile.is_active && (
        <div className="card card-pad mt-4" style={{ borderColor: "var(--brass)" }} data-tour="publish">
          <strong>Profilingiz hali ko'rinmaydi</strong>
          <p className="muted mt-1" style={{ fontSize: "var(--fs-sm)" }}>
            Mijozlar topishi uchun majburiy maydonlarni to'ldiring: telefon tasdiqlash,
            joylashuv (geolokatsiya), kamida 1 ta xizmat va ish vaqti.
          </p>
          {publishMsg && <p className="mt-2" style={{ color: "var(--danger)", fontSize: "var(--fs-sm)" }}>{publishMsg}</p>}
          <button className="btn btn-primary btn-block mt-3" disabled={publishing} onClick={publish}>
            {publishing ? "Tekshirilmoqda…" : "E'lon qilish"}
          </button>
        </div>
      )}

      <div className="dash-tabs mt-4" data-tour="profile-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`dash-tab ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "profile" && <ProfilePanel profile={profile} onChange={loadProfile} />}
        {tab === "hours" && <HoursPanel profile={profile} onChange={loadProfile} />}
      </div>

      <button className="btn btn-ghost btn-block mt-6" disabled={leaving} onClick={leaveMaster}>
        {leaving ? "Chiqilmoqda…" : "Usta rejimidan chiqish"}
      </button>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Client: identity card + become-a-master.
// ---------------------------------------------------------------------------
function ClientProfile() {
  const { user, logout, patchUser } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [becoming, setBecoming] = useState(false);
  const [becomeError, setBecomeError] = useState(null);
  const [needVerify, setNeedVerify] = useState(false);
  const autoRan = useRef(false);
  const initial = (user?.display_name || "U")[0]?.toUpperCase();
  const photo = user?.photo_url;

  const doBecome = async () => {
    setBecoming(true);
    setBecomeError(null);
    try {
      await api.post("/masters/become/");
      patchUser({ is_master: true, role: "master" });
      navigate("/dashboard");
    } catch (e) {
      setBecomeError(
        e.response?.data?.detail ||
        "Xatolik yuz berdi. Internetni tekshirib qayta urinib ko'ring."
      );
    } finally {
      setBecoming(false);
    }
  };

  const becomeMaster = () => {
    if (!user?.is_registered) return setNeedVerify(true); // verify phone first
    doBecome();
  };

  // Deep link from the bot ("Usta bo'lish" button → /profile?become=1) drops the
  // user straight into the become-a-master flow. Run once, then clear the param.
  useEffect(() => {
    if (autoRan.current || params.get("become") !== "1") return;
    autoRan.current = true;
    params.delete("become");
    setParams(params, { replace: true });
    becomeMaster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  return (
    <div className="page">
      <div className="card card-pad center">
        <div className="avatar" style={{ width: 84, height: 84, fontSize: 32, margin: "0 auto" }}>
          {photo ? <img src={photo} alt="" /> : initial}
        </div>
        <h2 className="mt-3" style={{ fontFamily: "var(--font-sans)" }}>{user?.display_name}</h2>
        {user?.telegram_username && <p className="muted">@{user.telegram_username}</p>}
        <div className="row gap-2 mt-3" style={{ justifyContent: "center" }}>
          <span className="badge">Mijoz</span>
        </div>
      </div>

      <div className="stack gap-3 mt-5">
        {becomeError && <p style={{ color: "var(--danger, #e5484d)" }}>{becomeError}</p>}
        <button className="btn btn-primary btn-lg btn-block" disabled={becoming} onClick={becomeMaster} data-tour="become">
          {becoming ? "Tayyorlanmoqda…" : "Usta bo'lish"}
        </button>
        <button className="btn btn-ghost btn-block" onClick={() => navigate("/bookings")}>
          Bronlarim
        </button>
      </div>

      {!isTelegram() && (
        <button className="btn btn-ghost btn-block mt-6" onClick={logout}>
          Chiqish (dev)
        </button>
      )}

      <p className="faint center mt-6" style={{ fontSize: "var(--fs-xs)" }}>
        Barber · Telegram Mini App
      </p>

      {needVerify && (
        <PhoneVerify
          title="Usta bo'lish uchun tasdiqlang"
          onVerified={() => { setNeedVerify(false); doBecome(); }}
          onClose={() => setNeedVerify(false)}
        />
      )}
    </div>
  );
}
