import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CreditCard, CheckCircle2, AlertTriangle, Loader, ShieldCheck } from "lucide-react";
import { SecretInput } from "@/components/ui/secret-input";

/**
 * Credenciales de cobro del negocio.
 *
 * Hasta acá no había ninguna pantalla para esto: el checkout usaba las
 * variables de entorno del servidor, así que el dinero de las ventas de
 * cualquier cliente terminaba en la cuenta del dueño de la plataforma. Para
 * un SaaS eso es el centro del modelo, no un detalle.
 *
 * El backend NUNCA devuelve los secretos, solo si están configurados y unos
 * caracteres para reconocerlos. Por eso los campos arrancan vacíos y dejarlos
 * así significa "no lo cambies".
 */

interface Cuenta { type: string; number: string; name: string }

interface Estado {
  propias: boolean;
  mercadopago: { configurado: boolean; enabled: boolean; pista: string };
  paypal: { configurado: boolean; enabled: boolean; clientId: string; mode: "sandbox" | "live"; pista: string };
  transfer: { configurado: boolean; enabled: boolean; accounts: Cuenta[] };
}

type Prueba = { ok: boolean; detalle: string } | null;

export function PaymentCredentials() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [mpToken, setMpToken] = useState("");
  const [mpEnabled, setMpEnabled] = useState(true);
  const [pruebaMp, setPruebaMp] = useState<Prueba>(null);
  const [probandoMp, setProbandoMp] = useState(false);

  const [ppId, setPpId] = useState("");
  const [ppSecret, setPpSecret] = useState("");
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
      toast.error("No se pudo cargar la configuración de cobros");
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
          transfer: {
            enabled: trEnabled,
            // Se descartan las filas a medio llenar: una cuenta sin número o
            // sin titular no sirve para transferir y confunde al comprador.
            accounts: cuentas.filter(c => c.type.trim() && c.number.trim() && c.name.trim()),
          },
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Credenciales guardadas");
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
      <Card className="rounded-3xl border-0 shadow-lg glass-panel md:col-span-2">
        <CardContent className="py-12 flex items-center justify-center text-muted-foreground text-sm gap-2">
          <Loader className="h-4 w-4 animate-spin" /> Cargando configuración de cobros…
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
      <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-emerald-500 to-teal-500" />
      <CardHeader className="pt-8">
        <CardTitle className="text-xl flex items-center gap-2">
          <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-600"><CreditCard className="h-5 w-5" /></div>
          Cobros — tus cuentas
        </CardTitle>
        <CardDescription>
          Acá van <strong>tus</strong> credenciales: el dinero de tus ventas entra directo a tu cuenta.
          Se guardan cifradas y nunca vuelven a mostrarse.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-8">
        {/* El aviso más importante de la pantalla: sin credenciales propias, el
            cobro sale por la cuenta del servidor. Callarlo haría que el dueño
            crea que ya está cobrando él. */}
        {!estado?.propias && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-700">Todavía no cargaste tus cuentas</p>
              <p className="text-amber-700/80 mt-0.5">
                Mientras tanto los cobros salen por la cuenta configurada en el servidor — es decir,
                <strong> el dinero no te llega a vos</strong>. Cargá al menos una para empezar a cobrar.
              </p>
            </div>
          </div>
        )}

        {/* ── MercadoPago ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <h3 className="font-bold">MercadoPago</h3>
              {estado?.mercadopago.configurado
                ? <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Configurado</Badge>
                : <Badge variant="outline" className="text-muted-foreground">Sin configurar</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Activo</Label>
              <Switch checked={mpEnabled} onCheckedChange={setMpEnabled} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
              Access Token {estado?.mercadopago.pista && <span className="normal-case font-normal tracking-normal">· guardado: {estado.mercadopago.pista}</span>}
            </Label>
            <SecretInput
                value={mpToken}
                onChange={v => { setMpToken(v); setPruebaMp(null); }}
                guardado={estado?.mercadopago.pista || estado?.mercadopago.configurado}
                placeholder="APP_USR-..."
                className="text-sm bg-muted/30"
              />
            <p className="text-xs text-muted-foreground">
              Lo sacás de tu panel de MercadoPago → Tus integraciones → Credenciales de producción.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => probar("mercadopago")} disabled={probandoMp}>
                {probandoMp ? <><Loader className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Probando…</> : "Probar conexión"}
              </Button>
              <Resultado p={pruebaMp} />
            </div>
          </div>
        </div>

        {/* ── PayPal ── */}
        <div className="space-y-3 pt-2 border-t border-border/50">
          <div className="flex items-center justify-between gap-3 flex-wrap pt-5">
            <div className="flex items-center gap-2">
              <h3 className="font-bold">PayPal</h3>
              {estado?.paypal.configurado
                ? <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Configurado</Badge>
                : <Badge variant="outline" className="text-muted-foreground">Sin configurar</Badge>}
            </div>
            <div className="flex items-center gap-3">
              {/* El modo importa: unas credenciales de sandbox en modo live
                  fallan con un 401 que no dice por qué. */}
              <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
                {(["live", "sandbox"] as const).map(m => (
                  <button key={m} onClick={() => { setPpMode(m); setPruebaPp(null); }}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${ppMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                    {m === "live" ? "Producción" : "Pruebas"}
                  </button>
                ))}
              </div>
              <Switch checked={ppEnabled} onCheckedChange={setPpEnabled} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">Client ID</Label>
              <Input value={ppId} onChange={e => { setPpId(e.target.value); setPruebaPp(null); }}
                placeholder="AeA1QIZ..." className="font-mono text-sm bg-muted/30" autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                Client Secret {estado?.paypal.pista && <span className="normal-case font-normal tracking-normal">· {estado.paypal.pista}</span>}
              </Label>
              <SecretInput
                value={ppSecret}
                onChange={v => { setPpSecret(v); setPruebaPp(null); }}
                guardado={estado?.paypal.pista || estado?.paypal.configurado}
                placeholder="EG7..."
                className="text-sm bg-muted/30"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => probar("paypal")} disabled={probandoPp}>
              {probandoPp ? <><Loader className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Probando…</> : "Probar conexión"}
            </Button>
            <Resultado p={pruebaPp} />
          </div>
        </div>

        {/* ── Transferencias (Nequi, Daviplata, bancos) ── */}
        <div className="space-y-3 pt-2 border-t border-border/50">
          <div className="flex items-center justify-between gap-3 flex-wrap pt-5">
            <div className="flex items-center gap-2">
              <h3 className="font-bold">Nequi, Daviplata y bancos</h3>
              {estado?.transfer.configurado
                ? <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Configurado</Badge>
                : <Badge variant="outline" className="text-muted-foreground">Sin configurar</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Activo</Label>
              <Switch checked={trEnabled} onCheckedChange={setTrEnabled} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            El bot le da estos datos al cliente para que transfiera. Ojo: la transferencia
            <strong> no se confirma sola</strong> — alguien tiene que verificar que el dinero llegó.
          </p>

          {cuentas.length === 0 && (
            <p className="text-xs text-amber-600 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
              Sin cuentas cargadas, el bot no va a ofrecer transferencia como forma de pago.
            </p>
          )}

          <div className="space-y-2">
            {cuentas.map((c, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_auto] items-center">
                <Input value={c.type} placeholder="Nequi"
                  onChange={e => setCuentas(cs => cs.map((x, k) => k === i ? { ...x, type: e.target.value } : x))}
                  className="bg-muted/30" />
                <Input value={c.number} placeholder="3001234567" inputMode="tel"
                  onChange={e => setCuentas(cs => cs.map((x, k) => k === i ? { ...x, number: e.target.value } : x))}
                  className="font-mono bg-muted/30" />
                <Input value={c.name} placeholder="Titular de la cuenta"
                  onChange={e => setCuentas(cs => cs.map((x, k) => k === i ? { ...x, name: e.target.value } : x))}
                  className="bg-muted/30" />
                <Button variant="ghost" size="sm" aria-label="Quitar cuenta"
                  onClick={() => setCuentas(cs => cs.filter((_, k) => k !== i))}
                  className="text-red-400 hover:text-red-500 hover:bg-red-50">
                  Quitar
                </Button>
              </div>
            ))}
          </div>

          <Button variant="outline" size="sm"
            onClick={() => setCuentas(cs => [...cs, { type: "Nequi", number: "", name: "" }])}>
            Agregar cuenta
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Se guardan cifradas y nunca se muestran de nuevo.
          </p>
          <Button onClick={guardar} disabled={guardando} className="font-bold">
            {guardando ? <><Loader className="h-4 w-4 mr-2 animate-spin" /> Guardando…</> : "Guardar credenciales"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
