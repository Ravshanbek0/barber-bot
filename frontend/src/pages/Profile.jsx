import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../store/auth";
import { isTelegram } from "../lib/telegram";
import PhoneVerify from "../components/PhoneVerify.jsx";

export default function Profile() {
  const { user, logout, patchUser } = useAuth();
  const navigate = useNavigate();
  const [becoming, setBecoming] = useState(false);
  const [needVerify, setNeedVerify] = useState(false);
  const initial = (user?.display_name || "U")[0]?.toUpperCase();
  const photo = user?.photo_url;

  const doBecome = async () => {
    setBecoming(true);
    try {
      await api.post("/masters/become/");
      patchUser({ is_master: true, role: "master" });
      navigate("/dashboard");
    } finally {
      setBecoming(false);
    }
  };

  const becomeMaster = () => {
    if (user?.is_master) return navigate("/dashboard");
    if (!user?.is_registered) return setNeedVerify(true); // verify phone first
    doBecome();
  };

  return (
    <div className="page">
      <div className="card card-pad center">
        <div
          className="avatar"
          style={{ width: 84, height: 84, fontSize: 32, margin: "0 auto" }}
        >
          {photo ? <img src={photo} alt="" /> : initial}
        </div>
        <h2 className="mt-3" style={{ fontFamily: "var(--font-sans)" }}>{user?.display_name}</h2>
        {user?.telegram_username && <p className="muted">@{user.telegram_username}</p>}
        <div className="row gap-2 mt-3" style={{ justifyContent: "center" }}>
          <span className={`badge ${user?.is_master ? "badge-brass" : ""}`}>
            {user?.is_master ? "Usta" : "Mijoz"}
          </span>
        </div>
      </div>

      <div className="stack gap-3 mt-5">
        <button className="btn btn-primary btn-lg btn-block" disabled={becoming} onClick={becomeMaster}>
          {user?.is_master ? "Boshqaruv paneli" : becoming ? "Tayyorlanmoqda…" : "Usta bo'lish"}
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
