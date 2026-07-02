import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../store/auth";
import { initTelegram, waitForInitData } from "../lib/telegram";
import "./AuthBootstrap.css";

const BASE = import.meta.env.VITE_API_BASE || "/api/v1";

/**
 * Signs the user in silently before the app renders — no login screen, no
 * "enter as client/master" choice. Everyone starts as a regular user and can
 * later become a master via "Usta bo'lish".
 *
 * - Inside Telegram: exchanges signed `initData` for a JWT session.
 * - In a normal browser (local dev): auto-creates a demo user session so the
 *   app is usable without Telegram.
 */
export default function AuthBootstrap({ children }) {
  const { user, setSession } = useAuth();
  const [status, setStatus] = useState("loading"); // loading | error
  const [errorDetail, setErrorDetail] = useState("");

  useEffect(() => {
    initTelegram();
  }, []);

  // Always re-verifies identity against the CURRENT launch's Telegram
  // initData, even if a session is already cached in localStorage. This is
  // required because several Telegram accounts on the same device/client
  // (e.g. Telegram Desktop's multi-account switcher) can end up sharing the
  // same WebView storage — without this check, whichever account logged in
  // first would leak its session (bookings, master profile, etc.) into
  // every other account that opens the same Mini App. If the verified user
  // differs from the cached one, the cached session is replaced.
  //
  // This effect also re-runs whenever `user` goes back to null — e.g. when
  // an invalid token (the account's row no longer exists on the backend)
  // gets logged out mid-session — so the app re-signs in instead of getting
  // stuck on the spinner forever.
  useEffect(() => {
    let cancelled = false;
    // Waits briefly for Telegram to actually populate initData (see
    // waitForInitData) instead of checking once and treating a not-yet-ready
    // WebView as "not Telegram at all" — that race is what caused a cold
    // first open to fail while a reopen moments later worked fine.
    waitForInitData().then((initData) => {
      if (cancelled) return;
      const endpoint = initData
        ? [`${BASE}/auth/telegram/webapp/`, { init_data: initData }]
        : [`${BASE}/auth/dev-login/`, {}]; // browser dev → regular user

      axios
        .post(...endpoint)
        .then(({ data }) => {
          const current = useAuth.getState().user;
          if (!current || current.id !== data.user.id) {
            setSession({ user: data.user, tokens: data.tokens });
          }
        })
        .catch((err) => {
          if (useAuth.getState().user) return;
          // Surface the real reason instead of a generic message — this is
          // the only diagnostic we get out of a Telegram WebView, where
          // there's no console to check.
          const status_ = err.response?.status;
          const detail = err.response?.data?.detail;
          const reason = status_
            ? `${status_}${detail ? `: ${detail}` : ""}`
            : (err.message || "noma'lum tarmoq xatosi");
          setErrorDetail(`${reason} · initData: ${initData ? "bor" : "yo'q"}`);
          setStatus("error");
        });
    });
    return () => { cancelled = true; };
  }, [user]);

  if (user) return children;

  return (
    <div className="boot">
      <div className="boot-card">
        <div className="boot-mark">✂</div>
        <h1 className="boot-title">Barber</h1>
        {status === "error" ? (
          <>
            <p className="muted mt-2">
              Kirishda xatolik. Ilovani Telegram orqali oching.
            </p>
            {errorDetail && (
              <p className="faint mt-1" style={{ fontSize: "var(--fs-xs)", wordBreak: "break-word" }}>
                {errorDetail}
              </p>
            )}
            <button className="btn btn-ghost mt-4" onClick={() => window.location.reload()}>
              Qayta urinish
            </button>
          </>
        ) : (
          <div className="boot-spinner mt-5" aria-label="Yuklanmoqda" />
        )}
      </div>
    </div>
  );
}
