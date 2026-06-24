import { create } from "zustand";

/** Tracks unread chat messages for the bottom-nav badge. */
export const useNotifs = create((set, get) => ({
  unread: 0,
  setUnread: (n) => set({ unread: n }),
  bump: () => set({ unread: get().unread + 1 }),
  clear: () => set({ unread: 0 }),
}));
