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
 * Waits briefly for `initData` to show up before giving up. On a cold Mini
 * App launch (fresh WebView, first open after tapping the web_app button),
 * Telegram's client can finish loading our script before it has actually
 * populated `initData` — reading it on the very first tick sometimes catches
 * it empty, which used to fail the login outright ("Kirishda xatolik") even
 * though the exact same launch would succeed a moment later. Polling for up
 * to ~1.2s fixes that without meaningfully slowing down a normal open (where
 * initData is already there on the first check).
 */
export function waitForInitData(timeoutMs = 1200, intervalMs = 100) {
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
