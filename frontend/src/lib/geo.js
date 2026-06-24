/** Browser geolocation + reverse geocoding helpers. */

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("no-geolocation"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  });
}

/** Best-effort city/area name from coordinates (OpenStreetMap, no key). */
export async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&zoom=14&accept-language=uz&lat=${lat}&lon=${lng}`
    );
    const d = await r.json();
    const a = d.address || {};
    return a.city || a.town || a.village || a.county || a.state || "";
  } catch {
    return "";
  }
}
