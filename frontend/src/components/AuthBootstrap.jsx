import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../store/auth";
import { getInitData, initTelegram, isTelegram } from "../lib/telegram";
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

  useEffect(() => {
    initTelegram();
    if (user) return; // already signed in

    const endpoint = isTelegram()
      ? [`${BASE}/auth/telegram/webapp/`, { init_data: getInitData() }]
      : [`${BASE}/auth/dev-login/`, {}]; // browser dev → regular user

    axios
      .post(...endpoint)
      .then(({ data }) => setSession({ user: data.user, tokens: data.tokens }))
      .catch(() => setStatus("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
