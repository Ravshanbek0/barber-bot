import { useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../store/auth";
import { tg } from "../lib/telegram";

/**
 * Phone verification sheet with two methods:
 *  - OTP SMS (demo: the code is shown in-app)
 *  - Telegram contact share: modern clients hand the number straight back to the
 *    Mini App (we save it directly); older ones only deliver it to the bot, so we
 *    fall back to polling /me until the bot has stored it.
 *
 * Calls onVerified(user) once the account becomes registered.
 */
export default function PhoneVerify({ title = "Raqamingizni tasdiqlang", onVerified, onClose }) {
  const patchUser = useAuth((s) => s.patchUser);
  const [method, setMethod] = useState(null); // null | "otp" | "tg"
  const [step, setStep] = useState("phone"); // phone | code
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canTelegram = !!(tg && typeof tg.requestContact === "function");

  const finish = (user) => {
    patchUser({ phone: user.phone, is_registered: true });
    onVerified?.(user);
  };

  const requestOtp = async () => {
    setError(""); setLoading(true);
    try {
      const { data } = await api.post("/auth/phone/otp/request/", { phone });
      setDemoCode(data.demo_code || "");
      setStep("code");
    } catch {
      setError("Raqamni to'g'ri kiriting (+998 ...)");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setError(""); setLoading(true);
    try {
      const { data } = await api.post("/auth/phone/otp/verify/", { phone, code });
      finish(data.user);
    } catch {
      setError("Kod noto'g'ri yoki muddati o'tgan.");
    } finally {
      setLoading(false);
    }
  };

  const shareViaTelegram = () => {
    setError("");
    try {
      tg.requestContact((ok, ev) => {
        if (!ok) { setError("Bekor qilindi."); return; }
        // Modern clients return the shared contact straight to the Mini App, so
        // we can save it without the bot. Older clients omit it -> poll /me while
        // the bot stores the contact it received as a message.
        const phone = ev?.responseUnsafe?.contact?.phone_number;
        if (phone) savePhone(phone);
        else pollMe();
      });
    } catch {
      setError("Telegram orqali ulashish bu qurilmada ishlamadi. SMS kodni tanlang.");
      setMethod("otp");
    }
  };

  const savePhone = async (raw) => {
    setError(""); setLoading(true);
    const phone = raw.startsWith("+") ? raw : `+${raw}`;
    try {
      const { data } = await api.post("/auth/phone/", { phone });
      finish(data.user);
      setLoading(false);
    } catch {
      // Direct save failed — fall back to the bot + poll path.
      await pollMe();
    }
  };

  const pollMe = async () => {
    setLoading(true);
    for (let i = 0; i < 12; i++) {
      try {
        const { data } = await api.get("/auth/me/");
        if (data.is_registered) {
          finish(data);
          setLoading(false);
          return;
        }
      } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 1500));
    }
    setLoading(false);
    setError("Raqam hali kelmadi. Qayta urinib ko'ring yoki SMS kodni tanlang.");
  };

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <h3>{title}</h3>

        {!method && (
          <>
            <p className="muted mt-2" style={{ fontSize: "var(--fs-sm)" }}>
              Bron va eslatmalar uchun bir martalik. Usulni tanlang:
            </p>
            <div className="stack gap-3 mt-4">
              {canTelegram && (
                <button className="btn btn-primary btn-lg btn-block" onClick={() => { setMethod("tg"); shareViaTelegram(); }}>
                  Telegram orqali raqamni ulashish
                </button>
              )}
              <button
                className={`btn btn-lg btn-block ${canTelegram ? "btn-ghost" : "btn-primary"}`}
                onClick={() => setMethod("otp")}
              >
                SMS kod orqali
              </button>
            </div>
          </>
        )}

        {method === "tg" && (
          <div className="center mt-5">
            {loading ? (
              <>
                <div className="boot-spinner" />
                <p className="muted mt-4">Telegramdan raqam kutilmoqda…</p>
              </>
            ) : (
              <button className="btn btn-primary btn-lg btn-block" onClick={shareViaTelegram}>
                Raqamni ulashish
              </button>
            )}
            {error && <p className="mt-3" style={{ color: "var(--danger)", fontSize: "var(--fs-sm)" }}>{error}</p>}
            <button className="btn btn-ghost btn-block mt-3" onClick={() => { setMethod(null); setError(""); }}>
              Orqaga
            </button>
          </div>
        )}

        {method === "otp" && step === "phone" && (
          <div className="mt-4">
            <div className="field">
              <label>Telefon raqam</label>
              <input
                className="input" type="tel" inputMode="tel" autoFocus
                placeholder="+998 90 123 45 67"
                value={phone} onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            {error && <p style={{ color: "var(--danger)", fontSize: "var(--fs-sm)" }}>{error}</p>}
            <button
              className="btn btn-primary btn-block btn-lg mt-2"
              disabled={loading || phone.replace(/\D/g, "").length < 9}
              onClick={requestOtp}
            >
              {loading ? "Yuborilmoqda…" : "Kod olish"}
            </button>
            <button className="btn btn-ghost btn-block mt-2" onClick={() => { setMethod(null); setError(""); }}>
              Orqaga
            </button>
          </div>
        )}

        {method === "otp" && step === "code" && (
          <div className="mt-4">
            {demoCode && (
              <div className="demo-code">Demo kod: <strong>{demoCode}</strong></div>
            )}
            <div className="field mt-3">
              <label>{phone} ga yuborilgan kod</label>
              <input
                className="input" inputMode="numeric" maxLength={6} autoFocus
                placeholder="6 xonali kod"
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            {error && <p style={{ color: "var(--danger)", fontSize: "var(--fs-sm)" }}>{error}</p>}
            <button
              className="btn btn-primary btn-block btn-lg mt-2"
              disabled={loading || code.length < 4}
              onClick={verifyOtp}
            >
              {loading ? "Tekshirilmoqda…" : "Tasdiqlash"}
            </button>
            <button className="btn btn-ghost btn-block mt-2" onClick={() => setStep("phone")}>
              Raqamni o'zgartirish
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
