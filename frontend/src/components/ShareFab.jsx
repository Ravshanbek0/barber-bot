import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../api/client";
import { useAuth } from "../store/auth";
import { tg, haptic } from "../lib/telegram";
import "./ShareFab.css";

// Falls back to the known bot so the link/QR still render when the host
// (e.g. Vercel) hasn't set VITE_TELEGRAM_BOT — the .env file is gitignored.
const BOT = import.meta.env.VITE_TELEGRAM_BOT || "barberC_bot";

/**
 * A sticky, always-visible floating button (bottom-right, above the tab bar)
 * that masters can tap from anywhere to pull up their personal booking QR +
 * link. Mirrors the "compose" FAB pattern Telegram uses — the master never has
 * to dig into the Profil tab to show a client the QR.
 */
export default function ShareFab() {
  const isMaster = useAuth((s) => !!s.user?.is_master);
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [copied, setCopied] = useState(false);
  // An open chat thread has its own send button in this same bottom-right
  // corner — the floating QR button was sitting right on top of it.
  const inChatThread = /^\/chat\/.+/.test(location.pathname);

  // Load the handle/name once we know this is a master, so the QR is ready the
  // instant they tap. Silently ignore failures — the button just won't render.
  useEffect(() => {
    if (!isMaster) return;
    let alive = true;
    api.get("/masters/me/")
      .then(({ data }) => { if (alive) setProfile(data); })
      .catch(() => {});
    return () => { alive = false; };
  }, [isMaster]);

  const handle = profile?.handle;
  const link = handle ? `https://t.me/${BOT}?start=${handle}` : "";
  if (!isMaster || !link || inChatThread) return null;

  const toggle = () => { haptic("light"); setOpen((v) => !v); };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — link stays selectable in the input as a fallback */
    }
  };

  const share = () => {
    const text = `${profile.display_name} — onlayn navbatga yoziling:`;
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, "_blank");
  };

  return (
    <>
      <button
        className="share-fab"
        onClick={toggle}
        aria-label="Mijozlarni taklif qilish — QR"
      >
        <QrIcon />
      </button>

      {open && (
        <div className="sheet-overlay" onClick={() => setOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <button className="sheet-x" onClick={() => setOpen(false)} aria-label="Yopish">✕</button>
            <div className="sheet-grab" />
            <h3 className="center">Mijozlarni taklif qiling</h3>
            <p className="muted center mt-1" style={{ fontSize: "var(--fs-sm)" }}>
              QR'ni mijozga ko'rsating yoki salonga osib qo'ying — u to'g'ridan-to'g'ri sizga bron qiladi.
            </p>

            <div className="center mt-4">
              <div style={{ background: "#fff", padding: 14, borderRadius: 14, display: "inline-block" }}>
                <QRCodeSVG value={link} size={200} />
              </div>
            </div>

            <div className="field mt-4">
              <label>Sizning havolangiz</label>
              <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} />
            </div>

            <div className="row gap-2">
              <button className="btn btn-ghost grow" onClick={copy}>
                {copied ? "✓ Nusxalandi" : "Nusxalash"}
              </button>
              <button className="btn btn-primary grow" onClick={share}>
                Telegram'da ulashish
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function QrIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3M21 14v0M17 21h0M21 17v4h-4" />
    </svg>
  );
}
