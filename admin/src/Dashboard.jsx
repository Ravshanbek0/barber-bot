import { useEffect, useRef, useState } from "react";
import { api, logout } from "./api";

const KIND_ICON = {
  login: "🚪",
  bot_start: "▶️",
  joined: "✨",
  registered: "📱",
  became_master: "💈",
  published: "📢",
  left_master: "🚪",
  discount_created: "🏷️",
  booking_created: "📅",
  booking_status: "🔄",
  review_created: "⭐",
};

const TABS = [
  { key: "activity", label: "Faoliyat" },
  { key: "users", label: "Foydalanuvchilar" },
  { key: "masters", label: "Ustalar" },
  { key: "bookings", label: "Bronlar" },
];

function timeAgo(iso) {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "hozir";
  if (s < 3600) return `${Math.floor(s / 60)} daq oldin`;
  if (s < 86400) return `${Math.floor(s / 3600)} soat oldin`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} kun oldin`;
  return d.toLocaleDateString("uz-UZ");
}
function dt(iso) {
  return iso ? new Date(iso).toLocaleString("uz-UZ", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }) : "—";
}

export default function Dashboard({ auth }) {
  const [tab, setTab] = useState("activity");
  const [ov, setOv] = useState(null);

  // Poll the overview counters every 10s so the dashboard stays live.
  useEffect(() => {
    let alive = true;
    const load = () => api.overview().then((d) => alive && setOv(d)).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand" style={{ margin: 0 }}>
          <div className="brand-mark">✂</div>
          <div>
            <h2>Barber — Admin</h2>
            <div className="who">{auth.user?.name} · {auth.user?.phone}</div>
          </div>
        </div>
        <button className="btn-ghost" onClick={logout}>Chiqish</button>
      </div>

      {ov && <Stats ov={ov} />}

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === "activity" && <Activity />}
      {tab === "users" && <Users />}
      {tab === "masters" && <Masters />}
      {tab === "bookings" && <Bookings />}
    </div>
  );
}

function Stats({ ov }) {
  const t = ov.today || {};
  return (
    <div className="stats">
      <Stat label="Jami foydalanuvchi" value={ov.users_total}
        sub={`${ov.users_registered} ro'yxatdan o'tgan`} />
      <Stat label="Ustalar" value={ov.masters_total}
        sub={`${ov.masters_published} e'lon qilingan`} />
      <Stat label="Jami bronlar" value={ov.bookings_total}
        sub={`${ov.active_discounts} faol chegirma`} />
      <Stat label="Bugun kirganlar" value={t.logins} accent
        sub={`${t.bot_starts} /start · ${t.new_users} yangi`} />
      <Stat label="Bugun bronlar" value={t.bookings} accent
        sub={`${t.events} hodisa`} />
    </div>
  );
}
function Stat({ label, value, sub, accent }) {
  return (
    <div className={`stat ${accent ? "accent" : ""}`}>
      <div className="label">{label}</div>
      <div className="value">{value ?? 0}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

function useFeed(loader, deps = []) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    loader().then((d) => alive && setRows(d)).catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return [rows, err, setRows];
}

function Activity() {
  const [kind, setKind] = useState("");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const kindRef = useRef(kind);
  kindRef.current = kind;

  useEffect(() => {
    let alive = true;
    const load = () =>
      api.activity(kindRef.current)
        .then((d) => alive && setRows(d.results || []))
        .catch((e) => alive && setErr(e.message));
    load();
    const t = setInterval(load, 8000); // live feed
    return () => { alive = false; clearInterval(t); };
  }, [kind]);

  if (err) return <div className="empty">{err}</div>;
  if (!rows) return <div className="empty">Yuklanmoqda…</div>;

  return (
    <>
      <div className="tabs" style={{ marginBottom: 14 }}>
        <Chip on={kind === ""} onClick={() => setKind("")}>Barchasi</Chip>
        <Chip on={kind === "login"} onClick={() => setKind("login")}>Kirishlar</Chip>
        <Chip on={kind === "bot_start"} onClick={() => setKind("bot_start")}>/start</Chip>
        <Chip on={kind === "booking_created"} onClick={() => setKind("booking_created")}>Bronlar</Chip>
        <Chip on={kind === "became_master"} onClick={() => setKind("became_master")}>Ustalar</Chip>
      </div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        <span className="live-dot" />Jonli — har 8 soniyada yangilanadi
      </div>
      {rows.length === 0 ? (
        <div className="empty">Hodisalar yo'q.</div>
      ) : (
        <div className="feed">
          {rows.map((e) => (
            <div className="event" key={e.id}>
              <div className="dot">{KIND_ICON[e.kind] || "•"}</div>
              <div className="grow">
                <div className="line1">
                  <b>{e.actor_label}</b>{" "}
                  <span className={`pill ${e.kind}`}>{e.kind_label}</span>
                </div>
                {e.description && <div className="line2">{e.description}</div>}
              </div>
              <div className="when">{timeAgo(e.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
function Chip({ on, onClick, children }) {
  return <button className={`tab ${on ? "active" : ""}`} onClick={onClick}>{children}</button>;
}

function Users() {
  const [rows, err] = useFeed(() => api.users());
  if (err) return <div className="empty">{err}</div>;
  if (!rows) return <div className="empty">Yuklanmoqda…</div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr>
          <th>Ism</th><th>Rol</th><th>Telegram</th><th>Holat</th>
          <th>Bronlar</th><th>Hodisa</th><th>Oxirgi faollik</th><th>Qo'shilgan</th>
        </tr></thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id}>
              <td>{u.name}<div className="muted" style={{ fontSize: 12 }}>{u.phone}</div></td>
              <td>{u.is_master ? <span className="badge brass">Usta</span> : <span className="badge">Mijoz</span>}</td>
              <td className="muted">{u.telegram_username ? `@${u.telegram_username}` : (u.telegram_id || "—")}</td>
              <td>{u.is_registered ? <span className="badge green">Ro'yxatda</span> : <span className="badge">Mehmon</span>}</td>
              <td>{u.bookings_count}</td>
              <td>{u.events_count}</td>
              <td className="muted">{u.last_seen ? timeAgo(u.last_seen) : "—"}</td>
              <td className="muted">{dt(u.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Masters() {
  const [rows, err] = useFeed(() => api.masters());
  if (err) return <div className="empty">{err}</div>;
  if (!rows) return <div className="empty">Yuklanmoqda…</div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr>
          <th>Usta</th><th>Shahar</th><th>Holat</th><th>Xizmat</th>
          <th>Bronlar</th><th>Reyting</th><th>Qo'shilgan</th>
        </tr></thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <td>{m.display_name}<div className="muted" style={{ fontSize: 12 }}>@{m.handle}</div></td>
              <td className="muted">{m.city || "—"}</td>
              <td>{m.is_active ? <span className="badge green">E'lon qilingan</span> : <span className="badge red">Qoralama</span>}</td>
              <td>{m.services_active}</td>
              <td>{m.bookings_count}</td>
              <td>★ {m.avg_rating.toFixed(1)} <span className="muted">({m.reviews_count})</span></td>
              <td className="muted">{dt(m.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_BADGE = {
  pending: "", confirmed: "brass", in_progress: "brass",
  completed: "green", cancelled: "red", no_show: "red",
};
function Bookings() {
  const [rows, err] = useFeed(() => api.bookings());
  if (err) return <div className="empty">{err}</div>;
  if (!rows) return <div className="empty">Yuklanmoqda…</div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr>
          <th>Mijoz</th><th>Usta</th><th>Xizmat</th><th>Holat</th>
          <th>Narx</th><th>Vaqt</th><th>Yaratilgan</th>
        </tr></thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id}>
              <td>{b.client}{b.is_walk_in && <span className="badge" style={{ marginLeft: 6 }}>navbatsiz</span>}</td>
              <td className="muted">{b.master}</td>
              <td className="muted">{b.services}</td>
              <td><span className={`badge ${STATUS_BADGE[b.status] || ""}`}>{b.status_label}</span></td>
              <td>{b.price != null ? `${b.price.toLocaleString("uz-UZ")} so'm` : "—"}</td>
              <td className="muted">{dt(b.start_at)}</td>
              <td className="muted">{dt(b.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
