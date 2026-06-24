import { useState } from "react";
import { api } from "../../api/client";

export default function DiscountPanel({ profile, onChange }) {
  const [form, setForm] = useState({ title: "", percent: 10, description: "" });
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!form.title) return;
    setSaving(true);
    await api.post("/discounts/", { ...form, master: profile.id });
    setForm({ title: "", percent: 10, description: "" });
    setSaving(false);
    onChange?.();
  };

  const remove = async (id) => {
    await api.delete(`/discounts/${id}/`);
    onChange?.();
  };

  return (
    <div className="dash-grid" style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr" }}>
      <div className="card md-pad">
        <h3>Yangi chegirma e'lon qilish</h3>
        <div className="field mt-4">
          <label>Sarlavha</label>
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Masalan: Hafta oxiri aksiyasi" />
        </div>
        <div className="field">
          <label>Foiz (%)</label>
          <input className="input" type="number" min={1} max={90} value={form.percent} onChange={(e) => setForm({ ...form, percent: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label>Tavsif</label>
          <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <button className="btn btn-accent" disabled={saving} onClick={add}>E'lon qilish</button>
      </div>

      <div className="card md-pad">
        <h3>Faol chegirmalar</h3>
        {profile.discounts?.length ? (
          <div className="stack gap-2 mt-4">
            {profile.discounts.map((d) => (
              <div key={d.id} className="row between" style={{ padding: "10px 0", borderBottom: "1px solid var(--color-border)" }}>
                <div><strong>−{d.percent}%</strong> {d.title}</div>
                <button className="btn btn-ghost btn-sm" onClick={() => remove(d.id)}>O'chirish</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted mt-2">Faol chegirmalar yo'q.</p>
        )}
      </div>
    </div>
  );
}
