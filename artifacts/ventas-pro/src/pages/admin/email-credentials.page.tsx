import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Mail, CheckCircle2, AlertTriangle, Loader, Eye, EyeOff } from "lucide-react";

interface Estado {
  propio: boolean;
  configurado: boolean;
  host: string;
  port: number;
  user: string;
  fromName: string;
  enabled: boolean;
}

type Prueba = { ok: boolean; detalle: string } | null;

export default function EmailCredentialsPage() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState<Prueba>(null);

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
      toast.success("Correo guardado ✓");
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground">Cargando configuración de correo…</p>
        </div>
      </div>
    );
  }

  const Resultado = ({ p }: { p: Prueba }) =>
    !p ? null : (
      <p className={`text-xs flex items-start gap-1.5 ${p.ok ? "text-purple-400" : "text-red-500"}`}>
        {p.ok ? <CheckCircle2 className="h-3.5 w-3.5 mt-px shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />}
        {p.detalle}
      </p>
    );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <Card className="rounded-3xl border-0 shadow-2xl glass-panel overflow-hidden relative">
          <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-purple-500 to-pink-500" />
          <CardHeader className="pt-8">
            <CardTitle className="text-3xl flex items-center gap-3">
              <div className="p-3 bg-purple-500/10 rounded-lg text-purple-500"><Mail className="h-6 w-6" /></div>
              Configuración de Correo
            </CardTitle>
            <CardDescription className="text-base">
              Configura tu SMTP para que los clientes reciban confirmaciones de compra desde tu marca
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-8 pb-8">
            {!estado?.propio && (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-700">⚠️ Usando correo del servidor</p>
                  <p className="text-amber-700/80 text-sm">Los clientes reciben confirmaciones desde "VentasPro". Configura tu SMTP para que vean tu marca.</p>
                </div>
              </div>
            )}

            {/* Estado del Correo */}
            <div className="flex items-center justify-between p-5 rounded-2xl bg-slate-800/50 border border-slate-700/50">
              <div>
                <h3 className="font-bold text-lg">Estado</h3>
                <p className="text-sm text-slate-400 mt-1">
                  {estado?.configurado ? "✓ SMTP configurado" : "Usando SMTP del servidor"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm">Activo</Label>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>
            </div>

            {/* Configuración SMTP */}
            <div className="space-y-4 p-5 rounded-2xl bg-slate-800/50 border border-slate-700/50">
              <h3 className="font-bold text-lg">Servidor SMTP</h3>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider">Host SMTP</Label>
                  <Input value={host} onChange={e => setHost(e.target.value)} placeholder="smtp.gmail.com" className="font-mono text-sm bg-slate-900 border-slate-700 mt-1" />
                  <p className="text-xs text-slate-400 mt-1">ej: smtp.gmail.com, smtp.outlook.com, mail.tu-dominio.com</p>
                </div>
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider">Puerto</Label>
                  <Input type="number" value={port} onChange={e => setPort(Number(e.target.value))} placeholder="587" className="font-mono text-sm bg-slate-900 border-slate-700 mt-1" />
                  <p className="text-xs text-slate-400 mt-1">587 (TLS) o 465 (SSL)</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider">Usuario/Email</Label>
                  <Input value={user} onChange={e => setUser(e.target.value)} placeholder="tu-email@gmail.com" className="font-mono text-sm bg-slate-900 border-slate-700 mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider">Contraseña</Label>
                  <div className="relative mt-1">
                    <Input type={verPass ? "text" : "password"} value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" className="font-mono text-sm bg-slate-900 border-slate-700 pr-10" />
                    <button type="button" onClick={() => setVerPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                      {verPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Para Gmail, usa contraseña de aplicación</p>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider">Nombre de Remitente</Label>
                <Input value={fromName} onChange={e => setFromName(e.target.value)} placeholder="Mi Tienda Online" className="text-sm bg-slate-900 border-slate-700 mt-1" />
                <p className="text-xs text-slate-400 mt-1">Como aparecerá en "De:" en los emails (ej: "Mi Tienda Online")</p>
              </div>
            </div>

            {/* Probar */}
            <div className="flex items-center gap-2 p-5 rounded-2xl bg-slate-800/50 border border-slate-700/50">
              <Button variant="outline" size="sm" onClick={probar} disabled={probando}>
                {probando ? <><Loader className="h-3 w-3 mr-1 animate-spin" /> Probando…</> : "📧 Probar Conexión"}
              </Button>
              <Resultado p={prueba} />
            </div>

            {/* Guardar */}
            <div className="flex items-center gap-3 pt-4 border-t border-slate-700">
              <Button onClick={guardar} disabled={guardando} className="bg-purple-600 hover:bg-purple-700">
                {guardando ? <><Loader className="h-4 w-4 mr-2 animate-spin" /> Guardando…</> : "💾 Guardar Cambios"}
              </Button>
              {estado?.configurado && <Badge className="bg-purple-500/10 text-purple-400">Configurado</Badge>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
