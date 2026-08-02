import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CreditCard, CheckCircle2, AlertTriangle, Loader, Eye, EyeOff } from "lucide-react";

interface Estado {
  propias: boolean;
  mercadopago: { configurado: boolean; enabled: boolean; pista: string };
  paypal: { configurado: boolean; enabled: boolean; clientId: string; mode: "sandbox" | "live"; pista: string };
  transfer: { configurado: boolean; enabled: boolean; accounts: any[] };
}

type Prueba = { ok: boolean; detalle: string } | null;
interface Cuenta { type: string; number: string; name: string }

export default function PaymentCredentialsPage() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [mpToken, setMpToken] = useState("");
  const [verMp, setVerMp] = useState(false);
  const [mpEnabled, setMpEnabled] = useState(true);
  const [pruebaMp, setPruebaMp] = useState<Prueba>(null);
  const [probandoMp, setProbandoMp] = useState(false);

  const [ppId, setPpId] = useState("");
  const [ppSecret, setPpSecret] = useState("");
  const [verPp, setVerPp] = useState(false);
  const [ppMode, setPpMode] = useState<"sandbox" | "live">("live");
  const [ppEnabled, setPpEnabled] = useState(true);
  const [pruebaPp, setPruebaPp] = useState<Prueba>(null);
  const [probandoPp, setProbandoPp] = useState(false);

  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [trEnabled, setTrEnabled] = useState(true);

  const cargar = async () => {
    try {
      const res = await fetch("/api/payments/credentials", { credentials: "include" });
      if (!res.ok) throw new Error();
      const data: Estado = await res.json();
      setEstado(data);
      setMpEnabled(data.mercadopago.enabled);
      setPpId(data.paypal.clientId);
      setPpMode(data.paypal.mode);
      setPpEnabled(data.paypal.enabled);
      setCuentas(data.transfer?.accounts || []);
      setTrEnabled(data.transfer?.enabled ?? true);
    } catch {
      toast.error("No se pudo cargar la configuración de pagos");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const probar = async (provider: "mercadopago" | "paypal") => {
    const setP = provider === "mercadopago" ? setProbandoMp : setProbandoPp;
    const setR = provider === "mercadopago" ? setPruebaMp : setPruebaPp;
    setP(true);
    setR(null);
    try {
      const body: any = { provider };
      if (provider === "mercadopago") {
        if (mpToken) body.accessToken = mpToken;
      } else {
        if (ppId) body.clientId = ppId;
        if (ppSecret) body.clientSecret = ppSecret;
        body.mode = ppMode;
      }
      const res = await fetch("/api/payments/credentials/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setR(await res.json());
    } catch {
      setR({ ok: false, detalle: "No se pudo hacer la prueba" });
    } finally {
      setP(false);
    }
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const res = await fetch("/api/payments/credentials", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mercadopago: { ...(mpToken ? { accessToken: mpToken } : {}), enabled: mpEnabled },
          paypal: { clientId: ppId, ...(ppSecret ? { clientSecret: ppSecret } : {}), mode: ppMode, enabled: ppEnabled },
          transfer: { enabled: trEnabled, accounts: cuentas.filter(c => c.type.trim() && c.number.trim() && c.name.trim()) },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Credenciales guardadas ✓");
      setMpToken("");
      setPpSecret("");
      await cargar();
    } catch {
      toast.error("No se pudieron guardar");
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground">Cargando configuración de pagos…</p>
        </div>
      </div>
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <Card className="rounded-3xl border-0 shadow-2xl glass-panel overflow-hidden relative">
          <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-emerald-500 to-teal-500" />
          <CardHeader className="pt-8">
            <CardTitle className="text-3xl flex items-center gap-3">
              <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-600"><CreditCard className="h-6 w-6" /></div>
              Configuración de Pagos
            </CardTitle>
            <CardDescription className="text-base">
              Conecta tus cuentas de MercadoPago, PayPal y métodos de transferencia
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-8 pb-8">
            {!estado?.propias && (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-700">⚠️ Credenciales no configuradas</p>
                  <p className="text-amber-700/80 text-sm">Los pagos están usando la cuenta del servidor. Configura las tuyas para cobrar directamente.</p>
                </div>
              </div>
            )}

            {/* MercadoPago */}
            <div className="space-y-4 p-5 rounded-2xl bg-slate-800/50 border border-slate-700/50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg">MercadoPago</h3>
                  {estado?.mercadopago.configurado ? (
                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 mt-1">✓ Configurado</Badge>
                  ) : (
                    <Badge variant="outline" className="text-slate-400 mt-1">Sin configurar</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Activo</Label>
                  <Switch checked={mpEnabled} onCheckedChange={setMpEnabled} />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider">Access Token {estado?.mercadopago.pista && <span className="normal-case">· {estado.mercadopago.pista}</span>}</Label>
                  <div className="relative mt-1">
                    <Input type={verMp ? "text" : "password"} value={mpToken} onChange={e => setMpToken(e.target.value)}
                      placeholder="APP_USR-..." className="font-mono text-sm bg-slate-900 border-slate-700 pr-10" />
                    <button type="button" onClick={() => setVerMp(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                      {verMp ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">De Panel MercadoPago → Tus integraciones → Credenciales</p>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => probar("mercadopago")} disabled={probandoMp}>
                    {probandoMp ? <><Loader className="h-3 w-3 mr-1 animate-spin" /> Probando…</> : "Probar"}
                  </Button>
                  <Resultado p={pruebaMp} />
                </div>
              </div>
            </div>

            {/* PayPal */}
            <div className="space-y-4 p-5 rounded-2xl bg-slate-800/50 border border-slate-700/50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg">PayPal</h3>
                  {estado?.paypal.configurado ? (
                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 mt-1">✓ Configurado</Badge>
                  ) : (
                    <Badge variant="outline" className="text-slate-400 mt-1">Sin configurar</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1 rounded-lg border border-slate-700 p-0.5">
                    {(["live", "sandbox"] as const).map(m => (
                      <button key={m} onClick={() => setPpMode(m)} className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${ppMode === m ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>
                        {m === "live" ? "Prod" : "Test"}
                      </button>
                    ))}
                  </div>
                  <Switch checked={ppEnabled} onCheckedChange={setPpEnabled} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider">Client ID</Label>
                  <Input value={ppId} onChange={e => setPpId(e.target.value)} placeholder="AeA1QIZ..." className="font-mono text-sm bg-slate-900 border-slate-700 mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider">Client Secret {estado?.paypal.pista && <span className="normal-case">· {estado.paypal.pista}</span>}</Label>
                  <div className="relative mt-1">
                    <Input type={verPp ? "text" : "password"} value={ppSecret} onChange={e => setPpSecret(e.target.value)} placeholder="EG7..." className="font-mono text-sm bg-slate-900 border-slate-700 pr-10" />
                    <button type="button" onClick={() => setVerPp(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                      {verPp ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => probar("paypal")} disabled={probandoPp}>
                  {probandoPp ? <><Loader className="h-3 w-3 mr-1 animate-spin" /> Probando…</> : "Probar"}
                </Button>
                <Resultado p={pruebaPp} />
              </div>
            </div>

            {/* Guardar */}
            <div className="flex items-center gap-3 pt-4 border-t border-slate-700">
              <Button onClick={guardar} disabled={guardando} className="bg-emerald-600 hover:bg-emerald-700">
                {guardando ? <><Loader className="h-4 w-4 mr-2 animate-spin" /> Guardando…</> : "💾 Guardar Cambios"}
              </Button>
              {estado?.propias && <Badge className="bg-green-500/10 text-green-400">Configurado correctamente</Badge>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
