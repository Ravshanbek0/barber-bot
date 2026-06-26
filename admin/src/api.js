// Tiny fetch wrapper with JWT storage. No axios — keeps the admin app dep-light.
const BASE = import.meta.env.VITE_API_BASE || "/api/v1";
const KEY = "barber_admin_auth";

export function getAuth() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}

export function setAuth(auth) {
  if (auth) localStorage.setItem(KEY, JSON.stringify(auth));
  else localStorage.removeItem(KEY);
}

export function logout() {
  setAuth(null);
  location.reload();
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const a = getAuth();
    if (a?.access) headers.Authorization = `Bearer ${a.access}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    setAuth(null);
    throw new Error("Sessiya tugadi. Qayta kiring.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Xatolik (${res.status})`);
  return data;
}

export const api = {
  login: (phone, password) =>
    request("/admin/login/", { method: "POST", body: { phone, password }, auth: false }),
  overview: () => request("/admin/overview/"),
  users: (role) => request(`/admin/users/${role ? `?role=${role}` : ""}`),
  masters: () => request("/admin/masters/"),
  bookings: () => request("/admin/bookings/"),
  activity: (kind) => request(`/admin/activity/${kind ? `?kind=${kind}` : ""}`),
};
