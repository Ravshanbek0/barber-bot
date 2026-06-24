import { Link } from "react-router-dom";
import "./MasterCard.css";

const fmt = (n) =>
  n == null ? "—" : new Intl.NumberFormat("uz-UZ").format(n) + " so'm";

export default function MasterCard({ master }) {
  const initials = (master.display_name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

  return (
    <Link to={`/m/${master.handle}`} className="mcard card">
      <div className="mcard-avatar">
        {master.cover ? (
          <img src={master.cover} alt={master.display_name} />
        ) : (
          <span>{initials}</span>
        )}
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
        <div className="row between mt-2 gap-2">
          <div className="row gap-2">
            <span className="badge">{master.services_count} xizmat</span>
            {master.accepts_walkins && (
              <span className="badge badge-success">Navbatsiz</span>
            )}
          </div>
          <span className="mcard-price">{fmt(master.min_price)}<small> dan</small></span>
        </div>
      </div>
    </Link>
  );
}
