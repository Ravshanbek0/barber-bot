import axios from "axios";
import { useAuth } from "../store/auth";

const BASE = import.meta.env.VITE_API_BASE || "/api/v1";

export const api = axios.create({ baseURL: BASE });

// Decode a JWT's `exp` claim (seconds since epoch) without a library —
// we only need one field, not full verification (the backend verifies).
function tokenExpiresAt(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

let refreshing = null;
function refreshAccessToken(refreshToken) {
  refreshing =
    refreshing ||
    axios
      .post(`${BASE}/auth/token/refresh/`, { refresh: refreshToken })
      .finally(() => { refreshing = null; });
  return refreshing;
}

// Proactively renew the access token before it expires, so requests never
// hit a 401 from plain old age (Yandex-style: refresh ahead of time, don't
// wait for a failure). Falls through silently on error — the response
// interceptor below still catches an expired/invalid token as a fallback.
const REFRESH_MARGIN_MS = 60_000;
api.interceptors.request.use(async (config) => {
  const { tokens, setTokens } = useAuth.getState();
  if (tokens?.access) {
    const expiresAt = tokenExpiresAt(tokens.access);
    if (expiresAt && expiresAt - Date.now() < REFRESH_MARGIN_MS && tokens.refresh) {
      try {
        const { data } = await refreshAccessToken(tokens.refresh);
        setTokens({ ...tokens, access: data.access });
        config.headers.Authorization = `Bearer ${data.access}`;
        return config;
      } catch {
        // Refresh token itself is dead (e.g. the account no longer exists) —
        // let the request go out with the stale token; the response
        // interceptor's 401 handler will log out and trigger a fresh login.
      }
    }
    config.headers.Authorization = `Bearer ${useAuth.getState().tokens?.access}`;
  }
  return config;
});

// Fallback: refresh once on an actual 401, then retry.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const { tokens, setTokens, logout } = useAuth.getState();
    if (error.response?.status !== 401) return Promise.reject(error);

    // simplejwt's refresh endpoint only checks the refresh token's own
    // signature/expiry — it does NOT verify the user it points to still
    // exists. So refreshing can "succeed" and still hand back a token for a
    // deleted account, which then 401s again on retry. If we get a 401 on a
    // request we already retried once with a freshly refreshed token, the
    // account itself is gone — no amount of refreshing fixes that, so log
    // out for real and let the app sign in as a new guest.
    if (original._retriedAfterRefresh) {
      logout();
      return Promise.reject(error);
    }

    if (tokens?.refresh && !original._retry) {
      original._retry = true;
      try {
        const { data } = await refreshAccessToken(tokens.refresh);
        setTokens({ ...tokens, access: data.access });
        original.headers.Authorization = `Bearer ${data.access}`;
        original._retriedAfterRefresh = true;
        return api(original);
      } catch (e) {
        logout();
      }
    }
    return Promise.reject(error);
  }
);
