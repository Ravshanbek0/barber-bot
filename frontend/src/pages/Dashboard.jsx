import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../store/auth";
import { useSocket } from "../hooks/useSocket";
import "./Dashboard.css";

import QueuePanel from "../components/dashboard/QueuePanel.jsx";
import DiscountPanel from "../components/dashboard/DiscountPanel.jsx";

// The "Navbat" page holds the day-to-day operations: the live queue and the
// promotions. Profile + working hours live on the Profil page instead.
const TABS = [
  { key: "queue", label: "Navbat" },
  { key: "discounts", label: "Chegirmalar" },
];

export default function Dashboard() {
  const [tab, setTab] = useState("queue");
  const [profile, setProfile] = useState(null);
  const [toast, setToast] = useState(null);
  const [queueVersion, setQueueVersion] = useState(0);
  const navigate = useNavigate();

  const loadProfile = () =>
    api.get("/masters/me/")
      .then(({ data }) => setProfile(data))
      .catch(() => setProfile(false));

  useEffect(() => { loadProfile(); }, []);

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
            Profil sahifasida ma'lumot, ish vaqti va xizmatlarni to'ldiring,
            so'ng e'lon qiling.
          </p>
          <button className="btn btn-primary btn-block mt-3" onClick={() => navigate("/profile")}>
            Profilni to'ldirish
          </button>
        </div>
      )}

      <div className="dash-tabs mt-4" data-tour="dash-tabs">
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
        {tab === "queue" && <QueuePanel profile={profile} version={queueVersion} />}
        {tab === "discounts" && <DiscountPanel profile={profile} onChange={loadProfile} />}
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
