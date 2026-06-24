import axios from "axios";
import { useAuth } from "../store/auth";

const BASE = import.meta.env.VITE_API_BASE || "/api/v1";

export const api = axios.create({ baseURL: BASE });

// Attach access token on each request.
api.interceptors.request.use((config) => {
  const token = useAuth.getState().tokens?.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Refresh access token once on 401, then retry.
let refreshing = null;
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const { tokens, setTokens, logout } = useAuth.getState();
    if (error.response?.status === 401 && tokens?.refresh && !original._retry) {
      original._retry = true;
      try {
        refreshing =
          refreshing ||
          axios.post(`${BASE}/auth/token/refresh/`, { refresh: tokens.refresh });
        const { data } = await refreshing;
        refreshing = null;
        setTokens({ ...tokens, access: data.access });
        original.headers.Authorization = `Bearer ${data.access}`;
        return api(original);
      } catch (e) {
        refreshing = null;
        logout();
      }
    }
    return Promise.reject(error);
  }
);
