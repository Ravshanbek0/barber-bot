import { useState } from "react";
import { api, setAuth } from "./api";

export default function Login({ onLogin }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const auth = await api.login(phone.trim(), password);
      setAuth(auth);
      onLogin(auth);
    } catch (e) {
      setErr(e.message || "Kirishda xatolik");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <div className="brand-mark">✂</div>
          <div>
            <h2>Barber — Admin</h2>
            <div className="faint" style={{ fontSize: 13 }}>Boshqaruv paneli</div>
          </div>
        </div>

        <div className="field">
          <label>Telefon</label>
          <input className="input" placeholder="+99890…" value={phone}
            onChange={(e) => setPhone(e.target.value)} autoComplete="username" />
        </div>
        <div className="field">
          <label>Parol</label>
          <input className="input" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        {err && <div className="err">{err}</div>}
        <button className="btn" style={{ marginTop: 8 }} disabled={busy}>
          {busy ? "Kirilmoqda…" : "Kirish"}
        </button>
      </form>
    </div>
  );
}
