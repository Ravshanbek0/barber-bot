import { create } from "zustand";

const STORAGE_KEY = "barber_auth";

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

const initial = load();

export const useAuth = create((set, get) => ({
  user: initial.user || null,
  tokens: initial.tokens || null,

  isAuthed: () => !!get().tokens?.access,
  isMaster: () => !!get().user?.is_master,

  setSession: ({ user, tokens }) => {
    set({ user, tokens });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, tokens }));
  },
  setTokens: (tokens) => {
    set({ tokens });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ user: get().user, tokens })
    );
  },
  setUser: (user) => {
    set({ user });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ user, tokens: get().tokens })
    );
  },
  patchUser: (partial) => {
    const user = { ...(get().user || {}), ...partial };
    set({ user });
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ user, tokens: get().tokens })
    );
  },
  logout: () => {
    set({ user: null, tokens: null });
    localStorage.removeItem(STORAGE_KEY);
  },
}));
