import { useRef, useState } from "react";
import { api } from "../../api/client";
import { getPosition, reverseGeocode } from "../../lib/geo";

const money = (n) => new Intl.NumberFormat("uz-UZ").format(n);

export default function ProfilePanel({ profile, onChange }) {
  const [form, setForm] = useState({
    display_name: profile.display_name || "",
    bio: profile.bio || "",
    address: profile.address || "", // "mo'ljal" (landmark) — the only manual location text
    instagram: profile.instagram || "",
    accepts_walkins: profile.accepts_walkins ?? true,
  });
  const [service, setService] = useState({ name: "", price: "", duration_min: 30 });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState("");
  const hasLocation = profile.latitude != null && profile.longitude != null;
  const coverRef = useRef(null);
  const portfolioRef = useRef(null);

  const saveProfile = async () => {
    setSaving(true);
    await api.patch(`/masters/${profile.handle}/`, form);
    setSaving(false);
    onChange?.();
  };

  const detectLocation = async () => {
    setLocMsg(""); setLocating(true);
    try {
      const { lat, lng } = await getPosition();
      const city = await reverseGeocode(lat, lng);
      await api.patch(`/masters/${profile.handle}/`, {
        latitude: lat, longitude: lng, city,
      });
      setLocMsg(`✅ Aniqlandi: ${city || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}`);
      onChange?.();
    } catch {
      setLocMsg("❌ Joylashuvga ruxsat berilmadi.");
    } finally {
      setLocating(false);
    }
  };

  const uploadCover = async (file) => {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("cover", file);
    try {
      await api.patch(`/masters/${profile.handle}/`, fd);
      onChange?.();
    } finally {
      setUploading(false);
    }
  };

  const addPortfolio = async (file) => {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("image", file);
    fd.append("master", profile.id);
    try {
      await api.post("/portfolio/", fd);
      onChange?.();
    } finally {
      setUploading(false);
    }
  };

  const removePortfolio = async (id) => {
    await api.delete(`/portfolio/${id}/`);
    onChange?.();
  };

  const addService = async () => {
    if (!service.name || !service.price) return;
    // A real visit length is required — fall back to 30 min if left blank/zero
    // so slot generation never sees a zero-length service.
    const duration_min = Number(service.duration_min) >= 5 ? Number(service.duration_min) : 30;
    await api.post("/services/", { ...service, duration_min, master: profile.id });
    setService({ name: "", price: "", duration_min: 30 });
    onChange?.();
  };

  const removeService = async (id) => {
    await api.delete(`/services/${id}/`);
    onChange?.();
  };

  return (
    <div className="stack gap-4">
      {/* Cover */}
      <div className="card card-pad">
        <h3>Muqova rasmi</h3>
        <div
          className="cover-preview mt-3"
          style={profile.cover ? { backgroundImage: `url(${profile.cover})` } : {}}
          onClick={() => coverRef.current?.click()}
        >
          {!profile.cover && <span className="faint">+ Muqova yuklash</span>}
        </div>
        <input
          ref={coverRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => uploadCover(e.target.files?.[0])}
        />
        <button className="btn btn-ghost btn-sm mt-3" disabled={uploading} onClick={() => coverRef.current?.click()}>
          {uploading ? "Yuklanmoqda…" : "Rasm tanlash"}
        </button>
      </div>

      {/* Portfolio — Instagram-style grid */}
      <div className="card card-pad">
        <h3>Ishlar (portfolio)</h3>
        <div className="portfolio-edit mt-3">
          {(profile.portfolio || []).map((p) => (
            <div key={p.id} className="pf-item">
              <img src={p.image} alt={p.caption} />
              <button className="pf-del" onClick={() => removePortfolio(p.id)} aria-label="O'chirish">×</button>
            </div>
          ))}
          <button className="pf-add" disabled={uploading} onClick={() => portfolioRef.current?.click()}>+</button>
        </div>
        <input
          ref={portfolioRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => addPortfolio(e.target.files?.[0])}
        />
      </div>

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
        </div>

        <div className="field"><label>Mo'ljal (qo'lda)</label><input className="input" value={form.address} placeholder="Masalan: Metro yonida, 2-qavat" onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div className="field"><label>Instagram</label><input className="input" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="username" /></div>
        <label className="row gap-2" style={{ fontSize: "var(--fs-sm)" }}>
          <input type="checkbox" checked={form.accepts_walkins} onChange={(e) => setForm({ ...form, accepts_walkins: e.target.checked })} />
          Navbatsiz mijozlarni qabul qilaman
        </label>
        <button className="btn btn-primary btn-block mt-4" disabled={saving} onClick={saveProfile}>{saving ? "Saqlanmoqda…" : "Saqlash"}</button>
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
            <input className="input" style={{ width: 120 }} type="number" min="5" step="5" placeholder="Daqiqa" value={service.duration_min} onChange={(e) => setService({ ...service, duration_min: Number(e.target.value) })} />
          </div>
          <button className="btn btn-ghost btn-block" onClick={addService}>Xizmat qo'shish</button>
        </div>
      </div>
    </div>
  );
}
