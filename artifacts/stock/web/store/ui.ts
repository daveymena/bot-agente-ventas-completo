import { create } from "zustand";

export interface Toast { id: number; title: string; description?: string; kind: "success" | "error" | "info" }

interface UiState {
  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
  saveDialog: { open: boolean; assetId: number | null };
  openSave: (assetId: number) => void;
  closeSave: () => void;
  filtersOpen: boolean;
  setFiltersOpen: (v: boolean) => void;
  recentSearches: string[];
  pushRecent: (q: string) => void;
}

let seq = 1;
const LS_KEY = "stock.recent";
const loadRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; } };

export const useUi = create<UiState>((set, get) => ({
  toasts: [],
  toast: (t) => {
    const id = seq++;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => get().dismiss(id), t.kind === "error" ? 6000 : 3500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  saveDialog: { open: false, assetId: null },
  openSave: (assetId) => set({ saveDialog: { open: true, assetId } }),
  closeSave: () => set({ saveDialog: { open: false, assetId: null } }),
  filtersOpen: typeof window !== "undefined" ? window.innerWidth >= 1024 : true,
  setFiltersOpen: (v) => set({ filtersOpen: v }),
  recentSearches: typeof window !== "undefined" ? loadRecent() : [],
  pushRecent: (q) => {
    const v = q.trim(); if (!v) return;
    const next = [v, ...get().recentSearches.filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 8);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    set({ recentSearches: next });
  },
}));

export const toast = (t: Omit<Toast, "id">) => useUi.getState().toast(t);
