import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./Onboarding.css";
import { useAuth } from "../store/auth";

// Shared driver.js config — Uzbek labels, brass-themed popover.
const COMMON = {
  showProgress: true,
  progressText: "{{current}}/{{total}}",
  nextBtnText: "Keyingi →",
  prevBtnText: "← Oldingi",
  doneBtnText: "Tushunarli",
  popoverClass: "barber-tour",
  allowClose: true,
};

// Runs a guided tour once per device (keyed in localStorage).
function runTour(key, steps) {
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, "1"); // mark up-front so it never double-starts
  driver({ ...COMMON, steps }).drive();
}

const CLIENT_STEPS = [
  { element: '[data-tour="nav-primary"]', popover: { title: "Ustalar", description: "Yaqin ustalarni toping, reyting va narx bo'yicha saralang, yoqqanini ❤ bilan saqlang.", side: "top", align: "start" } },
  { element: '[data-tour="nav-bookings"]', popover: { title: "Bronlar", description: "Bron qilgan navbatlaringiz shu yerda turadi.", side: "top", align: "center" } },
  { element: '[data-tour="nav-chat"]', popover: { title: "Xabarlar", description: "Usta bilan to'g'ridan-to'g'ri yozishingiz mumkin.", side: "top", align: "center" } },
  { element: '[data-tour="nav-profile"]', popover: { title: "Profil", description: "Sozlamalar va istasangiz — “Usta bo'lish”.", side: "top", align: "end" } },
];

const MASTER_STEPS = [
  { element: '[data-tour="nav-primary"]', popover: { title: "Navbat", description: "Bugungi navbat va chegirmalarni shu yerdan boshqarasiz.", side: "top", align: "start" } },
  { element: '[data-tour="nav-profile"]', popover: { title: "Profil — shu yerdan boshlang", description: "Profil, ish vaqti va xizmatlarni to'ldirib “E'lon qilish”ni bosasiz — shundan so'ng mijozlar sizni topadi.", side: "top", align: "end" } },
  { element: '[data-tour="nav-bookings"]', popover: { title: "Bronlar", description: "Barcha bronlaringiz tarixi shu yerda.", side: "top", align: "center" } },
  { element: '[data-tour="nav-chat"]', popover: { title: "Xabarlar", description: "Mijozlar bilan yozishmalar.", side: "top", align: "center" } },
];

/** First-time guided tour for ordinary clients (skips while the promo modal is up). */
export function ClientOnboarding() {
  const authed = useAuth((s) => !!s.tokens?.access);
  const isMaster = useAuth((s) => !!s.user?.is_master);
  const [params] = useSearchParams();
  const promo = params.get("promo") === "master";

  useEffect(() => {
    if (!authed || isMaster || promo) return;
    // Delay so the bottom nav is laid out before the spotlight measures it.
    // runTour is idempotent (localStorage flag), so a re-run is harmless.
    const t = setTimeout(() => runTour("barber_onboarded_client", CLIENT_STEPS), 450);
    return () => clearTimeout(t);
  }, [authed, isMaster, promo]);

  return null;
}

/** First-time guided tour for a freshly-created master. */
export function MasterOnboarding() {
  const isMaster = useAuth((s) => !!s.user?.is_master);

  useEffect(() => {
    if (!isMaster) return;
    const t = setTimeout(() => runTour("barber_onboarded_master", MASTER_STEPS), 450);
    return () => clearTimeout(t);
  }, [isMaster]);

  return null;
}
