import { useEffect, useState } from "react";
import { MapContainer, TileLayer, useMap, useMapEvent } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { getPosition } from "../lib/geo";
import "./LocationPicker.css";

// Tashkent — a reasonable default center when there's no prior location and
// GPS hasn't resolved yet, so the map never opens on the ocean (0,0).
const DEFAULT_CENTER = { lat: 41.311081, lng: 69.240562 };

/** Reports the map's center whenever panning/zooming settles. */
function CenterTracker({ onMove }) {
  const map = useMapEvent("moveend", () => {
    const c = map.getCenter();
    onMove({ lat: c.lat, lng: c.lng });
  });
  // Also report once on mount so the initial center is captured.
  useEffect(() => {
    const c = map.getCenter();
    onMove({ lat: c.lat, lng: c.lng });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** Recenters the map imperatively when `target` changes (e.g. GPS button tap). */
function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 16);
  }, [target, map]);
  return null;
}

/**
 * Full map picker sheet: the pin stays fixed at the screen center and the
 * map pans underneath it (the standard "drop a pin" pattern) — no draggable
 * marker/icon assets to wire up, which keeps this simple under Vite bundling.
 */
export default function LocationPicker({ initial, onConfirm, onClose }) {
  const [center, setCenter] = useState(initial || DEFAULT_CENTER);
  const [flyTarget, setFlyTarget] = useState(initial || null);
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState("");

  const useMyLocation = async () => {
    setLocMsg(""); setLocating(true);
    try {
      const pos = await getPosition();
      setFlyTarget(pos);
    } catch {
      setLocMsg("❌ Joylashuv aniqlanmadi. Xaritani qo'lda suring.");
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet location-picker-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="sheet-x" onClick={onClose} aria-label="Yopish">✕</button>
        <div className="sheet-grab" />
        <h3>Joylashuvni xaritadan tanlang</h3>
        <p className="muted mt-1" style={{ fontSize: "var(--fs-sm)" }}>
          Xaritani suring — markazdagi nishon tanlangan nuqtani bildiradi.
        </p>

        <div className="map-wrap mt-3">
          <MapContainer center={[center.lat, center.lng]} zoom={15} className="map-box">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <CenterTracker onMove={setCenter} />
            <FlyTo target={flyTarget} />
          </MapContainer>
          <div className="map-pin" aria-hidden="true">📍</div>
        </div>

        {locMsg && <p className="mt-2" style={{ fontSize: "var(--fs-sm)" }}>{locMsg}</p>}

        <button className="btn btn-ghost btn-block mt-3" disabled={locating} onClick={useMyLocation}>
          {locating ? "Aniqlanmoqda…" : "📍 Joriy joylashuvimga o'tish"}
        </button>
        <button className="btn btn-primary btn-block mt-2" onClick={() => onConfirm(center)}>
          Shu joyni tanlash
        </button>
      </div>
    </div>
  );
}
