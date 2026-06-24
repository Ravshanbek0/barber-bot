import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth";
import "./TopBar.css";

const TITLES = {
  "/": null, // brand on home
  "/bookings": "Bronlarim",
  "/chat": "Xabarlar",
  "/dashboard": "Boshqaruv",
  "/profile": "Profil",
};

export default function TopBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);

  const isSub = pathname.startsWith("/m/") || pathname.startsWith("/chat/");
  const title = TITLES[pathname];
  const initial = (user?.display_name || user?.first_name || "U")[0]?.toUpperCase();

  return (
    <header className="topbar">
      {isSub ? (
        <button className="topbar-back" onClick={() => navigate(-1)} aria-label="Orqaga">
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : title ? (
        <h1 className="topbar-title">{title}</h1>
      ) : (
        <Link to="/" className="brand">
          <span className="brand-mark">✂</span>
          <span className="brand-name">Barber</span>
        </Link>
      )}

      <Link to="/profile" className="topbar-avatar">
        {user?.photo_url ? (
          <img src={user.photo_url} alt="" />
        ) : (
          <span>{initial}</span>
        )}
      </Link>
    </header>
  );
}
