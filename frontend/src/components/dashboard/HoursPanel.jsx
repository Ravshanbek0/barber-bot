import { useEffect, useState } from "react";
import { api } from "../../api/client";

const DAYS = ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];

const rowsFromProfile = (profile) => {
  const existing = {};
  (profile.working_hours || []).forEach((h) => (existing[h.weekday] = h));
  return DAYS.map((_, wd) => ({
    id: existing[wd]?.id || null,
    weekday: wd,
    start_time: existing[wd]?.start_time?.slice(0, 5) || "09:00",
    end_time: existing[wd]?.end_time?.slice(0, 5) || "20:00",
    is_day_off: existing[wd]?.is_day_off ?? wd === 6,
  }));
};

export default function HoursPanel({ profile, onChange }) {
  const [rows, setRows] = useState(() => rowsFromProfile(profile));
  // Snapshot of the last saved state, to detect unsaved edits.
  const [baseline, setBaseline] = useState(() => JSON.stringify(rowsFromProfile(profile)));
  const [saving, setSaving] = useState(false);

  // Re-sync from the server after a reload so newly created rows get their
  // ids (and the latest saved values) instead of staying stale.
  const hoursKey = JSON.stringify(profile.working_hours || []);
  useEffect(() => {
    const fresh = rowsFromProfile(profile);
    setRows(fresh);
    setBaseline(JSON.stringify(fresh));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoursKey]);

  const dirty = JSON.stringify(rows) !== baseline;

  const update = (wd, patch) =>
    setRows((r) => r.map((row) => (row.weekday === wd ? { ...row, ...patch } : row)));

  const save = async () => {
    setSaving(true);
    for (const row of rows) {
      const payload = {
        master: profile.id,
        weekday: row.weekday,
        start_time: row.start_time,
        end_time: row.end_time,
        is_day_off: row.is_day_off,
      };
      if (row.id) await api.patch(`/working-hours/${row.id}/`, payload);
      else await api.post("/working-hours/", payload);
    }
    setSaving(false);
    onChange?.();
  };

  return (
    <div className="card md-pad">
      <h3>Ish vaqtlari</h3>
      <div className="stack gap-2 mt-4">
        {rows.map((row) => (
          <div key={row.weekday} className="row gap-3 wrap" style={{ padding: "8px 0", borderBottom: "1px solid var(--color-border)" }}>
            <span style={{ width: 110, fontWeight: 600 }}>{DAYS[row.weekday]}</span>
            <label className="row gap-2" style={{ fontSize: "var(--fs-sm)" }}>
              <input type="checkbox" checked={row.is_day_off} onChange={(e) => update(row.weekday, { is_day_off: e.target.checked })} />
              Dam olish
            </label>
            {!row.is_day_off && (
              <div className="row gap-2">
                <input type="time" className="input" style={{ width: 130 }} value={row.start_time} onChange={(e) => update(row.weekday, { start_time: e.target.value })} />
                <span className="muted">—</span>
                <input type="time" className="input" style={{ width: 130 }} value={row.end_time} onChange={(e) => update(row.weekday, { end_time: e.target.value })} />
              </div>
            )}
          </div>
        ))}
      </div>
      {(dirty || saving) && (
        <button className="btn btn-primary mt-4" disabled={saving} onClick={save}>
          {saving ? "Saqlanmoqda…" : "Saqlash"}
        </button>
      )}
    </div>
  );
}
