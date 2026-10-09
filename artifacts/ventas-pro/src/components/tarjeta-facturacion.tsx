/**
 * Facturación: cada negocio conecta SU sistema (09-10-2026).
 *
 * VentasPro no factura: no tiene resolución de la DIAN y no le corresponde.
 * Conectado un sistema, al confirmarse un pago la factura sale sola en él y el
 * cliente recibe el número; sin conectar, sigue recibiendo el recibo de siempre.
 * Ver api-server/src/lib/facturacion.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SecretInput } from "@/components/ui/secret-input";
import { Loader2, CheckCircle2, CircleDashed, Receipt, Unplug } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { describeError } from "@/lib/utils";

type Proveedor = "alegra" | "webhook";

interface Estado {
  conectada: boolean;
  proveedor?: Proveedor;
  activa?: boolean;
  alegra?: { correo: string; token: string; contactoPorDefecto: string; numeracion: string; impuesto: string; electronica: boolean };
  webhook?: { url: string; secreto: string };
}

async function api<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const r = await fetch(`/api${endpoint}`, { ...options, headers: { "Content-Type": "application/json", ...options.headers }, credentials: "include" });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j?.success === false) throw new Error(j?.error || `${r.status} ${r.statusText}`);
  return j as T;
}

export function TarjetaFacturacion() {
  const { toast } = useToast();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [proveedor, setProveedor] = useState<Proveedor>("alegra");
  const [v, setV] = useState<Record<string, string>>({});
  const [electronica, setElectronica] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = () =>
    api<{ facturacion: Estado }>("/facturacion")
      .then((r) => {
        setEstado(r.facturacion);
        if (r.facturacion.proveedor) setProveedor(r.facturacion.proveedor);
        if (r.facturacion.alegra) setElectronica(r.facturacion.alegra.electronica);
      })
      .catch(() => setEstado({ conectada: false }));
  useEffect(() => { void cargar(); }, []);

  const campo = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const guardado = estado?.conectada && estado.proveedor === proveedor;

  const correr = async (accion: string, fn: () => Promise<void>) => {
    setOcupado(accion);
    try { await fn(); } catch (e: any) {
      toast({ title: "Facturación", description: describeError(e, "Intenta de nuevo."), variant: "destructive" });
    } finally { setOcupado(null); }
  };

  const conectar = () => correr("guardar", async () => {
    const cuerpo: any = { proveedor, activa: true };
    if (proveedor === "alegra") {
      cuerpo.alegra = {
        correo: v.correo ?? estado?.alegra?.correo,
        token: v.token,
        contactoPorDefecto: v.contactoPorDefecto ?? estado?.alegra?.contactoPorDefecto,
        numeracion: v.numeracion ?? estado?.alegra?.numeracion,
        impuesto: v.impuesto ?? estado?.alegra?.impuesto,
        electronica,
      };
    } else {
      cuerpo.webhook = { url: v.url ?? estado?.webhook?.url, secreto: v.secreto };
    }
    const r: any = await api("/facturacion", { method: "PUT", body: JSON.stringify(cuerpo) });
    setV({});
    toast({ title: "Facturación conectada ✅", description: r?.prueba || "Probada y activa." });
    await cargar();
  });

  const probar = () => correr("probar", async () => {
    const r: any = await api("/facturacion/probar", { method: "POST" });
    toast({ title: "Prueba correcta ✅", description: r?.prueba });
  });

  const desconectar = () => correr("borrar", async () => {
    await api("/facturacion", { method: "DELETE" });
    toast({ title: "Facturación desconectada", description: "Los clientes vuelven a recibir el recibo de siempre." });
    setV({});
    await cargar();
  });

  return (
    <Card className="md:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-border shadow-sm"><Receipt className="h-6 w-6 text-indigo-600" /></span>
            <div className="min-w-0">
              <CardTitle className="text-lg">Facturación</CardTitle>
              <CardDescription>
                Conecta tu sistema de facturación y, cuando confirmes un pago, la factura sale sola ahí y el cliente recibe el número por WhatsApp.
                Sin conectar, el cliente recibe un recibo (no válido como factura).
              </CardDescription>
            </div>
          </div>
          {estado === null
            ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            : estado.conectada && estado.activa
              ? <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="h-3 w-3" />{estado.proveedor === "alegra" ? "Alegra" : "Webhook"}</Badge>
              : <Badge variant="outline" className="gap-1"><CircleDashed className="h-3 w-3" />{estado.conectada ? "Apagada" : "Sin conectar"}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Sistema de facturación">
          {([["alegra", "Alegra"], ["webhook", "Otro sistema (webhook)"]] as const).map(([k, et]) => (
            <Button key={k} type="button" size="sm" variant={proveedor === k ? "default" : "outline"} aria-pressed={proveedor === k} onClick={() => setProveedor(k)}>{et}</Button>
          ))}
        </div>

        {proveedor === "alegra" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fa-correo">Correo de tu cuenta de Alegra</Label>
              <Input id="fa-correo" type="email" autoComplete="off" placeholder={estado?.alegra?.correo || "tu@negocio.co"} value={v.correo ?? ""} onChange={campo("correo")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fa-token">Token de la API</Label>
              <SecretInput id="fa-token" guardado={!!guardado && !!estado?.alegra?.token} placeholder="Alegra → Configuración → Integraciones → API" value={v.token ?? ""} onChange={(x) => setV((p) => ({ ...p, token: x }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fa-contacto">Id del contacto «Consumidor final»</Label>
              <Input id="fa-contacto" inputMode="numeric" placeholder={estado?.alegra?.contactoPorDefecto || "Ej: 1"} value={v.contactoPorDefecto ?? ""} onChange={campo("contactoPorDefecto")} />
              <p className="text-xs text-muted-foreground">Las ventas sin cédula registrada se facturan a este contacto. Lo ves en la URL al abrirlo en Alegra.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fa-impuesto">Id del impuesto (opcional)</Label>
              <Input id="fa-impuesto" inputMode="numeric" placeholder={estado?.alegra?.impuesto || "Vacío = sin IVA"} value={v.impuesto ?? ""} onChange={campo("impuesto")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fa-numeracion">Id de la numeración (opcional)</Label>
              <Input id="fa-numeracion" inputMode="numeric" placeholder={estado?.alegra?.numeracion || "Vacío = la preferida de tu cuenta"} value={v.numeracion ?? ""} onChange={campo("numeracion")} />
            </div>
            <label className="flex items-start gap-2 self-end text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={electronica} onChange={(e) => setElectronica(e.target.checked)} />
              <span>Emitir como <b>factura electrónica</b> ante la DIAN (tu cuenta de Alegra tiene que tenerla habilitada)</span>
            </label>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="fw-url">URL que recibe cada venta pagada</Label>
              <Input id="fw-url" type="url" autoComplete="off" placeholder={estado?.webhook?.url || "https://…  (Zapier, Make, Siigo, tu ERP)"} value={v.url ?? ""} onChange={campo("url")} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="fw-secreto">Secreto para firmar los envíos</Label>
              <SecretInput id="fw-secreto" guardado={!!guardado && !!estado?.webhook?.secreto} placeholder="Una clave larga que solo conozcan tu sistema y VentasPro" value={v.secreto ?? ""} onChange={(x) => setV((p) => ({ ...p, secreto: x }))} />
              <p className="text-xs text-muted-foreground">
                Se envía un POST con <code>{"{ evento: \"venta.pagada\", datos }"}</code> y la cabecera <code>x-ventaspro-firma: sha256=…</code> (HMAC del cuerpo).
                Si tu sistema responde <code>{"{ \"numero\": \"FE-123\" }"}</code>, ese número es el que recibe el cliente.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={conectar} disabled={!!ocupado}>
            {ocupado === "guardar" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {guardado ? "Guardar y volver a probar" : "Conectar y probar"}
          </Button>
          {estado?.conectada && (
            <>
              <Button variant="outline" onClick={probar} disabled={!!ocupado}>
                {ocupado === "probar" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Probar conexión
              </Button>
              <Button variant="ghost" className="text-destructive" onClick={desconectar} disabled={!!ocupado}>
                <Unplug className="mr-2 h-4 w-4" />Desconectar
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
