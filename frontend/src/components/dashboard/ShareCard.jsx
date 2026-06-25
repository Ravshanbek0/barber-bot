import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { tg } from "../../lib/telegram";

const BOT = import.meta.env.VITE_TELEGRAM_BOT || "";

/**
 * The master's personal booking link + QR. Sharing it (or printing the QR in
 * the shop) lets their existing clients book directly — no phone calls. The
 * link opens the bot with `?start=<handle>`, which replies with a button that
 * launches the Mini App straight on this master's profile.
 */
export default function ShareCard({ handle, displayName }) {
  const [copied, setCopied] = useState(false);
  const link = BOT && handle ? `https://t.me/${BOT}?start=${handle}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the link is selectable in the input as a fallback */
    }
  };

  const share = () => {
    const text = `${displayName} — onlayn navbatga yoziling:`;
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, "_blank");
  };

  if (!link) return null;

  return (
    <div className="card card-pad">
      <h3>Mijozlarni taklif qiling</h3>
      <p className="muted mt-1" style={{ fontSize: "var(--fs-sm)" }}>
        Shu havola yoki QR orqali mijozlaringiz to'g'ridan-to'g'ri sizga bron qiladi — qo'ng'iroqsiz.
        QR'ni salonda ko'rinadigan joyga osib qo'ying.
      </p>

      <div className="center mt-4">
        <div style={{ background: "#fff", padding: 12, borderRadius: 12, display: "inline-block" }}>
          <QRCodeSVG value={link} size={160} />
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
  );
}
