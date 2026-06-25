import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../store/auth";
import { useSocket } from "../hooks/useSocket";
import "./Dashboard.css";

import QueuePanel from "../components/dashboard/QueuePanel.jsx";
import HoursPanel from "../components/dashboard/HoursPanel.jsx";
import DiscountPanel from "../components/dashboard/DiscountPanel.jsx";
import ProfilePanel from "../components/dashboard/ProfilePanel.jsx";

const TABS = [
  { key: "queue", label: "Navbat" },
  { key: "hours", label: "Ish vaqti" },
  { key: "discounts", label: "Chegirmalar" },
  { key: "profile", label: "Profil" },
];

const MISSING_LABELS = {
  phone: "telefon raqami (tasdiqlash)",
  display_name: "ism",
  location: "joylashuv (geolokatsiya)",
  services: "kamida 1 ta xizmat",
  hours: "ish vaqti",
};

export default function Dashboard() {
  const [tab, setTab] = useState("queue");
  const [profile, setProfile] = useState(null);
  const [toast, setToast] = useState(null);
  const [queueVersion, setQueueVersion] = useState(0);
  const [publishMsg, setPublishMsg] = useState("");
  const [publishing, setPublishing] = useState(false);
  const firstLoad = useRef(true);

  const loadProfile = () =>
    api.get("/masters/me/").then(({ data }) => {
      setProfile(data);
      // Fresh masters land on a draft — open the Profil tab so they fill it in.
      if (firstLoad.current) {
        firstLoad.current = false;
        if (!data.is_active) setTab("profile");
      }
    }).catch(() => setProfile(false));

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

  useSocket("/ws/notifications/", (data) => {
    if (data.event === "booking.created") {
      setToast(`Yangi bron: ${data.booking?.client_name || "mijoz"}`);
      setQueueVersion((v) => v + 1);
      setTimeout(() => setToast(null), 4000);
    } else if (data.event === "booking.updated") {
      setQueueVersion((v) => v + 1);
    }
  });

  if (profile === false) return <CreateProfile onCreated={loadProfile} />;
  if (!profile) return <div className="page"><div className="skeleton" style={{ height: 200, borderRadius: 16 }} /></div>;

  return (
    <div className="page">
      <div className="row between wrap gap-3">
        <div>
          <h2 style={{ fontFamily: "var(--font-sans)" }}>{profile.display_name}</h2>
          <p className="muted">@{profile.handle}</p>
        </div>
        <div className="row gap-2">
          <span className="badge badge-brass">★ {Number(profile.avg_rating).toFixed(1)}</span>
          <span className={`badge ${profile.is_active ? "badge-success" : "badge-danger"}`}>
            {profile.is_active ? "E'lon qilingan" : "Qoralama"}
          </span>
        </div>
      </div>

      {!profile.is_active && (
        <div className="card card-pad mt-4" style={{ borderColor: "var(--brass)" }}>
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

      <div className="dash-tabs mt-4">
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
        {tab === "queue" && <QueuePanel handle={profile.handle} services={profile.services} version={queueVersion} published={profile.is_active} />}
        {tab === "hours" && <HoursPanel profile={profile} onChange={loadProfile} />}
        {tab === "discounts" && <DiscountPanel profile={profile} onChange={loadProfile} />}
        {tab === "profile" && <ProfilePanel profile={profile} onChange={loadProfile} />}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function CreateProfile({ onCreated }) {
  const patchUser = useAuth((s) => s.patchUser);
  const [saving, setSaving] = useState(false);

  const become = async () => {
    setSaving(true);
    try {
      await api.post("/masters/become/");
      patchUser({ is_master: true, role: "master", is_registered: true });
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="card card-pad center">
        <div className="empty-emoji">💈</div>
        <h2 style={{ fontFamily: "var(--font-sans)" }}>Usta bo'lasizmi?</h2>
        <p className="muted mt-2">
          Ismingiz Telegramdan olinadi. Bir bosishda boshlang — keyin xizmatlar,
          ish vaqti va rasmlarni qo'shasiz.
        </p>
        <button className="btn btn-primary btn-lg btn-block mt-5" disabled={saving} onClick={become}>
          {saving ? "Tayyorlanmoqda…" : "Usta bo'lish"}
        </button>
      </div>
    </div>
  );
}
