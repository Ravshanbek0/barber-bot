/** Geolocation + reverse geocoding helpers. */

import { tg } from "./telegram";

/**
 * Resolve the device's {lat, lng}.
 *
 * Inside Telegram the in-app webview often blocks `navigator.geolocation`
 * (especially on Android), so prefer Telegram's own LocationManager
 * (Bot API 8.0+) and fall back to the browser API everywhere else.
 *
 * On denied Telegram access the rejected error carries `canOpenSettings`
 * so the caller can offer `openLocationSettings()`.
 */
export function getPosition() {
  const lm = tg?.LocationManager;
  // LocationManager only exists/works on Bot API 8.0+. Gate on the version so
  // older clients (where it may be a no-op that never calls back) fall straight
  // to the browser API instead of hanging.
  const tgSupported =
    lm &&
    typeof lm.getLocation === "function" &&
    typeof tg.isVersionAtLeast === "function" &&
    tg.isVersionAtLeast("8.0");

  if (tgSupported) {
    return new Promise((resolve, reject) => {
      let done = false;
      const settle = (fn, arg) => { if (!done) { done = true; fn(arg); } };
      // Safety net: never let a silent LocationManager leave the UI spinning.
      const timer = setTimeout(() => settle(reject, new Error("timeout")), 12000);
      const run = () => {
        if (!lm.isLocationAvailable) {
          clearTimeout(timer);
          return browserPosition().then((v) => settle(resolve, v), (e) => settle(reject, e));
        }
        lm.getLocation((loc) => {
          clearTimeout(timer);
          if (loc && loc.latitude != null && loc.longitude != null) {
            settle(resolve, { lat: loc.latitude, lng: loc.longitude });
          } else {
            const err = new Error("denied");
            err.canOpenSettings = typeof lm.openSettings === "function";
            settle(reject, err);
          }
        });
      };
      if (lm.isInited) run();
      else lm.init(run);
    });
  }
  return browserPosition();
}

function browserPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("no-geolocation"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  });
}

/** Open the Mini App's location-access settings (Telegram only). */
export function openLocationSettings() {
  try {
    tg?.LocationManager?.openSettings?.();
  } catch {
    /* ignore — unsupported client */
  }
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
