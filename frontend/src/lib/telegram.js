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
