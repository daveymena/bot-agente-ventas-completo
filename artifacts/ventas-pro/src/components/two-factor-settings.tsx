import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Loader } from "lucide-react";
import { toast } from "sonner";
import { describeError } from "@/lib/utils";

export function TwoFactorSettings() {
  const [enabled, setEnabled] = useState(false);
  const [setup, setSetup] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const res = await fetch("/api/auth/2fa/status", { credentials: "include" });
    if (res.ok) setEnabled((await res.json()).enabled);
  };
  useEffect(() => { void load(); }, []);

  const start = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/setup", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("No se pudo iniciar 2FA");
      setSetup(await res.json());
    } catch (e: any) { toast.error(describeError(e, "No se pudo iniciar la verificación en dos pasos")); } finally { setLoading(false); }
  };

  const enable = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/enable", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Código incorrecto");
      setEnabled(true); setSetup(null); setCode(""); setRecoveryCodes(data.recoveryCodes || []);
      toast.success("Doble factor activado");
    } catch (e: any) { toast.error(describeError(e, "Código incorrecto, intentá de nuevo")); } finally { setLoading(false); }
  };

  const disable = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/disable", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      if (!res.ok) throw new Error((await res.json()).error || "Código incorrecto");
      setEnabled(false); setCode(""); toast.success("Doble factor desactivado");
    } catch (e: any) { toast.error(describeError(e, "Código incorrecto, intentá de nuevo")); } finally { setLoading(false); }
  };

  return <Card className="rounded-3xl border-0 shadow-lg glass-panel md:col-span-2">
    <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" /> Seguridad de la cuenta</CardTitle><CardDescription>Protege el inicio de sesión con Google Authenticator, Authy o cualquier aplicación TOTP.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <div className="flex flex-wrap items-center gap-3"><Badge variant={enabled ? "default" : "outline"}>{enabled ? "2FA activo" : "2FA no configurado"}</Badge>{!enabled && !setup && <Button onClick={start} disabled={loading}>{loading ? <Loader className="h-4 w-4 animate-spin" /> : "Configurar 2FA"}</Button>}</div>
      {setup && <div className="grid gap-5 sm:grid-cols-[auto_1fr] items-center"><img src={setup.qrDataUrl} alt="Código QR para configurar doble factor" className="h-48 w-48 rounded-lg border" /><div className="space-y-3"><p className="text-sm">Escanea el QR y confirma con el código de 6 dígitos.</p><p className="font-mono text-xs break-all">Clave manual: {setup.secret}</p><Input inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} placeholder="Código de 6 dígitos" /><Button onClick={enable} disabled={loading || code.length !== 6}>Activar 2FA</Button></div></div>}
      {enabled && !setup && <div className="flex flex-wrap gap-2 items-end"><div><Label>Código actual para desactivar</Label><Input inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" /></div><Button variant="outline" onClick={disable} disabled={loading || code.length !== 6}>Desactivar 2FA</Button></div>}
      {recoveryCodes.length > 0 && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"><p className="font-semibold text-sm">Guarda estos códigos de recuperación. Cada uno sirve una sola vez:</p><p className="mt-2 font-mono text-sm tracking-widest break-words">{recoveryCodes.join(" · ")}</p></div>}
    </CardContent>
  </Card>;
}
