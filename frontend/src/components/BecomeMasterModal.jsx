import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../store/auth";
import { haptic } from "../lib/telegram";
import "./BecomeMasterModal.css";

/**
 * Promo modal that nudges a client to become a master. Shown when the Mini App
 * is opened with ?promo=master (the bot's "Ilovani ochish" button adds it) and
 * the viewer isn't already a master. Dismissible via the ✕/backdrop (just this
 * once) or "Hozircha mijoz bo'lib qolaman" (persists — stops the nagging for
 * good, here and in the bot's persistent keyboard).
 */
export default function BecomeMasterModal() {
  const isMaster = useAuth((s) => !!s.user?.is_master);
  const declinedMaster = useAuth((s) => !!s.user?.declined_master);
  const authed = useAuth((s) => !!s.tokens?.access);
  const patchUser = useAuth((s) => s.patchUser);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const open = params.get("promo") === "master" && authed && !isMaster && !declinedMaster;
  if (!open) return null;

  const close = () => {
    params.delete("promo");
    setParams(params, { replace: true });
  };

  const decline = () => {
    close();
    patchUser({ declined_master: true });
    api.patch("/auth/me/", { declined_master: true }).catch(() => {});
  };

  const become = () => {
    haptic("medium");
    close();
    navigate("/profile?become=1");
  };

  return (
    <div className="sheet-overlay" onClick={close}>
      <div className="sheet promo-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="promo-x" onClick={close} aria-label="Yopish">✕</button>

        <BarberArt />

        <h3 className="center promo-title">O'z ustangiz bo'ling</h3>
        <p className="muted center mt-2 promo-text">
          Mijozlarni qabul qiling, navbatingizni boshqaring va onlayn bron
          orqali ko'proq daromad qiling — bir bosishda boshlanadi.
        </p>

        <ul className="promo-perks">
          <li><span className="promo-dot">✓</span> Shaxsiy bron sahifa va QR havola</li>
          <li><span className="promo-dot">✓</span> Navbat, ish vaqti va chegirmalar nazorati</li>
          <li><span className="promo-dot">✓</span> Mijozlar sizni qidiruvdan topadi</li>
        </ul>

        <button className="btn btn-primary btn-lg btn-block mt-4" onClick={become}>
          ✂️ Usta bo'lish
        </button>
        <button className="btn btn-ghost btn-block mt-2" onClick={decline}>
          Hozircha mijoz bo'lib qolaman
        </button>
      </div>
    </div>
  );
}

/** Brass barbershop illustration — scissors + sparkle, on a soft glow. */
function BarberArt() {
  return (
    <div className="promo-art" aria-hidden="true">
      <svg viewBox="0 0 120 120" width="120" height="120">
        <defs>
          <linearGradient id="promoBrass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e2bd6a" />
            <stop offset="1" stopColor="#c0922f" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="54" fill="var(--brass-soft)" />
        <circle cx="60" cy="60" r="40" fill="none" stroke="url(#promoBrass)"
          strokeWidth="1.5" strokeDasharray="4 6" opacity="0.6" />
        {/* Scissors */}
        <g fill="none" stroke="url(#promoBrass)" strokeWidth="3.4"
          strokeLinecap="round" strokeLinejoin="round">
          <circle cx="44" cy="78" r="8" />
          <circle cx="76" cy="78" r="8" />
          <path d="M50 72 84 40" />
          <path d="M70 72 36 40" />
          <path d="M60 60 84 40" />
          <path d="M60 60 36 40" />
        </g>
        {/* Sparkles */}
        <path d="M86 30c0 4 2 6 6 6-4 0-6 2-6 6 0-4-2-6-6-6 4 0 6-2 6-6Z"
          fill="url(#promoBrass)" />
        <path d="M30 26c0 3 1.5 4.5 4.5 4.5-3 0-4.5 1.5-4.5 4.5 0-3-1.5-4.5-4.5-4.5 3 0 4.5-1.5 4.5-4.5Z"
          fill="var(--brass)" opacity="0.8" />
      </svg>
    </div>
  );
}
