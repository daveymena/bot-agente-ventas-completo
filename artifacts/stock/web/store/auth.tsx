import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { configureFormat } from "@/lib/format";
import type { BrandInfo, UserDto } from "@shared/types";

interface AuthCtx {
  user: UserDto | null;
  loading: boolean;
  brand: BrandInfo | null;
  setUser: (u: UserDto | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  /** Abre el diálogo de acceso. `next` se ejecuta tras iniciar sesión. */
  requireAuth: (next?: () => void, mode?: "login" | "register") => boolean;
  authModal: { open: boolean; mode: "login" | "register"; next?: () => void };
  closeAuthModal: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const meQ = useQuery({ queryKey: ["me"], queryFn: api.me, staleTime: 60_000, retry: false });
  const brandQ = useQuery({ queryKey: ["meta"], queryFn: api.meta, staleTime: 10 * 60_000 });
  const [authModal, setAuthModal] = useState<AuthCtx["authModal"]>({ open: false, mode: "login" });

  useEffect(() => { if (brandQ.data) configureFormat(brandQ.data.locale, brandQ.data.currency); }, [brandQ.data]);

  const setUser = useCallback((u: UserDto | null) => { qc.setQueryData(["me"], u); }, [qc]);
  const refresh = useCallback(async () => { await qc.invalidateQueries({ queryKey: ["me"] }); }, [qc]);
  const logout = useCallback(async () => { await api.logout(); qc.setQueryData(["me"], null); qc.invalidateQueries(); }, [qc]);
  const requireAuth = useCallback((next?: () => void, mode: "login" | "register" = "login") => {
    if (meQ.data) { next?.(); return true; }
    setAuthModal({ open: true, mode, next });
    return false;
  }, [meQ.data]);
  const closeAuthModal = useCallback(() => setAuthModal((m) => ({ ...m, open: false })), []);

  const value = useMemo<AuthCtx>(() => ({ user: meQ.data ?? null, loading: meQ.isLoading, brand: brandQ.data ?? null, setUser, refresh, logout, requireAuth, authModal, closeAuthModal }), [meQ.data, meQ.isLoading, brandQ.data, setUser, refresh, logout, requireAuth, authModal, closeAuthModal]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth fuera de AuthProvider");
  return v;
}
