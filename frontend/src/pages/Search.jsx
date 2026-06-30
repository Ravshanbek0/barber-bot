import { useEffect, useState } from "react";
import { api } from "../api/client";
import { getPosition } from "../lib/geo";
import MasterCard from "../components/MasterCard.jsx";
import "./Search.css";

export default function Search() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("-avg_rating"); // -avg_rating | created_at | near
  const [coords, setCoords] = useState(null);
  const [masters, setMasters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [geoError, setGeoError] = useState("");

  const fetchMasters = async (opts = {}) => {
    setLoading(true);
    try {
      if (sort === "saved") {
        const { data } = await api.get("/masters/saved/");
        setMasters(data.results || data);
        return;
      }
      const params = {};
      if (query) params.search = query;
      if (opts.near && opts.coords) {
        params.lat = opts.coords.lat;
        params.lng = opts.coords.lng;
      } else {
        params.ordering = sort;
      }
      const { data } = await api.get("/masters/", { params });
      setMasters(data.results || data);
    } catch {
      setMasters([]);
    } finally {
      setLoading(false);
    }
  };

  // Drop a card from the current list the instant it's un-saved in the
  // "Saqlangan" view, so the list reflects the action without a refetch.
  const removeFromList = (id) => setMasters((prev) => prev.filter((m) => m.id !== id));

  useEffect(() => {
    if (sort === "near") {
      if (coords) fetchMasters({ near: true, coords });
    } else {
      fetchMasters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  // Refresh master cards when the tab regains focus (ratings, new masters, etc.).
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== "hidden") {
        fetchMasters(sort === "near" && coords ? { near: true, coords } : {});
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, coords, query]);

  const onSearch = (e) => {
    e.preventDefault();
    fetchMasters(sort === "near" && coords ? { near: true, coords } : {});
  };

  const pickNearest = async () => {
    setGeoError("");
    try {
      const c = await getPosition();
      setCoords(c);
      setSort("near");
      fetchMasters({ near: true, coords: c });
    } catch {
      setGeoError("Joylashuvga ruxsat berilmadi. Brauzer/Telegram sozlamasini tekshiring.");
    }
  };

  return (
    <div>
      <section className="hero">
        <p className="eyebrow">Premium barber bron</p>
        <h1 className="hero-title">
          Ustani toping,<br />navbatsiz <span className="accent">bron qiling</span>
        </h1>
        <form className="search-bar" onSubmit={onSearch}>
          <svg className="search-icon" viewBox="0 0 24 24" width="18" height="18">
            <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM21 21l-4.3-4.3"
              fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            className="search-input"
            placeholder="Usta yoki xizmat…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" type="submit">Qidirish</button>
        </form>
      </section>

      <div className="page">
        <div className="row between">
          <h2 className="section-title" style={{ margin: 0 }}>
            Ustalar {!loading && <span className="faint" style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>· {masters.length}</span>}
          </h2>
          <div className="rail" style={{ flex: "0 1 auto" }}>
            <button className={`chip ${sort === "near" ? "active" : ""}`} onClick={pickNearest}>
              📍 Eng yaqin
            </button>
            <button className={`chip ${sort === "-avg_rating" ? "active" : ""}`} onClick={() => setSort("-avg_rating")}>
              Reyting
            </button>
            <button className={`chip ${sort === "created_at" ? "active" : ""}`} onClick={() => setSort("created_at")}>
              Yangi
            </button>
            <button className={`chip ${sort === "saved" ? "active" : ""}`} onClick={() => setSort("saved")}>
              ❤ Saqlangan
            </button>
          </div>
        </div>

        {geoError && <p className="mt-2" style={{ color: "var(--danger)", fontSize: "var(--fs-sm)" }}>{geoError}</p>}

        <div className="masters-list mt-4">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="card card-pad row gap-3">
                  <div className="skeleton" style={{ width: 64, height: 64, borderRadius: 14 }} />
                  <div className="grow">
                    <div className="skeleton" style={{ height: 16, width: "55%" }} />
                    <div className="skeleton mt-2" style={{ height: 12, width: "35%" }} />
                  </div>
                </div>
              ))
            : masters.map((m) => (
                <MasterCard
                  key={m.id}
                  master={m}
                  onUnsave={sort === "saved" ? removeFromList : undefined}
                />
              ))}
        </div>

        {!loading && masters.length === 0 && (
          <div className="empty">
            <div className="empty-emoji">{sort === "saved" ? "❤" : "💈"}</div>
            <p>{sort === "saved" ? "Saqlangan ustalar yo'q." : "Hech narsa topilmadi."}</p>
            <p className="faint">
              {sort === "saved"
                ? "Yoqgan ustani kartadagi yurakcha bilan saqlang."
                : "Boshqa so'rovni sinab ko'ring."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
