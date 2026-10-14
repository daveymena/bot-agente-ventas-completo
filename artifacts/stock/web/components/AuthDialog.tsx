import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { toast } from "@/store/ui";
import { Button, Dialog, Field, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

export function AuthDialog() {
  const { authModal, closeAuthModal, setUser, brand } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const demo = useQuery({ queryKey: ["demo-accounts"], queryFn: api.demoAccounts, staleTime: Infinity, enabled: authModal.open });

  useEffect(() => { if (authModal.open) { setMode(authModal.mode); setError(null); } }, [authModal.open, authModal.mode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const u = mode === "login" ? await api.login(email.trim(), password) : await api.register({ email: email.trim(), password, name: name.trim() });
      setUser(u);
      toast({ kind: "success", title: mode === "login" ? `Hola de nuevo, ${u.name.split(" ")[0]}` : `Bienvenido/a, ${u.name.split(" ")[0]}`, description: mode === "register" && u.credits ? `Te regalamos ${u.credits} créditos para empezar.` : undefined });
      const next = authModal.next; closeAuthModal(); setPassword("");
      setTimeout(() => next?.(), 50);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar la operación");
    } finally { setBusy(false); }
  };

  const fill = (em: string, pw: string) => { setMode("login"); setEmail(em); setPassword(pw); };

  return (
    <Dialog open={authModal.open} onOpenChange={(v) => !v && closeAuthModal()} size="sm" hideClose={false}
      title={mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
      description={mode === "login" ? `Accedé a tus licencias, créditos y bibliotecas de ${brand?.name || "la plataforma"}.` : "Gratis. Te regalamos créditos de bienvenida para probar."}>
      <div className="mb-4 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-semibold">
        {(["login", "register"] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={cn("rounded-md py-1.5", mode === m ? "bg-white text-ink shadow" : "text-mute")}>{m === "login" ? "Entrar" : "Registrarme"}</button>)}
      </div>
      <form onSubmit={submit} className="space-y-3">
        {mode === "register" && <Field label="Nombre"><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" autoComplete="name" /></Field>}
        <Field label="Correo"><Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" autoComplete="email" /></Field>
        <Field label="Contraseña" hint={mode === "register" ? "Mínimo 8 caracteres" : undefined}><Input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === "login" ? "current-password" : "new-password"} /></Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <Button type="submit" className="w-full" loading={busy}>{mode === "login" ? "Entrar" : "Crear cuenta"}</Button>
        {mode === "register" && <p className="text-center text-[11px] text-mute">Al registrarte aceptás los términos de uso y la política de privacidad.</p>}
      </form>
      {demo.data && demo.data.length > 0 && (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-3">
          <p className="text-xs font-semibold text-ink">Cuentas de demostración</p>
          <p className="mb-2 text-[11px] text-mute">Tocá una para rellenar el formulario.</p>
          <div className="flex flex-wrap gap-1.5">
            {demo.data.map((d) => <button key={d.email} onClick={() => fill(d.email, d.password)} className="chip text-xs"><span className="font-semibold">{d.role === "admin" ? "Admin" : d.role === "contributor" ? "Colaborador" : "Cliente"}</span><span className="text-mute">{d.email}</span></button>)}
          </div>
        </div>
      )}
    </Dialog>
  );
}
