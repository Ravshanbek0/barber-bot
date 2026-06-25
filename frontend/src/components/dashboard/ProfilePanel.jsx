import { useState } from "react";
import { api } from "../../api/client";
import { getPosition, reverseGeocode, openLocationSettings } from "../../lib/geo";
import ShareCard from "./ShareCard.jsx";

const money = (n) => new Intl.NumberFormat("uz-UZ").format(n);

export default function ProfilePanel({ profile, onChange }) {
  const [form, setForm] = useState({
    display_name: profile.display_name || "",
    bio: profile.bio || "",
    address: profile.address || "", // "mo'ljal" (landmark) — the only manual location text
    instagram: profile.instagram || "",
    accepts_walkins: profile.accepts_walkins ?? true,
  });
  const [service, setService] = useState({ name: "", price: "", duration_min: "30" });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState("");
  const [locDenied, setLocDenied] = useState(false);
  const hasLocation = profile.latitude != null && profile.longitude != null;
  const canSave = form.display_name.trim().length > 0;

  const saveProfile = async () => {
    if (!canSave) return;
    setSaveMsg(""); setSaving(true);
    try {
      await api.patch(`/masters/${profile.handle}/`, form);
      setSaveMsg("✅ Saqlandi");
      onChange?.();
    } catch {
      setSaveMsg("❌ Saqlanmadi. Internetni tekshirib qayta urinib ko'ring.");
    } finally {
      setSaving(false);
    }
  };

  const detectLocation = async () => {
    setLocMsg(""); setLocDenied(false); setLocating(true);
    try {
      const { lat, lng } = await getPosition();
      const city = await reverseGeocode(lat, lng);
      await api.patch(`/masters/${profile.handle}/`, {
        latitude: lat, longitude: lng, city,
      });
      setLocMsg(`✅ Aniqlandi: ${city || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}`);
      onChange?.();
    } catch (e) {
      if (e?.canOpenSettings || e?.message === "denied" || e?.code === 1) {
        setLocDenied(!!e?.canOpenSettings);
        setLocMsg("❌ Joylashuvga ruxsat berilmadi. Ruxsat bering va qayta urinib ko'ring.");
      } else if (e?.code === 3) {
        setLocMsg("❌ Vaqt tugadi. Qayta urinib ko'ring.");
      } else {
        setLocMsg("❌ Joylashuv aniqlanmadi. Qurilmada GPS yoqilganini tekshiring.");
      }
    } finally {
      setLocating(false);
    }
  };

  const addService = async () => {
    if (!service.name || !service.price) return;
    // A real visit length is required — fall back to 30 min if left blank/zero
    // so slot generation never sees a zero-length service.
    const duration_min = Number(service.duration_min) >= 5 ? Number(service.duration_min) : 30;
    await api.post("/services/", { ...service, duration_min, master: profile.id });
    setService({ name: "", price: "", duration_min: "30" });
    onChange?.();
  };

  const removeService = async (id) => {
    await api.delete(`/services/${id}/`);
    onChange?.();
  };

  return (
    <div className="stack gap-4">
      <ShareCard handle={profile.handle} displayName={profile.display_name} />

      {/* Profile fields */}
      <div className="card card-pad">
        <h3>Profil</h3>
        <div className="field mt-3"><label>Ism</label><input className="input" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></div>
        <div className="field"><label>Bio</label><textarea className="textarea" rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>

        <div className="field">
          <label>Joylashuv (geolokatsiya)</label>
          <button className="btn btn-ghost btn-block" disabled={locating} onClick={detectLocation}>
            {locating ? "Aniqlanmoqda…" : hasLocation ? "📍 Joylashuvni yangilash" : "📍 Joriy joylashuvni aniqlash"}
          </button>
          {hasLocation && !locMsg && (
            <p className="faint mt-2" style={{ fontSize: "var(--fs-xs)" }}>
              Belgilangan: {profile.city || `${profile.latitude.toFixed(4)}, ${profile.longitude.toFixed(4)}`}
            </p>
          )}
          {locMsg && <p className="mt-2" style={{ fontSize: "var(--fs-sm)" }}>{locMsg}</p>}
          {locDenied && (
            <button className="btn btn-ghost btn-block btn-sm mt-2" onClick={openLocationSettings}>
              Telegram sozlamalarida ruxsat berish
            </button>
          )}
        </div>

        <div className="field"><label>Mo'ljal (qo'lda)</label><input className="input" value={form.address} placeholder="Masalan: Metro yonida, 2-qavat" onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div className="field"><label>Instagram</label><input className="input" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="username" /></div>
        <label className="row gap-2" style={{ fontSize: "var(--fs-sm)" }}>
          <input type="checkbox" checked={form.accepts_walkins} onChange={(e) => setForm({ ...form, accepts_walkins: e.target.checked })} />
          Navbatsiz mijozlarni qabul qilaman
        </label>
        <button className="btn btn-primary btn-block mt-4" disabled={saving || !canSave} onClick={saveProfile}>{saving ? "Saqlanmoqda…" : "Saqlash"}</button>
        {!canSave && <p className="faint mt-2" style={{ fontSize: "var(--fs-xs)" }}>Ism majburiy maydon.</p>}
        {saveMsg && <p className="mt-2" style={{ fontSize: "var(--fs-sm)" }}>{saveMsg}</p>}
      </div>

      {/* Services */}
      <div className="card card-pad">
        <h3>Xizmatlar</h3>
        <div className="stack gap-2 mt-3">
          {(profile.services || []).map((s) => (
            <div key={s.id} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
              <span>{s.name} · <span className="price">{money(s.price)} so'm</span> · {s.duration_min} daq</span>
              <button className="btn btn-ghost btn-sm" onClick={() => removeService(s.id)}>O'chirish</button>
            </div>
          ))}
        </div>
        <div className="stack gap-2 mt-3">
          <input className="input" placeholder="Xizmat nomi" value={service.name} onChange={(e) => setService({ ...service, name: e.target.value })} />
          <div className="row gap-2">
            <input className="input grow" type="number" placeholder="Narx (so'm)" value={service.price} onChange={(e) => setService({ ...service, price: e.target.value })} />
            <input className="input" style={{ width: 120 }} type="text" inputMode="numeric" placeholder="Daqiqa" value={service.duration_min} onChange={(e) => setService({ ...service, duration_min: e.target.value.replace(/\D/g, "") })} />
          </div>
          <button className="btn btn-ghost btn-block" onClick={addService}>Xizmat qo'shish</button>
        </div>
      </div>
    </div>
  );
}
