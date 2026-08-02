import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Mail, CheckCircle2, AlertTriangle, Loader, Eye, EyeOff, ShieldCheck } from "lucide-react";

/**
 * Correo saliente del negocio.
 *
 * Sirve para que la confirmación de compra le llegue al comprador desde la
 * marca que le vendió. Hasta acá salía de "VentasPro", hardcodeado: una marca
 * que el comprador no reconoce, que es media entrega a spam y la otra media
 * leída como estafa.
 */

interface Estado {
  propio: boolean;
  configurado: boolean;
  host: string;
  port: number;
  user: string;
  fromName: string;
  enabled: boolean;
}

export function EmailCredentials() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState<{ ok: boolean; detalle: string } | null>(null);

  const [host, setHost] = useState("smtp.gmail.com");
  const [port, setPort] = useState(587);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [verPass, setVerPass] = useState(false);
  const [fromName, setFromName] = useState("");
  const [enabled, setEnabled] = useState(true);

  const cargar = async () => {
    try {
      const res = await fetch("/api/email-config", { credentials: "include" });
      if (!res.ok) throw new Error();
      const d: Estado = await res.json();
      setEstado(d);
      if (d.host) setHost(d.host);
      if (d.port) setPort(d.port);
      setUser(d.user || "");
      setFromName(d.fromName || "");
      setEnabled(d.enabled);
    } catch {
      toast.error("No se pudo cargar la configuración de correo");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const probar = async () => {
    setProbando(true);
    setPrueba(null);
    try {
      const res = await fetch("/api/email-config/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port, user, ...(pass ? { pass } : {}) }),
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
      const res = await fetch("/api/email-config", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port, user, ...(pass ? { pass } : {}), fromName, enabled }),
      });
      if (!res.ok) throw new Error();
      toast.success("Correo guardado");
      setPass("");
      await cargar();
    } catch {
      toast.error("No se pudo guardar");
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

  return (
    <Card className="rounded-3xl border-0 shadow-lg glass-panel overflow-hidden relative md:col-span-2">
      <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-sky-500 to-indigo-500" />
      <CardHeader className="pt-8">
        <CardTitle className="text-xl flex items-center gap-2">
          <div className="p-2 bg-sky-500/10 rounded-lg text-sky-600"><Mail className="h-5 w-5" /></div>
          Correo del negocio
          {estado?.configurado
            ? <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Configurado</Badge>
            : <Badge variant="outline" className="text-muted-foreground">Sin configurar</Badge>}
        </CardTitle>
        <CardDescription>
          Desde acá salen las confirmaciones de compra a <strong>tus</strong> clientes, con tu marca.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {!estado?.propio && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-700">Tus clientes reciben correos de "VentasPro"</p>
              <p className="text-amber-700/80 mt-0.5">
                Una marca que no reconocen: eso va a spam o se lee como estafa. Configurá tu correo
                para que la confirmación de compra llegue de parte tuya.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Tu correo</Label>
            <Input type="email" value={user} onChange={e => { setUser(e.target.value); setPrueba(null); }}
              placeholder="ventas@tunegocio.com" className="bg-muted/30" autoComplete="off" />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Nombre que verá el cliente</Label>
            <Input value={fromName} onChange={e => setFromName(e.target.value)}
              placeholder="Mi Tienda" className="bg-muted/30" />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
            Contraseña de aplicación {estado?.configurado && <span className="normal-case font-normal tracking-normal">· dejala vacía para no cambiarla</span>}
          </Label>
          <div className="relative">
            <Input type={verPass ? "text" : "password"} value={pass}
              onChange={e => { setPass(e.target.value); setPrueba(null); }}
              placeholder={estado?.configurado ? "••••••••" : "abcd efgh ijkl mnop"}
              className="font-mono text-sm bg-muted/30 pr-11" autoComplete="off" />
            <button type="button" onClick={() => setVerPass(v => !v)}
              aria-label={verPass ? "Ocultar" : "Mostrar"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {verPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {/* El motivo #1 de fallo: la gente pone la contraseña del correo. */}
          <p className="text-xs text-muted-foreground">
            No es la contraseña de tu correo. En Gmail, con verificación en dos pasos activa, andá a
            tu Cuenta de Google → Seguridad → <strong>Contraseñas de aplicaciones</strong> y generá una.
          </p>
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">
            Servidor avanzado (si no usás Gmail)
          </summary>
          <div className="grid gap-3 sm:grid-cols-2 mt-3">
            <div className="space-y-2">
              <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Servidor SMTP</Label>
              <Input value={host} onChange={e => { setHost(e.target.value); setPrueba(null); }}
                placeholder="smtp.gmail.com" className="font-mono text-sm bg-muted/30" />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Puerto</Label>
              <Input type="number" value={port} onChange={e => { setPort(Number(e.target.value)); setPrueba(null); }}
                placeholder="587" className="font-mono text-sm bg-muted/30" />
              <p className="text-[11px] text-muted-foreground">587 es lo habitual; 465 si tu proveedor pide TLS directo.</p>
            </div>
          </div>
        </details>

        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Activo</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={probar} disabled={probando}>
              {probando ? <><Loader className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Probando…</> : "Probar conexión"}
            </Button>
            <Button onClick={guardar} disabled={guardando} className="font-bold">
              {guardando ? <><Loader className="h-4 w-4 mr-2 animate-spin" /> Guardando…</> : "Guardar correo"}
            </Button>
          </div>
        </div>

        {prueba && (
          <p className={`text-xs flex items-start gap-1.5 ${prueba.ok ? "text-emerald-600" : "text-red-500"}`}>
            {prueba.ok ? <CheckCircle2 className="h-3.5 w-3.5 mt-px shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />}
            {prueba.detalle}
          </p>
        )}

        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          La contraseña se guarda cifrada y nunca se muestra de nuevo. Los correos de la plataforma
          (verificación y recuperar contraseña) siguen saliendo del servidor, para que funcionen
          aunque esta configuración falle.
        </p>
      </CardContent>
    </Card>
  );
}
