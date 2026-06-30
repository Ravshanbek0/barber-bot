import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { haptic } from "../lib/telegram";
import "./MasterCard.css";

const fmt = (n) =>
  n == null ? "—" : new Intl.NumberFormat("uz-UZ").format(Math.round(n)) + " so'm";

export default function MasterCard({ master, onUnsave }) {
  const initials = (master.display_name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

  const pct = master.discount_percent || 0;
  const hasDiscount = pct > 0 && master.min_price != null;
  // Discounted "from" price — the −% badge and this price are computed by the
  // backend off the same (cheapest) service, so they never disagree.
  const newPrice = hasDiscount ? master.min_price * (1 - pct / 100) : master.min_price;

  const [saved, setSaved] = useState(!!master.is_saved);
  const [busy, setBusy] = useState(false);

  const toggleSave = async (e) => {
    // The card is a link — don't navigate when tapping the heart.
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const next = !saved;
    setSaved(next); // optimistic
    setBusy(true);
    haptic("light");
    try {
      await api({ method: next ? "post" : "delete", url: `/masters/${master.handle}/save/` });
      if (!next) onUnsave?.(master.id);
    } catch {
      setSaved(!next); // revert on failure
    } finally {
      setBusy(false);
    }
  };

  return (
    <Link to={`/m/${master.handle}`} className="mcard card">
      <div className="mcard-avatar-wrap">
        <div className="mcard-avatar">
          <span>{initials}</span>
        </div>
        {hasDiscount && <span className="mcard-ribbon">−{pct}%</span>}
      </div>

      <div className="mcard-body">
        <div className="row between gap-2">
          <h3 className="mcard-name">{master.display_name}</h3>
          <div className="row gap-2" style={{ flex: "0 0 auto" }}>
            <span className="mcard-rating">
              ★ {Number(master.avg_rating).toFixed(1)}
            </span>
            <button
              className={`mcard-save ${saved ? "is-saved" : ""}`}
              onClick={toggleSave}
              aria-label={saved ? "Saqlanganlardan olib tashlash" : "Saqlash"}
              aria-pressed={saved}
            >
              <HeartIcon filled={saved} />
            </button>
          </div>
        </div>
        <p className="mcard-meta">
          {master.distance_km != null && (
            <span className="mcard-dist">📍 {master.distance_km} km</span>
          )}
          {master.city || master.address || "Manzil ko'rsatilmagan"}
          {master.address && master.city ? ` · ${master.address}` : ""}
        </p>
        <div className="mcard-foot mt-2">
          <div className="row gap-2 wrap">
            <span className="badge">{master.services_count} xizmat</span>
            {master.accepts_walkins && (
              <span className="badge badge-success">Navbatsiz</span>
            )}
          </div>
          <div className="mcard-pricing">
            {hasDiscount && <span className="mcard-old">{fmt(master.min_price)}</span>}
            <span className={`mcard-price ${hasDiscount ? "is-sale" : ""}`}>
              {fmt(newPrice)}<small> dan</small>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function HeartIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"
      fill={filled ? "currentColor" : "none"} stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20.5C6 16.5 3 13 3 9.2A4.2 4.2 0 0 1 12 6.6 4.2 4.2 0 0 1 21 9.2c0 3.8-3 7.3-9 11.3Z" />
    </svg>
  );
}
