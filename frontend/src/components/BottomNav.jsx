import { NavLink } from "react-router-dom";
import { useAuth } from "../store/auth";
import { useNotifs } from "../store/notifications";
import { haptic } from "../lib/telegram";
import "./BottomNav.css";

const Icon = ({ d, fill }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <path d={d} fill={fill ? "currentColor" : "none"} stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ICONS = {
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM21 21l-4.3-4.3",
  queue: "M4 6h16M4 12h16M4 18h10",
  calendar:
    "M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z",
  chat: "M21 12a8 8 0 0 1-11.3 7.3L4 21l1.7-5.7A8 8 0 1 1 21 12Z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0",
};

export default function BottomNav() {
  const isMaster = useAuth((s) => !!s.user?.is_master);
  const unread = useNotifs((s) => s.unread);

  const tabs = isMaster
    ? [
        { to: "/dashboard", label: "Navbat", icon: "queue", tour: "nav-primary" },
        { to: "/bookings", label: "Bronlar", icon: "calendar", tour: "nav-bookings" },
        { to: "/chat", label: "Xabarlar", icon: "chat", tour: "nav-chat" },
        { to: "/profile", label: "Profil", icon: "user", tour: "nav-profile" },
      ]
    : [
        { to: "/", label: "Ustalar", icon: "search", tour: "nav-primary" },
        { to: "/bookings", label: "Bronlar", icon: "calendar", tour: "nav-bookings" },
        { to: "/chat", label: "Xabarlar", icon: "chat", tour: "nav-chat" },
        { to: "/profile", label: "Profil", icon: "user", tour: "nav-profile" },
      ];

  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.to === "/"}
          data-tour={t.tour}
          className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
          onClick={() => haptic("light")}
        >
          <span className="tab-icon">
            <Icon d={ICONS[t.icon]} />
            {t.icon === "chat" && unread > 0 && (
              <span className="tab-badge">{unread > 9 ? "9+" : unread}</span>
            )}
          </span>
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
