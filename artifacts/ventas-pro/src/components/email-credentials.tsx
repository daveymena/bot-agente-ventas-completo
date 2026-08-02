import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Mail, CheckCircle2, AlertTriangle, Loader, Eye, EyeOff, ShieldCheck, Lock } from "lucide-react";

interface Estado {
  propias: boolean;
  configurado: boolean;
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

type Prueba = { ok: boolean; detalle: string } | null;

export function EmailCredentials() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [host, setHost] = useState("smtp.gmail.com");
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [verPass, setVerPass] = useState(false);
  const [from, setFrom] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [prueba, setPrueba] = useState<Prueba>(null);
  const [probando, setProbando] = useState(false);

  const cargar = async () => {
    try {
      const res = await fetch("/api/email/credentials", { credentials: "include" });
      if (!res.ok) throw new Error();
      const data: Estado = await res.json();
      setEstado(data);
      setEnabled(data.enabled);
      setHost(data.host);
      setPort(data.port);
      setSecure(data.secure);
      setUser(data.user);
      setFrom(data.from);
    } catch {
      toast.error("No se pudo cargar la configuración SMTP");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const probar = async () => {
    setProbando(true);
    setPrueba(null);
    try {
      const res = await fetch("/api/email/credentials/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port, secure, user, pass }),
      });
      setPrueba(await res.json());
    } catch {
      setPrueba({ ok: false, detalle: "No se pudo hacer la prueba" });
    } finally {
      setProbando(false);
    }
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const res = await fetch("/api/email/credentials", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port, secure, user, ...(pass ? { pass } : {}), from, enabled }),
      });
      if (!res.ok) throw new Error();
      toast.success("Configuración SMTP guardada");
      setPass("");
      await cargar();
    } catch {
      toast.error("No se pudieron guardar");
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <Card className="rounded-3xl border-0 shadow-lg glass-panel md:col-span-2">
        <CardContent className="py-12 flex items-center justify-center text-muted-foreground text-sm gap-2">
          <Loader className="h-4 w-4 animate-spin" /> Cargando configuración de correo…
        </CardContent>
      </Card>
    );
  }

  const Resultado = ({ p }: { p: Prueba }) =>
    !p ? null : (
      <p className={`text-xs flex items-start gap-1.5 ${p.ok ? "text-emerald-600" : "text-red-500"}`}>
        {p.ok ? <CheckCircle2 className="h-3.5 w-3.5 mt-px shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />}
        {p.detalle}
      </p>
    );

  return (
    <Card className="rounded-3xl border-0 shadow-lg glass-panel overflow-hidden relative md:col-span-2">
      <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-green-500 to-teal-500" />
      <CardHeader className="pt-8">
        <CardTitle className="text-xl flex items-center gap-2">
          <div className="p-2 bg-green-500/10 rounded-lg text-green-600"><Mail className="h-5 w-5" /></div>
          Correo — tu SMTP
        </CardTitle>
        <CardDescription>
          Acá van <strong>tus</strong> datos de correo saliente (SMTP): los emails de verificación,
          confirmación de pedidos, reset de contraseña y activación saldrán de TU cuenta.
          Se guardan cifrados y nunca se muestran de nuevo.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-8">
        {!estado?.propias && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-700">Todavía no configuraste tu SMTP</p>
              <p className="text-amber-700/80 mt-0.5">
                Mientras tanto los correos salen de la cuenta del servidor —
                <strong>tus clientes ven "VentasPro" en vez de tu marca</strong>.
                Cargá tu SMTP para que todo salga de tu cuenta.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <h3 className="font-bold">SMTP</h3>
              {estado?.configurado
                ? <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Configurado</Badge>
                : <Badge variant="outline" className="text-muted-foreground">Sin configurar</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Activo</Label>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Host</Label>
              <Input value={host} onChange={e => setHost(e.target.value)}
                placeholder="smtp.gmail.com" className="bg-muted/30" autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Puerto</Label>
              <Input type="number" value={port} onChange={e => setPort(Number(e.target.value))}
                placeholder="587" className="bg-muted/30 font-mono" autoComplete="off" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
              <button onClick={() => setSecure(false)} className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${!secure ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>STARTTLS (587)</button>
              <button onClick={() => setSecure(true)} className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${secure ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>SSL/TLS (465)</button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Usuario (email)</Label>
            <Input value={user} onChange={e => setUser(e.target.value)}
              placeholder="tucorreo@tudominio.com" className="bg-muted/30" autoComplete="email" />
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
              Contraseña {estado?.pass && <span className="normal-case font-normal tracking-normal">· guardada: {estado.pass}</span>}
            </Label>
            <div className="relative">
              <Input
                type={verPass ? "text" : "password"}
                value={pass}
                onChange={e => { setPass(e.target.value); setPrueba(null); }}
                placeholder={estado?.pass ? "Dejalo vacío para no cambiarlo" : "Contraseña de app / SMTP"}
                className="font-mono text-sm bg-muted/30 pr-11"
                autoComplete="off"
              />
              <button type="button" onClick={() => setVerPass(v => !v)}
                aria-label={verPass ? "Ocultar" : "Mostrar"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {verPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Para Gmail: usa <strong>Contraseña de aplicación</strong> (no tu contraseña normal).
              <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noopener" className="underline ml-1">Cómo crear una</a>.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">From (remitente)</Label>
            <Input value={from} onChange={e => setFrom(e.target.value)}
              placeholder="\"Mi Marca\" <ventas@midominio.com>" className="bg-muted/30" autoComplete="off" />
            <p className="text-xs text-muted-foreground">Formato: <code className="bg-muted/50 px-1 rounded">\"Nombre\" <email@dominio.com></code></p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={probar} disabled={probando}>
              {probando ? <><Loader className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Probando…</> : "Probar conexión SMTP"}
            </Button>
            <Resultado p={prueba} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Se guardan cifrados y nunca se muestran de nuevo.
          </p>
          <Button onClick={guardar} disabled={guardando} className="font-bold">
            {guardando ? <><Loader className="h-4 w-4 mr-2 animate-spin" /> Guardando…</> : "Guardar SMTP"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
