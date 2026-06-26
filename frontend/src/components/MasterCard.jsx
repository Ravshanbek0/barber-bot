import { Link } from "react-router-dom";
import "./MasterCard.css";

const fmt = (n) =>
  n == null ? "—" : new Intl.NumberFormat("uz-UZ").format(Math.round(n)) + " so'm";

export default function MasterCard({ master }) {
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
          <span className="mcard-rating">
            ★ {Number(master.avg_rating).toFixed(1)}
          </span>
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
