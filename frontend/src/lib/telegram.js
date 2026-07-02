/**
 * Thin wrapper around the Telegram Mini App SDK (window.Telegram.WebApp).
 * Safe to call in a normal browser: every helper degrades gracefully.
 */
export const tg =
  typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;

/** True when the app is actually running inside Telegram (has initData). */
export function isTelegram() {
  return !!tg?.initData && tg.initData.length > 0;
}

/** Raw signed initData string to send to the backend for verification. */
export function getInitData() {
  return tg?.initData || "";
}

/**
 * True when we're confident this is a real Telegram client, independent of
 * whether `initData` has shown up yet. Telegram sets `platform` (e.g.
 * "tdesktop", "ios", "android", "weba") as soon as the WebApp object exists;
 * it only stays "unknown" when the script is running outside Telegram (a
 * plain browser). Telegram Desktop is the client most often seen shipping
 * `platform` without `initData` ever following, so this is the signal we use
 * to tell "Telegram, but initData is broken" apart from "not Telegram at all".
 */
export function looksLikeTelegramClient() {
  const p = tg?.platform;
  return !!p && p !== "unknown";
}

/**
 * Waits briefly for `initData` to show up before giving up. On a cold Mini
 * App launch (fresh WebView, first open after tapping the web_app button),
 * Telegram's client can finish loading our script before it has actually
 * populated `initData` — reading it on the very first tick sometimes catches
 * it empty, which used to fail the login outright ("Kirishda xatolik") even
 * though the exact same launch would succeed a moment later. Polling fixes
 * that without meaningfully slowing down a normal open (where initData is
 * already there on the first check). Telegram Desktop is given a longer
 * budget — it's been observed populating initData noticeably slower than
 * mobile clients, when it populates it at all.
 */
export function waitForInitData(intervalMs = 100) {
  const timeoutMs = looksLikeTelegramClient() ? 3000 : 1200;
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      const data = getInitData();
      if (data || Date.now() >= deadline) return resolve(data);
      setTimeout(check, intervalMs);
    };
    check();
  });
}

/** The unsigned user object Telegram exposes (for instant UI, not trust). */
export function getTelegramUser() {
  return tg?.initDataUnsafe?.user || null;
}

/** Prepare the Mini App chrome: expand, set colors, enable closing confirm. */
export function initTelegram() {
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.("#0e0f12");
    tg.setBackgroundColor?.("#0e0f12");
  } catch {
    /* ignore — older clients */
  }
}

/** Light haptic feedback on key actions (no-op outside Telegram). */
export function haptic(type = "light") {
  try {
    tg?.HapticFeedback?.impactOccurred(type);
  } catch {
    /* ignore */
  }
}
